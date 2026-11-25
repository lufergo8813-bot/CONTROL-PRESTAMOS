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

console.log(`\n${ok} pruebas superadas`);
