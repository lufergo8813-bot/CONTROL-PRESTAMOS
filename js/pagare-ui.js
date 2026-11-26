// Pagaré: generar, firmar en pantalla, enviar enlace de firma por correo, descargar y consultar estado.
import * as S from './store.js';
import { datosPagare, pagareHTML, huella, claveAleatoria } from './legal.js';
import { generarPagarePDF, pdfBase64, nombreArchivo } from './pdf.js';
import { cuerpoCorreo, servicio, enviarCorreo, plantilla } from './email.js';
import { panelFirma } from './firma.js';
import { icon } from './ui.js';
import { esc, q, qa, aj, modal, toast, conBoton, persona, acreedorDe, abonosDe, urlApp, F, render } from './comun.js';

export const pagareDe = p => S.listar('pagares').filter(x => x.refId === p.id).sort((a, b) => String(b.creado).localeCompare(String(a.creado)))[0] || null;
const ESTADO = { sin_firmar: ['Sin firmar', 'gris'], enviado: ['Enviado para firma', 'warn'], firmado: ['Firmado', 'ok'] };
export const chipPagare = r => r ? `<span class="chip ${ESTADO[r.estado][1]}">Pagaré: ${ESTADO[r.estado][0]}</span>` : '<span class="chip gris">Sin pagaré</span>';

export function crearPagare(p) {
  const d = datosPagare({ prestamo: p, persona: persona(p.personaId), acreedor: acreedorDe(p), ajustes: aj(), numero: p.codigo });
  return S.guardar('pagares', { refId: p.id, numero: p.codigo, datos: d, estado: 'sin_firmar' });
}

async function descargar(rec, p) {
  let doc;
  if (rec.estado === 'firmado' && rec.firma?.imagen) doc = await generarPagarePDF(rec.datos, { firma: rec.firma, ajustes: aj() });
  else if (rec.estado === 'firmado') {
    const r = await servicio('pagare_pdf', { id: rec.id }, aj());
    const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + r.pdfBase64; a.download = nombreArchivo('pagare_firmado', p, persona(p.personaId)); a.click();
    return;
  } else doc = await generarPagarePDF(rec.datos, { ajustes: aj() });
  const url = URL.createObjectURL(doc.output('blob'));
  if (!window.open(url, '_blank')) doc.save(nombreArchivo(rec.estado === 'firmado' ? 'pagare_firmado' : 'pagare', p, persona(p.personaId)));
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Ventana principal del pagaré de un préstamo o consignación. */
export function abrirPagare(p, { recienCreado = false } = {}) {
  let rec = pagareDe(p);
  if (!rec) rec = crearPagare(p);
  const per = persona(p.personaId);
  const firmado = rec.estado === 'firmado';
  modal(`<h2>Pagaré ${esc(rec.numero)}</h2>
    <p class="muted" style="margin-top:-6px">${chipPagare(rec)} ${rec.estado === 'enviado' ? `Enviado a ${esc(rec.enviadoA || per.email)} el ${F(String(rec.enviadoEn).slice(0, 10))}.` : ''}${firmado ? ` Firmado por ${esc(rec.firma?.nombre)} (${esc(rec.firma?.metodo)}).` : ''}</p>
    ${recienCreado ? '<div class="info">Préstamo guardado. Elige cómo quieres que el deudor firme el pagaré.</div>' : ''}
    <div class="opciones">
      ${!firmado ? `<button class="opcion" data-op="pantalla"><span class="ic t-lav">${icon('editar')}</span><span><b>Firmar ahora en esta pantalla</b><small>El deudor firma con el dedo en tu celular o computador.</small></span></button>
      <button class="opcion" data-op="enlace"><span class="ic t-cielo">${icon('correo')}</span><span><b>${rec.estado === 'enviado' ? 'Reenviar' : 'Enviar'} enlace de firma por correo</b><small>${per.email ? 'Le llega a ' + esc(per.email) + ' para firmar desde su celular.' : 'Primero agrega el correo de la persona.'}</small></span></button>
      <button class="opcion" data-op="imprimir"><span class="ic t-menta">${icon('pdf')}</span><span><b>Descargar para imprimir y firmar a mano</b><small>Con espacio para firma y huella. Es la opción más sólida para un cobro judicial.</small></span></button>`
      : `<button class="opcion" data-op="descargar"><span class="ic t-menta">${icon('pdf')}</span><span><b>Ver pagaré firmado</b><small>Incluye la constancia de firma electrónica.</small></span></button>
      <button class="opcion" data-op="copia"><span class="ic t-cielo">${icon('correo')}</span><span><b>Enviar copia firmada por correo</b><small>Al deudor${aj().correoInformes ? ' y a ti' : ''}.</small></span></button>
      <button class="opcion" data-op="imprimir"><span class="ic t-lav">${icon('pdf')}</span><span><b>Versión para firma manuscrita</b><small>Recomendado tenerla también firmada a mano con huella.</small></span></button>`}
      <button class="opcion" data-op="ver"><span class="ic t-mant">${icon('lista')}</span><span><b>Leer el pagaré</b><small>Revisa el texto completo.</small></span></button>
    </div>
    ${!firmado ? `<p class="hint">Si cambiaste las condiciones del préstamo después de crear el pagaré, <a href="#" id="regen">genera uno nuevo</a>.</p>` : ''}
    <div class="acciones"><button class="btn ghost" data-cerrar>Cerrar</button></div>`, (box, cerrar) => {
    qa('[data-op]', box).forEach(b => (b.onclick = () => {
      const op = b.dataset.op;
      if (op === 'pantalla') firmarEnPantalla(p, rec);
      if (op === 'enlace') conBoton(b, () => enviarEnlace(p, rec).then(() => { cerrar(); render(); }));
      if (op === 'imprimir') conBoton(b, () => descargar({ ...rec, estado: 'sin_firmar' }, p));
      if (op === 'descargar') conBoton(b, () => descargar(rec, p));
      if (op === 'copia') conBoton(b, () => enviarCopiaFirmada(p, rec));
      if (op === 'ver') modal(`<div class="pagare-caja">${pagareHTML(rec.datos, esc)}</div><div class="acciones"><button class="btn" id="volver">Volver</button></div>`, bx => (q('#volver', bx).onclick = () => abrirPagare(p)), { ancho: true });
    }));
    q('#regen', box)?.addEventListener('click', e => { e.preventDefault(); S.borrar('pagares', rec.id); crearPagare(p); toast('Pagaré actualizado con las condiciones actuales'); abrirPagare(p); });
  });
}

function firmarEnPantalla(p, rec) {
  const d = rec.datos;
  modal(`<h2>Firma del pagaré</h2><p class="muted" style="margin-top:-6px">Entrega el dispositivo al deudor para que lea y firme.</p>
    <div class="pagare-caja" style="max-height:38vh;overflow:auto">${pagareHTML(d, esc)}</div>
    <form id="ffp"><div class="f2"><div><label for="fpNom">Nombre del deudor</label><input id="fpNom" required value="${esc(d.deudor.nombre)}"></div>
    <div><label for="fpDoc">Documento</label><input id="fpDoc" required inputmode="numeric" value="${esc(d.deudor.documento)}"></div></div>
    <label>Firma</label><canvas id="lienzo" class="lienzo-firma" aria-label="Recuadro de firma"></canvas>
    <div class="acciones" style="margin-top:6px"><button type="button" class="btn sm" id="limpiar">Borrar firma</button></div>
    <label class="check"><input type="checkbox" id="acepto"> Leí el pagaré, acepto su contenido y lo firmo de forma libre (Ley 527 de 1999).</label>
    <div class="acciones"><button class="btn pri" id="firmar">${icon('check')}Firmar pagaré</button><button type="button" class="btn ghost" id="cancelar">Cancelar</button></div></form>`, box => {
    const pad = panelFirma(q('#lienzo', box));
    q('#limpiar', box).onclick = () => pad.limpiar();
    q('#cancelar', box).onclick = () => abrirPagare(p);
    q('#ffp', box).onsubmit = ev => {
      ev.preventDefault();
      const nombre = q('#fpNom', box).value.trim(), documento = q('#fpDoc', box).value.trim();
      if (!nombre || !documento) return toast('Escribe nombre y documento del deudor', true);
      if (pad.vacio()) return toast('Falta la firma', true);
      if (!q('#acepto', box).checked) return toast('El deudor debe marcar la aceptación', true);
      conBoton(q('#firmar', box), async () => {
        const firma = { nombre, documento, imagen: pad.imagen(), fecha: new Date().toISOString(), metodo: 'Firma en pantalla, en presencia del acreedor', dispositivo: navigator.userAgent, huella: await huella(d) };
        const r = S.guardar('pagares', { ...rec, estado: 'firmado', firma, firmadoEn: firma.fecha });
        toast('Pagaré firmado');
        const per = persona(p.personaId);
        modal(`<div class="vacio"><h2>Pagaré firmado</h2><p>¿Quieres enviar la copia firmada${per.email ? ' a ' + esc(per.email) : ''}?</p>
          <div class="acciones" style="justify-content:center">${per.email ? `<button class="btn pri" id="env">${icon('correo')}Enviar copia</button>` : ''}<button class="btn" id="ver">${icon('pdf')}Ver PDF</button><button class="btn ghost" data-cerrar>Listo</button></div></div>`, bx => {
          q('#env', bx)?.addEventListener('click', e2 => conBoton(e2.currentTarget, () => enviarCopiaFirmada(p, r)));
          q('#ver', bx).onclick = e2 => conBoton(e2.currentTarget, () => descargar(r, p));
        });
        render();
      });
    };
  }, { ancho: true });
}

async function enviarEnlace(p, rec) {
  const a = aj(), per = persona(p.personaId);
  if (!per.email) throw new Error('Agrega el correo de la persona (Personas > editar).');
  const clave = rec.clave || claveAleatoria();
  const enlace = `${urlApp()}firmar.html?id=${encodeURIComponent(rec.id)}&k=${clave}&s=${encodeURIComponent(a.mailerUrl)}`;
  const doc = await generarPagarePDF(rec.datos, { ajustes: a });
  const c = cuerpoCorreo('pagare', { prestamo: p, persona: per, abonos: abonosDe(p.id), ajustes: a, enlaceFirma: enlace });
  await servicio('pagare_crear', {
    id: rec.id, clave, datos: rec.datos, correoDeudor: per.email, correoAcreedor: a.correoInformes || a.copiaOculta || '', fromName: a.remitenteNombre,
    correo: { to: per.email, bcc: a.copiaOculta, replyTo: a.replyTo, fromName: a.remitenteNombre, subject: c.asunto, html: c.html, text: c.text, pdfBase64: pdfBase64(doc), filename: nombreArchivo('pagare', p, per), ref: p.codigo },
  }, a);
  S.guardar('pagares', { ...rec, clave, estado: 'enviado', enviadoA: per.email, enviadoEn: new Date().toISOString() });
  S.guardar('envios', { prestamoId: p.id, tipo: 'pagare', para: per.email, fecha: new Date().toISOString(), ok: true });
  toast(`Enlace de firma enviado a ${per.email}`);
}

async function enviarCopiaFirmada(p, rec) {
  const a = aj(), per = persona(p.personaId);
  let b64;
  if (rec.firma?.imagen) b64 = pdfBase64(await generarPagarePDF(rec.datos, { firma: rec.firma, ajustes: a }));
  else b64 = (await servicio('pagare_pdf', { id: rec.id }, a)).pdfBase64;
  const html = plantilla({ titulo: 'Pagaré firmado', ref: p.codigo, saludo: `Hola ${(per.nombre || '').split(' ')[0]},`, parrafos: ['Adjuntamos la copia del pagaré firmado, con la constancia de firma electrónica.'], aj: a });
  await enviarCorreo({ to: per.email, cc: a.correoInformes, asunto: `Pagaré ${rec.numero} firmado`, html, text: 'Pagaré firmado adjunto.', pdfBase64: b64, filename: nombreArchivo('pagare_firmado', p, per), ref: p.codigo }, a);
  S.guardar('envios', { prestamoId: p.id, tipo: 'pagare', para: per.email, fecha: new Date().toISOString(), ok: true });
  toast('Copia firmada enviada');
}

/** Consulta si los pagarés enviados por enlace ya fueron firmados. */
export async function verificarPagares() {
  const a = aj();
  const pend = S.listar('pagares').filter(r => r.estado === 'enviado');
  if (!pend.length || !a.mailerUrl || !navigator.onLine) return 0;
  const r = await servicio('pagare_estado', { ids: pend.map(x => x.id) }, a);
  let n = 0;
  for (const rec of pend) {
    const s = r.pagares?.[rec.id];
    if (s?.estado === 'firmado') { S.guardar('pagares', { ...rec, estado: 'firmado', firmadoEn: s.firmadoEn, firma: { ...(s.firma || {}), metodo: 'Enlace enviado al correo del deudor' } }); n++; }
  }
  if (n) toast(`${n} pagaré(s) firmado(s) por enlace`);
  return n;
}
