// Almacenamiento local (offline) + sincronización opcional con Supabase (REST, sin librerías).
// Cada registro: { id, updatedAt, deleted, _dirty, ...datos }. Conflictos: gana el cambio más reciente.

const KEY = 'prestamos_db_v1';
const CFG_KEY = 'prestamos_sync_v1'; // credenciales de sync: SOLO en este dispositivo, nunca se sincronizan
export const COLECCIONES = ['personas', 'cuentas', 'prestamos', 'abonos', 'envios', 'ajustes', 'prestamistas', 'pagares'];

const vacio = () => Object.fromEntries(COLECCIONES.map(c => [c, {}]));
let db = cargar();
const oyentes = new Set();

function cargar() {
  try { return { ...vacio(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return vacio(); }
}
function persistir() {
  localStorage.setItem(KEY, JSON.stringify(db));
  oyentes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}
export const onChange = fn => (oyentes.add(fn), () => oyentes.delete(fn));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
const ahora = () => new Date().toISOString();

export function listar(col, { incluirBorrados = false } = {}) {
  return Object.values(db[col] || {}).filter(r => incluirBorrados || !r.deleted);
}
export const obtener = (col, id) => (db[col] || {})[id] || null;

export function guardar(col, obj) {
  const id = obj.id || uid();
  const previo = db[col][id] || {};
  const rec = { ...previo, ...obj, id, creado: previo.creado || obj.creado || ahora(), updatedAt: ahora(), _dirty: true };
  db[col][id] = rec;
  persistir();
  programarSync();
  return rec;
}
export function borrar(col, id) {
  if (!db[col][id]) return;
  db[col][id] = { ...db[col][id], deleted: true, updatedAt: ahora(), _dirty: true };
  persistir();
  programarSync();
}

// ---------- Ajustes (registro único sincronizable) ----------
const AJ_ID = 'ajustes-generales';
export const AJUSTES_DEF = {
  prestamistaNombre: '', prestamistaDoc: '', prestamistaTel: '', prestamistaEmail: '', ciudad: '',
  moneda: 'COP', locale: 'es-CO', decimales: 0,
  mailerUrl: '', mailerToken: '', remitenteNombre: 'Control de Préstamos', replyTo: '', copiaOculta: '', correoInformes: '',
  recordatoriosActivos: true, diasRecordatorio: 3, mensajeRecordatorio: '', usura: {}, usuraLeida: '',
  piePdf: 'Documento informativo generado por el sistema de control de préstamos. Verifique los valores antes de realizar pagos.',
};
export const ajustes = () => ({ ...AJUSTES_DEF, ...(obtener('ajustes', AJ_ID) || {}) });
export const guardarAjustes = a => guardar('ajustes', { ...a, id: AJ_ID });

// ---------- Respaldo ----------
export function exportarJSON() {
  return JSON.stringify({ app: 'control-prestamos', version: 1, exportado: ahora(), datos: db }, null, 2);
}
export function importarJSON(texto) {
  const j = JSON.parse(texto);
  if (j.app !== 'control-prestamos' || !j.datos) throw new Error('El archivo no es un respaldo de esta app.');
  let n = 0;
  for (const col of COLECCIONES) {
    for (const rec of Object.values(j.datos[col] || {})) {
      const loc = db[col][rec.id];
      if (!loc || String(rec.updatedAt) > String(loc.updatedAt)) { db[col][rec.id] = { ...rec, _dirty: true }; n++; }
    }
  }
  persistir(); programarSync();
  return n;
}

// ---------- Sincronización con Supabase ----------
export const syncCfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch { return {}; } };
const setSyncCfg = c => localStorage.setItem(CFG_KEY, JSON.stringify(c));
export const syncActiva = () => { const c = syncCfg(); return !!(c.activa && c.url && c.key && c.session?.refresh_token); };
export let syncEstado = { msg: 'Sincronización desactivada', ok: null, ultima: syncCfg().ultima || null };
const setEstado = (msg, ok) => { syncEstado = { msg, ok, ultima: syncCfg().ultima || null }; oyentes.forEach(fn => fn()); };

async function auth(url, key, grant, body) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `Error de autenticación (${r.status})`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + (j.expires_in || 3600) * 1000, email: j.user?.email };
}

/** Inicia sesión y activa la sincronización en este dispositivo. */
export async function conectar(url, key, email, password) {
  url = url.trim().replace(/\/+$/, '');
  const session = await auth(url, key.trim(), 'password', { email: email.trim(), password });
  setSyncCfg({ url, key: key.trim(), session, activa: true, cursor: null, ultima: null });
  // Marcar todo lo local como pendiente para subirlo la primera vez
  for (const col of COLECCIONES) for (const r of Object.values(db[col])) r._dirty = true;
  persistir();
  return sincronizar();
}
export function desconectar() {
  setSyncCfg({});
  setEstado('Sincronización desactivada', null);
}

async function token() {
  const c = syncCfg();
  if (c.session.expira - Date.now() < 60000) {
    c.session = await auth(c.url, c.key, 'refresh_token', { refresh_token: c.session.refresh_token });
    setSyncCfg(c);
  }
  return c.session.access_token;
}
async function rest(path, opts = {}) {
  const c = syncCfg();
  const r = await fetch(`${c.url}/rest/v1/${path}`, {
    ...opts, headers: { apikey: c.key, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

let enCurso = null, temporizador = null;
function programarSync() {
  if (!syncActiva()) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sincronizar().catch(() => {}), 1500);
}

export function sincronizar() {
  if (!syncActiva()) return Promise.resolve(false);
  if (!navigator.onLine) { setEstado('Sin conexión: los cambios se guardan y se subirán después', false); return Promise.resolve(false); }
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      setEstado('Sincronizando…', null);
      const c = syncCfg();
      // 1) Descargar cambios remotos desde el último cursor (synced_at lo pone el servidor)
      let cursor = c.cursor, pagina;
      do {
        const filtro = cursor ? `&synced_at=gt.${encodeURIComponent(cursor)}` : '';
        pagina = await rest(`registros?select=id,coleccion,data,updated_at,deleted,synced_at${filtro}&order=synced_at.asc&limit=1000`);
        for (const r of pagina) {
          if (!COLECCIONES.includes(r.coleccion)) continue;
          const loc = db[r.coleccion][r.id];
          if (!loc || new Date(r.updated_at) >= new Date(loc.updatedAt)) {
            db[r.coleccion][r.id] = { ...r.data, id: r.id, updatedAt: r.updated_at, deleted: r.deleted, _dirty: false };
          }
          cursor = r.synced_at;
        }
      } while (pagina.length === 1000);
      // 2) Subir cambios locales pendientes
      const pendientes = [];
      for (const col of COLECCIONES) for (const r of Object.values(db[col])) if (r._dirty) {
        const { _dirty, ...data } = r;
        pendientes.push({ id: r.id, coleccion: col, data, updated_at: r.updatedAt, deleted: !!r.deleted });
      }
      for (let i = 0; i < pendientes.length; i += 200) {
        await rest('registros?on_conflict=id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(pendientes.slice(i, i + 200)),
        });
      }
      pendientes.forEach(p => { if (db[p.coleccion][p.id]?.updatedAt === p.updated_at) db[p.coleccion][p.id]._dirty = false; });
      const c2 = syncCfg(); c2.cursor = cursor; c2.ultima = ahora(); setSyncCfg(c2);
      persistir();
      setEstado(`Sincronizado (${pendientes.length} enviados)`, true);
      return true;
    } catch (e) {
      setEstado('Error de sincronización: ' + e.message, false);
      throw e;
    } finally { enCurso = null; }
  })();
  return enCurso;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => programarSync());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') programarSync(); });
  if (syncActiva()) setTimeout(() => sincronizar().catch(() => {}), 500);
}
