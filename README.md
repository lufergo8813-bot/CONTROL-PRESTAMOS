# Control de Préstamos

App personal para llevar el control de préstamos a terceros. Se instala en el **celular y el computador** (PWA), funciona **sin internet**, sincroniza entre dispositivos (opcional) y genera **PDF profesionales** que se envían por correo **desde una cuenta dedicada**, no desde el correo personal.

## Funciones
- Persona (deudor), quién presta, **cuenta de origen** del dinero, monto y fecha.
- Interés personalizable: **mensual, anual E.A. o anual nominal** (o sin interés).
- Administración: **fija por mes, % mensual sobre saldo o cobro único**.
- Forma de pago: **abonos libres**, **cuotas iguales** (semanal, quincenal, mensual, bimestral, trimestral, semestral, anual) o **cuotas personalizadas** con fecha y valor.
- Fecha límite y notas.
- Registro de abonos con distribución automática (administración → interés → capital) y cuenta destino.
- Estado de cuenta a cualquier fecha, cuotas vencidas, atraso, próximos cobros y tablero general.
- PDF de **condiciones** (con firmas) y de **estado de cuenta**, descargables, compartibles o enviados por correo con historial de envíos.
- Respaldo/restauración en JSON.

## Estructura
```
index.html, css/, icons/, manifest.webmanifest, sw.js   App (sin compilación)
js/calc.js       Motor de cálculo (probado)
js/store.js      Almacenamiento local + sincronización Supabase
js/pdf.js        Generación de PDF (jsPDF)
js/email.js      Correo HTML + envío vía Apps Script
js/app.js        Interfaz
supabase/schema.sql   Tabla y seguridad (RLS) para sincronizar
apps-script/Code.gs   Servicio de envío desde la cuenta Gmail dedicada
tests/calc.test.js    Pruebas de cálculos
docs/GUIA.md          Instalación paso a paso  ← empiece aquí
docs/CALCULOS.md      Fórmulas
docs/DECISIONES.md    Supuestos y mejoras sugeridas
```

## Probar en el computador
```bash
python -m http.server 8080      # luego abra http://localhost:8080
node tests/calc.test.js         # pruebas de cálculo
```
