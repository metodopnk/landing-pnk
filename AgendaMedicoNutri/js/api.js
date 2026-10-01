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
      throw new Error('No pudimos conectarnos. Revisá tu conexión a internet y probá de nuevo.');
    }

    if (!respuesta.ok) {
      const error = new Error(respuesta.error);
      error.codigo = respuesta.codigo;
      throw error;
    }
    return respuesta.datos;
  },
};
