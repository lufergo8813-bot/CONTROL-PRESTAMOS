// Generación de PDF profesional (jsPDF + AutoTable, cargados bajo demanda y guardados en caché por el service worker).
import * as C from './calc.js';
import { textoPagare } from './legal.js';

const LIBS = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
];
let cargando = null;
function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src + ' (¿sin conexión la primera vez?)'));
    document.head.appendChild(s);
  });
}
export function cargarLibs() {
  if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve();
  cargando = cargando || LIBS.reduce((p, src) => p.then(() => cargarScript(src)), Promise.resolve());
  return cargando.catch(e => { cargando = null; throw e; });
}

const AZUL = [79, 68, 160], GRIS = [110, 104, 140], CLARO = [243, 241, 252], LINEA = [221, 216, 238];

export function formateador(aj) {
  const nf = new Intl.NumberFormat(aj.locale || 'es-CO', { style: 'currency', currency: aj.moneda || 'COP', minimumFractionDigits: Number(aj.decimales || 0), maximumFractionDigits: Number(aj.decimales || 0) });
  return v => nf.format(Number(v || 0)).replace(/ /g, ' ');
}
export function fechaLarga(iso, aj) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat(aj.locale || 'es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(C.toDate(iso)).replace('.', '');
}


// ---------- utilidades de maquetación compartidas ----------
function lienzo(aj) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 14;
  const L = { doc, W, M, y: 0 };
  L.encabezado = (titulo, lineas, derecha = []) => {
    doc.setFillColor(...AZUL); doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(titulo, M, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); lineas.forEach((l, i) => doc.text(l, M, 20 + i * 5));
    if (derecha[0]) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(String(derecha[0]), W - M, 13, { align: 'right' }); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    derecha.slice(1).filter(Boolean).forEach((l, i) => doc.text(String(l), W - M, 19 + i * 4.5, { align: 'right' }));
    L.y = 38;
  };
  L.salto = alto => { if (L.y + alto > 280) { doc.addPage(); L.y = 18; } };
  L.seccion = t => {
    L.salto(14);
    doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t, M, L.y);
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.line(M, L.y + 1.6, W - M, L.y + 1.6); L.y += 5;
  };
  L.tabla = opts => {
    doc.autoTable({
      startY: L.y, margin: { left: M, right: M, bottom: 18 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.8, lineColor: LINEA, lineWidth: 0.15, textColor: 30 },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [250, 249, 255] }, footStyles: { fillColor: CLARO, textColor: 20, fontStyle: 'bold' }, ...opts,
    });
    L.y = doc.lastAutoTable.finalY + 7;
  };
  L.parrafo = (texto, { size = 9, color = 40, bold = false, sangria = 0, alto = 4.2 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); Array.isArray(color) ? doc.setTextColor(...color) : doc.setTextColor(color);
    const t = doc.splitTextToSize(texto, W - 2 * M - sangria);
    for (const linea of t) { L.salto(alto); doc.text(linea, M + sangria, L.y); L.y += alto; }
    L.y += 1.5;
  };
  L.aviso = (texto, color = [255, 227, 211], tinta = [140, 60, 20]) => {
    doc.setFontSize(8.8); doc.setFont('helvetica', 'bold');
    const t = doc.splitTextToSize(texto, W - 2 * M - 8);
    const h = t.length * 4.1 + 5;
    L.salto(h + 2);
    doc.setFillColor(...color); doc.roundedRect(M, L.y - 1, W - 2 * M, h, 2, 2, 'F');
    doc.setTextColor(...tinta); doc.text(t, M + 4, L.y + 3.5); L.y += h + 4;
  };
  L.pie = texto => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      const H = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...LINEA); doc.setLineWidth(0.2); doc.line(M, H - 12, W - M, H - 12);
      doc.setFontSize(7); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(texto || '', W - 2 * M - 30), M, H - 8);
      doc.text(`Página ${i} de ${total}`, W - M, H - 8, { align: 'right' });
    }
  };
  return L;
}
const textoUsura = (aj) => {
  const mes = C.hoyISO().slice(0, 7), u = C.usuraDelMes(C.hoyISO());
  return u ? `${u.toLocaleString(aj.locale || 'es-CO')}% E.A. (${C.eaAMensual(u).toFixed(2)}% mensual) para ${mes}` : 'la certificada por la Superfinanciera para cada mes';
};

/**
 * tipo: 'condiciones' | 'estado'
 * ctx: { prestamo, persona, acreedor, cuentaOrigen, abonos, ajustes, fechaCorte }
 */
export async function generarPDF(tipo, ctx) {
  await cargarLibs();
  const { prestamo: p, persona = {}, cuentaOrigen, abonos = [], ajustes: aj } = ctx;
  const acreedor = ctx.acreedor || { nombre: p.prestadoPor || aj.prestamistaNombre, documento: aj.prestamistaDoc, telefono: aj.prestamistaTel, email: aj.prestamistaEmail };
  const dec = Number(aj.decimales || 0);
  const $ = formateador(aj), F = iso => fechaLarga(iso, aj);
  const corte = ctx.fechaCorte || C.hoyISO();
  const est = C.estadoCuenta(p, abonos, corte, dec);
  const crono = est.cronograma;
  const esCons = p.clase === 'consignacion';
  const L = lienzo(aj), { doc, W, M } = L;

  L.encabezado(tipo === 'condiciones' ? (esCons ? 'CONDICIONES DE LA CONSIGNACIÓN' : 'CONDICIONES DEL PRÉSTAMO') : 'ESTADO DE CUENTA',
    [`Referencia: ${p.codigo || p.id.slice(0, 8)}`, `Emitido: ${F(C.hoyISO())}${tipo === 'estado' ? `   ·   Corte: ${F(corte)}` : ''}`],
    [acreedor.nombre || 'Prestamista', acreedor.documento && `Doc.: ${acreedor.documento}`, acreedor.telefono, acreedor.email || aj.replyTo]);

  // Partes
  const caja = (x, w, etiqueta, lineas) => {
    doc.setFillColor(...CLARO); doc.roundedRect(x, L.y, w, 24, 2, 2, 'F');
    doc.setTextColor(...GRIS); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.text(etiqueta, x + 4, L.y + 5.5);
    doc.setTextColor(20); doc.setFontSize(10.5); doc.text(String(lineas[0] || '-'), x + 4, L.y + 11.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60);
    lineas.slice(1).filter(Boolean).slice(0, 2).forEach((l, i) => doc.text(String(l), x + 4, L.y + 16.5 + i * 4.3));
  };
  const half = (W - 2 * M - 6) / 2;
  caja(M, half, esCons ? 'RECIBE LA MERCANCÍA' : 'DEUDOR', [persona.nombre, persona.documento && `Doc.: ${persona.documento}`, [persona.telefono, persona.email].filter(Boolean).join('  ·  ')]);
  caja(M + half + 6, half, esCons ? 'ENTREGA' : 'PRESTAMISTA', [acreedor.nombre, acreedor.documento && `Doc.: ${acreedor.documento}`, cuentaOrigen ? `Cuenta origen: ${cuentaOrigen.nombre}` : '']);
  L.y += 31;

  if (tipo === 'estado') {
    L.seccion('Resumen al ' + F(corte));
    const kpis = [['Capital pendiente', est.capital], ['Intereses pendientes', est.interesPendiente + est.adminPendiente], ['Intereses de mora', est.moraPendiente], ['TOTAL PARA SALDAR', est.totalParaSaldar]];
    const kw = (W - 2 * M - 9) / 4;
    kpis.forEach(([l, v], i) => {
      const x = M + i * (kw + 3), ult = i === 3;
      doc.setFillColor(...(ult ? AZUL : CLARO)); doc.roundedRect(x, L.y, kw, 16, 2, 2, 'F');
      doc.setTextColor(...(ult ? [255, 255, 255] : GRIS)); doc.setFontSize(7.2); doc.setFont('helvetica', 'bold'); doc.text(l, x + 3, L.y + 5);
      doc.setTextColor(...(ult ? [255, 255, 255] : [20, 20, 20])); doc.setFontSize(11.5); doc.text($(v), x + 3, L.y + 12);
    });
    L.y += 21;
    const filas = [['Total pagado', $(est.pagado)], ['   Aplicado a capital', $(est.capitalPagado)], ['   Aplicado a intereses', $(est.interesPagado)], ['   Aplicado a administración', $(est.adminPagado)], ['   Aplicado a mora', $(est.moraPagada)]];
    if (est.devuelto) filas.push(['Mercancía devuelta', $(est.devuelto)]);
    filas.push(['Estado', C.ESTADOS[est.estado].label]);
    if (crono.filas.length) filas.push(['Valor vencido según plan', $(est.atraso)], ['Cuotas vencidas sin cubrir', String(est.cuotasVencidas)]);
    if (est.capitalVencido) filas.push(['Capital en mora', $(est.capitalVencido)]);
    if (est.proxima) filas.push(['Próxima cuota', `${F(est.proxima.fecha)}  - ${$(est.proxima.pendiente)}`]);
    if (est.saldoFavor > 0) filas.push(['Saldo a favor del deudor', $(est.saldoFavor)]);
    L.tabla({ body: filas, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.4 }, columnStyles: { 0: { textColor: GRIS }, 1: { halign: 'right', fontStyle: 'bold' } } });
  }

  L.seccion(esCons ? 'Condiciones de la consignación' : 'Condiciones pactadas');
  const im = C.tasaMensual(p.interes), a = p.admin || { tipo: 'ninguno' }, pl = p.plan || { tipo: 'libre' };
  const cond = [[esCons ? 'Valor de la mercancía' : 'Monto prestado', $(p.monto)], [esCons ? 'Fecha de entrega' : 'Fecha del préstamo', F(p.fecha)],
    ['Interés remuneratorio', im ? `${p.interes.tasa}% ${C.TIPOS_TASA[p.interes.tipo].toLowerCase()}${p.interes.tipo !== 'mensual' ? ` (${(im * 100).toFixed(4)}% mensual)` : ''}` : 'Sin interés']];
  if (!esCons) cond.push(['Administración', a.tipo === 'ninguno' || !a.tipo ? 'No aplica' : a.tipo === 'pct_saldo' ? `${a.valor}% mensual sobre saldo` : `${$(a.valor)} ${a.tipo === 'unico' ? '(único)' : 'por mes'}`]);
  cond.push(['Interés de mora', p.mora?.activa === false ? 'No se cobra' : `Tasa máxima legal vigente: ${textoUsura(aj)}`]);
  cond.push(['Forma de pago', esCons ? 'Pago de lo vendido y devolución de lo no vendido' : C.TIPOS_PLAN[pl.tipo]]);
  if (['cuotas_iguales', 'interes_periodico'].includes(pl.tipo)) cond.push(['Número y periodicidad', `${pl.numCuotas} cuotas, ${pl.periodo === 'dias' ? `cada ${pl.diasPeriodo} días` : C.PERIODOS[pl.periodo].label.toLowerCase()}`]);
  if (pl.tipo === 'cuotas_iguales') cond.push(['Cuota (capital + interés)', $(crono.cuotaBase)]);
  if (crono.filas.length) cond.push(['Primera / última cuota', `${F(crono.filas[0].fecha)} / ${F(crono.filas[crono.filas.length - 1].fecha)}`], ['Total a pagar según plan', $(crono.totales.cuota)], ['Total intereses + administración', $(crono.ganancia)]);
  cond.push([esCons ? 'Fecha límite de liquidación' : 'Fecha límite de pago', p.fechaLimite ? F(p.fechaLimite) : 'No definida']);
  if (p.cuentaDeudor?.numero) cond.push(['Cuenta de desembolso', [p.cuentaDeudor.tipo, p.cuentaDeudor.numero, p.cuentaDeudor.banco].filter(Boolean).join(' · ')]);
  if (cuentaOrigen) cond.push(['Desembolsado desde', `${cuentaOrigen.nombre}${cuentaOrigen.banco ? '  - ' + cuentaOrigen.banco : ''}`]);
  L.tabla({ body: cond, theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 62, textColor: GRIS }, 1: { fontStyle: 'bold' } } });
  if (p.mora?.activa !== false) L.aviso('ADVERTENCIA: si un pago no se realiza en la fecha acordada, desde el día siguiente el capital vencido causará intereses de mora a la tasa máxima legal permitida (tasa de usura certificada por la Superintendencia Financiera de Colombia para cada mes) hasta su pago total.');

  if (esCons && p.productos?.length) {
    L.seccion('Mercancía entregada');
    const inv = inventario(p, abonos);
    L.tabla({ head: [['Producto', 'Entregado', 'Vendido', 'Devuelto', 'En poder', 'Valor unit.', 'Valor total']],
      body: inv.map(x => [x.descripcion, x.cantidad, x.vendido, x.devuelto, x.enPoder, $(x.valorUnitario), $(x.cantidad * x.valorUnitario)]),
      foot: [['TOTAL', inv.reduce((s, x) => s + x.cantidad, 0), inv.reduce((s, x) => s + x.vendido, 0), inv.reduce((s, x) => s + x.devuelto, 0), inv.reduce((s, x) => s + x.enPoder, 0), '', $(p.monto)]],
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' } }, showFoot: 'lastPage' });
  }

  if (crono.filas.length) {
    L.seccion('Plan de pagos');
    const head = ['N°', 'Fecha', 'Capital', 'Interés', 'Admón.', 'Cuota total', 'Saldo capital'];
    const body = crono.filas.map(f => [f.tipo === 'extra' ? 'Extra' : f.n, F(f.fecha), $(f.capital), $(f.interes), $(f.admin), $(f.cuota), $(f.saldoFinal)]);
    L.tabla({ head: [head], body, foot: [['', 'TOTAL', $(crono.totales.capital), $(crono.totales.interes), $(crono.totales.admin), $(crono.totales.cuota), '']],
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i < 2 ? 'center' : 'right' }])), showFoot: 'lastPage' });
    crono.advertencias.forEach(t => L.parrafo('Atención: ' + t, { size: 8, color: [170, 60, 20] }));
  }

  if (tipo === 'estado') {
    L.seccion('Historial de pagos');
    if (!est.movimientos.length) L.parrafo('No se han registrado pagos.', { color: GRIS });
    else L.tabla({ head: [['Fecha', 'Tipo', 'Valor', 'A mora', 'A admón.', 'A interés', 'A capital', 'Saldo capital']],
      body: est.movimientos.map(m => [F(m.fecha), m.tipo === 'devolucion' ? 'Devolución' : 'Pago', $(m.valor), $(m.aMora), $(m.aAdmin), $(m.aInteres), $(m.aCapital), $(m.saldoCapital)]),
      foot: [['TOTAL', '', $(est.pagado + est.devuelto), $(est.moraPagada), $(est.adminPagado), $(est.interesPagado), $(est.capitalPagado + est.devuelto), '']],
      columnStyles: { 0: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } }, showFoot: 'lastPage' });
  }

  L.seccion('Cómo se calculan los valores');
  for (const linea of C.explicacion(p, $)) L.parrafo('- ' + linea, { size: 8.6, color: 50, alto: 4 });
  if (p.notas) { L.seccion('Notas'); L.parrafo(p.notas); }

  if (tipo === 'condiciones' && ctx.firmas !== false) {
    L.salto(34); L.y += 16;
    const fw = (W - 2 * M - 20) / 2;
    doc.setDrawColor(80); doc.setLineWidth(0.3);
    [[M, acreedor.nombre || 'Prestamista', acreedor.documento], [M + fw + 20, persona.nombre || 'Deudor', persona.documento]].forEach(([x, n, d]) => {
      doc.line(x, L.y, x + fw, L.y);
      doc.setFontSize(9); doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.text(String(n), x, L.y + 5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS); doc.text(d ? `Doc.: ${d}` : 'Documento:', x, L.y + 9.5);
    });
  }
  L.pie(aj.piePdf);
  return doc;
}

/** Inventario de una consignación: entregado, vendido (pagado), devuelto y en poder del deudor. */
export function inventario(p, movimientos = []) {
  const prod = (p.productos || []).map(x => ({ ...x, cantidad: Number(x.cantidad || 0), valorUnitario: Number(x.valorUnitario || 0), vendido: 0, devuelto: 0 }));
  for (const m of movimientos.filter(m => !m.deleted)) for (const d of m.detalle || []) {
    const it = prod[d.i]; if (!it) continue;
    if (m.tipo === 'devolucion') it.devuelto += Number(d.cantidad || 0); else it.vendido += Number(d.cantidad || 0);
  }
  return prod.map(x => ({ ...x, enPoder: x.cantidad - x.vendido - x.devuelto }));
}

/**
 * Pagaré en PDF. firma (opcional): { nombre, documento, imagen (dataURL), fecha, metodo, dispositivo, huella, correo }.
 */
export async function generarPagarePDF(d, { firma = null, ajustes: aj = {} } = {}) {
  await cargarLibs();
  const t = textoPagare(d);
  const fmt = formateador({ ...aj, locale: d.locale, moneda: d.moneda, decimales: 0 });
  const F = iso => fechaLarga(iso, { locale: d.locale });
  const L = lienzo(aj), { doc, W, M } = L;
  L.encabezado(t.titulo, [`Valor: ${fmt(d.valor)}`, `Creado en ${d.ciudad || '-'} el ${F(d.fechaCreacion)}`], [d.acreedor.nombre, `${d.acreedor.tipoDoc} ${d.acreedor.documento || ''}`]);
  L.tabla({ body: t.encabezado, theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 48, textColor: GRIS }, 1: { fontStyle: 'bold' } } });
  L.parrafo(t.cuerpo, { size: 9.6, alto: 4.6 });
  t.clausulas.forEach((c, i) => L.parrafo(`${['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA', 'UNDÉCIMA', 'DUODÉCIMA'][i] || i + 1}. ${c.t.toUpperCase()}: ${c.x}`, { size: 9, alto: 4.3 }));
  if (d.cuotas.length) {
    L.seccion('Plan de pagos (hace parte integral de este pagaré)');
    L.tabla({ head: [['N°', 'Fecha', 'Capital', 'Interés', 'Admón.', 'Total cuota']], body: d.cuotas.map(c => [c.n, F(c.fecha), fmt(c.capital), fmt(c.interes), fmt(c.admin), fmt(c.total)]),
      columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } });
  }
  if (d.productos?.length) {
    L.seccion('Mercancía entregada en consignación');
    L.tabla({ head: [['Producto', 'Cantidad', 'Valor unitario', 'Total']], body: d.productos.map(x => [x.descripcion, x.cantidad, fmt(x.valorUnitario), fmt(x.cantidad * x.valorUnitario)]), columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  }
  L.parrafo(t.cierre, { size: 9.6 });
  // Bloque de firma del deudor
  L.salto(62); L.y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30); doc.text('EL DEUDOR (OTORGANTE)', M, L.y); L.y += 4;
  const yFirma = L.y;
  if (firma?.imagen) doc.addImage(firma.imagen, 'PNG', M, yFirma, 70, 26);
  L.y = yFirma + 28;
  doc.setDrawColor(60); doc.setLineWidth(0.3); doc.line(M, L.y, M + 85, L.y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(40);
  [`Firma`, `Nombre: ${firma?.nombre || d.deudor.nombre}`, `${d.deudor.tipoDoc} No. ${firma?.documento || d.deudor.documento || '____________________'}`, `Dirección: ${d.deudor.direccion || '____________________'}`, `Teléfono: ${d.deudor.telefono || '____________________'}`]
    .forEach((l, i) => doc.text(l, M, L.y + 4.5 + i * 4.5));
  doc.setDrawColor(120); doc.rect(W - M - 30, yFirma, 30, 36);
  doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text('Huella índice derecho', W - M - 15, yFirma + 40, { align: 'center' });
  L.y += 30;
  if (firma) {
    L.seccion('Constancia de firma electrónica');
    L.tabla({ body: [['Firmante', `${firma.nombre} - ${d.deudor.tipoDoc} ${firma.documento}`], ['Fecha y hora', new Date(firma.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) + ' (hora de Colombia)'],
      ['Método', firma.metodo], ...(firma.correo ? [['Correo verificado', firma.correo]] : []), ['Dispositivo', String(firma.dispositivo || '').slice(0, 160)], ['Huella del documento (SHA-256)', firma.huella]],
      theme: 'plain', styles: { fontSize: 7.8, cellPadding: 1.2 }, columnStyles: { 0: { cellWidth: 50, textColor: GRIS } } });
    L.parrafo('La huella SHA-256 identifica de forma única el contenido firmado: cualquier cambio en los datos del pagaré produce una huella distinta.', { size: 7.6, color: GRIS });
  }
  L.pie(`Pagaré ${d.numero}. ${firma ? 'Firmado electrónicamente (Ley 527 de 1999, Decreto 2364 de 2012).' : 'Para firma manuscrita y huella.'}`);
  return doc;
}

/** Informe de flujo de caja y cartera. */
export async function generarInformePDF({ flujo, resumen, personas = [], ajustes: aj }) {
  await cargarLibs();
  const $ = formateador(aj), L = lienzo(aj);
  const mesTxt = k => new Intl.DateTimeFormat(aj.locale || 'es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(C.toDate(k + '-01'));
  L.encabezado('INFORME DE CARTERA Y FLUJO DE CAJA', [`Corte: ${fechaLarga(C.hoyISO(), aj)}`], [aj.prestamistaNombre || '']);
  L.seccion('Resumen');
  L.tabla({ body: resumen.map(([k, v]) => [k, $(v)]), theme: 'plain', styles: { fontSize: 9.5, cellPadding: 1.6 }, columnStyles: { 0: { textColor: GRIS }, 1: { halign: 'right', fontStyle: 'bold' } } });
  L.seccion('Flujo de caja esperado por mes');
  L.tabla({ head: [['Mes', 'Cobros esperados', 'N° de cuotas']], body: flujo.meses.map(m => [mesTxt(m.mes), $(m.valor), m.detalle.length]), foot: [['TOTAL', $(flujo.totalProyectado), flujo.meses.reduce((s, m) => s + m.detalle.length, 0)]], columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } } });
  const det = flujo.meses.flatMap(m => m.detalle).slice(0, 80);
  if (det.length) { L.seccion('Detalle de cobros esperados'); L.tabla({ head: [['Fecha', 'Persona', 'Referencia', 'Valor']], body: det.map(x => [fechaLarga(x.fecha, aj), x.nombre, x.prestamo.codigo || '', $(x.valor)]), columnStyles: { 3: { halign: 'right' } } }); }
  L.seccion('Personas que no están al día');
  if (!flujo.vencidos.length) L.parrafo('Todas las personas están al día.', { color: GRIS });
  else L.tabla({ head: [['Persona', 'Referencia', 'Estado', 'Vencido desde', 'Valor vencido', 'Score']], body: flujo.vencidos.map(v => [v.nombre, v.prestamo.codigo || '', C.ESTADOS[v.estado].label, v.desde ? fechaLarga(v.desde, aj) : '-', $(v.valor), personas.find(p => p.nombre === v.nombre)?.score || '']), foot: [['TOTAL', '', '', '', $(flujo.totalVencido), '']], columnStyles: { 4: { halign: 'right' } } });
  L.pie(aj.piePdf);
  return L.doc;
}

export function nombreArchivo(tipo, prestamo, persona) {
  const n = (persona?.nombre || 'deudor').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  const pref = { condiciones: 'Condiciones', estado: 'Estado_cuenta', pagare: 'Pagare', pagare_firmado: 'Pagare_firmado' }[tipo] || tipo;
  return `${pref}_${prestamo?.codigo || prestamo?.id?.slice(0, 8) || ''}_${n}_${C.hoyISO()}.pdf`;
}
export const pdfBase64 = doc => doc.output('datauristring').split(',')[1];
