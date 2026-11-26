// Panel de firma manuscrita en pantalla (dedo, lápiz o mouse).
export function panelFirma(canvas) {
  const ctx = canvas.getContext('2d');
  let trazos = 0, dibujando = false, ultimo = null;
  const ajustar = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d1a3a';
    trazos = 0;
  };
  const punto = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => { dibujando = true; ultimo = punto(e); canvas.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.1, 0, Math.PI * 2); ctx.fill(); });
  canvas.addEventListener('pointermove', e => {
    if (!dibujando) return;
    const p = punto(e);
    ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo = p; trazos++;
  });
  const fin = () => { dibujando = false; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin); canvas.addEventListener('pointerleave', fin);
  requestAnimationFrame(ajustar);
  return {
    limpiar: ajustar,
    vacio: () => trazos < 8,
    /** PNG con fondo transparente, reducido para guardar y enviar liviano. */
    imagen() {
      const out = document.createElement('canvas'); out.width = 600; out.height = 220;
      out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  };
}
