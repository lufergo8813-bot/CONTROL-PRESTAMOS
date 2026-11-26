# Cómo calcula la app

Implementado en `js/calc.js` y verificado por `tests/calc.test.js` (`node tests/calc.test.js`, 20 pruebas).

## 1. Tasa mensual equivalente (im)
| Tipo de tasa | Fórmula | Ejemplo |
|---|---|---|
| Mensual | im = tasa | 2% → 2% |
| Anual efectiva (E.A.) | im = (1 + tasa)^(1/12) − 1 | 26,82% E.A. → 2% |
| Anual nominal (÷12) | im = tasa / 12 | 24% → 2% |

## 2. Interés remuneratorio
Interés = capital NO vencido × im × meses, donde **meses = meses calendario completos + días sobrantes / 30**. No se capitaliza: si un pago no lo cubre, queda pendiente sin generar más interés.

## 3. Interés de mora
- Base: **capital vencido**, es decir, el capital de las cuotas cuya fecha ya pasó y no se ha pagado (en abonos libres, todo el capital después de la fecha límite).
- Desde el **día siguiente** al vencimiento hasta la fecha real del pago que registre.
- Tasa: **tasa de usura del mes** (consumo y ordinario, certificada por la Superfinanciera), convertida a mensual: (1 + usura)^(1/12) − 1, y prorrateada por días: × días / 30. Si un atraso cruza varios meses, cada tramo usa la tasa de su mes.
- Mientras un capital está en mora no causa además interés remuneratorio (no se cobran los dos sobre el mismo capital).
- Ejemplo verificado: $1.000.000 vencidos el 1-oct-2026, sin pagar al 25-nov-2026: 30 días de octubre a 28,59% E.A. ($21.176) + 25 días de noviembre a 28,34% E.A. ($17.509) = **$38.685**.
- La tasa de usura se actualiza desde Ajustes (lectura automática del comunicado de la Superfinanciera = 1,5 × interés bancario corriente) o a mano.

## 4. Administración
Fija por mes (× meses), % mensual sobre saldo de capital, o cobro único con el primer pago.

## 5. Aplicación de cada pago
1) mora → 2) administración → 3) interés → 4) capital. Si sobra, se muestra como saldo a favor. Las devoluciones de mercancía reducen directamente el capital.

## 6. Formas de pago
- **Cuotas iguales (sistema francés):** cuota = P·r / (1 − (1+r)^−n), con r = im × meses del periodo (semanal 7/30, quincenal 15/30, cada N días N/30, mensual 1…). Ej.: $1.000.000 al 2% mensual en 12 cuotas → $94.560.
- **Intereses periódicos y capital al final:** cada periodo se paga el interés; la última cuota incluye todo el capital. Ej.: $1.000.000 al 2% en 3 meses → 20.000, 20.000, 1.020.000.
- **Todo al final:** un solo pago con capital + interés de todo el plazo.
- **Cuotas personalizadas:** usted define fechas y valores; la app indica cuánto va a capital/interés/administración y si falta cubrir algo (botón *Ajustar la última cuota*).
- **Abonos libres:** sin calendario; fecha límite obligatoria.

## 7. Ganancia estimada (vista previa)
Suma de intereses + administración del plan si el deudor paga puntual. No incluye mora.

## 8. Score de cumplimiento (0 a 100)
Para cada cuota ya vencida se mira si quedó cubierta a tiempo con los pagos acumulados.
`score = 100 − 45 × (cuotas tarde / cuotas vencidas) − min(25, 0,8 × días promedio de atraso) − (si hay cuotas vencidas sin pagar hoy: min(25, 10 + 5 × cuántas)) + min(10, 3 × operaciones saldadas)`.
Niveles: **A** ≥ 85 excelente · **B** ≥ 70 bueno · **C** ≥ 50 regular · **D** < 50 en riesgo. Sin cuotas vencidas: "Sin historial". Incluye préstamos y consignaciones.

## 9. Flujo de caja proyectado
Por cada mes: lo que falta por cobrar de las cuotas con fecha en ese mes (descontando lo ya pagado). Lo vencido se muestra aparte. Abonos libres y consignaciones cuentan en el mes de su fecha límite.

## 10. Consignación
Valor = Σ cantidad × valor unitario. Ventas reportadas = pagos (con detalle de unidades); devoluciones reducen el capital. Inventario "en su poder" = entregado − vendido − devuelto. Interés opcional sobre el saldo; mora opcional después de la fecha límite.

Redondeo: a los decimales configurados (COP: 0).
