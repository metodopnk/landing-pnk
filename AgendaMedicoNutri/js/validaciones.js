/**
 * validaciones.js — Revisa los datos en el celular antes de mandarlos,
 * para avisar al instante. El backend vuelve a revisar todo igual.
 */
const Validar = {
  soloDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  },

  /** Cédula uruguaya con o sin puntos y guion: 7 u 8 dígitos y dígito verificador correcto. */
  cedula(texto) {
    const digitos = Validar.soloDigitos(texto);
    if (digitos.length < 7 || digitos.length > 8) return false;
    const n = digitos.padStart(8, '0');
    const pesos = [2, 9, 8, 7, 6, 3, 4];
    const suma = pesos.reduce((total, peso, i) => total + peso * Number(n[i]), 0);
    return (10 - (suma % 10)) % 10 === Number(n[7]);
  },

  pasaporte(texto) {
    const limpio = String(texto || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    return limpio.length >= 5 && limpio.length <= 15;
  },

  /** Devuelve el WhatsApp como +59899123456, o '' si no es válido. */
  telefono(valor) {
    const texto = String(valor || '').trim();
    const d = Validar.soloDigitos(texto);
    if (/^5989\d{7}$/.test(d)) return '+' + d;
    if (/^09\d{7}$/.test(d)) return '+598' + d.slice(1);
    if (/^9\d{7}$/.test(d)) return '+598' + d;
    if (texto.startsWith('+') && d.length >= 8 && d.length <= 15 && !d.startsWith('598')) return '+' + d;
    return '';
  },

  email(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || '').trim());
  },

  /** "+59899123456" → "099 123 456" (para mostrar). */
  telefonoLocal(valor) {
    const d = Validar.soloDigitos(valor);
    if (/^5989\d{7}$/.test(d)) {
      const local = '0' + d.slice(3);
      return local.slice(0, 3) + ' ' + local.slice(3, 6) + ' ' + local.slice(6);
    }
    return valor || '';
  },
};
