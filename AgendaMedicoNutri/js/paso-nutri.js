/**
 * paso-nutri.js — Paso 3: la cita con la nutricionista.
 *
 * El cliente reserva en Microsoft Bookings (embebido, o en otra pestaña) y
 * después nos dice qué servicio, día y hora eligió. Si es antes de que
 * termine su cita médica (o sin la hora de traslado entre sedes), se avisa y
 * no se deja guardar. El backend vuelve a controlar lo mismo.
 * Usa funciones de app.js (estado, Api, irA, pintarCita...).
 */
const PasoNutri = (() => {
  const $ = id => document.getElementById(id);
  const form = $('form-nutri');
  const VISTAS = ['nutri-cargando', 'nutri-reservar', 'nutri-espera', 'form-nutri', 'nutri-registrada'];
  let opciones = null;

  const formatoDesde = new Intl.DateTimeFormat('es-UY', {
    timeZone: CONFIG.ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
  const formatoHora = new Intl.DateTimeFormat('es-UY', { timeZone: CONFIG.ZONA_HORARIA, hour: '2-digit', minute: '2-digit' });

  function vista(id) {
    VISTAS.forEach(v => { $(v).hidden = v !== id; });
  }

  /** "2026-10-06" + "10:30" → fecha real (Uruguay está en UTC-3 todo el año). */
  const fechaUruguay = (fecha, hora) => new Date(fecha + 'T' + hora + ':00-03:00');

  // ─── Mostrar el paso ─────────────────────────────────────────────────────

  async function preparar() {
    pintarCita('nutri-cita-medico', 'medico');
    if (tieneCitaNutri()) {
      pintarCita('nutri-cita-nutri', 'nutri');
      return vista('nutri-registrada');
    }
    if (await cargarOpciones()) vista('nutri-reservar');
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
    return true;
  }

  // ─── Botones ─────────────────────────────────────────────────────────────

  document.querySelectorAll('.abrir-bookings').forEach(a => a.addEventListener('click', () => vista('nutri-espera')));

  document.querySelectorAll('.ya-reserve').forEach(b => b.addEventListener('click', () => {
    vista('form-nutri');
    form.elements.servicio.focus();
  }));

  $('nutri-volver').addEventListener('click', () => vista('nutri-reservar'));
  $('nutri-ver-resumen').addEventListener('click', () => irA('confirmacion'));
  $('nutri-corregir').addEventListener('click', async () => {
    if (await cargarOpciones()) vista('form-nutri');
  });

  document.querySelectorAll('.copiar').forEach(boton => boton.addEventListener('click', async () => {
    const texto = $(boton.dataset.copiar).textContent;
    try {
      await navigator.clipboard.writeText(texto);
      boton.textContent = 'Copiado ✓';
      setTimeout(() => { boton.textContent = 'Copiar'; }, 2000);
    } catch (e) { /* sin permiso de portapapeles: el texto igual está a la vista */ }
  }));

  // ─── Regla: después de la cita médica ────────────────────────────────────

  /** Devuelve el aviso si la fecha elegida no respeta la regla, o '' si está bien. */
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
