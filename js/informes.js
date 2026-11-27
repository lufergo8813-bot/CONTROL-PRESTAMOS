// Informe de flujo de caja esperado y personas que no están al día.
import * as C from './calc.js';
import * as S from './store.js';
import { icon } from './ui.js';
import { generarInformePDF, pdfBase64 } from './pdf.js';
import { enviarCorreo, plantilla } from './email.js';
import { verPorVencer, diasAlerta } from './inventario-ui.js';
import { infoInventario } from './excel.js';
import { porVencer } from './inventario.js';
import { $app, esc, q, aj, dec, money, F, mesTexto, persona, abonosDe, scoreDe, chipScore, chip, conBoton, toast, modal } from './comun.js';

const compacto = v => '$' + new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

function datosInforme(meses) {
  const items = S.listar('prestamos').map(p => ({ prestamo: p, abonos: abonosDe(p.id), nombre: persona(p.personaId).nombre }));
  const flujo = C.flujoProyectado(items, C.hoyISO(), meses, dec());
  const ests = items.map(x => ({ ...x, e: C.estadoCuenta(x.prestamo, x.abonos, C.hoyISO(), dec()) }));
  const activos = ests.filter(x => x.e.estado !== 'pagado');
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const resumen = [['Por cobrar hoy (total para saldar)', sum(activos, x => x.e.totalParaSaldar)], ['Capital por recuperar', sum(activos, x => x.e.capital)],
    ['Vencido o en mora', flujo.totalVencido], [`Cobros esperados próximos ${meses} meses`, flujo.totalProyectado], ['Intereses y administración cobrados', sum(ests, x => x.e.interesPagado + x.e.adminPagado)], ['Intereses de mora cobrados', sum(ests, x => x.e.moraPagada)]];
  return { flujo, resumen, activos };
}

export function vistaInformes() {
  let meses = 6;
  const pintar = () => {
    const { flujo, resumen } = datosInforme(meses);
    const max = Math.max(1, ...flujo.meses.map(m => m.valor));
    $app.innerHTML = `<div class="cabecera"><div><h1>Informes</h1><p>Flujo de caja esperado según los planes de pago, y quién no está al día.</p></div></div>
      <div class="acciones" style="margin-top:0"><button class="btn pri" id="enviar">${icon('correo')}Enviarme por correo</button><button class="btn" id="pdf">${icon('pdf')}Descargar PDF</button>
        <select id="meses" style="width:auto">${[3, 6, 12].map(n => `<option value="${n}" ${n === meses ? 'selected' : ''}>Próximos ${n} meses</option>`).join('')}</select></div>
      <div class="mosaico">${resumen.slice(0, 4).map(([k, v], i) => `<div class="tile ${['t-lav', 't-cielo', 't-rosa', 't-menta'][i]}"><div class="et">${esc(k)}</div><div class="val">${money(v)}</div></div>`).join('')}</div>
      <h2>Flujo de caja esperado</h2>
      <div class="panel"><div class="barras">${flujo.meses.map(m => `<button class="barra-mes" data-mes="${m.mes}" title="${esc(mesTexto(m.mes))}"><span class="v">${m.valor ? compacto(m.valor) : ''}</span><span class="b" style="height:${Math.max(2, (m.valor / max) * 100)}%"></span><span class="m">${esc(mesTexto(m.mes).split(' ')[0].slice(0, 3))}</span></button>`).join('')}</div>
        <div class="tabla" style="margin-top:12px"><table><thead><tr><th>Mes</th><th class="num">Cobros esperados</th><th class="num">Cuotas</th></tr></thead><tbody>
        ${flujo.meses.map(m => `<tr data-mes="${m.mes}" style="cursor:pointer"><td>${esc(mesTexto(m.mes))}</td><td class="num"><b>${money(m.valor)}</b></td><td class="num">${m.detalle.length}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${money(flujo.totalProyectado)}</td><td class="num">${flujo.meses.reduce((s, m) => s + m.detalle.length, 0)}</td></tr></tfoot></table></div>
        <p class="hint">Toca un mes para ver el detalle. No incluye lo que ya está vencido (abajo) ni préstamos sin fecha límite.</p></div>
      <h2>Personas que no están al día (${flujo.vencidos.length})</h2>
      ${flujo.vencidos.length ? `<div class="lista">${flujo.vencidos.map(v => `<a class="fila" href="#/prestamo/${v.prestamo.id}"><div class="cuerpo"><div class="t1">${esc(v.nombre)} <span class="muted">${esc(v.prestamo.codigo)}</span></div><div class="t2">${chip(v.estado)} ${chipScore(scoreDe(v.prestamo.personaId))} ${v.desde ? 'desde ' + F(v.desde) : ''}</div></div><div class="lado">${money(v.valor)}<small>vencido</small></div></a>`).join('')}</div>`
        : '<div class="lista"><div class="fila"><div class="cuerpo t2">Todos están al día.</div></div></div>'}
      ${S.listar('productos').length ? (() => { const pv = porVencer(infoInventario(), diasAlerta()); return `<h2>Mercancía por vencer (${diasAlerta()} días)</h2><div class="lista"><button class="fila fila-btn" id="pvInf"><div class="cuerpo"><div class="t1">${pv.length} lote(s)</div><div class="t2">${pv.filter(x => x.donde === 'consignacion').length} en consignación · ${pv.filter(x => x.donde === 'bodega').length} en bodega</div></div><div class="lado">Ver</div></button></div>`; })() : ''}`;
    q('#pvInf')?.addEventListener('click', verPorVencer);
    q('#meses').onchange = e => { meses = +e.target.value; pintar(); };
    $app.querySelectorAll('[data-mes]').forEach(el => (el.onclick = () => {
      const m = flujo.meses.find(x => x.mes === el.dataset.mes);
      modal(`<h2>${esc(mesTexto(m.mes))}</h2>${m.detalle.length ? `<div class="lista" style="box-shadow:none;padding:0">${m.detalle.map(d => `<a class="fila" href="#/prestamo/${d.prestamo.id}"><div class="cuerpo"><div class="t1">${esc(d.nombre)}</div><div class="t2">${F(d.fecha)} · ${esc(d.prestamo.codigo)}</div></div><div class="lado">${money(d.valor)}</div></a>`).join('')}</div>` : '<p class="muted">Sin cobros este mes.</p>'}<div class="acciones"><button class="btn ghost" data-cerrar>Cerrar</button></div>`);
    }));
    const pdf = async () => {
      const personas = [...new Set(flujo.vencidos.map(v => v.prestamo.personaId))].map(id => { const s = scoreDe(id); return { nombre: persona(id).nombre, score: s.puntaje == null ? 'Sin historial' : `${s.puntaje} ${s.etiqueta}` }; });
      return generarInformePDF({ flujo, resumen, personas, ajustes: aj() });
    };
    q('#pdf').onclick = ev => conBoton(ev.currentTarget, async () => (await pdf()).save(`Informe_cartera_${C.hoyISO()}.pdf`));
    q('#enviar').onclick = ev => conBoton(ev.currentTarget, async () => {
      const a = aj(), para = a.correoInformes || a.copiaOculta || a.prestamistaEmail;
      if (!para) throw new Error('Escribe tu correo para informes en Ajustes > Correo.');
      const doc = await pdf();
      const html = plantilla({ titulo: 'Informe de cartera y flujo de caja', saludo: 'Hola,', parrafos: [`Informe con corte al ${F(C.hoyISO())}. El detalle está en el PDF adjunto.`], filas: resumen.map(([k, v]) => [k, money(v)]), aj: a });
      await enviarCorreo({ to: para, asunto: `Informe de cartera · ${F(C.hoyISO())}`, html, text: resumen.map(([k, v]) => `${k}: ${money(v)}`).join('\n'), pdfBase64: pdfBase64(doc), filename: `Informe_cartera_${C.hoyISO()}.pdf` }, a);
      toast(`Informe enviado a ${para}`);
    });
  };
  pintar();
}
