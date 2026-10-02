/**
 * api.js — Cómo la página le habla al backend de Google Apps Script.
 *
 * Se manda como "text/plain" a propósito: así el navegador no hace una
 * consulta previa (CORS) que Apps Script no sabe responder.
 */
const Api = {
  async llamar(accion, datos, token) {
    if (!CONFIG.API_URL) throw new Error('Falta configurar API_URL en js/config.js.');

    let respuesta;
    try {
      const pedido = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion: accion, datos: datos, token: token }),
      });
      respuesta = await pedido.json();
    } catch (e) {
      const error = new Error('No pudimos conectarnos. Revisá tu conexión a internet y probá de nuevo.');
      error.stack = 'Acción "' + accion + '" sin respuesta válida del backend: ' + (e && e.message);
      throw error;
    }

    if (!respuesta.ok) {
      const error = new Error(respuesta.error);
      error.codigo = respuesta.codigo;
      error.delBackend = true;   // el backend ya lo reportó si correspondía
      throw error;
    }
    return respuesta.datos;
  },

  /** Manda al backend un error que pasó en el navegador (llega por email a PNK). */
  reportarError(donde, error, extra) {
    if (!CONFIG.API_URL) return;
    try {
      fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion: 'reportarError', datos: Object.assign({
          donde: donde,
          mensaje: String(error && error.message || error),
          detalle: String(error && error.stack || ''),
          paso: typeof estado !== 'undefined' ? estado.paso : '',
          navegador: navigator.userAgent,
          url: location.href,
        }, extra || {}) }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* reportar nunca debe romper la página */ }
  },
};

// Errores de programación en la página: se reportan solos.
window.addEventListener('error', e => Api.reportarError('error en la página', e.error || e.message));
window.addEventListener('unhandledrejection', e => Api.reportarError('promesa sin manejar', e.reason));
