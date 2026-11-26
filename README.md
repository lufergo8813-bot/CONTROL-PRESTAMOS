# Control de Préstamos

App personal para llevar el control de préstamos a terceros. Se instala en el **celular y el computador** (PWA), funciona **sin internet**, sincroniza entre dispositivos (opcional) y genera **PDF profesionales** que se envían por correo **desde una cuenta dedicada**, no desde el correo personal.

## Funciones (versión 2)
- **Formulario en una sola pantalla** con vista previa en vivo de la **ganancia**, la cuota y el plan (capital, intereses y administración por cuota).
- **Cuenta del deudor** (banco, tipo y número) y lista desplegable de **quién presta** (se crea en Ajustes).
- Formas de pago nuevas: **intereses periódicos y capital al final**, **todo al final**, periodicidad **cada N días**.
- **Tasa máxima legal (usura)** visible bajo el interés, con botón para actualizarla desde la Superfinanciera; aviso si la tasa la supera.
- **Mora** automática a la tasa de usura de cada mes sobre el capital vencido; advertencia incluida en condiciones y correos.
- **Pagaré** (Colombia): firma en pantalla, enlace de firma por correo o PDF para firma manuscrita con huella.
- **Recordatorios automáticos** por correo antes de cada pago, aunque el celular esté apagado.
- **Score** de cumplimiento por persona.
- **Informes**: flujo de caja esperado por mes y personas en mora; descarga o envío por correo.
- **Mercancía en consignación**: productos, ventas, devoluciones, interés opcional, pagaré opcional y recordatorio personalizado.

## Funciones (versión 1)
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
tests/calc.test.js    Pruebas de cálculos (20)
firmar.html           Página donde el deudor firma el pagaré desde el enlace
js/legal.js           Texto del pagaré y tasas de usura conocidas
docs/GUIA.md          Instalación paso a paso  ← empiece aquí
docs/CALCULOS.md      Fórmulas
docs/DECISIONES.md    Supuestos y mejoras sugeridas
```

## Probar en el computador
```bash
python -m http.server 8080      # luego abra http://localhost:8080
node tests/calc.test.js         # pruebas de cálculo
```
