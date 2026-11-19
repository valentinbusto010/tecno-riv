// Une las tres capas: datos → cálculos → escena y tarjetas.
import { cargarDatos } from './datos.js';
import { calcularMetricas, calcularMeta, ventasNuevas, primerDiaDatos, sumarDias, agruparVentas, indiceContactos } from './calculos.js';
import { PERIODOS, PERIODO_INICIAL, REFRESCO_MS } from './config.js';
import { OBJETOS, ETIQUETA_ESTADO, FILTROS_STOCK, construirTarjeta, resumenObjeto, etiquetaPeriodo, etiquetaBotonMes, kpis } from './tarjetas.js';
import { fechaHora, fecha, fechaCorta, pesos, plural } from './formato.js';

const $ = (s) => document.querySelector(s);
function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'onclick') e.addEventListener('click', v);
    else e.setAttribute(k, v);
  }
  for (const h of hijos) if (h) e.append(h);
  return e;
}
const SVG = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const MONEDAS = { ARS: 'Pesos argentinos (ARS)' };
const esMovil = () => matchMedia('(max-width: 720px)').matches;

const estado = {
  datos: null, periodo: PERIODO_INICIAL, m: null, ref: null,
  escena: null, abierta: null, foco: null, movimiento: true, noche: false,
  tour: null, filtroStock: null, tab: 'local',
  // modo: 'copia' (archivos locales), 'cifrado', 'vivo' o 'sin_conexion' (última copia guardada)
  modo: 'copia', guardado: null, vivo: null, ultimaCarga: 0, actualizando: false,
  pendiente: null, // zona a la que vas caminando; su tarjeta se abre al llegar
  // Máquina del tiempo: día elegido, días con datos y lo que pasó cada día
  dia: null, dias: [], diario: new Map(), reproduciendo: 0,
  sonido: false, manejo: false, cerca: null,
};

const CLAVE_GUARDADA = 'tr-clave-v1';
const CLAVE_VISTOS = 'tr-pedidos-vistos-v1';
const CLAVE_SONIDO = 'tr-sonido-v1';
const claveMeta = (mes) => `tr-meta-${mes}`;
const claveFestejo = (mes) => `tr-meta-festejada-${mes}`;
const esLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

// El almacenamiento puede no estar (modo privado, permisos): nunca rompe la app.
function leer(clave) { try { return localStorage.getItem(clave); } catch { return null; } }
function guardar(clave, valor) { try { if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } }

// Pide la clave para abrir los datos cifrados de la versión publicada.
async function pedirClave(paquete) {
  const cif = await import('./cifrado.js');
  if (!cif.hayCriptografia()) throw new Error('Este navegador no permite abrir datos cifrados (hace falta https).');
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_GUARDADA) || 'null');
    if (g && g.sal === paquete.sal) return await cif.descifrarCon(paquete, await cif.importarClave(g.k));
  } catch { /* la clave recordada ya no sirve: se pide de nuevo */ }

  $('#arranque').hidden = true;
  const panel = $('#candado'), form = $('#candado-form'), campo = $('#candado-clave'), error = $('#candado-error'), boton = $('#candado-abrir');
  panel.hidden = false;
  document.body.classList.add('bloqueada');
  campo.focus();
  campo.addEventListener('input', () => { error.hidden = true; });
  return new Promise((resolver) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clave = campo.value;
      if (!clave) { error.textContent = 'Escribí la clave.'; error.hidden = false; return; }
      boton.disabled = true; boton.textContent = 'Abriendo…';
      try {
        const k = await cif.claveDelPaquete(paquete, clave);
        const datos = await cif.descifrarCon(paquete, k);
        if ($('#candado-recordar').checked) {
          try { localStorage.setItem(CLAVE_GUARDADA, JSON.stringify({ sal: paquete.sal, k: await cif.exportarClave(k) })); } catch { /* sin almacenamiento: se pedirá la próxima vez */ }
        }
        campo.value = '';
        panel.hidden = true;
        document.body.classList.remove('bloqueada');
        resolver(datos);
      } catch {
        error.textContent = 'La clave no es correcta. Revisala y probá de nuevo.';
        error.hidden = false;
        boton.disabled = false; boton.textContent = 'Abrir';
        campo.select();
      }
    });
  });
}

function registrarApp() {
  // Solo en la versión publicada: deja la app lista para instalar y usar sin internet.
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('No se pudo preparar el uso sin internet:', e));
}

// Datos en vivo: usa la sesión guardada o pide email y contraseña. Sin internet, muestra la última copia.
async function conectarVivo() {
  const vivo = await import('./vivo.js');
  estado.vivo = vivo;
  if (vivo.haySesionGuardada()) {
    try {
      return { datos: await vivo.traerDatos(), modo: 'vivo' };
    } catch (e) {
      if (e instanceof vivo.SinConexion) {
        const u = vivo.ultimosGuardados();
        if (u) return { datos: u.datos, modo: 'sin_conexion', guardado: u.guardado };
        throw new Error('No hay conexión y en este dispositivo todavía no hay datos guardados.');
      }
      if (!(e instanceof vivo.SesionInvalida)) throw e;
      return pedirIngreso(vivo, e.message);
    }
  }
  return pedirIngreso(vivo, '');
}

function pedirIngreso(vivo, motivo) {
  $('#arranque').hidden = true;
  const panel = $('#acceso'), form = $('#acceso-form'), email = $('#acceso-email'), contrasena = $('#acceso-contrasena');
  const error = $('#acceso-error'), boton = $('#acceso-entrar');
  panel.hidden = false;
  document.body.classList.add('bloqueada');
  email.value = vivo.emailGuardado();
  if (motivo) { error.textContent = motivo; error.hidden = false; }
  (email.value ? contrasena : email).focus();
  for (const c of [email, contrasena]) c.addEventListener('input', () => { error.hidden = true; });
  return new Promise((resolver) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!email.value.trim() || !contrasena.value) { error.textContent = 'Escribí tu email y tu contraseña.'; error.hidden = false; return; }
      boton.disabled = true; boton.textContent = 'Entrando…';
      try {
        await vivo.entrar(email.value.trim(), contrasena.value, $('#acceso-recordar').checked);
        const datos = await vivo.traerDatos();
        contrasena.value = '';
        panel.hidden = true;
        document.body.classList.remove('bloqueada');
        resolver({ datos, modo: 'vivo' });
      } catch (err) {
        error.textContent = err instanceof vivo.SinConexion ? 'No hay conexión. Conectate a internet para entrar la primera vez.' : err.message;
        error.hidden = false;
        boton.disabled = false; boton.textContent = 'Entrar';
      }
    });
  });
}

// Vuelve a traer los datos en vivo y redibuja todo sin perder lo que estás mirando.
async function actualizar({ silencioso = false } = {}) {
  if (!estado.vivo || estado.actualizando) return;
  estado.actualizando = true;
  const boton = $('#btn-actualizar');
  boton.disabled = true; boton.textContent = 'Actualizando…';
  try {
    const antes = estado.datos;
    const datos = await estado.vivo.traerDatos();
    estado.modo = 'vivo'; estado.guardado = null;
    aplicarDatos(datos);
    avisarVentas(ventasNuevas(antes, datos));
    recordarVistos();
  } catch (e) {
    if (e instanceof estado.vivo.SesionInvalida) { location.reload(); return; }
    if (!silencioso) mostrarAviso(e instanceof estado.vivo.SinConexion ? 'Sin conexión: se siguen mostrando los últimos datos.' : e.message);
    if (e instanceof estado.vivo.SinConexion && estado.modo === 'vivo') { estado.modo = 'sin_conexion'; estado.guardado = new Date(estado.ultimaCarga).toISOString(); pintarModo(); }
  } finally {
    estado.actualizando = false;
    boton.disabled = false; boton.textContent = 'Actualizar';
  }
}

function aplicarDatos(datos) {
  estado.datos = datos;
  estado.ultimaCarga = Date.now();
  prepararReferencias();
  pintarMeta();
  pintarModo();
  aplicarPeriodo(estado.periodo);
  armarListaProductos();
  revisarMeta();
}

// Lo que no depende del período: escala de la caja y qué pasó cada día (para la máquina del tiempo).
function prepararReferencias() {
  const todo = calcularMetricas(estado.datos, 'todo');
  estado.ref = { facturacionMax: todo.caja.facturacion };
  const hasta = estado.datos.fuente.cargado_at.slice(0, 10);
  const dias = [];
  for (let d = primerDiaDatos(estado.datos); d <= hasta && dias.length < 1500; d = sumarDias(d, 1)) dias.push(d);
  if (!dias.length) dias.push(hasta);
  estado.dias = dias;
  estado.diario = new Map(dias.map((d) => [d, { ventas: 0, monto: 0, envios: 0 }]));
  for (const v of agruparVentas(estado.datos.pedidos, indiceContactos(estado.datos.clientes))) {
    const d = estado.diario.get(v.fecha);
    if (!d) continue;
    d.ventas += 1; d.monto += v.monto;
    if (v.entrega === 'envio') d.envios += 1;
  }
  if (!estado.dia || !estado.diario.has(estado.dia)) estado.dia = dias.at(-1);
}

// ---------- Ventas nuevas: aviso, monedas en la caja y sonido opcional ----------
function recordarVistos() {
  if (estado.modo !== 'vivo') return;
  guardar(CLAVE_VISTOS, JSON.stringify(estado.datos.pedidos.map((p) => p.id)));
}

// Al entrar: las ventas que llegaron desde la última vez que abriste la app en este dispositivo.
function avisarDesdeUltimaVisita() {
  if (estado.modo !== 'vivo') return;
  let vistos = null;
  try { vistos = JSON.parse(leer(CLAVE_VISTOS) || 'null'); } catch { vistos = null; }
  if (Array.isArray(vistos)) {
    const nuevas = ventasNuevas({ pedidos: vistos.map((id) => ({ id })) }, estado.datos);
    if (nuevas.length) {
      const total = nuevas.reduce((a, v) => a + v.monto, 0);
      avisoFlotante({
        tipo: 'venta', titulo: 'Desde tu última visita',
        texto: `${plural(nuevas.length, 'venta nueva', 'ventas nuevas')} · ${pesos(total)}`,
        accion: { texto: 'Ver caja', fn: () => abrirTarjeta('caja', null, null) },
      });
      estado.escena?.celebrarVenta();
      sonar();
    }
  }
  recordarVistos();
}

function avisarVentas(nuevas) {
  if (!nuevas.length) return;
  if (nuevas.length > 3) {
    const total = nuevas.reduce((a, v) => a + v.monto, 0);
    avisoFlotante({ tipo: 'venta', titulo: `${nuevas.length} ventas nuevas`, texto: pesos(total), accion: { texto: 'Ver caja', fn: () => abrirTarjeta('caja', null, null) } });
  } else {
    for (const v of nuevas) {
      const canal = v.canales.filter((c) => c !== 'sin dato').join(' y ');
      const partes = [pesos(v.monto), plural(v.unidades, 'producto', 'productos')];
      if (canal) partes.push(canal);
      avisoFlotante({ tipo: 'venta', titulo: 'Nueva venta', texto: partes.join(' · '), accion: { texto: 'Ver caja', fn: () => abrirTarjeta('caja', null, null) } });
    }
  }
  estado.escena?.celebrarVenta();
  sonar();
}

// Avisos que aparecen arriba y se van solos. aria-live los lee en voz alta.
function avisoFlotante({ tipo, titulo, texto, accion }) {
  const cont = $('#avisos-flotantes');
  const cerrar = () => { caja.classList.add('saliendo'); setTimeout(() => caja.remove(), estado.movimiento ? 250 : 0); };
  const caja = el('div', { class: `aviso-flotante ${tipo}`, role: 'status' },
    el('span', { class: 'aviso-ico', 'aria-hidden': 'true', text: tipo === 'meta' ? '★' : '$' }),
    el('span', { class: 'aviso-txt' }, el('strong', { text: titulo }), el('span', { text: texto })),
    accion ? el('button', { type: 'button', class: 'aviso-accion', text: accion.texto, onclick: () => { cerrar(); accion.fn(); } }) : null,
    el('button', { type: 'button', class: 'aviso-cerrar', 'aria-label': 'Cerrar aviso', text: '×', onclick: cerrar }));
  cont.append(caja);
  while (cont.children.length > 3) cont.firstElementChild.remove();
  setTimeout(cerrar, 8000);
}

// "Cha-ching" hecho con el navegador (sin archivos de audio). Solo suena si lo activaste.
let audio = null;
function contextoAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audio) audio = new Ctx();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}
function sonar() {
  if (!estado.sonido) return;
  const ctx = contextoAudio();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const salida = ctx.createGain(); salida.gain.value = 0.22; salida.connect(ctx.destination);
  // "cha": golpe de ruido corto, como el cajón que se abre
  const ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
  const canal = ruido.getChannelData(0);
  for (let i = 0; i < canal.length; i++) canal[i] = (Math.random() * 2 - 1) * (1 - i / canal.length);
  const fuente = ctx.createBufferSource(); fuente.buffer = ruido;
  const filtro = ctx.createBiquadFilter(); filtro.type = 'highpass'; filtro.frequency.value = 2500;
  fuente.connect(filtro).connect(salida); fuente.start(t);
  // "ching": dos campanitas metálicas
  for (const [f, desde, vol] of [[1568, 0.09, 0.5], [2093, 0.16, 0.6], [3136, 0.16, 0.18]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + desde);
    g.gain.exponentialRampToValueAtTime(vol, t + desde + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + desde + 0.7);
    o.connect(g).connect(salida); o.start(t + desde); o.stop(t + desde + 0.75);
  }
}

function armarSonido() {
  const b = $('#btn-sonido');
  estado.sonido = leer(CLAVE_SONIDO) === '1';
  const pintar = () => {
    b.setAttribute('aria-pressed', String(estado.sonido));
    const t = estado.sonido ? 'Sonido de ventas nuevas: activado' : 'Sonido de ventas nuevas: apagado';
    b.setAttribute('aria-label', t); b.title = t;
  };
  pintar();
  b.addEventListener('click', () => {
    estado.sonido = !estado.sonido;
    guardar(CLAVE_SONIDO, estado.sonido ? '1' : '0');
    pintar();
    if (estado.sonido) { contextoAudio(); setTimeout(sonar, 60); } // así escuchás cómo suena
  });
  // El navegador solo deja sonar después de que tocás algo: se prepara con el primer toque.
  if (estado.sonido) document.addEventListener('pointerdown', () => contextoAudio(), { once: true });
}

// ---------- Meta del mes ----------
function metaGuardada() {
  const mes = estado.datos.fuente.cargado_at.slice(0, 7);
  return leer(claveMeta(mes)) || '';
}

// Si la meta se cumplió, festeja una sola vez por mes y meta.
function revisarMeta() {
  const t = estado.m?.meta;
  if (!t || !t.alcanzada) return;
  if (leer(claveFestejo(t.mes)) === String(t.meta)) return;
  guardar(claveFestejo(t.mes), String(t.meta));
  estado.escena?.festejarMeta();
  avisoFlotante({ tipo: 'meta', titulo: '¡Meta del mes cumplida!', texto: `Facturaste ${pesos(t.facturado)} de ${pesos(t.meta)}`, accion: { texto: 'Ver meta', fn: () => abrirTarjeta('meta', null, null) } });
  sonar();
}

function formularioMeta(f) {
  const campo = el('input', { id: 'meta-valor', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Ej.: 300.000', 'aria-describedby': 'meta-ayuda meta-error' });
  if (f.valor) campo.value = new Intl.NumberFormat('es-AR').format(f.valor);
  const error = el('p', { class: 'error-meta', id: 'meta-error', hidden: true });
  const form = el('form', { class: 'form-meta', novalidate: '' },
    el('label', { for: 'meta-valor', text: `Tu meta de facturación de ${f.mes}` }),
    el('div', { class: 'fila-meta' }, el('span', { class: 'signo', 'aria-hidden': 'true', text: '$' }), campo,
      el('button', { type: 'submit', class: 'btn primario', text: f.valor ? 'Cambiar' : 'Guardar' })),
    el('p', { class: 'nota-tarjeta', id: 'meta-ayuda', text: 'En pesos, sin centavos. Queda guardada solo en este dispositivo.' }),
    error,
    f.valor ? el('button', { type: 'button', class: 'btn chico', text: 'Borrar meta', onclick: () => { guardarMeta(''); } }) : null);
  campo.addEventListener('input', () => { error.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const limpio = campo.value.replace(/[$\s.]/g, '').replace(/,\d{0,2}$/, '');
    const n = Number(limpio);
    if (!limpio || !/^\d+$/.test(limpio) || !(n > 0)) { error.textContent = 'Escribí un número mayor a cero, por ejemplo 300000.'; error.hidden = false; campo.focus(); return; }
    if (n > 1e12) { error.textContent = 'Ese número es demasiado grande.'; error.hidden = false; campo.focus(); return; }
    guardarMeta(String(n));
  });
  return form;
}

function guardarMeta(valor) {
  const mes = estado.datos.fuente.cargado_at.slice(0, 7);
  guardar(claveMeta(mes), valor || null);
  if (!valor) guardar(claveFestejo(mes), null);
  aplicarPeriodo(estado.periodo);
  revisarMeta();
  requestAnimationFrame(() => $('#meta-valor')?.focus({ preventScroll: true }));
}

function mostrarAviso(texto) {
  const a = $('#avisos');
  a.replaceChildren(document.createTextNode(texto));
  a.hidden = false;
  clearTimeout(mostrarAviso.t);
  mostrarAviso.t = setTimeout(() => { a.hidden = true; }, 6000);
}

// Sello de arriba: dice siempre de dónde salen los números.
function pintarModo() {
  const sello = $('#sello-texto'), dt = $('#meta-carga-titulo');
  const f = estado.datos.fuente;
  if (estado.modo === 'vivo') { sello.textContent = 'En vivo'; dt.textContent = 'Actualizado'; }
  else if (estado.modo === 'sin_conexion') { sello.textContent = 'Sin conexión · últimos datos guardados'; dt.textContent = 'Datos del'; }
  else { sello.textContent = 'Copia fija · no es conexión en vivo'; dt.textContent = 'Datos cargados'; }
  $('#meta-carga').textContent = `${fechaHora(f.cargado_at)} (hora de Argentina)`;
  $('.meta .sello').dataset.modo = estado.modo;
}

function textoOrigen() {
  const f = estado.datos.fuente;
  if (estado.modo === 'vivo') return `En vivo, actualizado el ${fechaHora(f.cargado_at)}`;
  if (estado.modo === 'sin_conexion') return `Sin conexión: datos del ${fechaHora(f.cargado_at)}`;
  return `Copia del ${fecha(f.cargado_at)}, no es conexión en vivo`;
}

async function iniciar() {
  let carga;
  try {
    carga = await cargarDatos('./data/', { pedirClave, conectarVivo });
  } catch (e) {
    $('#candado').hidden = true;
    $('#acceso').hidden = true;
    document.body.classList.remove('bloqueada');
    $('#arranque').hidden = false;
    $('#arranque').textContent = `No se pudieron leer los datos: ${e.message}`;
    $('#arranque').classList.add('error');
    return;
  }
  $('#arranque').hidden = true;
  estado.modo = carga.modo;
  estado.guardado = carga.guardado || null;
  if (carga.modo !== 'copia') {
    registrarApp();
    $('#enlace-pruebas').hidden = true;
  }
  if (carga.modo === 'cifrado') {
    $('#bloque-clave').hidden = false;
    $('#olvidar-clave').addEventListener('click', () => {
      try { localStorage.removeItem(CLAVE_GUARDADA); } catch { /* nada guardado */ }
      $('#olvidar-clave').textContent = 'Listo: la próxima vez te va a pedir la clave';
      $('#olvidar-clave').disabled = true;
    });
  }
  if (carga.modo === 'vivo' || carga.modo === 'sin_conexion') {
    $('#btn-actualizar').hidden = false;
    $('#btn-actualizar').addEventListener('click', () => actualizar());
    $('#bloque-sesion').hidden = false;
    $('#sesion-email').textContent = estado.vivo.emailGuardado() || 'tu usuario';
    $('#cerrar-sesion').addEventListener('click', async () => { await estado.vivo.salir(); location.reload(); });
    // Datos frescos al volver a la app y cada tanto mientras está a la vista.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - estado.ultimaCarga > 60 * 1000) actualizar({ silencioso: true });
    });
    setInterval(() => { if (document.visibilityState === 'visible') actualizar({ silencioso: true }); }, REFRESCO_MS);
    window.addEventListener('online', () => actualizar({ silencioso: true }));
  }
  estado.datos = carga.datos;
  estado.ultimaCarga = carga.modo === 'sin_conexion' && carga.guardado ? Date.parse(carga.guardado) : Date.now();
  if (carga.avisos.length) {
    const a = $('#avisos');
    a.hidden = false;
    a.append(el('strong', { text: 'Revisá los datos: ' }), document.createTextNode(carga.avisos.join(' ')));
  }

  pintarMeta();
  pintarModo();
  armarPeriodos();
  armarRotulos();
  armarListaObjetos();
  armarTarjeta();
  armarPestanas();
  prepararReferencias();
  estado.movimiento = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  estado.noche = matchMedia('(prefers-color-scheme: dark)').matches;

  await iniciarEscena();
  armarTiempo();
  aplicarPeriodo(estado.periodo);
  armarListaProductos();
  armarControles();
  armarSonido();
  armarManejo();
  armarTeclado();
  estado.escena?.encender();
  avisarDesdeUltimaVisita();
  revisarMeta();
  if (esLocal) window.__simularVenta = simularVenta;
}

// Solo para probar en la compu (localhost): agrega una venta inventada para ver el aviso. Nunca en la app publicada.
function simularVenta() {
  const base = estado.datos;
  const p = base.productos.find((x) => x.activo && x.stock > 0) || base.productos[0];
  const id = Math.max(...base.pedidos.map((x) => x.id)) + 1;
  const hoy = base.fuente.cargado_at.slice(0, 10);
  const linea = { id, fecha: hoy, cliente_id: null, cliente_clave: `prueba-${id}`, producto_id: p.id, producto: p.nombre, cantidad: 1, monto: p.precio ?? 10000, costo: p.costo ?? null, estado: 'pendiente', canal: 'WhatsApp', pago: 'efectivo', entrega_tipo: 'envio', origen: 'prueba', ref: null };
  const nuevos = { ...base, pedidos: [...base.pedidos, linea] };
  aplicarDatos(nuevos);
  avisarVentas(ventasNuevas(base, nuevos));
  return `Venta de prueba ${id} agregada (solo en esta pestaña).`;
}

function pintarMeta() {
  const f = estado.datos.fuente;
  $('#meta-fuente').textContent = f.bases.map((b) => b.nombre).join(' + ');
  $('#meta-moneda').textContent = MONEDAS[f.moneda] || f.moneda;
  const ul = $('#omitido');
  ul.replaceChildren();
  for (const b of f.bases) for (const [archivo, desc] of Object.entries(b.archivos)) ul.append(el('li', { text: `${b.nombre} → data/${archivo}: ${desc}.` }));
  for (const o of f.omitido) ul.append(el('li', { text: `No incluido: ${o}` }));
}

function armarPeriodos() {
  const cont = $('#periodos');
  const fechaCarga = estado.datos.fuente.cargado_at.slice(0, 10);
  for (const p of PERIODOS) {
    const texto = p.id === 'mes' ? etiquetaBotonMes(fechaCarga) : p.etiqueta;
    cont.append(el('button', { type: 'button', 'data-periodo': p.id, 'aria-pressed': 'false', text: texto, onclick: () => aplicarPeriodo(p.id) }));
  }
}

function armarRotulos() {
  const cont = $('#rotulos');
  for (const o of OBJETOS) {
    cont.append(el('button', {
      type: 'button', class: 'rotulo', 'data-objeto': o.id, 'data-estado': o.estado, tabindex: '-1', 'aria-hidden': 'true',
      onclick: () => abrirTarjeta(o.id, null, null),
    }, el('span', { class: 'rotulo-nombre', text: o.titulo }), el('span', { class: 'rotulo-valor', text: '—' })));
  }
}

function armarListaObjetos() {
  const ul = $('#lista-objetos');
  for (const o of OBJETOS) {
    const btn = el('button', { type: 'button', class: 'item', 'data-objeto': o.id },
      el('span', { class: 'ico', 'data-estado': o.estado, 'aria-hidden': 'true', text: o.titulo.slice(0, 2).toUpperCase() }),
      el('span', { class: 'mid' }, el('span', { class: 't', text: o.titulo }), el('span', { class: 's', text: ETIQUETA_ESTADO[o.estado] })),
      el('span', { class: 'amt valor', text: '—' }));
    btn.addEventListener('click', () => abrirTarjeta(o.id, null, btn));
    ul.append(el('li', {}, btn));
  }
}

function armarListaProductos() {
  const cont = $('#lista-productos');
  cont.replaceChildren();
  for (const cat of estado.m.categorias) {
    const prods = estado.m.productos.filter((p) => p.activo && p.categoria === cat);
    const ul = el('ul', { class: 'botones' });
    for (const p of prods) {
      const btn = el('button', { type: 'button', class: 'btn chico' }, el('span', { class: `punto ${p.estadoStock}`, 'aria-hidden': 'true' }), document.createTextNode(`${p.nombre} · stock ${p.stock}`));
      btn.addEventListener('click', () => abrirTarjeta('productos', p.id, btn));
      ul.append(el('li', {}, btn));
    }
    cont.append(el('details', {}, el('summary', { text: `${cat} (${prods.length})` }), ul));
  }
}

function armarKpis() {
  const cont = $('#kpis');
  cont.replaceChildren();
  for (const k of kpis(estado.m)) {
    cont.append(el('button', { type: 'button', class: `kpi ${k.tono}`, 'data-objeto': k.objeto, onclick: (e) => abrirTarjeta(k.objeto, null, e.currentTarget) },
      el('span', { class: 'k', text: k.etiqueta }), el('span', { class: 'v', text: k.valor }), el('span', { class: 'd', text: k.detalle })));
  }
}

function armarPestanas() {
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => irA(b.dataset.tab));
}
function irA(tab) {
  estado.tab = tab;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  $('#vista-local').hidden = tab !== 'local';
  $('#vista-lista').hidden = tab !== 'lista';
  $('#vista-datos').hidden = tab !== 'datos';
  window.scrollTo({ top: 0 });
}

async function iniciarEscena() {
  const contenedor = $('#escena');
  try {
    // ?sin3d en la dirección fuerza la versión sin 3D, para probarla.
    if (new URLSearchParams(location.search).has('sin3d')) throw new Error('Se pidió la versión sin 3D (?sin3d).');
    const mod = await import('./escena.js');
    if (!mod.soportaWebGL()) throw new Error('El navegador no tiene WebGL activado.');
    estado.escena = mod.crearEscena(contenedor, {
      rotulos: $('#rotulos'),
      alSeleccionar: (id, productoId) => abrirTarjeta(id, productoId ?? null, null),
      alPasar: mostrarGlobo,
      alAcercarse: zonaCerca,
    });
    estado.escena.setMovimiento(estado.movimiento);
    if (estado.noche) estado.escena.setNoche(true);
    // La ayuda se esconde después del primer toque, para no tapar la calle.
    contenedor.addEventListener('pointerdown', () => $('#ayuda').classList.add('oculta'), { once: true });
    contenedor.classList.toggle('noche', estado.noche);
  } catch (e) {
    estado.escena = null;
    contenedor.classList.add('sin-webgl');
    $('#sin-3d').hidden = false;
    $('#sin-3d-detalle').textContent = `Los mismos datos están en la pestaña Lista. Motivo: ${e.message}`;
    for (const s of ['#rotulos', '#ayuda', '#controles-3d', '#btn-recorrido', '#btn-manejar']) $(s).hidden = true;
    console.warn('Maqueta sin 3D:', e);
  }
}

// Globo con el dato al pasar el mouse
function mostrarGlobo(hit, x, y) {
  const g = $('#globo');
  if (!hit) { g.hidden = true; return; }
  let texto;
  if (hit.producto !== undefined) {
    const p = estado.m.productos.find((f) => f.id === hit.producto);
    texto = p ? `${p.nombre} · stock ${p.stock}` : '';
  } else {
    const o = OBJETOS.find((d) => d.id === hit.objeto);
    texto = o ? `${o.titulo} · ${resumenObjeto(o.id, estado.m)}` : '';
  }
  if (!texto) { g.hidden = true; return; }
  g.textContent = texto;
  g.hidden = false;
  const caja = $('#escena');
  const gx = Math.min(x + 14, caja.clientWidth - g.offsetWidth - 8);
  const gy = Math.min(y + 16, caja.clientHeight - g.offsetHeight - 8);
  g.style.transform = `translate(${Math.max(8, gx)}px, ${Math.max(8, gy)}px)`;
}

function aplicarPeriodo(id) {
  if (id !== 'tiempo') pararTiempo();
  estado.periodo = id;
  estado.m = calcularMetricas(estado.datos, id, { dia: estado.dia });
  // La meta es siempre la del mes de la carga, mires el período que mires.
  estado.m.meta = calcularMeta(estado.datos, metaGuardada());
  for (const b of document.querySelectorAll('[data-periodo]')) b.setAttribute('aria-pressed', String(b.dataset.periodo === id));
  $('#tiempo').hidden = id !== 'tiempo';
  if (id === 'tiempo') pintarTiempo();
  $('#meta-periodo').textContent = etiquetaPeriodo(estado.m.rango);
  for (const o of OBJETOS) {
    const texto = resumenObjeto(o.id, estado.m);
    for (const v of document.querySelectorAll(`[data-objeto="${o.id}"] .rotulo-valor, #lista-objetos [data-objeto="${o.id}"] .valor`)) v.textContent = texto;
  }
  armarKpis();
  estado.escena?.actualizar(estado.m, estado.ref);
  if (estado.abierta) pintarTarjeta(estado.abierta.id, estado.abierta.productoId);
}

function armarTarjeta() {
  $('#tarjeta-cerrar').addEventListener('click', cerrarTarjeta);
  $('#tour-anterior').addEventListener('click', () => pasoTour(-1));
  $('#tour-siguiente').addEventListener('click', () => pasoTour(1));
}

// Elegir una zona: en la maqueta, primero caminás hasta ahí y al llegar se abren los datos.
// Desde la pestaña Lista, sin 3D o con las animaciones en pausa, se abre al instante.
function abrirTarjeta(id, productoId, origen, { desdeTour = false } = {}) {
  if (!desdeTour) estado.tour = null;
  if (!estado.abierta && !estado.pendiente) estado.foco = origen || document.activeElement;
  if (estado.abierta?.id === 'productos' && id !== 'productos') aplicarFiltroStock(null);
  if (!estado.escena || estado.tab !== 'local') { mostrarTarjeta(id, productoId); return; }

  // En el celular, la maqueta sube para que se vea la caminata.
  if (esMovil()) $('#escena').scrollIntoView({ block: 'start', behavior: estado.movimiento ? 'smooth' : 'auto' });
  // Si había otra zona abierta, su tarjeta se guarda mientras caminás.
  if (estado.abierta && estado.abierta.id !== id) {
    $('#tarjeta').hidden = true;
    document.body.classList.remove('con-tarjeta');
    estado.escena.deseleccionar();
    estado.abierta = null;
  }
  const pedido = { id, productoId: productoId ?? null };
  estado.pendiente = pedido;
  const nombre = OBJETOS.find((o) => o.id === id)?.titulo || '';
  estado.escena.irA(id, {
    nombre,
    alLlegar: () => {
      if (estado.pendiente !== pedido) return; // elegiste otra zona en el camino
      estado.pendiente = null;
      mostrarTarjeta(id, productoId);
    },
  });
}

function mostrarTarjeta(id, productoId) {
  estado.abierta = { id, productoId };
  pintarTarjeta(id, productoId);
  $('#tarjeta').hidden = false;
  document.body.classList.add('con-tarjeta');
  if (estado.escena) {
    estado.escena.seleccionar(id, productoId ?? undefined);
    // Esperar a que la escena se acomode al lado de la tarjeta antes de enfocar.
    // Manejando, la cámara ya te sigue a vos.
    if (!estado.manejo) requestAnimationFrame(() => estado.escena?.enfocar(id, { subir: esMovil() ? 0.42 : 0 }));
  }
  $('#tarjeta-titulo').focus({ preventScroll: true });
}

function cancelarCaminata() {
  if (!estado.pendiente) return;
  estado.pendiente = null;
  estado.escena?.detenerDuenio();
}

function cerrarTarjeta() {
  cancelarCaminata();
  $('#tarjeta').hidden = true;
  document.body.classList.remove('con-tarjeta');
  aplicarFiltroStock(null);
  estado.tour = null;
  if (estado.escena) { estado.escena.deseleccionar(); if (!estado.manejo) estado.escena.vistaGeneral(); }
  estado.abierta = null;
  if (estado.foco && estado.foco.isConnected && estado.foco !== document.body) estado.foco.focus({ preventScroll: true });
  estado.foco = null;
}

// Recorrido guiado por los objetos del local
function empezarTour() {
  if (estado.tab !== 'local') irA('local');
  estado.foco = document.activeElement;
  estado.tour = 0;
  abrirTarjeta(OBJETOS[0].id, null, null, { desdeTour: true });
}
function pasoTour(d) {
  if (estado.tour === null) return;
  const i = estado.tour + d;
  if (i < 0) return;
  if (i >= OBJETOS.length) { cerrarTarjeta(); return; }
  estado.tour = i;
  abrirTarjeta(OBJETOS[i].id, null, null, { desdeTour: true });
}

function aplicarFiltroStock(filtro) {
  estado.filtroStock = filtro;
  estado.escena?.filtrarProductos(filtro);
}

function pintarTarjeta(id, productoId) {
  const t = construirTarjeta(id, estado.m, { productoId });
  if (!t) return;
  const chip = $('#tarjeta-estado');
  chip.textContent = ETIQUETA_ESTADO[t.estado];
  chip.dataset.estado = t.estado;
  $('#tarjeta-titulo').textContent = t.titulo;
  $('#tarjeta-representa').textContent = t.representa;

  const enTour = estado.tour !== null;
  $('#tarjeta-paso').hidden = !enTour;
  $('#recorrido-nav').hidden = !enTour;
  if (enTour) {
    $('#tarjeta-paso').textContent = `Recorrido · ${estado.tour + 1} de ${OBJETOS.length}`;
    $('#tour-anterior').disabled = estado.tour === 0;
    $('#tour-siguiente').textContent = estado.tour === OBJETOS.length - 1 ? 'Terminar' : 'Siguiente →';
  }

  const cuerpo = [];
  if (t.grafico) cuerpo.push(...dibujarGrafico(t.grafico));
  for (const s of t.secciones || []) {
    if (!s.filas.length) continue;
    if (s.titulo) cuerpo.push(el('h3', { text: s.titulo }));
    const dl = el('dl', { class: 'filas' });
    for (const f of s.filas) dl.append(el('div', {}, el('dt', { text: f.etiqueta }), el('dd', { text: f.valor }), f.nota ? el('span', { class: 'nota', text: f.nota }) : null));
    cuerpo.push(dl);
  }
  for (const l of t.listas || []) {
    cuerpo.push(el('h3', { text: l.titulo }));
    if (!l.items.length) { cuerpo.push(el('p', { class: 'nota-tarjeta', text: 'Ninguno en este período.' })); continue; }
    const ul = el('ul');
    for (const it of l.items) ul.append(el('li', { text: it }));
    cuerpo.push(ul);
  }
  if (t.filtros) {
    cuerpo.push(el('h3', { text: 'Filtrar por stock' }));
    const fc = el('div', { class: 'filtros', role: 'group', 'aria-label': 'Filtrar productos por stock' });
    for (const f of FILTROS_STOCK) {
      fc.append(el('button', { type: 'button', 'aria-pressed': String(estado.filtroStock === f.id), text: f.etiqueta, onclick: () => { aplicarFiltroStock(f.id); pintarTarjeta(id, productoId); } }));
    }
    cuerpo.push(fc);
  }
  for (const g of t.grupos || []) {
    const visibles = g.productos.filter((p) => !estado.filtroStock || p.estado === estado.filtroStock);
    if (!visibles.length) continue;
    cuerpo.push(el('h3', { text: `${g.titulo} (${visibles.length})` }));
    const ul = el('ul', { class: 'botones' });
    for (const p of visibles) {
      ul.append(el('li', {}, el('button', { type: 'button', onclick: () => abrirTarjeta('productos', p.id, null) }, el('span', { class: `punto ${p.estado}`, 'aria-hidden': 'true' }), document.createTextNode(p.texto))));
    }
    cuerpo.push(ul);
  }
  if (t.formMeta) cuerpo.push(formularioMeta(t.formMeta));
  for (const n of t.notas || []) cuerpo.push(el('p', { class: 'nota-tarjeta', text: n }));
  if (t.noDisponible && t.noDisponible.length) {
    const ul = el('ul');
    for (const n of t.noDisponible) ul.append(el('li', { text: n }));
    cuerpo.push(el('div', { class: 'no-disponible' }, el('h3', { text: 'No disponible' }), ul));
  }
  if (t.volver) cuerpo.push(el('button', { type: 'button', class: 'btn volver', text: '← Todos los productos', onclick: () => abrirTarjeta('productos', null, null) }));
  $('#tarjeta-cuerpo').replaceChildren(...cuerpo);

  const f = estado.datos.fuente;
  $('#tarjeta-pie').textContent = `Fuente: ${t.fuente} · Período: ${t.periodo} · Moneda: ${MONEDAS[f.moneda] || f.moneda} · ${textoOrigen()}`;
}

// Gráficos chicos dentro de las tarjetas
function dibujarGrafico(gr) {
  const nodos = [el('h3', { text: gr.titulo })];
  if (gr.tipo === 'barras') {
    const n = gr.datos.length;
    const W = 320, H = 120, abajo = 18, arriba = 6;
    const max = Math.max(...gr.datos.map((d) => d.valor), 1);
    const paso = W / Math.max(n, 1), ancho = Math.max(4, paso * 0.66);
    const lectura = el('p', { class: 'lectura', 'aria-live': 'polite' });
    const mayor = gr.datos.reduce((a, d) => (d.valor > a.valor ? d : a), gr.datos[0] || { valor: 0, texto: '' });
    const textoInicial = mayor && mayor.valor > 0 ? `Mejor día: ${mayor.texto}` : 'Sin ventas en el período.';
    lectura.textContent = textoInicial;
    const svg = svgEl('svg', { class: 'barras', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${gr.titulo}. ${textoInicial}` });
    svg.append(svgEl('line', { class: 'base', x1: 0, x2: W, y1: H - abajo + 0.5, y2: H - abajo + 0.5 }));
    gr.datos.forEach((d, i) => {
      const h = d.valor > 0 ? Math.max(3, (d.valor / max) * (H - abajo - arriba)) : 2;
      const x = i * paso + (paso - ancho) / 2;
      const r = svgEl('rect', { class: d.valor > 0 ? 'barra' : 'barra vacia', x: x.toFixed(1), y: (H - abajo - h).toFixed(1), width: ancho.toFixed(1), height: h.toFixed(1), rx: 2, tabindex: 0, 'aria-label': d.texto });
      const ver = () => { lectura.textContent = d.texto; };
      r.addEventListener('pointerenter', ver); r.addEventListener('focus', ver);
      r.addEventListener('pointerleave', () => { lectura.textContent = textoInicial; });
      svg.append(r);
      const cada = n > 12 ? 3 : n > 9 ? 2 : 1;
      if (i % cada === 0) { const t = svgEl('text', { x: (i * paso + paso / 2).toFixed(1), y: H - 4, 'text-anchor': 'middle' }); t.textContent = d.etiqueta; svg.append(t); }
    });
    nodos.push(lectura, svg);
  } else if (gr.tipo === 'reparto') {
    const barra = el('div', { class: 'reparto', role: 'img', 'aria-label': gr.partes.map((p) => p.texto).join('. ') });
    for (const p of gr.partes) {
      const pct = gr.total > 0 ? (p.valor / gr.total) * 100 : 0;
      if (pct > 0) barra.append(el('span', { class: p.clase, style: `width:${Math.max(pct, 1.5).toFixed(2)}%` }));
    }
    const ley = el('ul', { class: 'leyenda' });
    for (const p of gr.partes) ley.append(el('li', { class: p.clase, text: p.texto }));
    nodos.push(barra, ley);
    if (gr.aviso) nodos.push(el('p', { class: 'nota-tarjeta', text: gr.aviso }));
  }
  return [el('div', { class: 'grafico' }, ...nodos)];
}

function armarControles() {
  $('#btn-recorrido').addEventListener('click', empezarTour);
  if (!estado.escena) return;
  const e = estado.escena;
  $('#btn-girar-izq').addEventListener('click', () => e.girar(-1));
  $('#btn-girar-der').addEventListener('click', () => e.girar(1));
  $('#btn-acercar').addEventListener('click', () => e.zoom(e.obtenerZoom() * 1.25));
  $('#btn-alejar').addEventListener('click', () => e.zoom(e.obtenerZoom() / 1.25));
  $('#btn-centrar').addEventListener('click', () => { if (estado.abierta) cerrarTarjeta(); else cancelarCaminata(); e.centrar(); });
  const noche = $('#btn-noche');
  noche.setAttribute('aria-pressed', String(estado.noche));
  noche.addEventListener('click', alternarNoche);
  const mov = $('#btn-movimiento');
  const pintar = () => {
    mov.setAttribute('aria-pressed', String(!estado.movimiento));
    const t = estado.movimiento ? 'Pausar animaciones' : 'Reanudar animaciones';
    mov.setAttribute('aria-label', t); mov.title = t;
  };
  pintar();
  mov.addEventListener('click', () => { estado.movimiento = !estado.movimiento; e.setMovimiento(estado.movimiento); pintar(); });
}

function alternarNoche() {
  if (!estado.escena) return;
  estado.noche = !estado.noche;
  estado.escena.setNoche(estado.noche);
  $('#escena').classList.toggle('noche', estado.noche);
  $('#btn-noche').setAttribute('aria-pressed', String(estado.noche));
}

// ---------- Máquina del tiempo: el negocio día por día ----------
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
function nombreDia(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fechaCorta(iso)}`;
}

function armarTiempo() {
  const rango = $('#tiempo-dia');
  rango.addEventListener('input', () => { pararTiempo(); irADia(Number(rango.value), false); });
  rango.addEventListener('change', () => irADia(Number(rango.value), true));
  $('#tiempo-play').addEventListener('click', () => (estado.reproduciendo ? pararTiempo() : reproducirTiempo()));
}

// Configura la barra según los días que hay y muestra lo que pasó el día elegido.
function pintarTiempo() {
  const rango = $('#tiempo-dia');
  const i = Math.max(0, estado.dias.indexOf(estado.dia));
  rango.max = String(estado.dias.length - 1);
  rango.value = String(i);
  const d = estado.diario.get(estado.dia) || { ventas: 0, monto: 0, envios: 0 };
  const txtDia = nombreDia(estado.dia);
  $('#tiempo-fecha').textContent = `${txtDia} · día ${i + 1} de ${estado.dias.length}`;
  rango.setAttribute('aria-valuetext', `${txtDia}: ${d.ventas ? `${plural(d.ventas, 'venta', 'ventas')} por ${pesos(d.monto)}` : 'sin ventas'}`);
  const partes = d.ventas ? [`Ese día: ${plural(d.ventas, 'venta', 'ventas')} · ${pesos(d.monto)}`] : ['Ese día: sin ventas'];
  if (d.envios) partes.push(plural(d.envios, 'envío', 'envíos'));
  partes.push(`Acumulado: ${pesos(estado.m.caja.facturacion)}`);
  $('#tiempo-detalle').textContent = partes.join(' · ');
}

function irADia(i, conEfectos) {
  const dia = estado.dias[Math.max(0, Math.min(i, estado.dias.length - 1))];
  const cambio = dia !== estado.dia;
  estado.dia = dia;
  if (cambio || estado.periodo !== 'tiempo') aplicarPeriodo('tiempo');
  if (!conEfectos || !estado.escena) return;
  const d = estado.diario.get(dia);
  if (d?.ventas) estado.escena.celebrarVenta();
  if (d?.envios) estado.escena.envioDelDia();
}

function reproducirTiempo() {
  let i = estado.dias.indexOf(estado.dia);
  if (i < 0 || i >= estado.dias.length - 1) i = -1; // desde el principio
  const boton = $('#tiempo-play');
  boton.setAttribute('aria-label', 'Pausar'); boton.title = 'Pausar';
  boton.classList.add('reproduciendo');
  const paso = () => {
    i += 1;
    irADia(i, true);
    if (i >= estado.dias.length - 1) { pararTiempo(); return; }
    estado.reproduciendo = setTimeout(paso, estado.movimiento ? 1300 : 1800);
  };
  estado.reproduciendo = -1;
  paso();
}

function pararTiempo() {
  if (!estado.reproduciendo) return;
  if (estado.reproduciendo > 0) clearTimeout(estado.reproduciendo);
  estado.reproduciendo = 0;
  const boton = $('#tiempo-play');
  boton.setAttribute('aria-label', 'Reproducir los días'); boton.title = 'Reproducir los días';
  boton.classList.remove('reproduciendo');
}

// ---------- Manejar a tu personaje ----------
const teclas = new Set();
const joy = { x: 0, y: 0 };

function armarManejo() {
  const b = $('#btn-manejar');
  if (!estado.escena) { b.hidden = true; return; }
  // Con el mouse, el botón suelta el foco para que Enter abra la zona y no apague el modo.
  b.addEventListener('click', (e) => { setManejo(!estado.manejo); if (e.detail > 0) b.blur(); });
  $('#abrir-cercana').addEventListener('click', abrirCercana);

  // Joystick: arrastrás la perilla y tu personaje camina para ese lado.
  const base = $('#joystick'), perilla = $('#joystick-perilla');
  let activo = null;
  const mover = (e) => {
    const r = base.getBoundingClientRect();
    const radio = r.width / 2 - 8;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const largo = Math.hypot(dx, dy);
    if (largo > radio) { dx *= radio / largo; dy *= radio / largo; }
    perilla.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / radio; joy.y = -dy / radio;
    enviarDireccion();
  };
  const soltarJoy = (e) => {
    if (activo !== e.pointerId) return;
    activo = null; joy.x = 0; joy.y = 0;
    perilla.style.transform = '';
    enviarDireccion();
  };
  base.addEventListener('pointerdown', (e) => { activo = e.pointerId; base.setPointerCapture(e.pointerId); mover(e); e.preventDefault(); });
  base.addEventListener('pointermove', (e) => { if (activo === e.pointerId) mover(e); });
  base.addEventListener('pointerup', soltarJoy);
  base.addEventListener('pointercancel', soltarJoy);
  // Si la app pierde el foco con una tecla apretada, que no siga caminando sola.
  window.addEventListener('blur', () => { teclas.clear(); joy.x = 0; joy.y = 0; perilla.style.transform = ''; enviarDireccion(); });
}

function setManejo(on) {
  if (!estado.escena || on === estado.manejo) return;
  if (on) {
    if (estado.abierta) cerrarTarjeta(); else cancelarCaminata();
    if (estado.tab !== 'local') irA('local');
  }
  estado.manejo = on;
  teclas.clear(); joy.x = 0; joy.y = 0;
  estado.escena.setManejo(on);
  const b = $('#btn-manejar');
  b.setAttribute('aria-pressed', String(on));
  const t = on ? 'Dejar de manejar' : 'Manejar a tu personaje';
  b.setAttribute('aria-label', t); b.title = t;
  $('#joystick').hidden = !on;
  $('#ayuda-manejo').hidden = !on || matchMedia('(pointer: coarse)').matches;
  $('#escena').classList.toggle('manejando', on);
  $('#ayuda').classList.add('oculta');
  if (on && esMovil()) $('#escena').scrollIntoView({ block: 'start', behavior: estado.movimiento ? 'smooth' : 'auto' });
}

function enviarDireccion() {
  if (!estado.manejo) return;
  const der = (teclas.has('derecha') ? 1 : 0) - (teclas.has('izquierda') ? 1 : 0);
  const arr = (teclas.has('arriba') ? 1 : 0) - (teclas.has('abajo') ? 1 : 0);
  const x = Math.max(-1, Math.min(1, der + joy.x)), y = Math.max(-1, Math.min(1, arr + joy.y));
  // Si te movés vos, se cancela la caminata automática que hubieras pedido tocando una zona.
  if (Math.hypot(x, y) > 0.05 && estado.pendiente) { estado.pendiente = null; }
  estado.escena.setDireccion(x, y);
}

// La escena avisa qué zona tenés al lado (o null).
function zonaCerca(id) {
  estado.cerca = id;
  const b = $('#abrir-cercana');
  if (!id || !estado.manejo) { b.hidden = true; return; }
  const o = OBJETOS.find((x) => x.id === id);
  b.textContent = matchMedia('(pointer: coarse)').matches ? `Abrir ${o.titulo}` : `Abrir ${o.titulo} (Enter)`;
  b.hidden = false;
}

function abrirCercana() {
  if (!estado.cerca) return;
  estado.foco = $('#btn-manejar');
  mostrarTarjeta(estado.cerca, null);
}

const TECLA_DIRECCION = { ArrowUp: 'arriba', w: 'arriba', W: 'arriba', ArrowDown: 'abajo', s: 'abajo', S: 'abajo', ArrowLeft: 'izquierda', a: 'izquierda', A: 'izquierda', ArrowRight: 'derecha', d: 'derecha', D: 'derecha' };

function armarTeclado() {
  document.addEventListener('keyup', (e) => {
    const dir = TECLA_DIRECCION[e.key];
    if (dir && teclas.delete(dir)) enviarDireccion();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && estado.abierta) { cerrarTarjeta(); return; }
    if (e.key === 'Escape' && estado.pendiente) { cancelarCaminata(); return; }
    if (e.key === 'Escape' && estado.manejo) { setManejo(false); return; }
    if (!estado.escena || estado.tab !== 'local' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (estado.manejo) {
      const dir = TECLA_DIRECCION[e.key];
      if (dir) { teclas.add(dir); enviarDireccion(); e.preventDefault(); return; }
      if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && estado.cerca && !e.target.closest('button, a')) { abrirCercana(); e.preventDefault(); return; }
    }
    if (e.key === 'ArrowLeft') { estado.escena.girar(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { estado.escena.girar(1); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') estado.escena.zoom(estado.escena.obtenerZoom() * 1.25);
    else if (e.key === '-' || e.key === '_') estado.escena.zoom(estado.escena.obtenerZoom() / 1.25);
    else if (e.key === 'n' || e.key === 'N') alternarNoche();
  });
}

iniciar();
