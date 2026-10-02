/**
 * paso-nutri.js — Paso 3: la cita con la nutricionista.
 *
 * Modo normal ("bookings"): el cliente elige servicio → día → hora con
 * nuestros botones (horarios reales del Bookings de Verónica, posteriores a su
 * cita médica), acepta el tratamiento de datos de Pronokal y se reserva solo.
 *
 * Si Bookings no responde, se muestra un aviso con nuestro diseño (nunca la
 * página de Bookings) para reintentar o escribir por WhatsApp.
 * Usa funciones de app.js (estado, Api, irA, pintarCita, crearOpcion...).
 */
const PasoNutri = (() => {
  const $ = id => document.getElementById(id);
  const formTurnos = $('form-turnos-nutri');
  const VISTAS = ['nutri-cargando', 'form-turnos-nutri', 'nutri-error', 'nutri-registrada'];
  let opciones = null;
  let dias = [];
  let pedidoActual = 0;
  let precarga = null;   // { token, cuando, promesa } pedida apenas se confirma la cita médica

  /** Pide las opciones (con los horarios de los 6 servicios) por adelantado. */
  function precargar() {
    precarga = { token: estado.token, cuando: Date.now(), promesa: Api.llamar('opcionesNutri', {}, estado.token) };
    precarga.promesa.catch(() => { precarga = null; });
  }

  const formatoDia = new Intl.DateTimeFormat('es-UY', { timeZone: 'UTC', weekday: 'short', month: 'short' });

  function vista(id) {
    VISTAS.forEach(v => { $(v).hidden = v !== id; });
  }

  const elegido = nombre => {
    const marcado = formTurnos.querySelector('input[name="' + nombre + '"]:checked');
    return marcado ? marcado.value : '';
  };

  // ─── Mostrar el paso ─────────────────────────────────────────────────────

  async function preparar() {
    pintarCita('nutri-cita-medico', 'medico');
    if (tieneCitaNutri()) {
      pintarCita('nutri-cita-nutri', 'nutri');
      return vista('nutri-registrada');
    }
    if (await cargarOpciones()) mostrarTurnos();
  }

  async function cargarOpciones() {
    vista('nutri-cargando');
    try {
      const sirve = precarga && precarga.token === estado.token && Date.now() - precarga.cuando < 50000;
      opciones = await (sirve ? precarga.promesa : Api.llamar('opcionesNutri', {}, estado.token));
      precarga = null;
    } catch (error) {
      precarga = null;
      if (error.codigo === 'SIN_CITA_MEDICA') {
        estado.seguimiento = null;
        irA(pasoRecomendado());
        mostrarAviso(error.message);
      } else {
        manejarError(error);
      }
      return false;
    }
    return true;
  }

  // ─── Modo normal: nuestros botones ───────────────────────────────────────

  function mostrarTurnos() {
    formTurnos.reset();
    ['grupo-dia-nutri', 'grupo-hora-nutri', 'grupo-confirmar-nutri'].forEach(id => { $(id).hidden = true; });
    $('opciones-servicio-nutri').replaceChildren(...opciones.servicios.map(s =>
      crearOpcion('servicioNutri', s.nombre, s.nombre,
        s.duracion + ' min · ' + (s.modalidad === 'Telefónica' ? 'por teléfono' : 'presencial en Punta Carretas'))));
    vista('form-turnos-nutri');
  }

  /** Los horarios ya vinieron con las opciones: elegir servicio es instantáneo. */
  function mostrarDias() {
    const turnos = opciones.turnos && opciones.turnos[elegido('servicioNutri')];
    if (!turnos) return cargarDias();   // no vinieron: se piden
    $('grupo-dia-nutri').hidden = false;
    $('dias-nutri-cargando').hidden = true;
    dias = turnos;
    pintarDias();
  }

  async function cargarDias() {
    $('grupo-dia-nutri').hidden = false;
    $('grupo-hora-nutri').hidden = true;
    $('grupo-confirmar-nutri').hidden = true;
    $('opciones-dia-nutri').replaceChildren();
    $('sin-horarios-nutri').hidden = true;
    $('dias-nutri-cargando').hidden = false;
    const numero = ++pedidoActual;
    try {
      const r = await Api.llamar('horariosNutri', { servicio: elegido('servicioNutri') }, estado.token);
      if (numero !== pedidoActual) return;   // el cliente ya cambió de servicio
      dias = r.dias;
      pintarDias();
    } catch (error) {
      if (numero !== pedidoActual) return;
      if (error.codigo === 'BOOKINGS_NO_DISPONIBLE') mostrarError();
      else manejarError(error);
    } finally {
      if (numero === pedidoActual) $('dias-nutri-cargando').hidden = true;
    }
  }

  function pintarDias() {
    $('sin-horarios-nutri').hidden = dias.length > 0;
    $('opciones-dia-nutri').replaceChildren(...dias.map(d => {
      const fecha = new Date(d.fecha + 'T12:00:00Z');
      return crearOpcion('diaNutri', d.fecha, String(fecha.getUTCDate()), formatoDia.format(fecha).replace('.', ''), 'chip');
    }));
    const primero = $('opciones-dia-nutri').querySelector('input');
    if (primero) {
      primero.checked = true;
      pintarHoras();
    }
  }

  function pintarHoras() {
    const dia = dias.find(d => d.fecha === elegido('diaNutri'));
    $('grupo-hora-nutri').hidden = false;
    $('grupo-confirmar-nutri').hidden = true;
    $('opciones-hora-nutri').replaceChildren(...(dia ? dia.horarios : []).map(h => crearOpcion('horaNutri', h, h, '', 'chip')));
  }

  formTurnos.addEventListener('change', e => {
    ocultarAviso();
    switch (e.target.name) {
      case 'servicioNutri': mostrarDias(); break;
      case 'diaNutri': pintarHoras(); break;
      case 'horaNutri': $('grupo-confirmar-nutri').hidden = false; break;
      case 'consentimiento': errorDeCampo(formTurnos, 'consentimiento', ''); break;
    }
  });

  formTurnos.addEventListener('submit', async e => {
    e.preventDefault();
    ocultarAviso();
    if (!elegido('horaNutri')) return mostrarAviso('Elegí día y hora.');
    if (!errorDeCampo(formTurnos, 'consentimiento', formTurnos.elements.consentimiento.checked ? '' :
      'Para reservar tenés que aceptar el tratamiento de tus datos.')) return;

    try {
      const r = await conCarga(formTurnos.querySelector('button[type=submit]'), () => Api.llamar('reservarNutri', {
        servicio: elegido('servicioNutri'),
        fecha: elegido('diaNutri'),
        hora: elegido('horaNutri'),
        consentimiento: true,
      }, estado.token), 'Reservando con la nutricionista…');
      estado.seguimiento = r.seguimiento;
      irA('confirmacion');
    } catch (error) {
      if (error.codigo === 'HORARIO_OCUPADO') {
        mostrarAviso(error.message);
        if (opciones.turnos) opciones.turnos = null;   // los horarios guardados ya no sirven
        cargarDias();
      } else if (error.codigo === 'BOOKINGS_NO_DISPONIBLE') {
        mostrarError();
      } else {
        manejarError(error);
      }
    }
  });

  /** Si Bookings no responde: aviso propio, nunca la página de Bookings. */
  function mostrarError() {
    vista('nutri-error');
  }

  $('nutri-reintentar').addEventListener('click', () => preparar());
  $('nutri-ver-resumen').addEventListener('click', () => irA('confirmacion'));

  return { preparar: preparar, precargar: precargar };
})();
