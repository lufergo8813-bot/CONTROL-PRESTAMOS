// Ventanas para crear o editar personas, cuentas propias y quienes prestan.
import * as S from './store.js';
import { icon } from './ui.js';
import { esc, q, modal, toast, render } from './comun.js';

const TIPOS_DOC = ['C.C.', 'C.E.', 'NIT', 'Pasaporte', 'T.I.', 'PPT'];
const BANCOS = ['Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA', 'Banco de Occidente', 'Banco Popular', 'Banco AV Villas', 'Banco Caja Social', 'Scotiabank Colpatria', 'Itaú', 'Banco Agrario', 'Banco Falabella', 'Nu Colombia', 'Lulo Bank', 'Nequi', 'Daviplata'];
const limpiar = d => { Object.keys(d).forEach(k => (d[k] = String(d[k]).trim())); return d; };

export function editarPersona(per, despues) {
  const cb = per?.cuentaBanco || {};
  modal(`<h2>${per ? 'Editar persona' : 'Nueva persona'}</h2><form id="fper">
    <label for="pNom">Nombre completo</label><input id="pNom" name="nombre" required value="${esc(per?.nombre || '')}" placeholder="Ej.: María Gómez">
    <div class="f3"><div><label for="pTd">Tipo doc.</label><select id="pTd" name="tipoDoc">${TIPOS_DOC.map(t => `<option ${t === (per?.tipoDoc || 'C.C.') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div style="grid-column:span 2"><label for="pDoc">Número de documento</label><input id="pDoc" name="documento" inputmode="numeric" value="${esc(per?.documento || '')}"></div></div>
    <div class="f2"><div><label for="pTel">Celular</label><input id="pTel" name="telefono" type="tel" value="${esc(per?.telefono || '')}"></div><div><label for="pMail">Correo</label><input id="pMail" name="email" type="email" value="${esc(per?.email || '')}" placeholder="Para PDF y recordatorios"></div></div>
    <label for="pDir">Dirección</label><input id="pDir" name="direccion" value="${esc(per?.direccion || '')}" placeholder="Aparece en el pagaré">
    <label>Cuenta bancaria habitual <span class="muted">(se propone al prestarle)</span></label>
    <div class="f3"><input name="cbBanco" list="bancosP" placeholder="Banco" value="${esc(cb.banco || '')}" aria-label="Banco"><select name="cbTipo" aria-label="Tipo de cuenta">${['Ahorros', 'Corriente', 'Billetera digital', 'Efectivo'].map(t => `<option ${t === (cb.tipo || 'Ahorros') ? 'selected' : ''}>${t}</option>`).join('')}</select><input name="cbNumero" inputmode="numeric" placeholder="Número" value="${esc(cb.numero || '')}" aria-label="Número de cuenta"></div>
    <datalist id="bancosP">${BANCOS.map(b => `<option value="${b}">`).join('')}</datalist>
    <label for="pNot">Notas</label><textarea id="pNot" name="notas">${esc(per?.notas || '')}</textarea>
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar persona</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    q('#fper', box).onsubmit = ev => {
      ev.preventDefault();
      const d = limpiar(Object.fromEntries(new FormData(ev.target)));
      if (!d.nombre) return toast('Escribe el nombre', true);
      const { cbBanco, cbTipo, cbNumero, ...resto } = d;
      const g = S.guardar('personas', { ...(per || {}), ...resto, cuentaBanco: { banco: cbBanco, tipo: cbTipo, numero: cbNumero } });
      cerrar(); toast('Persona guardada'); despues ? despues(g) : render();
    };
  });
}

export function editarCuenta(c, despues) {
  modal(`<h2>${c ? 'Editar cuenta' : 'Nueva cuenta'}</h2><form id="fc">
    <label for="cNom">Nombre de la cuenta</label><input id="cNom" name="nombre" required value="${esc(c?.nombre || '')}" placeholder="Ej.: Ahorros Bancolombia, Nequi, Efectivo">
    <div class="f2"><div><label for="cBan">Banco o entidad</label><input id="cBan" name="banco" value="${esc(c?.banco || '')}"></div><div><label for="cNum">Últimos 4 dígitos</label><input id="cNum" name="numero" inputmode="numeric" value="${esc(c?.numero || '')}" maxlength="6"></div></div>
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar cuenta</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    q('#fc', box).onsubmit = ev => {
      ev.preventDefault();
      const d = limpiar(Object.fromEntries(new FormData(ev.target)));
      if (!d.nombre) return toast('Escribe el nombre de la cuenta', true);
      const g = S.guardar('cuentas', { ...(c || {}), ...d });
      cerrar(); toast('Cuenta guardada'); despues ? despues(g) : render();
    };
  });
}

/** Quien presta (acreedor): aparece como lista desplegable al registrar préstamos y en el pagaré. */
export function editarPrestamista(x, despues) {
  modal(`<h2>${x ? 'Editar' : 'Agregar'} quién presta</h2><p class="muted" style="margin-top:-6px">Aparece como acreedor en el pagaré y en los PDF.</p><form id="fpr">
    <label for="xNom">Nombre completo</label><input id="xNom" name="nombre" required value="${esc(x?.nombre || '')}">
    <div class="f3"><div><label for="xTd">Tipo doc.</label><select id="xTd" name="tipoDoc">${TIPOS_DOC.map(t => `<option ${t === (x?.tipoDoc || 'C.C.') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div style="grid-column:span 2"><label for="xDoc">Número de documento</label><input id="xDoc" name="documento" inputmode="numeric" value="${esc(x?.documento || '')}"></div></div>
    <div class="f2"><div><label for="xTel">Teléfono</label><input id="xTel" name="telefono" value="${esc(x?.telefono || '')}"></div><div><label for="xMail">Correo</label><input id="xMail" name="email" type="email" value="${esc(x?.email || '')}"></div></div>
    <label for="xCiu">Ciudad <span class="muted">(lugar de creación y pago del pagaré)</span></label><input id="xCiu" name="ciudad" value="${esc(x?.ciudad || '')}" placeholder="Ej.: Medellín">
    <div class="acciones"><button class="btn pri">${icon('check')}Guardar</button><button type="button" class="btn ghost" data-cerrar>Cancelar</button></div></form>`, (box, cerrar) => {
    q('#fpr', box).onsubmit = ev => {
      ev.preventDefault();
      const d = limpiar(Object.fromEntries(new FormData(ev.target)));
      if (!d.nombre) return toast('Escribe el nombre', true);
      const g = S.guardar('prestamistas', { ...(x || {}), ...d });
      cerrar(); toast('Guardado'); despues ? despues(g) : render();
    };
  });
}
