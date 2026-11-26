// Motor de cálculo de préstamos y consignaciones. Sin dependencias: se usa en el navegador y en las pruebas (Node).
//
// Convenciones (documentadas en docs/CALCULOS.md):
// - Toda tasa se convierte a una TASA MENSUAL equivalente (im).
//     mensual -> im = tasa;  anual_ea -> im = (1 + tasa)^(1/12) - 1;  anual_nominal -> im = tasa / 12
// - Interés remuneratorio: sobre el capital NO vencido, proporcional al tiempo (meses completos + días/30).
// - Interés de mora: sobre el capital VENCIDO (cuotas cuya fecha ya pasó y no se han cubierto), desde el día
//   siguiente al vencimiento, a la tasa de usura vigente en cada mes (convertida a mensual, ÷30 por día).
//   No se cobran simultáneamente remuneratorio y mora sobre el mismo capital. No hay interés sobre interés.
// - Administración: fija por mes (prorrateada), % mensual sobre saldo de capital, o cobro único.
// - Cada pago se aplica: 1) mora, 2) administración, 3) interés, 4) capital. Las devoluciones de mercancía
//   reducen directamente el capital.

export const PERIODOS = {
  semanal:    { label: 'Semanal',    dias: 7 },
  quincenal:  { label: 'Quincenal',  dias: 15 },
  mensual:    { label: 'Mensual',    meses: 1 },
  bimestral:  { label: 'Bimestral',  meses: 2 },
  trimestral: { label: 'Trimestral', meses: 3 },
  semestral:  { label: 'Semestral',  meses: 6 },
  anual:      { label: 'Anual',      meses: 12 },
  dias:       { label: 'Cada N días', dias: null },
};
export const TIPOS_TASA = { mensual: 'Mensual', anual_ea: 'Anual efectiva (E.A.)', anual_nominal: 'Anual nominal (÷12)' };
export const TIPOS_ADMIN = { ninguno: 'Sin administración', fijo_mensual: 'Valor fijo por mes', pct_saldo: '% mensual sobre saldo', unico: 'Cobro único al desembolso' };
export const TIPOS_PLAN = {
  cuotas_iguales: 'Cuotas iguales',
  interes_periodico: 'Intereses periódicos y capital al final',
  pago_unico: 'Todo al final (un solo pago)',
  personalizado: 'Cuotas personalizadas',
  libre: 'Abonos libres',
};

// ---------- Fechas (ISO YYYY-MM-DD en UTC) ----------
const DAY = 86400000;
export function toDate(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function toISO(date) { return date.toISOString().slice(0, 10); }
export function hoyISO() { const n = new Date(); return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); }
export function addDays(iso, n) { return toISO(new Date(toDate(iso).getTime() + n * DAY)); }
export function addMonths(iso, n) {
  const d = toDate(iso), day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  t.setUTCDate(Math.min(day, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()));
  return toISO(t);
}
export function diasEntre(a, b) { return Math.round((toDate(b) - toDate(a)) / DAY); }
export function mesesEntre(a, b) {
  if (toDate(b) <= toDate(a)) return 0;
  let m = 0;
  while (toDate(addMonths(a, m + 1)) <= toDate(b)) m++;
  return m + diasEntre(addMonths(a, m), b) / 30;
}
const minISO = (a, b) => (a < b ? a : b);
const maxISO = (a, b) => (a > b ? a : b);

function diasDePeriodo(periodo, diasPeriodo) {
  const p = PERIODOS[periodo];
  if (!p) throw new Error('Periodicidad no válida: ' + periodo);
  return periodo === 'dias' ? Math.max(1, parseInt(diasPeriodo || 30, 10)) : p.dias;
}
/** Fecha de la cuota k (k = 1..n) contando desde la primera. */
export function fechaCuota(primera, periodo, k, diasPeriodo) {
  const p = PERIODOS[periodo];
  const d = diasDePeriodo(periodo, diasPeriodo);
  return d ? addDays(primera, d * (k - 1)) : addMonths(primera, p.meses * (k - 1));
}
export function mesesPorPeriodo(periodo, diasPeriodo) {
  const d = diasDePeriodo(periodo, diasPeriodo);
  return d ? d / 30 : PERIODOS[periodo].meses;
}

// ---------- Tasas ----------
export function tasaMensual(interes) {
  const t = Number(interes?.tasa || 0) / 100;
  if (!t) return 0;
  if (interes.tipo === 'anual_ea') return Math.pow(1 + t, 1 / 12) - 1;
  if (interes.tipo === 'anual_nominal') return t / 12;
  return t;
}
/** Tasa efectiva anual equivalente (para comparar con la usura). */
export function tasaEA(interes) { const im = tasaMensual(interes); return (Math.pow(1 + im, 12) - 1) * 100; }
export const eaAMensual = ea => (Math.pow(1 + Number(ea) / 100, 1 / 12) - 1) * 100;
export function redondear(x, dec = 0) { const f = Math.pow(10, dec); return Math.round((x + Number.EPSILON) * f) / f; }

// Tabla de tasas de usura (E.A. %) por mes 'AAAA-MM'. La app la configura desde Ajustes.
let USURA = {};
export function configurarUsura(tabla) { USURA = { ...(tabla || {}) }; }
export function usuraDelMes(iso) {
  const k = String(iso).slice(0, 7), meses = Object.keys(USURA).sort();
  if (!meses.length) return 0;
  if (USURA[k] != null) return Number(USURA[k]);
  const prev = meses.filter(m => m <= k).pop();
  return Number(USURA[prev ?? meses[0]]);
}

/** Interés remuneratorio y administración causados sobre `capital` entre dos fechas. */
export function causar(prestamo, capital, desde, hasta, dec = 0, capitalAdmin = capital) {
  if (capital <= 0 && capitalAdmin <= 0) return { interes: 0, admin: 0, meses: 0 };
  const meses = mesesEntre(desde, hasta);
  const interes = redondear(Math.max(0, capital) * tasaMensual(prestamo.interes) * meses, dec);
  const a = prestamo.admin || {}, v = Number(a.valor || 0);
  let admin = 0;
  if (capitalAdmin > 0 && a.tipo === 'fijo_mensual') admin = redondear(v * meses, dec);
  else if (a.tipo === 'pct_saldo') admin = redondear(Math.max(0, capitalAdmin) * (v / 100) * meses, dec);
  return { interes, admin, meses };
}
const adminUnico = p => (p.admin?.tipo === 'unico' ? Number(p.admin.valor || 0) : 0);
const moraActiva = p => p.mora?.activa !== false;

// ---------- Cronograma (plan esperado) ----------
export function generarCronograma(prestamo, dec = 0) {
  const P = Number(prestamo.monto || 0);
  const plan = prestamo.plan || { tipo: 'libre' };
  const filas = [], advertencias = [];
  let cuotaBase = null, faltante = 0;
  const fila = (n, fecha, saldoInicial, interes, admin, capital) => {
    filas.push({ n, fecha, saldoInicial, interes, admin, capital, cuota: redondear(capital + interes + admin, dec), saldoFinal: redondear(saldoInicial - capital, dec) });
  };

  if (plan.tipo === 'cuotas_iguales' || plan.tipo === 'interes_periodico') {
    const n = Math.max(1, parseInt(plan.numCuotas || 1, 10));
    const primera = plan.fechaPrimeraCuota || fechaCuota(prestamo.fecha, plan.periodo, 2, plan.diasPeriodo);
    const r = tasaMensual(prestamo.interes) * mesesPorPeriodo(plan.periodo, plan.diasPeriodo);
    if (plan.tipo === 'cuotas_iguales') cuotaBase = redondear(r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)), dec);
    let saldo = P, prev = prestamo.fecha, admPend = adminUnico(prestamo);
    for (let k = 1; k <= n; k++) {
      const fecha = fechaCuota(primera, plan.periodo, k, plan.diasPeriodo);
      const c = causar(prestamo, saldo, prev, fecha, dec);
      const capital = k === n ? saldo : plan.tipo === 'interes_periodico' ? 0 : redondear(Math.min(saldo, Math.max(0, cuotaBase - c.interes)), dec);
      fila(k, fecha, saldo, c.interes, c.admin + admPend, capital);
      admPend = 0; saldo = redondear(saldo - capital, dec); prev = fecha;
    }
    if (plan.tipo === 'interes_periodico' && filas.length > 1) cuotaBase = filas[0].interes;
  } else if (plan.tipo === 'pago_unico') {
    const fecha = plan.fechaPago || prestamo.fechaLimite || addMonths(prestamo.fecha, 1);
    const c = causar(prestamo, P, prestamo.fecha, fecha, dec);
    fila(1, fecha, P, c.interes, c.admin + adminUnico(prestamo), P);
  } else if (plan.tipo === 'personalizado') {
    const cuotas = [...(plan.cuotas || [])].filter(c => c.fecha && Number(c.valor) > 0).sort((a, b) => toDate(a.fecha) - toDate(b.fecha));
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
  const totales = filas.reduce((t, f) => ({ cuota: t.cuota + f.cuota, interes: t.interes + f.interes, admin: t.admin + f.admin, capital: t.capital + f.capital }), { cuota: 0, interes: 0, admin: 0, capital: 0 });
  if (filas.length && toDate(filas[0].fecha) <= toDate(prestamo.fecha)) advertencias.push('La primera cuota es anterior o igual a la fecha del préstamo.');
  if (prestamo.fechaLimite && filas.length && filas[filas.length - 1].fecha > prestamo.fechaLimite) advertencias.push('La última cuota queda después de la fecha límite.');
  return { filas, cuotaBase, totales, faltante, advertencias, ganancia: redondear(totales.interes + totales.admin, dec) };
}

export function ajustarUltimaCuota(prestamo, dec = 0) {
  const cuotas = [...(prestamo.plan?.cuotas || [])].sort((a, b) => toDate(a.fecha) - toDate(b.fecha));
  if (!cuotas.length) return cuotas;
  const tol = 0.5 / Math.pow(10, dec);
  for (let i = 0; i < 60; i++) {
    const { faltante, filas } = generarCronograma({ ...prestamo, plan: { ...prestamo.plan, cuotas } }, dec);
    const u = filas[filas.length - 1];
    const exceso = u ? u.cuota - (u.admin + u.interes + u.capital) : 0;
    if (Math.abs(faltante) < tol && exceso < tol) break;
    cuotas[cuotas.length - 1] = { ...cuotas[cuotas.length - 1], valor: redondear(Number(cuotas[cuotas.length - 1].valor) + faltante - exceso, dec) };
  }
  return cuotas;
}

/** Capital programado con vencimiento estrictamente anterior a `dia` (para mora). */
function capitalExigibleAntesDe(prestamo, crono, dia) {
  if (crono.filas.length) return crono.filas.reduce((s, f) => s + (f.fecha < dia ? f.capital : 0), 0);
  if (prestamo.fechaLimite && prestamo.fechaLimite < dia) return Number(prestamo.monto || 0);
  return 0;
}

// ---------- Estado de cuenta ----------
/**
 * movimientos: [{ fecha, valor, tipo?: 'pago'|'devolucion' }]. Devuelve el estado a la fecha de corte.
 */
export function estadoCuenta(prestamo, abonos = [], fechaCorte = hoyISO(), dec = 0) {
  const P = Number(prestamo.monto || 0);
  const crono = generarCronograma(prestamo, dec);
  const conMora = moraActiva(prestamo);
  let capital = P, intPend = 0, admPend = adminUnico(prestamo), moraPend = 0, prev = prestamo.fecha;
  let intCausado = 0, admCausado = admPend, moraCausada = 0, saldoFavor = 0, capitalPagadoTotal = 0, devuelto = 0;
  const movimientos = [];
  const lista = abonos.filter(a => !a.deleted && a.fecha <= fechaCorte)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.creado || '').localeCompare(String(b.creado || '')));

  // Puntos de corte: vencimientos, fecha límite, primeros de mes (cambio de tasa de usura), abonos y corte
  const vencidoEn = dia => Math.max(0, Math.min(capital, capitalExigibleAntesDe(prestamo, crono, dia) - (P - capital)));
  const avanzar = hasta => {
    if (hasta <= prev) return;
    const cortes = new Set([hasta]);
    crono.filas.forEach(f => { if (f.fecha > prev && f.fecha < hasta) cortes.add(f.fecha); });
    if (prestamo.fechaLimite && prestamo.fechaLimite > prev && prestamo.fechaLimite < hasta) cortes.add(prestamo.fechaLimite);
    for (const b of [...cortes].sort()) {
      const venc = conMora ? vencidoEn(b) : 0; // constante en (prev, b]
      const c = causar(prestamo, capital - venc, prev, b, dec, capital);
      let mora = 0;
      if (venc > 0) {
        // la tasa de usura cambia cada mes: se liquida por tramos dentro de cada mes
        let a = prev;
        while (a < b) {
          const finMes = addDays(addMonths(addDays(a, 1).slice(0, 8) + '01', 1), -1);
          const z = minISO(finMes, b);
          mora += venc * (eaAMensual(usuraDelMes(addDays(a, 1))) / 100) * diasEntre(a, z) / 30;
          a = z;
        }
        mora = redondear(mora, dec);
      }
      intPend += c.interes; admPend += c.admin; moraPend += mora;
      intCausado += c.interes; admCausado += c.admin; moraCausada += mora;
      prev = b;
    }
  };

  for (const ab of lista) {
    avanzar(ab.fecha);
    const valor = Number(ab.valor || 0);
    if (ab.tipo === 'devolucion') {
      const aCap = Math.min(valor, capital); capital = redondear(capital - aCap, dec); devuelto += aCap;
      movimientos.push({ id: ab.id, tipo: 'devolucion', fecha: ab.fecha, valor, aMora: 0, aAdmin: 0, aInteres: 0, aCapital: aCap, excedente: valor - aCap, saldoCapital: capital, cuenta: ab.cuentaId, nota: ab.nota || '', detalle: ab.detalle });
      continue;
    }
    let resto = valor;
    const aMora = Math.min(resto, moraPend); resto -= aMora; moraPend -= aMora;
    const aAdmin = Math.min(resto, admPend); resto -= aAdmin; admPend -= aAdmin;
    const aInteres = Math.min(resto, intPend); resto -= aInteres; intPend -= aInteres;
    const aCapital = Math.min(resto, capital); resto -= aCapital; capital = redondear(capital - aCapital, dec); capitalPagadoTotal += aCapital;
    saldoFavor += resto;
    movimientos.push({ id: ab.id, tipo: 'pago', fecha: ab.fecha, valor, aMora, aAdmin, aInteres, aCapital, excedente: resto, saldoCapital: capital, cuenta: ab.cuentaId, nota: ab.nota || '', detalle: ab.detalle });
  }
  avanzar(fechaCorte);
  intPend = redondear(intPend, dec); admPend = redondear(admPend, dec); moraPend = redondear(moraPend, dec);
  const pagos = movimientos.filter(m => m.tipo === 'pago');
  const sum = (arr, k) => redondear(arr.reduce((s, m) => s + m[k], 0), dec);
  const pagado = sum(pagos, 'valor');
  const totalParaSaldar = redondear(capital + intPend + admPend + moraPend, dec);

  // Comparación con el plan
  const cubre = pagado - sum(pagos, 'aMora') + devuelto;
  let esperado = 0, cuotasVencidas = 0, proxima = null, acumulado = 0, primeraVencida = null;
  for (const f of crono.filas) {
    acumulado += f.cuota;
    if (f.fecha <= fechaCorte) { esperado += f.cuota; if (f.fecha < fechaCorte && acumulado > cubre + 0.5) { cuotasVencidas++; primeraVencida = primeraVencida || f.fecha; } }
    if (!proxima && f.fecha >= fechaCorte && acumulado > cubre + 0.5) proxima = { ...f, pendiente: redondear(Math.min(f.cuota, acumulado - cubre), dec) };
  }
  const atraso = redondear(Math.max(0, crono.filas.filter(f => f.fecha < fechaCorte).reduce((s, f) => s + f.cuota, 0) - cubre), dec);
  const vencido = !!prestamo.fechaLimite && fechaCorte > prestamo.fechaLimite && totalParaSaldar > 0;
  let estado = 'al_dia';
  if (totalParaSaldar <= 0) estado = 'pagado';
  else if (vencido) estado = 'vencido';
  else if (atraso > 0) estado = 'en_mora';
  const capitalVencido = conMora ? vencidoEn(addDays(fechaCorte, 1)) : 0;

  return {
    fechaCorte, capital, interesPendiente: intPend, adminPendiente: admPend, moraPendiente: moraPend, totalParaSaldar,
    pagado, interesPagado: sum(pagos, 'aInteres'), adminPagado: sum(pagos, 'aAdmin'), moraPagada: sum(pagos, 'aMora'), capitalPagado: sum(pagos, 'aCapital'),
    devuelto: redondear(devuelto, dec), interesCausado: redondear(intCausado, dec), adminCausado: redondear(admCausado, dec), moraCausada: redondear(moraCausada, dec),
    saldoFavor: redondear(saldoFavor, dec), movimientos, esperado: redondear(esperado, dec), atraso, cuotasVencidas, primeraVencida, proxima, estado,
    capitalVencido: redondear(capitalVencido, dec), cronograma: crono,
  };
}

export const ESTADOS = {
  al_dia: { label: 'Al día', color: 'ok' },
  en_mora: { label: 'En mora', color: 'warn' },
  vencido: { label: 'Vencido', color: 'bad' },
  pagado: { label: 'Pagado', color: 'done' },
};

// ---------- Score de cumplimiento ----------
/** Fecha en que quedó cubierta cada cuota (por pagos acumulados). */
function fechasDeCobertura(crono, movimientos, prestamo) {
  const filas = crono.filas.length ? crono.filas : (prestamo.fechaLimite ? [{ n: 1, fecha: prestamo.fechaLimite, cuota: Number(prestamo.monto || 0) }] : []);
  const pagos = movimientos.map(m => ({ fecha: m.fecha, valor: m.tipo === 'pago' ? m.valor - m.aMora : m.valor }));
  let acum = 0, i = 0, pagadoAcum = 0;
  return filas.map(f => {
    acum += f.cuota;
    while (i < pagos.length && pagadoAcum + 0.5 < acum) { pagadoAcum += pagos[i].valor; i++; }
    return { fecha: f.fecha, cubierta: pagadoAcum + 0.5 >= acum ? pagos[Math.max(0, i - 1)]?.fecha || null : null };
  });
}

/** items: [{ prestamo, abonos }] de una misma persona. */
export function scorePersona(items, hoy = hoyISO(), dec = 0) {
  let vencidas = 0, aTiempo = 0, diasTarde = [], vencidasHoy = 0, pagados = 0, activos = 0;
  for (const { prestamo, abonos } of items) {
    const e = estadoCuenta(prestamo, abonos, hoy, dec);
    if (e.estado === 'pagado') pagados++; else activos++;
    for (const c of fechasDeCobertura(e.cronograma, e.movimientos, prestamo)) {
      if (c.fecha >= hoy && !c.cubierta) continue; // aún no vence
      if (c.cubierta && c.cubierta <= c.fecha) { vencidas++; aTiempo++; continue; }
      if (!c.cubierta && c.fecha >= hoy) continue;
      vencidas++;
      const fin = c.cubierta || hoy;
      diasTarde.push(diasEntre(c.fecha, fin));
      if (!c.cubierta) vencidasHoy++;
    }
  }
  if (!vencidas) return { puntaje: null, nivel: 'nuevo', etiqueta: 'Sin historial', vencidas, aTiempo, promedioDias: 0, maxDias: 0, vencidasHoy, pagados, activos };
  const tarde = vencidas - aTiempo;
  const prom = diasTarde.length ? diasTarde.reduce((a, b) => a + b, 0) / diasTarde.length : 0;
  let s = 100 - 45 * (tarde / vencidas) - Math.min(25, prom * 0.8) - (vencidasHoy ? Math.min(25, 10 + 5 * vencidasHoy) : 0) + Math.min(10, 3 * pagados);
  s = Math.round(Math.max(0, Math.min(100, s)));
  const nivel = s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : 'D';
  const etiqueta = { A: 'Excelente', B: 'Bueno', C: 'Regular', D: 'En riesgo' }[nivel];
  return { puntaje: s, nivel, etiqueta, vencidas, aTiempo, promedioDias: Math.round(prom * 10) / 10, maxDias: diasTarde.length ? Math.max(...diasTarde) : 0, vencidasHoy, pagados, activos };
}

// ---------- Flujo de caja proyectado ----------
/** items: [{ prestamo, abonos, nombre }]. Devuelve lo vencido y lo esperado por mes. */
export function flujoProyectado(items, hoy = hoyISO(), meses = 6, dec = 0) {
  const porMes = {}, vencidos = [], sinFecha = [];
  const limite = addMonths(hoy.slice(0, 8) + '01', meses);
  for (const { prestamo, abonos, nombre } of items) {
    const e = estadoCuenta(prestamo, abonos, hoy, dec);
    if (e.estado === 'pagado') continue;
    const vencidoHoy = redondear(e.atraso + e.moraPendiente, dec) || (e.estado === 'vencido' ? e.totalParaSaldar : 0);
    if (vencidoHoy > 0) vencidos.push({ nombre, prestamo, valor: vencidoHoy, desde: e.primeraVencida || prestamo.fechaLimite, estado: e.estado });
    const filas = e.cronograma.filas;
    if (filas.length) {
      const cubre = e.pagado - e.moraPagada + e.devuelto; let acum = 0;
      for (const f of filas) {
        const ini = acum; acum += f.cuota;
        if (f.fecha < hoy) continue;
        const pend = redondear(Math.max(0, Math.min(f.cuota, acum - Math.max(ini, cubre))), dec);
        if (pend <= 0 || f.fecha >= limite) continue;
        const k = f.fecha.slice(0, 7); (porMes[k] = porMes[k] || { valor: 0, detalle: [] });
        porMes[k].valor += pend; porMes[k].detalle.push({ nombre, fecha: f.fecha, valor: pend, prestamo });
      }
    } else if (prestamo.fechaLimite && prestamo.fechaLimite >= hoy && prestamo.fechaLimite < limite) {
      const k = prestamo.fechaLimite.slice(0, 7); (porMes[k] = porMes[k] || { valor: 0, detalle: [] });
      porMes[k].valor += e.totalParaSaldar; porMes[k].detalle.push({ nombre, fecha: prestamo.fechaLimite, valor: e.totalParaSaldar, prestamo });
    } else if (!prestamo.fechaLimite) sinFecha.push({ nombre, prestamo, valor: e.totalParaSaldar });
  }
  const lista = [];
  for (let m = hoy.slice(0, 8) + '01'; m < limite; m = addMonths(m, 1)) { const k = m.slice(0, 7); lista.push({ mes: k, valor: redondear(porMes[k]?.valor || 0, dec), detalle: (porMes[k]?.detalle || []).sort((a, b) => a.fecha.localeCompare(b.fecha)) }); }
  return { vencidos: vencidos.sort((a, b) => b.valor - a.valor), totalVencido: redondear(vencidos.reduce((s, v) => s + v.valor, 0), dec), meses: lista, totalProyectado: redondear(lista.reduce((s, m) => s + m.valor, 0), dec), sinFecha };
}

// ---------- Número a letras (para el pagaré) ----------
const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function cientos(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '');
  return [C[c], dec].filter(Boolean).join(' ');
}
export function numeroALetras(valor, moneda = 'PESOS M/CTE') {
  let n = Math.floor(Math.abs(Number(valor) || 0));
  if (n === 0) return 'CERO ' + moneda;
  const partes = [];
  const millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  if (millones) {
    const mm = Math.floor(millones / 1000), m = millones % 1000; // miles de millones
    if (mm) partes.push(mm === 1 ? 'MIL' : cientos(mm) + ' MIL');
    if (m || mm) partes.push(millones === 1 ? 'UN MILLÓN' : (m ? cientos(m) + ' ' : '') + 'MILLONES');
  }
  if (miles) partes.push(miles === 1 ? 'MIL' : cientos(miles) + ' MIL');
  if (resto) partes.push(cientos(resto));
  const de = !miles && !resto && millones ? ' DE' : '';
  return partes.join(' ').replace(/\s+/g, ' ').trim() + de + ' ' + moneda;
}

// ---------- Explicación (pantalla y PDF) ----------
export function explicacion(prestamo, fmt = String) {
  const im = tasaMensual(prestamo.interes), partes = [];
  if (!im) partes.push('Sin interés remuneratorio.');
  else {
    const base = `Interés remuneratorio: ${prestamo.interes.tasa}% ${TIPOS_TASA[prestamo.interes.tipo].toLowerCase()}`;
    partes.push(prestamo.interes.tipo === 'mensual' ? base + '.' : `${base}, equivalente a ${(im * 100).toFixed(4)}% mensual.`);
    partes.push('Se calcula sobre el saldo de capital no vencido, en proporción al tiempo (meses completos + días/30). No se cobra interés sobre interés.');
  }
  const a = prestamo.admin || {};
  if (a.tipo === 'fijo_mensual') partes.push(`Administración: ${fmt(a.valor)} por mes (proporcional al tiempo).`);
  if (a.tipo === 'pct_saldo') partes.push(`Administración: ${a.valor}% mensual sobre el saldo de capital.`);
  if (a.tipo === 'unico') partes.push(`Administración: cobro único de ${fmt(a.valor)}, incluido en el primer pago.`);
  const pl = prestamo.plan || {};
  const per = pl.periodo === 'dias' ? `cada ${pl.diasPeriodo} días` : (PERIODOS[pl.periodo]?.label || '').toLowerCase();
  if (pl.tipo === 'cuotas_iguales') partes.push(`Forma de pago: ${pl.numCuotas} cuotas iguales de capital + interés (sistema francés), periodicidad ${per}${a.tipo && a.tipo !== 'ninguno' ? ', más la administración de cada periodo' : ''}.`);
  if (pl.tipo === 'interes_periodico') partes.push(`Forma de pago: intereses ${per} durante ${pl.numCuotas} periodos y el capital completo en la última cuota.`);
  if (pl.tipo === 'pago_unico') partes.push('Forma de pago: capital e intereses en un solo pago al final del plazo.');
  if (pl.tipo === 'personalizado') partes.push('Forma de pago: cuotas con fechas y valores acordados.');
  if (pl.tipo === 'libre') partes.push('Forma de pago: abonos libres hasta la fecha límite.');
  if (moraActiva(prestamo)) partes.push('Mora: si una cuota no se paga en su fecha, desde el día siguiente el capital vencido causa interés moratorio a la tasa máxima legal permitida (tasa de usura certificada por la Superintendencia Financiera para cada mes), hasta su pago. Durante la mora no se cobra interés remuneratorio sobre ese capital.');
  partes.push(`Cada pago se aplica primero ${moraActiva(prestamo) ? 'a intereses de mora, luego ' : ''}a administración, intereses y por último a capital.`);
  return partes;
}
