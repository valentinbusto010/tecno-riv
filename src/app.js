// Une las tres capas: datos → cálculos → escena y tarjetas.
import { cargarDatos } from './datos.js';
import { calcularMetricas } from './calculos.js';
import { PERIODOS, PERIODO_INICIAL, REFRESCO_MS } from './config.js';
import { OBJETOS, ETIQUETA_ESTADO, FILTROS_STOCK, construirTarjeta, resumenObjeto, etiquetaPeriodo, etiquetaBotonMes, kpis } from './tarjetas.js';
import { fechaHora, fecha } from './formato.js';

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
};

const CLAVE_GUARDADA = 'tr-clave-v1';

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
    const datos = await estado.vivo.traerDatos();
    estado.modo = 'vivo'; estado.guardado = null;
    aplicarDatos(datos);
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
  estado.ref = { facturacionMax: calcularMetricas(estado.datos, 'todo').caja.facturacion };
  pintarMeta();
  pintarModo();
  aplicarPeriodo(estado.periodo);
  armarListaProductos();
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
  estado.ref = { facturacionMax: calcularMetricas(estado.datos, 'todo').caja.facturacion };
  estado.movimiento = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  estado.noche = matchMedia('(prefers-color-scheme: dark)').matches;

  await iniciarEscena();
  aplicarPeriodo(estado.periodo);
  armarListaProductos();
  armarControles();
  armarTeclado();
  estado.escena?.encender();
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
    for (const s of ['#rotulos', '#ayuda', '#controles-3d', '#btn-recorrido']) $(s).hidden = true;
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
  estado.periodo = id;
  estado.m = calcularMetricas(estado.datos, id);
  for (const b of document.querySelectorAll('[data-periodo]')) b.setAttribute('aria-pressed', String(b.dataset.periodo === id));
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
    requestAnimationFrame(() => estado.escena?.enfocar(id, { subir: esMovil() ? 0.42 : 0 }));
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
  if (estado.escena) { estado.escena.deseleccionar(); estado.escena.vistaGeneral(); }
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

function armarTeclado() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && estado.abierta) { cerrarTarjeta(); return; }
    if (e.key === 'Escape' && estado.pendiente) { cancelarCaminata(); return; }
    if (!estado.escena || estado.tab !== 'local' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') { estado.escena.girar(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { estado.escena.girar(1); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') estado.escena.zoom(estado.escena.obtenerZoom() * 1.25);
    else if (e.key === '-' || e.key === '_') estado.escena.zoom(estado.escena.obtenerZoom() / 1.25);
    else if (e.key === 'n' || e.key === 'N') alternarNoche();
  });
}

iniciar();
