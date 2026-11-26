// Correos (HTML) y comunicación con el servicio de Google Apps Script publicado en la cuenta dedicada.
import * as C from './calc.js';
import { formateador, fechaLarga } from './pdf.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Plantilla común de correo. */
export function plantilla({ titulo, ref = '', saludo = '', parrafos = [], filas = [], destacarUltima = false, boton = null, nota = '', aj }) {
  const tr = filas.map(([k, v], i) => `<tr><td style="padding:9px 12px;color:#5b6575;border-bottom:1px solid #e6eaf0">${esc(k)}</td><td style="padding:9px 12px;text-align:right;font-weight:${destacarUltima && i === filas.length - 1 ? 800 : 600};color:#2e2a47;border-bottom:1px solid #e6eaf0">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e2f5">
<tr><td style="background:#4f44a0;color:#fff;padding:22px 28px">${ref ? `<div style="font-size:12px;opacity:.85">Referencia ${esc(ref)}</div>` : ''}<div style="font-size:21px;font-weight:700;margin-top:4px">${esc(titulo)}</div></td></tr>
<tr><td style="padding:24px 28px;color:#2e2a47;font-size:15px;line-height:1.55">
${saludo ? `<p style="margin:0 0 12px">${esc(saludo)}</p>` : ''}
${parrafos.map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
${filas.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6eaf0;border-radius:8px;border-collapse:separate;font-size:14px">${tr}</table>` : ''}
${boton ? `<p style="margin:22px 0 4px;text-align:center"><a href="${esc(boton.url)}" style="background:#7c6fd8;color:#fff;text-decoration:none;padding:13px 26px;border-radius:12px;font-weight:700;display:inline-block">${esc(boton.texto)}</a></p>` : ''}
${nota ? `<p style="margin:18px 0 0;font-size:13px;color:#5b6575">${esc(nota)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf9ff;color:#7a8494;font-size:12px;border-top:1px solid #e6eaf0">${esc(aj.prestamistaNombre || '')}${aj.prestamistaTel ? ' · ' + esc(aj.prestamistaTel) : ''}<br>${esc(aj.piePdf || '')}</td></tr>
</table></td></tr></table></body></html>`;
}

const texto = (titulo, filas, extra = '') => `${titulo}\n\n` + filas.map(([k, v]) => `${k}: ${v}`).join('\n') + (extra ? '\n\n' + extra : '');
const nombreCorto = per => (per?.nombre || '').split(' ')[0];

/** Correo para estado de cuenta, condiciones o pagaré (con PDF adjunto). */
export function cuerpoCorreo(tipo, { prestamo: p, persona, abonos, ajustes: aj, mensaje, enlaceFirma }) {
  const $ = formateador(aj), F = d => fechaLarga(d, aj);
  const est = C.estadoCuenta(p, abonos, C.hoyISO(), Number(aj.decimales || 0));
  const esCons = p.clase === 'consignacion';
  let titulo, filas, intro, nota = 'Si tiene alguna inquietud sobre estos valores, responda a este correo.', boton = null;
  if (tipo === 'estado') {
    titulo = 'Estado de cuenta';
    filas = [[esCons ? 'Valor de la mercancía' : 'Monto prestado', $(p.monto)], ['Total pagado', $(est.pagado)], ...(est.devuelto ? [['Mercancía devuelta', $(est.devuelto)]] : []), ['Capital pendiente', $(est.capital)],
      ['Intereses pendientes', $(est.interesPendiente + est.adminPendiente)], ...(est.moraPendiente ? [['Intereses de mora', $(est.moraPendiente)]] : []),
      ...(est.atraso ? [['Valor vencido', $(est.atraso)]] : []), ...(est.proxima ? [['Próxima cuota', `${F(est.proxima.fecha)} · ${$(est.proxima.pendiente)}`]] : []), ['Total para saldar hoy', $(est.totalParaSaldar)]];
    intro = `Le compartimos el estado de cuenta con corte al ${F(C.hoyISO())}. El detalle completo está en el PDF adjunto.`;
  } else if (tipo === 'pagare') {
    titulo = enlaceFirma ? 'Pagaré para su firma' : 'Pagaré';
    filas = [['Valor', $(p.monto)], ['Fecha', F(p.fecha)], ['Vencimiento final', est.cronograma.filas.length ? F(est.cronograma.filas.at(-1).fecha) : F(p.fechaLimite)]];
    intro = enlaceFirma ? 'Le enviamos el pagaré correspondiente a la operación acordada. Revíselo y fírmelo electrónicamente con el botón; también lo adjuntamos en PDF para su lectura.' : 'Adjuntamos el pagaré correspondiente a la operación acordada.';
    if (enlaceFirma) { boton = { texto: 'Revisar y firmar el pagaré', url: enlaceFirma }; nota = 'El enlace es personal: no lo reenvíe. Si no reconoce esta operación, responda a este correo.'; }
  } else {
    titulo = esCons ? 'Condiciones de la consignación' : 'Condiciones de su préstamo';
    filas = [[esCons ? 'Valor de la mercancía' : 'Monto prestado', $(p.monto)], ['Fecha', F(p.fecha)],
      ['Interés', C.tasaMensual(p.interes) ? `${p.interes.tasa}% ${C.TIPOS_TASA[p.interes.tipo].toLowerCase()}` : 'Sin interés'],
      ['Forma de pago', esCons ? 'Pago de lo vendido' : C.TIPOS_PLAN[p.plan?.tipo || 'libre']], ...(est.cronograma.cuotaBase ? [['Cuota', $(est.cronograma.cuotaBase)]] : []),
      ...(est.cronograma.filas.length ? [['Total a pagar según plan', $(est.cronograma.totales.cuota)]] : []), ['Fecha límite', p.fechaLimite ? F(p.fechaLimite) : 'No definida']];
    intro = 'Le compartimos las condiciones acordadas. El detalle, con el plan de pagos y la forma de cálculo, está en el PDF adjunto.';
    if (p.mora?.activa !== false) nota = 'Importante: si un pago no se realiza en la fecha acordada, desde el día siguiente el capital vencido causa intereses de mora a la tasa máxima legal permitida. ' + nota;
  }
  return { asunto: `${titulo} · Ref. ${p.codigo || ''}${aj.prestamistaNombre ? ' · ' + aj.prestamistaNombre : ''}`, text: texto(titulo, filas, enlaceFirma ? 'Firmar: ' + enlaceFirma : ''),
    html: plantilla({ titulo, ref: p.codigo, saludo: `Hola ${nombreCorto(persona)},`, parrafos: [mensaje || intro], filas, destacarUltima: tipo === 'estado', boton, nota, aj }) };
}

/** Recordatorio de pago (lo envía el servicio en la fecha programada). */
export function correoRecordatorio({ prestamo: p, persona, fecha, valor, n, total, mensajeExtra, ajustes: aj }) {
  const $ = formateador(aj), F = d => fechaLarga(d, aj);
  const esCons = p.clase === 'consignacion';
  const titulo = esCons ? 'Recordatorio de liquidación de mercancía' : 'Recordatorio de pago';
  const filas = [['Fecha', F(fecha)], ...(n ? [['Cuota', total ? `${n} de ${total}` : String(n)]] : []), [esCons ? 'Saldo por liquidar' : 'Valor a pagar', $(valor)]];
  const parrafos = [esCons ? `Le recordamos que tiene pendiente la liquidación de la mercancía en consignación (Ref. ${p.codigo}).` : `Le recordamos que se acerca la fecha de pago de su cuota (Ref. ${p.codigo}).`];
  if (mensajeExtra) parrafos.push(mensajeExtra);
  const nota = p.mora?.activa !== false ? 'Si el pago no se realiza en la fecha indicada, se causarán intereses de mora a la tasa máxima legal permitida. Si ya pagó, ignore este mensaje.' : 'Si ya pagó, ignore este mensaje.';
  return { asunto: `${titulo} · ${F(fecha)} · Ref. ${p.codigo}`, text: texto(titulo, filas, nota), html: plantilla({ titulo, ref: p.codigo, saludo: `Hola ${nombreCorto(persona)},`, parrafos, filas, destacarUltima: true, nota, aj }) };
}

// ---------- Servicio (Apps Script) ----------
export async function servicio(accion, datos, aj) {
  if (!aj.mailerUrl || !aj.mailerToken) throw new Error('Configure el servicio de correo en Ajustes (dirección y clave).');
  if (!navigator.onLine) throw new Error('Sin conexión a internet.');
  const r = await fetch(aj.mailerUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...datos, accion, token: aj.mailerToken }) });
  const j = await r.json().catch(() => ({ ok: false, error: `Respuesta no válida del servicio (${r.status}). Si acaba de actualizar el código, publique una nueva versión.` }));
  if (!j.ok) throw new Error(j.error || 'El servicio respondió con un error');
  return j;
}
export function enviarCorreo({ to, cc, asunto, html, text, pdfBase64, filename, ref }, aj) {
  return servicio('enviar', { to, cc, bcc: aj.copiaOculta, replyTo: aj.replyTo, fromName: aj.remitenteNombre, subject: asunto, html, text, pdfBase64, filename, ref }, aj);
}
export async function probarServicio(aj) { return (await fetch(aj.mailerUrl)).json(); }
