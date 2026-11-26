// Utilidades compartidas por todas las vistas.
import * as C from './calc.js';
import * as S from './store.js';
import { formateador, fechaLarga } from './pdf.js';
import { USURA_CONOCIDA } from './legal.js';
import { servicio } from './email.js';
import { icon, ilus } from './ui.js';

export const $app = document.getElementById('app');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const q = (sel, root = document) => root.querySelector(sel);
export const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
export const aj = () => S.ajustes();
export const dec = () => Number(aj().decimales || 0);
export const money = v => formateador(aj())(v);
export const F = iso => fechaLarga(iso, aj());
export const Fc = iso => { if (!iso) return ''; return new Intl.DateTimeFormat(aj().locale || 'es-CO', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(C.toDate(iso)).replace(/\./g, '').replace(/ de /g, ' '); };
export const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
export const mesTexto = k => new Intl.DateTimeFormat(aj().locale || 'es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(C.toDate(k + '-01'));
export const diaMes = iso => { const d = C.toDate(iso); return { dia: d.getUTCDate(), mes: new Intl.DateTimeFormat(aj().locale || 'es-CO', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '') }; };
export const urlApp = () => new URL('.', location.href).href;

// ---------- re-render global ----------
let _render = () => {};
export const setRender = fn => (_render = fn);
export const render = () => _render();

// ---------- avisos y diálogos ----------
let toastT;
export function toast(msg, err = false) {
  const t = q('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6500 : 2800);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });
export function cerrarModal() { const m = q('#modal'); if (!m.hidden) { m.hidden = true; q('.modal-box', m).innerHTML = ''; } }
export function modal(html, onMount, { ancho = false } = {}) {
  const m = q('#modal'), box = q('.modal-box', m);
  box.classList.toggle('ancho', !!ancho);
  box.innerHTML = html; m.hidden = false; box.scrollTop = 0;
  m.onclick = e => { if (e.target === m) cerrarModal(); };
  qa('[data-cerrar]', box).forEach(b => b.addEventListener('click', cerrarModal));
  onMount?.(box, cerrarModal);
  q('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea', box)?.focus({ preventScroll: true });
  return cerrarModal;
}
export function confirmar(msg, si = 'Sí, eliminar') {
  return new Promise(res => modal(`<h2>¿Seguro?</h2><p>${esc(msg)}</p><div class="acciones"><button class="btn dan" id="si">${esc(si)}</button><button class="btn" data-cerrar>Cancelar</button></div>`,
    (b, cerrar) => { q('#si', b).onclick = () => { cerrar(); res(true); }; qa('[data-cerrar]', b).forEach(x => x.addEventListener('click', () => res(false))); }));
}
export async function conBoton(btn, fn) {
  const html = btn.innerHTML; btn.disabled = true; btn.textContent = 'Un momento…';
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), true); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}
export const chip = est => `<span class="chip ${C.ESTADOS[est].color}">${C.ESTADOS[est].label}</span>`;
export const vacio = (img, texto, accion = '') => `<div class="vacio">${ilus(img)}<p>${texto}</p>${accion}</div>`;
export const opciones = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.label || v)}</option>`).join('');

// ---------- datos ----------
export const persona = id => S.obtener('personas', id) || { nombre: 'Persona eliminada' };
export const cuenta = id => S.obtener('cuentas', id);
export const abonosDe = id => S.listar('abonos').filter(a => a.prestamoId === id);
export const estadoDe = (p, corte) => C.estadoCuenta(p, abonosDe(p.id), corte || C.hoyISO(), dec());
export const pctRecuperado = (p, e) => (p.monto ? (e.capitalPagado + e.devuelto) / p.monto : 0);
export const esCons = p => p.clase === 'consignacion';
export function siguienteCodigo(pref = 'PR') {
  const y = new Date().getFullYear();
  const max = S.listar('prestamos', { incluirBorrados: true }).map(p => (p.codigo || '').match(new RegExp(`^${pref}-${y}-(\\d+)$`))).filter(Boolean).reduce((m, r) => Math.max(m, +r[1]), 0);
  return `${pref}-${y}-${String(max + 1).padStart(4, '0')}`;
}
export const prestamistas = () => S.listar('prestamistas').sort((a, b) => a.nombre.localeCompare(b.nombre));
export function acreedorDe(p) {
  const a = aj(), x = p?.prestamistaId && S.obtener('prestamistas', p.prestamistaId);
  if (x && !x.deleted) return x;
  return { nombre: p?.prestadoPor || a.prestamistaNombre, documento: a.prestamistaDoc, tipoDoc: 'C.C.', telefono: a.prestamistaTel, email: a.prestamistaEmail, ciudad: a.ciudad };
}
export function scoreDe(personaId) {
  const items = S.listar('prestamos').filter(p => p.personaId === personaId).map(p => ({ prestamo: p, abonos: abonosDe(p.id) }));
  return C.scorePersona(items, C.hoyISO(), dec());
}
const COLOR_SCORE = { A: 'ok', B: 'done', C: 'warn', D: 'bad', nuevo: 'gris' };
export const chipScore = s => `<span class="chip ${COLOR_SCORE[s.nivel]}" title="Score de cumplimiento">${s.puntaje == null ? 'Sin historial' : `${s.puntaje} · ${s.etiqueta}`}</span>`;

// ---------- tasa de usura ----------
export function tablaUsura() { return { ...USURA_CONOCIDA, ...(aj().usura || {}) }; }
export function aplicarUsura() { C.configurarUsura(tablaUsura()); }
export function usuraVigente() {
  const hoy = C.hoyISO(), mes = hoy.slice(0, 7), t = tablaUsura();
  const meses = Object.keys(t).sort();
  return { mes, ea: C.usuraDelMes(hoy), mensual: C.eaAMensual(C.usuraDelMes(hoy)), registrada: t[mes] != null, ultimo: meses.at(-1) };
}
export async function actualizarUsura() {
  const r = await servicio('usura', {}, aj());
  const a = aj();
  S.guardarAjustes({ ...a, usura: { ...(a.usura || {}), [r.mes]: r.usura }, usuraLeida: r.leido });
  aplicarUsura();
  return r;
}
/** Bloque informativo de tasa máxima para formularios. */
export function avisoUsuraHTML(interes) {
  const u = usuraVigente();
  const ea = C.tasaEA(interes || {});
  const excede = u.ea && ea > u.ea + 0.005;
  return `<div class="usura ${excede ? 'excede' : ''}">
    <div>${icon(excede ? 'alerta' : 'porcentaje')}</div>
    <div class="cuerpo"><b>Tasa máxima legal ${esc(mesTexto(u.registrada ? u.mes : u.ultimo || u.mes))}: ${u.ea ? u.ea.toLocaleString('es-CO') + '% E.A.' : 'sin dato'}</b>
      <span>${u.ea ? `Equivale a ${u.mensual.toFixed(2)}% mensual.` : ''} ${!u.registrada ? 'No está registrada la de este mes: actualízala.' : ''}</span>
      ${excede ? `<span class="fuerte">La tasa pactada (${ea.toFixed(2)}% E.A.) supera el máximo legal. Cobrar por encima de la usura puede ser delito.</span>` : ''}</div>
    <button type="button" class="btn sm" data-act-usura>Actualizar</button></div>`;
}
export function enlazarUsura(root, alTerminar) {
  qa('[data-act-usura]', root).forEach(b => (b.onclick = () => conBoton(b, async () => {
    const r = await actualizarUsura();
    toast(`Tasa de usura ${mesTexto(r.mes)}: ${r.usura}% E.A.`);
    alTerminar?.();
  })));
}
