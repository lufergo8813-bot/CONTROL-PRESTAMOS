// Envío del PDF por correo a través del servicio de Google Apps Script publicado en la cuenta dedicada.
import * as C from './calc.js';
import { formateador, fechaLarga } from './pdf.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Cuerpo HTML del correo: resumen claro + PDF adjunto con el detalle. */
export function cuerpoCorreo(tipo, { prestamo: p, persona, abonos, ajustes: aj, mensaje }) {
  const $ = formateador(aj), F = d => fechaLarga(d, aj);
  const est = C.estadoCuenta(p, abonos, C.hoyISO(), Number(aj.decimales || 0));
  const filas = tipo === 'estado'
    ? [['Monto prestado', $(p.monto)], ['Total pagado', $(est.pagado)], ['Capital pendiente', $(est.capital)],
       ['Intereses y administración pendientes', $(est.interesPendiente + est.adminPendiente)],
       ...(est.atraso ? [['Valor vencido según plan', $(est.atraso)]] : []),
       ...(est.proxima ? [['Próxima cuota', `${F(est.proxima.fecha)} · ${$(est.proxima.pendiente)}`]] : []),
       ['Total para saldar hoy', $(est.totalParaSaldar)]]
    : [['Monto prestado', $(p.monto)], ['Fecha del préstamo', F(p.fecha)],
       ['Tasa de interés', C.tasaMensual(p.interes) ? `${p.interes.tasa}% ${C.TIPOS_TASA[p.interes.tipo].toLowerCase()}` : 'Sin interés'],
       ['Forma de pago', C.TIPOS_PLAN[p.plan?.tipo || 'libre']],
       ...(est.cronograma.cuotaBase ? [['Cuota', $(est.cronograma.cuotaBase)]] : []),
       ...(est.cronograma.filas.length ? [['Total a pagar según plan', $(est.cronograma.totales.cuota)]] : []),
       ['Fecha límite', p.fechaLimite ? F(p.fechaLimite) : 'No definida']];
  const titulo = tipo === 'estado' ? 'Estado de cuenta de su préstamo' : 'Condiciones de su préstamo';
  const tr = filas.map(([k, v], i) => `<tr><td style="padding:9px 12px;color:#5b6575;border-bottom:1px solid #e6eaf0">${esc(k)}</td><td style="padding:9px 12px;text-align:right;font-weight:${i === filas.length - 1 && tipo === 'estado' ? 700 : 600};color:#14243d;border-bottom:1px solid #e6eaf0">${esc(v)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ff;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e1e6ee">
<tr><td style="background:#4f44a0;color:#fff;padding:22px 28px"><div style="font-size:12px;opacity:.8;letter-spacing:.06em">REFERENCIA ${esc(p.codigo || '')}</div><div style="font-size:21px;font-weight:700;margin-top:4px">${esc(titulo)}</div></td></tr>
<tr><td style="padding:24px 28px;color:#26303f;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Hola ${esc((persona?.nombre || '').split(' ')[0])},</p>
<p style="margin:0 0 16px">${mensaje ? esc(mensaje).replace(/\n/g, '<br>') : (tipo === 'estado' ? `Le compartimos el estado de cuenta de su préstamo con corte al ${esc(F(C.hoyISO()))}.` : 'Le compartimos las condiciones acordadas de su préstamo.')} El detalle completo, con el plan de pagos y la forma de cálculo, está en el PDF adjunto.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6eaf0;border-radius:8px;border-collapse:separate;font-size:14px">${tr}</table>
<p style="margin:18px 0 0;font-size:13px;color:#5b6575">Si tiene alguna inquietud sobre estos valores, responda a este correo.</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f7f9fc;color:#7a8494;font-size:12px;border-top:1px solid #e6eaf0">${esc(aj.prestamistaNombre || '')}${aj.prestamistaTel ? ' · ' + esc(aj.prestamistaTel) : ''}<br>${esc(aj.piePdf || '')}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${titulo}\n\n` + filas.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\nDetalle completo en el PDF adjunto.';
  return { html, text, asunto: `${titulo} · Ref. ${p.codigo || ''}${aj.prestamistaNombre ? ' · ' + aj.prestamistaNombre : ''}` };
}

export async function enviarCorreo({ to, cc, asunto, html, text, pdfBase64, filename, ref }, aj) {
  if (!aj.mailerUrl || !aj.mailerToken) throw new Error('Configure el servicio de correo en Ajustes (URL y token).');
  const r = await fetch(aj.mailerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita la verificación CORS previa con Apps Script
    body: JSON.stringify({ token: aj.mailerToken, to, cc, bcc: aj.copiaOculta, replyTo: aj.replyTo, fromName: aj.remitenteNombre, subject: asunto, html, text, pdfBase64, filename, ref }),
  });
  const j = await r.json().catch(() => ({ ok: false, error: `Respuesta no válida del servicio (${r.status})` }));
  if (!j.ok) throw new Error(j.error || 'No se pudo enviar');
  return j;
}

export async function probarServicio(aj) {
  const r = await fetch(aj.mailerUrl);
  return r.json();
}
