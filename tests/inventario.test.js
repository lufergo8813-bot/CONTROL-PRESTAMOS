// Pruebas del inventario. Ejecutar: node tests/inventario.test.js
import assert from 'node:assert/strict';
import * as I from '../js/inventario.js';

let ok = 0;
const t = (nombre, fn) => { try { fn(); ok++; console.log('✔', nombre); } catch (e) { console.error('✘', nombre, '\n ', e.message); process.exitCode = 1; } };

const productos = [
  { id: 'p1', nombre: 'Perfume A', costo: 30000, precio: 50000, lotes: [{ id: 'l2', lote: 'B', vence: '2027-06-01', cantidad: 10 }, { id: 'l1', lote: 'A', vence: '2026-12-15', cantidad: 4 }] },
  { id: 'p2', nombre: 'Crema', costo: 10000, precio: 20000, lotes: [{ id: 'l3', lote: '', vence: '', cantidad: 6 }] },
];

t('existencias iniciales y orden por vencimiento', () => {
  const inf = I.existencias(productos, [], () => []);
  assert.equal(inf.p1.disponible, 14); assert.equal(inf.p1.lotes[0].id, 'l1', 'primero el que vence antes');
  assert.equal(inf.p1.proximoVence, '2026-12-15'); assert.equal(inf.p2.proximoVence, null);
});

t('FEFO: reparte primero el lote que vence antes', () => {
  const inf = I.existencias(productos, [], () => []);
  const r = I.asignarFEFO(inf.p1, 6);
  assert.deepEqual(r.asignacion.map(a => [a.loteId, a.cantidad]), [['l1', 4], ['l2', 2]]);
  assert.equal(r.faltante, 0);
  assert.equal(I.asignarFEFO(inf.p1, 20).faltante, 6);
});

const cons = [{ id: 'c1', codigo: 'CO-1', personaId: 'x', fechaLimite: '2027-01-01', productos: [
  { productoId: 'p1', loteId: 'l1', cantidad: 4, valorUnitario: 50000, costo: 30000 },
  { productoId: 'p1', loteId: 'l2', cantidad: 2, valorUnitario: 50000, costo: 30000 },
  { productoId: 'p2', loteId: 'l3', cantidad: 3, valorUnitario: 20000, costo: 10000 }] }];
const movs = { c1: [{ tipo: 'pago', detalle: [{ i: 0, cantidad: 3 }] }, { tipo: 'devolucion', detalle: [{ i: 2, cantidad: 1 }] }] };

t('entregas, ventas y devoluciones mueven las existencias', () => {
  const inf = I.existencias(productos, cons, id => movs[id] || []);
  const l1 = inf.p1.lotes.find(l => l.id === 'l1'), l3 = inf.p2.lotes[0];
  assert.equal(l1.disponible, 0); assert.equal(l1.enConsignacion, 1); assert.equal(l1.vendido, 3);
  assert.equal(l3.disponible, 4, '6 - 3 entregadas + 1 devuelta'); assert.equal(l3.enConsignacion, 2);
  assert.equal(inf.p1.disponible, 8); assert.equal(inf.p1.enConsignacion, 3);
});

t('validar entrega contra lo disponible (excluyendo la consignación que se edita)', () => {
  const inf = I.existencias(productos, cons, id => movs[id] || []);
  assert.equal(I.validarEntrega([{ loteId: 'l2', cantidad: 9 }], inf).length, 1);
  assert.equal(I.validarEntrega([{ loteId: 'l2', cantidad: 8 }], inf).length, 0);
  const sinEsta = I.existencias(productos, cons, id => movs[id] || [], { excluirConsignacion: 'c1' });
  assert.equal(sinEsta.p1.disponible, 14);
});

t('por vencer: bodega y consignación', () => {
  const inf = I.existencias(productos, cons, id => movs[id] || []);
  const pv = I.porVencer(inf, 30, '2026-11-26');
  assert.equal(pv.length, 1); assert.equal(pv[0].donde, 'consignacion'); assert.equal(pv[0].cantidad, 1); assert.equal(pv[0].dias, 19);
});

t('ganancia de la consignación', () => {
  const g = I.gananciaConsignacion(cons[0], movs.c1);
  assert.equal(g.realizada, 3 * 20000);
  assert.equal(g.esperada, 6 * 20000 + 2 * 10000);
});

console.log(`\n${ok} pruebas superadas`);
