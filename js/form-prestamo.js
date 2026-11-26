// Formulario de préstamo en una sola pantalla con vista previa en vivo.
import * as C from './calc.js';
import * as S from './store.js';
import { icon } from './ui.js';
import { $app, esc, q, qa, aj, dec, money, F, Fc, num, toast, opciones, persona, abonosDe, siguienteCodigo, prestamistas, scoreDe, chipScore, avisoUsuraHTML, enlazarUsura } from './comun.js';
import { editarPersona, editarCuenta, editarPrestamista } from './editores.js';
import { crearPagare, abrirPagare, pagareDe } from './pagare-ui.js';

export const BANCOS = ['Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA', 'Banco de Occidente', 'Banco Popular', 'Banco AV Villas', 'Banco Caja Social', 'Scotiabank Colpatria', 'Itaú', 'Banco Agrario', 'Banco Falabella', 'Banco Pichincha', 'Bancoomeva', 'Banco W', 'Lulo Bank', 'Nu Colombia', 'Nequi', 'Daviplata', 'Movii', 'Rappipay'];
export const TIPOS_CUENTA = ['Ahorros', 'Corriente', 'Billetera digital', 'Efectivo'];

export function formPrestamo(id) {
  const existente = id ? S.obtener('prestamos', id) : null;
  const hoy = C.hoyISO(), a = aj();
  const p = existente ? structuredClone(existente) : {
    fecha: hoy, prestamistaId: prestamistas()[0]?.id || '', interes: { tipo: 'mensual', tasa: 0 }, admin: { tipo: 'ninguno', valor: 0 }, mora: { activa: true },
    plan: { tipo: 'cuotas_iguales', numCuotas: 6, periodo: 'mensual', diasPeriodo: 30, fechaPrimeraCuota: C.addMonths(hoy, 1), cuotas: [], fechaPago: C.addMonths(hoy, 6) },
    cuentaDeudor: { banco: '', tipo: 'Ahorros', numero: '' }, recordatorio: { activo: !!a.recordatoriosActivos, dias: a.diasRecordatorio ?? 3 }, notas: '', fechaLimite: '',
  };
  p.plan.cuotas = (p.plan.cuotas || []).map(c => ({ ...c }));
  p.plan.diasPeriodo = p.plan.diasPeriodo || 30; p.plan.numCuotas = p.plan.numCuotas || 6; p.plan.periodo = p.plan.periodo || 'mensual';
  p.plan.fechaPago = p.plan.fechaPago || C.addMonths(p.fecha, 6);
  p.cuentaDeudor = p.cuentaDeudor || { banco: '', tipo: 'Ahorros', numero: '' };
  p.mora = p.mora || { activa: true }; p.recordatorio = p.recordatorio || { activo: true, dias: 3 };
  let primeraTocada = !!existente, generarPagare = !existente || !pagareDe(existente);

  const personasOpts = () => `<option value="">Elige la persona…</option>` + S.listar('personas').sort((x, y) => x.nombre.localeCompare(y.nombre)).map(x => `<option value="${x.id}" ${x.id === p.personaId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const prestOpts = () => (prestamistas().length ? '' : `<option value="">${esc(a.prestamistaNombre || 'Yo')}</option>`) + prestamistas().map(x => `<option value="${x.id}" ${x.id === p.prestamistaId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const cuentasOpts = () => `<option value="">Sin especificar</option>` + S.listar('cuentas').map(x => `<option value="${x.id}" ${x.id === p.cuentaId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const cuotasLimpias = () => p.plan.cuotas.map(c => ({ fecha: c.fecha, valor: num(c.valor) })).filter(c => c.fecha && c.valor > 0);
  const calculo = () => C.generarCronograma({ ...p, plan: { ...p.plan, cuotas: cuotasLimpias() } }, dec());

  const PLANES = [['cuotas_iguales', 'cuotas', 't-lav', 'Cuotas iguales', 'Capital + interés en cuotas fijas.'], ['interes_periodico', 'calendario', 't-cielo', 'Intereses periódicos, capital al final', 'Paga solo intereses cada periodo y el capital en la última cuota.'],
    ['pago_unico', 'dinero', 't-mant', 'Todo al final', 'Capital e intereses en un solo pago.'], ['personalizado', 'personalizado', 't-durazno', 'Cuotas personalizadas', 'Tú defines cada fecha y valor.'], ['libre', 'libre', 't-menta', 'Abonos libres', 'Abona cuando pueda, antes de la fecha límite.']];

  $app.innerHTML = `${existente ? `<a class="volver" href="#/prestamo/${id}">${icon('atras')}Volver</a>` : ''}
  <div class="cabecera"><div><h1>${existente ? 'Editar préstamo ' + esc(existente.codigo || '') : 'Nuevo préstamo'}</h1><p>Completa los datos; la vista previa se actualiza mientras escribes.</p></div></div>
  ${existente && abonosDe(id).length ? '<div class="alerta">Este préstamo ya tiene abonos: si cambias las condiciones, los saldos se recalculan.</div>' : ''}
  <div class="form-doble">
  <form id="fp" data-edit autocomplete="off" novalidate>
    <section class="bloque"><h2>${icon('persona')}¿A quién le prestas?</h2>
      <div class="fila-campo"><select name="personaId" aria-label="Persona">${personasOpts()}</select><button type="button" class="btn sm" id="nuevaPersona">${icon('mas')}Nueva</button></div>
      <div id="infoPersona" class="hint"></div>
      <label>Cuenta donde recibe el dinero</label>
      <div class="f3"><div><input name="cdBanco" list="bancos" placeholder="Banco o billetera" value="${esc(p.cuentaDeudor.banco)}" aria-label="Banco"></div>
        <div><select name="cdTipo" aria-label="Tipo de cuenta">${TIPOS_CUENTA.map(t => `<option ${t === p.cuentaDeudor.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><input name="cdNumero" inputmode="numeric" placeholder="Número de cuenta" value="${esc(p.cuentaDeudor.numero)}" aria-label="Número de cuenta"></div></div>
      <datalist id="bancos">${BANCOS.map(b => `<option value="${b}">`).join('')}</datalist>
    </section>
    <section class="bloque"><h2>${icon('dinero')}El préstamo</h2>
      <div class="f2"><div><label for="monto">Monto prestado</label><input id="monto" name="monto" class="monto-medio" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${p.monto || ''}"><div class="hint" id="montoFmt"></div></div>
        <div><label for="fecha">Fecha de entrega del dinero</label><input id="fecha" name="fecha" type="date" value="${esc(p.fecha)}"></div></div>
      <div class="f2"><div><label for="prest">Presta</label><div class="fila-campo"><select id="prest" name="prestamistaId">${prestOpts()}</select><button type="button" class="btn sm" id="nuevoPrest" aria-label="Agregar quién presta">${icon('mas')}</button></div><div class="hint">Las opciones se crean en Ajustes > Quién presta.</div></div>
        <div><label for="cuentaId">Sale de mi cuenta</label><div class="fila-campo"><select id="cuentaId" name="cuentaId">${cuentasOpts()}</select><button type="button" class="btn sm" id="nuevaCuenta" aria-label="Agregar cuenta">${icon('mas')}</button></div></div></div>
    </section>
    <section class="bloque"><h2>${icon('porcentaje')}Interés y cobros</h2>
      <div class="f2"><div><label for="tasa">Tasa de interés (%)</label><input id="tasa" name="tasa" type="number" inputmode="decimal" min="0" step="any" value="${p.interes.tasa || ''}" placeholder="0 = sin interés"></div>
        <div><label for="tasaTipo">La tasa es</label><select id="tasaTipo" name="tasaTipo">${opciones(C.TIPOS_TASA, p.interes.tipo)}</select></div></div>
      <div id="usura"></div>
      <div class="f2"><div><label for="adminTipo">Administración</label><select id="adminTipo" name="adminTipo">${opciones(C.TIPOS_ADMIN, p.admin.tipo)}</select></div>
        <div id="admWrap"><label for="adminValor" id="adminLbl">Valor</label><input id="adminValor" name="adminValor" type="number" inputmode="decimal" min="0" step="any" value="${p.admin.valor || ''}"></div></div>
      <label class="check"><input type="checkbox" name="mora" ${p.mora.activa !== false ? 'checked' : ''}> Cobrar intereses de mora a la tasa máxima legal si paga tarde (desde el día siguiente al vencimiento)</label>
    </section>
    <section class="bloque"><h2>${icon('calendario')}Forma de pago</h2>
      <div class="opciones compacta">${PLANES.map(([k, ic, t, ti, de]) => `<label class="opcion"><input type="radio" name="planTipo" value="${k}" ${p.plan.tipo === k ? 'checked' : ''}><span class="ic ${t}">${icon(ic)}</span><span><b>${ti}</b><small>${de}</small></span></label>`).join('')}</div>
      <div id="planDet"></div>
      <label for="fechaLimite">Fecha límite de pago <span class="muted" id="flOpc">(opcional)</span></label><input id="fechaLimite" name="fechaLimite" type="date" value="${esc(p.fechaLimite || '')}">
    </section>
    <section class="bloque"><h2>${icon('correo')}Recordatorios y pagaré</h2>
      <label class="check"><input type="checkbox" name="recActivo" ${p.recordatorio.activo !== false ? 'checked' : ''}> Enviar recordatorio por correo <input name="recDias" type="number" min="0" max="30" value="${p.recordatorio.dias ?? 3}" class="mini" aria-label="Días antes"> días antes de cada pago</label>
      <label class="check"><input type="checkbox" name="pagare" ${generarPagare ? 'checked' : ''}> Generar pagaré al guardar (podrás firmarlo en pantalla, enviarlo por correo o imprimirlo)</label>
      <label for="notas">Notas <span class="muted">(aparecen en el PDF)</span></label><textarea id="notas" name="notas" placeholder="Acuerdos, garantías, observaciones…">${esc(p.notas || '')}</textarea>
    </section>
    <section class="bloque" id="bloquePlan"><h2>${icon('lista')}Vista previa del plan</h2><div id="planPrev"></div></section>
    <div class="acciones fin-form"><button class="btn pri grande" type="submit">${icon('check')}${existente ? 'Guardar cambios' : 'Guardar préstamo'}</button>${existente ? `<a class="btn ghost" href="#/prestamo/${id}">Cancelar</a>` : ''}</div>
  </form>
  <aside class="resumen-lado"><div class="panel"><h2 style="margin-top:2px">Resumen</h2><div id="resLado"></div></div></aside>
  </div>
  <div class="barra-ganancia" id="barraG"></div>`;

  const form = q('#fp');
  const detallePlan = () => {
    const t = p.plan.tipo;
    if (t === 'cuotas_iguales' || t === 'interes_periodico') return `<div class="f3">
      <div><label for="numCuotas">Número de ${t === 'interes_periodico' ? 'periodos' : 'cuotas'}</label><input id="numCuotas" name="numCuotas" type="number" min="1" max="600" value="${p.plan.numCuotas}"></div>
      <div><label for="periodo">Cada cuánto</label><select id="periodo" name="periodo">${opciones(C.PERIODOS, p.plan.periodo)}</select></div>
      <div><label for="fechaPrimeraCuota">Primera fecha de pago</label><input id="fechaPrimeraCuota" name="fechaPrimeraCuota" type="date" value="${esc(p.plan.fechaPrimeraCuota || '')}"></div></div>
      <div id="diasWrap" ${p.plan.periodo === 'dias' ? '' : 'hidden'}><label for="diasPeriodo">Número de días entre pagos</label><input id="diasPeriodo" name="diasPeriodo" type="number" min="1" max="365" value="${p.plan.diasPeriodo}"></div>`;
    if (t === 'pago_unico') return `<label for="fechaPago">Fecha del pago único</label><input id="fechaPago" name="fechaPago" type="date" value="${esc(p.plan.fechaPago)}">`;
    if (t === 'personalizado') return `<label>Cuotas acordadas</label><div id="cuotasPers">${p.plan.cuotas.map((c, i) => `<div class="cuota-row"><input type="date" data-i="${i}" data-k="fecha" value="${esc(c.fecha)}" aria-label="Fecha cuota ${i + 1}"><input type="number" inputmode="decimal" step="any" min="0" data-i="${i}" data-k="valor" value="${esc(c.valor)}" placeholder="Valor" aria-label="Valor cuota ${i + 1}"><button type="button" class="btn sm dan" data-del="${i}" aria-label="Quitar cuota">${icon('borrar')}</button></div>`).join('') || '<p class="muted">Agrega la primera cuota.</p>'}</div>
      <div class="acciones" style="margin-top:6px"><button type="button" class="btn sm" id="addCuota">${icon('mas')}Agregar cuota</button><button type="button" class="btn sm" id="ajustar">Ajustar la última cuota al saldo</button></div>`;
    return '<div class="info">El interés se calcula sobre lo que falte por pagar hasta el día de cada abono. Define la fecha límite.</div>';
  };
  const set = (name, v, el) => {
    switch (name) {
      case 'monto': p.monto = num(v); break;
      case 'tasa': p.interes.tasa = num(v); break;
      case 'tasaTipo': p.interes.tipo = v; break;
      case 'adminTipo': p.admin.tipo = v; break;
      case 'adminValor': p.admin.valor = num(v); break;
      case 'mora': p.mora.activa = el.checked; break;
      case 'planTipo': p.plan.tipo = v; q('#planDet').innerHTML = detallePlan(); break;
      case 'numCuotas': p.plan.numCuotas = Math.max(1, parseInt(v || 1, 10)); break;
      case 'diasPeriodo': p.plan.diasPeriodo = Math.max(1, parseInt(v || 1, 10)); if (!primeraTocada) { p.plan.fechaPrimeraCuota = C.addDays(p.fecha, p.plan.diasPeriodo); q('#fechaPrimeraCuota').value = p.plan.fechaPrimeraCuota; } break;
      case 'periodo': p.plan.periodo = v; q('#diasWrap').hidden = v !== 'dias'; if (!primeraTocada) { p.plan.fechaPrimeraCuota = C.fechaCuota(p.fecha, v, 2, p.plan.diasPeriodo); q('#fechaPrimeraCuota').value = p.plan.fechaPrimeraCuota; } break;
      case 'fechaPrimeraCuota': p.plan.fechaPrimeraCuota = v; primeraTocada = true; break;
      case 'fechaPago': p.plan.fechaPago = v; break;
      case 'fecha': p.fecha = v; if (!primeraTocada && v && q('#fechaPrimeraCuota')) { p.plan.fechaPrimeraCuota = C.fechaCuota(v, p.plan.periodo, 2, p.plan.diasPeriodo); q('#fechaPrimeraCuota').value = p.plan.fechaPrimeraCuota; } break;
      case 'cdBanco': p.cuentaDeudor.banco = v; break;
      case 'cdTipo': p.cuentaDeudor.tipo = v; break;
      case 'cdNumero': p.cuentaDeudor.numero = v.trim(); break;
      case 'recActivo': p.recordatorio.activo = el.checked; break;
      case 'recDias': p.recordatorio.dias = Math.max(0, parseInt(v || 0, 10)); break;
      case 'pagare': generarPagare = el.checked; break;
      case 'personaId': p.personaId = v; autollenarCuenta(); break;
      default: p[name] = v;
    }
  };
  function autollenarCuenta() {
    const per = p.personaId && S.obtener('personas', p.personaId);
    if (per?.cuentaBanco?.numero && !p.cuentaDeudor.numero) {
      p.cuentaDeudor = { ...per.cuentaBanco };
      form.cdBanco.value = p.cuentaDeudor.banco || ''; form.cdTipo.value = p.cuentaDeudor.tipo || 'Ahorros'; form.cdNumero.value = p.cuentaDeudor.numero || '';
    }
  }
  function infoPersona() {
    const per = p.personaId && S.obtener('personas', p.personaId);
    q('#infoPersona').innerHTML = per ? `${chipScore(scoreDe(per.id))} ${esc([per.documento && 'Doc. ' + per.documento, per.email || 'sin correo (no recibirá recordatorios)'].filter(Boolean).join(' · '))}` : '';
  }
  function actualizar() {
    infoPersona();
    q('#montoFmt').textContent = p.monto ? money(p.monto) : '';
    q('#admWrap').style.visibility = p.admin.tipo === 'ninguno' ? 'hidden' : 'visible';
    q('#adminLbl').textContent = { pct_saldo: '% mensual sobre saldo', fijo_mensual: 'Valor por mes', unico: 'Valor único', ninguno: 'Valor' }[p.admin.tipo];
    q('#flOpc').textContent = p.plan.tipo === 'libre' ? '(obligatoria)' : '(opcional)';
    q('#usura').innerHTML = avisoUsuraHTML(p.interes);
    enlazarUsura(q('#usura'), actualizar);
    const cr = calculo(), im = C.tasaMensual(p.interes);
    const libreEst = p.plan.tipo === 'libre' && p.fechaLimite && p.monto ? C.estadoCuenta({ ...p, mora: { activa: false } }, [], p.fechaLimite, dec()) : null;
    const ganancia = libreEst ? libreEst.interesPendiente + libreEst.adminPendiente : cr.ganancia;
    const total = libreEst ? libreEst.totalParaSaldar : cr.totales.cuota;
    const pct = p.monto ? (ganancia / p.monto) * 100 : 0;
    const lineas = p.monto ? [['Monto', money(p.monto)], ['Interés', im ? `${p.interes.tasa}% ${C.TIPOS_TASA[p.interes.tipo].toLowerCase()}` : 'Sin interés'],
      ...(cr.filas.length ? [['Número de pagos', String(cr.filas.length)], ['Último pago', F(cr.filas.at(-1).fecha)]] : []), ['Total a recibir', money(total)]] : [];
    const resumen = p.monto ? `<div class="ganancia-dest"><span>Ganancia estimada</span><b>${money(ganancia)}</b><small>${pct.toFixed(1)}% sobre el capital${cr.totales.admin ? `, incluye ${money(cr.totales.admin)} de administración` : ''}</small></div>
      ${cr.cuotaBase ? `<div class="linea-res"><span>${p.plan.tipo === 'interes_periodico' ? 'Interés por periodo' : 'Cuota (capital + interés)'}</span><span>${money(cr.cuotaBase)}</span></div>` : ''}
      ${lineas.map(([k, v]) => `<div class="linea-res"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
      ${cr.advertencias.map(t => `<div class="alerta">${esc(t)}</div>`).join('')}` : '<p class="muted">Escribe el monto para ver la ganancia.</p>';
    q('#resLado').innerHTML = resumen;
    q('#barraG').innerHTML = p.monto ? `<div><small>Ganancia</small><b>${money(ganancia)}</b></div>${cr.cuotaBase ? `<div><small>${p.plan.tipo === 'interes_periodico' ? 'Por periodo' : 'Cuota'}</small><b>${money(cr.cuotaBase)}</b></div>` : ''}<div><small>Total</small><b>${money(total)}</b></div><button type="button" class="btn sm" id="verPlan">Ver plan</button>` : '<div><small>Escribe el monto para ver la ganancia</small></div>';
    q('#verPlan')?.addEventListener('click', () => q('#bloquePlan').scrollIntoView({ behavior: 'smooth' }));
    q('#planPrev').innerHTML = cr.filas.length ? `<div class="tabla"><table><thead><tr><th>N°</th><th>Fecha</th><th class="num">A capital</th><th class="num">A intereses</th><th class="num">Administración</th><th class="num">Cuota</th><th class="num">Saldo</th></tr></thead><tbody>
      ${cr.filas.map(f => `<tr><td>${f.n}</td><td class="num" style="text-align:left">${Fc(f.fecha)}</td><td class="num">${money(f.capital)}</td><td class="num">${money(f.interes)}</td><td class="num">${money(f.admin)}</td><td class="num"><b>${money(f.cuota)}</b></td><td class="num">${money(f.saldoFinal)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td>Total</td><td class="num">${money(cr.totales.capital)}</td><td class="num">${money(cr.totales.interes)}</td><td class="num">${money(cr.totales.admin)}</td><td class="num">${money(cr.totales.cuota)}</td><td></td></tr></tfoot></table></div>`
      : `<p class="muted">${p.plan.tipo === 'libre' ? 'Abonos libres: no hay plan fijo. ' + (libreEst ? `Si paga todo el ${F(p.fechaLimite)}: ${money(libreEst.totalParaSaldar)}.` : 'Define la fecha límite para estimar.') : 'Completa los datos para ver el plan.'}</p>`;
  }

  q('#planDet').innerHTML = detallePlan();
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.i !== undefined) p.plan.cuotas[t.dataset.i][t.dataset.k] = t.value;
    else if (t.name) set(t.name, t.value, t);
    actualizar();
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'nuevaPersona') editarPersona(null, nueva => { p.personaId = nueva.id; form.personaId.innerHTML = personasOpts(); autollenarCuenta(); actualizar(); });
    if (b.id === 'nuevaCuenta') editarCuenta(null, nueva => { p.cuentaId = nueva.id; form.cuentaId.innerHTML = cuentasOpts(); });
    if (b.id === 'nuevoPrest') editarPrestamista(null, nuevo => { p.prestamistaId = nuevo.id; form.prestamistaId.innerHTML = prestOpts(); });
    if (b.dataset.del !== undefined) { p.plan.cuotas.splice(+b.dataset.del, 1); q('#planDet').innerHTML = detallePlan(); actualizar(); }
    if (b.id === 'addCuota') { const u = p.plan.cuotas.at(-1); p.plan.cuotas.push({ fecha: C.addMonths(u?.fecha || p.fecha, 1), valor: u?.valor || '' }); q('#planDet').innerHTML = detallePlan(); actualizar(); }
    if (b.id === 'ajustar') {
      if (!cuotasLimpias().length) return toast('Primero agrega al menos una cuota con valor', true);
      p.plan.cuotas = C.ajustarUltimaCuota({ ...p, plan: { ...p.plan, cuotas: cuotasLimpias() } }, dec()); q('#planDet').innerHTML = detallePlan(); actualizar(); toast('Última cuota ajustada');
    }
  });
  form.onsubmit = e => {
    e.preventDefault();
    const err = m => { toast(m, true); return null; };
    if (!p.personaId) return err('Elige a quién le prestas');
    if (!(p.monto > 0)) return err('Escribe el monto prestado');
    if (!p.fecha) return err('Indica la fecha del préstamo');
    if (p.admin.tipo !== 'ninguno' && !(p.admin.valor > 0)) return err('Escribe el valor de la administración o elige "Sin administración"');
    if (p.plan.tipo === 'personalizado' && !cuotasLimpias().length) return err('Agrega al menos una cuota con fecha y valor');
    if (['cuotas_iguales', 'interes_periodico'].includes(p.plan.tipo) && !p.plan.fechaPrimeraCuota) return err('Indica la primera fecha de pago');
    if (p.plan.tipo === 'pago_unico' && !(p.plan.fechaPago > p.fecha)) return err('La fecha del pago único debe ser posterior a la del préstamo');
    if (p.plan.tipo === 'libre' && !p.fechaLimite) return err('Con abonos libres la fecha límite es obligatoria');
    if (p.plan.tipo === 'personalizado') p.plan.cuotas = cuotasLimpias();
    const cr = C.generarCronograma(p, dec());
    if (!p.fechaLimite && cr.filas.length) p.fechaLimite = cr.filas.at(-1).fecha;
    if (!p.codigo) p.codigo = siguienteCodigo('PR');
    p.notas = (p.notas || '').trim();
    const acr = S.obtener('prestamistas', p.prestamistaId); p.prestadoPor = acr?.nombre || aj().prestamistaNombre || '';
    const g = S.guardar('prestamos', { ...p, clase: 'prestamo' });
    // recordar la cuenta del deudor para próximos préstamos
    const per = S.obtener('personas', p.personaId);
    if (per && p.cuentaDeudor.numero && JSON.stringify(per.cuentaBanco || {}) !== JSON.stringify(p.cuentaDeudor)) S.guardar('personas', { ...per, cuentaBanco: { ...p.cuentaDeudor } });
    toast(existente ? 'Préstamo actualizado' : 'Préstamo guardado');
    location.hash = '#/prestamo/' + g.id;
    if (generarPagare) setTimeout(() => { if (existente && pagareDe(g)?.estado !== 'firmado') { const r = pagareDe(g); if (r) S.borrar('pagares', r.id); } if (!pagareDe(g) || pagareDe(g).estado !== 'firmado') crearPagare(g); abrirPagare(g, { recienCreado: true }); }, 80);
  };
  actualizar();
}
