# Cómo calcula la app

Implementado en `js/calc.js` y verificado por `tests/calc.test.js` (`npm test` o `node tests/calc.test.js`).

## 1. Tasa mensual equivalente (im)
| Tipo de tasa | Fórmula | Ejemplo |
|---|---|---|
| Mensual | im = tasa | 2% → 2% |
| Anual efectiva (E.A.) | im = (1 + tasa)^(1/12) − 1 | 26,82% E.A. → 2% |
| Anual nominal (÷12) | im = tasa / 12 | 24% → 2% |

## 2. Causación de interés
Interés = saldo de capital × im × meses, donde **meses = meses calendario completos + días sobrantes / 30**.
Ej.: del 15-ene al 15-feb = 1 mes; del 1-ene al 16-ene = 0,5 meses.
El interés **no se capitaliza**: si un pago no alcanza a cubrirlo, queda como “interés pendiente” sin generar más interés.

## 3. Administración
- **Fija por mes:** valor × meses transcurridos.
- **% mensual sobre saldo:** saldo de capital × % × meses.
- **Cobro único:** se suma al primer pago.

## 4. Aplicación de cada pago
1) administración pendiente → 2) interés pendiente → 3) capital. Si sobra, se muestra como saldo a favor.

## 5. Planes de pago
- **Cuotas iguales (sistema francés):** cuota = P·r / (1 − (1+r)^−n), con r = im × meses del periodo (semanal = 7/30, quincenal = 15/30, mensual = 1, …). La cuota fija cubre capital + interés; la administración se suma aparte. La última cuota ajusta centavos/pesos de redondeo.
  - Ejemplo verificado: $1.000.000 al 2% mensual en 12 cuotas → cuota $94.560.
- **Cuotas personalizadas:** usted define fechas y valores. La app calcula cuánto de cada cuota va a interés/capital y avisa si el plan no cubre la deuda; el botón *Ajustar última cuota* la recalcula para que cierre en cero.
- **Abonos libres:** sin calendario; el interés corre sobre el saldo hasta la fecha de cada abono. Se recomienda fecha límite.

## 6. Estado de cuenta
Se reproducen los abonos reales en orden de fecha. Resultado a la fecha de corte: capital pendiente, interés y administración pendientes, **total para saldar hoy**, total pagado y su distribución.
Si hay plan de cuotas: **atraso** = suma de cuotas vencidas − total pagado; estado *Con atraso* si es mayor que cero; *Vencido* si pasó la fecha límite con saldo; *Pagado* si el total para saldar es cero.

Nota: si el deudor paga en fechas distintas a las del plan, el interés real (por fechas reales) puede diferir del plan. Lo que manda para saldar es el estado de cuenta.

Redondeo: a los decimales configurados (COP: 0) en cada cálculo de interés y cuota.
