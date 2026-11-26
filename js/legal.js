// Contenido legal: tasas de usura conocidas y texto del pagaré (Colombia).
// IMPORTANTE: plantilla de referencia. Recomendado: que un abogado la revise antes de usarla en cobros.
import * as C from './calc.js';

/** Tasas de usura (consumo y ordinario, % E.A.) certificadas por la Superfinanciera. La app agrega más al actualizar. */
export const USURA_CONOCIDA = {
  '2026-10': 28.59, // Superfinanciera, vigente 1-31 oct 2026
  '2026-11': 28.34, // Resolución 1707 de 2026, vigente 1-30 nov 2026 (IBC 18,89% E.A.)
};
export const FUENTE_USURA = 'https://www.superfinanciera.gov.co/publicaciones/10829/informes-y-cifrascifrasestablecimientos-de-creditoinformacion-periodicamensualtasa-de-interes-bancario-corriente-10829/';

const fmtCOP = (v, aj) => new Intl.NumberFormat(aj?.locale || 'es-CO', { style: 'currency', currency: aj?.moneda || 'COP', maximumFractionDigits: 0 }).format(Number(v || 0)).replace(/ /g, ' ');
const pct = (v, n) => Number(v).toLocaleString('es-CO', { minimumFractionDigits: n, maximumFractionDigits: n });
const fechaTexto = (iso, aj) => iso ? new Intl.DateTimeFormat(aj?.locale || 'es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(C.toDate(iso)) : '';

/**
 * Construye la "foto" de datos del pagaré a partir de un préstamo o consignación.
 * Esta foto es lo que se firma: no cambia aunque luego se edite el préstamo.
 */
export function datosPagare({ prestamo: p, persona = {}, acreedor = {}, ajustes: aj = {}, numero }) {
  const crono = C.generarCronograma(p, Number(aj.decimales || 0));
  const esCons = p.clase === 'consignacion';
  const ciudad = acreedor.ciudad || aj.ciudad || '';
  return {
    version: 1, numero: numero || p.codigo, tipo: esCons ? 'consignacion' : 'prestamo',
    ciudad, fechaCreacion: C.hoyISO(), fechaOperacion: p.fecha,
    valor: Number(p.monto || 0), valorLetras: C.numeroALetras(p.monto),
    moneda: aj.moneda || 'COP', locale: aj.locale || 'es-CO',
    deudor: { nombre: persona.nombre || '', documento: persona.documento || '', tipoDoc: persona.tipoDoc || 'C.C.', direccion: persona.direccion || persona.notas || '', telefono: persona.telefono || '', email: persona.email || '' },
    acreedor: { nombre: acreedor.nombre || aj.prestamistaNombre || '', documento: acreedor.documento || aj.prestamistaDoc || '', tipoDoc: acreedor.tipoDoc || 'C.C.' },
    cuentaDesembolso: esCons ? null : (p.cuentaDeudor?.numero ? { ...p.cuentaDeudor } : null),
    interes: { ...p.interes }, tasaMensual: C.tasaMensual(p.interes) * 100, tasaEA: C.tasaEA(p.interes),
    admin: { ...(p.admin || {}) }, mora: p.mora?.activa !== false,
    plan: { tipo: p.plan?.tipo || 'libre', periodo: p.plan?.periodo, diasPeriodo: p.plan?.diasPeriodo, numCuotas: p.plan?.numCuotas },
    cuotas: crono.filas.map(f => ({ n: f.n, fecha: f.fecha, capital: f.capital, interes: f.interes, admin: f.admin, total: f.cuota })),
    vencimientoFinal: crono.filas.length ? crono.filas[crono.filas.length - 1].fecha : (p.fechaLimite || ''),
    productos: esCons ? (p.productos || []).map(x => ({ descripcion: x.descripcion, cantidad: Number(x.cantidad), valorUnitario: Number(x.valorUnitario) })) : null,
  };
}

/** Texto del pagaré en bloques: { titulo, encabezado[], cuerpo, clausulas[{t, x}], cierre }. */
export function textoPagare(d) {
  const aj = { locale: d.locale, moneda: d.moneda };
  const $ = v => fmtCOP(v, aj), F = iso => fechaTexto(iso, aj);
  const dd = d.deudor, ac = d.acreedor;
  const origen = d.tipo === 'consignacion'
    ? 'por concepto del valor de la mercancía que recibí en consignación, detallada en este documento, cuyo precio me obligo a pagar en la medida en que no la restituya en el mismo estado'
    : 'que declaro haber recibido a título de mutuo (préstamo de dinero)';
  const clausulas = [];
  // Forma de pago
  if (d.cuotas.length > 1) clausulas.push({ t: 'Forma de pago', x: `Pagaré la suma indicada en ${d.cuotas.length} cuotas, en las fechas y por los valores del plan de pagos incluido en este documento, que hace parte integral del mismo. La última cuota vence el ${F(d.vencimientoFinal)}.` });
  else if (d.cuotas.length === 1) clausulas.push({ t: 'Forma de pago', x: `Pagaré la totalidad del capital, junto con los intereses causados, el día ${F(d.cuotas[0].fecha)}.` });
  else clausulas.push({ t: 'Forma de pago', x: `Pagaré la suma indicada mediante abonos parciales, a más tardar el día ${F(d.vencimientoFinal)}, fecha en la cual deberá quedar cancelado el saldo total.` });
  // Intereses
  clausulas.push({ t: 'Intereses remuneratorios', x: d.tasaMensual > 0
    ? `Durante el plazo reconoceré sobre el saldo de capital intereses remuneratorios a la tasa del ${d.interes.tasa}% ${C.TIPOS_TASA[d.interes.tipo].toLowerCase()} (${d.interes.tipo === 'mensual' ? '' : `equivalente a ${pct(d.tasaMensual, 4)}% mensual y `}${pct(d.tasaEA, 2)}% efectivo anual), pagaderos en las fechas del plan de pagos. En ningún caso la tasa cobrada excederá el límite legal vigente.`
    : 'La suma adeudada no causa intereses remuneratorios durante el plazo.' });
  if (d.admin?.tipo && d.admin.tipo !== 'ninguno') clausulas.push({ t: 'Cuota de administración', x: d.admin.tipo === 'pct_saldo' ? `Pagaré además una cuota de administración del ${d.admin.valor}% mensual sobre el saldo de capital.` : d.admin.tipo === 'unico' ? `Pagaré además una cuota única de administración de ${$(d.admin.valor)}, con el primer pago.` : `Pagaré además una cuota de administración de ${$(d.admin.valor)} mensuales.` });
  if (d.mora) clausulas.push({ t: 'Intereses de mora', x: 'En caso de mora en el pago de cualquier cuota o del saldo, reconoceré sobre el capital vencido, desde el día siguiente a la fecha de su vencimiento y hasta el pago total, intereses moratorios a la tasa máxima legal permitida, esto es, una y media veces el interés bancario corriente certificado por la Superintendencia Financiera de Colombia para cada período (artículo 884 del Código de Comercio). Durante la mora no se cobrará interés remuneratorio sobre el mismo capital.' });
  clausulas.push({ t: 'Cláusula aceleratoria', x: 'El tenedor podrá declarar vencido el plazo y exigir de inmediato el pago del saldo total, con sus intereses, cuando yo incurra en mora en el pago de una o más cuotas, o cuando sea perseguido judicialmente por terceros o me encuentre en proceso de insolvencia.' });
  clausulas.push({ t: 'Imputación de pagos', x: `Los pagos que realice se aplicarán primero a ${d.mora ? 'intereses de mora, luego a ' : ''}cuota de administración, intereses remuneratorios y finalmente a capital.` });
  clausulas.push({ t: 'Dispensas', x: 'Eximo al tenedor de la presentación para el pago y del aviso de rechazo, y renuncio a los requerimientos judiciales o privados para ser constituido en mora.' });
  clausulas.push({ t: 'Gastos de cobranza', x: 'Serán de mi cargo los gastos razonables de cobranza judicial y extrajudicial en que incurra el tenedor, en los términos que autorice la ley.' });
  if (d.cuentaDesembolso) clausulas.push({ t: 'Desembolso', x: `El dinero fue o será consignado en la cuenta ${d.cuentaDesembolso.tipo ? d.cuentaDesembolso.tipo.toLowerCase() + ' ' : ''}No. ${d.cuentaDesembolso.numero}${d.cuentaDesembolso.banco ? ' de ' + d.cuentaDesembolso.banco : ''}, de mi titularidad o autorizada por mí, y tal consignación constituye prueba de su entrega.` });
  clausulas.push({ t: 'Firma', x: 'Acepto que este pagaré pueda firmarse de forma manuscrita o electrónica. Si lo firmo electrónicamente, reconozco que esa firma es mía, que la otorgo de forma libre y que tiene la misma validez que mi firma manuscrita, conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012.' });

  return {
    titulo: `PAGARÉ No. ${d.numero}`,
    encabezado: [['Valor', `${$(d.valor)} (${d.valorLetras})`], ['Lugar y fecha de creación', `${d.ciudad || '__________'}, ${F(d.fechaCreacion)}`], ['Vencimiento final', d.vencimientoFinal ? F(d.vencimientoFinal) : 'Según plan de pagos'], ['Deudor', `${dd.nombre}, ${dd.tipoDoc} ${dd.documento || '__________'}`], ['Acreedor', `${ac.nombre}, ${ac.tipoDoc} ${ac.documento || '__________'}`]],
    cuerpo: `Yo, ${dd.nombre.toUpperCase() || '__________'}, mayor de edad, identificado(a) con ${dd.tipoDoc} No. ${dd.documento || '__________'}, obrando en nombre propio, declaro que DEBO Y PAGARÉ incondicionalmente, a la orden de ${ac.nombre.toUpperCase() || '__________'}, identificado(a) con ${ac.tipoDoc} No. ${ac.documento || '__________'}, o a quien represente sus derechos, en la ciudad de ${d.ciudad || '__________'}, la suma de ${d.valorLetras} (${$(d.valor)}), ${origen}, en los términos de las siguientes cláusulas:`,
    clausulas,
    cierre: `Para constancia se firma en ${d.ciudad || '__________'}, el ${F(d.fechaCreacion)}.`,
  };
}

/** Texto canónico para calcular la huella digital (SHA-256) de lo que se firma. */
export function canonico(d) {
  const orden = o => (Array.isArray(o) ? o.map(orden) : o && typeof o === 'object' ? Object.keys(o).sort().reduce((r, k) => ((r[k] = orden(o[k])), r), {}) : o);
  return JSON.stringify(orden(d));
}
export async function huella(d) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico(d)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const claveAleatoria = () => [...crypto.getRandomValues(new Uint8Array(20))].map(b => b.toString(16).padStart(2, '0')).join('');

/** HTML del pagaré para mostrar en pantalla (app y página de firma). */
export function pagareHTML(d, esc = s => String(s ?? '')) {
  const t = textoPagare(d);
  const aj = { locale: d.locale, moneda: d.moneda };
  const $ = v => fmtCOP(v, aj), F = iso => fechaTexto(iso, aj);
  return `<article class="pagare">
    <h2>${esc(t.titulo)}</h2>
    <dl>${t.encabezado.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <p>${esc(t.cuerpo)}</p>
    <ol>${t.clausulas.map(c => `<li><b>${esc(c.t)}.</b> ${esc(c.x)}</li>`).join('')}</ol>
    ${d.cuotas.length ? `<h3>Plan de pagos</h3><div class="tabla"><table><thead><tr><th>N°</th><th>Fecha</th><th class="num">Capital</th><th class="num">Interés</th>${d.cuotas.some(c => c.admin) ? '<th class="num">Admón.</th>' : ''}<th class="num">Total</th></tr></thead><tbody>
      ${d.cuotas.map(c => `<tr><td>${c.n}</td><td>${F(c.fecha)}</td><td class="num">${$(c.capital)}</td><td class="num">${$(c.interes)}</td>${d.cuotas.some(x => x.admin) ? `<td class="num">${$(c.admin)}</td>` : ''}<td class="num"><b>${$(c.total)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${d.productos?.length ? `<h3>Mercancía entregada</h3><div class="tabla"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Valor unit.</th><th class="num">Total</th></tr></thead><tbody>${d.productos.map(x => `<tr><td>${esc(x.descripcion)}</td><td class="num">${x.cantidad}</td><td class="num">${$(x.valorUnitario)}</td><td class="num">${$(x.cantidad * x.valorUnitario)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p>${esc(t.cierre)}</p></article>`;
}
