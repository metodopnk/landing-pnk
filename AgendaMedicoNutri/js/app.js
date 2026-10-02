/**
 * app.js — Navegación entre pasos y formularios.
 *
 * Reglas de orden (también las controla el backend, esto es para la vista):
 *   datos        → necesita haber pasado el acceso
 *   médico       → necesita los datos confirmados
 *   nutricionista→ necesita una cita médica confirmada
 *   confirmación → necesita las dos citas
 * Si se intenta llegar a un paso no permitido (botón "atrás", recargar la
 * página, etc.) se muestra el paso más avanzado al que sí puede ir.
 */

const PASOS = ['acceso', 'datos', 'medico', 'nutri', 'confirmacion'];
const TEXTO_PASO = {
  acceso: 'Acceso',
  datos: 'Paso 1 de 4 · Tus datos',
  medico: 'Paso 2 de 4 · Médico',
  nutri: 'Paso 3 de 4 · Nutricionista',
  confirmacion: 'Paso 4 de 4 · Confirmación',
};
const CLAVE_GUARDADO = 'agendaPnk';

// ─── Estado (se guarda en la pestaña para sobrevivir a una recarga) ────────

const estado = Object.assign(estadoInicial(), leerGuardado());

function estadoInicial() {
  return { paso: 'acceso', token: null, retoId: null, cliente: null, seguimiento: null, datosConfirmados: false };
}

function leerGuardado() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_GUARDADO)) || {}; } catch (e) { return {}; }
}

function guardar() {
  try { sessionStorage.setItem(CLAVE_GUARDADO, JSON.stringify(estado)); } catch (e) { /* modo privado: sin recarga */ }
}

function reiniciar() {
  Object.assign(estado, estadoInicial());
  guardar();
}

// Un "ciclo" está activo mientras alguna de sus dos citas sea a futuro.
// Si las dos ya pasaron, el cliente puede agendar un ciclo nuevo.
const enElFuturo = iso => Boolean(iso) && new Date(iso).getTime() > Date.now();
const cicloActivo = () => Boolean(estado.seguimiento) &&
  ['fechaMedico', 'fechaNutri', 'fechaControl', 'fechaNutriControl'].some(k => enElFuturo(estado.seguimiento[k]));
const tieneCitaMedica = () => cicloActivo() && Boolean(estado.seguimiento.fechaMedico);
const tieneCitaNutri = () => cicloActivo() && Boolean(estado.seguimiento.fechaNutri);

// ─── Navegación ────────────────────────────────────────────────────────────

function puedeIr(paso) {
  switch (paso) {
    case 'acceso': return true;
    case 'datos': return Boolean(estado.token);
    case 'medico': return Boolean(estado.token && estado.datosConfirmados);
    case 'nutri': return Boolean(estado.token && tieneCitaMedica());
    case 'confirmacion': return Boolean(estado.token && tieneCitaMedica() && tieneCitaNutri());
    default: return false;
  }
}

/** El paso más avanzado al que el cliente puede ir ahora. */
function pasoRecomendado() {
  if (puedeIr('confirmacion')) return 'confirmacion';
  if (puedeIr('nutri')) return 'nutri';
  if (puedeIr('medico')) return 'medico';
  if (puedeIr('datos')) return 'datos';
  return 'acceso';
}

function irA(paso, { historial = true } = {}) {
  const pedido = paso;
  if (!puedeIr(paso)) paso = pasoRecomendado();
  estado.paso = paso;
  guardar();
  mostrar(paso);
  if (historial) history.pushState({ paso: paso }, '');
  else if (pedido !== paso) history.replaceState({ paso: paso }, '');
}

function mostrar(paso) {
  ocultarAviso();
  document.querySelectorAll('main > section[data-paso]').forEach(s => { s.hidden = s.dataset.paso !== paso; });

  const indice = PASOS.indexOf(paso);
  document.querySelectorAll('.progreso li').forEach((li, i) => {
    li.classList.toggle('hecho', i < indice);
    li.classList.toggle('actual', i === indice);
    if (i === indice) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  document.getElementById('progreso-texto').textContent = TEXTO_PASO[paso];

  if (PREPARAR_PASO[paso]) PREPARAR_PASO[paso]();

  window.scrollTo(0, 0);
  const titulo = document.querySelector('#paso-' + paso + ' h2:not([hidden])');
  if (titulo) titulo.focus({ preventScroll: true });
}

window.addEventListener('popstate', e => irA((e.state && e.state.paso) || 'acceso', { historial: false }));

// Cada paso puede preparar su contenido al mostrarse.
const PREPARAR_PASO = {
  acceso() { mostrarVistaAcceso('documento'); },
  datos() { completarFormularioDatos(); },
  medico() { PasoMedico.preparar(); },
  nutri() { PasoNutri.preparar(); },
  confirmacion() {
    pintarCita('confirmacion-cita-medico', 'medico');
    pintarCita('confirmacion-cita-nutri', 'nutri');
    pintarCita('confirmacion-cita-control', 'control');
    pintarCita('confirmacion-cita-nutri-control', 'nutriControl');
    const s = estado.seguimiento || {};
    document.getElementById('confirmacion-pago').hidden = !s.linkComprobante;
    document.getElementById('confirmacion-pago-precio').textContent = s.precioMedico || '';
    if (s.linkComprobante) document.getElementById('confirmacion-pago-link').href = s.linkComprobante;
  },
};

// ─── Avisos, errores y botones ─────────────────────────────────────────────

function mostrarAviso(texto, tipo) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.className = 'aviso' + (tipo === 'info' ? ' info' : '');
  aviso.hidden = false;
}

function ocultarAviso() {
  document.getElementById('aviso').hidden = true;
}

function errorDeCampo(form, nombre, mensaje) {
  const salida = form.querySelector('[data-error-de="' + nombre + '"]');
  const campo = form.elements[nombre];
  if (salida) salida.textContent = mensaje || '';
  if (campo) campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  return !mensaje;
}

/** Deshabilita el botón y muestra el "cargando" mientras se espera al backend. */
async function conCarga(boton, tarea) {
  boton.disabled = true;
  boton.classList.add('cargando');
  try {
    return await tarea();
  } finally {
    boton.disabled = false;
    boton.classList.remove('cargando');
  }
}

/** Errores que mandan de vuelta al inicio. */
function manejarError(error) {
  if (error.codigo === 'SESION_VENCIDA') {
    reiniciar();
    irA('acceso');
  }
  mostrarAviso(error.message);
}

// ─── Acceso con documento ──────────────────────────────────────────────────

const formDocumento = document.getElementById('form-documento');
const formVerificacion = document.getElementById('form-verificacion');

function mostrarVistaAcceso(vista) {
  document.getElementById('acceso-documento').hidden = vista !== 'documento';
  document.getElementById('acceso-verificacion').hidden = vista !== 'verificacion';
}

function tipoDocumentoElegido() {
  return formDocumento.elements.tipoDocumento.value;
}

formDocumento.addEventListener('change', e => {
  if (e.target.name !== 'tipoDocumento') return;
  const esCedula = tipoDocumentoElegido() === 'CI';
  const campo = formDocumento.elements.documento;
  document.getElementById('documento-etiqueta').textContent = esCedula ? 'Número de cédula' : 'Número de pasaporte';
  campo.placeholder = esCedula ? '1.234.567-8' : 'AB123456';
  campo.inputMode = esCedula ? 'numeric' : 'text';
  errorDeCampo(formDocumento, 'documento', '');
});

formDocumento.addEventListener('submit', async e => {
  e.preventDefault();
  ocultarAviso();
  const tipo = tipoDocumentoElegido();
  const numero = formDocumento.elements.documento.value.trim();
  const valido = tipo === 'CI' ? Validar.cedula(numero) : Validar.pasaporte(numero);
  if (!errorDeCampo(formDocumento, 'documento', valido ? '' :
    (tipo === 'CI' ? 'Revisá la cédula: tiene que tener 7 u 8 números, con el dígito verificador.' : 'Revisá el número de pasaporte.'))) return;

  try {
    const r = await conCarga(e.submitter || formDocumento.querySelector('button'), () =>
      Api.llamar('iniciarAcceso', { tipoDocumento: tipo, documento: numero }));
    reiniciar();
    if (r.encontrado) {
      estado.retoId = r.retoId;
      guardar();
      document.getElementById('mascara-nombre').textContent = r.nombre;
      document.getElementById('mascara-whatsapp').textContent = r.whatsapp;
      formVerificacion.reset();
      errorDeCampo(formVerificacion, 'ultimos4', '');
      mostrarVistaAcceso('verificacion');
      document.querySelector('#acceso-verificacion h2').focus();
    } else {
      estado.token = r.token;
      estado.cliente = { tipoDocumento: r.tipoDocumento, documento: r.documento };
      irA('datos');
      mostrarAviso('No encontramos ese documento. Completá tus datos para continuar.', 'info');
    }
  } catch (error) {
    manejarError(error);
  }
});

formVerificacion.addEventListener('submit', async e => {
  e.preventDefault();
  ocultarAviso();
  const ultimos4 = Validar.soloDigitos(formVerificacion.elements.ultimos4.value);
  if (!errorDeCampo(formVerificacion, 'ultimos4', ultimos4.length === 4 ? '' : 'Escribí los 4 números.')) return;

  try {
    const r = await conCarga(formVerificacion.querySelector('button[type=submit]'), () =>
      Api.llamar('verificarAcceso', { retoId: estado.retoId, ultimos4: ultimos4 }));
    estado.retoId = null;
    estado.token = r.token;
    estado.cliente = r.cliente;
    estado.seguimiento = r.seguimiento;
    estado.datosConfirmados = tieneCitaMedica();   // si ya tiene cita, no hace falta re-confirmar datos
    irA(pasoRecomendado());
  } catch (error) {
    if (error.codigo === 'RETO_VENCIDO' || error.codigo === 'BLOQUEADO') {
      mostrarVistaAcceso('documento');
      mostrarAviso(error.message);
    } else if (error.codigo === 'NO_COINCIDE') {
      errorDeCampo(formVerificacion, 'ultimos4', error.message);
      formVerificacion.elements.ultimos4.select();
    } else {
      manejarError(error);
    }
  }
});

document.getElementById('otro-documento').addEventListener('click', () => {
  reiniciar();
  formDocumento.reset();
  mostrarVistaAcceso('documento');
  formDocumento.elements.documento.focus();
});

// ─── 1. Tus datos ──────────────────────────────────────────────────────────

const formDatos = document.getElementById('form-datos');

function completarFormularioDatos() {
  const c = estado.cliente || {};
  const campos = formDatos.elements;
  campos.nombre.value = c.nombre || '';
  campos.apellido.value = c.apellido || '';
  campos.documento.value = c.documento || '';
  campos.whatsapp.value = Validar.telefonoLocal(c.whatsapp);
  campos.email.value = c.email || '';
  document.getElementById('datos-documento-etiqueta').textContent = c.tipoDocumento === 'Pasaporte' ? 'Pasaporte' : 'Cédula';
  document.getElementById('datos-ayuda').textContent = c.nombre
    ? 'Revisá que tus datos estén bien. Si algo cambió, corregilo.'
    : 'Completá tus datos. Usá el mismo nombre y email cuando reserves con la nutricionista.';
  ['nombre', 'apellido', 'whatsapp', 'email'].forEach(n => errorDeCampo(formDatos, n, ''));
}

formDatos.addEventListener('submit', async e => {
  e.preventDefault();
  ocultarAviso();
  const campos = formDatos.elements;
  const datos = {
    nombre: campos.nombre.value.trim(),
    apellido: campos.apellido.value.trim(),
    whatsapp: campos.whatsapp.value.trim(),
    email: campos.email.value.trim(),
  };
  const ok = [
    errorDeCampo(formDatos, 'nombre', datos.nombre ? '' : 'Escribí tu nombre.'),
    errorDeCampo(formDatos, 'apellido', datos.apellido ? '' : 'Escribí tu apellido.'),
    errorDeCampo(formDatos, 'whatsapp', Validar.telefono(datos.whatsapp) ? '' : 'Escribilo así: 099 123 456.'),
    errorDeCampo(formDatos, 'email', Validar.email(datos.email) ? '' : 'Revisá el email.'),
  ].every(Boolean);
  if (!ok) {
    formDatos.querySelector('[aria-invalid="true"]').focus();
    return;
  }

  try {
    const r = await conCarga(formDatos.querySelector('button[type=submit]'), () =>
      Api.llamar('guardarDatos', datos, estado.token));
    estado.cliente = r.cliente;
    estado.datosConfirmados = true;
    irA('medico');
  } catch (error) {
    manejarError(error);
  }
});

// ─── Opciones elegibles (tarjetas y chips de día/hora) ──────────────────────

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

// ─── Tarjetas de resumen de citas ──────────────────────────────────────────

const formatoFecha = new Intl.DateTimeFormat('es-UY', {
  timeZone: CONFIG.ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

/** Datos de cada tipo de tarjeta de cita. */
const TARJETAS_CITA = {
  medico: s => ({
    titulo: 'Tu cita con el médico', fecha: s.fechaMedico, meet: s.linkMeet,
    lineas: [s.medico, s.sede, s.tipoConsulta],
  }),
  nutri: s => ({
    titulo: 'Tu cita con la nutricionista', fecha: s.fechaNutri,
    lineas: ['Verónica Bitz', s.servicioNutri, s.modalidadNutri],
  }),
  control: s => ({
    titulo: 'Tu control con el médico', fecha: s.fechaControl, meet: s.linkMeetControl,
    lineas: [s.medico, s.sede, 'Seguimiento (control a 15 días)'],
  }),
  nutriControl: s => ({
    titulo: 'Tu control con la nutricionista', fecha: s.fechaNutriControl,
    lineas: ['Verónica Bitz', s.servicioNutriControl],
    nota: 'Te confirmamos este horario por WhatsApp.',
  }),
};

function pintarCita(idContenedor, tipo) {
  const contenedor = document.getElementById(idContenedor);
  contenedor.replaceChildren();
  if (!estado.seguimiento) return;
  const cita = TARJETAS_CITA[tipo](estado.seguimiento);
  if (!cita.fecha) return;

  const agregar = (etiqueta, texto, clase) => {
    const el = document.createElement(etiqueta);
    el.textContent = texto;
    if (clase) el.className = clase;
    contenedor.append(el);
    return el;
  };
  agregar('h3', cita.titulo);
  agregar('p', formatoFecha.format(new Date(cita.fecha)) + ' h', 'fecha');
  cita.lineas.filter(Boolean).forEach(texto => agregar('p', texto));

  if (cita.meet) {
    const a = document.createElement('a');
    a.href = cita.meet;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Link de la videollamada';
    agregar('p', '').append(a);
  }
  if (cita.nota) agregar('p', cita.nota, 'nota');
}

// ─── Arranque ──────────────────────────────────────────────────────────────

const pasoInicial = puedeIr(estado.paso) ? estado.paso : pasoRecomendado();
estado.paso = pasoInicial;
history.replaceState({ paso: pasoInicial }, '');
mostrar(pasoInicial);
