// Página pública de firma remota del pagaré (se abre desde el enlace enviado al correo del deudor).
import { pagareHTML, huella } from './legal.js';
import { generarPagarePDF, pdfBase64 } from './pdf.js';
import { panelFirma } from './firma.js';

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prm = new URLSearchParams(location.search);
const id = prm.get('id'), clave = prm.get('k'), servicio = prm.get('s');
const toast = (m, err) => { const t = document.getElementById('toast'); t.textContent = m; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; setTimeout(() => (t.hidden = true), 5000); };
const mensaje = (titulo, texto) => { $app.innerHTML = `<div class="panel" style="text-align:center;padding:30px 20px"><h1 class="paso-tit">${esc(titulo)}</h1><p class="muted">${esc(texto)}</p></div>`; };

async function iniciar() {
  if (!id || !clave || !servicio || !/^https:\/\/script\.google(usercontent)?\.com\//.test(servicio)) return mensaje('Enlace incompleto', 'Abra el enlace exactamente como le llegó al correo.');
  let r;
  try { r = await (await fetch(`${servicio}?accion=pagare&id=${encodeURIComponent(id)}&k=${encodeURIComponent(clave)}`)).json(); }
  catch { return mensaje('Sin conexión', 'No fue posible cargar el documento. Revise su conexión a internet e intente de nuevo.'); }
  if (!r.ok) return mensaje('No se puede abrir', r.error || 'Enlace inválido.');
  if (r.estado === 'firmado') return mensaje('Este pagaré ya fue firmado', 'La copia firmada fue enviada a su correo.');
  const d = r.datos;
  $app.innerHTML = `
    <div class="cabecera"><div><h1>Firma de pagaré</h1><p>${esc(d.acreedor.nombre)} le envió este documento para su firma. Léalo completo antes de firmar.</p></div></div>
    <div class="panel pagare-caja">${pagareHTML(d, esc)}</div>
    <form class="panel" id="ff" style="margin-top:14px">
      <h2 style="margin-top:0">Sus datos y firma</h2>
      <div class="f2"><div><label for="fNom">Nombre completo</label><input id="fNom" required value="${esc(d.deudor.nombre)}"></div>
      <div><label for="fDoc">Número de documento</label><input id="fDoc" required inputmode="numeric" value="${esc(d.deudor.documento)}"></div></div>
      <label>Firme dentro del recuadro</label>
      <canvas id="lienzo" class="lienzo-firma" aria-label="Recuadro de firma"></canvas>
      <div class="acciones" style="margin-top:6px"><button type="button" class="btn sm" id="borrar">Borrar firma</button></div>
      <label class="check"><input type="checkbox" id="acepto" required> He leído el pagaré, acepto su contenido y firmo electrónicamente de forma libre, conforme a la Ley 527 de 1999.</label>
      <div class="acciones"><button class="btn pri" id="enviar">Firmar y enviar</button></div>
      <p class="hint">Al firmar se registran la fecha, la hora, su dispositivo y una huella digital (SHA-256) del documento. Recibirá una copia en PDF en su correo.</p>
    </form>`;
  const pad = panelFirma(document.getElementById('lienzo'));
  document.getElementById('borrar').onclick = () => pad.limpiar();
  document.getElementById('ff').onsubmit = async e => {
    e.preventDefault();
    const nombre = document.getElementById('fNom').value.trim(), documento = document.getElementById('fDoc').value.trim();
    if (!nombre || !documento) return toast('Escriba su nombre y documento', true);
    if (pad.vacio()) return toast('Firme dentro del recuadro', true);
    if (!document.getElementById('acepto').checked) return toast('Debe aceptar el contenido para firmar', true);
    const btn = document.getElementById('enviar'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const firma = { nombre, documento, imagen: pad.imagen(), fecha: new Date().toISOString(), aceptoEn: new Date().toISOString(), metodo: 'Enlace enviado al correo del deudor', correo: d.deudor.email, dispositivo: navigator.userAgent, huella: await huella(d) };
      const doc = await generarPagarePDF(d, { firma, ajustes: { piePdf: '' } });
      const res = await (await fetch(servicio, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'pagare_firmar', id, clave, firma, pdfBase64: pdfBase64(doc) }) })).json();
      if (!res.ok) throw new Error(res.error || 'No se pudo registrar la firma');
      $app.innerHTML = `<div class="panel" style="text-align:center;padding:30px 20px"><h1 class="paso-tit">Pagaré firmado</h1><p class="muted">Gracias, ${esc(nombre.split(' ')[0])}. Enviamos la copia firmada a su correo.</p><button class="btn" id="desc">Descargar copia</button></div>`;
      document.getElementById('desc').onclick = () => doc.save(`Pagare_${d.numero}_firmado.pdf`);
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Firmar y enviar'; }
  };
}
iniciar();
