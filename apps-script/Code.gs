/**
 * Servicio de Control de Préstamos (versión 2).
 * Se publica como "Aplicación web" desde la cuenta de Gmail DEDICADA. Hace cuatro cosas:
 *   1. Envía correos con PDF adjunto (estado de cuenta, condiciones, pagarés, informes).
 *   2. Lee la tasa de usura vigente desde la página de la Superintendencia Financiera.
 *   3. Guarda pagarés para firma remota y recibe la firma del deudor.
 *   4. Envía recordatorios automáticos cada mañana según la agenda que le manda la app.
 *
 * Propiedades del script (Configuración del proyecto > Propiedades del script):
 *   TOKEN         (obligatorio) clave secreta; la misma va en la app > Ajustes.
 *   LOG_SHEET_ID  (opcional)    hoja de Google Sheets para registrar envíos.
 *
 * Después de pegar esta versión: ejecute `instalarRecordatorios` una vez y publique una NUEVA VERSIÓN
 * (Implementar > Gestionar implementaciones > editar > Nueva versión). La URL no cambia.
 */

var ZONA = 'America/Bogota';
var CARPETA = 'Control de Prestamos (no borrar)';

// ======================= Entradas =======================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var accion = body.accion || 'enviar';
    // Acción pública (protegida por la clave única de cada pagaré)
    if (accion === 'pagare_firmar') return json_(firmarPagare_(body));
    if (!autorizado_(body.token)) return json_({ ok: false, error: 'No autorizado (token incorrecto).' });
    switch (accion) {
      case 'enviar': return json_(enviar_(body));
      case 'usura': return json_(leerUsura_());
      case 'pagare_crear': return json_(crearPagare_(body));
      case 'pagare_estado': return json_(estadoPagares_(body.ids || []));
      case 'pagare_pdf': return json_(pdfPagare_(body.id));
      case 'agenda': return json_(guardarAgenda_(body.items || []));
      case 'agenda_estado': return json_(estadoAgenda_());
      default: return json_({ ok: false, error: 'Acción desconocida: ' + accion });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion === 'pagare') return json_(leerPagarePublico_(p.id, p.k));
  return json_({ ok: true, servicio: 'prestamos-mailer', version: 2, cuotaRestante: MailApp.getRemainingDailyQuota() });
}

function autorizado_(t) {
  var TOKEN = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return TOKEN && TOKEN.length >= 20 && t === TOKEN;
}

// ======================= 1. Envío de correos =======================
function enviar_(b) {
  var to = limpiarCorreos_(b.to);
  if (!to) return { ok: false, error: 'Destinatario inválido.' };
  var opciones = { name: String(b.fromName || 'Control de Préstamos').slice(0, 80), htmlBody: String(b.html || '') };
  var adjuntos = [];
  if (b.pdfBase64) {
    if (b.pdfBase64.length > 14000000) return { ok: false, error: 'PDF demasiado grande.' };
    adjuntos.push(Utilities.newBlob(Utilities.base64Decode(b.pdfBase64), MimeType.PDF, String(b.filename || 'documento.pdf').replace(/[^\w.\- ]/g, '_')));
  }
  if (adjuntos.length) opciones.attachments = adjuntos;
  var cc = limpiarCorreos_(b.cc); if (cc) opciones.cc = cc;
  var bcc = limpiarCorreos_(b.bcc); if (bcc) opciones.bcc = bcc;
  var replyTo = limpiarCorreos_(b.replyTo); if (replyTo) opciones.replyTo = replyTo;
  MailApp.sendEmail(to, String(b.subject || 'Información de su préstamo').slice(0, 200), String(b.text || ''), opciones);
  registrar_([new Date(), 'envío', to, cc || '', b.subject || '', b.filename || '', b.ref || '']);
  return { ok: true, enviadoDesde: Session.getEffectiveUser().getEmail(), cuotaRestante: MailApp.getRemainingDailyQuota() };
}

// ======================= 2. Tasa de usura =======================
var MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/** Lee el comunicado más reciente de la Superfinanciera. Depende del formato de su página: si cambia, la app permite escribir la tasa a mano. */
function leerUsura_() {
  var base = 'https://www.superfinanciera.gov.co';
  var paginas = [
    base + '/publicaciones/10829/informes-y-cifrascifrasestablecimientos-de-creditoinformacion-periodicamensualtasa-de-interes-bancario-corriente-10829/',
    base + '/publicaciones/10829',
    base + '/inicio/sala-de-prensa/comunicados-de-prensa-'
  ];
  var ids = {};
  paginas.forEach(function (url) {
    try {
      var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }).getContentText();
      var re = /publicaciones\/(\d+)\/[a-z0-9\-]*interes-bancario-corriente[a-z0-9\-]*/gi, m;
      while ((m = re.exec(html))) ids[m[1]] = base + '/' + m[0] + (m[0].slice(-1) === '/' ? '' : '/');
      var r = extraerTasa_(html); if (r) ids['_directo'] = r;
    } catch (e) { /* siguiente */ }
  });
  if (ids['_directo']) return resultadoUsura_(ids['_directo'], paginas[0]);
  var lista = Object.keys(ids).filter(function (k) { return k !== '_directo'; }).sort(function (a, b) { return Number(b) - Number(a); }).slice(0, 4);
  for (var i = 0; i < lista.length; i++) {
    try {
      var html2 = UrlFetchApp.fetch(ids[lista[i]], { muteHttpExceptions: true }).getContentText();
      var t = extraerTasa_(html2);
      if (t) return resultadoUsura_(t, ids[lista[i]]);
    } catch (e) { /* siguiente */ }
  }
  return { ok: false, error: 'No se pudo leer la tasa en la página de la Superfinanciera. Escríbala a mano en Ajustes.' };
}

function extraerTasa_(html) {
  var texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  var m = texto.match(/certifica en (\d{1,2}[,.]\d{1,2})\s*%\s*efectivo anual para la vigencia entre el (\d{1,2}) (?:de \w+ )?y el (\d{1,2}) de (\w+) de (\d{4})/i);
  if (!m) return null;
  var mes = MESES[m[4].toLowerCase()];
  if (!mes) return null;
  return { ibc: Number(m[1].replace(',', '.')), mes: m[5] + '-' + ('0' + mes).slice(-2) };
}

function resultadoUsura_(t, fuente) {
  return { ok: true, mes: t.mes, ibc: t.ibc, usura: Math.round(t.ibc * 1.5 * 100) / 100, fuente: fuente, leido: new Date().toISOString() };
}

// ======================= 3. Pagarés con firma remota =======================
function carpeta_(sub) {
  var it = DriveApp.getFoldersByName(CARPETA);
  var raiz = it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
  if (!sub) return raiz;
  var it2 = raiz.getFoldersByName(sub);
  return it2.hasNext() ? it2.next() : raiz.createFolder(sub);
}
function leerJson_(carpeta, nombre) {
  var it = carpeta.getFilesByName(nombre);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}
function escribirJson_(carpeta, nombre, obj) {
  var it = carpeta.getFilesByName(nombre);
  var txt = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(txt); else carpeta.createFile(nombre, txt, MimeType.PLAIN_TEXT);
}

/** La app envía los datos del pagaré, una clave única y (opcional) el correo con el enlace de firma. */
function crearPagare_(b) {
  if (!/^[\w\-]{8,80}$/.test(String(b.id || '')) || String(b.clave || '').length < 24) return { ok: false, error: 'Datos de pagaré incompletos.' };
  var c = carpeta_('pagares');
  var previo = leerJson_(c, b.id + '.json');
  if (previo && previo.estado === 'firmado') return { ok: false, error: 'Este pagaré ya fue firmado.' };
  escribirJson_(c, b.id + '.json', {
    id: b.id, clave: b.clave, datos: b.datos, estado: 'pendiente', creado: new Date().toISOString(),
    correoDeudor: limpiarCorreos_(b.correoDeudor), correoAcreedor: limpiarCorreos_(b.correoAcreedor), fromName: b.fromName || 'Control de Préstamos'
  });
  if (b.correo) enviar_(b.correo);
  return { ok: true };
}

function leerPagarePublico_(id, clave) {
  var r = leerJson_(carpeta_('pagares'), String(id) + '.json');
  if (!r || r.clave !== clave) return { ok: false, error: 'Enlace inválido o vencido.' };
  return { ok: true, estado: r.estado, datos: r.datos, firmadoEn: r.firmadoEn || null };
}

function firmarPagare_(b) {
  var c = carpeta_('pagares');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var r = leerJson_(c, String(b.id) + '.json');
    if (!r || r.clave !== b.clave) return { ok: false, error: 'Enlace inválido.' };
    if (r.estado === 'firmado') return { ok: false, error: 'Este pagaré ya fue firmado.' };
    var f = b.firma || {};
    if (!f.nombre || !f.documento || !f.imagen || !b.pdfBase64) return { ok: false, error: 'Faltan datos de la firma.' };
    var nombre = 'Pagare_' + (r.datos && r.datos.numero || r.id) + '_firmado.pdf';
    var archivo = carpeta_('pagares firmados').createFile(Utilities.newBlob(Utilities.base64Decode(b.pdfBase64), MimeType.PDF, nombre));
    r.estado = 'firmado';
    r.firmadoEn = new Date().toISOString();
    r.firma = { nombre: f.nombre, documento: f.documento, aceptoEn: f.aceptoEn, dispositivo: String(f.dispositivo || '').slice(0, 300), huella: f.huella, metodo: 'enlace por correo' };
    r.archivoId = archivo.getId();
    escribirJson_(c, r.id + '.json', r);
    var para = [r.correoDeudor, r.correoAcreedor].filter(String).join(',');
    if (para) enviar_({ to: para, fromName: r.fromName, subject: 'Pagaré ' + (r.datos && r.datos.numero || '') + ' firmado', pdfBase64: b.pdfBase64, filename: nombre,
      html: '<p>Se adjunta el pagaré firmado electrónicamente el ' + Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm') + ' por ' + f.nombre + ' (doc. ' + f.documento + ').</p><p>Huella del documento (SHA-256): <code>' + f.huella + '</code></p>',
      text: 'Pagaré firmado adjunto.', ref: r.id });
    registrar_([new Date(), 'pagaré firmado', r.correoDeudor || '', '', nombre, '', r.id]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function estadoPagares_(ids) {
  var c = carpeta_('pagares');
  var out = {};
  ids.slice(0, 200).forEach(function (id) {
    var r = leerJson_(c, String(id) + '.json');
    if (r) out[id] = { estado: r.estado, firmadoEn: r.firmadoEn || null, firma: r.firma || null };
  });
  return { ok: true, pagares: out };
}

function pdfPagare_(id) {
  var r = leerJson_(carpeta_('pagares'), String(id) + '.json');
  if (!r || !r.archivoId) return { ok: false, error: 'Aún no hay pagaré firmado.' };
  return { ok: true, pdfBase64: Utilities.base64Encode(DriveApp.getFileById(r.archivoId).getBlob().getBytes()), firma: r.firma, firmadoEn: r.firmadoEn };
}

// ======================= 4. Recordatorios =======================
/** La app manda la lista completa de recordatorios futuros cada vez que cambian los datos. */
function guardarAgenda_(items) {
  var limpios = items.filter(function (x) { return x && x.id && x.enviarEn && limpiarCorreos_(x.to); }).slice(0, 2000);
  escribirJson_(carpeta_(), 'agenda.json', { actualizada: new Date().toISOString(), items: limpios });
  return { ok: true, programados: limpios.length };
}

function estadoAgenda_() {
  var c = carpeta_();
  var ag = leerJson_(c, 'agenda.json') || { items: [] };
  var env = leerJson_(c, 'enviados.json') || {};
  var hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  return { ok: true, actualizada: ag.actualizada || null, pendientes: ag.items.filter(function (x) { return !env[x.id] && x.enviarEn >= hoy; }).length,
    ultimos: Object.keys(env).map(function (k) { return { id: k, en: env[k] }; }).sort(function (a, b) { return a.en < b.en ? 1 : -1; }).slice(0, 30),
    disparador: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'enviarRecordatorios'; }) };
}

/** Se ejecuta cada mañana (disparador). Envía los recordatorios del día que no se hayan enviado. */
function enviarRecordatorios() {
  var c = carpeta_();
  var ag = leerJson_(c, 'agenda.json'); if (!ag) return;
  var env = leerJson_(c, 'enviados.json') || {};
  var hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  var hace3 = Utilities.formatDate(new Date(Date.now() - 3 * 86400000), ZONA, 'yyyy-MM-dd');
  var n = 0;
  ag.items.forEach(function (x) {
    if (env[x.id] || x.enviarEn > hoy || x.enviarEn < hace3) return;
    if (MailApp.getRemainingDailyQuota() < 5) return;
    try {
      enviar_({ to: x.to, cc: x.cc, bcc: x.bcc, replyTo: x.replyTo, fromName: x.fromName, subject: x.asunto, html: x.html, text: x.text, ref: x.ref });
      env[x.id] = new Date().toISOString(); n++;
    } catch (e) { registrar_([new Date(), 'error recordatorio', x.to, '', x.asunto, String(e), x.ref || '']); }
  });
  // limpiar registros de más de 120 días
  var lim = new Date(Date.now() - 120 * 86400000).toISOString();
  Object.keys(env).forEach(function (k) { if (env[k] < lim) delete env[k]; });
  escribirJson_(c, 'enviados.json', env);
  Logger.log('Recordatorios enviados: ' + n);
}

/** Ejecútela UNA vez desde el editor: programa el envío diario a las 7-8 a. m. */
function instalarRecordatorios() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'enviarRecordatorios') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().everyDays(1).atHour(7).inTimezone(ZONA).create();
  carpeta_('pagares'); carpeta_('pagares firmados');
  Logger.log('Listo: recordatorios programados cada día a las 7 a. m. (hora de Colombia). Carpeta en Drive: ' + CARPETA);
}

// ======================= Utilidades =======================
function probarEnvio() {
  var yo = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(yo, 'Prueba - Control de Préstamos', 'Si recibe este correo, el servicio funciona.');
  Logger.log('Enviado a ' + yo + '. Cuota restante: ' + MailApp.getRemainingDailyQuota());
}
function probarUsura() { Logger.log(JSON.stringify(leerUsura_())); }
function generarToken() {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', t);
  Logger.log('TOKEN: ' + t);
}
function limpiarCorreos_(v) {
  if (!v) return '';
  var re = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  return String(v).split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return re.test(s); }).slice(0, 10).join(',');
}
function registrar_(fila) {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) return;
  try { SpreadsheetApp.openById(id).getSheets()[0].appendRow(fila); } catch (e) { /* el registro no debe impedir el envío */ }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
