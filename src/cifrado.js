// Cifrado de los datos con una clave (AES-GCM de 256 bits, clave derivada con PBKDF2-SHA256).
// Solo usa la criptografía del navegador (WebCrypto): no hay librerías ni servicios externos.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const ITERACIONES = 310000;
export const FORMATO = 'tecnoriv-cifrado';

function aB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const desdeB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function hayCriptografia() {
  return !!(window.crypto && crypto.subtle && window.isSecureContext);
}

async function derivar(clave, sal, iteraciones) {
  const base = await crypto.subtle.importKey('raw', enc.encode(clave.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
  );
}

export async function cifrar(objeto, clave, { prueba = false } = {}) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await derivar(clave, sal, ITERACIONES);
  const datos = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(objeto)));
  const paquete = {
    formato: FORMATO, v: 1, kdf: 'PBKDF2-SHA256', cifra: 'AES-GCM-256', iteraciones: ITERACIONES,
    sal: aB64(sal), iv: aB64(iv), datos: aB64(datos), creado: new Date().toISOString(),
  };
  if (prueba) paquete.prueba = true;
  return paquete;
}

export function claveDelPaquete(paquete, clave) {
  return derivar(clave, desdeB64(paquete.sal), paquete.iteraciones || ITERACIONES);
}

// Falla con un error si la clave no corresponde (AES-GCM verifica la integridad).
export async function descifrarCon(paquete, k) {
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: desdeB64(paquete.iv) }, k, desdeB64(paquete.datos));
  return JSON.parse(dec.decode(plano));
}

export async function exportarClave(k) { return aB64(await crypto.subtle.exportKey('raw', k)); }
export function importarClave(texto) { return crypto.subtle.importKey('raw', desdeB64(texto), { name: 'AES-GCM' }, true, ['decrypt']); }
