import * as C from './calc.js';
import * as S from './store.js';
import { generarPDF, nombreArchivo, pdfBase64, formateador, fechaLarga } from './pdf.js';
import { cuerpoCorreo, enviarCorreo, probarServicio } from './email.js';
import { icon, ilus, avatar, anillo } from './ui.js';

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
const aj = () => S.ajustes();
const dec = () => Number(aj().decimales || 0);
const money = v => formateador(aj())(v);
const F = iso => fechaLarga(iso, aj());
const Fc = iso => { if (!iso) return ''; const d = C.toDate(iso); return new Intl.DateTimeFormat(aj().locale || 'es-CO', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d).replace(/\./g, '').replace(/ de /g, ' '); };
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const diaMes = iso => {
  const d = C.toDate(iso);
  return { dia: d.getUTCDate(), mes: new Intl.DateTimeFormat(aj().locale || 'es-CO', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '') };
};

// ---------- utilidades de interfaz ----------
let toastT;
function toast(msg, err = false) {
  const t = q('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 2800);
}
function modal(html, onMount) {
  const m = q('#modal'), box = q('.modal-box', m);
  box.innerHTML = html; m.hidden = false;
  const cerrar = () => { m.hidden = true; box.innerHTML = ''; };
  m.onclick = e => { if (e.target === m) cerrar(); };
  qa('[data-cerrar]', box).forEach(b => b.addEventListener('click', cerrar));
  onMount?.(box, cerrar);
  q('input:not([type=hidden]):not([type=radio]),select,textarea', box)?.focus();
  return cerrar;
}
function confirmar(msg, si = 'Sí, eliminar') {
  return new Promise(res => modal(`<h2>¿Seguro?</h2><p>${esc(msg)}</p><div class="acciones"><button class="btn dan" id="si">${esc(si)}</button><button class="btn" data-cerrar>Cancelar</button></div>`,
    (b, cerrar) => { q('#si', b).onclick = () => { cerrar(); res(true); }; qa('[data-cerrar]', b).forEach(x => x.addEventListener('click', () => res(false))); }));
}
async function conBoton(btn, fn) {
  const html = btn.innerHTML; btn.disabled = true; btn.textContent = 'Un momento…';
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e), true); } finally { btn.disabled = false; btn.innerHTML = html; }
}
const chip = est => `<span class="chip ${C.ESTADOS[est].color}">${C.ESTADOS[est].label}</span>`;
const vacio = (img, texto, accion = '') => `<div class="vacio">${ilus(img)}<p>${texto}</p>${accion}</div>`;

// ---------- datos derivados ----------
const persona = id => S.obtener('personas', id) || { nombre: 'Persona eliminada' };
const cuenta = id => S.obtener('cuentas', id);
const abonosDe = id => S.listar('abonos').filter(a => a.prestamoId === id);
const estadoDe = (p, corte) => C.estadoCuenta(p, abonosDe(p.id), corte || C.hoyISO(), dec());
const pctRecuperado = (p, e) => (p.monto ? e.capitalPagado / p.monto : 0);
function siguienteCodigo() {
  const y = new Date().getFullYear();
  const max = S.listar('prestamos', { incluirBorrados: true }).map(p => (p.codigo || '').match(new RegExp(`^PR-${y}-(\\d+)$`))).filter(Boolean).reduce((m, r) => Math.max(m, +r[1]), 0);
  return `PR-${y}-${String(max + 1).padStart(4, '0')}`;
}

// ---------- navegación ----------
q('#nav').innerHTML = `<div class="logo"><img src="icons/icon.svg" alt="">Mis Préstamos</div>
  <a href="#/" data-r="">${icon('inicio')}<span>Inicio</span></a>
  <a href="#/prestamos" data-r="prestamos">${icon('lista')}<span>Préstamos</span></a>
  <a href="#/nuevo" data-r="nuevo" class="nav-new" aria-label="Nuevo préstamo">${icon('mas')}<span>Nuevo préstamo</span></a>
  <a href="#/personas" data-r="personas">${icon('personas')}<span>Personas</span></a>
  <a href="#/ajustes" data-r="ajustes">${icon('ajustes')}<span>Ajustes</span></a>`;

const rutas = { '': inicio, prestamos: lista, nuevo: asistente, editar: asistente, prestamo: detalle, personas, cuentas, ajustes: vistaAjustes };
function render() {
  const [r, id] = location.hash.replace(/^#\/?/, '').split('/');
  $app.onclick = null;
  const m = q('#modal'); if (!m.hidden) { m.hidden = true; q('.modal-box', m).innerHTML = ''; }
  const activa = r === 'cuentas' ? 'personas' : r === 'prestamo' ? 'prestamos' : r === 'editar' ? 'nuevo' : r;
  qa('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (activa || '')));
  (rutas[r] || inicio)(id ? decodeURIComponent(id) : undefined);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
let renderPend;
S.onChange(() => {
  pintarSync();
  if (!q('[data-edit]') && q('#modal').hidden) { clearTimeout(renderPend); renderPend = setTimeout(render, 150); }
});

// ---------- INICIO ----------
function filaPrestamo({ p, e }) {
  const per = persona(p.personaId);
  return `<a class="fila" href="#/prestamo/${p.id}">${avatar(per.nombre)}
    <div class="cuerpo"><div class="t1">${esc(per.nombre)}</div><div class="t2">${chip(e.estado)}</div></div>
    <div class="lado">${money(e.totalParaSaldar)}<small>${e.estado === 'pagado' ? 'Saldado' : e.atraso ? 'Atraso ' + money(e.atraso) : e.proxima ? 'Próx. ' + Fc(e.proxima.fecha) : 'Por cobrar'}</small></div>
    ${anillo(pctRecuperado(p, e), 44, { grosor: 5 })}</a>`;
}

function inicio() {
  const a = aj();
  const ests = S.listar('prestamos').map(p => ({ p, e: estadoDe(p) }));
  const activos = ests.filter(x => x.e.estado !== 'pagado');
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const hoy = C.hoyISO(), en30 = C.addDays(hoy, 30);
  const proximos = activos.filter(x => x.e.proxima && x.e.proxima.fecha <= en30).sort((x, y) => x.e.proxima.fecha.localeCompare(y.e.proxima.fecha));
  const alertas = activos.filter(x => x.e.estado === 'en_mora' || x.e.estado === 'vencido');
  const porCuenta = {};
  activos.forEach(({ p, e }) => { const k = cuenta(p.cuentaId)?.nombre || 'Sin cuenta'; porCuenta[k] = (porCuenta[k] || 0) + e.capital; });
  const maxCuenta = Math.max(1, ...Object.values(porCuenta));
  const nombre = (a.prestamistaNombre || '').split(' ')[0];
  const h = new Date().getHours();

  $app.innerHTML = `
    <div class="cabecera"><div><h1>${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? ', ' + esc(nombre) : ''}</h1><p>Así van tus préstamos hoy.</p></div></div>
    ${!ests.length ? `<div class="panel">${vacio('billetera', 'Aún no has registrado préstamos. Empieza por el primero: te tomará un minuto.', '<a class="btn pri" href="#/nuevo">' + icon('mas') + 'Registrar préstamo</a>')}
      ${!a.prestamistaNombre ? '<div class="info">Consejo: escribe tu nombre en <a href="#/ajustes">Ajustes</a> para que aparezca en los PDF.</div>' : ''}</div>` : `
    <section class="hero">
      <div><small>Te deben hoy</small><div class="grande monto">${money(sum(activos, x => x.e.totalParaSaldar))}</div>
        <div class="det">${activos.length} préstamo${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}, capital por recuperar ${money(sum(activos, x => x.e.capital))}</div></div>
      <div class="ilus">${ilus('frasco')}</div>
    </section>
    <div class="mosaico">
      <div class="tile t-menta"><div class="et">${icon('check')}Intereses cobrados</div><div class="val">${money(sum(ests, x => x.e.interesPagado + x.e.adminPagado))}</div></div>
      <div class="tile t-durazno"><div class="et">${icon('alerta')}Atrasado o vencido</div><div class="val">${money(sum(alertas, x => x.e.estado === 'vencido' ? x.e.totalParaSaldar : x.e.atraso))}</div></div>
      <div class="tile t-mant"><div class="et">${icon('calendario')}Por cobrar en 30 días</div><div class="val">${money(sum(proximos, x => x.e.proxima.pendiente))}</div></div>
      <div class="tile t-cielo"><div class="et">${icon('dinero')}Total cobrado</div><div class="val">${money(sum(ests, x => x.e.pagado))}</div></div>
    </div>
    ${alertas.length ? `<h2>Necesitan tu atención</h2><div class="lista">${alertas.map(filaPrestamo).join('')}</div>` : ''}
    <h2>Próximos cobros</h2>
    ${proximos.length ? `<div class="lista">${proximos.map(({ p, e }) => { const d = diaMes(e.proxima.fecha); return `<a class="fila" href="#/prestamo/${p.id}">
        <div class="fecha-chip"><b>${d.dia}</b><span>${d.mes}</span></div>
        <div class="cuerpo"><div class="t1">${esc(persona(p.personaId).nombre)}</div><div class="t2">Cuota ${e.proxima.n}${e.cronograma.filas.length ? ' de ' + e.cronograma.filas.length : ''}</div></div>
        <div class="lado">${money(e.proxima.pendiente)}</div></a>`; }).join('')}</div>`
      : '<div class="lista"><div class="fila"><div class="cuerpo t2">No hay cuotas en los próximos 30 días.</div></div></div>'}
    ${Object.keys(porCuenta).length ? `<h2>Dinero prestado por cuenta</h2><div class="lista">${Object.entries(porCuenta).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<div class="fila"><div class="avatar" style="background:var(--cielo);color:var(--cielo-t)">${icon('banco')}</div><div class="cuerpo"><div class="t1">${esc(k)}</div><div class="barra"><i style="width:${(v / maxCuenta) * 100}%"></i></div></div><div class="lado">${money(v)}</div></div>`).join('')}</div>` : ''}`}`;
}

// ---------- LISTA / HISTORIAL ----------
let filtro = { texto: '', estado: 'activos' };
function lista() {
  const FILTROS = { activos: 'Activos', en_mora: 'Con atraso', vencido: 'Vencidos', pagado: 'Pagados', todos: 'Todos' };
  $app.innerHTML = `<div class="cabecera"><div><h1>Préstamos</h1><p>Activos e historial completo.</p></div></div>
    <div class="buscar">${icon('buscar')}<input id="buscar" type="search" placeholder="Buscar por nombre, referencia o nota" value="${esc(filtro.texto)}"></div>
    <div class="filtros" role="tablist">${Object.entries(FILTROS).map(([k, v]) => `<button data-f="${k}" class="${filtro.estado === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div id="res"></div>`;
  const pintar = () => {
    const t = filtro.texto.toLowerCase();
    const items = S.listar('prestamos').map(p => ({ p, e: estadoDe(p) }))
      .filter(({ e }) => filtro.estado === 'todos' || (filtro.estado === 'activos' ? e.estado !== 'pagado' : e.estado === filtro.estado))
      .filter(({ p }) => !t || [persona(p.personaId).nombre, p.codigo, p.notas, p.prestadoPor].join(' ').toLowerCase().includes(t))
      .sort((x, y) => y.p.fecha.localeCompare(x.p.fecha));
    q('#res').innerHTML = items.length ? `<div class="lista">${items.map(filaPrestamo).join('')}</div>`
      : `<div class="panel">${vacio('billetera', S.listar('prestamos').length ? 'No hay préstamos con este filtro.' : 'Aquí verás todos tus préstamos.', '<a class="btn pri" href="#/nuevo">' + icon('mas') + 'Registrar préstamo</a>')}</div>`;
  };
  q('#buscar').oninput = e => { filtro.texto = e.target.value; pintar(); };
  qa('.filtros button').forEach(b => (b.onclick = () => { filtro.estado = b.dataset.f; qa('.filtros button').forEach(x => x.classList.toggle('on', x === b)); pintar(); }));
  pintar();
}

// ---------- ASISTENTE: NUEVO / EDITAR PRÉSTAMO ----------
function asistente(id) {
  const existente = id ? S.obtener('prestamos', id) : null;
  const hoy = C.hoyISO();
  const p = existente ? structuredClone(existente) : {
    fecha: hoy, prestadoPor: aj().prestamistaNombre || '', interes: { tipo: 'mensual', tasa: 0 }, admin: { tipo: 'ninguno', valor: 0 },
    plan: { tipo: 'cuotas_iguales', numCuotas: 6, periodo: 'mensual', fechaPrimeraCuota: C.addMonths(hoy, 1), cuotas: [] }, notas: '', fechaLimite: '',
  };
  p.plan.cuotas = (p.plan.cuotas || []).map(c => ({ ...c }));
  p.plan.numCuotas = p.plan.numCuotas || 6; p.plan.periodo = p.plan.periodo || 'mensual';
  let paso = existente ? 1 : 0, primeraTocada = !!existente, buscarP = '';
  const PASOS = [
    ['¿A quién le prestas?', 'Elige la persona o regístrala.'],
    ['¿Cuánto le prestas?', 'El valor, la fecha y de qué cuenta salió el dinero.'],
    ['Interés y administración', 'Deja la tasa en 0 si es un préstamo sin interés.'],
    ['¿Cómo te va a pagar?', 'Elige la forma de pago. En el último paso verás el plan completo.'],
    ['Revisa y guarda', 'Confirma que todo esté bien.'],
  ];

  const set = (name, v) => {
    switch (name) {
      case 'monto': p.monto = num(v); break;
      case 'tasa': p.interes.tasa = num(v); break;
      case 'tasaTipo': p.interes.tipo = v; break;
      case 'adminTipo': p.admin.tipo = v; break;
      case 'adminValor': p.admin.valor = num(v); break;
      case 'planTipo': p.plan.tipo = v; break;
      case 'numCuotas': p.plan.numCuotas = Math.max(1, parseInt(v || 1, 10)); break;
      case 'periodo': p.plan.periodo = v; if (!primeraTocada) p.plan.fechaPrimeraCuota = C.fechaCuota(p.fecha, v, 2); break;
      case 'fechaPrimeraCuota': p.plan.fechaPrimeraCuota = v; primeraTocada = true; break;
      case 'fecha': p.fecha = v; if (!primeraTocada && v) p.plan.fechaPrimeraCuota = C.fechaCuota(v, p.plan.periodo, 2); break;
      default: p[name] = v;
    }
  };
  const cuotasLimpias = () => p.plan.cuotas.map(c => ({ fecha: c.fecha, valor: num(c.valor) })).filter(c => c.fecha && c.valor > 0);
  const calculo = () => C.generarCronograma({ ...p, plan: { ...p.plan, cuotas: cuotasLimpias() } }, dec());

  function resumen(completo = false) {
    if (!p.monto) return '<p class="muted">Escribe el monto para ver el cálculo.</p>';
    const cr = calculo(), im = C.tasaMensual(p.interes);
    const per = p.personaId ? persona(p.personaId).nombre : '—';
    const lineas = [['Persona', per], ['Monto', money(p.monto)], ['Fecha', F(p.fecha)],
      ['Interés', im ? `${p.interes.tasa}% ${C.TIPOS_TASA[p.interes.tipo].toLowerCase()}` : 'Sin interés'],
      ['Forma de pago', C.TIPOS_PLAN[p.plan.tipo]]];
    if (cr.filas.length) lineas.push(['Total a pagar', money(cr.totales.cuota)], ['Ganancia (interés + admón.)', money(cr.totales.interes + cr.totales.admin)]);
    if (p.plan.tipo === 'libre' && im) lineas.push(['Interés del primer mes', money(p.monto * im)]);
    if (p.plan.tipo === 'libre' && p.fechaLimite) lineas.push(['Si paga todo el ' + F(p.fechaLimite), money(C.estadoCuenta({ ...p }, [], p.fechaLimite, dec()).totalParaSaldar)]);
    const hayAdm = cr.filas.some(f => f.admin);
    return `${cr.cuotaBase ? `<div class="cuota-dest">Cuota ${C.PERIODOS[p.plan.periodo].label.toLowerCase()}<b class="monto">${money(cr.cuotaBase)}</b>${hayAdm ? '<small>más administración</small>' : ''}</div>` : ''}
      ${lineas.map(([k, v]) => `<div class="linea-res"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
      ${cr.advertencias.map(t => `<div class="alerta">${esc(t)}</div>`).join('')}
      ${completo && cr.filas.length ? `<h2>Plan de pagos</h2><div class="tabla"><table><thead><tr><th>N°</th><th>Fecha</th><th class="num">Interés</th>${hayAdm ? '<th class="num">Admón.</th>' : ''}<th class="num">Capital</th><th class="num">Cuota</th><th class="num">Saldo</th></tr></thead><tbody>
        ${cr.filas.map(f => `<tr><td>${f.n}</td><td class="num" style="text-align:left">${Fc(f.fecha)}</td><td class="num">${money(f.interes)}</td>${hayAdm ? `<td class="num">${money(f.admin)}</td>` : ''}<td class="num">${money(f.capital)}</td><td class="num"><b>${money(f.cuota)}</b></td><td class="num">${money(f.saldoFinal)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }

  function cuerpoPaso() {
    const cuentas = S.listar('cuentas');
    switch (paso) {
      case 0: {
        const lista = S.listar('personas').sort((a, b) => a.nombre.localeCompare(b.nombre)).filter(x => !buscarP || x.nombre.toLowerCase().includes(buscarP.toLowerCase()));
        return `${S.listar('personas').length > 8 ? `<div class="buscar" style="margin-top:12px">${icon('buscar')}<input id="buscarP" placeholder="Buscar persona" value="${esc(buscarP)}"></div>` : ''}
          <div class="personas-grid"><button type="button" class="persona-op" id="nuevaPersona"><span class="nuevo">${icon('mas')}</span>Nueva persona</button>
          ${lista.map(x => `<button type="button" class="persona-op ${x.id === p.personaId ? 'on' : ''}" data-per="${x.id}">${avatar(x.nombre)}${esc(x.nombre)}</button>`).join('')}</div>`;
      }
      case 1: return `
        <label for="monto">Monto prestado</label><input id="monto" name="monto" class="monto-grande" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${p.monto || ''}">
        <div class="hint" id="montoFmt" style="text-align:center">${p.monto ? money(p.monto) : ''}</div>
        <label for="fecha">Fecha en que entregaste el dinero</label><input id="fecha" name="fecha" type="date" value="${esc(p.fecha)}">
        <label>¿De qué cuenta salió?</label>
        <div class="chips-sel">${cuentas.map(c => `<label><input type="radio" name="cuentaId" value="${c.id}" ${c.id === p.cuentaId ? 'checked' : ''}>${esc(c.nombre)}</label>`).join('')}
          <button type="button" class="btn sm" id="nuevaCuenta">${icon('mas')}Agregar cuenta</button></div>
        <label for="prestadoPor">¿Quién presta?</label><input id="prestadoPor" name="prestadoPor" value="${esc(p.prestadoPor)}" placeholder="Tú, un socio, un familiar…">`;
      case 2: return `
        <div class="f2"><div><label for="tasa">Tasa de interés (%)</label><input id="tasa" name="tasa" type="number" inputmode="decimal" min="0" step="any" value="${p.interes.tasa || ''}" placeholder="0"></div>
        <div><label>La tasa es</label><select name="tasaTipo">${Object.entries(C.TIPOS_TASA).map(([k, v]) => `<option value="${k}" ${k === p.interes.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
        <div class="hint" id="tasaEq"></div>
        <label>Cobro de administración</label>
        <div class="chips-sel">${Object.entries(C.TIPOS_ADMIN).map(([k, v]) => `<label><input type="radio" name="adminTipo" value="${k}" ${k === p.admin.tipo ? 'checked' : ''}>${v}</label>`).join('')}</div>
        <div id="admWrap" ${p.admin.tipo === 'ninguno' ? 'hidden' : ''}><label for="adminValor" id="adminLbl">Valor</label><input id="adminValor" name="adminValor" type="number" inputmode="decimal" min="0" step="any" value="${p.admin.valor || ''}"></div>`;
      case 3: return `
        <div class="opciones">
          ${[['cuotas_iguales', 'cuotas', 't-lav', 'Cuotas iguales', 'El mismo valor cada semana, quincena o mes.'],
             ['personalizado', 'personalizado', 't-durazno', 'Cuotas personalizadas', 'Tú defines cada fecha y cada valor.'],
             ['libre', 'libre', 't-menta', 'Abonos libres', 'Abona cuando pueda, antes de la fecha límite.']].map(([k, ic, t, ti, de]) =>
            `<label class="opcion"><input type="radio" name="planTipo" value="${k}" ${p.plan.tipo === k ? 'checked' : ''}><span class="ic ${t}">${icon(ic)}</span><span><b>${ti}</b><small>${de}</small></span></label>`).join('')}
        </div>
        <div id="planDet">${detallePlan()}</div>
        <label for="fechaLimite">Fecha límite de pago <span class="muted">(opcional)</span></label><input id="fechaLimite" name="fechaLimite" type="date" value="${esc(p.fechaLimite || '')}">
        <div class="hint">Con cuotas, si la dejas vacía se usa la fecha de la última cuota.</div>`;
      case 4: return `<div class="resumen-inline">${resumen(true)}</div>
        <label for="notas">Notas <span class="muted">(aparecen en el PDF)</span></label><textarea id="notas" name="notas" placeholder="Acuerdos, garantías, observaciones…">${esc(p.notas || '')}</textarea>`;
    }
  }
  function detallePlan() {
    if (p.plan.tipo === 'cuotas_iguales') return `<div class="f3">
      <div><label for="numCuotas">Número de cuotas</label><input id="numCuotas" name="numCuotas" type="number" min="1" max="600" value="${p.plan.numCuotas}"></div>
      <div><label for="periodo">Cada cuánto</label><select id="periodo" name="periodo">${Object.entries(C.PERIODOS).map(([k, v]) => `<option value="${k}" ${k === p.plan.periodo ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div><label for="fechaPrimeraCuota">Primera cuota</label><input id="fechaPrimeraCuota" name="fechaPrimeraCuota" type="date" value="${esc(p.plan.fechaPrimeraCuota || '')}"></div></div>`;
    if (p.plan.tipo === 'personalizado') return `<label>Cuotas acordadas</label><div id="cuotasPers">${p.plan.cuotas.map((c, i) => `<div class="cuota-row"><input type="date" data-i="${i}" data-k="fecha" value="${esc(c.fecha)}" aria-label="Fecha cuota ${i + 1}"><input type="number" inputmode="decimal" step="any" min="0" data-i="${i}" data-k="valor" value="${esc(c.valor)}" placeholder="Valor" aria-label="Valor cuota ${i + 1}"><button type="button" class="btn sm dan" data-del="${i}" aria-label="Quitar cuota">${icon('borrar')}</button></div>`).join('') || '<p class="muted">Agrega la primera cuota.</p>'}</div>
      <div class="acciones" style="margin-top:6px"><button type="button" class="btn sm" id="addCuota">${icon('mas')}Agregar cuota</button><button type="button" class="btn sm" id="ajustar">Ajustar la última cuota al saldo</button></div>`;
    return '<div class="info">El interés se calcula sobre lo que falte por pagar, hasta el día de cada abono.</div>';
  }

  $app.innerHTML = `${existente ? `<a class="volver" href="#/prestamo/${id}">${icon('atras')}Volver</a>` : ''}
    <div class="asistente" data-edit>
      <div><div class="pasos" aria-hidden="true">${PASOS.map((_, i) => `<span data-p="${i}"></span>`).join('')}</div>
        <form class="paso" id="fpaso" autocomplete="off" novalidate></form></div>
      <aside class="resumen-lado"><div class="panel"><h2 style="margin-top:4px">${existente ? 'Editando ' + esc(existente.codigo || '') : 'Resumen'}</h2><div id="resLado"></div></div></aside>
    </div>`;
  if (!q('#estiloAsis')) document.head.insertAdjacentHTML('beforeend', '<style id="estiloAsis">@media (max-width:899px){.resumen-lado{display:none}}</style>');
  const form = q('#fpaso');

  function actualizarDerivados() {
    q('#resLado').innerHTML = resumen(false);
    const mf = q('#montoFmt'); if (mf) mf.textContent = p.monto ? money(p.monto) : '';
    const te = q('#tasaEq'); if (te) { const im = C.tasaMensual(p.interes); te.textContent = im && p.interes.tipo !== 'mensual' ? `Equivale a ${(im * 100).toFixed(4)}% mensual.` : ''; }
    const al = q('#adminLbl'); if (al) al.textContent = { pct_saldo: 'Porcentaje mensual sobre el saldo (%)', fijo_mensual: 'Valor por mes', unico: 'Valor único', ninguno: 'Valor' }[p.admin.tipo];
    const ri = q('.resumen-inline'); if (ri) ri.innerHTML = resumen(true);
  }
  function pintarPaso() {
    qa('.pasos span').forEach((s, i) => s.classList.toggle('on', i <= paso));
    const ult = paso === PASOS.length - 1;
    form.innerHTML = `<p class="muted" style="margin:0">Paso ${paso + 1} de ${PASOS.length}</p><h1 class="paso-tit">${PASOS[paso][0]}</h1><p class="paso-sub">${PASOS[paso][1]}</p>
      ${existente && paso === 1 && abonosDe(id).length ? '<div class="alerta">Este préstamo ya tiene abonos: si cambias las condiciones, los saldos se recalculan.</div>' : ''}
      ${cuerpoPaso()}
      <div class="nav-pasos">${paso > 0 ? `<button type="button" class="btn ghost" id="atras">${icon('atras')}Atrás</button>` : '<span></span>'}
      ${ult ? `<button type="submit" class="btn pri" data-accion="ver">${icon('check')}Guardar préstamo</button>` : `<button type="submit" class="btn pri">Siguiente</button>`}</div>
      ${ult ? `<div class="acciones" style="justify-content:flex-end"><button type="submit" class="btn sm" data-accion="pdf">${icon('pdf')}Guardar y ver PDF</button><button type="submit" class="btn sm" data-accion="correo">${icon('correo')}Guardar y enviar por correo</button></div>` : ''}`;
    actualizarDerivados();
    q('#atras', form)?.addEventListener('click', () => { paso--; pintarPaso(); });
    q('input:not([type=radio]):not([type=date]),select,textarea', form)?.focus({ preventScroll: true });
  }

  form.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'buscarP') { buscarP = t.value; const pos = t.selectionStart; pintarPaso(); const nb = q('#buscarP'); nb.focus(); nb.setSelectionRange(pos, pos); return; }
    if (t.dataset.i !== undefined) p.plan.cuotas[t.dataset.i][t.dataset.k] = t.value;
    else if (t.name) set(t.name, t.value);
    if (t.name === 'adminTipo') q('#admWrap').hidden = t.value === 'ninguno';
    if (t.name === 'planTipo') q('#planDet').innerHTML = detallePlan();
    if ((t.name === 'periodo' || t.name === 'fecha') && q('#fechaPrimeraCuota')) q('#fechaPrimeraCuota').value = p.plan.fechaPrimeraCuota;
    actualizarDerivados();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.per) { p.personaId = b.dataset.per; paso = 1; pintarPaso(); }
    if (b.id === 'nuevaPersona') editarPersona(null, nueva => { p.personaId = nueva.id; paso = 1; pintarPaso(); });
    if (b.id === 'nuevaCuenta') editarCuenta(null, nueva => { p.cuentaId = nueva.id; pintarPaso(); });
    if (b.dataset.del !== undefined) { p.plan.cuotas.splice(+b.dataset.del, 1); q('#planDet').innerHTML = detallePlan(); actualizarDerivados(); }
    if (b.id === 'addCuota') {
      const ult = p.plan.cuotas[p.plan.cuotas.length - 1];
      p.plan.cuotas.push({ fecha: C.addMonths(ult?.fecha || p.fecha, 1), valor: ult?.valor || '' });
      q('#planDet').innerHTML = detallePlan(); actualizarDerivados();
    }
    if (b.id === 'ajustar') {
      if (!cuotasLimpias().length) return toast('Primero agrega al menos una cuota con valor', true);
      p.plan.cuotas = C.ajustarUltimaCuota({ ...p, plan: { ...p.plan, cuotas: cuotasLimpias() } }, dec());
      q('#planDet').innerHTML = detallePlan(); actualizarDerivados(); toast('Última cuota ajustada');
    }
  });
  form.onsubmit = e => {
    e.preventDefault();
    // Validación por paso
    if (paso === 0 && !p.personaId) return toast('Elige a quién le prestas', true);
    if (paso === 1 && !(p.monto > 0)) return toast('Escribe el monto prestado', true);
    if (paso === 1 && !p.fecha) return toast('Indica la fecha del préstamo', true);
    if (paso === 2 && p.admin.tipo !== 'ninguno' && !(p.admin.valor > 0)) return toast('Escribe el valor de la administración o elige "Sin administración"', true);
    if (paso === 3 && p.plan.tipo === 'personalizado' && !cuotasLimpias().length) return toast('Agrega al menos una cuota con fecha y valor', true);
    if (paso === 3 && p.plan.tipo === 'cuotas_iguales' && !p.plan.fechaPrimeraCuota) return toast('Indica la fecha de la primera cuota', true);
    if (paso < PASOS.length - 1) { paso++; pintarPaso(); window.scrollTo(0, 0); return; }
    // Guardar
    if (p.plan.tipo === 'personalizado') p.plan.cuotas = cuotasLimpias();
    const cr = C.generarCronograma(p, dec());
    if (!p.fechaLimite && cr.filas.length) p.fechaLimite = cr.filas[cr.filas.length - 1].fecha;
    if (!p.codigo) p.codigo = siguienteCodigo();
    p.notas = (p.notas || '').trim(); p.prestadoPor = (p.prestadoPor || '').trim();
    const g = S.guardar('prestamos', p);
    toast(existente ? 'Préstamo actualizado' : 'Préstamo guardado');
    const acc = e.submitter?.dataset.accion;
    location.hash = '#/prestamo/' + g.id;
    if (acc === 'pdf') setTimeout(() => verPDF('condiciones', g.id).catch(err => toast(err.message, true)), 60);
    if (acc === 'correo') setTimeout(() => dialogoCorreo(g.id, 'condiciones'), 60);
  };
  pintarPaso();
}

// ---------- DETALLE ----------
let tabDetalle = 'resumen';
function detalle(id) {
  const p = S.obtener('prestamos', id);
  if (!p || p.deleted) { $app.innerHTML = `<div class="panel">${vacio('billetera', 'No encontramos este préstamo.', '<a class="btn" href="#/prestamos">Ver préstamos</a>')}</div>`; return; }
  const per = persona(p.personaId), co = cuenta(p.cuentaId);
  let corte = C.hoyISO();
  const e0 = estadoDe(p);

  $app.innerHTML = `<a class="volver" href="#/prestamos">${icon('atras')}Préstamos</a>
    <section class="ficha">
      <div class="ficha-top">${avatar(per.nombre, 'xl')}<div style="flex:1;min-width:0"><h1>${esc(per.nombre)}</h1><div class="muted">${esc(p.codigo || '')}. Le prestaste ${money(p.monto)} el ${F(p.fecha)}${co ? ', desde ' + esc(co.nombre) : ''}.</div></div></div>
      <div class="debe"><div><div class="muted" id="debeLbl">Debe hoy</div><div class="grande monto" id="debeVal"></div><div id="chipEst" style="margin-top:6px"></div></div><div id="anilloDet"></div></div>
    </section>
    <div class="atajos">
      <button class="atajo pri" id="bAbono"><span class="ic">${icon('dinero')}</span>Registrar abono</button>
      <button class="atajo" id="bPdf"><span class="ic t-lav">${icon('pdf')}</span>Ver PDF</button>
      <button class="atajo" id="bMail"><span class="ic t-cielo">${icon('correo')}</span>Enviar correo</button>
      <button class="atajo" id="bShare"><span class="ic t-menta">${icon('compartir')}</span>Compartir</button>
    </div>
    <div class="tabs" role="tablist">${[['resumen', 'Resumen'], ['plan', 'Plan de pagos'], ['abonos', `Abonos (${e0.movimientos.length})`], ['mas', 'Más']].map(([k, v]) => `<button role="tab" data-tab="${k}" class="${tabDetalle === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div id="tabCont"></div>`;

  const pintar = () => {
    const e = estadoDe(p, corte);
    q('#debeLbl').textContent = corte === C.hoyISO() ? 'Debe hoy' : `Debería el ${F(corte)}`;
    q('#debeVal').textContent = money(e.totalParaSaldar);
    q('#chipEst').innerHTML = chip(e.estado) + (e.saldoFavor > 0 ? ` <span class="chip done">Saldo a favor ${money(e.saldoFavor)}</span>` : '');
    q('#anilloDet').innerHTML = `<div style="text-align:center">${anillo(pctRecuperado(p, e), 88, { grosor: 9 })}<div class="muted" style="font-size:12.5px">recuperado</div></div>`;
    const cont = q('#tabCont');
    if (tabDetalle === 'resumen') {
      cont.innerHTML = `<div class="panel">
        <div class="desglose"><div>Capital pendiente<b>${money(e.capital)}</b></div><div>Interés pendiente<b>${money(e.interesPendiente)}</b></div><div>Administración pendiente<b>${money(e.adminPendiente)}</b></div>
          <div>Total pagado<b>${money(e.pagado)}</b></div><div>Ganancia cobrada<b>${money(e.interesPagado + e.adminPagado)}</b></div>
          ${e.cronograma.filas.length ? `<div>Atraso según plan<b style="color:${e.atraso ? 'var(--rosa-t)' : 'inherit'}">${money(e.atraso)}</b></div>` : ''}</div>
        ${e.proxima ? `<div class="fila" style="margin-top:12px;background:var(--mant);border-radius:16px">${(() => { const d = diaMes(e.proxima.fecha); return `<div class="fecha-chip" style="background:#fff"><b>${d.dia}</b><span>${d.mes}</span></div>`; })()}<div class="cuerpo"><div class="t1">Próxima cuota</div><div class="t2">Cuota ${e.proxima.n} del plan</div></div><div class="lado">${money(e.proxima.pendiente)}</div></div>` : ''}
        <label for="corte">¿Cuánto debería en otra fecha?</label><input type="date" id="corte" value="${corte}" style="max-width:240px">
        <div class="hint">Útil si te pregunta cuánto pagar para saldar en una fecha futura.</div></div>`;
      q('#corte').onchange = ev => { corte = ev.target.value || C.hoyISO(); pintar(); };
    }
    if (tabDetalle === 'plan') {
      const cr = e.cronograma; let acum = 0;
      cont.innerHTML = cr.filas.length ? `<div class="panel"><div class="tabla"><table><thead><tr><th>N°</th><th>Fecha</th><th class="num">Cuota</th><th class="num">Interés</th><th class="num">Admón.</th><th class="num">Capital</th><th>Estado</th></tr></thead><tbody>
        ${cr.filas.map(f => {
          const ini = acum; acum += f.cuota;
          const st = e.pagado >= acum - 0.5 ? ['Pagada', 'st-pagada'] : e.pagado > ini ? ['Parcial', 'st-parcial'] : f.fecha <= corte ? ['Vencida', 'st-vencida'] : ['Pendiente', 'muted'];
          return `<tr><td>${f.n}</td><td class="num" style="text-align:left">${Fc(f.fecha)}</td><td class="num"><b>${money(f.cuota)}</b></td><td class="num">${money(f.interes)}</td><td class="num">${money(f.admin)}</td><td class="num">${money(f.capital)}</td><td class="${st[1]}">${st[0]}</td></tr>`;
        }).join('')}</tbody><tfoot><tr><td></td><td>Total</td><td class="num">${money(cr.totales.cuota)}</td><td class="num">${money(cr.totales.interes)}</td><td class="num">${money(cr.totales.admin)}</td><td class="num">${money(cr.totales.capital)}</td><td></td></tr></tfoot></table></div>
        ${cr.advertencias.map(a => `<div class="alerta">${esc(a)}</div>`).join('')}
        <p class="hint">Si paga en fechas distintas a las del plan, el interés se recalcula con las fechas reales de los abonos.</p></div>`
        : `<div class="panel">${vacio('frasco', `Este préstamo es de abonos libres${p.fechaLimite ? ', con fecha límite el ' + F(p.fechaLimite) : ''}. El interés corre sobre el saldo hasta cada abono.`)}</div>`;
    }
    if (tabDetalle === 'abonos') {
      cont.innerHTML = e.movimientos.length ? `<div class="lista">${[...e.movimientos].reverse().map(m => `<div class="fila"><div class="avatar" style="background:var(--menta);color:var(--menta-t)">${icon('dinero')}</div>
          <div class="cuerpo"><div class="t1">${money(m.valor)}</div><div class="t2">${F(m.fecha)}${cuenta(m.cuenta) ? ', en ' + esc(cuenta(m.cuenta).nombre) : ''}. Capital ${money(m.aCapital)}, interés ${money(m.aInteres)}${m.aAdmin ? ', admón. ' + money(m.aAdmin) : ''}.${m.nota ? ' ' + esc(m.nota) : ''}</div></div>
          <button class="btn sm ghost" data-edab="${m.id}" aria-label="Editar abono">${icon('editar')}</button><button class="btn sm ghost" data-delab="${m.id}" aria-label="Eliminar abono">${icon('borrar')}</button></div>`).join('')}</div>`
        : `<div class="panel">${vacio('frasco', 'Todavía no hay abonos. Cuando te paguen, regístralo aquí.', `<button class="btn pri" id="abVacio">${icon('dinero')}Registrar abono</button>`)}</div>`;
      q('#abVacio')?.addEventListener('click', () => dialogoAbono(p));
    }
    if (tabDetalle === 'mas') {
      const envios = S.listar('envios').filter(x => x.prestamoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      cont.innerHTML = `<div class="panel"><h2 style="margin-top:0">Condiciones</h2><ul style="margin:0;padding-left:20px;color:var(--suave)">${C.explicacion(p, money).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        ${p.fechaLimite ? `<p><b>Fecha límite:</b> ${F(p.fechaLimite)}</p>` : ''}${p.prestadoPor ? `<p><b>Prestado por:</b> ${esc(p.prestadoPor)}</p>` : ''}${p.notas ? `<p><b>Notas:</b> ${esc(p.notas).replace(/\n/g, '<br>')}</p>` : ''}
        <h2>Contacto</h2><div class="fila" style="padding:0">${avatar(per.nombre)}<div class="cuerpo"><div class="t1">${esc(per.nombre)}</div><div class="t2">${esc([per.telefono, per.email].filter(Boolean).join(', ') || 'Sin teléfono ni correo')}</div></div><button class="btn sm" id="editPer">${icon('editar')}Editar</button></div>
        <h2>Correos enviados</h2>${envios.length ? `<div class="lista" style="box-shadow:none;padding:0">${envios.map(x => `<div class="fila"><div class="avatar" style="background:${x.ok ? 'var(--menta)' : 'var(--rosa)'};color:${x.ok ? 'var(--menta-t)' : 'var(--rosa-t)'}">${icon(x.ok ? 'check' : 'alerta')}</div><div class="cuerpo"><div class="t1">${x.tipo === 'estado' ? 'Estado de cuenta' : 'Condiciones'} a ${esc(x.para)}</div><div class="t2">${new Date(x.fecha).toLocaleString(aj().locale)}${x.ok ? (x.desde ? ', enviado desde ' + esc(x.desde) : '') : '. Error: ' + esc(x.error)}</div></div></div>`).join('')}</div>` : '<p class="muted">Aún no has enviado correos de este préstamo.</p>'}
        <div class="acciones"><a class="btn" href="#/editar/${id}">${icon('editar')}Editar préstamo</a><button class="btn" id="bPdfC">${icon('pdf')}PDF de condiciones</button><button class="btn dan" id="bDel">${icon('borrar')}Eliminar</button></div></div>`;
      q('#editPer').onclick = () => editarPersona(per);
      q('#bPdfC').onclick = ev => conBoton(ev.currentTarget, () => verPDF('condiciones', id));
      q('#bDel').onclick = async () => {
        if (!await confirmar(`Se eliminará el préstamo ${p.codigo} de ${per.nombre} con sus abonos, en todos tus dispositivos.`)) return;
        abonosDe(id).forEach(a => S.borrar('abonos', a.id)); S.borrar('prestamos', id);
        toast('Préstamo eliminado'); location.hash = '#/prestamos';
      };
    }
  };
  pintar();
  qa('.tabs button').forEach(b => (b.onclick = () => { tabDetalle = b.dataset.tab; qa('.tabs button').forEach(x => x.classList.toggle('on', x === b)); pintar(); }));
  q('#tabCont').addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.edab) dialogoAbono(p, S.obtener('abonos', b.dataset.edab));
    if (b.dataset.delab && await confirmar('Se eliminará este abono y los saldos se recalcularán.')) { S.borrar('abonos', b.dataset.delab); toast('Abono eliminado'); }
  });
  q('#bAbono').onclick = () => dialogoAbono(p);
  q('#bPdf').onclick = () => modal(`<h2>¿Qué documento quieres ver?</h2><div class="opciones">
      <button class="opcion" data-t="estado"><span class="ic t-cielo">${icon('lista')}</span><span><b>Estado de cuenta</b><small>Saldo, pagos realizados y lo que falta.</small></span></button>
      <button class="opcion" data-t="condiciones"><span class="ic t-lav">${icon('pdf')}</span><span><b>Condiciones del préstamo</b><small>Lo acordado, plan de pagos y firmas.</small></span></button></div>
      <div class="acciones"><button class="btn ghost" data-cerrar>Cancelar</button></div>`,
    (box, cerrar) => qa('[data-t]', box).forEach(b => (b.onclick = () => conBoton(b, async () => { await verPDF(b.dataset.t, id, corte); cerrar(); }))));
  q('#bMail').onclick = () => dialogoCorreo(id, 'estado');
  q('#bShare').onclick = ev => conBoton(ev.currentTarget, () => compartirPDF(id, corte));
}

function dialogoAbono(p, abono = null) {
  const e0 = estadoDe(p);
  const sugerido = abono?.valor ?? (e0.atraso || e0.proxima?.pendiente || '');
  modal(`<h2>${abono ? 'Editar abono' : 'Registrar abono'}</h2><p class="muted" style="margin-top:-6px">${esc(persona(p.personaId).nombre)} debe hoy ${money(e0.totalParaSaldar)}.</p><form id="fab">
    <label for="abValor">¿Cuánto te pagó?</label><input id="abValor" class="monto-grande" type="number" inputmode="decimal" step="any" min="0" name="valor" required value="${esc(sugerido)}">
    <div class="chips-sel" style="margin-top:8px">${e0.proxima ? `<button type="button" class="btn sm" data-v="cuota">Valor de la cuota</button>` : ''}<button type="button" class="btn sm" id="total">Pagó todo (saldar)</button></div>
    <div class="f2"><div><label for="abFecha">Fecha del pago</label><input id="abFecha" type="date" name="fecha" required value="${esc(abono?.fecha || C.hoyISO())}"></div>
    <div><label for="abCuenta">¿Dónde lo recibiste?</label><select id="abCuenta" name="cuentaId"><option value="">Sin especificar</option>${S.listar('cuentas').map(c => `<option value="${c.id}" ${c.id === (abono?.cuentaId || p.cuentaId) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div></div>
    <label for="abNota">Nota <span class="muted">(opcional)</span></label><input id="abNota" name="nota" value="${esc(abono?.nota || '')}" placeholder="Transferencia, efectivo, comprobante…">
    <div id="aplic" class="info"></div>
    <div class="acciones"><button class="btn pri">${icon('check')}${abono ? 'Guardar cambios' : 'Registrar abono'}</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    const f = q('#fab', box);
    const otros = () => abonosDe(p.id).filter(a => a.id !== abono?.id);
    const prev = () => {
      const sim = C.estadoCuenta(p, [...otros(), { id: '_n', fecha: f.fecha.value, valor: num(f.valor.value), creado: '9' }], f.fecha.value, dec());
      const m = sim.movimientos.find(x => x.id === '_n');
      q('#aplic', box).innerHTML = m && m.valor ? `Se aplica así: capital <b>${money(m.aCapital)}</b>, interés <b>${money(m.aInteres)}</b>${m.aAdmin ? `, administración <b>${money(m.aAdmin)}</b>` : ''}.${m.excedente ? ` <b>Sobran ${money(m.excedente)}</b>.` : ''}<br>Después de este pago quedará debiendo <b>${money(sim.totalParaSaldar)}</b>.` : 'Escribe el valor recibido.';
    };
    f.oninput = prev; prev();
    q('#total', box).onclick = () => { f.valor.value = C.estadoCuenta(p, otros(), f.fecha.value, dec()).totalParaSaldar; prev(); };
    q('[data-v=cuota]', box)?.addEventListener('click', () => { f.valor.value = e0.proxima.cuota; prev(); });
    f.onsubmit = ev => {
      ev.preventDefault();
      if (!(num(f.valor.value) > 0)) return toast('Escribe el valor recibido', true);
      S.guardar('abonos', { ...(abono || {}), prestamoId: p.id, fecha: f.fecha.value, valor: num(f.valor.value), cuentaId: f.cuentaId.value, nota: f.nota.value.trim() });
      cerrar(); toast(abono ? 'Abono actualizado' : 'Abono registrado'); render();
    };
  });
}

// ---------- PDF y correo ----------
function ctxPDF(id, corte) {
  const p = S.obtener('prestamos', id);
  return { prestamo: p, persona: persona(p.personaId), cuentaOrigen: cuenta(p.cuentaId), abonos: abonosDe(id), ajustes: aj(), fechaCorte: corte };
}
async function verPDF(tipo, id, corte) {
  const ctx = ctxPDF(id, corte);
  const doc = await generarPDF(tipo, ctx);
  const nombre = nombreArchivo(tipo, ctx.prestamo, ctx.persona);
  const url = URL.createObjectURL(doc.output('blob'));
  const w = window.open(url, '_blank');
  if (!w) doc.save(nombre);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function compartirPDF(id, corte) {
  const ctx = ctxPDF(id, corte);
  const doc = await generarPDF('estado', ctx);
  const file = new File([doc.output('blob')], nombreArchivo('estado', ctx.prestamo, ctx.persona), { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Estado de cuenta ' + ctx.prestamo.codigo });
  else { doc.save(file.name); toast('Este dispositivo no permite compartir: se descargó el PDF'); }
}
function dialogoCorreo(id, tipoInicial = 'estado') {
  const p = S.obtener('prestamos', id), per = persona(p.personaId), a = aj();
  if (!a.mailerUrl) {
    modal(`<div class="vacio">${ilus('sobre')}<h2>Falta configurar el correo</h2><p>Para enviar PDF desde tu cuenta dedicada, configura el servicio en Ajustes (guía, paso 4).</p>
      <div class="acciones" style="justify-content:center"><a class="btn pri" href="#/ajustes" data-cerrar>Ir a Ajustes</a><button class="btn ghost" data-cerrar>Ahora no</button></div></div>`);
    return;
  }
  modal(`<h2>Enviar por correo</h2><form id="fm">
    <div class="opciones" style="grid-template-columns:1fr 1fr">
      <label class="opcion"><input type="radio" name="tipo" value="estado" ${tipoInicial === 'estado' ? 'checked' : ''}><span class="ic t-cielo">${icon('lista')}</span><span><b>Estado de cuenta</b></span></label>
      <label class="opcion"><input type="radio" name="tipo" value="condiciones" ${tipoInicial === 'condiciones' ? 'checked' : ''}><span class="ic t-lav">${icon('pdf')}</span><span><b>Condiciones</b></span></label></div>
    <label for="mTo">Para</label><input id="mTo" type="email" name="to" required value="${esc(per.email || '')}" placeholder="correo@ejemplo.com">
    <label for="mCc">Con copia a <span class="muted">(opcional)</span></label><input id="mCc" name="cc" placeholder="Separa varios correos con coma">
    <label for="mMsg">Mensaje <span class="muted">(opcional)</span></label><textarea id="mMsg" name="mensaje" placeholder="Si lo dejas vacío, se usa un saludo estándar."></textarea>
    <div class="info">Sale desde tu cuenta de servicio con el nombre <b>${esc(a.remitenteNombre)}</b>${a.replyTo ? `; las respuestas llegan a <b>${esc(a.replyTo)}</b>` : ''}. El PDF va adjunto.</div>
    <div class="acciones"><button class="btn pri" id="env">${icon('correo')}Enviar correo</button><button type="button" class="btn" id="prevPdf">${icon('pdf')}Ver PDF</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    const f = q('#fm', box);
    q('#prevPdf', box).onclick = ev => conBoton(ev.currentTarget, () => verPDF(f.tipo.value, id));
    f.onsubmit = ev => {
      ev.preventDefault();
      if (!f.to.checkValidity()) return toast('Revisa el correo del destinatario', true);
      conBoton(q('#env', box), async () => {
        const tipo = f.tipo.value, ctx = ctxPDF(id);
        const doc = await generarPDF(tipo, ctx);
        const filename = nombreArchivo(tipo, ctx.prestamo, ctx.persona);
        const { html, text, asunto } = cuerpoCorreo(tipo, { ...ctx, mensaje: f.mensaje.value.trim() });
        const reg = { prestamoId: id, tipo, para: f.to.value.trim(), cc: f.cc.value.trim(), fecha: new Date().toISOString(), archivo: filename };
        try {
          const r = await enviarCorreo({ to: reg.para, cc: reg.cc, asunto, html, text, pdfBase64: pdfBase64(doc), filename, ref: p.codigo }, aj());
          S.guardar('envios', { ...reg, ok: true, desde: r.enviadoDesde });
          if (!per.email && per.id) S.guardar('personas', { ...per, email: reg.para });
          cerrar();
          modal(`<div class="vacio">${ilus('sobre')}<h2>Correo enviado</h2><p>Le llegó a ${esc(reg.para)} con el PDF adjunto.</p><button class="btn pri" data-cerrar>Listo</button></div>`);
        } catch (err) { S.guardar('envios', { ...reg, ok: false, error: err.message }); throw err; }
      });
    };
  });
}

// ---------- PERSONAS Y CUENTAS ----------
function editarPersona(per, despues) {
  modal(`<h2>${per ? 'Editar persona' : 'Nueva persona'}</h2><form id="fp">
    <label for="pNom">Nombre completo</label><input id="pNom" name="nombre" required value="${esc(per?.nombre || '')}" placeholder="Ej.: María Gómez">
    <div class="f2"><div><label for="pDoc">Documento</label><input id="pDoc" name="documento" value="${esc(per?.documento || '')}"></div><div><label for="pTel">Celular</label><input id="pTel" name="telefono" type="tel" value="${esc(per?.telefono || '')}"></div></div>
    <label for="pMail">Correo</label><input id="pMail" name="email" type="email" value="${esc(per?.email || '')}" placeholder="Para enviarle el PDF">
    <label for="pNot">Dirección o notas</label><textarea id="pNot" name="notas">${esc(per?.notas || '')}</textarea>
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar persona</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    q('#fp', box).onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target)); Object.keys(d).forEach(k => (d[k] = d[k].trim()));
      if (!d.nombre) return toast('Escribe el nombre', true);
      const g = S.guardar('personas', { ...(per || {}), ...d });
      cerrar(); toast('Persona guardada'); despues ? despues(g) : render();
    };
  });
}
function editarCuenta(c, despues) {
  modal(`<h2>${c ? 'Editar cuenta' : 'Nueva cuenta'}</h2><form id="fc">
    <label for="cNom">Nombre de la cuenta</label><input id="cNom" name="nombre" required value="${esc(c?.nombre || '')}" placeholder="Ej.: Ahorros Bancolombia, Nequi, Efectivo">
    <div class="f2"><div><label for="cBan">Banco o entidad</label><input id="cBan" name="banco" value="${esc(c?.banco || '')}"></div><div><label for="cNum">Últimos 4 dígitos</label><input id="cNum" name="numero" inputmode="numeric" value="${esc(c?.numero || '')}" maxlength="6"></div></div>
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar cuenta</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    q('#fc', box).onsubmit = ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target)); Object.keys(d).forEach(k => (d[k] = d[k].trim()));
      if (!d.nombre) return toast('Escribe el nombre de la cuenta', true);
      const g = S.guardar('cuentas', { ...(c || {}), ...d });
      cerrar(); toast('Cuenta guardada'); despues ? despues(g) : render();
    };
  });
}
function personas() {
  const prest = S.listar('prestamos');
  const lista = S.listar('personas').sort((a, b) => a.nombre.localeCompare(b.nombre));
  $app.innerHTML = `<div class="cabecera"><div><h1>Personas</h1><p>A quienes les has prestado.</p></div><button class="btn pri" id="nueva">${icon('mas')}Nueva</button></div>
    <a class="fila panel" href="#/cuentas" style="margin-bottom:14px"><div class="avatar" style="background:var(--cielo);color:var(--cielo-t)">${icon('banco')}</div><div class="cuerpo"><div class="t1">Mis cuentas</div><div class="t2">${S.listar('cuentas').length} cuenta(s) de donde sale y llega el dinero</div></div></a>
    ${lista.length ? `<div class="lista">${lista.map(x => {
      const ps = prest.filter(p => p.personaId === x.id); const saldo = ps.reduce((s, p) => s + estadoDe(p).totalParaSaldar, 0);
      return `<button class="fila" style="width:100%;border:0;background:none;font:inherit;text-align:left;cursor:pointer" data-ed="${x.id}">${avatar(x.nombre)}<div class="cuerpo"><div class="t1">${esc(x.nombre)}</div><div class="t2">${esc([x.telefono, x.email].filter(Boolean).join(', ') || 'Sin datos de contacto')}</div></div>
        <div class="lado">${money(saldo)}<small>${ps.length} préstamo${ps.length === 1 ? '' : 's'}</small></div></button>`;
    }).join('')}</div>` : `<div class="panel">${vacio('gente', 'Aquí aparecerán las personas a quienes les prestas.', `<button class="btn pri" id="nueva2">${icon('mas')}Agregar persona</button>`)}</div>`}`;
  q('#nueva').onclick = () => editarPersona(null);
  q('#nueva2')?.addEventListener('click', () => editarPersona(null));
  $app.onclick = e => {
    const b = e.target.closest('[data-ed]'); if (!b) return;
    const per = S.obtener('personas', b.dataset.ed);
    const ps = prest.filter(p => p.personaId === per.id);
    modal(`<div class="ficha-top">${avatar(per.nombre, 'xl')}<div><h2 style="margin:0">${esc(per.nombre)}</h2><div class="muted">${esc([per.documento, per.telefono, per.email].filter(Boolean).join(', '))}</div></div></div>
      ${ps.length ? `<h2>Préstamos</h2><div class="lista" style="box-shadow:none;padding:0">${ps.map(p => filaPrestamo({ p, e: estadoDe(p) })).join('')}</div>` : '<p class="muted">Sin préstamos.</p>'}
      <div class="acciones"><button class="btn" id="ed">${icon('editar')}Editar datos</button>${ps.length ? '' : `<button class="btn dan" id="del">${icon('borrar')}Eliminar</button>`}<button class="btn ghost" data-cerrar>Cerrar</button></div>`,
    (box, cerrar) => {
      qa('a.fila', box).forEach(a => a.addEventListener('click', cerrar));
      q('#ed', box).onclick = () => { cerrar(); editarPersona(per); };
      q('#del', box)?.addEventListener('click', async () => { cerrar(); if (await confirmar(`Se eliminará a ${per.nombre}.`)) { S.borrar('personas', per.id); render(); } });
    });
  };
}
function cuentas() {
  const prest = S.listar('prestamos');
  const lista = S.listar('cuentas');
  $app.innerHTML = `<a class="volver" href="#/personas">${icon('atras')}Personas</a>
    <div class="cabecera"><div><h1>Mis cuentas</h1><p>De dónde sale el dinero que prestas y dónde recibes los pagos.</p></div><button class="btn pri" id="nueva">${icon('mas')}Nueva</button></div>
    ${lista.length ? `<div class="lista">${lista.map(c => {
      const ps = prest.filter(p => p.cuentaId === c.id);
      return `<div class="fila"><div class="avatar" style="background:var(--cielo);color:var(--cielo-t)">${icon('banco')}</div><div class="cuerpo"><div class="t1">${esc(c.nombre)}</div><div class="t2">${esc([c.banco, c.numero && 'termina en ' + c.numero].filter(Boolean).join(', ') || '—')}</div></div>
        <div class="lado">${money(ps.reduce((s, p) => s + estadoDe(p).capital, 0))}<small>prestado</small></div><button class="btn sm ghost" data-ed="${c.id}" aria-label="Editar">${icon('editar')}</button>${ps.length ? '' : `<button class="btn sm ghost" data-del="${c.id}" aria-label="Eliminar">${icon('borrar')}</button>`}</div>`;
    }).join('')}</div>` : `<div class="panel">${vacio('billetera', 'Agrega tus cuentas: bancos, billeteras digitales o efectivo.')}</div>`}`;
  q('#nueva').onclick = () => editarCuenta(null);
  $app.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ed) editarCuenta(S.obtener('cuentas', b.dataset.ed));
    if (b.dataset.del && await confirmar('Se eliminará esta cuenta.')) { S.borrar('cuentas', b.dataset.del); render(); }
  };
}

// ---------- AJUSTES ----------
function vistaAjustes() {
  const a = aj(), sc = S.syncCfg();
  const sec = (ic, tono, tit, cont) => `<section class="seccion-aj"><div class="t"><span class="avatar" style="background:var(--${tono});color:var(--${tono}-t, var(--lav-osc))">${icon(ic)}</span><b>${tit}</b></div>${cont}</section>`;
  $app.innerHTML = `<div class="cabecera"><div><h1>Ajustes</h1><p>Tus datos, correo, sincronización y respaldos.</p></div></div>
  <form id="fa" data-edit>
    ${sec('persona', 'lav-cl', 'Tus datos', `<p class="muted">Aparecen en los PDF y en los correos.</p>
      <label for="aNom">Tu nombre</label><input id="aNom" name="prestamistaNombre" value="${esc(a.prestamistaNombre)}">
      <div class="f2"><div><label for="aDoc">Documento</label><input id="aDoc" name="prestamistaDoc" value="${esc(a.prestamistaDoc)}"></div><div><label for="aTel">Teléfono</label><input id="aTel" name="prestamistaTel" value="${esc(a.prestamistaTel)}"></div></div>
      <label for="aMail">Correo de contacto en el PDF <span class="muted">(opcional)</span></label><input id="aMail" name="prestamistaEmail" type="email" value="${esc(a.prestamistaEmail)}">
      <div class="f3"><div><label for="aMon">Moneda</label><input id="aMon" name="moneda" value="${esc(a.moneda)}" maxlength="3"></div><div><label for="aLoc">Formato</label><input id="aLoc" name="locale" value="${esc(a.locale)}"></div><div><label for="aDec">Decimales</label><input id="aDec" name="decimales" type="number" min="0" max="2" value="${esc(a.decimales)}"></div></div>
      <label for="aPie">Texto al pie del PDF</label><textarea id="aPie" name="piePdf">${esc(a.piePdf)}</textarea>`)}
    ${sec('correo', 'cielo', 'Correo para enviar los PDF', `<p class="muted">Los correos salen desde la cuenta de Gmail dedicada donde publicaste el servicio (guía, paso 4), no desde tu correo personal.</p>
      <label for="aUrl">Dirección del servicio</label><input id="aUrl" name="mailerUrl" value="${esc(a.mailerUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
      <label for="aTok">Clave secreta (token)</label><input id="aTok" name="mailerToken" type="password" value="${esc(a.mailerToken)}">
      <label for="aRem">Nombre que verá quien recibe</label><input id="aRem" name="remitenteNombre" value="${esc(a.remitenteNombre)}">
      <div class="f2"><div><label for="aRep">Responder a <span class="muted">(opcional)</span></label><input id="aRep" name="replyTo" type="email" value="${esc(a.replyTo)}"></div><div><label for="aBcc">Enviarme copia a <span class="muted">(opcional)</span></label><input id="aBcc" name="copiaOculta" type="email" value="${esc(a.copiaOculta)}"></div></div>
      <div class="acciones"><button type="button" class="btn sm" id="probarMail">${icon('check')}Probar conexión</button></div>`)}
    <div class="acciones" style="margin:0 0 14px"><button class="btn pri">${icon('check')}Guardar ajustes</button></div>
  </form>
  ${sec('nube', 'menta', 'Sincronizar celular y computador', S.syncActiva()
    ? `<p>Conectado como <b>${esc(sc.session?.email || '')}</b>. ${esc(S.syncEstado.msg)}${sc.ultima ? `. Última vez: ${new Date(sc.ultima).toLocaleString(a.locale)}` : ''}</p>
      <div class="acciones"><button class="btn pri" id="syncYa">${icon('nube')}Sincronizar ahora</button><button class="btn dan" id="desc">Desconectar este dispositivo</button></div>`
    : `<p class="muted">Opcional. Si no lo activas, los datos quedan solo en este dispositivo (guía, paso 3).</p><form id="fs">
      <label for="sUrl">Dirección del proyecto Supabase</label><input id="sUrl" name="url" required placeholder="https://xxxx.supabase.co" value="${esc(sc.url || '')}">
      <label for="sKey">Clave pública (anon o publishable)</label><input id="sKey" name="key" required value="${esc(sc.key || '')}">
      <div class="f2"><div><label for="sMail">Tu correo de usuario</label><input id="sMail" name="email" type="email" required></div><div><label for="sPass">Contraseña</label><input id="sPass" name="password" type="password" required></div></div>
      <div class="acciones"><button class="btn pri" id="con">${icon('nube')}Conectar y sincronizar</button></div></form>`)}
  ${sec('respaldo', 'mant', 'Copia de seguridad', `<p class="muted">Descarga una copia de tus datos de vez en cuando. Al importar, se combinan con los actuales; no se borra nada.</p>
    <div class="acciones"><button class="btn" id="exp">${icon('respaldo')}Descargar copia</button><label class="btn" style="margin:0">Importar copia<input type="file" id="imp" accept=".json,application/json" hidden></label></div>`)}
  <p class="muted" style="text-align:center">Versión 1.1. En este dispositivo: ${S.listar('prestamos').length} préstamos y ${S.listar('abonos').length} abonos.</p>`;

  q('#fa').onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach(k => (d[k] = String(d[k]).trim()));
    d.decimales = Math.min(2, Math.max(0, parseInt(d.decimales || 0, 10)));
    d.moneda = (d.moneda || 'COP').toUpperCase();
    try { new Intl.NumberFormat(d.locale, { style: 'currency', currency: d.moneda }); } catch { return toast('Moneda o formato no válido. Ejemplos: COP con es-CO, USD con en-US', true); }
    S.guardarAjustes(d); toast('Ajustes guardados');
  };
  q('#probarMail').onclick = ev => conBoton(ev.currentTarget, async () => {
    const url = q('#aUrl').value.trim(); if (!url) throw new Error('Escribe primero la dirección del servicio');
    const r = await probarServicio({ mailerUrl: url });
    toast(r.ok ? `El servicio responde. Puedes enviar ${r.cuotaRestante} correos más hoy.` : 'El servicio respondió con un error', !r.ok);
  });
  q('#fs')?.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    conBoton(q('#con'), async () => { await S.conectar(d.url, d.key, d.email, d.password); toast('Sincronización activada'); render(); });
  });
  q('#syncYa')?.addEventListener('click', ev => conBoton(ev.currentTarget, async () => { await S.sincronizar(); toast('Sincronizado'); render(); }));
  q('#desc')?.addEventListener('click', async () => { if (await confirmar('Tus datos se quedan en este dispositivo, pero dejará de sincronizar.', 'Desconectar')) { S.desconectar(); render(); } });
  q('#exp').onclick = () => {
    const blob = new Blob([S.exportarJSON()], { type: 'application/json' });
    const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = `respaldo_prestamos_${C.hoyISO()}.json`; a2.click();
  };
  q('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = S.importarJSON(await f.text()); toast(`Se importaron o actualizaron ${n} registros`); render(); } catch (err) { toast(err.message, true); }
  };
}

// ---------- indicador de sincronización ----------
function pintarSync() {
  const b = q('#syncBtn');
  b.hidden = !S.syncActiva();
  b.className = 'sync' + (S.syncEstado.ok === true ? ' ok' : S.syncEstado.ok === false ? ' err' : '');
  b.title = S.syncEstado.msg;
  b.textContent = S.syncEstado.ok === false ? 'Sin sincronizar' : S.syncEstado.ok === null ? 'Sincronizando' : 'Sincronizado';
}
q('#syncBtn').onclick = () => S.sincronizar().then(() => toast('Sincronizado')).catch(e => toast(e.message, true));

// ---------- arranque ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(console.warn);
pintarSync();
render();
