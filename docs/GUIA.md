# Guía de instalación paso a paso

Tiempo estimado: 45–60 minutos la primera vez. Costo: $0 (GitHub, Supabase y Gmail en planes gratuitos).

| Paso | Qué logra | ¿Obligatorio? |
|---|---|---|
| 1 | Repositorio en GitHub | Sí |
| 2 | App publicada e instalada en celular y PC | Sí |
| 3 | Sincronización celular ↔ computador (Supabase) | Opcional |
| 4 | Envío de PDF desde un correo dedicado (Gmail + Apps Script) | Opcional |

---

## Paso 1. Crear el repositorio en GitHub

1. Cree una cuenta en <https://github.com> (si no la tiene).
2. Entre a <https://github.com/new>:
   - **Repository name:** `control-prestamos`
   - **Visibility:** *Public* (GitHub Pages gratuito exige repositorio público; el **código** queda visible, pero **sus datos nunca se suben** al repositorio: viven en su dispositivo y, si lo activa, en su Supabase privado).
   - No marque “Add a README”.
   - Clic en **Create repository**.
3. Suba los archivos. Opción A (recomendada, con Git instalado — <https://git-scm.com/download/win>). En la carpeta descomprimida, abra una terminal (clic derecho → *Abrir en Terminal*) y ejecute:
   ```bash
   git remote add origin https://github.com/SU_USUARIO/control-prestamos.git
   git push -u origin main
   ```
   El paquete ya trae el repositorio Git inicializado con el primer commit.
   Opción B (sin Git): en la página del repositorio vacío, clic en **uploading an existing file**, arrastre **el contenido** de la carpeta (no la carpeta) y clic en **Commit changes**.

> ¿Prefiere repositorio privado? Use Cloudflare Pages o Netlify (gratis con repositorios privados) en lugar del Paso 2: conecte el repositorio, sin comando de build, carpeta de salida `/`.

## Paso 2. Publicar e instalar la app

1. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
2. Espere 1–2 minutos. La dirección será `https://SU_USUARIO.github.io/control-prestamos/`.
3. Ábrala en el computador y verifique: cree una cuenta (Personas → Mis cuentas), una persona y un préstamo de prueba, y pulse **PDF condiciones**.
4. Instalar:
   - **Android (Chrome):** menú ⋮ → **Instalar app** (o *Agregar a pantalla principal*).
   - **iPhone (Safari):** botón Compartir → **Agregar a inicio**.
   - **Windows (Chrome o Edge):** icono de instalar en la barra de direcciones → **Instalar**.
5. Vaya a **Ajustes** y complete sus datos de prestamista (aparecen en los PDF).

Sin el Paso 3, cada dispositivo tiene sus propios datos. Use **Ajustes → Descargar respaldo** con frecuencia.

## Paso 3. Sincronización entre celular y computador (Supabase)

1. Cree una cuenta en <https://supabase.com> → **New project**. Nombre: `prestamos`; región: la más cercana (p. ej. *South America (São Paulo)*); guarde la contraseña de la base de datos en un lugar seguro.
2. **SQL Editor → New query** → pegue todo el contenido de `supabase/schema.sql` → **Run**. Debe decir *Success*.
3. **Authentication → Users → Add user → Create new user**: su correo y una contraseña fuerte, con **Auto Confirm User** marcado.
4. **Authentication → Sign In / Providers** (o *Settings*): desactive **Allow new users to sign up**. Así nadie más puede crear usuarios en su proyecto.
5. **Project Settings → API Keys** (o *Data API*): copie la **Project URL** (`https://xxxx.supabase.co`) y la clave **anon public** o **publishable**. **Nunca** use la clave `service_role`/`secret` en la app.
6. En la app, en cada dispositivo: **Ajustes → Sincronización** → URL, clave, su correo y contraseña → **Conectar y sincronizar**.
   - Empiece por el dispositivo que ya tiene datos; luego conecte el otro.

Funcionamiento: la app guarda primero en el dispositivo (funciona sin internet) y sincroniza automáticamente al guardar, al recuperar la conexión y al abrirla. Si el mismo registro se edita en dos dispositivos sin conexión, prevalece la edición más reciente.

> El plan gratuito de Supabase **pausa el proyecto tras ~7 días sin uso**. Se reactiva desde el panel (*Restore project*). Mientras tanto la app sigue funcionando con los datos locales.

## Paso 4. Envío por correo desde una cuenta dedicada

Los correos saldrán desde una cuenta de Gmail nueva (no la personal) y quedarán en su carpeta *Enviados* como constancia.

1. Cree una cuenta de Gmail con nombre profesional, p. ej. `prestamos.sunombre@gmail.com`. Use una ventana de incógnito o un perfil de navegador distinto para no mezclarla con su cuenta personal.
2. Con **esa** cuenta, entre a <https://script.google.com> → **Nuevo proyecto** → nómbrelo `Prestamos Mailer`.
3. Borre el contenido de `Código.gs` y pegue todo `apps-script/Code.gs`. Guarde (Ctrl+S).
4. En la barra superior seleccione la función **`generarToken`** → **Ejecutar** → **Revisar permisos** → elija la cuenta dedicada → *Configuración avanzada* → *Ir a Prestamos Mailer (no seguro)* → **Permitir**. (El aviso aparece porque el script es suyo y no está verificado por Google.)
   - Abra **Registro de ejecución** y copie el valor que aparece después de `TOKEN:`.
5. Seleccione **`probarEnvio`** → **Ejecutar** → autorice el envío de correo. Debe llegarle un correo de prueba a la cuenta dedicada.
6. **Implementar → Nueva implementación** → engranaje → **Aplicación web**:
   - Descripción: `v1`
   - **Ejecutar como:** *Yo (cuenta dedicada)*
   - **Quién tiene acceso:** *Cualquier usuario* (necesario para que la app pueda llamarlo; el TOKEN es lo que lo protege).
   - **Implementar** → copie la **URL de la aplicación web** (termina en `/exec`).
7. En la app → **Ajustes → Servicio de correo**: pegue URL y TOKEN; nombre visible del remitente (p. ej. *Juan Pérez – Préstamos*); **Responder a**: déjelo vacío para que las respuestas lleguen a la cuenta dedicada; **Copia oculta**: opcional, si quiere recibir copia. **Guardar ajustes → Probar conexión.**
8. Pruebe: abra un préstamo → **Enviar por correo** → envíese el estado de cuenta a usted mismo.

Opcional: cree una hoja de Google Sheets en la cuenta dedicada, copie su ID (la parte larga de la URL) y agréguelo en Apps Script → ⚙ *Configuración del proyecto* → *Propiedades del script* → `LOG_SHEET_ID`. Cada envío quedará registrado allí.

Si modifica `Code.gs`: **Implementar → Gestionar implementaciones → ✎ → Versión: Nueva versión → Implementar** (la URL no cambia).

Límite: Gmail gratuito permite ~100 destinatarios por día desde Apps Script. Para una dirección con dominio propio (p. ej. `cobros@sudominio.com`) vea `docs/DECISIONES.md`.

## Actualizar la app

Después de cambiar archivos, edite `VERSION` en `sw.js` (p. ej. `prestamos-v1.0.1`), haga commit y push. Los dispositivos tomarán la versión nueva al reabrir la app (a veces requiere cerrarla y abrirla dos veces).

## Seguridad: qué queda dónde

| Dato | Dónde se guarda |
|---|---|
| Préstamos, personas, abonos, ajustes | Dispositivo (localStorage) y, si activa el Paso 3, su base Supabase protegida por usuario (RLS) |
| Credenciales de Supabase (sesión) | Solo en cada dispositivo; nunca se sincronizan |
| URL y TOKEN del correo | En Ajustes (se sincronizan a su Supabase privado) |
| Código de la app | GitHub (público, sin datos) |

Si pierde o le roban el celular: en Supabase → *Authentication → Users* cambie la contraseña de su usuario y, si teme que se usó el TOKEN, ejecute de nuevo `generarToken` y actualícelo en la app.
