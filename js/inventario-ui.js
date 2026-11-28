// Pantallas del inventario de mercancía.
import * as S from './store.js';
import * as I from './inventario.js';
import { icon, ilus } from './ui.js';
import { guardarFoto, borrarFoto, obtenerFoto, pintarMinis } from './fotos.js';
import { escanear } from './escaner.js';
import { excelInventario, descargar, infoInventario, MIME_XLSX } from './excel.js';
import { enviarCorreo, plantilla } from './email.js';
import { $app, esc, q, qa, aj, money, F, Fc, num, toast, modal, confirmar, conBoton, vacio, render, persona } from './comun.js';

export const diasAlerta = () => Number(aj().diasAlertaVencimiento || 30);
const miniHTML = (fotoId, clase = 'mini-foto') => `<span class="${clase}">${fotoId ? `<img data-foto="${esc(fotoId)}" alt="" hidden>` : ''}<span class="sin-foto">${icon('caja')}</span></span>`;
export const chipVence = (vence, dias) => {
  if (!vence) return '';
  const d = I.diasPara(vence);
  const cls = d < 0 ? 'bad' : d <= dias ? 'warn' : 'gris';
  return `<span class="chip ${cls}">${d < 0 ? 'Vencido' : 'Vence'} ${Fc(vence)}</span>`;
};
const categorias = () => [...new Set(S.listar('productos').map(p => p.categoria).filter(Boolean))].sort();

let filtroInv = { texto: '', categoria: '', soloAlerta: false };
export function vistaInventario() {
  const pintar = () => {
    const info = infoInventario(), dias = diasAlerta();
    const pv = I.porVencer(info, dias);
    const t = filtroInv.texto.toLowerCase();
    const lista = Object.values(info)
      .filter(x => !filtroInv.categoria || x.producto.categoria === filtroInv.categoria)
      .filter(x => !t || [x.producto.nombre, x.producto.referencia, x.producto.codigoBarras, x.producto.categoria].join(' ').toLowerCase().includes(t))
      .filter(x => !filtroInv.soloAlerta || pv.some(v => v.producto.id === x.producto.id))
      .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
    const tot = Object.values(info).reduce((s, x) => ({ bod: s.bod + x.disponible * Number(x.producto.costo || 0), cons: s.cons + x.enConsignacion * Number(x.producto.precio || 0), u: s.u + x.disponible }), { bod: 0, cons: 0, u: 0 });
    $app.innerHTML = `<a class="volver" href="#/ajustes">${icon('atras')}Ajustes</a>
      <div class="cabecera"><div><h1>Inventario</h1><p>Productos, lotes y existencias a la fecha.</p></div><button class="btn pri" id="nuevoProd">${icon('mas')}Producto</button></div>
      <div class="mosaico" style="margin-top:0">
        <div class="tile t-lav"><div class="et">${icon('lista')}En bodega</div><div class="val">${tot.u} und.</div></div>
        <div class="tile t-cielo"><div class="et">${icon('dinero')}Valor en bodega (costo)</div><div class="val">${money(tot.bod)}</div></div>
        <div class="tile t-durazno"><div class="et">${icon('personas')}En consignación (precio)</div><div class="val">${money(tot.cons)}</div></div>
        <button class="tile t-rosa tile-btn" id="verAlertas"><div class="et">${icon('alerta')}Vencen en ${dias} días</div><div class="val">${pv.length} lote(s)</div></button>
      </div>
      <div class="acciones"><button class="btn" id="excel">${icon('respaldo')}Excel del inventario</button></div>
      <div class="fila-campo" style="margin-top:6px"><div class="buscar">${icon('buscar')}<input id="bInv" type="search" placeholder="Buscar por nombre, referencia o código" value="${esc(filtroInv.texto)}"></div><button class="btn" id="scanBuscar" aria-label="Escanear">${icon('barras')}</button></div>
      <div class="filtros"><button data-cat="" class="${!filtroInv.categoria && !filtroInv.soloAlerta ? 'on' : ''}">Todos</button>${filtroInv.soloAlerta ? '<button class="on" data-alerta>Por vencer ✕</button>' : ''}${categorias().map(c => `<button data-cat="${esc(c)}" class="${filtroInv.categoria === c ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
      ${lista.length ? `<div class="lista">${lista.map(({ producto: p, disponible, enConsignacion, proximoVence }) => `<button class="fila fila-btn" data-prod="${p.id}">${miniHTML(p.fotoId)}
          <div class="cuerpo"><div class="t1">${esc(p.nombre)}</div><div class="t2">${esc([p.referencia, p.categoria].filter(Boolean).join(' · '))} ${chipVence(proximoVence, dias)}</div></div>
          <div class="lado">${disponible} und.<small>${enConsignacion ? enConsignacion + ' en consignación' : money(p.precio)}</small></div></button>`).join('')}</div>`
        : `<div class="panel">${vacio('billetera', S.listar('productos').length ? 'No hay productos con este filtro.' : 'Registra tus productos con foto, precio y lotes. Luego los eliges al entregar mercancía en consignación.', `<button class="btn pri" id="nuevoProd2">${icon('mas')}Agregar producto</button>`)}</div>`}`;
    pintarMinis($app);
    q('#nuevoProd').onclick = () => editarProducto(null, pintar);
    q('#nuevoProd2')?.addEventListener('click', () => editarProducto(null, pintar));
    q('#bInv').oninput = e => { filtroInv.texto = e.target.value; const pos = e.target.selectionStart; pintar(); const n = q('#bInv'); n.focus(); n.setSelectionRange(pos, pos); };
    q('#scanBuscar').onclick = async () => {
      const c = await escanear(); if (!c) return;
      const p = S.listar('productos').find(x => x.codigoBarras === c);
      if (p) editarProducto(p, pintar);
      else if (await confirmar(`No hay ningún producto con el código ${c}. ¿Crear uno nuevo con ese código?`, 'Crear producto')) editarProducto({ codigoBarras: c }, pintar);
    };
    qa('[data-cat]').forEach(b => (b.onclick = () => { filtroInv.categoria = b.dataset.cat; filtroInv.soloAlerta = false; pintar(); }));
    q('[data-alerta]')?.addEventListener('click', () => { filtroInv.soloAlerta = false; pintar(); });
    q('#verAlertas').onclick = () => verPorVencer();
    q('#excel').onclick = () => dialogoExcel();
    $app.onclick = e => { const b = e.target.closest('[data-prod]'); if (b) editarProducto(S.obtener('productos', b.dataset.prod), pintar); };
  };
  pintar();
}

export function verPorVencer() {
  const dias = diasAlerta(), pv = I.porVencer(infoInventario(), dias);
  modal(`<h2>Vencen en los próximos ${dias} días</h2>
    ${pv.length ? `<div class="lista" style="box-shadow:none;padding:0">${pv.map(x => `<div class="fila">${miniHTML(x.producto.fotoId)}<div class="cuerpo"><div class="t1">${esc(x.producto.nombre)}${x.lote.lote ? ' · lote ' + esc(x.lote.lote) : ''}</div>
      <div class="t2">${x.donde === 'bodega' ? 'En bodega' : `En poder de <b>${esc(persona(x.personaId).nombre)}</b> (${esc(x.codigo)})`} · ${chipVence(x.lote.vence, dias)}</div></div><div class="lado">${x.cantidad} und.<small>${x.dias < 0 ? 'hace ' + -x.dias + ' días' : x.dias === 0 ? 'hoy' : 'en ' + x.dias + ' días'}</small></div></div>`).join('')}</div>`
      : '<p class="muted">Ningún producto vence en este periodo.</p>'}
    <p class="hint">Los que están en consignación conviene recogerlos o liquidarlos antes de que venzan.</p>
    <div class="acciones"><button class="btn ghost" data-cerrar>Cerrar</button></div>`, box => pintarMinis(box));
}

function dialogoExcel() {
  const a = aj(), para = a.correoInformes || a.copiaOculta || a.prestamistaEmail || '';
  modal(`<h2>Excel del inventario</h2><p class="muted" style="margin-top:-6px">Tres hojas: inventario por lote, mercancía en consignación por persona y productos por vencer.</p>
    <div class="opciones" style="grid-template-columns:1fr 1fr">
      <label class="opcion"><input type="radio" name="fotos" value="no" checked><span><b>Sin fotos</b><small>Más liviano y fácil de filtrar.</small></span></label>
      <label class="opcion"><input type="radio" name="fotos" value="si"><span><b>Con fotos</b><small>Miniatura de cada producto.</small></span></label></div>
    <label for="exPara">Enviar a</label><input id="exPara" type="email" value="${esc(para)}" placeholder="tu correo">
    <div class="acciones"><button class="btn pri" id="exEnviar">${icon('correo')}Enviar por correo</button><button class="btn" id="exDesc">${icon('respaldo')}Descargar</button><button class="btn ghost" data-cerrar>Cancelar</button></div>`, (box, cerrar) => {
    const opc = () => ({ conFotos: q('[name=fotos]:checked', box).value === 'si', diasAlerta: diasAlerta() });
    q('#exDesc', box).onclick = ev => conBoton(ev.currentTarget, async () => { const x = await excelInventario(opc()); descargar(x); cerrar(); toast('Excel descargado'); });
    q('#exEnviar', box).onclick = ev => conBoton(ev.currentTarget, async () => {
      const to = q('#exPara', box).value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('Escribe un correo válido');
      const x = await excelInventario(opc());
      const info = infoInventario(), dias = diasAlerta();
      const filas = [['Productos', String(Object.keys(info).length)], ['Unidades en bodega', String(Object.values(info).reduce((s, i) => s + i.disponible, 0))],
        ['Unidades en consignación', String(Object.values(info).reduce((s, i) => s + i.enConsignacion, 0))], [`Lotes que vencen en ${dias} días`, String(I.porVencer(info, dias).length)]];
      const html = plantilla({ titulo: 'Inventario a la fecha', saludo: 'Hola,', parrafos: ['Adjuntamos el inventario en Excel con el detalle por lote, la mercancía en consignación y los productos por vencer.'], filas, aj: aj() });
      await enviarCorreo({ to, asunto: `Inventario a la fecha · ${F(new Date().toISOString().slice(0, 10))}`, html, text: filas.map(f => f.join(': ')).join('\n'),
        adjunto: { base64: x.base64, nombre: x.nombre, tipo: MIME_XLSX } }, aj());
      cerrar(); toast(`Excel enviado a ${to}`);
    });
  });
}

/** Ficha de producto: foto, datos, precios y lotes. */
export function editarProducto(prod, despues) {
  const p = prod?.id ? structuredClone(prod) : { nombre: '', referencia: '', codigoBarras: '', categoria: '', costo: '', precio: '', lotes: [], ...(prod || {}) };
  p.lotes = (p.lotes || []).map(l => ({ ...l }));
  if (!p.id && !p.lotes.length) p.lotes.push({ id: I.uidLote(), lote: '', vence: '', cantidad: '', ingreso: new Date().toISOString().slice(0, 10) });
  let fotoNueva = null, quitarFoto = false;
  const info = p.id ? infoInventario()[p.id] : null;
  const estLote = id => info?.lotes.find(l => l.id === id);
  modal(`<h2>${p.id ? 'Producto' : 'Nuevo producto'}</h2><form id="fprod" novalidate>
    <div class="foto-prod"><div class="foto-caja" id="fotoCaja">${p.fotoId ? `<img data-foto="${esc(p.fotoId)}" data-grande="1" alt="Foto del producto" hidden>` : ''}<span class="sin-foto">${icon('caja')}<small>Sin foto</small></span></div>
      <div class="foto-acc"><label class="btn sm">${icon('mas')}Tomar foto<input type="file" class="foto-input" id="fotoIn" accept="image/*" capture="environment" hidden></label><label class="btn sm">${icon('pdf')}Elegir de la galería<input type="file" class="foto-input" id="fotoGal" accept="image/*" hidden></label>${p.fotoId ? `<button type="button" class="btn sm ghost" id="fotoQuitar">Quitar foto</button>` : ''}</div></div>
    <label for="prNom">Nombre del producto</label><input id="prNom" name="nombre" required value="${esc(p.nombre)}">
    <div class="f2"><div><label for="prRef">Referencia</label><input id="prRef" name="referencia" value="${esc(p.referencia)}"></div>
      <div><label for="prCat">Categoría</label><input id="prCat" name="categoria" list="cats" value="${esc(p.categoria)}" placeholder="Ej.: Perfumes"><datalist id="cats">${categorias().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
    <label for="prBar">Código de barras</label><div class="fila-campo"><input id="prBar" name="codigoBarras" inputmode="numeric" value="${esc(p.codigoBarras)}"><button type="button" class="btn sm" id="prScan">${icon('barras')}Escanear</button></div>
    <div class="f2"><div><label for="prCosto">Costo unitario <span class="muted">(lo que te costó)</span></label><input id="prCosto" name="costo" type="number" inputmode="decimal" min="0" step="any" value="${esc(p.costo)}"></div>
      <div><label for="prPrecio">Precio de venta</label><input id="prPrecio" name="precio" type="number" inputmode="decimal" min="0" step="any" value="${esc(p.precio)}"></div></div>
    <div class="hint" id="prMargen"></div>
    <h3 style="margin:16px 0 4px">Lotes y existencias</h3><p class="hint" style="margin-top:0">Registra cada entrada de mercancía como un lote, con su fecha de vencimiento si la tiene.</p>
    <div id="lotes"></div>
    <button type="button" class="btn sm" id="addLote">${icon('mas')}Agregar lote / entrada</button>
    ${info?.lotes.some(l => l.personas.length) ? `<h3 style="margin:16px 0 4px">Dónde está</h3><ul class="muted">${info.lotes.flatMap(l => l.personas.map(x => `<li>${x.cantidad} und. con ${esc(persona(x.personaId).nombre)} (${esc(x.codigo)})${l.lote ? ', lote ' + esc(l.lote) : ''}</li>`)).join('')}</ul>` : ''}
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar producto</button>${p.id ? `<button type="button" class="btn dan" id="prDel">${icon('borrar')}Eliminar</button>` : ''}<button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    const f = q('#fprod', box);
    pintarMinis(box);
    const pintarLotes = () => {
      q('#lotes', box).innerHTML = `<div class="lote-head"><span>Lote</span><span>Vence</span><span>Cantidad</span><span>En bodega</span><span></span></div>` + p.lotes.map((l, i) => {
        const e = estLote(l.id), usado = e ? e.entregado - e.devuelto : 0;
        return `<div class="lote-row"><input data-l="${i}" data-k="lote" value="${esc(l.lote)}" placeholder="N° lote" aria-label="Lote"><input type="date" data-l="${i}" data-k="vence" value="${esc(l.vence)}" aria-label="Vence">
          <input type="number" min="${usado}" step="any" inputmode="decimal" data-l="${i}" data-k="cantidad" value="${esc(l.cantidad)}" aria-label="Cantidad ingresada"><span class="num">${e ? e.disponible : num(l.cantidad)}</span>
          <button type="button" class="btn sm dan" data-ldel="${i}" aria-label="Quitar lote" ${usado > 0 ? 'disabled title="Tiene unidades entregadas"' : ''}>${icon('borrar')}</button></div>`;
      }).join('');
    };
    const margen = () => {
      const c = num(f.costo.value), pr = num(f.precio.value);
      q('#prMargen', box).textContent = c && pr ? `Ganancia por unidad: ${money(pr - c)} (${(((pr - c) / pr) * 100).toFixed(1)}% del precio).` : '';
    };
    pintarLotes(); margen();
    f.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.l !== undefined) {
        p.lotes[t.dataset.l][t.dataset.k] = t.value;
        if (t.dataset.k === 'cantidad') { const e = estLote(p.lotes[t.dataset.l].id); t.parentElement.querySelector('.num').textContent = Math.max(0, num(t.value) - (e ? e.entregado - e.devuelto : 0)); }
      }
      if (t.name === 'costo' || t.name === 'precio') margen();
    });
    q('#addLote', box).onclick = () => { p.lotes.push({ id: I.uidLote(), lote: '', vence: '', cantidad: '', ingreso: new Date().toISOString().slice(0, 10) }); pintarLotes(); };
    q('#lotes', box).onclick = e => { const b = e.target.closest('[data-ldel]'); if (b && !b.disabled) { p.lotes.splice(+b.dataset.ldel, 1); pintarLotes(); } };
    q('#prScan', box).onclick = async () => {
      const valores = Object.fromEntries(new FormData(f));
      const c = await escanear();
      editarProductoReabrir({ ...p, ...valores, codigoBarras: c || valores.codigoBarras }, despues, fotoNueva);
    };
    qa('.foto-input', box).forEach(inp => (inp.onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      e.target.value = '';
      try {
        fotoNueva = await guardarFoto(file);
        const fo = await obtenerFoto(fotoNueva);
        q('#fotoCaja', box).innerHTML = `<img src="${fo.img}" alt="Foto del producto">`;
        quitarFoto = false;
      } catch (err) { toast(err.message, true); }
    }));
    q('#fotoQuitar', box)?.addEventListener('click', () => { quitarFoto = true; fotoNueva = null; q('#fotoCaja', box).innerHTML = `<span class="sin-foto">${icon('caja')}<small>Sin foto</small></span>`; });
    q('#prDel', box)?.addEventListener('click', async () => {
      if ((info?.enConsignacion || 0) > 0) return toast('No se puede eliminar: tiene unidades en consignación', true);
      cerrar();
      if (await confirmar(`Se eliminará ${p.nombre} del inventario.`)) { S.borrar('productos', p.id); if (p.fotoId) borrarFoto(p.fotoId).catch(() => {}); toast('Producto eliminado'); despues ? despues() : render(); }
    });
    f.onsubmit = async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f)); Object.keys(d).forEach(k => (d[k] = String(d[k]).trim()));
      if (!d.nombre) return toast('Escribe el nombre del producto', true);
      if (d.codigoBarras && S.listar('productos').some(x => x.codigoBarras === d.codigoBarras && x.id !== p.id)) return toast('Ya existe otro producto con ese código de barras', true);
      const lotes = p.lotes.map(l => ({ ...l, lote: String(l.lote || '').trim(), cantidad: num(l.cantidad) })).filter(l => l.cantidad > 0 || estLote(l.id));
      for (const l of lotes) { const e = estLote(l.id); if (e && l.cantidad < e.entregado - e.devuelto) return toast(`El lote ${l.lote || ''} no puede quedar con menos de ${e.entregado - e.devuelto} unidades (ya entregadas)`, true); }
      let fotoId = p.fotoId || null;
      if (fotoNueva) { if (fotoId) borrarFoto(fotoId).catch(() => {}); fotoId = fotoNueva; }
      if (quitarFoto && fotoId) { borrarFoto(fotoId).catch(() => {}); fotoId = null; }
      const g = S.guardar('productos', { ...p, nombre: d.nombre, referencia: d.referencia, codigoBarras: d.codigoBarras, categoria: d.categoria, costo: d.costo === '' ? '' : num(d.costo), precio: num(d.precio), lotes, fotoId });
      cerrar(); toast('Producto guardado'); despues ? despues(g) : render();
    };
  });
}
// reabre la ficha conservando lo escrito (después de escanear)
function editarProductoReabrir(p, despues, fotoNueva) { editarProducto(fotoNueva ? { ...p, fotoId: fotoNueva } : p, despues); }

/**
 * Selector de productos del inventario para una consignación.
 * alElegir([{ productoId, loteId, descripcion, cantidad, valorUnitario, costo, vence, fotoId, lote }])
 */
export function elegirDelInventario({ excluirConsignacion = null, yaElegidos = [] } = {}, alElegir) {
  const productos = S.listar('productos');
  const cons = S.listar('prestamos').filter(p => p.clase === 'consignacion');
  const info = I.existencias(productos, cons, id => S.listar('abonos').filter(a => a.prestamoId === id), { excluirConsignacion });
  // descontar lo que ya está en el formulario sin guardar
  for (const it of yaElegidos) for (const x of Object.values(info)) { const l = x.lotes.find(l => l.id === it.loteId); if (l) { l.disponible -= Number(it.cantidad || 0); x.disponible -= Number(it.cantidad || 0); } }
  let texto = '';
  const pintar = box => {
    const t = texto.toLowerCase();
    const lista = Object.values(info).filter(x => !t || [x.producto.nombre, x.producto.referencia, x.producto.codigoBarras, x.producto.categoria].join(' ').toLowerCase().includes(t)).sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
    q('#selLista', box).innerHTML = lista.length ? lista.map(({ producto: p, disponible, proximoVence }) => `<div class="fila sel-prod ${disponible <= 0 ? 'agotado' : ''}">${miniHTML(p.fotoId)}
      <div class="cuerpo"><div class="t1">${esc(p.nombre)}</div><div class="t2">${disponible} disponibles · ${money(p.precio)} ${chipVence(proximoVence, diasAlerta())}</div></div>
      <input type="number" class="mini" min="0" max="${Math.max(0, disponible)}" step="any" inputmode="decimal" data-sel="${p.id}" placeholder="0" ${disponible <= 0 ? 'disabled' : ''} aria-label="Cantidad de ${esc(p.nombre)}"></div>`).join('')
      : `<p class="muted">${productos.length ? 'Sin resultados.' : 'Aún no hay productos en el inventario. Agrégalos en Ajustes > Inventario.'}</p>`;
    pintarMinis(box);
  };
  modal(`<h2>Agregar del inventario</h2><p class="muted" style="margin-top:-6px">Escribe la cantidad de cada producto. Se toman primero los lotes que vencen antes.</p>
    <div class="fila-campo"><div class="buscar">${icon('buscar')}<input id="selBus" type="search" placeholder="Buscar producto"></div><button type="button" class="btn" id="selScan" aria-label="Escanear">${icon('barras')}</button></div>
    <div id="selLista" class="lista sel-lista" style="box-shadow:none;padding:0;margin-top:10px"></div>
    <div class="acciones"><button class="btn pri" id="selOk">${icon('check')}Agregar</button><button class="btn ghost" data-cerrar>Cancelar</button></div>`, (box, cerrar) => {
    const cant = {};
    pintar(box);
    q('#selBus', box).oninput = e => { texto = e.target.value; pintar(box); qa('[data-sel]', box).forEach(i => (i.value = cant[i.dataset.sel] || '')); };
    q('#selLista', box).addEventListener('input', e => { if (e.target.dataset.sel) cant[e.target.dataset.sel] = e.target.value; });
    q('#selScan', box).onclick = async () => {
      const guardado = { ...cant };
      const c = await escanear();
      elegirDelInventarioConCodigo({ excluirConsignacion, yaElegidos }, alElegir, c, guardado);
    };
    q('#selOk', box).onclick = () => {
      const filas = [], errores = [];
      for (const [pid, v] of Object.entries(cant)) {
        const n = num(v); if (!(n > 0)) continue;
        const x = info[pid];
        const { asignacion, faltante } = I.asignarFEFO(x, n);
        if (faltante > 0) { errores.push(`${x.producto.nombre}: solo hay ${n - faltante} disponibles`); continue; }
        for (const a of asignacion) filas.push({ productoId: pid, loteId: a.loteId, lote: a.lote, vence: a.vence, descripcion: x.producto.nombre + (a.lote ? ` (lote ${a.lote})` : ''), cantidad: a.cantidad, valorUnitario: Number(x.producto.precio || 0), costo: x.producto.costo === '' || x.producto.costo == null ? '' : Number(x.producto.costo), fotoId: x.producto.fotoId || null });
      }
      if (errores.length) return toast(errores.join('. '), true);
      if (!filas.length) return toast('Escribe la cantidad de al menos un producto', true);
      cerrar(); alElegir(filas);
    };
  }, { ancho: true });
}
function elegirDelInventarioConCodigo(opts, alElegir, codigo, cantPrevias) {
  elegirDelInventario(opts, alElegir);
  const box = q('.modal-box');
  if (!codigo) return;
  const p = S.listar('productos').find(x => x.codigoBarras === codigo);
  if (!p) { toast(`No hay ningún producto con el código ${codigo}`, true); return; }
  const inp = q(`[data-sel="${p.id}"]`, box);
  Object.entries(cantPrevias || {}).forEach(([k, v]) => { const i = q(`[data-sel="${k}"]`, box); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } });
  if (inp && !inp.disabled) { inp.value = num(inp.value) + 1; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); inp.scrollIntoView({ block: 'center' }); }
}
