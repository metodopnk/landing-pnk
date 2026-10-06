/**
 * asistencia.js — Pantalla de confirmación de asistencia.
 *
 * El email de recordatorio (24 h antes) trae un link a esta misma página con
 * ?confirmar=<código>. En ese caso no se muestra la agenda: solo la cita y el
 * botón "Confirmo mi asistencia". Hace falta ese toque del cliente (los
 * programas de email abren los links solos para revisarlos, y eso no debe
 * confirmar nada).
 * Usa funciones de app.js (Api, formatoFecha, mostrarAviso, conCarga).
 */
const Asistencia = (() => {
  const $ = id => document.getElementById(id);
  const parametros = new URLSearchParams(location.search);
  const codigo = parametros.get('confirmar');
  let citaActual = null;

  function esLinkDeConfirmacion() {
    return Boolean(codigo);
  }

  async function iniciar() {
    document.querySelector('.progreso').hidden = true;
    document.querySelectorAll('main > section[data-paso]').forEach(s => { s.hidden = true; });
    $('asistencia').hidden = false;
    try {
      pintar(await Api.llamar('verCita', { codigo: codigo }));
      if (parametros.get('cambiar') && !citaActual.pasada) preguntarCancelar();   // vino desde "No puedo ir" del email
    } catch (error) {
      $('asistencia-cargando').hidden = true;
      mostrarAviso(error.message);
    }
  }

  function pintar(cita) {
    citaActual = cita;
    $('asistencia-cargando').hidden = true;
    $('asistencia-contenido').hidden = false;
    $('asistencia-saludo').textContent = 'Hola ' + cita.nombre + ', ' + (cita.confirmada
      ? 'esta es tu ' + cita.cita + '.'
      : 'tocá el botón para confirmar que venís a tu ' + cita.cita + '.');

    const tarjeta = $('asistencia-cita');
    tarjeta.replaceChildren();
    const agregar = (etiqueta, texto, clase) => {
      const el = document.createElement(etiqueta);
      el.textContent = texto;
      if (clase) el.className = clase;
      tarjeta.append(el);
      return el;
    };
    agregar('h3', cita.cita === 'control' ? 'Tu control con el médico' : 'Tu consulta con el médico');
    agregar('p', formatoFecha.format(new Date(cita.fecha)) + ' h', 'fecha');
    agregar('p', cita.medico);
    agregar('p', cita.sede === 'Online' ? 'Online, por videollamada' : cita.sede + ' — ' + cita.direccion);
    if (cita.linkMeet) {
      const a = document.createElement('a');
      a.href = cita.linkMeet;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Link de la videollamada';
      agregar('p', '').append(a);
    }

    $('asistencia-ok').hidden = !cita.confirmada;
    $('asistencia-confirmar').hidden = cita.confirmada || cita.pasada;
    $('asistencia-cambiar').hidden = cita.pasada;
    $('asistencia-cancelar').hidden = true;
    if (cita.pasada && !cita.confirmada) mostrarAviso('Esta consulta ya pasó.', 'info');
  }

  $('asistencia-confirmar').addEventListener('click', async () => {
    try {
      pintar(await conCarga($('asistencia-confirmar'), () => Api.llamar('confirmarAsistencia', { codigo: codigo })));
    } catch (error) {
      mostrarAviso(error.message);
    }
  });

  // ─── "No puedo ir": cancelar y volver a la agenda ─────────────────────────

  function preguntarCancelar() {
    $('asistencia-cancelar-detalle').textContent = citaActual.control
      ? ' También se libera tu control del ' + formatoFecha.format(new Date(citaActual.control)) + ' h.'
      : '';
    $('asistencia-confirmar').hidden = true;
    $('asistencia-cambiar').hidden = true;
    $('asistencia-cancelar').hidden = false;
    $('asistencia-cancelar-si').focus();
  }

  $('asistencia-cambiar').addEventListener('click', preguntarCancelar);
  $('asistencia-cancelar-no').addEventListener('click', () => pintar(citaActual));

  $('asistencia-cancelar-si').addEventListener('click', async () => {
    try {
      await conCarga($('asistencia-cancelar-si'), () => Api.llamar('cancelarCita', { codigo: codigo }), 'Cancelando…');
      reiniciar();   // la agenda arranca de cero
      location.replace(location.pathname + '?reagendar=1');
    } catch (error) {
      mostrarAviso(error.message);
    }
  });

  return { esLinkDeConfirmacion: esLinkDeConfirmacion, iniciar: iniciar };
})();
