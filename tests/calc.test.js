// Pruebas del motor de cálculo. Ejecutar: node tests/calc.test.js
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

let ok = 0;
const t = (nombre, fn) => { try { fn(); ok++; console.log('✔', nombre); } catch (e) { console.error('✘', nombre, '\n ', e.message); process.exitCode = 1; } };

t('mesesEntre: mes completo y fracción', () => {
  assert.equal(C.mesesEntre('2026-01-15', '2026-02-15'), 1);
  assert.equal(C.mesesEntre('2026-01-31', '2026-02-28'), 1);
  assert.equal(C.mesesEntre('2026-01-01', '2026-01-16'), 0.5);
  assert.equal(C.mesesEntre('2026-03-10', '2026-03-10'), 0);
});

t('tasas: mensual, EA y nominal', () => {
  assert.equal(C.tasaMensual({ tipo: 'mensual', tasa: 2 }), 0.02);
  assert.ok(Math.abs(C.tasaMensual({ tipo: 'anual_ea', tasa: 26.8241795 }) - 0.02) < 1e-9);
  assert.equal(C.tasaMensual({ tipo: 'anual_nominal', tasa: 24 }), 0.02);
});

t('cuotas iguales: 1.000.000 al 2% mensual, 12 cuotas (cuota ≈ 94.560)', () => {
  const p = { monto: 1000000, fecha: '2026-01-10', interes: { tipo: 'mensual', tasa: 2 }, admin: { tipo: 'ninguno' },
    plan: { tipo: 'cuotas_iguales', numCuotas: 12, periodo: 'mensual', fechaPrimeraCuota: '2026-02-10' } };
  const c = C.generarCronograma(p);
  assert.equal(c.cuotaBase, 94560);
  assert.equal(c.filas.length, 12);
  assert.equal(c.filas[0].interes, 20000);
  assert.equal(c.filas[11].saldoFinal, 0);
  assert.equal(c.totales.capital, 1000000);
  assert.ok(Math.abs(c.filas[11].cuota - 94560) <= 10, 'última cuota ≈ cuota base');
});

t('pagar exactamente el plan deja el préstamo en 0 y al día', () => {
  const p = { monto: 1000000, fecha: '2026-01-10', interes: { tipo: 'mensual', tasa: 2 }, admin: { tipo: 'pct_saldo', valor: 0.5 },
    plan: { tipo: 'cuotas_iguales', numCuotas: 6, periodo: 'mensual', fechaPrimeraCuota: '2026-02-10' } };
  const c = C.generarCronograma(p);
  const abonos = c.filas.map((f, i) => ({ id: 'a' + i, fecha: f.fecha, valor: f.cuota }));
  const e = C.estadoCuenta(p, abonos, '2026-12-31');
  assert.equal(e.capital, 0); assert.equal(e.totalParaSaldar, 0); assert.equal(e.estado, 'pagado');
  e.movimientos.forEach((m, i) => { assert.equal(m.aInteres, c.filas[i].interes); assert.equal(m.aAdmin, c.filas[i].admin); assert.equal(m.aCapital, c.filas[i].capital); });
});

t('atraso: a mitad del plan sin pagos', () => {
  const p = { monto: 600000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, admin: { tipo: 'ninguno' },
    plan: { tipo: 'cuotas_iguales', numCuotas: 6, periodo: 'mensual', fechaPrimeraCuota: '2026-02-01' } };
  const e = C.estadoCuenta(p, [{ fecha: '2026-02-01', valor: 100000 }], '2026-04-15');
  assert.equal(e.atraso, 200000); assert.equal(e.cuotasVencidas, 2); assert.equal(e.estado, 'en_mora');
  assert.equal(e.proxima.fecha, '2026-05-01');
});

t('abonos libres: interés sobre saldo y orden de aplicación', () => {
  const p = { monto: 1000000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 3 }, admin: { tipo: 'fijo_mensual', valor: 10000 }, plan: { tipo: 'libre' } };
  const e = C.estadoCuenta(p, [{ fecha: '2026-02-01', valor: 240000 }], '2026-03-01');
  const m = e.movimientos[0];
  assert.equal(m.aAdmin, 10000); assert.equal(m.aInteres, 30000); assert.equal(m.aCapital, 200000);
  assert.equal(e.capital, 800000); assert.equal(e.interesPendiente, 24000); assert.equal(e.adminPendiente, 10000);
  assert.equal(e.totalParaSaldar, 834000);
});

t('pago menor que el interés: queda interés pendiente (no se capitaliza)', () => {
  const p = { monto: 1000000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 5 }, admin: { tipo: 'ninguno' }, plan: { tipo: 'libre' } };
  const e = C.estadoCuenta(p, [{ fecha: '2026-02-01', valor: 20000 }], '2026-03-01');
  assert.equal(e.capital, 1000000); assert.equal(e.interesPendiente, 80000);
});

t('personalizado: detecta faltante y ajusta la última cuota', () => {
  const p = { monto: 500000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 2 }, admin: { tipo: 'unico', valor: 20000 },
    plan: { tipo: 'personalizado', cuotas: [{ fecha: '2026-02-01', valor: 200000 }, { fecha: '2026-04-01', valor: 200000 }, { fecha: '2026-06-01', valor: 100000 }] } };
  const c = C.generarCronograma(p);
  assert.ok(c.faltante > 0);
  const cuotas = C.ajustarUltimaCuota(p);
  const c2 = C.generarCronograma({ ...p, plan: { ...p.plan, cuotas } });
  assert.equal(c2.faltante, 0);
  assert.equal(c2.filas[2].saldoFinal, 0);
  assert.equal(c2.filas[0].admin, 20000);
});

t('vencido: pasada la fecha límite con saldo', () => {
  const p = { monto: 100000, fecha: '2026-01-01', fechaLimite: '2026-03-01', interes: { tipo: 'mensual', tasa: 0 }, plan: { tipo: 'libre' } };
  assert.equal(C.estadoCuenta(p, [], '2026-03-02').estado, 'vencido');
  assert.equal(C.estadoCuenta(p, [{ fecha: '2026-02-01', valor: 100000 }], '2026-03-02').estado, 'pagado');
});

t('cuotas semanales sin interés', () => {
  const p = { monto: 100000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, plan: { tipo: 'cuotas_iguales', numCuotas: 4, periodo: 'semanal', fechaPrimeraCuota: '2026-01-08' } };
  const c = C.generarCronograma(p);
  assert.deepEqual(c.filas.map(f => f.fecha), ['2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29']);
  assert.deepEqual(c.filas.map(f => f.cuota), [25000, 25000, 25000, 25000]);
});

// ---------- v2 ----------
t('intereses periódicos y capital al final', () => {
  const p = { monto: 1000000, fecha: '2026-01-10', interes: { tipo: 'mensual', tasa: 2 }, plan: { tipo: 'interes_periodico', numCuotas: 3, periodo: 'mensual', fechaPrimeraCuota: '2026-02-10' } };
  const c = C.generarCronograma(p);
  assert.deepEqual(c.filas.map(f => f.cuota), [20000, 20000, 1020000]);
  assert.equal(c.ganancia, 60000);
});

t('todo al final (pago único)', () => {
  const p = { monto: 1000000, fecha: '2026-01-10', interes: { tipo: 'mensual', tasa: 2 }, plan: { tipo: 'pago_unico', fechaPago: '2026-04-10' } };
  const c = C.generarCronograma(p);
  assert.equal(c.filas.length, 1); assert.equal(c.filas[0].cuota, 1060000);
});

t('periodicidad cada N días', () => {
  const p = { monto: 90000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, plan: { tipo: 'cuotas_iguales', numCuotas: 3, periodo: 'dias', diasPeriodo: 10, fechaPrimeraCuota: '2026-01-11' } };
  assert.deepEqual(C.generarCronograma(p).filas.map(f => f.fecha), ['2026-01-11', '2026-01-21', '2026-01-31']);
});

t('mora: a tasa de usura sobre el capital vencido, desde el día siguiente', () => {
  C.configurarUsura({ '2026-02': 28.34 });
  const p = { monto: 1000000, fecha: '2026-01-10', interes: { tipo: 'mensual', tasa: 0 }, plan: { tipo: 'pago_unico', fechaPago: '2026-02-10' } };
  const im = C.eaAMensual(28.34) / 100;
  const e = C.estadoCuenta(p, [], '2026-02-20');
  assert.equal(e.moraPendiente, Math.round(1000000 * im * 10 / 30));
  assert.equal(C.estadoCuenta(p, [], '2026-02-10').moraPendiente, 0, 'el día del vencimiento no hay mora');
  assert.equal(C.estadoCuenta(p, [], '2026-02-11').moraPendiente, Math.round(1000000 * im / 30));
  // pago tardío: primero cubre la mora
  const e2 = C.estadoCuenta(p, [{ fecha: '2026-02-20', valor: 1000000 }], '2026-02-28');
  assert.equal(e2.movimientos[0].aMora, e.moraPendiente);
  assert.equal(e2.capital, e.moraPendiente);
  C.configurarUsura({});
});

t('mora: cambia de tasa según el mes', () => {
  C.configurarUsura({ '2026-02': 30, '2026-03': 24 });
  const p = { monto: 300000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, plan: { tipo: 'pago_unico', fechaPago: '2026-02-18' } };
  const e = C.estadoCuenta(p, [], '2026-03-10');
  const esperado = Math.round(300000 * (C.eaAMensual(30) / 100) * 10 / 30 + 300000 * (C.eaAMensual(24) / 100) * 10 / 30);
  assert.ok(Math.abs(e.moraPendiente - esperado) <= 1, `${e.moraPendiente} vs ${esperado}`);
  C.configurarUsura({});
});

t('mora: no hay remuneratorio sobre el capital vencido', () => {
  C.configurarUsura({ '2026-03': 24 });
  const p = { monto: 100000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 2 }, plan: { tipo: 'pago_unico', fechaPago: '2026-03-01' } };
  const e = C.estadoCuenta(p, [], '2026-03-31');
  assert.equal(e.interesPendiente, 4000, 'solo los 2 meses del plazo');
  assert.ok(e.moraPendiente > 0);
  C.configurarUsura({});
});

t('consignación: devoluciones reducen capital y no cuentan como pago', () => {
  const p = { monto: 500000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, fechaLimite: '2026-03-01', plan: { tipo: 'libre' } };
  const e = C.estadoCuenta(p, [{ fecha: '2026-02-01', valor: 200000, tipo: 'devolucion' }, { fecha: '2026-02-15', valor: 300000 }], '2026-02-20');
  assert.equal(e.devuelto, 200000); assert.equal(e.pagado, 300000); assert.equal(e.estado, 'pagado');
});

t('score: puntual vs moroso', () => {
  const p = { id: 'x', monto: 300000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, mora: { activa: false }, plan: { tipo: 'cuotas_iguales', numCuotas: 3, periodo: 'mensual', fechaPrimeraCuota: '2026-02-01' } };
  const bueno = C.scorePersona([{ prestamo: p, abonos: [{ fecha: '2026-02-01', valor: 100000 }, { fecha: '2026-03-01', valor: 100000 }, { fecha: '2026-04-01', valor: 100000 }] }], '2026-05-01');
  assert.equal(bueno.nivel, 'A'); assert.equal(bueno.aTiempo, 3);
  const malo = C.scorePersona([{ prestamo: p, abonos: [{ fecha: '2026-03-15', valor: 100000 }] }], '2026-05-01');
  assert.ok(malo.puntaje < 50, 'puntaje ' + malo.puntaje); assert.equal(malo.vencidasHoy, 2);
  assert.equal(C.scorePersona([{ prestamo: p, abonos: [] }], '2026-01-15').etiqueta, 'Sin historial');
});

t('flujo proyectado por mes', () => {
  const p = { monto: 300000, fecha: '2026-01-01', interes: { tipo: 'mensual', tasa: 0 }, mora: { activa: false }, plan: { tipo: 'cuotas_iguales', numCuotas: 3, periodo: 'mensual', fechaPrimeraCuota: '2026-02-01' } };
  const f = C.flujoProyectado([{ prestamo: p, abonos: [], nombre: 'A' }], '2026-02-15', 3);
  assert.equal(f.totalVencido, 100000);
  assert.deepEqual(f.meses.map(m => [m.mes, m.valor]), [['2026-02', 0], ['2026-03', 100000], ['2026-04', 100000]]);
});

t('número a letras', () => {
  assert.equal(C.numeroALetras(1500000), 'UN MILLÓN QUINIENTOS MIL PESOS M/CTE');
  assert.equal(C.numeroALetras(2000000), 'DOS MILLONES DE PESOS M/CTE');
  assert.equal(C.numeroALetras(21350), 'VEINTIÚN MIL TRESCIENTOS CINCUENTA PESOS M/CTE');
  assert.equal(C.numeroALetras(100), 'CIEN PESOS M/CTE');
  assert.equal(C.numeroALetras(1001000), 'UN MILLÓN MIL PESOS M/CTE');
  assert.equal(C.numeroALetras(345678912), 'TRESCIENTOS CUARENTA Y CINCO MILLONES SEISCIENTOS SETENTA Y OCHO MIL NOVECIENTOS DOCE PESOS M/CTE');
});

// ---------- abonos extraordinarios ----------
const base12 = { monto: 1000000, fecha: '2026-01-10', interes: { tipo: 'mensual', tasa: 2 }, admin: { tipo: 'ninguno' }, mora: { activa: false },
  plan: { tipo: 'cuotas_iguales', numCuotas: 12, periodo: 'mensual', fechaPrimeraCuota: '2026-02-10' } };
const pagarPlan = (p, extras) => {
  // paga las 3 primeras cuotas, el abono extra, y luego exactamente lo que diga el plan recalculado
  const c0 = C.generarCronograma(p);
  let ab = c0.filas.slice(0, 3).map((f, i) => ({ id: 'r' + i, fecha: f.fecha, valor: f.cuota, creado: '1' }));
  ab = [...ab, ...extras.map((x, i) => ({ id: 'x' + i, creado: '2', ...x }))];
  const c1 = C.generarCronograma(p, 0, ab);
  c1.filas.filter(f => f.tipo !== 'extra' && f.fecha > '2026-04-10').forEach((f, i) => ab.push({ id: 'n' + i, fecha: f.fecha, valor: f.cuota, creado: '3' }));
  return { c1, ab };
};

t('extra: reducir plazo mantiene la cuota y termina antes', () => {
  const { c1, ab } = pagarPlan(base12, [{ fecha: '2026-04-10', valor: 300000, extra: true, efecto: 'plazo' }]);
  const regulares = c1.filas.filter(f => f.tipo !== 'extra');
  assert.ok(regulares.length < 12, 'menos cuotas: ' + regulares.length);
  assert.equal(regulares[4].cuota, 94560, 'misma cuota');
  assert.equal(c1.totales.capital, 1000000);
  assert.equal(c1.filas.at(-1).saldoFinal, 0);
  const e = C.estadoCuenta(base12, ab, '2027-12-31');
  assert.equal(e.estado, 'pagado'); assert.equal(e.totalParaSaldar, 0);
});

t('extra: reducir cuota mantiene el plazo con cuota menor', () => {
  const { c1, ab } = pagarPlan(base12, [{ fecha: '2026-04-10', valor: 300000, extra: true, efecto: 'cuota' }]);
  const regulares = c1.filas.filter(f => f.tipo !== 'extra');
  assert.equal(regulares.length, 12);
  assert.ok(regulares[5].cuota < 94560 && regulares[5].cuota > 50000, 'cuota ' + regulares[5].cuota);
  assert.equal(c1.filas.at(-1).saldoFinal, 0);
  assert.equal(C.estadoCuenta(base12, ab, '2027-12-31').estado, 'pagado');
});

t('extra: entre fechas cobra el interés causado hasta ese día', () => {
  const c1 = C.generarCronograma(base12, 0, [{ fecha: '2026-02-25', valor: 210000, extra: true, efecto: 'cuota' }]);
  const ex = c1.filas.find(f => f.tipo === 'extra');
  assert.equal(ex.interes, Math.round((1000000 - 74560) * 0.02 * 15 / 30));
  assert.equal(ex.capital, 210000 - ex.interes);
  const s = C.simularExtra(base12, [], { fecha: '2026-02-25', valor: 210000, efecto: 'plazo' });
  assert.ok(s.cuotasDespues < s.cuotasAntes && s.ahorroIntereses > 0);
});

t('extra: no altera el score ni cuenta como cuota vencida', () => {
  const { ab } = pagarPlan({ ...base12, id: 'z' }, [{ fecha: '2026-04-10', valor: 300000, extra: true, efecto: 'plazo' }]);
  const s = C.scorePersona([{ prestamo: base12, abonos: ab }], '2027-12-31');
  assert.equal(s.vencidas, s.aTiempo);
});

console.log(`\n${ok} pruebas superadas`);
