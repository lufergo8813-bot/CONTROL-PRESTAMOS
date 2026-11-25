/**
 * Servicio de envío de correos para Control de Préstamos.
 *
 * Se publica como "Aplicación web" desde una cuenta de Gmail DEDICADA (no la personal),
 * por ejemplo: prestamos.notificaciones@gmail.com. Los correos salen desde esa cuenta.
 *
 * Configuración (Proyecto > Configuración del proyecto > Propiedades del script):
 *   TOKEN         (obligatorio) clave secreta larga; la misma se pone en la app > Ajustes.
 *   LOG_SHEET_ID  (opcional)    ID de una hoja de Google Sheets para registrar cada envío.
 *
 * Límite de Gmail gratuito con Apps Script: ~100 destinatarios por día.
 */

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var TOKEN = props.getProperty('TOKEN');
    var body = JSON.parse(e.postData.contents);

    if (!TOKEN || TOKEN.length < 20) return json_({ ok: false, error: 'Servicio sin TOKEN configurado.' });
    if (body.token !== TOKEN) return json_({ ok: false, error: 'No autorizado (token incorrecto).' });

    var to = limpiarCorreos_(body.to);
    if (!to) return json_({ ok: false, error: 'Destinatario inválido.' });
    if (!body.pdfBase64) return json_({ ok: false, error: 'Falta el PDF.' });
    if (body.pdfBase64.length > 14000000) return json_({ ok: false, error: 'PDF demasiado grande.' });

    var pdf = Utilities.newBlob(Utilities.base64Decode(body.pdfBase64), MimeType.PDF,
      String(body.filename || 'documento.pdf').replace(/[^\w.\- ]/g, '_'));

    var opciones = {
      name: String(body.fromName || 'Control de Préstamos').slice(0, 80),
      htmlBody: String(body.html || ''),
      attachments: [pdf]
    };
    var cc = limpiarCorreos_(body.cc); if (cc) opciones.cc = cc;
    var bcc = limpiarCorreos_(body.bcc); if (bcc) opciones.bcc = bcc;
    var replyTo = limpiarCorreos_(body.replyTo); if (replyTo) opciones.replyTo = replyTo;

    MailApp.sendEmail(to, String(body.subject || 'Información de su préstamo').slice(0, 200), String(body.text || ''), opciones);

    registrar_(props.getProperty('LOG_SHEET_ID'), [new Date(), to, cc || '', body.subject || '', body.filename || '', body.ref || '']);
    return json_({ ok: true, enviadoDesde: Session.getEffectiveUser().getEmail(), cuotaRestante: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Permite comprobar desde el navegador que el servicio está publicado. */
function doGet() {
  return json_({ ok: true, servicio: 'prestamos-mailer', cuotaRestante: MailApp.getRemainingDailyQuota() });
}

/** Ejecútela una vez desde el editor para autorizar permisos y probar el envío a la propia cuenta. */
function probarEnvio() {
  var yo = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(yo, 'Prueba - Control de Préstamos', 'Si recibe este correo, el servicio funciona.');
  Logger.log('Enviado a ' + yo + '. Cuota restante: ' + MailApp.getRemainingDailyQuota());
}

/** Genera un TOKEN aleatorio y lo guarda en las propiedades. Cópielo del registro (Logger). */
function generarToken() {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', t);
  Logger.log('TOKEN: ' + t);
}

function limpiarCorreos_(v) {
  if (!v) return '';
  var re = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  var lista = String(v).split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return re.test(s); });
  return lista.slice(0, 10).join(',');
}

function registrar_(sheetId, fila) {
  if (!sheetId) return;
  try { SpreadsheetApp.openById(sheetId).getSheets()[0].appendRow(fila); } catch (e) { /* el log no debe impedir el envío */ }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
