// Agenda de recordatorios: la app calcula qué recordar y cuándo, y la envía al servicio de Google,
// que los manda cada mañana aunque el celular esté apagado.
import * as C from './calc.js';
import * as S from './store.js';
import { correoRecordatorio, servicio } from './email.js';
import { aj, persona, abonosDe, dec } from './comun.js';

const HORIZONTE = 150; // días hacia adelante

/** Fechas en que se debe recordar una consignación según su configuración personalizada. */
export function fechasConsignacion(p, hoy = C.hoyISO()) {
  const r = p.recordatorio || { modo: 'antes', dias: 3 };
  if (r.activo === false || !p.fechaLimite) return [];
  const fin = C.addDays(hoy, HORIZONTE);
  let fechas = [];
  if (r.modo === 'cada') {
    const n = Math.max(1, parseInt(r.cadaDias || 7, 10));
    for (let d = C.addDays(p.fecha, n); d <= p.fechaLimite && d <= fin; d = C.addDays(d, n)) fechas.push(d);
  } else if (r.modo === 'fechas') fechas = (r.fechas || []).filter(Boolean);
  else fechas = [C.addDays(p.fechaLimite, -Math.max(0, parseInt(r.dias ?? 3, 10)))];
  return [...new Set(fechas)].filter(d => d >= hoy && d <= fin).sort();
}

export function construirAgenda(hoy = C.hoyISO()) {
  const a = aj(), items = [];
  const base = { replyTo: a.replyTo, fromName: a.remitenteNombre, bcc: a.copiaOculta };
  for (const p of S.listar('prestamos')) {
    const per = persona(p.personaId);
    if (!per.email || p.recordatorio?.activo === false) continue;
    const ab = abonosDe(p.id);
    const e = C.estadoCuenta(p, ab, hoy, dec());
    if (e.estado === 'pagado') continue;
    if (p.clase === 'consignacion') {
      for (const d of fechasConsignacion(p, hoy)) {
        const c = correoRecordatorio({ prestamo: p, persona: per, fecha: p.fechaLimite, valor: e.totalParaSaldar, mensajeExtra: p.recordatorio?.mensaje, ajustes: a });
        items.push({ ...base, id: `${p.id}:${d}`, enviarEn: d, to: per.email, asunto: c.asunto, html: c.html, text: c.text, ref: p.codigo });
      }
      continue;
    }
    const dias = Math.max(0, parseInt(p.recordatorio?.dias ?? a.diasRecordatorio ?? 3, 10));
    const filas = e.cronograma.filas.length ? e.cronograma.filas : (p.fechaLimite ? [{ n: 0, fecha: p.fechaLimite, cuota: e.totalParaSaldar }] : []);
    const cubre = e.pagado - e.moraPagada + e.devuelto;
    let acum = 0;
    for (const f of filas) {
      const ini = acum; acum += f.cuota;
      if (f.fecha <= hoy || f.fecha > C.addDays(hoy, HORIZONTE)) continue;
      const pend = C.redondear(Math.max(0, Math.min(f.cuota, acum - Math.max(ini, cubre))), dec());
      if (pend <= 0) continue;
      const enviarEn = [C.addDays(f.fecha, -dias), hoy].sort()[1];
      const c = correoRecordatorio({ prestamo: p, persona: per, fecha: f.fecha, valor: pend, n: f.n || null, total: e.cronograma.filas.length, mensajeExtra: a.mensajeRecordatorio, ajustes: a });
      items.push({ ...base, id: `${p.id}:${f.fecha}:${f.n}`, enviarEn, to: per.email, asunto: c.asunto, html: c.html, text: c.text, ref: p.codigo });
    }
  }
  return items.sort((x, y) => x.enviarEn.localeCompare(y.enviarEn));
}

const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return String(h); };
const KEY = 'prestamos_agenda_v1';
export const estadoLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };

/** Envía la agenda al servicio si cambió. Silencioso si no hay conexión o servicio. */
export async function sincronizarAgenda({ forzar = false } = {}) {
  const a = aj();
  if (!a.recordatoriosActivos || !a.mailerUrl || !a.mailerToken || !navigator.onLine) return null;
  const items = construirAgenda();
  const h = hash(JSON.stringify(items.map(i => [i.id, i.enviarEn, i.to, i.text])));
  const prev = estadoLocal();
  if (!forzar && prev.hash === h && prev.fecha === C.hoyISO()) return prev;
  const r = await servicio('agenda', { items }, a);
  const est = { hash: h, fecha: C.hoyISO(), enviada: new Date().toISOString(), programados: r.programados, proximos: items.slice(0, 5).map(i => ({ enviarEn: i.enviarEn, to: i.to, asunto: i.asunto })) };
  localStorage.setItem(KEY, JSON.stringify(est));
  return est;
}
let t;
export function programarAgenda() { clearTimeout(t); t = setTimeout(() => sincronizarAgenda().catch(e => console.warn('Agenda:', e.message)), 8000); }
