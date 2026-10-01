/**
 * paso-medico.js — Paso 2: tipo de consulta → médico → sede → día → hora → confirmar.
 *
 * Cada elección habilita la siguiente. Si el cliente cambia una elección de
 * arriba, se borran las de abajo (por ejemplo, otra sede tiene otros horarios).
 * Usa funciones de app.js (estado, Api, irA, pintarCita...).
 */
const PasoMedico = (() => {
  const form = document.getElementById('form-medico');
  const $ = id => document.getElementById(id);
  const NIVELES = ['medico', 'sede', 'dia', 'hora', 'confirmar'];

  let opciones = null;          // tipos, médicos y sedes que manda el backend
  let opcionesDelToken = null;  // para no mezclar opciones de otro cliente
  let dias = [];                // días y horas libres para la elección actual
  let pedidoActual = 0;         // para ignorar respuestas que llegan tarde

  const formatoNumero = new Intl.NumberFormat('es-UY');
  const formatoDia = new Intl.DateTimeFormat('es-UY', { timeZone: 'UTC', weekday: 'short', month: 'short' });

  const elegido = nombre => {
    const marcado = form.querySelector('input[name="' + nombre + '"]:checked');
    return marcado ? marcado.value : '';
  };

  /** Crea una opción elegible: tarjeta (tipo, médico, sede) o chip (día, hora). */
  function crearOpcion(nombre, valor, titulo, detalle, estilo) {
    const label = document.createElement('label');
    label.className = estilo === 'chip' ? 'chip' : 'opcion';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = nombre;
    input.value = valor;
    const caja = document.createElement('span');
    if (estilo === 'chip') {
      caja.append(titulo);
      if (detalle) {
        const small = document.createElement('small');
        small.textContent = detalle;
        caja.append(small);
      }
    } else {
      caja.className = 'caja';
      const t = document.createElement('span');
      t.className = 'titulo';
      t.textContent = titulo;
      caja.append(t);
      if (detalle) {
        const d = document.createElement('span');
        d.className = 'detalle';
        d.textContent = detalle;
        caja.append(d);
      }
    }
    label.append(input, caja);
    return label;
  }

  function elegirUnicaOpcion(contenedor) {
    const inputs = contenedor.querySelectorAll('input');
    if (inputs.length === 1) {
      inputs[0].checked = true;
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /** Oculta y vacía los grupos desde `nivel` hacia abajo. */
  function borrarDesde(nivel) {
    NIVELES.slice(NIVELES.indexOf(nivel)).forEach(n => { $('grupo-' + n).hidden = true; });
    if (NIVELES.indexOf(nivel) <= NIVELES.indexOf('medico')) $('opciones-medico').replaceChildren();
    if (NIVELES.indexOf(nivel) <= NIVELES.indexOf('sede')) {
      $('opciones-sede').replaceChildren();
      $('medico-precio').hidden = true;
    }
    if (NIVELES.indexOf(nivel) <= NIVELES.indexOf('dia')) {
      $('opciones-dia').replaceChildren();
      $('sin-horarios').hidden = true;
      pedidoActual++;
    }
    if (NIVELES.indexOf(nivel) <= NIVELES.indexOf('hora')) $('opciones-hora').replaceChildren();
    errorDeCampo(form, 'compromisoPago', '');
  }

  // ─── Mostrar el paso ─────────────────────────────────────────────────────

  async function preparar() {
    $('medico-agendado').hidden = true;
    form.hidden = true;
    if (tieneCitaMedica()) return mostrarAgendado();

    $('medico-cargando').hidden = false;
    try {
      if (!opciones || opcionesDelToken !== estado.token) {
        opciones = await Api.llamar('opcionesMedico', {}, estado.token);
        opcionesDelToken = estado.token;
        form.reset();
        borrarDesde('medico');
        pintarTipos();
      }
      if (!opciones.medicos.length) {
        mostrarAviso('En este momento no hay agenda disponible. Escribinos por WhatsApp y te ayudamos.', 'info');
        return;
      }
      form.hidden = false;
    } catch (error) {
      manejarError(error);
    } finally {
      $('medico-cargando').hidden = true;
    }
  }

  function mostrarAgendado() {
    form.hidden = true;
    $('medico-agendado').hidden = false;
    pintarCita('medico-cita', 'medico');
    const s = estado.seguimiento || {};
    $('medico-pago').hidden = !s.linkComprobante;
    $('medico-pago-precio').textContent = s.precioMedico || '';
    if (s.linkComprobante) $('medico-pago-link').href = s.linkComprobante;
  }

  // ─── Cada elección ───────────────────────────────────────────────────────

  function pintarTipos() {
    $('opciones-tipo').replaceChildren(...opciones.tipos.map(t =>
      crearOpcion('tipoConsulta', t.id, t.nombre, t.duracion + ' min · ' + t.ayuda)));
  }

  function pintarMedicos() {
    $('grupo-medico').hidden = false;
    $('nota-medico-fijo').hidden = !opciones.medicoFijo;
    $('opciones-medico').replaceChildren(...opciones.medicos.map(m => crearOpcion('medico', m.id, m.nombre)));
    elegirUnicaOpcion($('opciones-medico'));
  }

  function pintarSedes() {
    const medico = opciones.medicos.find(m => m.id === elegido('medico'));
    $('grupo-sede').hidden = false;
    $('opciones-sede').replaceChildren(...medico.sedes.map(nombre => {
      const sede = opciones.sedes.find(s => s.nombre === nombre);
      return crearOpcion('sede', nombre, nombre, sede ? sede.direccion : '');
    }));
    elegirUnicaOpcion($('opciones-sede'));
  }

  function mostrarPrecio() {
    const tipo = opciones.tipos.find(t => t.id === elegido('tipoConsulta'));
    const precio = tipo && tipo.precios && tipo.precios[elegido('sede') === 'Online' ? 'online' : 'presencial'];
    $('medico-precio').hidden = !precio;
    if (!precio) return;
    $('medico-precio').replaceChildren('Valor de la consulta: ');
    const fuerte = document.createElement('strong');
    fuerte.textContent = '$ ' + formatoNumero.format(precio);
    $('medico-precio').append(fuerte);
  }

  async function cargarDias() {
    $('grupo-dia').hidden = false;
    $('dias-cargando').hidden = false;
    const numero = ++pedidoActual;
    try {
      const r = await Api.llamar('disponibilidadMedico', {
        tipoConsulta: elegido('tipoConsulta'), medico: elegido('medico'), sede: elegido('sede'),
      }, estado.token);
      if (numero !== pedidoActual) return;   // el cliente ya cambió la elección
      dias = r.dias;
      pintarDias();
    } catch (error) {
      if (numero === pedidoActual) manejarError(error);
    } finally {
      if (numero === pedidoActual) $('dias-cargando').hidden = true;
    }
  }

  function pintarDias() {
    $('sin-horarios').hidden = dias.length > 0;
    $('opciones-dia').replaceChildren(...dias.map(d => {
      const fecha = new Date(d.fecha + 'T12:00:00Z');
      return crearOpcion('dia', d.fecha, String(fecha.getUTCDate()), formatoDia.format(fecha).replace('.', ''), 'chip');
    }));
    const primero = $('opciones-dia').querySelector('input');
    if (primero) {
      primero.checked = true;
      pintarHoras();
    }
  }

  function pintarHoras() {
    const dia = dias.find(d => d.fecha === elegido('dia'));
    $('grupo-hora').hidden = false;
    $('grupo-confirmar').hidden = true;
    $('opciones-hora').replaceChildren(...(dia ? dia.horarios : []).map(h => crearOpcion('hora', h, h, '', 'chip')));
  }

  form.addEventListener('change', e => {
    ocultarAviso();
    switch (e.target.name) {
      case 'tipoConsulta': borrarDesde('medico'); pintarMedicos(); break;
      case 'medico': borrarDesde('sede'); pintarSedes(); break;
      case 'sede': borrarDesde('dia'); mostrarPrecio(); cargarDias(); break;
      case 'dia': borrarDesde('hora'); pintarHoras(); break;
      case 'hora': $('grupo-confirmar').hidden = false; break;
      case 'compromisoPago': errorDeCampo(form, 'compromisoPago', ''); break;
    }
  });

  // ─── Confirmar ───────────────────────────────────────────────────────────

  form.addEventListener('submit', async e => {
    e.preventDefault();
    ocultarAviso();
    if (!elegido('hora')) return mostrarAviso('Elegí día y hora.');
    if (!errorDeCampo(form, 'compromisoPago', form.elements.compromisoPago.checked ? '' :
      'Para reservar tenés que marcar el compromiso de pago.')) return;

    try {
      const r = await conCarga(form.querySelector('button[type=submit]'), () => Api.llamar('reservarMedico', {
        tipoConsulta: elegido('tipoConsulta'),
        medico: elegido('medico'),
        sede: elegido('sede'),
        fecha: elegido('dia'),
        hora: elegido('hora'),
        compromisoPago: true,
      }, estado.token));
      estado.seguimiento = r.seguimiento;
      guardar();
      mostrarAgendado();
      window.scrollTo(0, 0);
    } catch (error) {
      if (error.codigo === 'HORARIO_OCUPADO') {
        mostrarAviso(error.message);
        borrarDesde('dia');
        cargarDias();
      } else {
        manejarError(error);
      }
    }
  });

  $('ir-a-nutri').addEventListener('click', () => irA('nutri'));

  return { preparar: preparar };
})();
