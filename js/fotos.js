// Fotos de productos en IndexedDB (el almacenamiento normal del navegador es muy pequeño para fotos).
// Cada foto: { id, img (JPEG ~800px), mini (JPEG ~160px), updatedAt, _dirty }
const DB = 'prestamos_fotos', ST = 'fotos';
let dbP = null;
function abrir() {
  if (dbP) return dbP;
  dbP = new Promise((ok, mal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return dbP;
}
async function tx(modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(ST, modo), st = t.objectStore(ST);
    const res = fn(st);
    t.oncomplete = () => ok(res?.result ?? res);
    t.onerror = () => mal(t.error);
  });
}
const cache = new Map();

/** Reduce una imagen (archivo o dataURL) a JPEG con lado máximo `max`. */
export function comprimir(src, max = 800, calidad = 0.72) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => mal(new Error('No se pudo leer la imagen'));
    if (typeof src === 'string') img.src = src;
    else { const fr = new FileReader(); fr.onload = () => (img.src = fr.result); fr.onerror = () => mal(fr.error); fr.readAsDataURL(src); }
  });
}

export async function guardarFoto(archivo, id = null) {
  const img = await comprimir(archivo, 800, 0.72);
  const mini = await comprimir(img, 160, 0.7);
  const rec = { id: id || 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), img, mini, updatedAt: new Date().toISOString(), _dirty: true };
  await tx('readwrite', st => st.put(rec));
  cache.set(rec.id, rec);
  return rec.id;
}
export async function obtenerFoto(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  const r = await tx('readonly', st => st.get(id)).catch(() => null);
  if (r) cache.set(id, r);
  return r || null;
}
export async function borrarFoto(id) { if (!id) return; cache.delete(id); await tx('readwrite', st => st.delete(id)); }

// ----- sincronización (la usa store.js) -----
export async function pendientes() {
  const todas = await tx('readonly', st => st.getAll()).catch(() => []);
  return (todas || []).filter(f => f._dirty);
}
export async function marcarEnviada(id, updatedAt) {
  const r = await obtenerFoto(id);
  if (r && r.updatedAt === updatedAt) { r._dirty = false; await tx('readwrite', st => st.put(r)); }
}
export async function recibir(id, data, updatedAt) {
  const r = await obtenerFoto(id);
  if (r && r.updatedAt >= updatedAt) return;
  const rec = { id, img: data.img, mini: data.mini, updatedAt, _dirty: false };
  await tx('readwrite', st => st.put(rec)); cache.set(id, rec);
}

/** Pinta las miniaturas de todos los <img data-foto="id"> dentro de `root`. */
export async function pintarMinis(root = document) {
  for (const el of root.querySelectorAll('img[data-foto]')) {
    const f = await obtenerFoto(el.dataset.foto);
    if (f) { el.src = el.dataset.grande ? f.img : f.mini; el.hidden = false; el.nextElementSibling?.classList?.contains('sin-foto') && (el.nextElementSibling.hidden = true); }
  }
}
