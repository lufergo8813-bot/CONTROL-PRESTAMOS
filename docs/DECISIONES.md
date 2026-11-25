# Decisiones tomadas y puntos por confirmar

Supuestos aplicados donde la solicitud no era explícita. Cada uno se puede cambiar.

| # | Tema | Decisión actual | Alternativa |
|---|---|---|---|
| 1 | “Quién se lo prestó” | Campo libre **Prestado por** (usted, socio, familiar). | Si significa *quién lo recomendó* o *codeudor/fiador*, agregar ese campo. |
| 2 | Tipo de interés | Interés simple sobre saldo de capital, no capitalizable. | Interés compuesto. |
| 3 | Tasa anual | Se ofrecen E.A. y nominal (÷12). | Solo una de las dos. |
| 4 | Cuotas iguales | Sistema francés: capital + interés constante; administración aparte. | Cuota total fija incluyendo administración, o abono a capital constante (cuota decreciente). |
| 5 | Orden de aplicación del pago | Administración → interés → capital. | Capital primero (menos favorable para el prestamista). |
| 6 | Mora | **No hay interés moratorio.** Solo se marca *Con atraso* / *Vencido*. | Tasa de mora sobre cuotas vencidas desde X días. |
| 7 | Correo remitente | Gmail dedicada vía Apps Script (gratis, ~100/día). | Dominio propio (`cobros@sudominio.com`) con Brevo/Resend + función en Supabase: más profesional, requiere comprar dominio (~USD 10–15/año) y configurar DNS. |
| 8 | Moneda | COP sin decimales, formato es-CO (configurable). | — |
| 9 | Usuarios | Un solo usuario (usted) en varios dispositivos. | Compartir con un socio (requiere permisos por usuario). |
| 10 | Códigos de referencia | `PR-AAAA-NNNN` consecutivos. Si crea préstamos en dos dispositivos sin conexión al mismo tiempo, podría repetirse un número (no afecta los datos). | Prefijo por dispositivo. |

## Aspecto legal (Colombia)
La app **no valida el límite de usura**. Cobrar intereses por encima de la tasa de usura vigente certificada por la Superintendencia Financiera puede ser delito. Verifique la tasa vigente del mes antes de pactar. Los PDF son informativos; para respaldo legal, use pagaré o contrato firmado (el PDF de condiciones trae líneas de firma).

## Mejoras sugeridas (no implementadas)
- Recordatorios automáticos de cuotas por correo (trigger diario en Apps Script) o enlace de WhatsApp con el mensaje prellenado.
- Fotos de comprobantes de pago adjuntas a cada abono (Supabase Storage).
- Interés moratorio y penalidades.
- Exportación a Excel de cartera y abonos.
- Bloqueo con PIN o huella al abrir la app.
