// Generación de PDF profesional (jsPDF + AutoTable, cargados bajo demanda y guardados en caché por el service worker).
import * as C from './calc.js';

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

/**
 * tipo: 'condiciones' | 'estado'
 * ctx: { prestamo, persona, cuentaOrigen, cuentas, abonos, ajustes, fechaCorte }
 */
export async function generarPDF(tipo, ctx) {
  await cargarLibs();
  const { jsPDF } = window.jspdf;
  const { prestamo: p, persona = {}, cuentaOrigen, abonos = [], ajustes: aj } = ctx;
  const dec = Number(aj.decimales || 0);
  const $ = formateador(aj), F = iso => fechaLarga(iso, aj);
  const corte = ctx.fechaCorte || C.hoyISO();
  const est = C.estadoCuenta(p, abonos, corte, dec);
  const crono = est.cronograma;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 14;
  const titulo = tipo === 'condiciones' ? 'CONDICIONES DEL PRÉSTAMO' : 'ESTADO DE CUENTA';

  // Encabezado
  doc.setFillColor(...AZUL); doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(titulo, M, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(`Referencia: ${p.codigo || p.id.slice(0, 8)}`, M, 20);
  doc.text(`Emitido: ${F(C.hoyISO())}${tipo === 'estado' ? `   ·   Corte: ${F(corte)}` : ''}`, M, 25);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(aj.prestamistaNombre || 'Prestamista', W - M, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  [aj.prestamistaDoc && `Doc.: ${aj.prestamistaDoc}`, aj.prestamistaTel, aj.prestamistaEmail || aj.replyTo]
    .filter(Boolean).forEach((l, i) => doc.text(String(l), W - M, 19 + i * 4.5, { align: 'right' }));

  // Partes
  let y = 38;
  const caja = (x, w, etiqueta, lineas) => {
    doc.setFillColor(...CLARO); doc.roundedRect(x, y, w, 24, 2, 2, 'F');
    doc.setTextColor(...GRIS); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.text(etiqueta, x + 4, y + 5.5);
    doc.setTextColor(20); doc.setFontSize(10.5); doc.text(String(lineas[0] || '-'), x + 4, y + 11.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60);
    lineas.slice(1).filter(Boolean).slice(0, 2).forEach((l, i) => doc.text(String(l), x + 4, y + 16.5 + i * 4.3));
  };
  const half = (W - 2 * M - 6) / 2;
  caja(M, half, 'DEUDOR', [persona.nombre, persona.documento && `Doc.: ${persona.documento}`, [persona.telefono, persona.email].filter(Boolean).join('  ·  ')]);
  caja(M + half + 6, half, 'PRESTAMISTA', [p.prestadoPor || aj.prestamistaNombre, aj.prestamistaDoc && `Doc.: ${aj.prestamistaDoc}`, cuentaOrigen ? `Cuenta origen: ${cuentaOrigen.nombre}` : '']);
  y += 31;

  const seccion = t => {
    if (y > 265) { doc.addPage(); y = 18; }
    doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t, M, y);
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.line(M, y + 1.6, W - M, y + 1.6); y += 5;
  };
  const tabla = (opts) => {
    doc.autoTable({
      startY: y, margin: { left: M, right: M, bottom: 18 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.8, lineColor: LINEA, lineWidth: 0.15, textColor: 30 },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [250, 249, 255] },
      footStyles: { fillColor: CLARO, textColor: 20, fontStyle: 'bold' },
      ...opts,
    });
    y = doc.lastAutoTable.finalY + 7;
  };

  // Resumen (estado de cuenta)
  if (tipo === 'estado') {
    seccion('Resumen al ' + F(corte));
    const kpis = [['Capital pendiente', est.capital], ['Interés pendiente', est.interesPendiente], ['Administración pendiente', est.adminPendiente], ['TOTAL PARA SALDAR', est.totalParaSaldar]];
    const kw = (W - 2 * M - 9) / 4;
    kpis.forEach(([l, v], i) => {
      const x = M + i * (kw + 3), ult = i === 3;
      doc.setFillColor(...(ult ? AZUL : CLARO)); doc.roundedRect(x, y, kw, 16, 2, 2, 'F');
      doc.setTextColor(...(ult ? [255, 255, 255] : GRIS)); doc.setFontSize(7.2); doc.setFont('helvetica', 'bold'); doc.text(l, x + 3, y + 5);
      doc.setTextColor(...(ult ? [255, 255, 255] : [20, 20, 20])); doc.setFontSize(11.5); doc.text($(v), x + 3, y + 12);
    });
    y += 21;
    const filas = [['Total pagado', $(est.pagado)], ['   Aplicado a capital', $(est.capitalPagado)], ['   Aplicado a intereses', $(est.interesPagado)], ['   Aplicado a administración', $(est.adminPagado)], ['Estado', C.ESTADOS[est.estado].label]];
    if (crono.filas.length) filas.push(['Valor vencido según plan', $(est.atraso)], ['Cuotas vencidas sin cubrir', String(est.cuotasVencidas)]);
    if (est.proxima) filas.push(['Próxima cuota', `${F(est.proxima.fecha)}  - ${$(est.proxima.pendiente)}`]);
    if (est.saldoFavor > 0) filas.push(['Saldo a favor del deudor', $(est.saldoFavor)]);
    tabla({ body: filas, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.4 }, columnStyles: { 0: { textColor: GRIS }, 1: { halign: 'right', fontStyle: 'bold' } } });
  }

  // Condiciones
  seccion('Condiciones pactadas');
  const im = C.tasaMensual(p.interes);
  const a = p.admin || { tipo: 'ninguno' };
  const pl = p.plan || { tipo: 'libre' };
  const cond = [
    ['Monto prestado', $(p.monto)], ['Fecha del préstamo', F(p.fecha)],
    ['Tasa de interés', im ? `${p.interes.tasa}% ${C.TIPOS_TASA[p.interes.tipo].toLowerCase()}` : 'Sin interés'],
  ];
  if (im && p.interes.tipo !== 'mensual') cond.push(['Tasa mensual equivalente', `${(im * 100).toFixed(4)}%`]);
  cond.push(['Administración', a.tipo === 'ninguno' || !a.tipo ? 'No aplica' : a.tipo === 'pct_saldo' ? `${a.valor}% mensual sobre saldo` : `${$(a.valor)} ${a.tipo === 'unico' ? '(único)' : 'por mes'}`]);
  cond.push(['Forma de pago', C.TIPOS_PLAN[pl.tipo]]);
  if (pl.tipo === 'cuotas_iguales') cond.push(['Número y periodicidad', `${pl.numCuotas} cuotas ${C.PERIODOS[pl.periodo].label.toLowerCase()}es`], ['Cuota (capital + interés)', $(crono.cuotaBase)]);
  if (crono.filas.length) cond.push(['Primera / última cuota', `${F(crono.filas[0].fecha)} / ${F(crono.filas[crono.filas.length - 1].fecha)}`], ['Total a pagar según plan', $(crono.totales.cuota)], ['Total intereses + administración', $(crono.totales.interes + crono.totales.admin)]);
  cond.push(['Fecha límite de pago', p.fechaLimite ? F(p.fechaLimite) : 'No definida']);
  if (cuentaOrigen) cond.push(['Desembolsado desde', `${cuentaOrigen.nombre}${cuentaOrigen.banco ? '  - ' + cuentaOrigen.banco : ''}`]);
  if (ctx.cuentaPago) cond.push(['Cuenta para pagos', ctx.cuentaPago]);
  tabla({ body: cond, theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 70, textColor: GRIS }, 1: { fontStyle: 'bold' } } });

  // Plan de pagos
  if (crono.filas.length) {
    seccion('Plan de pagos');
    const hayAdmin = crono.filas.some(f => f.admin);
    const head = ['N°', 'Fecha', 'Saldo inicial', 'Interés', ...(hayAdmin ? ['Admón.'] : []), 'Capital', 'Cuota', 'Saldo final'];
    const body = crono.filas.map(f => [f.n, F(f.fecha), $(f.saldoInicial), $(f.interes), ...(hayAdmin ? [$(f.admin)] : []), $(f.capital), $(f.cuota), $(f.saldoFinal)]);
    const foot = [['', 'TOTAL', '', $(crono.totales.interes), ...(hayAdmin ? [$(crono.totales.admin)] : []), $(crono.totales.capital), $(crono.totales.cuota), '']];
    const num = Object.fromEntries(head.map((_, i) => [i, { halign: i < 2 ? 'center' : 'right' }]));
    tabla({ head: [head], body, foot: [foot[0]], columnStyles: num, showFoot: 'lastPage' });
    if (crono.advertencias.length) { doc.setFontSize(8); doc.setTextColor(170, 60, 20); crono.advertencias.forEach(t => { doc.text('Atención: ' + t, M, y - 3, { maxWidth: W - 2 * M }); y += 4.5; }); y += 2; }
  }

  // Abonos
  if (tipo === 'estado') {
    seccion('Historial de pagos');
    if (!est.movimientos.length) { doc.setFontSize(9); doc.setTextColor(...GRIS); doc.text('No se han registrado pagos.', M, y + 2); y += 9; }
    else {
      const body = est.movimientos.map((m, i) => [i + 1, F(m.fecha), $(m.valor), $(m.aAdmin), $(m.aInteres), $(m.aCapital), $(m.saldoCapital)]);
      tabla({ head: [['N°', 'Fecha', 'Valor pagado', 'A admón.', 'A interés', 'A capital', 'Saldo capital']], body,
        foot: [['', 'TOTAL', $(est.pagado), $(est.adminPagado), $(est.interesPagado), $(est.capitalPagado), '']],
        columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }, showFoot: 'lastPage' });
    }
  }

  // Explicación de cálculos
  seccion('Cómo se calculan los valores');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(50);
  for (const linea of C.explicacion(p, $)) {
    const t = doc.splitTextToSize('- ' + linea, W - 2 * M);
    if (y + t.length * 4 > 278) { doc.addPage(); y = 18; }
    doc.text(t, M, y + 1); y += t.length * 4 + 1;
  }
  y += 3;

  if (p.notas) {
    seccion('Notas');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40);
    const t = doc.splitTextToSize(p.notas, W - 2 * M);
    doc.text(t, M, y + 1); y += t.length * 4.3 + 4;
  }

  if (tipo === 'condiciones' && ctx.firmas !== false) {
    if (y > 245) { doc.addPage(); y = 30; } else y += 14;
    const fw = (W - 2 * M - 20) / 2;
    doc.setDrawColor(80); doc.setLineWidth(0.3);
    [[M, aj.prestamistaNombre || 'Prestamista', aj.prestamistaDoc], [M + fw + 20, persona.nombre || 'Deudor', persona.documento]].forEach(([x, n, d]) => {
      doc.line(x, y, x + fw, y);
      doc.setFontSize(9); doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.text(String(n), x, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRIS); doc.text(d ? `Doc.: ${d}` : 'Documento:', x, y + 9.5);
    });
  }

  // Pie de página
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.2); doc.line(M, H - 12, W - M, H - 12);
    doc.setFontSize(7); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(aj.piePdf || '', W - 2 * M - 30), M, H - 8);
    doc.text(`Página ${i} de ${total}`, W - M, H - 8, { align: 'right' });
  }
  return doc;
}

export function nombreArchivo(tipo, prestamo, persona) {
  const n = (persona?.nombre || 'deudor').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
  return `${tipo === 'condiciones' ? 'Condiciones' : 'Estado_cuenta'}_${prestamo.codigo || prestamo.id.slice(0, 8)}_${n}_${C.hoyISO()}.pdf`;
}
export const pdfBase64 = doc => doc.output('datauristring').split(',')[1];
