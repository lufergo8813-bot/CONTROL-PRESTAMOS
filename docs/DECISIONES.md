# Decisiones tomadas y puntos por confirmar

## Confirmado con la usuaria (versión 2)
- **Pagaré:** tres vías: firma en pantalla, enlace de firma por correo y PDF para firma manuscrita con huella.
- **Consignación:** la persona paga lo que vende y devuelve lo que no vende; se controla por producto.
- **Recordatorios:** automáticos desde el servicio de Google, 3 días antes de cada cuota (configurable); en consignación, según lo personalizado (días antes, cada N días o fechas elegidas).
- **Mora:** desde el día siguiente al vencimiento, a la tasa de usura vigente de cada mes; la fecha del abono es editable para registrar la fecha real del pago.

## Aspecto legal (Colombia) — leer
- **Pagaré electrónico:** varios juzgados han negado mandamiento de pago con pagarés firmados con firma electrónica simple porque no se puede verificar que la firma provenga del deudor; los aceptados suelen tener firma digital certificada (p. ej. DECEVAL). Por eso la app recomienda conservar también el **pagaré impreso firmado a mano con huella**. La firma electrónica de la app (en pantalla o por enlace, con huella SHA-256, fecha, dispositivo y correo) sirve como prueba de aceptación, pero su fuerza ejecutiva no está garantizada.
- **Plantilla:** el texto del pagaré (`js/legal.js`) sigue los requisitos generales de los títulos valores y del pagaré (Código de Comercio, arts. 621 y 709) e incluye mora al máximo legal (art. 884), cláusula aceleratoria y dispensa de protesto. **Hágala revisar por un abogado** antes de usarla en cobros.
- **Usura:** la app avisa si la tasa pactada supera la usura del mes, pero no lo impide. Cobrar por encima de la usura puede ser delito (art. 305 Código Penal).
- **Lectura automática de la usura:** depende del formato de la página de la Superfinanciera; si cambia, la lectura falla y se debe escribir la tasa a mano en Ajustes.

## Inventario (versión 2.2)
- Confirmado: existencias por lote con vencimiento; Excel con o sin fotos; costo y precio; alertas de vencimiento; referencia, categoría y código de barras con escáner.
- Las fotos se reducen (máx. 800 px) y se guardan en el almacenamiento del navegador (IndexedDB), no en el almacenamiento normal, que es muy pequeño. Si activa la sincronización, también se copian a Supabase.
- La **copia de seguridad JSON no incluye las fotos**; para conservarlas entre dispositivos use la sincronización.
- Escáner: usa el lector nativo del navegador (Android y Chrome en computador); en iPhone/iPad carga la librería ZXing desde internet. Siempre se puede escribir el código a mano.
- No se pueden borrar lotes ni productos que tengan unidades entregadas en consignación.

## Decisiones técnicas
| Tema | Decisión | Alternativa |
|---|---|---|
| Interés | Simple sobre capital no vencido, no capitalizable | Compuesto |
| Cuotas iguales | Sistema francés; administración aparte | Cuota total fija con administración |
| Recordatorios | La app envía la agenda al servicio; el servicio envía cada día a las 7 a. m. (no requiere Supabase) | Leer los datos directamente de Supabase |
| Firma remota | Página `firmar.html` publicada con la app; el PDF firmado queda en Drive de la cuenta dedicada y se envía a ambos | Proveedor certificado (costo por firma) |
| Códigos | `PR-AAAA-NNNN` préstamos, `CO-AAAA-NNNN` consignaciones | — |
| Correo remitente | Gmail dedicada (~100 correos/día) | Dominio propio con Brevo/Resend |

## Mejoras posibles
- Firma digital certificada (proveedor autorizado por ONAC) para fuerza ejecutiva plena.
- Recordatorio por WhatsApp (enlace prellenado).
- Fotos de comprobantes de pago.
- Bloqueo con PIN o huella al abrir la app.
