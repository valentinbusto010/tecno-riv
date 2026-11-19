// Datos en vivo: inicia sesión en Supabase (base del bot) y trae la función maqueta_datos.
// Sin librerías: usa directamente la API de Supabase con fetch.
import { SUPABASE } from './config.js';

const SESION = 'tr-sesion-v1';
const ULTIMOS = 'tr-ultimos-datos-v1';

// Solo para probar en la PC: ?servidor=http://localhost:1 simula que no hay conexión.
const servidorPrueba = location.hostname === 'localhost' ? new URLSearchParams(location.search).get('servidor') : null;
const BASE = servidorPrueba || SUPABASE.url;

export class SinConexion extends Error {}
export class SesionInvalida extends Error {}

const leer = (k, almacen = localStorage) => { try { return JSON.parse(almacen.getItem(k) || 'null'); } catch { return null; } };
const guardar = (k, v, almacen = localStorage) => { try { almacen.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const borrar = (k) => { try { localStorage.removeItem(k); } catch { /* nada */ } try { sessionStorage.removeItem(k); } catch { /* nada */ } };
const sesionGuardada = () => leer(SESION) || leer(SESION, sessionStorage);

async function pedir(ruta, { cuerpo, token } = {}) {
  let r;
  try {
    r = await fetch(BASE + ruta, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: SUPABASE.clave, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo ?? {}),
    });
  } catch {
    throw new SinConexion('No hay conexión con el servidor.');
  }
  let datos = null;
  try { datos = await r.json(); } catch { /* respuesta vacía */ }
  return { ok: r.ok, status: r.status, datos };
}

let sesion = null; // { token, refresco, vence, email, recordar } en memoria

function guardarSesion(d, recordar) {
  sesion = { token: d.access_token, refresco: d.refresh_token, vence: Date.now() + (Number(d.expires_in || 3600) - 60) * 1000, email: d.user?.email || '', recordar };
  borrar(SESION);
  // Recordada: queda en el dispositivo. Sin recordar: solo mientras esté abierta esta pestaña.
  guardar(SESION, { refresco: sesion.refresco, email: sesion.email, recordar }, recordar ? localStorage : sessionStorage);
}

export const haySesionGuardada = () => !!sesionGuardada()?.refresco;
export const emailGuardado = () => sesionGuardada()?.email || '';
export const ultimosGuardados = () => leer(ULTIMOS);

export async function entrar(email, contrasena, recordar) {
  const r = await pedir('/auth/v1/token?grant_type=password', { cuerpo: { email, password: contrasena } });
  if (!r.ok) {
    throw new SesionInvalida(r.status === 400 || r.status === 401
      ? 'El email o la contraseña no son correctos.'
      : `No se pudo iniciar sesión (error ${r.status}).`);
  }
  guardarSesion(r.datos, recordar);
}

async function renovar() {
  const g = sesionGuardada();
  if (!g?.refresco) throw new SesionInvalida('Iniciá sesión para ver los datos.');
  const r = await pedir('/auth/v1/token?grant_type=refresh_token', { cuerpo: { refresh_token: g.refresco } });
  if (!r.ok) { borrar(SESION); throw new SesionInvalida('La sesión se cerró. Iniciá sesión de nuevo.'); }
  guardarSesion(r.datos, g.recordar);
}

export async function traerDatos() {
  if (!sesion || Date.now() > sesion.vence) await renovar();
  let r = await pedir(`/rest/v1/rpc/${SUPABASE.funcion}`, { token: sesion.token });
  if (r.status === 401) { await renovar(); r = await pedir(`/rest/v1/rpc/${SUPABASE.funcion}`, { token: sesion.token }); }
  if (r.status === 401 || r.status === 403) {
    throw new SesionInvalida(r.status === 403 ? 'Este usuario no tiene acceso a los datos de Tecno Riv.' : 'Iniciá sesión de nuevo.');
  }
  if (!r.ok || !r.datos) throw new Error(`El servidor respondió con un error (${r.status}).`);
  // Copia para abrir sin internet, solo si la sesión está recordada en este dispositivo.
  if (sesion.recordar) guardar(ULTIMOS, { guardado: new Date().toISOString(), datos: r.datos });
  return r.datos;
}

export async function salir() {
  const token = sesion?.token;
  borrar(SESION); borrar(ULTIMOS); sesion = null;
  if (token) await pedir('/auth/v1/logout', { token }).catch(() => {});
}
