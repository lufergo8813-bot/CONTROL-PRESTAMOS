// Excel del inventario a la fecha (ExcelJS, cargado bajo demanda). Con o sin fotos.
import * as S from './store.js';
import * as I from './inventario.js';
import { obtenerFoto } from './fotos.js';
import { aj, persona, abonosDe } from './comun.js';

const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
let carga = null;
function cargar() {
  if (window.ExcelJS) return Promise.resolve();
  carga = carga || new Promise((ok, mal) => { const s = document.createElement('script'); s.src = EXCELJS; s.onload = ok; s.onerror = () => { carga = null; mal(new Error('No se pudo cargar el generador de Excel (¿sin internet la primera vez?)')); }; document.head.appendChild(s); });
  return carga;
}

export function infoInventario() {
  const productos = S.listar('productos');
  const cons = S.listar('prestamos').filter(p => p.clase === 'consignacion');
  return I.existencias(productos, cons, abonosDe);
}

const MORADO = 'FF4F44A0', LILA = 'FFEFECFB';
function encabezado(ws, fila) {
  const r = ws.getRow(fila);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.alignment = { vertical: 'middle', wrapText: true };
  r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MORADO } }; });
  r.height = 30;
}

/** Devuelve { base64, nombre, bytes }. */
export async function excelInventario({ conFotos = false, diasAlerta = 30 } = {}) {
  await cargar();
  const a = aj(), hoy = new Date().toISOString().slice(0, 10);
  const info = infoInventario();
  const wb = new window.ExcelJS.Workbook();
  wb.creator = a.prestamistaNombre || 'Mis Préstamos'; wb.created = new Date();
  const fmtMoneda = '"$"#,##0';

  // ---- Hoja 1: inventario por lote ----
  const ws = wb.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 3 }] });
  const cols = [
    ...(conFotos ? [{ header: 'Foto', key: 'foto', width: 11 }] : []),
    { header: 'Producto', key: 'nombre', width: 30 }, { header: 'Referencia', key: 'ref', width: 14 }, { header: 'Código de barras', key: 'barras', width: 17 },
    { header: 'Categoría', key: 'cat', width: 14 }, { header: 'Lote', key: 'lote', width: 10 }, { header: 'Vence', key: 'vence', width: 12 }, { header: 'Días para vencer', key: 'dias', width: 10 },
    { header: 'Ingresado', key: 'ing', width: 10 }, { header: 'En bodega', key: 'disp', width: 10 }, { header: 'En consignación', key: 'cons', width: 13 }, { header: 'Vendido', key: 'ven', width: 9 },
    { header: 'Costo unit.', key: 'costo', width: 12 }, { header: 'Precio unit.', key: 'precio', width: 12 },
    { header: 'Valor bodega (costo)', key: 'vb', width: 15 }, { header: 'Valor en consignación (precio)', key: 'vc', width: 17 },
  ];
  ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = `Inventario a la fecha · ${hoy}${a.prestamistaNombre ? ' · ' + a.prestamistaNombre : ''}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: MORADO } };
  ws.getRow(3).values = cols.map(c => c.header);
  encabezado(ws, 3);
  let fila = 4;
  const productos = Object.values(info).sort((x, y) => (x.producto.categoria || '').localeCompare(y.producto.categoria || '') || x.producto.nombre.localeCompare(y.producto.nombre));
  for (const { producto: p, lotes } of productos) {
    const lista = lotes.length ? lotes : [{ lote: '', vence: '', ingresado: 0, disponible: 0, enConsignacion: 0, vendido: 0 }];
    for (const l of lista) {
      const dias = I.diasPara(l.vence, hoy);
      const r = ws.getRow(fila);
      r.values = { nombre: p.nombre, ref: p.referencia || '', barras: p.codigoBarras || '', cat: p.categoria || '', lote: l.lote || '', vence: l.vence ? new Date(l.vence + 'T00:00:00') : '', dias: dias ?? '',
        ing: l.ingresado, disp: l.disponible, cons: l.enConsignacion, ven: l.vendido, costo: Number(p.costo || 0), precio: Number(p.precio || 0),
        vb: { formula: `${col(ws, 'disp')}${fila}*${col(ws, 'costo')}${fila}` }, vc: { formula: `${col(ws, 'cons')}${fila}*${col(ws, 'precio')}${fila}` } };
      ['costo', 'precio', 'vb', 'vc'].forEach(k => (r.getCell(k).numFmt = fmtMoneda));
      r.getCell('vence').numFmt = 'dd/mm/yyyy';
      r.getCell('barras').numFmt = '@';
      if (dias != null && dias <= diasAlerta && (l.disponible > 0 || l.enConsignacion > 0)) r.getCell('dias').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dias < 0 ? 'FFF9C4D2' : 'FFFFE3D3' } };
      if (fila % 2 === 1) r.eachCell({ includeEmpty: true }, c => { if (!c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF9FF' } }; });
      r.alignment = { vertical: 'middle' };
      if (conFotos && p.fotoId) {
        const f = await obtenerFoto(p.fotoId);
        if (f?.mini) {
          const id = wb.addImage({ base64: f.mini.split(',')[1], extension: 'jpeg' });
          ws.addImage(id, { tl: { col: 0.1, row: fila - 1 + 0.08 }, ext: { width: 64, height: 64 } });
          r.height = 52;
        }
      }
      fila++;
    }
  }
  const tot = ws.getRow(fila);
  tot.getCell('nombre').value = 'TOTAL';
  ['ing', 'disp', 'cons', 'ven', 'vb', 'vc'].forEach(k => { tot.getCell(k).value = { formula: `SUM(${col(ws, k)}4:${col(ws, k)}${fila - 1})` }; });
  ['vb', 'vc'].forEach(k => (tot.getCell(k).numFmt = fmtMoneda));
  tot.font = { bold: true }; tot.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LILA } }; });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };

  // ---- Hoja 2: mercancía en consignación por persona ----
  const w2 = wb.addWorksheet('En consignación', { views: [{ state: 'frozen', ySplit: 1 }] });
  w2.columns = [{ header: 'Persona', key: 'per', width: 26 }, { header: 'Consignación', key: 'cod', width: 15 }, { header: 'Fecha límite', key: 'lim', width: 13 }, { header: 'Producto', key: 'prod', width: 30 },
    { header: 'Lote', key: 'lote', width: 10 }, { header: 'Vence', key: 'vence', width: 12 }, { header: 'Cantidad en su poder', key: 'cant', width: 12 }, { header: 'Precio unit.', key: 'precio', width: 12 }, { header: 'Valor', key: 'valor', width: 14 }];
  encabezado(w2, 1);
  let f2 = 2;
  for (const { producto: p, lotes } of productos) for (const l of lotes) for (const x of l.personas) {
    const r = w2.getRow(f2);
    r.values = { per: persona(x.personaId).nombre, cod: x.codigo, lim: x.fechaLimite ? new Date(x.fechaLimite + 'T00:00:00') : '', prod: p.nombre, lote: l.lote || '', vence: l.vence ? new Date(l.vence + 'T00:00:00') : '', cant: x.cantidad, precio: Number(p.precio || 0), valor: { formula: `G${f2}*H${f2}` } };
    r.getCell('lim').numFmt = 'dd/mm/yyyy'; r.getCell('vence').numFmt = 'dd/mm/yyyy'; r.getCell('precio').numFmt = fmtMoneda; r.getCell('valor').numFmt = fmtMoneda;
    f2++;
  }
  if (f2 === 2) w2.getCell('A2').value = 'No hay mercancía en consignación.';
  else { const t2 = w2.getRow(f2); t2.getCell('per').value = 'TOTAL'; t2.getCell('cant').value = { formula: `SUM(G2:G${f2 - 1})` }; t2.getCell('valor').value = { formula: `SUM(I2:I${f2 - 1})` }; t2.getCell('valor').numFmt = fmtMoneda; t2.font = { bold: true }; }

  // ---- Hoja 3: por vencer ----
  const w3 = wb.addWorksheet(`Vence en ${diasAlerta} días`);
  w3.columns = [{ header: 'Producto', key: 'prod', width: 30 }, { header: 'Lote', key: 'lote', width: 10 }, { header: 'Vence', key: 'vence', width: 12 }, { header: 'Días', key: 'dias', width: 8 },
    { header: 'Dónde está', key: 'donde', width: 30 }, { header: 'Cantidad', key: 'cant', width: 10 }];
  encabezado(w3, 1);
  const pv = I.porVencer(info, diasAlerta, hoy);
  pv.forEach((x, i) => {
    const r = w3.getRow(i + 2);
    r.values = { prod: x.producto.nombre, lote: x.lote.lote || '', vence: new Date(x.lote.vence + 'T00:00:00'), dias: x.dias, donde: x.donde === 'bodega' ? 'En bodega' : `${persona(x.personaId).nombre} (${x.codigo})`, cant: x.cantidad };
    r.getCell('vence').numFmt = 'dd/mm/yyyy';
    if (x.dias < 0) r.getCell('dias').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9C4D2' } };
  });
  if (!pv.length) w3.getCell('A2').value = 'Ningún producto vence en este periodo.';

  const buf = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buf);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { base64: btoa(bin), bytes, nombre: `Inventario_${hoy}${conFotos ? '_con_fotos' : ''}.xlsx` };
}
function col(ws, key) { return ws.getColumn(key).letter; }

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function descargar({ bytes, nombre }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: MIME_XLSX }));
  a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 30000);
}
