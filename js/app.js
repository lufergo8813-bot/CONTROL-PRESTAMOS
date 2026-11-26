import * as C from './calc.js';
import * as S from './store.js';
import { generarPDF, nombreArchivo, pdfBase64 } from './pdf.js';
import { cuerpoCorreo, enviarCorreo, probarServicio, servicio } from './email.js';
import { icon, ilus, avatar, anillo } from './ui.js';
import {
  $app, esc, q, qa, aj, dec, money, F, Fc, num, diaMes, mesTexto, toast, modal, cerrarModal, confirmar, conBoton, chip, vacio, setRender,
  persona, cuenta, abonosDe, estadoDe, pctRecuperado, esCons, acreedorDe, prestamistas, scoreDe, chipScore, aplicarUsura, usuraVigente, tablaUsura, actualizarUsura,
} from './comun.js';
import { formPrestamo } from './form-prestamo.js';
import { formConsignacion, tablaInventario, dialogoMovimiento } from './consignacion.js';
import { editarPersona, editarCuenta, editarPrestamista } from './editores.js';
import { abrirPagare, pagareDe, chipPagare, verificarPagares } from './pagare-ui.js';
import { vistaInformes } from './informes.js';
import { sincronizarAgenda, programarAgenda, estadoLocal } from './recordatorios.js';

aplicarUsura();

// ---------- navegación ----------
q('#nav').innerHTML = `<div class="logo"><img src="icons/icon.svg" alt="">Mis Préstamos</div>
  <a href="#/" data-r="">${icon('inicio')}<span>Inicio</span></a>
  <a href="#/cartera" data-r="cartera">${icon('lista')}<span>Cartera</span></a>
  <a href="#" data-r="nuevo" class="nav-new" id="navNuevo" aria-label="Registrar">${icon('mas')}<span>Registrar</span></a>
  <a href="#/personas" data-r="personas">${icon('personas')}<span>Personas</span></a>
  <a href="#/informes" data-r="informes" class="solo-escritorio">${icon('calendario')}<span>Informes</span></a>
  <a href="#/mas" data-r="mas">${icon('ajustes')}<span>Más</span></a>`;
q('#navNuevo').onclick = e => { e.preventDefault(); elegirNuevo(); };
function elegirNuevo() {
  modal(`<h2>¿Qué quieres registrar?</h2><div class="opciones">
    <a class="opcion" href="#/nuevo"><span class="ic t-lav">${icon('dinero')}</span><span><b>Préstamo de dinero</b><small>Con interés, cuotas, mora y pagaré.</small></span></a>
    <a class="opcion" href="#/nueva-consignacion"><span class="ic t-durazno">${icon('lista')}</span><span><b>Mercancía en consignación</b><small>Paga lo que vende y devuelve lo que no.</small></span></a></div>
    <div class="acciones"><button class="btn ghost" data-cerrar>Cancelar</button></div>`);
}

const rutas = { '': inicio, cartera, prestamos: cartera, nuevo: () => formPrestamo(), 'nueva-consignacion': () => formConsignacion(), editar: id => (esCons(S.obtener('prestamos', id) || {}) ? formConsignacion(id) : formPrestamo(id)),
  prestamo: detalle, personas, cuentas, ajustes: vistaAjustes, mas, informes: vistaInformes };
function pintar() {
  const [r, id] = location.hash.replace(/^#\/?/, '').split('#')[0].split('/');
  $app.onclick = null;
  const activa = { cuentas: 'mas', ajustes: 'mas', prestamo: 'cartera', prestamos: 'cartera', editar: 'nuevo', 'nueva-consignacion': 'nuevo' }[r] ?? r;
  qa('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === (activa || '')));
  (rutas[r] || inicio)(id ? decodeURIComponent(id) : undefined);
}
setRender(pintar);
window.addEventListener('hashchange', () => { cerrarModal(); pintar(); window.scrollTo(0, 0); });
let renderPend;
S.onChange(() => {
  aplicarUsura(); pintarSync(); programarAgenda();
  clearTimeout(renderPend);
  renderPend = setTimeout(() => { if (!q('[data-edit]') && q('#modal').hidden) pintar(); }, 200);
});

// ---------- INICIO ----------
function filaPrestamo({ p, e }) {
  const per = persona(p.personaId);
  return `<a class="fila" href="#/prestamo/${p.id}">${avatar(per.nombre)}
    <div class="cuerpo"><div class="t1">${esc(per.nombre)}</div><div class="t2">${chip(e.estado)}${esCons(p) ? ' <span class="chip t-durazno">Consignación</span>' : ''}</div></div>
    <div class="lado">${money(e.totalParaSaldar)}<small>${e.estado === 'pagado' ? 'Saldado' : e.moraPendiente ? 'Mora ' + money(e.moraPendiente) : e.atraso ? 'Atraso ' + money(e.atraso) : e.proxima ? 'Próx. ' + Fc(e.proxima.fecha) : p.fechaLimite ? 'Hasta ' + Fc(p.fechaLimite) : 'Por cobrar'}</small></div>
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
  const nombre = (a.prestamistaNombre || '').split(' ')[0];
  const h = new Date().getHours();
  const u = usuraVigente();
  $app.innerHTML = `
    <div class="cabecera"><div><h1>${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? ', ' + esc(nombre) : ''}</h1><p>Así va tu cartera hoy.</p></div></div>
    ${!u.registrada ? `<div class="alerta">No está registrada la tasa de usura de ${esc(mesTexto(u.mes))}. <a href="#/ajustes">Actualízala en Ajustes</a> para calcular bien la mora.</div>` : ''}
    ${!ests.length ? `<div class="panel">${vacio('billetera', 'Aún no has registrado préstamos ni consignaciones. Empieza por el primero.', `<button class="btn pri" id="empezar">${icon('mas')}Registrar</button>`)}
      ${!a.prestamistaNombre && !prestamistas().length ? '<div class="info">Consejo: en <a href="#/ajustes">Ajustes</a> escribe tus datos y quién presta, para que aparezcan en los PDF y pagarés.</div>' : ''}</div>` : `
    <section class="hero">
      <div><small>Te deben hoy</small><div class="grande monto">${money(sum(activos, x => x.e.totalParaSaldar))}</div>
        <div class="det">${activos.length} ${activos.length === 1 ? 'operación activa' : 'operaciones activas'}, capital por recuperar ${money(sum(activos, x => x.e.capital))}</div></div>
      <div class="ilus">${ilus('frasco')}</div>
    </section>
    <div class="mosaico">
      <div class="tile t-menta"><div class="et">${icon('check')}Intereses cobrados</div><div class="val">${money(sum(ests, x => x.e.interesPagado + x.e.adminPagado + x.e.moraPagada))}</div></div>
      <div class="tile t-durazno"><div class="et">${icon('alerta')}Vencido o en mora</div><div class="val">${money(sum(alertas, x => x.e.estado === 'vencido' ? x.e.totalParaSaldar : x.e.atraso + x.e.moraPendiente))}</div></div>
      <div class="tile t-mant"><div class="et">${icon('calendario')}Por cobrar en 30 días</div><div class="val">${money(sum(proximos, x => x.e.proxima.pendiente))}</div></div>
      <a class="tile t-cielo" href="#/informes" style="text-decoration:none"><div class="et">${icon('lista')}Flujo de caja</div><div class="val" style="font-size:16px">Ver informe</div></a>
    </div>
    ${alertas.length ? `<h2>Necesitan tu atención</h2><div class="lista">${alertas.map(filaPrestamo).join('')}</div>` : ''}
    <h2>Próximos cobros</h2>
    ${proximos.length ? `<div class="lista">${proximos.map(({ p, e }) => { const d = diaMes(e.proxima.fecha); return `<a class="fila" href="#/prestamo/${p.id}"><div class="fecha-chip"><b>${d.dia}</b><span>${d.mes}</span></div>
        <div class="cuerpo"><div class="t1">${esc(persona(p.personaId).nombre)}</div><div class="t2">Cuota ${e.proxima.n}${e.cronograma.filas.length ? ' de ' + e.cronograma.filas.length : ''}</div></div><div class="lado">${money(e.proxima.pendiente)}</div></a>`; }).join('')}</div>`
      : '<div class="lista"><div class="fila"><div class="cuerpo t2">No hay cuotas en los próximos 30 días.</div></div></div>'}`}`;
  q('#empezar')?.addEventListener('click', elegirNuevo);
}

// ---------- CARTERA ----------
let filtro = { texto: '', estado: 'activos', clase: 'todas' };
function cartera() {
  const FILTROS = { activos: 'Activos', en_mora: 'En mora', vencido: 'Vencidos', pagado: 'Pagados', todos: 'Todos' };
  const CLASES = { todas: 'Todo', prestamo: 'Préstamos', consignacion: 'Consignaciones' };
  $app.innerHTML = `<div class="cabecera"><div><h1>Cartera</h1><p>Préstamos y consignaciones, activos e historial.</p></div></div>
    <div class="tabs" style="margin-top:0">${Object.entries(CLASES).map(([k, v]) => `<button data-c="${k}" class="${filtro.clase === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="buscar">${icon('buscar')}<input id="buscar" type="search" placeholder="Buscar por nombre, referencia o nota" value="${esc(filtro.texto)}"></div>
    <div class="filtros">${Object.entries(FILTROS).map(([k, v]) => `<button data-f="${k}" class="${filtro.estado === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div id="res"></div>`;
  const pintarLista = () => {
    const t = filtro.texto.toLowerCase();
    const items = S.listar('prestamos').map(p => ({ p, e: estadoDe(p) }))
      .filter(({ p }) => filtro.clase === 'todas' || (p.clase || 'prestamo') === filtro.clase)
      .filter(({ e }) => filtro.estado === 'todos' || (filtro.estado === 'activos' ? e.estado !== 'pagado' : e.estado === filtro.estado))
      .filter(({ p }) => !t || [persona(p.personaId).nombre, p.codigo, p.notas, p.prestadoPor].join(' ').toLowerCase().includes(t))
      .sort((x, y) => y.p.fecha.localeCompare(x.p.fecha));
    q('#res').innerHTML = items.length ? `<div class="lista">${items.map(filaPrestamo).join('')}</div>`
      : `<div class="panel">${vacio('billetera', S.listar('prestamos').length ? 'No hay resultados con este filtro.' : 'Aquí verás tus préstamos y consignaciones.', `<button class="btn pri" id="nuevoV">${icon('mas')}Registrar</button>`)}</div>`;
    q('#nuevoV')?.addEventListener('click', elegirNuevo);
  };
  q('#buscar').oninput = e => { filtro.texto = e.target.value; pintarLista(); };
  qa('.filtros button').forEach(b => (b.onclick = () => { filtro.estado = b.dataset.f; qa('.filtros button').forEach(x => x.classList.toggle('on', x === b)); pintarLista(); }));
  qa('.tabs button').forEach(b => (b.onclick = () => { filtro.clase = b.dataset.c; qa('.tabs button').forEach(x => x.classList.toggle('on', x === b)); pintarLista(); }));
  pintarLista();
}

// ---------- DETALLE ----------
let tabDetalle = 'resumen';
function detalle(id) {
  const p = S.obtener('prestamos', id);
  if (!p || p.deleted) { $app.innerHTML = `<div class="panel">${vacio('billetera', 'No encontramos este registro.', '<a class="btn" href="#/cartera">Ver cartera</a>')}</div>`; return; }
  const per = persona(p.personaId), co = cuenta(p.cuentaId), cons = esCons(p);
  let corte = C.hoyISO();
  const e0 = estadoDe(p), pg = pagareDe(p), sc = scoreDe(p.personaId);
  if (!['resumen', 'plan', 'abonos', 'mas'].includes(tabDetalle)) tabDetalle = 'resumen';

  $app.innerHTML = `<a class="volver" href="#/cartera">${icon('atras')}Cartera</a>
    <section class="ficha">
      <div class="ficha-top">${avatar(per.nombre, 'xl')}<div style="flex:1;min-width:0"><h1>${esc(per.nombre)}</h1>
        <div class="muted">${esc(p.codigo || '')}. ${cons ? `Le entregaste mercancía por ${money(p.monto)} el ${F(p.fecha)}, con plazo hasta el ${F(p.fechaLimite)}.` : `Le prestaste ${money(p.monto)} el ${F(p.fecha)}${co ? ', desde ' + esc(co.nombre) : ''}${p.prestadoPor ? '. Presta: ' + esc(p.prestadoPor) : ''}.`}</div>
        <div class="chips-fila">${chipScore(sc)} ${pg || !cons || p.conPagare ? chipPagare(pg) : ''}</div></div></div>
      <div class="debe"><div><div class="muted" id="debeLbl">Debe hoy</div><div class="grande monto" id="debeVal"></div><div id="chipEst" style="margin-top:6px"></div></div><div id="anilloDet"></div></div>
    </section>
    <div class="atajos">
      ${cons ? `<button class="atajo pri" id="bVenta"><span class="ic">${icon('dinero')}</span>Registrar venta</button><button class="atajo" id="bDev"><span class="ic t-durazno">${icon('atras')}</span>Devolución</button>`
        : `<button class="atajo pri" id="bAbono"><span class="ic">${icon('dinero')}</span>Registrar abono</button><button class="atajo" id="bPagare"><span class="ic t-menta">${icon('editar')}</span>Pagaré</button>`}
      <button class="atajo" id="bPdf"><span class="ic t-lav">${icon('pdf')}</span>Ver PDF</button>
      <button class="atajo" id="bMail"><span class="ic t-cielo">${icon('correo')}</span>Enviar correo</button>
    </div>
    <div class="tabs" role="tablist">${[['resumen', 'Resumen'], ['plan', cons ? 'Mercancía' : 'Plan de pagos'], ['abonos', `${cons ? 'Movimientos' : 'Abonos'} (${e0.movimientos.length})`], ['mas', 'Más']].map(([k, v]) => `<button role="tab" data-tab="${k}" class="${tabDetalle === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div id="tabCont"></div>`;

  const pintarDet = () => {
    const e = estadoDe(p, corte);
    q('#debeLbl').textContent = corte === C.hoyISO() ? 'Debe hoy' : `Debería el ${F(corte)}`;
    q('#debeVal').textContent = money(e.totalParaSaldar);
    q('#chipEst').innerHTML = chip(e.estado) + (e.saldoFavor > 0 ? ` <span class="chip done">Saldo a favor ${money(e.saldoFavor)}</span>` : '');
    q('#anilloDet').innerHTML = `<div style="text-align:center">${anillo(pctRecuperado(p, e), 88, { grosor: 9 })}<div class="muted" style="font-size:12.5px">recuperado</div></div>`;
    const cont = q('#tabCont');
    if (tabDetalle === 'resumen') {
      const u = usuraVigente();
      cont.innerHTML = `<div class="panel">
        <div class="desglose"><div>Capital pendiente<b>${money(e.capital)}</b></div><div>Interés pendiente<b>${money(e.interesPendiente)}</b></div>${p.admin?.tipo && p.admin.tipo !== 'ninguno' ? `<div>Administración pendiente<b>${money(e.adminPendiente)}</b></div>` : ''}
          <div class="${e.moraPendiente ? 'rojo' : ''}">Mora pendiente<b>${money(e.moraPendiente)}</b></div><div>Total pagado<b>${money(e.pagado)}</b></div>${cons ? `<div>Mercancía devuelta<b>${money(e.devuelto)}</b></div>` : ''}<div>Ganancia cobrada<b>${money(e.interesPagado + e.adminPagado + e.moraPagada)}</b></div>
          ${e.cronograma.filas.length ? `<div>Atraso según plan<b style="color:${e.atraso ? 'var(--rosa-t)' : 'inherit'}">${money(e.atraso)}</b></div>` : ''}</div>
        ${e.capitalVencido ? `<div class="alerta">Hay ${money(e.capitalVencido)} de capital en mora. Causa interés a la tasa máxima legal (${u.ea ? u.ea.toLocaleString('es-CO') + '% E.A. este mes' : 'sin tasa registrada'}).</div>` : ''}
        ${e.proxima ? `<div class="fila" style="margin-top:12px;background:var(--mant);border-radius:16px">${(() => { const d = diaMes(e.proxima.fecha); return `<div class="fecha-chip" style="background:#fff"><b>${d.dia}</b><span>${d.mes}</span></div>`; })()}<div class="cuerpo"><div class="t1">Próxima cuota</div><div class="t2">Cuota ${e.proxima.n} del plan</div></div><div class="lado">${money(e.proxima.pendiente)}</div></div>` : ''}
        <label for="corte">¿Cuánto debería en otra fecha?</label><input type="date" id="corte" value="${corte}" style="max-width:240px">
        <div class="hint">Útil si pregunta cuánto pagar para saldar en una fecha. Incluye la mora que se causaría.</div></div>`;
      q('#corte').onchange = ev => { corte = ev.target.value || C.hoyISO(); pintarDet(); };
    }
    if (tabDetalle === 'plan') {
      if (cons) cont.innerHTML = `<div class="panel">${tablaInventario(p, abonosDe(p.id))}<p class="hint">"Vendido" son los productos ya pagados; "En su poder" es lo que aún debe pagar o devolver.</p></div>`;
      else {
        const cr = e.cronograma, cubre = e.pagado - e.moraPagada; let acum = 0;
        cont.innerHTML = cr.filas.length ? `<div class="panel"><div class="tabla"><table><thead><tr><th>N°</th><th>Fecha</th><th class="num">A capital</th><th class="num">A intereses</th><th class="num">Administración</th><th class="num">Cuota</th><th>Estado</th></tr></thead><tbody>
          ${cr.filas.map(f => {
            const ini = acum; acum += f.cuota;
            const st = cubre >= acum - 0.5 ? ['Pagada', 'st-pagada'] : cubre > ini ? ['Parcial', 'st-parcial'] : f.fecha < corte ? ['En mora', 'st-vencida'] : ['Pendiente', 'muted'];
            return `<tr><td>${f.n}</td><td class="num" style="text-align:left">${Fc(f.fecha)}</td><td class="num">${money(f.capital)}</td><td class="num">${money(f.interes)}</td><td class="num">${money(f.admin)}</td><td class="num"><b>${money(f.cuota)}</b></td><td class="${st[1]}">${st[0]}</td></tr>`;
          }).join('')}</tbody><tfoot><tr><td></td><td>Total</td><td class="num">${money(cr.totales.capital)}</td><td class="num">${money(cr.totales.interes)}</td><td class="num">${money(cr.totales.admin)}</td><td class="num">${money(cr.totales.cuota)}</td><td></td></tr></tfoot></table></div>
          ${cr.advertencias.map(x => `<div class="alerta">${esc(x)}</div>`).join('')}
          <p class="hint">Cada cuota muestra cuánto va a capital, a intereses y a administración. La mora por pagos tardíos se suma aparte (ver Resumen).</p></div>`
          : `<div class="panel">${vacio('frasco', `Abonos libres${p.fechaLimite ? ' hasta el ' + F(p.fechaLimite) : ''}. El interés corre sobre el saldo hasta cada abono.`)}</div>`;
      }
    }
    if (tabDetalle === 'abonos') {
      cont.innerHTML = e.movimientos.length ? `<div class="lista">${[...e.movimientos].reverse().map(m => `<div class="fila"><div class="avatar" style="background:${m.tipo === 'devolucion' ? 'var(--durazno)' : 'var(--menta)'};color:${m.tipo === 'devolucion' ? 'var(--durazno-t)' : 'var(--menta-t)'}">${icon(m.tipo === 'devolucion' ? 'atras' : 'dinero')}</div>
          <div class="cuerpo"><div class="t1">${money(m.valor)} ${m.tipo === 'devolucion' ? '<span class="chip t-durazno">Devolución</span>' : ''}</div><div class="t2">${F(m.fecha)}${cuenta(m.cuenta) ? ', en ' + esc(cuenta(m.cuenta).nombre) : ''}. ${m.tipo === 'devolucion' ? 'Reduce la deuda.' : `Capital ${money(m.aCapital)}, interés ${money(m.aInteres)}${m.aAdmin ? ', admón. ' + money(m.aAdmin) : ''}${m.aMora ? ', mora ' + money(m.aMora) : ''}.`}${m.nota ? ' ' + esc(m.nota) : ''}</div></div>
          <button class="btn sm ghost" data-edab="${m.id}" aria-label="Editar">${icon('editar')}</button><button class="btn sm ghost" data-delab="${m.id}" aria-label="Eliminar">${icon('borrar')}</button></div>`).join('')}</div>`
        : `<div class="panel">${vacio('frasco', cons ? 'Aún no hay ventas ni devoluciones registradas.' : 'Todavía no hay abonos. Cuando te paguen, regístralo aquí con la fecha real del pago.')}</div>`;
    }
    if (tabDetalle === 'mas') {
      const envios = S.listar('envios').filter(x => x.prestamoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      cont.innerHTML = `<div class="panel"><h2 style="margin-top:0">Condiciones</h2><ul style="margin:0;padding-left:20px;color:var(--suave)">${C.explicacion(p, money).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        ${p.cuentaDeudor?.numero ? `<p><b>Cuenta del deudor:</b> ${esc([p.cuentaDeudor.tipo, p.cuentaDeudor.numero, p.cuentaDeudor.banco].filter(Boolean).join(' · '))}</p>` : ''}
        ${p.fechaLimite ? `<p><b>Fecha límite:</b> ${F(p.fechaLimite)}</p>` : ''}${p.notas ? `<p><b>Notas:</b> ${esc(p.notas).replace(/\n/g, '<br>')}</p>` : ''}
        <p><b>Recordatorios:</b> ${p.recordatorio?.activo === false ? 'desactivados' : per.email ? (cons ? { antes: `${p.recordatorio?.dias ?? 3} días antes de la fecha límite`, cada: `cada ${p.recordatorio?.cadaDias} días`, fechas: `en ${p.recordatorio?.fechas?.length || 0} fecha(s) elegidas` }[p.recordatorio?.modo || 'antes'] : `${p.recordatorio?.dias ?? aj().diasRecordatorio ?? 3} días antes de cada pago`) + ', a ' + esc(per.email) : 'la persona no tiene correo'}</p>
        <h2>Score de ${esc(per.nombre.split(' ')[0])}</h2>${detalleScore(sc)}
        <h2>Correos enviados</h2>${envios.length ? `<div class="lista" style="box-shadow:none;padding:0">${envios.map(x => `<div class="fila"><div class="avatar" style="background:${x.ok ? 'var(--menta)' : 'var(--rosa)'};color:${x.ok ? 'var(--menta-t)' : 'var(--rosa-t)'}">${icon(x.ok ? 'check' : 'alerta')}</div><div class="cuerpo"><div class="t1">${{ estado: 'Estado de cuenta', condiciones: 'Condiciones', pagare: 'Pagaré' }[x.tipo] || x.tipo} a ${esc(x.para)}</div><div class="t2">${new Date(x.fecha).toLocaleString(aj().locale)}${x.ok ? (x.desde ? ', desde ' + esc(x.desde) : '') : '. Error: ' + esc(x.error)}</div></div></div>`).join('')}</div>` : '<p class="muted">Aún no has enviado correos.</p>'}
        <div class="acciones">${cons ? `<button class="btn" id="bPagare2">${icon('editar')}Pagaré</button>` : ''}<a class="btn" href="#/editar/${id}">${icon('editar')}Editar</a><button class="btn" id="editPer">${icon('persona')}Datos de la persona</button><button class="btn dan" id="bDel">${icon('borrar')}Eliminar</button></div></div>`;
      q('#editPer').onclick = () => editarPersona(per);
      q('#bPagare2')?.addEventListener('click', () => abrirPagare(p));
      q('#bDel').onclick = async () => {
        if (!await confirmar(`Se eliminará ${p.codigo} de ${per.nombre} con sus movimientos, en todos tus dispositivos.`)) return;
        abonosDe(id).forEach(a => S.borrar('abonos', a.id)); S.borrar('prestamos', id);
        toast('Eliminado'); location.hash = '#/cartera';
      };
    }
  };
  pintarDet();
  qa('.tabs button').forEach(b => (b.onclick = () => { tabDetalle = b.dataset.tab; qa('.tabs button').forEach(x => x.classList.toggle('on', x === b)); pintarDet(); }));
  q('#tabCont').addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.edab) { const m = S.obtener('abonos', b.dataset.edab); cons && m.detalle ? dialogoMovimiento(p, m.tipo || 'pago', m) : dialogoAbono(p, m); }
    if (b.dataset.delab && await confirmar('Se eliminará este movimiento y los saldos se recalcularán.')) { S.borrar('abonos', b.dataset.delab); toast('Eliminado'); }
  });
  q('#bAbono')?.addEventListener('click', () => dialogoAbono(p));
  q('#bVenta')?.addEventListener('click', () => dialogoMovimiento(p, 'pago'));
  q('#bDev')?.addEventListener('click', () => dialogoMovimiento(p, 'devolucion'));
  q('#bPagare')?.addEventListener('click', () => abrirPagare(p));
  q('#bPdf').onclick = () => modal(`<h2>¿Qué documento quieres?</h2><div class="opciones">
      <button class="opcion" data-t="estado"><span class="ic t-cielo">${icon('lista')}</span><span><b>Estado de cuenta</b><small>Saldo, mora, pagos realizados y lo que falta.</small></span></button>
      <button class="opcion" data-t="condiciones"><span class="ic t-lav">${icon('pdf')}</span><span><b>Condiciones</b><small>Lo acordado, plan de pagos, advertencia de mora y firmas.</small></span></button>
      ${!cons || p.conPagare || pg ? `<button class="opcion" data-t="pagare"><span class="ic t-menta">${icon('editar')}</span><span><b>Pagaré</b><small>Firmar, enviar o descargar.</small></span></button>` : ''}
      ${navigator.share ? `<button class="opcion" data-t="compartir"><span class="ic t-mant">${icon('compartir')}</span><span><b>Compartir estado de cuenta</b><small>Por WhatsApp u otra app.</small></span></button>` : ''}</div>
      <div class="acciones"><button class="btn ghost" data-cerrar>Cancelar</button></div>`,
    (box, cerrar) => qa('[data-t]', box).forEach(b => (b.onclick = () => {
      if (b.dataset.t === 'pagare') return abrirPagare(p);
      if (b.dataset.t === 'compartir') return conBoton(b, () => compartirPDF(id, corte));
      conBoton(b, async () => { await verPDF(b.dataset.t, id, corte); cerrar(); });
    })));
  q('#bMail').onclick = () => dialogoCorreo(id, 'estado');
  if (pg?.estado === 'enviado') verificarPagares().then(n => n && pintar()).catch(() => {});
}

function detalleScore(s) {
  if (s.puntaje == null) return '<p class="muted">Aún no tiene pagos vencidos para calificar. El score se calcula a medida que pasan las fechas de pago.</p>';
  return `<div class="score-caja"><div class="score-num nivel-${s.nivel}">${s.puntaje}<small>/100</small></div><div>
    <b>${esc(s.etiqueta)}</b><div class="muted">${s.aTiempo} de ${s.vencidas} pagos a tiempo · atraso promedio ${s.promedioDias} días · máximo ${s.maxDias} días${s.vencidasHoy ? ` · ${s.vencidasHoy} cuota(s) vencida(s) hoy` : ''} · ${s.pagados} operación(es) saldada(s)</div></div></div>`;
}

function dialogoAbono(p, abono = null) {
  const e0 = estadoDe(p);
  const sugerido = abono?.valor ?? (e0.atraso ? e0.atraso + e0.moraPendiente : e0.proxima?.pendiente || '');
  modal(`<h2>${abono ? 'Editar abono' : 'Registrar abono'}</h2><p class="muted" style="margin-top:-6px">${esc(persona(p.personaId).nombre)} debe hoy ${money(e0.totalParaSaldar)}${e0.moraPendiente ? `, de los cuales ${money(e0.moraPendiente)} son mora` : ''}.</p><form id="fab">
    <label for="abValor">¿Cuánto te pagó?</label><input id="abValor" class="monto-grande" type="number" inputmode="decimal" step="any" min="0" name="valor" required value="${esc(sugerido)}">
    <div class="chips-sel" style="margin-top:8px">${e0.proxima ? '<button type="button" class="btn sm" data-v="cuota">Valor de la cuota</button>' : ''}<button type="button" class="btn sm" id="total">Pagó todo (saldar)</button></div>
    <div class="f2"><div><label for="abFecha">Fecha en que te pagó</label><input id="abFecha" type="date" name="fecha" required value="${esc(abono?.fecha || C.hoyISO())}"><div class="hint">Pon la fecha real del pago: la mora se calcula hasta ese día.</div></div>
    <div><label for="abCuenta">¿Dónde lo recibiste?</label><select id="abCuenta" name="cuentaId"><option value="">Sin especificar</option>${S.listar('cuentas').map(c => `<option value="${c.id}" ${c.id === (abono?.cuentaId || p.cuentaId) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div></div>
    <label for="abNota">Nota <span class="muted">(opcional)</span></label><input id="abNota" name="nota" value="${esc(abono?.nota || '')}" placeholder="Transferencia, efectivo, comprobante…">
    <div id="aplic" class="info"></div>
    <div class="acciones"><button class="btn pri">${icon('check')}${abono ? 'Guardar cambios' : 'Registrar abono'}</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    const f = q('#fab', box);
    const otros = () => abonosDe(p.id).filter(a => a.id !== abono?.id);
    const prev = () => {
      const sim = C.estadoCuenta(p, [...otros(), { id: '_n', fecha: f.fecha.value, valor: num(f.valor.value), creado: '9' }], f.fecha.value, dec());
      const m = sim.movimientos.find(x => x.id === '_n');
      q('#aplic', box).innerHTML = m && m.valor ? `Se aplica así: ${m.aMora ? `mora <b>${money(m.aMora)}</b>, ` : ''}${m.aAdmin ? `administración <b>${money(m.aAdmin)}</b>, ` : ''}interés <b>${money(m.aInteres)}</b>, capital <b>${money(m.aCapital)}</b>.${m.excedente ? ` <b>Sobran ${money(m.excedente)}</b>.` : ''}<br>Después de este pago quedará debiendo <b>${money(sim.totalParaSaldar)}</b>.` : 'Escribe el valor recibido.';
    };
    f.oninput = prev; prev();
    q('#total', box).onclick = () => { f.valor.value = C.estadoCuenta(p, otros(), f.fecha.value, dec()).totalParaSaldar; prev(); };
    q('[data-v=cuota]', box)?.addEventListener('click', () => { f.valor.value = e0.proxima.cuota; prev(); });
    f.onsubmit = ev => {
      ev.preventDefault();
      if (!(num(f.valor.value) > 0)) return toast('Escribe el valor recibido', true);
      if (f.fecha.value > C.hoyISO()) return toast('La fecha del pago no puede ser futura', true);
      S.guardar('abonos', { ...(abono || {}), prestamoId: p.id, tipo: 'pago', fecha: f.fecha.value, valor: num(f.valor.value), cuentaId: f.cuentaId.value, nota: f.nota.value.trim() });
      cerrar(); toast(abono ? 'Abono actualizado' : 'Abono registrado'); pintar();
    };
  });
}

// ---------- PDF y correo ----------
function ctxPDF(id, corte) {
  const p = S.obtener('prestamos', id);
  return { prestamo: p, persona: persona(p.personaId), acreedor: acreedorDe(p), cuentaOrigen: cuenta(p.cuentaId), abonos: abonosDe(id), ajustes: aj(), fechaCorte: corte };
}
async function verPDF(tipo, id, corte) {
  const ctx = ctxPDF(id, corte);
  const doc = await generarPDF(tipo, ctx);
  const url = URL.createObjectURL(doc.output('blob'));
  if (!window.open(url, '_blank')) doc.save(nombreArchivo(tipo, ctx.prestamo, ctx.persona));
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
    modal(`<div class="vacio">${ilus('sobre')}<h2>Falta configurar el correo</h2><p>Configura el servicio de correo en Ajustes (guía, paso 4).</p><div class="acciones" style="justify-content:center"><a class="btn pri" href="#/ajustes">Ir a Ajustes</a><button class="btn ghost" data-cerrar>Ahora no</button></div></div>`);
    return;
  }
  modal(`<h2>Enviar por correo</h2><form id="fm">
    <div class="opciones" style="grid-template-columns:1fr 1fr">
      <label class="opcion"><input type="radio" name="tipo" value="estado" ${tipoInicial === 'estado' ? 'checked' : ''}><span class="ic t-cielo">${icon('lista')}</span><span><b>Estado de cuenta</b></span></label>
      <label class="opcion"><input type="radio" name="tipo" value="condiciones" ${tipoInicial === 'condiciones' ? 'checked' : ''}><span class="ic t-lav">${icon('pdf')}</span><span><b>Condiciones</b></span></label></div>
    <label for="mTo">Para</label><input id="mTo" type="email" name="to" required value="${esc(per.email || '')}" placeholder="correo@ejemplo.com">
    <label for="mCc">Con copia a <span class="muted">(opcional)</span></label><input id="mCc" name="cc" placeholder="Separa varios correos con coma">
    <label for="mMsg">Mensaje <span class="muted">(opcional)</span></label><textarea id="mMsg" name="mensaje" placeholder="Si lo dejas vacío, se usa un saludo estándar."></textarea>
    <div class="info">Sale desde tu cuenta de servicio con el nombre <b>${esc(a.remitenteNombre)}</b>. Las condiciones incluyen la advertencia de mora. Para el pagaré usa el botón Pagaré.</div>
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

// ---------- PERSONAS ----------
function personas() {
  const prest = S.listar('prestamos');
  const lista = S.listar('personas').sort((a, b) => a.nombre.localeCompare(b.nombre)).map(x => ({ x, s: scoreDe(x.id), ps: prest.filter(p => p.personaId === x.id) }));
  $app.innerHTML = `<div class="cabecera"><div><h1>Personas</h1><p>Con su score de cumplimiento.</p></div><button class="btn pri" id="nueva">${icon('mas')}Nueva</button></div>
    ${lista.length ? `<div class="lista">${lista.map(({ x, s, ps }) => {
      const saldo = ps.reduce((t, p) => t + estadoDe(p).totalParaSaldar, 0);
      return `<button class="fila fila-btn" data-ed="${x.id}">${avatar(x.nombre)}<div class="cuerpo"><div class="t1">${esc(x.nombre)}</div><div class="t2">${chipScore(s)}</div></div>
        <div class="lado">${money(saldo)}<small>${ps.length} ${ps.length === 1 ? 'operación' : 'operaciones'}</small></div></button>`;
    }).join('')}</div>` : `<div class="panel">${vacio('gente', 'Aquí aparecerán las personas a quienes les prestas o entregas mercancía.', `<button class="btn pri" id="nueva2">${icon('mas')}Agregar persona</button>`)}</div>`}
    <p class="hint">El score (0 a 100) mide la puntualidad: pagos a tiempo, días de atraso, cuotas vencidas hoy y operaciones saldadas. A: excelente, B: bueno, C: regular, D: en riesgo.</p>`;
  q('#nueva').onclick = () => editarPersona(null);
  q('#nueva2')?.addEventListener('click', () => editarPersona(null));
  $app.onclick = e => {
    const b = e.target.closest('[data-ed]'); if (!b) return;
    const { x: per, s, ps } = lista.find(l => l.x.id === b.dataset.ed);
    modal(`<div class="ficha-top">${avatar(per.nombre, 'xl')}<div><h2 style="margin:0">${esc(per.nombre)}</h2><div class="muted">${esc([per.tipoDoc && per.documento ? per.tipoDoc + ' ' + per.documento : per.documento, per.telefono, per.email].filter(Boolean).join(' · '))}</div></div></div>
      <h2>Score</h2>${detalleScore(s)}
      ${ps.length ? `<h2>Operaciones</h2><div class="lista" style="box-shadow:none;padding:0">${ps.map(p => filaPrestamo({ p, e: estadoDe(p) })).join('')}</div>` : '<p class="muted">Sin operaciones.</p>'}
      <div class="acciones"><button class="btn" id="ed">${icon('editar')}Editar datos</button>${ps.length ? '' : `<button class="btn dan" id="del">${icon('borrar')}Eliminar</button>`}<button class="btn ghost" data-cerrar>Cerrar</button></div>`,
    (box, cerrar) => {
      q('#ed', box).onclick = () => { cerrar(); editarPersona(per); };
      q('#del', box)?.addEventListener('click', async () => { cerrar(); if (await confirmar(`Se eliminará a ${per.nombre}.`)) { S.borrar('personas', per.id); pintar(); } });
    });
  };
}

function cuentas() {
  const prest = S.listar('prestamos'), lista = S.listar('cuentas');
  $app.innerHTML = `<a class="volver" href="#/mas">${icon('atras')}Más</a>
    <div class="cabecera"><div><h1>Mis cuentas</h1><p>De dónde sale el dinero y dónde recibes los pagos.</p></div><button class="btn pri" id="nueva">${icon('mas')}Nueva</button></div>
    ${lista.length ? `<div class="lista">${lista.map(c => {
      const ps = prest.filter(p => p.cuentaId === c.id);
      return `<div class="fila"><div class="avatar" style="background:var(--cielo);color:var(--cielo-t)">${icon('banco')}</div><div class="cuerpo"><div class="t1">${esc(c.nombre)}</div><div class="t2">${esc([c.banco, c.numero && 'termina en ' + c.numero].filter(Boolean).join(', ') || '-')}</div></div>
        <div class="lado">${money(ps.reduce((s, p) => s + estadoDe(p).capital, 0))}<small>prestado</small></div><button class="btn sm ghost" data-ed="${c.id}" aria-label="Editar">${icon('editar')}</button>${ps.length ? '' : `<button class="btn sm ghost" data-del="${c.id}" aria-label="Eliminar">${icon('borrar')}</button>`}</div>`;
    }).join('')}</div>` : `<div class="panel">${vacio('billetera', 'Agrega tus cuentas: bancos, billeteras digitales o efectivo.')}</div>`}`;
  q('#nueva').onclick = () => editarCuenta(null);
  $app.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ed) editarCuenta(S.obtener('cuentas', b.dataset.ed));
    if (b.dataset.del && await confirmar('Se eliminará esta cuenta.')) { S.borrar('cuentas', b.dataset.del); pintar(); }
  };
}

function mas() {
  const tiles = [['#/informes', 'calendario', 't-cielo', 'Informes', 'Flujo de caja y personas en mora'], ['#/ajustes', 'ajustes', 't-lav', 'Ajustes', 'Tus datos, quién presta, tasa de usura, correo'], ['#/cuentas', 'banco', 't-menta', 'Mis cuentas', 'Bancos, billeteras y efectivo'], ['#/ajustes#recordatorios', 'correo', 't-mant', 'Recordatorios', 'Envío automático antes de cada pago']];
  $app.innerHTML = `<div class="cabecera"><div><h1>Más</h1></div></div><div class="opciones">${tiles.map(([h, ic, t, ti, de]) => `<a class="opcion" href="${h}"><span class="ic ${t}">${icon(ic)}</span><span><b>${ti}</b><small>${de}</small></span></a>`).join('')}</div>`;
}

// ---------- AJUSTES ----------
function vistaAjustes() {
  const a = aj(), sc = S.syncCfg(), u = usuraVigente(), tabla = tablaUsura(), ag = estadoLocal();
  const sec = (ic, tono, tit, cont, id = '') => `<section class="seccion-aj" ${id ? `id="${id}"` : ''}><div class="t"><span class="avatar" style="background:var(--${tono});color:var(--${tono}-t, var(--lav-osc))">${icon(ic)}</span><b>${tit}</b></div>${cont}</section>`;
  $app.innerHTML = `<a class="volver" href="#/mas">${icon('atras')}Más</a><div class="cabecera"><div><h1>Ajustes</h1><p>Tus datos, quién presta, tasa máxima, correo, recordatorios y respaldos.</p></div></div>
  <form id="fa" data-edit>
    ${sec('persona', 'lav-cl', 'Tus datos', `<p class="muted">Encabezado de los PDF y firma de los correos.</p>
      <label for="aNom">Tu nombre</label><input id="aNom" name="prestamistaNombre" value="${esc(a.prestamistaNombre)}">
      <div class="f3"><div><label for="aDoc">Documento</label><input id="aDoc" name="prestamistaDoc" value="${esc(a.prestamistaDoc)}"></div><div><label for="aTel">Teléfono</label><input id="aTel" name="prestamistaTel" value="${esc(a.prestamistaTel)}"></div><div><label for="aCiu">Ciudad</label><input id="aCiu" name="ciudad" value="${esc(a.ciudad)}" placeholder="Para el pagaré"></div></div>
      <label for="aMail">Correo de contacto en el PDF <span class="muted">(opcional)</span></label><input id="aMail" name="prestamistaEmail" type="email" value="${esc(a.prestamistaEmail)}">
      <div class="f3"><div><label for="aMon">Moneda</label><input id="aMon" name="moneda" value="${esc(a.moneda)}" maxlength="3"></div><div><label for="aLoc">Formato</label><input id="aLoc" name="locale" value="${esc(a.locale)}"></div><div><label for="aDec">Decimales</label><input id="aDec" name="decimales" type="number" min="0" max="2" value="${esc(a.decimales)}"></div></div>
      <label for="aPie">Texto al pie del PDF</label><textarea id="aPie" name="piePdf">${esc(a.piePdf)}</textarea>`)}
    ${sec('correo', 'cielo', 'Correo para enviar los PDF', `<p class="muted">Los correos salen desde la cuenta de Gmail dedicada donde publicaste el servicio.</p>
      <label for="aUrl">Dirección del servicio</label><input id="aUrl" name="mailerUrl" value="${esc(a.mailerUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
      <label for="aTok">Clave secreta (token)</label><input id="aTok" name="mailerToken" type="password" value="${esc(a.mailerToken)}">
      <div class="f2"><div><label for="aRem">Nombre que verá quien recibe</label><input id="aRem" name="remitenteNombre" value="${esc(a.remitenteNombre)}"></div><div><label for="aInf">Tu correo para informes y copias de pagarés</label><input id="aInf" name="correoInformes" type="email" value="${esc(a.correoInformes)}"></div></div>
      <div class="f2"><div><label for="aRep">Responder a <span class="muted">(opcional)</span></label><input id="aRep" name="replyTo" type="email" value="${esc(a.replyTo)}"></div><div><label for="aBcc">Copia oculta de todo <span class="muted">(opcional)</span></label><input id="aBcc" name="copiaOculta" type="email" value="${esc(a.copiaOculta)}"></div></div>
      <div class="acciones"><button type="button" class="btn sm" id="probarMail">${icon('check')}Probar conexión</button></div>`)}
    ${sec('calendario', 'mant', 'Recordatorios automáticos', `<p class="muted">Cada mañana el servicio envía los recordatorios del día, aunque tu celular esté apagado. La app le envía la agenda cada vez que cambian los datos.</p>
      <label class="check"><input type="checkbox" name="recordatoriosActivos" ${a.recordatoriosActivos ? 'checked' : ''}> Enviar recordatorios de pago</label>
      <div class="f2"><div><label for="aDias">Días antes del pago (por defecto)</label><input id="aDias" name="diasRecordatorio" type="number" min="0" max="30" value="${esc(a.diasRecordatorio ?? 3)}"></div></div>
      <label for="aMsgR">Mensaje adicional en los recordatorios de préstamos <span class="muted">(opcional)</span></label><textarea id="aMsgR" name="mensajeRecordatorio" placeholder="Ej.: Puedes pagar por transferencia a Bancolombia ahorros 123…">${esc(a.mensajeRecordatorio)}</textarea>
      <div class="info" id="agendaInfo">${ag.enviada ? `Agenda enviada el ${new Date(ag.enviada).toLocaleString(a.locale)}: ${ag.programados} recordatorio(s) programado(s).${ag.proximos?.length ? '<br>Próximos: ' + ag.proximos.map(x => `${F(x.enviarEn)} a ${esc(x.to)}`).join('; ') : ''}` : 'La agenda aún no se ha enviado.'}</div>
      <div class="acciones"><button type="button" class="btn sm" id="agendaYa">${icon('correo')}Enviar agenda ahora</button><button type="button" class="btn sm" id="agendaEst">Ver estado en el servicio</button></div>`, 'recordatorios')}
    <div class="acciones" style="margin:0 0 14px"><button class="btn pri">${icon('check')}Guardar ajustes</button></div>
  </form>
  ${sec('personas', 'menta', 'Quién presta', `<p class="muted">Estas opciones aparecen en la lista "Presta" al registrar un préstamo y como acreedor en el pagaré.</p>
    ${prestamistas().length ? `<div class="lista" style="box-shadow:none;padding:0">${prestamistas().map(x => `<div class="fila">${avatar(x.nombre)}<div class="cuerpo"><div class="t1">${esc(x.nombre)}</div><div class="t2">${esc([x.tipoDoc && x.documento ? x.tipoDoc + ' ' + x.documento : '', x.ciudad].filter(Boolean).join(' · ') || 'Completa documento y ciudad para el pagaré')}</div></div><button class="btn sm ghost" data-edp="${x.id}" aria-label="Editar">${icon('editar')}</button><button class="btn sm ghost" data-delp="${x.id}" aria-label="Eliminar">${icon('borrar')}</button></div>`).join('')}</div>` : '<p class="muted">Aún no hay. Agrega al menos uno (por ejemplo, tú).</p>'}
    <div class="acciones"><button class="btn sm" id="addPrest">${icon('mas')}Agregar quién presta</button></div>`, 'prestamistas')}
  ${sec('porcentaje', 'rosa', 'Tasa máxima legal (usura)', `<p class="muted">Se usa para la mora y para avisarte si una tasa supera el límite. Fuente: Superintendencia Financiera (crédito de consumo y ordinario).</p>
    <div class="usura ${u.registrada ? '' : 'excede'}"><div>${icon('porcentaje')}</div><div class="cuerpo"><b>${esc(mesTexto(u.mes))}: ${u.registrada ? u.ea.toLocaleString('es-CO') + '% E.A.' : 'no registrada (se usa ' + (u.ea ? u.ea.toLocaleString('es-CO') + '%' : 'ninguna') + ')'}</b><span>${a.usuraLeida ? 'Última lectura automática: ' + new Date(a.usuraLeida).toLocaleString(a.locale) : 'Pulsa Actualizar con internet para leerla de la Superfinanciera.'}</span></div><button type="button" class="btn sm" id="actUsura">Actualizar</button></div>
    <div class="tabla" style="margin-top:10px;max-height:220px"><table><thead><tr><th>Mes</th><th class="num">Usura E.A.</th><th class="num">Mensual</th></tr></thead><tbody>${Object.keys(tabla).sort().reverse().map(k => `<tr><td>${esc(mesTexto(k))}</td><td class="num">${tabla[k]}%</td><td class="num">${C.eaAMensual(tabla[k]).toFixed(2)}%</td></tr>`).join('')}</tbody></table></div>
    <form id="fu" class="f3" style="align-items:end"><div><label for="uMes">Mes</label><input id="uMes" type="month" value="${u.mes}" required></div><div><label for="uVal">% E.A.</label><input id="uVal" type="number" step="0.01" min="1" max="100" required></div><div><button class="btn sm" style="margin-bottom:4px">Guardar a mano</button></div></form>`, 'usura')}
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
  <p class="muted" style="text-align:center">Versión 2.0. En este dispositivo: ${S.listar('prestamos').length} operaciones y ${S.listar('abonos').length} movimientos.</p>`;

  if (location.hash.includes('#recordatorios')) setTimeout(() => q('#recordatorios')?.scrollIntoView(), 50);
  q('#fa').onsubmit = e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach(k => (d[k] = String(d[k]).trim()));
    d.decimales = Math.min(2, Math.max(0, parseInt(d.decimales || 0, 10)));
    d.diasRecordatorio = Math.max(0, parseInt(d.diasRecordatorio || 3, 10));
    d.recordatoriosActivos = !!e.target.recordatoriosActivos.checked;
    d.moneda = (d.moneda || 'COP').toUpperCase();
    try { new Intl.NumberFormat(d.locale, { style: 'currency', currency: d.moneda }); } catch { return toast('Moneda o formato no válido. Ejemplos: COP con es-CO, USD con en-US', true); }
    S.guardarAjustes({ ...aj(), ...d }); toast('Ajustes guardados');
  };
  q('#probarMail').onclick = ev => conBoton(ev.currentTarget, async () => {
    const url = q('#aUrl').value.trim(); if (!url) throw new Error('Escribe primero la dirección del servicio');
    const r = await probarServicio({ mailerUrl: url });
    toast(r.ok ? `El servicio responde${r.version >= 2 ? '' : ' (versión antigua: actualiza el código, guía paso 6)'}. Correos disponibles hoy: ${r.cuotaRestante}.` : 'El servicio respondió con un error', !r.ok);
  });
  q('#agendaYa').onclick = ev => conBoton(ev.currentTarget, async () => { const r = await sincronizarAgenda({ forzar: true }); if (!r) throw new Error('Activa los recordatorios y configura el correo primero.'); toast(`Agenda enviada: ${r.programados} recordatorio(s)`); pintar(); });
  q('#agendaEst').onclick = ev => conBoton(ev.currentTarget, async () => {
    const r = await servicio('agenda_estado', {}, aj());
    modal(`<h2>Recordatorios en el servicio</h2><p>${r.disparador ? '✔ Envío diario programado.' : '⚠ Falta programar el envío diario: en Apps Script ejecuta la función <b>instalarRecordatorios</b> (guía, paso 6).'}</p>
      <p>Pendientes por enviar: <b>${r.pendientes}</b>. Agenda actualizada: ${r.actualizada ? new Date(r.actualizada).toLocaleString(aj().locale) : 'nunca'}.</p>
      ${r.ultimos?.length ? `<h3>Últimos enviados</h3><ul>${r.ultimos.slice(0, 10).map(x => `<li>${new Date(x.en).toLocaleString(aj().locale)}</li>`).join('')}</ul>` : ''}<div class="acciones"><button class="btn ghost" data-cerrar>Cerrar</button></div>`);
  });
  q('#addPrest').onclick = () => editarPrestamista(null);
  $app.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edp) editarPrestamista(S.obtener('prestamistas', b.dataset.edp));
    if (b.dataset.delp && await confirmar('Se eliminará de la lista. Los préstamos existentes conservan el nombre.')) { S.borrar('prestamistas', b.dataset.delp); pintar(); }
  };
  q('#actUsura').onclick = ev => conBoton(ev.currentTarget, async () => { const r = await actualizarUsura(); toast(`Usura ${mesTexto(r.mes)}: ${r.usura}% E.A.`); pintar(); });
  q('#fu').onsubmit = e => {
    e.preventDefault();
    const mes = q('#uMes').value, val = num(q('#uVal').value);
    if (!/^\d{4}-\d{2}$/.test(mes) || !(val > 1 && val < 100)) return toast('Revisa el mes y el porcentaje', true);
    S.guardarAjustes({ ...aj(), usura: { ...(aj().usura || {}), [mes]: val } }); aplicarUsura(); toast('Tasa guardada'); pintar();
  };
  q('#fs')?.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    conBoton(q('#con'), async () => { await S.conectar(d.url, d.key, d.email, d.password); toast('Sincronización activada'); pintar(); });
  });
  q('#syncYa')?.addEventListener('click', ev => conBoton(ev.currentTarget, async () => { await S.sincronizar(); toast('Sincronizado'); pintar(); }));
  q('#desc')?.addEventListener('click', async () => { if (await confirmar('Tus datos se quedan en este dispositivo, pero dejará de sincronizar.', 'Desconectar')) { S.desconectar(); pintar(); } });
  q('#exp').onclick = () => {
    const blob = new Blob([S.exportarJSON()], { type: 'application/json' });
    const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = `respaldo_prestamos_${C.hoyISO()}.json`; a2.click();
  };
  q('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = S.importarJSON(await f.text()); toast(`Se importaron o actualizaron ${n} registros`); pintar(); } catch (err) { toast(err.message, true); }
  };
}

// ---------- sincronización ----------
function pintarSync() {
  const b = q('#syncBtn');
  b.hidden = !S.syncActiva();
  b.className = 'sync' + (S.syncEstado.ok === true ? ' ok' : S.syncEstado.ok === false ? ' err' : '');
  b.title = S.syncEstado.msg;
  b.textContent = S.syncEstado.ok === false ? 'Sin sincronizar' : S.syncEstado.ok === null ? 'Sincronizando' : 'Sincronizado';
}
q('#syncBtn').onclick = () => S.sincronizar().then(() => toast('Sincronizado')).catch(e => toast(e.message, true));

// ---------- arranque ----------
// Migración: si no hay "quién presta" pero sí datos propios, crear el primero.
if (!S.listar('prestamistas', { incluirBorrados: true }).length && aj().prestamistaNombre) {
  S.guardar('prestamistas', { nombre: aj().prestamistaNombre, documento: aj().prestamistaDoc, tipoDoc: 'C.C.', telefono: aj().prestamistaTel, email: aj().prestamistaEmail, ciudad: aj().ciudad });
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(console.warn);
pintarSync();
pintar();
setTimeout(() => {
  sincronizarAgenda().catch(e => console.warn('Agenda:', e.message));
  verificarPagares().catch(() => {});
  // Leer la usura del mes automáticamente si falta y hay servicio
  if (!usuraVigente().registrada && aj().mailerUrl && navigator.onLine) actualizarUsura().then(() => pintar()).catch(() => {});
}, 2500);
