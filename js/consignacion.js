// Mercancía en consignación: el deudor paga lo que vende y devuelve lo que no vende.
import * as C from './calc.js';
import * as S from './store.js';
import { icon } from './ui.js';
import { inventario } from './pdf.js';
import { $app, esc, q, qa, aj, dec, money, F, num, toast, modal, opciones, abonosDe, siguienteCodigo, prestamistas, render, avisoUsuraHTML, enlazarUsura, persona } from './comun.js';
import { editarPersona, editarPrestamista } from './editores.js';
import { crearPagare, abrirPagare, pagareDe } from './pagare-ui.js';
import { fechasConsignacion } from './recordatorios.js';
import * as I from './inventario.js';
import { elegirDelInventario, chipVence, diasAlerta } from './inventario-ui.js';
import { pintarMinis } from './fotos.js';

export function formConsignacion(id) {
  const existente = id ? S.obtener('prestamos', id) : null;
  const hoy = C.hoyISO(), a = aj();
  const p = existente ? structuredClone(existente) : {
    clase: 'consignacion', fecha: hoy, fechaLimite: C.addMonths(hoy, 1), prestamistaId: prestamistas()[0]?.id || '', productos: S.listar('productos').length ? [] : [{ descripcion: '', cantidad: 1, valorUnitario: '' }],
    interes: { tipo: 'mensual', tasa: 0 }, cobraInteres: false, mora: { activa: true }, plan: { tipo: 'libre' },
    recordatorio: { activo: true, modo: 'antes', dias: 3, cadaDias: 7, fechas: [], mensaje: '' }, conPagare: false, notas: '',
  };
  p.recordatorio = { activo: true, modo: 'antes', dias: 3, cadaDias: 7, fechas: [], mensaje: '', ...(p.recordatorio || {}) };
  const tieneMov = existente && abonosDe(id).length;
  const personasOpts = () => `<option value="">Elige la persona…</option>` + S.listar('personas').sort((x, y) => x.nombre.localeCompare(y.nombre)).map(x => `<option value="${x.id}" ${x.id === p.personaId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const prestOpts = () => (prestamistas().length ? '' : `<option value="">${esc(a.prestamistaNombre || 'Yo')}</option>`) + prestamistas().map(x => `<option value="${x.id}" ${x.id === p.prestamistaId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const total = () => p.productos.reduce((s, x) => s + num(x.cantidad) * num(x.valorUnitario), 0);

  $app.innerHTML = `${existente ? `<a class="volver" href="#/prestamo/${id}">${icon('atras')}Volver</a>` : ''}
  <div class="cabecera"><div><h1>${existente ? 'Editar consignación ' + esc(existente.codigo) : 'Mercancía en consignación'}</h1><p>La persona paga lo que vende y devuelve lo que no venda.</p></div></div>
  <div class="form-doble"><form id="fc2" data-edit autocomplete="off" novalidate>
    <section class="bloque"><h2>${icon('persona')}¿A quién le entregas?</h2>
      <div class="fila-campo"><select name="personaId" aria-label="Persona">${personasOpts()}</select><button type="button" class="btn sm" id="nuevaPersona">${icon('mas')}Nueva</button></div>
      <div class="f2"><div><label for="fecha">Fecha de entrega</label><input id="fecha" name="fecha" type="date" value="${esc(p.fecha)}"></div>
        <div><label for="prest">Entrega</label><div class="fila-campo"><select id="prest" name="prestamistaId">${prestOpts()}</select><button type="button" class="btn sm" id="nuevoPrest" aria-label="Agregar">${icon('mas')}</button></div></div></div>
    </section>
    <section class="bloque"><h2>${icon('lista')}Mercancía</h2>
      ${tieneMov ? '<div class="alerta">Ya hay ventas o devoluciones registradas: no cambies el orden de los productos.</div>' : ''}
      <div class="prod-head"><span>Producto</span><span>Cant.</span><span>Valor unitario</span><span></span></div>
      <div id="prods"></div>
      <div class="acciones" style="margin-top:4px">${tieneMov ? '' : `<button type="button" class="btn sm pri" id="addInv">${icon('lista')}Agregar del inventario</button>`}<button type="button" class="btn sm" id="addProd">${icon('mas')}Producto fuera del inventario</button></div>
      <div class="linea-res" style="margin-top:8px"><span>Valor total entregado</span><span id="totalCons"></span></div>
    </section>
    <section class="bloque"><h2>${icon('calendario')}Plazo y cobros</h2>
      <label for="fechaLimite">Fecha límite para pagar o devolver</label><input id="fechaLimite" name="fechaLimite" type="date" value="${esc(p.fechaLimite)}">
      <label class="check"><input type="checkbox" name="cobraInteres" ${p.cobraInteres ? 'checked' : ''}> Cobrar interés sobre el saldo pendiente</label>
      <div id="intWrap" ${p.cobraInteres ? '' : 'hidden'}><div class="f2"><div><label for="tasa">Tasa (%)</label><input id="tasa" name="tasa" type="number" inputmode="decimal" min="0" step="any" value="${p.interes.tasa || ''}"></div><div><label for="tasaTipo">La tasa es</label><select id="tasaTipo" name="tasaTipo">${opciones(C.TIPOS_TASA, p.interes.tipo)}</select></div></div><div id="usura"></div></div>
      <label class="check"><input type="checkbox" name="mora" ${p.mora?.activa !== false ? 'checked' : ''}> Cobrar intereses de mora a la tasa máxima legal si pasa la fecha límite</label>
    </section>
    <section class="bloque"><h2>${icon('correo')}Recordatorio personalizado</h2>
      <label class="check"><input type="checkbox" name="recActivo" ${p.recordatorio.activo !== false ? 'checked' : ''}> Enviar recordatorios por correo</label>
      <div id="recWrap"><label for="recModo">¿Cuándo?</label><select id="recModo" name="recModo">${opciones({ antes: 'Unos días antes de la fecha límite', cada: 'Cada cierto número de días', fechas: 'En fechas que yo elija' }, p.recordatorio.modo)}</select>
        <div id="recDet"></div>
        <label for="recMsg">Mensaje para la persona <span class="muted">(opcional)</span></label><textarea id="recMsg" name="recMsg" placeholder="Ej.: Recuerda reportar las ventas de la semana y devolver lo que no se vendió.">${esc(p.recordatorio.mensaje || '')}</textarea>
        <div class="hint" id="recPrev"></div></div>
    </section>
    <section class="bloque"><h2>${icon('pdf')}Pagaré y notas</h2>
      <label class="check"><input type="checkbox" name="conPagare" ${p.conPagare ? 'checked' : ''}> Firmar un pagaré por el valor de la mercancía</label>
      <label for="notas">Notas</label><textarea id="notas" name="notas">${esc(p.notas || '')}</textarea>
    </section>
    <div class="acciones fin-form"><button class="btn pri grande">${icon('check')}${existente ? 'Guardar cambios' : 'Guardar consignación'}</button>${existente ? `<a class="btn ghost" href="#/prestamo/${id}">Cancelar</a>` : ''}</div>
  </form>
  <aside class="resumen-lado"><div class="panel"><h2 style="margin-top:2px">Resumen</h2><div id="resLado"></div></div></aside></div>`;

  const form = q('#fc2');
  const pintarProds = () => {
    if (!p.productos.length) { q('#prods').innerHTML = '<p class="muted">Agrega los productos desde tu inventario.</p>'; return; }
    q('#prods').innerHTML = p.productos.map((x, i) => `<div class="prod-row ${x.loteId ? 'de-inv' : ''}">${x.loteId
      ? `<div class="prod-inv"><span class="mini-foto">${x.fotoId ? `<img data-foto="${esc(x.fotoId)}" alt="" hidden>` : ''}<span class="sin-foto">${icon('caja')}</span></span><span><b>${esc(x.descripcion)}</b>${x.vence ? ' ' + chipVence(x.vence, diasAlerta()) : ''}${x.costo !== '' && x.costo != null ? `<small class="muted"> costo ${money(x.costo)}</small>` : ''}</span></div>`
      : `<input data-i="${i}" data-k="descripcion" value="${esc(x.descripcion)}" placeholder="Descripción" aria-label="Producto ${i + 1}">`}
      <input data-i="${i}" data-k="cantidad" type="number" min="0" step="any" inputmode="decimal" value="${esc(x.cantidad)}" aria-label="Cantidad"><input data-i="${i}" data-k="valorUnitario" type="number" min="0" step="any" inputmode="decimal" value="${esc(x.valorUnitario)}" placeholder="Valor" aria-label="Valor unitario">
      <button type="button" class="btn sm dan" data-del="${i}" aria-label="Quitar" ${tieneMov ? 'disabled' : ''}>${icon('borrar')}</button></div>`).join('');
    pintarMinis(q('#prods'));
  };
  const recDet = () => {
    const r = p.recordatorio;
    q('#recDet').innerHTML = r.modo === 'cada' ? `<label for="recCada">Cada cuántos días</label><input id="recCada" name="recCada" type="number" min="1" max="90" value="${r.cadaDias}">`
      : r.modo === 'fechas' ? `<label for="recNueva">Fechas de recordatorio</label><div class="fila-campo"><input type="date" id="recNueva"><button type="button" class="btn sm" id="recAdd">${icon('mas')}Agregar</button></div><div class="chips-sel" id="recLista">${(r.fechas || []).map((f, i) => `<span class="chip t-lav">${F(f)} <button type="button" class="x" data-rdel="${i}" aria-label="Quitar">×</button></span>`).join('') || '<span class="muted">Sin fechas</span>'}</div>`
      : `<label for="recDias">Días antes de la fecha límite</label><input id="recDias" name="recDias" type="number" min="0" max="60" value="${r.dias}">`;
  };
  function actualizar() {
    p.monto = total();
    q('#totalCons').textContent = money(p.monto);
    q('#intWrap').hidden = !p.cobraInteres;
    q('#recWrap').hidden = p.recordatorio.activo === false;
    if (p.cobraInteres) { q('#usura').innerHTML = avisoUsuraHTML(p.interes); enlazarUsura(q('#usura'), actualizar); }
    const pp = { ...p, interes: p.cobraInteres ? p.interes : { tipo: 'mensual', tasa: 0 } };
    const est = p.fechaLimite && p.monto ? C.estadoCuenta({ ...pp, mora: { activa: false } }, [], p.fechaLimite, dec()) : null;
    const fechas = fechasConsignacion({ ...p, recordatorio: p.recordatorio });
    q('#recPrev').textContent = p.recordatorio.activo === false ? '' : fechas.length ? `Se enviarán ${fechas.length} recordatorio(s): ${fechas.slice(0, 4).map(F).join(', ')}${fechas.length > 4 ? '…' : ''}` : 'Con esta configuración no hay recordatorios futuros.';
    q('#resLado').innerHTML = `<div class="ganancia-dest"><span>Valor entregado</span><b>${money(p.monto)}</b><small>${p.productos.filter(x => x.descripcion).length} producto(s), ${p.productos.reduce((s, x) => s + num(x.cantidad), 0)} unidades</small></div>
      ${(() => { const g = I.gananciaConsignacion(p, []); return g.conCosto ? `<div class="linea-res"><span>Ganancia si vende todo</span><span>${money(g.esperada)}</span></div>` : ''; })()}
      <div class="linea-res"><span>Fecha límite</span><span>${p.fechaLimite ? F(p.fechaLimite) : '-'}</span></div>
      ${est && p.cobraInteres ? `<div class="linea-res"><span>Interés si no paga nada hasta la fecha límite</span><span>${money(est.interesPendiente)}</span></div>` : ''}
      <div class="linea-res"><span>Mora después del plazo</span><span>${p.mora?.activa !== false ? 'Sí, tasa máxima legal' : 'No'}</span></div>`;
  }
  pintarProds(); recDet();
  form.addEventListener('input', e => {
    const t = e.target, v = t.value;
    if (t.dataset.i !== undefined) p.productos[t.dataset.i][t.dataset.k] = t.dataset.k === 'descripcion' ? v : v;
    else switch (t.name) {
      case 'cobraInteres': p.cobraInteres = t.checked; break;
      case 'tasa': p.interes.tasa = num(v); break;
      case 'tasaTipo': p.interes.tipo = v; break;
      case 'mora': p.mora = { activa: t.checked }; break;
      case 'recActivo': p.recordatorio.activo = t.checked; break;
      case 'recModo': p.recordatorio.modo = v; recDet(); break;
      case 'recDias': p.recordatorio.dias = Math.max(0, parseInt(v || 0, 10)); break;
      case 'recCada': p.recordatorio.cadaDias = Math.max(1, parseInt(v || 1, 10)); break;
      case 'recMsg': p.recordatorio.mensaje = v; break;
      case 'conPagare': p.conPagare = t.checked; break;
      case 'personaId': case 'prestamistaId': case 'fecha': case 'fechaLimite': case 'notas': p[t.name] = v; break;
    }
    actualizar();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'addProd') { p.productos.push({ descripcion: '', cantidad: 1, valorUnitario: '' }); pintarProds(); actualizar(); }
    if (b.id === 'addInv') elegirDelInventario({ excluirConsignacion: existente?.id || null, yaElegidos: p.productos.filter(x => x.loteId) }, filas => {
      // si el mismo lote ya estaba, sumar cantidades
      for (const f of filas) { const ya = p.productos.find(x => x.loteId === f.loteId); if (ya) ya.cantidad = num(ya.cantidad) + f.cantidad; else p.productos.push(f); }
      p.productos = p.productos.filter(x => x.loteId || String(x.descripcion).trim());
      pintarProds(); actualizar();
    });
    if (b.dataset.del !== undefined) { p.productos.splice(+b.dataset.del, 1); pintarProds(); actualizar(); }
    if (b.id === 'nuevaPersona') editarPersona(null, n => { p.personaId = n.id; form.personaId.innerHTML = personasOpts(); });
    if (b.id === 'nuevoPrest') editarPrestamista(null, n => { p.prestamistaId = n.id; form.prestamistaId.innerHTML = prestOpts(); });
    if (b.id === 'recAdd') { const v = q('#recNueva').value; if (v) { p.recordatorio.fechas = [...new Set([...(p.recordatorio.fechas || []), v])].sort(); recDet(); actualizar(); } }
    if (b.dataset.rdel !== undefined) { p.recordatorio.fechas.splice(+b.dataset.rdel, 1); recDet(); actualizar(); }
  });
  form.onsubmit = e => {
    e.preventDefault();
    if (!p.personaId) return toast('Elige a quién le entregas', true);
    p.productos = p.productos.map(x => ({ ...x, descripcion: String(x.descripcion).trim(), cantidad: num(x.cantidad), valorUnitario: num(x.valorUnitario) })).filter(x => x.descripcion && x.cantidad > 0);
    if (!p.productos.length) { pintarProds(); return toast('Agrega al menos un producto con cantidad', true); }
    if (!tieneMov) {
      const info = I.existencias(S.listar('productos'), S.listar('prestamos').filter(x => x.clase === 'consignacion'), abonosDe, { excluirConsignacion: existente?.id || null });
      const errores = I.validarEntrega(p.productos, info);
      if (errores.length) return toast('No hay suficiente inventario. ' + errores.join(' '), true);
    }
    if (!p.fechaLimite || p.fechaLimite <= p.fecha) return toast('La fecha límite debe ser posterior a la entrega', true);
    p.monto = total();
    if (!(p.monto > 0)) return toast('Indica el valor de los productos', true);
    if (!p.cobraInteres) p.interes = { tipo: 'mensual', tasa: 0 };
    if (!p.codigo) p.codigo = siguienteCodigo('CO');
    p.prestadoPor = S.obtener('prestamistas', p.prestamistaId)?.nombre || aj().prestamistaNombre || '';
    const g = S.guardar('prestamos', { ...p, clase: 'consignacion', plan: { tipo: 'libre' } });
    toast(existente ? 'Consignación actualizada' : 'Consignación guardada');
    location.hash = '#/prestamo/' + g.id;
    if (p.conPagare && (!pagareDe(g) || pagareDe(g).estado !== 'firmado')) setTimeout(() => { const r = pagareDe(g); if (r) S.borrar('pagares', r.id); crearPagare(g); abrirPagare(g, { recienCreado: true }); }, 80);
  };
  actualizar();
}

export function tablaInventario(p, movs) {
  const inv = inventario(p, movs);
  return `<div class="tabla"><table><thead><tr><th>Producto</th><th class="num">Entregado</th><th class="num">Vendido</th><th class="num">Devuelto</th><th class="num">En su poder</th><th class="num">Valor unit.</th></tr></thead><tbody>
    ${inv.map(x => `<tr><td>${esc(x.descripcion)}${x.vence ? ' ' + chipVence(x.vence, diasAlerta()) : ''}</td><td class="num">${x.cantidad}</td><td class="num">${x.vendido}</td><td class="num">${x.devuelto}</td><td class="num"><b>${x.enPoder}</b></td><td class="num">${money(x.valorUnitario)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${inv.reduce((s, x) => s + x.cantidad, 0)}</td><td class="num">${inv.reduce((s, x) => s + x.vendido, 0)}</td><td class="num">${inv.reduce((s, x) => s + x.devuelto, 0)}</td><td class="num">${inv.reduce((s, x) => s + x.enPoder, 0)}</td><td></td></tr></tfoot></table></div>`;
}

/** Registrar venta (pago de lo vendido) o devolución de mercancía. */
export function dialogoMovimiento(p, tipo = 'pago', mov = null) {
  const inv = inventario(p, abonosDe(p.id).filter(m => m.id !== mov?.id));
  const det = Object.fromEntries((mov?.detalle || []).map(d => [d.i, d.cantidad]));
  const esDev = tipo === 'devolucion';
  modal(`<h2>${esDev ? 'Registrar devolución' : 'Registrar venta y pago'}</h2><p class="muted" style="margin-top:-6px">${esc(persona(p.personaId).nombre)}. ${esDev ? 'Indica qué productos te devolvió.' : 'Indica qué productos vendió; el valor se calcula solo y puedes ajustarlo.'}</p>
    <form id="fmv"><div class="tabla"><table><thead><tr><th>Producto</th><th class="num">En su poder</th><th class="num">${esDev ? 'Devuelve' : 'Vendió'}</th></tr></thead><tbody>
      ${inv.map((x, i) => `<tr><td>${esc(x.descripcion)}<div class="muted">${money(x.valorUnitario)} c/u</div></td><td class="num">${x.enPoder}</td><td class="num"><input class="mini" type="number" min="0" max="${x.enPoder}" step="any" data-i="${i}" value="${det[i] || ''}" aria-label="Cantidad ${esc(x.descripcion)}"></td></tr>`).join('')}</tbody></table></div>
    <div class="f2"><div><label for="mvValor">${esDev ? 'Valor devuelto' : 'Valor recibido'}</label><input id="mvValor" name="valor" type="number" inputmode="decimal" min="0" step="any" value="${mov?.valor || ''}" ${esDev ? 'readonly' : ''}></div>
      <div><label for="mvFecha">Fecha</label><input id="mvFecha" name="fecha" type="date" value="${esc(mov?.fecha || C.hoyISO())}"></div></div>
    ${esDev ? '' : `<label for="mvCta">¿Dónde lo recibiste?</label><select id="mvCta" name="cuentaId"><option value="">Sin especificar</option>${S.listar('cuentas').map(c => `<option value="${c.id}" ${c.id === mov?.cuentaId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`}
    <label for="mvNota">Nota</label><input id="mvNota" name="nota" value="${esc(mov?.nota || '')}">
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    const f = q('#fmv', box);
    let manual = !!mov && !esDev;
    const calcular = () => inv.reduce((s, x, i) => s + num(q(`[data-i="${i}"]`, box).value) * x.valorUnitario, 0);
    f.addEventListener('input', e => {
      if (e.target.name === 'valor') manual = true;
      if (e.target.dataset.i !== undefined && (!manual || esDev)) f.valor.value = calcular() || '';
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      const detalle = inv.map((x, i) => ({ i, cantidad: num(q(`[data-i="${i}"]`, box).value) })).filter(d => d.cantidad > 0);
      if (detalle.some(d => d.cantidad > inv[d.i].enPoder)) return toast('Hay cantidades mayores a las que tiene en su poder', true);
      const valor = esDev ? calcular() : num(f.valor.value);
      if (!(valor > 0)) return toast(esDev ? 'Indica las cantidades devueltas' : 'Escribe el valor recibido', true);
      S.guardar('abonos', { ...(mov || {}), prestamoId: p.id, tipo, fecha: f.fecha.value, valor, detalle, cuentaId: f.cuentaId?.value || '', nota: f.nota.value.trim() });
      cerrar(); toast(esDev ? 'Devolución registrada' : 'Venta registrada'); render();
    };
  });
}
