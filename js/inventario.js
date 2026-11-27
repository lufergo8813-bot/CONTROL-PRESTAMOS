// Inventario de mercancía: existencias por lote, asignación FEFO y alertas de vencimiento.
// Funciones puras (sin acceso a la pantalla) para poder probarlas en Node.
//
// Producto: { id, nombre, referencia, codigoBarras, categoria, costo, precio, fotoId, lotes: [{ id, lote, vence, cantidad, ingreso }] }
// Consignación (registro de 'prestamos' con clase 'consignacion'):
//   productos: [{ productoId, loteId, descripcion, cantidad, valorUnitario, costo, vence }]
// Movimientos de la consignación (abonos): { tipo: 'pago'|'devolucion', detalle: [{ i, cantidad }] }

const hoy = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())).toISOString().slice(0, 10); };
export const diasPara = (iso, desde = hoy()) => (iso ? Math.round((Date.parse(iso) - Date.parse(desde)) / 86400000) : null);
export const uidLote = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * Calcula, para cada lote: ingresado, entregado en consignación, devuelto, vendido, en consignación y disponible.
 * consignaciones: registros con clase 'consignacion'; movimientosDe(id) devuelve sus abonos.
 */
export function existencias(productos, consignaciones, movimientosDe, { excluirConsignacion = null } = {}) {
  const porLote = {};
  for (const pr of productos) for (const l of pr.lotes || []) porLote[l.id] = { entregado: 0, devuelto: 0, vendido: 0, personas: [] };
  for (const c of consignaciones) {
    if (c.deleted || c.id === excluirConsignacion) continue;
    const items = c.productos || [];
    const mov = { dev: {}, ven: {} };
    for (const m of movimientosDe(c.id) || []) {
      if (m.deleted) continue;
      for (const d of m.detalle || []) {
        const k = m.tipo === 'devolucion' ? 'dev' : 'ven';
        mov[k][d.i] = (mov[k][d.i] || 0) + Number(d.cantidad || 0);
      }
    }
    items.forEach((it, i) => {
      const x = porLote[it.loteId]; if (!x) return;
      const cant = Number(it.cantidad || 0), dev = mov.dev[i] || 0, ven = mov.ven[i] || 0;
      x.entregado += cant; x.devuelto += dev; x.vendido += ven;
      const enPoder = cant - dev - ven;
      if (enPoder > 0) x.personas.push({ consignacionId: c.id, codigo: c.codigo, personaId: c.personaId, cantidad: enPoder, fechaLimite: c.fechaLimite });
    });
  }
  const resultado = {};
  for (const pr of productos) {
    const lotes = (pr.lotes || []).map(l => {
      const x = porLote[l.id];
      const ingresado = Number(l.cantidad || 0);
      return { ...l, ingresado, entregado: x.entregado, devuelto: x.devuelto, vendido: x.vendido,
        enConsignacion: x.entregado - x.devuelto - x.vendido, disponible: ingresado - x.entregado + x.devuelto, personas: x.personas };
    }).sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999'));
    const sum = k => lotes.reduce((s, l) => s + l[k], 0);
    const conStock = lotes.filter(l => l.disponible > 0 || l.enConsignacion > 0);
    resultado[pr.id] = { producto: pr, lotes, ingresado: sum('ingresado'), disponible: sum('disponible'), enConsignacion: sum('enConsignacion'), vendido: sum('vendido'),
      proximoVence: conStock.map(l => l.vence).filter(Boolean).sort()[0] || null };
  }
  return resultado;
}

/** Reparte una cantidad entre los lotes con existencia, primero los que vencen antes (FEFO). */
export function asignarFEFO(infoProducto, cantidad) {
  let resta = Number(cantidad || 0);
  const out = [];
  for (const l of infoProducto.lotes) {
    if (resta <= 0) break;
    if (l.disponible <= 0) continue;
    const t = Math.min(resta, l.disponible);
    out.push({ loteId: l.id, lote: l.lote, vence: l.vence || '', cantidad: t });
    resta -= t;
  }
  return { asignacion: out, faltante: resta };
}

/** Lotes que vencen en los próximos `dias` (o ya vencidos) y aún tienen unidades en bodega o en consignación. */
export function porVencer(info, dias = 30, desde = hoy()) {
  const out = [];
  for (const { producto, lotes } of Object.values(info)) for (const l of lotes) {
    if (!l.vence) continue;
    const d = diasPara(l.vence, desde);
    if (d > dias) continue;
    if (l.disponible > 0) out.push({ producto, lote: l, dias: d, donde: 'bodega', cantidad: l.disponible });
    for (const p of l.personas) out.push({ producto, lote: l, dias: d, donde: 'consignacion', cantidad: p.cantidad, ...p });
  }
  return out.sort((a, b) => a.dias - b.dias);
}

/** Valida que una consignación no entregue más de lo disponible por lote. Devuelve lista de errores. */
export function validarEntrega(items, info) {
  const pedido = {};
  for (const it of items) if (it.loteId) pedido[it.loteId] = (pedido[it.loteId] || 0) + Number(it.cantidad || 0);
  const errores = [];
  for (const [loteId, cant] of Object.entries(pedido)) {
    for (const { producto, lotes } of Object.values(info)) {
      const l = lotes.find(x => x.id === loteId);
      if (l && cant > l.disponible) errores.push(`${producto.nombre}${l.lote ? ' (lote ' + l.lote + ')' : ''}: hay ${l.disponible} disponibles y se piden ${cant}.`);
    }
  }
  return errores;
}

/** Ganancia de una consignación: esperada (todo vendido) y realizada (lo ya vendido). */
export function gananciaConsignacion(c, movimientos = []) {
  const items = c.productos || [];
  const ven = {};
  for (const m of movimientos) if (!m.deleted && m.tipo !== 'devolucion') for (const d of m.detalle || []) ven[d.i] = (ven[d.i] || 0) + Number(d.cantidad || 0);
  const dev = {};
  for (const m of movimientos) if (!m.deleted && m.tipo === 'devolucion') for (const d of m.detalle || []) dev[d.i] = (dev[d.i] || 0) + Number(d.cantidad || 0);
  let esperada = 0, realizada = 0, conCosto = false;
  items.forEach((it, i) => {
    if (it.costo == null || it.costo === '') return;
    conCosto = true;
    const margen = Number(it.valorUnitario || 0) - Number(it.costo || 0);
    esperada += margen * (Number(it.cantidad || 0) - (dev[i] || 0));
    realizada += margen * (ven[i] || 0);
  });
  return { conCosto, esperada, realizada };
}
