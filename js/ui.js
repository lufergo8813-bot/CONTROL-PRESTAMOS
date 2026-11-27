// Iconos, ilustraciones (SVG propios), avatares y anillo de progreso.

const P = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  lista: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  personas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.7.2 4.4 1.9 5 5.4"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  dinero: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  compartir: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  editar: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  borrar: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  atras: '<path d="m15 18-6-6 6-6"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  banco: '<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  cuotas: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  libre: '<path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 1.6 2.6 4.5 3.2 4.5 1.6 4.5 3.3-2 3-4.5 3-4.5-1.3-4.5-3"/>',
  personalizado: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alerta: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.5v.1"/>',
  nube: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5 4 4 0 0 1-.4 7.5z"/>',
  respaldo: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  barras: '<path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12"/><path d="M3 4h3M18 4h3M3 20h3M18 20h3"/>',
  caja: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  porcentaje: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
};
export const icon = (n, extra = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${P[n] || ''}</svg>`;

// Ilustraciones planas en tonos pastel
const ILUS = {
  frasco: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="108" rx="40" ry="6" fill="#000" opacity=".08"/>
    <rect x="36" y="14" width="48" height="12" rx="5" fill="#ffd6e3"/>
    <path d="M30 36c0-6 4-10 10-10h40c6 0 10 4 10 10v56c0 8-6 14-14 14H44c-8 0-14-6-14-14z" fill="#e8f3ff" opacity=".95"/>
    <path d="M32 70h56v22c0 8-6 13-13 13H45c-7 0-13-5-13-13z" fill="#cfe4ff"/>
    <g stroke="#e0a800" stroke-width="2"><circle cx="50" cy="84" r="10" fill="#ffe08a"/><circle cx="70" cy="88" r="10" fill="#ffd25e"/><circle cx="60" cy="70" r="10" fill="#ffe08a"/></g>
    <g fill="#e0a800"><rect x="47" y="81" width="6" height="6" rx="1.5"/><rect x="67" y="85" width="6" height="6" rx="1.5"/><rect x="57" y="67" width="6" height="6" rx="1.5"/></g>
    <path d="M42 40c0 8 0 14 2 20" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
    <path d="M92 22c3 0 5-2 5-5 0 3 2 5 5 5-3 0-5 2-5 5 0-3-2-5-5-5zM18 50c2 0 4-2 4-4 0 2 2 4 4 4-2 0-4 2-4 4 0-2-2-4-4-4z" fill="#fff"/>
  </svg>`,
  billetera: `<svg viewBox="0 0 160 130" aria-hidden="true">
    <ellipse cx="80" cy="120" rx="52" ry="6" fill="#7c6fd8" opacity=".1"/>
    <circle cx="112" cy="26" r="13" fill="#ffe08a" stroke="#e0a800" stroke-width="2"/><rect x="108" y="22" width="8" height="8" rx="2" fill="#e0a800"/>
    <circle cx="44" cy="34" r="9" fill="#ffe08a" stroke="#e0a800" stroke-width="2"/>
    <rect x="34" y="48" width="92" height="64" rx="16" fill="#c9bff7"/>
    <rect x="40" y="40" width="70" height="22" rx="8" fill="#d4f2e6" transform="rotate(-6 75 51)"/>
    <rect x="34" y="56" width="92" height="56" rx="16" fill="#a99bf0"/>
    <rect x="96" y="72" width="34" height="22" rx="11" fill="#7c6fd8"/><circle cx="108" cy="83" r="4.5" fill="#ffe08a"/>
  </svg>`,
  gente: `<svg viewBox="0 0 160 130" aria-hidden="true">
    <ellipse cx="80" cy="120" rx="56" ry="6" fill="#7c6fd8" opacity=".1"/>
    <circle cx="56" cy="46" r="16" fill="#ffd6c2"/><path d="M26 116c0-24 13-38 30-38s30 14 30 38z" fill="#b8ddff"/>
    <circle cx="106" cy="52" r="14" fill="#f5c7a9"/><path d="M80 116c0-20 11-32 26-32s26 12 26 32z" fill="#cdeee0"/>
    <path d="M40 40c2-12 26-14 32 0-8-4-22-5-32 0z" fill="#5b4a7a"/><path d="M92 46c2-10 22-12 27 0-7-3-19-4-27 0z" fill="#8a5a3c"/>
    <path d="M80 70c-3-5-10-3-9 2 1 4 9 9 9 9s8-5 9-9c1-5-6-7-9-2z" fill="#ff9fb8"/>
  </svg>`,
  sobre: `<svg viewBox="0 0 160 130" aria-hidden="true">
    <ellipse cx="80" cy="120" rx="52" ry="6" fill="#7c6fd8" opacity=".1"/>
    <rect x="28" y="40" width="104" height="72" rx="14" fill="#dceaff"/>
    <path d="m30 46 50 36 50-36" fill="none" stroke="#9cc0f2" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="122" cy="40" r="18" fill="#d4f2e6"/><path d="m113 40 6 6 11-12" fill="none" stroke="#1d7356" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  fiesta: `<svg viewBox="0 0 160 130" aria-hidden="true">
    <circle cx="80" cy="64" r="34" fill="#d4f2e6"/><path d="m64 64 11 11 22-24" fill="none" stroke="#1d7356" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#ffd6e3"><rect x="26" y="26" width="10" height="5" rx="2" transform="rotate(30 31 28)"/><rect x="128" y="34" width="10" height="5" rx="2" transform="rotate(-25 133 36)"/></g>
    <g fill="#ffe08a"><circle cx="36" cy="96" r="5"/><circle cx="130" cy="92" r="4"/></g><g fill="#c9bff7"><circle cx="118" cy="16" r="4"/><circle cx="46" cy="14" r="3"/></g>
  </svg>`,
};
export const ilus = n => ILUS[n] || '';

// Avatar con iniciales en un color pastel estable según el nombre
const TONOS = [['#e9e5ff', '#5b4fbf'], ['#d4f2e6', '#1d7356'], ['#ffe3d3', '#a64b1f'], ['#fcd9e4', '#a92d58'], ['#dceaff', '#2f5d99'], ['#fff2c9', '#7f6200']];
export function avatar(nombre = '?', clase = '') {
  const ini = String(nombre).trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  let h = 0; for (const ch of String(nombre)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = TONOS[h % TONOS.length];
  return `<span class="avatar ${clase}" style="background:${bg};color:${fg}" aria-hidden="true">${ini}</span>`;
}

/** Anillo de progreso: pct 0..1 */
export function anillo(pct, tam = 52, { fondo = '#ece8fb', color = '#7c6fd8', grosor = 6, texto = true, claseTxt = '' } = {}) {
  const p = Math.max(0, Math.min(1, pct || 0));
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r;
  return `<span class="anillo" role="img" aria-label="${Math.round(p * 100)}% recuperado"><svg width="${tam}" height="${tam}">
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${fondo}" stroke-width="${grosor}"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/>
  </svg>${texto ? `<span class="anillo-txt ${claseTxt}">${Math.round(p * 100)}%</span>` : ''}</span>`;
}
