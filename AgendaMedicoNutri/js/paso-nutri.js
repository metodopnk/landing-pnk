/**
 * paso-nutri.js — Paso 3: la cita con la nutricionista.
 *
 * Modo normal ("bookings"): el cliente elige servicio → día → hora con
 * nuestros botones (horarios reales del Bookings de Verónica, posteriores a su
 * cita médica), acepta el tratamiento de datos de Pronokal y se reserva solo.
 *
 * Modo de respaldo ("manual"): si Bookings no responde, se muestra la agenda de
 * Bookings (embebida o en otra pestaña) y el cliente nos dice qué reservó.
 * Usa funciones de app.js (estado, Api, irA, pintarCita, crearOpcion...).
 */
const PasoNutri = (() => {
  const $ = id => document.getElementById(id);
  const form = $('form-nutri');                 // respaldo: "¿qué reservaste?"
  const formTurnos = $('form-turnos-nutri');    // normal: nuestros botones
  const VISTAS = ['nutri-cargando', 'form-turnos-nutri', 'nutri-reservar', 'nutri-espera', 'form-nutri', 'nutri-registrada'];
  let opciones = null;
  let dias = [];
  let pedidoActual = 0;

  const formatoDesde = new Intl.DateTimeFormat('es-UY', {
    timeZone: CONFIG.ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  const formatoHora = new Intl.DateTimeFormat('es-UY', { timeZone: CONFIG.ZONA_HORARIA, hour: '2-digit', minute: '2-digit' });
  const formatoDia = new Intl.DateTimeFormat('es-UY', { timeZone: 'UTC', weekday: 'short', month: 'short' });

  function vista(id) {
    VISTAS.forEach(v => { $(v).hidden = v !== id; });
  }

  const elegido = nombre => {
    const marcado = formTurnos.querySelector('input[name="' + nombre + '"]:checked');
    return marcado ? marcado.value : '';
  };

  /** "2026-10-06" + "10:30" → fecha real (Uruguay está en UTC-3 todo el año). */
  const fechaUruguay = (fecha, hora) => new Date(fecha + 'T' + hora + ':00-03:00');

  // ─── Mostrar el paso ─────────────────────────────────────────────────────

  async function preparar() {
    pintarCita('nutri-cita-medico', 'medico');
    if (tieneCitaNutri()) {
      pintarCita('nutri-cita-nutri', 'nutri');
      return vista('nutri-registrada');
    }
    if (!(await cargarOpciones())) return;
    if (opciones.modo === 'bookings') mostrarTurnos();
    else vista('nutri-reservar');
  }

  async function cargarOpciones() {
    vista('nutri-cargando');
    try {
      opciones = await Api.llamar('opcionesNutri', {}, estado.token);
    } catch (error) {
      if (error.codigo === 'SIN_CITA_MEDICA') {
        estado.seguimiento = null;
        irA(pasoRecomendado());
        mostrarAviso(error.message);
      } else {
        manejarError(error);
      }
      return false;
    }
    prepararRespaldo();
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
      if (error.codigo === 'BOOKINGS_NO_DISPONIBLE') pasarARespaldo(error.message);
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
      case 'servicioNutri': cargarDias(); break;
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
      }, estado.token));
      estado.seguimiento = r.seguimiento;
      irA('confirmacion');
    } catch (error) {
      if (error.codigo === 'HORARIO_OCUPADO') {
        mostrarAviso(error.message);
        cargarDias();
      } else if (error.codigo === 'BOOKINGS_NO_DISPONIBLE') {
        pasarARespaldo(error.message);
      } else {
        manejarError(error);
      }
    }
  });

  /** Si Bookings no responde, se pasa al modo manual sin perder al cliente. */
  function pasarARespaldo(mensaje) {
    vista('nutri-reservar');
    mostrarAviso(mensaje, 'info');
  }

  // ─── Modo de respaldo: Bookings + "¿qué reservaste?" ─────────────────────

  function prepararRespaldo() {
    const desdeTel = new Date(opciones.desdeTelefonica);
    const desdePre = new Date(opciones.desdePresencial);
    $('nutri-desde').textContent = 'a partir del ' + formatoDesde.format(desdeTel) + ' h' +
      (desdePre.getTime() !== desdeTel.getTime()
        ? '. Si la visita es presencial en Punta Carretas, a partir de las ' +
          formatoHora.format(desdePre) + ' h, para que llegues desde la otra sede.'
        : '.');
    $('nutri-nombre').textContent = opciones.nombreReserva;
    $('nutri-email').textContent = opciones.emailReserva;

    const iframe = $('bookings-iframe');
    if (iframe.src !== opciones.urlBookings) iframe.src = opciones.urlBookings;
    document.querySelectorAll('.abrir-bookings').forEach(a => { a.href = opciones.urlBookings; });

    const select = form.elements.servicio;
    select.length = 1;
    opciones.servicios.forEach(s => select.add(new Option(s.nombre + ' (' + s.duracion + ' min)', s.nombre)));
    form.elements.fecha.min = opciones.desdeTelefonica.slice(0, 10);
  }

  document.querySelectorAll('.abrir-bookings').forEach(a => a.addEventListener('click', () => vista('nutri-espera')));

  document.querySelectorAll('.ya-reserve').forEach(b => b.addEventListener('click', () => {
    vista('form-nutri');
    form.elements.servicio.focus();
  }));

  $('nutri-volver').addEventListener('click', () => vista('nutri-reservar'));
  $('nutri-ver-resumen').addEventListener('click', () => irA('confirmacion'));

  document.querySelectorAll('.copiar').forEach(boton => boton.addEventListener('click', async () => {
    const texto = $(boton.dataset.copiar).textContent;
    try {
      await navigator.clipboard.writeText(texto);
      boton.textContent = 'Copiado ✓';
      setTimeout(() => { boton.textContent = 'Copiar'; }, 2000);
    } catch (e) { /* sin permiso de portapapeles: el texto igual está a la vista */ }
  }));

  /** Devuelve el aviso si la fecha declarada no respeta la regla, o '' si está bien. */
  function controlarRegla() {
    const servicio = opciones && opciones.servicios.find(s => s.nombre === form.elements.servicio.value);
    const { fecha, hora } = form.elements;
    if (!servicio || !fecha.value || !hora.value) return '';
    const elegida = fechaUruguay(fecha.value, hora.value);
    const presencial = servicio.modalidad !== 'Telefónica';
    const minimo = new Date(presencial ? opciones.desdePresencial : opciones.desdeTelefonica);
    if (elegida >= minimo) return '';
    return 'La cita con la nutricionista tiene que ser a partir del ' + formatoDesde.format(minimo) + ' h' +
      (presencial && minimo.getTime() !== new Date(opciones.desdeTelefonica).getTime()
        ? ' (dejamos 1 hora para que llegues de una sede a la otra)' : '') +
      '. Cambiá tu reserva en Bookings y cargá el nuevo horario.';
  }

  form.addEventListener('change', () => {
    const aviso = controlarRegla();
    $('nutri-regla').textContent = aviso;
    $('nutri-regla').hidden = !aviso;
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    ocultarAviso();
    const { servicio, fecha, hora } = form.elements;
    const ok = [
      errorDeCampo(form, 'servicio', servicio.value ? '' : 'Elegí el servicio que reservaste.'),
      errorDeCampo(form, 'fecha', fecha.value ? '' : 'Indicá el día.'),
      errorDeCampo(form, 'hora', hora.value ? '' : 'Indicá la hora.'),
    ].every(Boolean);
    if (!ok) return;

    const aviso = controlarRegla();
    if (aviso) {
      $('nutri-regla').textContent = aviso;
      $('nutri-regla').hidden = false;
      return;
    }

    try {
      const r = await conCarga(form.querySelector('button[type=submit]'), () => Api.llamar('registrarNutri', {
        servicio: servicio.value, fecha: fecha.value, hora: hora.value,
      }, estado.token));
      estado.seguimiento = r.seguimiento;
      irA('confirmacion');
    } catch (error) {
      if (error.codigo === 'NUTRI_ANTES_DEL_MEDICO') {
        $('nutri-regla').textContent = error.message;
        $('nutri-regla').hidden = false;
      } else {
        manejarError(error);
      }
    }
  });

  return { preparar: preparar };
})();
