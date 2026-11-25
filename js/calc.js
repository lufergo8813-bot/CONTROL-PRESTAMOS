// Motor de cálculo de préstamos. Sin dependencias: se usa en el navegador y en las pruebas (Node).
//
// Convenciones (documentadas también en docs/CALCULOS.md):
// - Toda tasa se convierte a una TASA MENSUAL equivalente (im).
//     mensual        -> im = tasa
//     anual_ea       -> im = (1 + tasa)^(1/12) - 1   (efectiva anual)
//     anual_nominal  -> im = tasa / 12               (nominal anual)
// - El interés se causa sobre el SALDO DE CAPITAL, proporcional al tiempo transcurrido:
//     interés = capital × im × meses,  meses = meses calendario completos + días restantes / 30
// - Administración: fija por mes (prorrateada), % mensual sobre saldo de capital, o cobro único.
// - Cada pago se aplica en orden: 1) administración pendiente, 2) interés pendiente, 3) capital.
//   El interés no se capitaliza (no genera interés sobre interés).

export const PERIODOS = {
  semanal:    { label: 'Semanal',    dias: 7 },
  quincenal:  { label: 'Quincenal',  dias: 15 },
  mensual:    { label: 'Mensual',    meses: 1 },
  bimestral:  { label: 'Bimestral',  meses: 2 },
  trimestral: { label: 'Trimestral', meses: 3 },
  semestral:  { label: 'Semestral',  meses: 6 },
  anual:      { label: 'Anual',      meses: 12 },
};

export const TIPOS_TASA = {
  mensual: 'Mensual',
  anual_ea: 'Anual efectiva (E.A.)',
  anual_nominal: 'Anual nominal (÷12)',
};

export const TIPOS_ADMIN = {
  ninguno: 'Sin administración',
  fijo_mensual: 'Valor fijo por mes',
  pct_saldo: '% mensual sobre saldo',
  unico: 'Cobro único al desembolso',
};

export const TIPOS_PLAN = {
  libre: 'Abonos libres',
  cuotas_iguales: 'Cuotas iguales',
  personalizado: 'Cuotas personalizadas',
};

// ---------- Fechas (ISO YYYY-MM-DD, en UTC para evitar problemas de zona horaria) ----------
const DAY = 86400000;
export function toDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toISO(date) { return date.toISOString().slice(0, 10); }
export function hoyISO() {
  const n = new Date();
  return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}
export function addDays(iso, n) { return toISO(new Date(toDate(iso).getTime() + n * DAY)); }
export function addMonths(iso, n) {
  const d = toDate(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return toISO(target);
}
export function diasEntre(a, b) { return Math.round((toDate(b) - toDate(a)) / DAY); }

/** Meses fraccionarios entre dos fechas: meses calendario completos + días sobrantes / 30. */
export function mesesEntre(a, b) {
  if (toDate(b) <= toDate(a)) return 0;
  let m = 0;
  while (toDate(addMonths(a, m + 1)) <= toDate(b)) m++;
  return m + diasEntre(addMonths(a, m), b) / 30;
}

/** Fecha de la cuota k (k = 1..n) contando desde la primera cuota. */
export function fechaCuota(primera, periodo, k) {
  const p = PERIODOS[periodo];
  if (!p) throw new Error('Periodicidad no válida: ' + periodo);
  return p.dias ? addDays(primera, p.dias * (k - 1)) : addMonths(primera, p.meses * (k - 1));
}
export function mesesPorPeriodo(periodo) {
  const p = PERIODOS[periodo];
  return p.dias ? p.dias / 30 : p.meses;
}

// ---------- Tasas y redondeo ----------
export function tasaMensual(interes) {
  const t = Number(interes?.tasa || 0) / 100;
  if (!t) return 0;
  switch (interes.tipo) {
    case 'anual_ea': return Math.pow(1 + t, 1 / 12) - 1;
    case 'anual_nominal': return t / 12;
    default: return t;
  }
}
export function redondear(x, dec = 0) {
  const f = Math.pow(10, dec);
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** Interés y administración causados sobre `capital` entre dos fechas. */
export function causar(prestamo, capital, desde, hasta, dec = 0) {
  if (capital <= 0) return { interes: 0, admin: 0, meses: 0 };
  const meses = mesesEntre(desde, hasta);
  const im = tasaMensual(prestamo.interes);
  const interes = redondear(capital * im * meses, dec);
  let admin = 0;
  const a = prestamo.admin || { tipo: 'ninguno' };
  const v = Number(a.valor || 0);
  if (a.tipo === 'fijo_mensual') admin = redondear(v * meses, dec);
  else if (a.tipo === 'pct_saldo') admin = redondear(capital * (v / 100) * meses, dec);
  return { interes, admin, meses };
}
function adminUnico(prestamo) {
  return prestamo.admin?.tipo === 'unico' ? Number(prestamo.admin.valor || 0) : 0;
}

// ---------- Cronograma (plan esperado) ----------
/**
 * Devuelve { filas, cuotaBase, totales, faltante, advertencias }.
 * filas: [{ n, fecha, saldoInicial, interes, admin, capital, cuota, saldoFinal }]
 */
export function generarCronograma(prestamo, dec = 0) {
  const P = Number(prestamo.monto || 0);
  const plan = prestamo.plan || { tipo: 'libre' };
  const filas = [];
  const advertencias = [];
  let cuotaBase = null;
  let faltante = 0;

  if (plan.tipo === 'cuotas_iguales') {
    const n = Math.max(1, parseInt(plan.numCuotas || 1, 10));
    const primera = plan.fechaPrimeraCuota || fechaCuota(prestamo.fecha, plan.periodo, 2);
    const r = tasaMensual(prestamo.interes) * mesesPorPeriodo(plan.periodo);
    cuotaBase = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    cuotaBase = redondear(cuotaBase, dec);
    let saldo = P, prev = prestamo.fecha, admPend = adminUnico(prestamo);
    for (let k = 1; k <= n; k++) {
      const fecha = fechaCuota(primera, plan.periodo, k);
      const c = causar(prestamo, saldo, prev, fecha, dec);
      let capital = k === n ? saldo : redondear(Math.min(saldo, Math.max(0, cuotaBase - c.interes)), dec);
      const admin = c.admin + admPend; admPend = 0;
      const cuota = redondear(capital + c.interes + admin, dec);
      filas.push({ n: k, fecha, saldoInicial: saldo, interes: c.interes, admin, capital, cuota, saldoFinal: redondear(saldo - capital, dec) });
      saldo = redondear(saldo - capital, dec); prev = fecha;
    }
    if (filas.length && toDate(filas[0].fecha) <= toDate(prestamo.fecha)) advertencias.push('La primera cuota es anterior o igual a la fecha del préstamo.');
  } else if (plan.tipo === 'personalizado') {
    const cuotas = [...(plan.cuotas || [])].filter(c => c.fecha && Number(c.valor) > 0)
      .sort((a, b) => toDate(a.fecha) - toDate(b.fecha));
    let saldo = P, prev = prestamo.fecha, intPend = 0, admPend = adminUnico(prestamo);
    cuotas.forEach((q, i) => {
      const c = causar(prestamo, saldo, prev, q.fecha, dec);
      intPend += c.interes; admPend += c.admin;
      let resto = Number(q.valor);
      const admin = Math.min(resto, admPend); resto -= admin; admPend -= admin;
      const interes = Math.min(resto, intPend); resto -= interes; intPend -= interes;
      const capital = Math.min(resto, saldo); resto -= capital;
      filas.push({ n: i + 1, fecha: q.fecha, saldoInicial: saldo, interes, admin, capital, cuota: Number(q.valor), saldoFinal: redondear(saldo - capital, dec) });
      if (resto > 0.0001) advertencias.push(`La cuota ${i + 1} excede lo adeudado en ${redondear(resto, dec)}.`);
      saldo = redondear(saldo - capital, dec); prev = q.fecha;
    });
    faltante = redondear(saldo + intPend + admPend, dec);
    if (faltante > 0) advertencias.push(`Las cuotas definidas no cubren la deuda: faltan ${faltante} (capital ${saldo}, interés ${redondear(intPend, dec)}, administración ${redondear(admPend, dec)}).`);
    if (!cuotas.length) advertencias.push('No hay cuotas definidas.');
  }

  const totales = filas.reduce((t, f) => ({
    cuota: t.cuota + f.cuota, interes: t.interes + f.interes, admin: t.admin + f.admin, capital: t.capital + f.capital,
  }), { cuota: 0, interes: 0, admin: 0, capital: 0 });
  if (prestamo.fechaLimite && filas.length && toDate(filas[filas.length - 1].fecha) > toDate(prestamo.fechaLimite)) {
    advertencias.push('La última cuota queda después de la fecha límite.');
  }
  return { filas, cuotaBase, totales, faltante, advertencias };
}

/** Ajusta la última cuota personalizada para que cubra exactamente la deuda. */
export function ajustarUltimaCuota(prestamo, dec = 0) {
  const cuotas = [...(prestamo.plan?.cuotas || [])].sort((a, b) => toDate(a.fecha) - toDate(b.fecha));
  if (!cuotas.length) return cuotas;
  for (let i = 0; i < 60; i++) {
    const { faltante, filas } = generarCronograma({ ...prestamo, plan: { ...prestamo.plan, cuotas } }, dec);
    const ultima = filas[filas.length - 1];
    const exceso = ultima ? ultima.cuota - (ultima.admin + ultima.interes + ultima.capital) : 0;
    if (Math.abs(faltante) < 0.5 / Math.pow(10, dec) && exceso < 0.5 / Math.pow(10, dec)) break;
    cuotas[cuotas.length - 1] = { ...cuotas[cuotas.length - 1], valor: redondear(Number(cuotas[cuotas.length - 1].valor) + faltante - exceso, dec) };
  }
  return cuotas;
}

// ---------- Estado de cuenta (lo que realmente ha pasado) ----------
/**
 * Reproduce los abonos en orden y calcula el estado a una fecha de corte.
 * abonos: [{ fecha, valor, ... }]
 */
export function estadoCuenta(prestamo, abonos = [], fechaCorte = hoyISO(), dec = 0) {
  const P = Number(prestamo.monto || 0);
  let capital = P, intPend = 0, admPend = adminUnico(prestamo), prev = prestamo.fecha;
  let intCausado = 0, admCausado = admPend, saldoFavor = 0;
  const movimientos = [];
  const lista = abonos.filter(a => !a.deleted && toDate(a.fecha) <= toDate(fechaCorte))
    .sort((a, b) => toDate(a.fecha) - toDate(b.fecha) || String(a.creado || '').localeCompare(String(b.creado || '')));
  for (const ab of lista) {
    if (toDate(ab.fecha) > toDate(prev)) {
      const c = causar(prestamo, capital, prev, ab.fecha, dec);
      intPend += c.interes; admPend += c.admin; intCausado += c.interes; admCausado += c.admin; prev = ab.fecha;
    }
    let resto = Number(ab.valor || 0);
    const aAdmin = Math.min(resto, admPend); resto -= aAdmin; admPend -= aAdmin;
    const aInteres = Math.min(resto, intPend); resto -= aInteres; intPend -= aInteres;
    const aCapital = Math.min(resto, capital); resto -= aCapital; capital = redondear(capital - aCapital, dec);
    saldoFavor += resto;
    movimientos.push({ id: ab.id, fecha: ab.fecha, valor: Number(ab.valor), aAdmin, aInteres, aCapital, excedente: resto, saldoCapital: capital, cuenta: ab.cuentaId, nota: ab.nota || '' });
  }
  if (toDate(fechaCorte) > toDate(prev)) {
    const c = causar(prestamo, capital, prev, fechaCorte, dec);
    intPend += c.interes; admPend += c.admin; intCausado += c.interes; admCausado += c.admin;
  }
  intPend = redondear(intPend, dec); admPend = redondear(admPend, dec);
  const pagado = movimientos.reduce((s, m) => s + m.valor, 0);
  const totalParaSaldar = redondear(capital + intPend + admPend, dec);

  // Comparación con el plan (si hay cuotas)
  const crono = generarCronograma(prestamo, dec);
  let esperado = 0, cuotasVencidas = 0, proxima = null, acumulado = 0;
  for (const f of crono.filas) {
    acumulado += f.cuota;
    if (toDate(f.fecha) <= toDate(fechaCorte)) { esperado += f.cuota; if (acumulado > pagado + 0.5) cuotasVencidas++; }
    else if (!proxima && acumulado > pagado + 0.5) proxima = { ...f, pendiente: redondear(Math.min(f.cuota, acumulado - pagado), dec) };
  }
  const atraso = redondear(Math.max(0, esperado - pagado), dec);
  const vencido = !!prestamo.fechaLimite && toDate(fechaCorte) > toDate(prestamo.fechaLimite) && totalParaSaldar > 0;

  let estado = 'al_dia';
  if (totalParaSaldar <= 0) estado = 'pagado';
  else if (vencido) estado = 'vencido';
  else if (atraso > 0) estado = 'en_mora';

  return {
    fechaCorte, capital, interesPendiente: intPend, adminPendiente: admPend, totalParaSaldar,
    pagado: redondear(pagado, dec),
    interesPagado: redondear(movimientos.reduce((s, m) => s + m.aInteres, 0), dec),
    adminPagado: redondear(movimientos.reduce((s, m) => s + m.aAdmin, 0), dec),
    capitalPagado: redondear(movimientos.reduce((s, m) => s + m.aCapital, 0), dec),
    interesCausado: redondear(intCausado, dec), adminCausado: redondear(admCausado, dec),
    saldoFavor: redondear(saldoFavor, dec), movimientos, esperado: redondear(esperado, dec),
    atraso, cuotasVencidas, proxima, estado, cronograma: crono,
  };
}

export const ESTADOS = {
  al_dia: { label: 'Al día', color: 'ok' },
  en_mora: { label: 'Con atraso', color: 'warn' },
  vencido: { label: 'Vencido', color: 'bad' },
  pagado: { label: 'Pagado', color: 'done' },
};

/** Texto que explica cómo se calcula, para pantalla y PDF. */
export function explicacion(prestamo, fmt = String) {
  const im = tasaMensual(prestamo.interes);
  const partes = [];
  if (!im) partes.push('Préstamo sin interés.');
  else {
    const base = `Tasa pactada: ${prestamo.interes.tasa}% ${TIPOS_TASA[prestamo.interes.tipo].toLowerCase()}`;
    partes.push(prestamo.interes.tipo === 'mensual' ? base + '.' : `${base}, equivalente a ${(im * 100).toFixed(4)}% mensual.`);
    partes.push('El interés se calcula sobre el saldo de capital pendiente, en proporción al tiempo transcurrido (meses completos + días/30). No se cobra interés sobre interés.');
  }
  const a = prestamo.admin || {};
  if (a.tipo === 'fijo_mensual') partes.push(`Administración: ${fmt(a.valor)} por mes (proporcional al tiempo).`);
  if (a.tipo === 'pct_saldo') partes.push(`Administración: ${a.valor}% mensual sobre el saldo de capital.`);
  if (a.tipo === 'unico') partes.push(`Administración: cobro único de ${fmt(a.valor)}, incluido en el primer pago.`);
  const pl = prestamo.plan || {};
  if (pl.tipo === 'cuotas_iguales') partes.push(`Forma de pago: ${pl.numCuotas} cuotas ${PERIODOS[pl.periodo].label.toLowerCase()}es iguales de capital + interés (sistema francés)${a.tipo && a.tipo !== 'ninguno' ? ', más la administración de cada periodo' : ''}.`);
  if (pl.tipo === 'personalizado') partes.push('Forma de pago: cuotas con fechas y valores acordados.');
  if (pl.tipo === 'libre') partes.push('Forma de pago: abonos libres hasta la fecha límite.');
  partes.push('Cada pago se aplica primero a administración, luego a intereses y por último a capital.');
  return partes;
}
