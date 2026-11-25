# Instrucciones del proyecto: Control de Préstamos

- App PWA sin compilación: HTML + CSS + módulos JS nativos. No agregar frameworks ni dependencias sin autorización.
- Toda lógica financiera va en `js/calc.js` (funciones puras). Cualquier cambio de cálculo exige actualizar `tests/calc.test.js` y `docs/CALCULOS.md`, y que `node tests/calc.test.js` pase.
- No cambiar el formato de los registros guardados sin migración: hay datos reales en dispositivos y en Supabase (`registros.data`).
- Nunca poner credenciales (Supabase, TOKEN de correo) en el código ni en el repositorio: se ingresan en Ajustes.
- Al publicar cambios, incrementar `VERSION` en `sw.js`.
- Antes de cambios en `supabase/schema.sql` o `apps-script/Code.gs`, documentar los pasos de despliegue en `docs/GUIA.md`.
