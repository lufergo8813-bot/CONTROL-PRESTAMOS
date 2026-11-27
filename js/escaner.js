// Lector de código de barras con la cámara.
// Usa el detector nativo del navegador (Android, Chrome en computador) y, si no existe (iPhone/iPad),
// la librería ZXing cargada bajo demanda. Siempre se puede escribir el código a mano.
import { modal, cerrarModal, q, toast } from './comun.js';

const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
let zx = null;
function cargarZXing() {
  if (window.ZXing) return Promise.resolve();
  zx = zx || new Promise((ok, mal) => { const s = document.createElement('script'); s.src = ZXING; s.onload = ok; s.onerror = () => { zx = null; mal(new Error('No se pudo cargar el lector (¿sin internet?)')); }; document.head.appendChild(s); });
  return zx;
}

/** Abre la cámara y devuelve el código leído (o null si se cancela). */
export function escanear() {
  return new Promise(resolver => {
    let terminado = false, stream = null, lector = null, raf = null;
    const fin = codigo => {
      if (terminado) return; terminado = true;
      cancelAnimationFrame(raf);
      try { lector?.reset(); } catch { /* */ }
      stream?.getTracks().forEach(t => t.stop());
      cerrarModal();
      resolver(codigo || null);
    };
    modal(`<h2>Escanear código de barras</h2>
      <div class="escaner"><video id="vid" playsinline muted autoplay></video><div class="mira"></div></div>
      <p class="hint" id="escEstado">Apunta la cámara al código de barras.</p>
      <label for="escManual">O escríbelo</label><div class="fila-campo"><input id="escManual" inputmode="numeric" placeholder="Código"><button type="button" class="btn sm" id="escOk">Usar</button></div>
      <div class="acciones"><button type="button" class="btn ghost" id="escCancelar">Cancelar</button></div>`, async box => {
      q('#escCancelar', box).onclick = () => fin(null);
      // si se cierra la ventana tocando afuera o con Escape, apagar la cámara
      const m = q('#modal'), obs = new MutationObserver(() => { if (m.hidden) { obs.disconnect(); fin(null); } });
      obs.observe(m, { attributes: true, attributeFilter: ['hidden'] });
      q('#escOk', box).onclick = () => fin(q('#escManual', box).value.trim());
      q('#escManual', box).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); fin(e.target.value.trim()); } };
      const video = q('#vid', box), estado = q('#escEstado', box);
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          video.srcObject = stream; video.play().catch(() => {});
          const det = new window.BarcodeDetector();
          const ciclo = async () => {
            if (terminado) return;
            try { if (video.readyState >= 2) { const r = await det.detect(video); if (r?.[0]?.rawValue) return fin(r[0].rawValue); } } catch { /* sigue */ }
            raf = requestAnimationFrame(ciclo);
          };
          ciclo();
        } else {
          estado.textContent = 'Cargando el lector…';
          await cargarZXing();
          if (terminado) return;
          lector = new window.ZXing.BrowserMultiFormatReader();
          estado.textContent = 'Apunta la cámara al código de barras.';
          const cb = res => { if (res) fin(res.getText()); };
          if (lector.decodeFromConstraints) await lector.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, cb);
          else await lector.decodeFromVideoDevice(undefined, video, cb);
        }
      } catch (e) {
        estado.textContent = (e?.name === 'NotAllowedError' ? 'No hay permiso para usar la cámara. ' : 'No fue posible abrir la cámara. ') + 'Escribe el código a mano.';
        toast(estado.textContent, true);
      }
    });
  });
}
