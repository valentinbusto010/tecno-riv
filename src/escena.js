// Capa de escena: el local de Tecno Riv dibujado con Three.js a partir de las métricas.
// No calcula números del negocio: solo los convierte en tamaños, colores y movimientos.
import * as THREE from 'three';

export function soportaWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// Marca Tecno Riv: azul noche + celeste. Verde/rojo solo para entra/sale plata.
const C = {
  baldosa1: 0xeef2f8, baldosa2: 0xdfe6f1, pared: 0x1a2547, paredBorde: 0x0e1630, zocalo: 0x0a8fd6,
  vereda: 0xc4cad4, calle: 0x4b5263, linea: 0xf4f6fa, cordon: 0xe3e7ee,
  celeste: 0x0a8fd6, neon: 0x3fc4ff, noche: 0x0e1630, blanco: 0xf7f9fc, madera: 0xcfa878, maderaOscura: 0x8f6c46,
  gris: 0x8c95a8, grisOscuro: 0x3b4458, rojo: 0xd7262c, ambar: 0xe39a2b, verde: 0x138a55, violeta: 0x7a4fd6,
  vidrio: 0xbfe6ff, planta: 0x2f8f5b, maceta: 0xb5653a,
};
const PERSONAS = [0x3b4458, 0x7a4fd6, 0xe06a4a, 0x138a55, 0x0a8fd6, 0xc98a2b, 0x56617f, 0xd7262c];

// Plano del local (x, z). El frente da a la calle (z positivo).
const POS = {
  deposito: [-5.25, -4.4], proveedores: [-6.95, 1.9], productos: [5.0, -5.5],
  caja: [-0.6, -1.4], ganancia: [2.7, -1.3], clientes: [-4.0, 1.4],
  marketing: [-6.95, -1.0], camioneta: [4.0, 6.4],
};
const LOCAL = { x0: -7, x1: 7, z0: -6, z1: 4, alto: 3.6 };

const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });
}
function caja(w, h, d, color, extra) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra)); }
function cilindro(r, h, color, seg = 20) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color)); }
function marcar(obj, id, extra = {}) {
  obj.traverse((o) => { if (o.isMesh) o.userData = { ...o.userData, objeto: id, ...extra }; });
  return obj;
}
function punteado(geo, color = C.gris) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 }));
  l.computeLineDistances();
  return l;
}
const invisible = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

class Animador {
  constructor() { this.lista = []; this.reducido = false; }
  ir({ desde, hasta, aplicar, dur = 650, demora = 0, ease = suave }) {
    if (this.reducido || dur <= 0) { aplicar(hasta); return; }
    this.lista.push({ t0: performance.now() + demora, dur, desde, hasta, aplicar, ease });
  }
  paso(ahora) {
    if (!this.lista.length) return false;
    this.lista = this.lista.filter((tw) => {
      if (ahora < tw.t0) return true;
      const p = clamp((ahora - tw.t0) / tw.dur, 0, 1);
      tw.aplicar(lerp(tw.desde, tw.hasta, tw.ease(p)));
      return p < 1;
    });
    return true;
  }
  terminar() { for (const tw of this.lista) tw.aplicar(tw.hasta); this.lista = []; }
}

// ---------- Texturas dibujadas en canvas (sin archivos externos) ----------

function texturaBaldosas() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.fillStyle = hex((i + j) % 2 ? C.baldosa1 : C.baldosa2); g.fillRect(i * 64, j * 64, 64, 64);
  }
  g.strokeStyle = 'rgba(14,22,48,0.08)'; g.lineWidth = 2;
  for (let k = 0; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 5);
  return t;
}

function dibujarCartel(canvas) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'middle';
  g.font = `${Math.round(H * 0.5)}px "Archivo Black", "Arial Black", Impact, sans-serif`;
  const a = 'TECNO ', b = 'RIV';
  const wa = g.measureText(a).width, wb = g.measureText(b).width;
  let x = (W - wa - wb) / 2;
  const y = H * 0.44;
  const capa = (texto, x0, color, brillo) => {
    g.shadowColor = brillo; g.shadowBlur = H * 0.16; g.fillStyle = brillo; g.fillText(texto, x0, y);
    g.shadowBlur = H * 0.06; g.fillText(texto, x0, y);
    g.shadowBlur = 0; g.fillStyle = color; g.fillText(texto, x0, y);
  };
  capa(a, x, '#ffffff', '#9fe3ff');
  capa(b, x + wa, '#d9f5ff', '#1eb6ff');
  g.font = `${Math.round(H * 0.13)}px "Montserrat", "Segoe UI", sans-serif`;
  g.textAlign = 'center'; g.shadowColor = '#1eb6ff'; g.shadowBlur = H * 0.05; g.fillStyle = '#cfefff';
  g.fillText('@tecno_riv · Río Cuarto', W / 2, H * 0.82);
  g.textAlign = 'left'; g.shadowBlur = 0;
}

function texturaHalo() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 64, 4, 128, 64, 120);
  r.addColorStop(0, 'rgba(63,196,255,0.9)'); r.addColorStop(0.45, 'rgba(30,182,255,0.35)'); r.addColorStop(1, 'rgba(30,182,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- El local (no tiene datos: es el ambiente) ----------

function crearLocal(anim) {
  const g = new THREE.Group();
  const { x0, x1, z0, z1, alto } = LOCAL;
  const ancho = x1 - x0, fondo = z1 - z0;

  const piso = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.2, fondo), mat(0xffffff, { map: texturaBaldosas(), roughness: 0.6 }));
  piso.position.set((x0 + x1) / 2, -0.1, (z0 + z1) / 2); g.add(piso);

  // Vereda, cordón y calle
  const vereda = caja(ancho, 0.16, 1.2, C.vereda); vereda.position.set(0, -0.12, z1 + 0.6); g.add(vereda);
  const cordon = caja(ancho, 0.18, 0.12, C.cordon); cordon.position.set(0, -0.11, z1 + 1.26); g.add(cordon);
  const calle = caja(ancho, 0.1, 2.8, C.calle); calle.position.set(0, -0.2, z1 + 2.72); g.add(calle);
  for (let x = -6; x <= 6; x += 2.4) { const l = caja(1.1, 0.01, 0.08, C.linea); l.position.set(x, -0.14, z1 + 3.9); g.add(l); }

  // Paredes del fondo y de la izquierda (se aclaran cuando quedan entre la cámara y el local)
  const paredMat = () => mat(C.pared, { transparent: true, opacity: 1 });
  const fondoPared = new THREE.Group();
  const pf = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, 0.2), paredMat()); pf.position.set(0, alto / 2, z0 - 0.1); fondoPared.add(pf);
  const zf = caja(ancho, 0.12, 0.04, C.zocalo, { transparent: true, emissive: C.zocalo, emissiveIntensity: 0.3 }); zf.position.set(0, 0.06, z0 + 0.02); fondoPared.add(zf);
  const tf = caja(ancho, 0.05, 0.04, C.zocalo, { transparent: true, emissive: C.neon, emissiveIntensity: 0.6 }); tf.position.set(0, alto - 0.08, z0 + 0.02); fondoPared.add(tf);
  g.add(fondoPared);
  const izqPared = new THREE.Group();
  const pi = new THREE.Mesh(new THREE.BoxGeometry(0.2, alto, fondo), paredMat()); pi.position.set(x0 - 0.1, alto / 2, (z0 + z1) / 2); izqPared.add(pi);
  const zi = caja(0.04, 0.12, fondo, C.zocalo, { transparent: true, emissive: C.zocalo, emissiveIntensity: 0.3 }); zi.position.set(x0 + 0.02, 0.06, (z0 + z1) / 2); izqPared.add(zi);
  const ti = caja(0.04, 0.05, fondo, C.zocalo, { transparent: true, emissive: C.neon, emissiveIntensity: 0.6 }); ti.position.set(x0 + 0.02, alto - 0.08, (z0 + z1) / 2); izqPared.add(ti);
  g.add(izqPared);

  // Vidriera del frente, cortada a media altura para ver adentro (como una maqueta), con puerta en el centro
  const ALTO_VID = 1.05;
  const vidMat = mat(C.vidrio, { transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false });
  const tramo = (xa, xb) => {
    const b = caja(xb - xa, 0.3, 0.16, C.noche); b.position.set((xa + xb) / 2, 0.15, z1); g.add(b);
    const v = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, ALTO_VID - 0.3, 0.04), vidMat); v.position.set((xa + xb) / 2, 0.3 + (ALTO_VID - 0.3) / 2, z1); g.add(v);
    const borde = caja(xb - xa, 0.04, 0.08, C.celeste, { emissive: C.neon, emissiveIntensity: 0.5 }); borde.position.set((xa + xb) / 2, ALTO_VID, z1); g.add(borde);
  };
  tramo(x0, -1.0); tramo(1.0, x1);
  for (const x of [x0, -3.5, -1.0, 1.0, 3.5, x1]) { const p = caja(0.1, ALTO_VID + 0.05, 0.12, C.noche); p.position.set(x, (ALTO_VID + 0.05) / 2, z1); g.add(p); }
  const alfombra = caja(1.8, 0.02, 1.0, C.celeste); alfombra.position.set(0, 0.01, z1 - 0.7); g.add(alfombra);

  // Plantas y farola: ambientación
  for (const [x, z] of [[-1.5, z1 - 0.5], [1.5, z1 - 0.5], [6.3, -2.0]]) {
    const m = cilindro(0.22, 0.4, C.maceta, 14); m.position.set(x, 0.2, z); g.add(m);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), mat(C.planta)); h.position.set(x, 0.68, z); h.scale.y = 1.25; g.add(h);
  }
  const poste = cilindro(0.06, 2.4, C.grisOscuro, 10); poste.position.set(-5.5, 1.2, z1 + 1.0); g.add(poste);
  const farolMat = mat(0xfff3d6, { emissive: 0xffd98a, emissiveIntensity: 0.2 });
  const farol = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), farolMat); farol.position.set(-5.5, 2.45, z1 + 1.0); g.add(farol);

  // Cartel iluminado TECNO RIV sobre la pared del fondo
  const cartel = new THREE.Group();
  const placa = caja(6.0, 1.5, 0.14, C.noche); cartel.add(placa);
  const marco = caja(6.12, 1.62, 0.1, C.celeste, { emissive: C.neon, emissiveIntensity: 0.5 }); marco.position.z = -0.03; cartel.add(marco);
  const lienzo = document.createElement('canvas'); lienzo.width = 1536; lienzo.height = 384;
  dibujarCartel(lienzo);
  const texCartel = new THREE.CanvasTexture(lienzo); texCartel.colorSpace = THREE.SRGBColorSpace; texCartel.anisotropy = 4;
  const letrasMat = new THREE.MeshBasicMaterial({ map: texCartel, transparent: true, toneMapped: false, depthWrite: false });
  const letras = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.45), letrasMat); letras.position.z = 0.08; cartel.add(letras);
  const haloMat = new THREE.MeshBasicMaterial({ map: texturaHalo(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 3.2), haloMat); halo.position.z = 0.05; cartel.add(halo);
  cartel.position.set(-0.4, 2.6, z0 + 0.1);
  fondoPared.add(cartel);
  const luzCartel = new THREE.PointLight(C.neon, 6, 7, 1.6); luzCartel.position.set(-0.4, 2.5, z0 + 1.2); g.add(luzCartel);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('100px "Archivo Black"'), document.fonts.load('40px "Montserrat"')])
      .then(() => { dibujarCartel(lienzo); texCartel.needsUpdate = true; local.redibujar?.(); }).catch(() => {});
  }

  // Paredes que se aclaran: todo menos las letras y el halo del cartel, que se manejan aparte.
  const fundibles = [];
  const juntar = (grupo, nombre) => grupo.traverse((m) => {
    if (!m.isMesh || m.material === letrasMat || m.material === haloMat) return;
    m.material.transparent = true;
    fundibles.push({ m, grupo: nombre });
  });
  juntar(fondoPared, 'fondo'); juntar(izqPared, 'izq');
  const cartelEstado = { brillo: 1, halo: 0.3, fondo: 1 };
  const aplicarCartel = () => {
    letrasMat.opacity = cartelEstado.brillo * cartelEstado.fondo;
    haloMat.opacity = cartelEstado.halo * cartelEstado.fondo;
  };

  const local = {
    grupo: g,
    encender() {
      // Parpadeo de neón al abrir el local
      cartelEstado.brillo = 0; aplicarCartel();
      const pasos = [[0, 1, 90, 0], [1, 0.2, 70, 120], [0.2, 1, 90, 230], [1, 0.5, 60, 360], [0.5, 1, 160, 450]];
      for (const [a, b, d, dem] of pasos) anim.ir({ desde: a, hasta: b, aplicar: (v) => { cartelEstado.brillo = v; aplicarCartel(); }, dur: d, demora: dem, ease: (t) => t });
    },
    setNoche(v) {
      // v: 0 = día, 1 = noche
      cartelEstado.halo = lerp(0.3, 1.0, v); aplicarCartel();
      luzCartel.intensity = lerp(5, 22, v);
      marco.material.emissiveIntensity = lerp(0.5, 1.6, v);
      farolMat.emissiveIntensity = lerp(0.15, 2.2, v);
    },
    paredes(camX, camZ) {
      const verFondo = camZ > z0 + 0.5, verIzq = camX > x0 + 0.5;
      for (const f of fundibles) {
        const delante = f.grupo === 'fondo' ? verFondo : verIzq;
        f.m.material.opacity = delante ? 1 : 0.12;
        f.m.material.depthWrite = delante;
      }
      cartelEstado.fondo = verFondo ? 1 : 0.1; aplicarCartel();
    },
    redibujar: null,
  };
  return local;
}

// ---------- Objetos con datos ----------

function crearDeposito(anim) {
  const g = new THREE.Group();
  const piso = caja(3.3, 0.03, 3.2, 0xd4dbe7); piso.position.y = 0.015; g.add(piso);
  const tabique = (w, d, x, z) => { const t = caja(w, 1.2, d, 0xc9d1de); t.position.set(x, 0.6, z); g.add(t); };
  tabique(2.4, 0.12, -0.45, 1.6);  // frente, con hueco de puerta a la derecha
  tabique(0.12, 3.2, 1.65, 0);     // lateral derecho
  const estante = caja(3.0, 0.06, 0.7, C.maderaOscura); estante.position.set(-0.1, 1.55, -1.2); g.add(estante);
  for (const x of [-1.55, 1.35]) { const p = caja(0.06, 1.6, 0.7, C.maderaOscura); p.position.set(x, 0.8, -1.2); g.add(p); }

  const S = 0.26, PASO = 0.29, MAX = 120;
  const geo = new THREE.BoxGeometry(S, S, S);
  const ok = new THREE.InstancedMesh(geo, mat(C.celeste), MAX);
  const bajo = new THREE.InstancedMesh(geo, mat(C.ambar), MAX);
  const agot = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), mat(C.rojo), 40);
  [ok, bajo, agot].forEach((m) => { m.count = 0; g.add(m); });
  const tmp = new THREE.Object3D();
  let alturaPila = 0, ultimaFoto = '';

  function apilar(mesh, n, cx, cz, base) {
    mesh.count = Math.min(n, MAX);
    for (let i = 0; i < mesh.count; i++) {
      const capa = Math.floor(i / 12), k = i % 12;
      const destino = 0.03 + S / 2 + capa * PASO;
      const x = cx + ((k % 4) - 1.5) * PASO, z = cz + (Math.floor(k / 4) - 1) * PASO;
      const fijar = (y) => { tmp.position.set(x, y, z); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix); mesh.instanceMatrix.needsUpdate = true; };
      fijar(destino + 1.8);
      anim.ir({ desde: destino + 1.8, hasta: destino, aplicar: fijar, dur: 520, demora: base + i * 14 });
      alturaPila = Math.max(alturaPila, destino + S / 2);
    }
  }
  return {
    id: 'deposito', grupo: marcar(g, 'deposito'), anclaY: 2.2, focoY: 0.8, zoomFoco: 2.0,
    actualizar(m) {
      const d = m.deposito;
      const porCaja = Math.max(1, Math.ceil(d.unidades / MAX));
      // El stock es una foto: si no cambió, no se vuelve a apilar al cambiar el período.
      const foto = [d.unidadesOk, d.unidadesBajo, d.sinStock.length, porCaja].join('-');
      if (foto === ultimaFoto) return;
      ultimaFoto = foto; alturaPila = 0;
      apilar(ok, Math.ceil(d.unidadesOk / porCaja), -0.75, 0.15, 0);
      apilar(bajo, Math.ceil(d.unidadesBajo / porCaja), 0.85, 0.15, 200);
      agot.count = Math.min(d.sinStock.length, 40);
      for (let i = 0; i < agot.count; i++) { tmp.position.set(-1.2 + (i % 8) * 0.34, 1.61, -1.2); tmp.updateMatrix(); agot.setMatrixAt(i, tmp.matrix); }
      agot.instanceMatrix.needsUpdate = true;
      [ok, bajo, agot].forEach((x) => x.computeBoundingSphere());
      this.anclaY = Math.max(2.0, alturaPila + 0.5);
    },
  };
}

function crearProveedores() {
  // Puerta de entrada de mercadería en la pared izquierda: sin compras registradas.
  const g = new THREE.Group();
  const puerta = punteado(new THREE.BoxGeometry(0.06, 2.1, 1.3)); puerta.position.set(0.05, 1.05, 0); g.add(puerta);
  const pallet = punteado(new THREE.BoxGeometry(1.0, 0.14, 1.0)); pallet.position.set(0.75, 0.07, 0); g.add(pallet);
  const toque = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.1, 1.4), invisible()); toque.position.set(0.6, 1.05, 0); g.add(toque);
  return { id: 'proveedores', grupo: marcar(g, 'proveedores'), anclaY: 2.5, focoY: 1, zoomFoco: 2.0, actualizar() {} };
}

function crearProductos(anim) {
  const g = new THREE.Group();
  const estructura = new THREE.Group(); g.add(estructura);
  const cajitas = new THREE.Group(); g.add(cajitas);
  const ANCHO = 3.9, FONDO = 0.7, NIVEL = 0.52;
  const geoCajita = new THREE.BoxGeometry(0.17, 0.24, 0.18);
  const colores = { ok: C.celeste, bajo: C.ambar, sin_stock: C.rojo };
  let porId = new Map(), elegido = null, filtro = null;

  function armarEstructura(niveles) {
    estructura.clear();
    const alto = 0.3 + niveles * NIVEL;
    const fondoMueble = caja(ANCHO, alto, 0.05, C.blanco); fondoMueble.position.set(0, alto / 2, -FONDO / 2); estructura.add(fondoMueble);
    for (const x of [-ANCHO / 2, ANCHO / 2]) { const p = caja(0.07, alto, FONDO, C.madera); p.position.set(x, alto / 2, 0); estructura.add(p); }
    for (let i = 0; i < niveles; i++) {
      const t = caja(ANCHO, 0.05, FONDO, C.madera); t.position.y = 0.24 + i * NIVEL; estructura.add(t);
      const filo = caja(ANCHO, 0.03, 0.02, C.celeste, { emissive: C.neon, emissiveIntensity: 0.4 }); filo.position.set(0, 0.24 + i * NIVEL, FONDO / 2); estructura.add(filo);
    }
    marcar(estructura, 'productos');
    return alto;
  }
  function aplicarFiltro() {
    for (const b of cajitas.children) {
      const ver = !filtro || b.userData.estadoStock === filtro;
      b.material.opacity = ver ? 1 : 0.15;
      b.material.depthWrite = ver;
    }
  }
  return {
    id: 'productos', grupo: g, anclaY: 3.2, focoY: 1.2, zoomFoco: 1.9,
    actualizar(m) {
      this.anclaY = armarEstructura(m.categorias.length) + 0.4;
      cajitas.clear(); porId = new Map(); elegido = null;
      m.categorias.forEach((cat, nivel) => {
        const lista = m.productos.filter((f) => f.activo && f.categoria === cat);
        const porFila = 18;
        lista.forEach((f, i) => {
          const fila = Math.floor(i / porFila), col = i % porFila;
          const b = new THREE.Mesh(geoCajita, mat(colores[f.estadoStock], { transparent: true }));
          b.position.set(-ANCHO / 2 + 0.2 + col * 0.21, 0.24 + nivel * NIVEL + 0.145, 0.12 - fila * 0.26);
          b.userData = { objeto: 'productos', producto: f.id, estadoStock: f.estadoStock, base: b.position.clone() };
          cajitas.add(b); porId.set(f.id, b);
        });
      });
      aplicarFiltro();
    },
    filtrar(estado) { filtro = estado || null; aplicarFiltro(); },
    seleccionar(on, productoId) {
      if (elegido) {
        const b = elegido, base = b.userData.base;
        anim.ir({ desde: b.position.z, hasta: base.z, aplicar: (v) => { b.position.z = v; }, dur: 380 });
        anim.ir({ desde: b.scale.x, hasta: 1, aplicar: (v) => b.scale.setScalar(v), dur: 380 });
        b.rotation.y = 0; elegido = null;
      }
      if (on && productoId !== undefined && porId.has(productoId)) {
        const b = porId.get(productoId); elegido = b; const base = b.userData.base;
        anim.ir({ desde: base.z, hasta: base.z + 0.6, aplicar: (v) => { b.position.z = v; }, dur: 520 });
        anim.ir({ desde: 0, hasta: Math.PI * 2, aplicar: (v) => { b.rotation.y = v; }, dur: 900, demora: 200 });
        anim.ir({ desde: 1, hasta: 1.7, aplicar: (v) => b.scale.setScalar(v), dur: 520 });
      }
    },
  };
}

function crearCaja(anim) {
  const g = new THREE.Group();
  const mostrador = caja(3.4, 1.0, 1.0, C.blanco); mostrador.position.y = 0.5; g.add(mostrador);
  const frente = caja(3.42, 0.55, 0.02, C.celeste); frente.position.set(0, 0.55, 0.51); g.add(frente);
  const tapa = caja(3.5, 0.07, 1.1, C.madera); tapa.position.y = 1.035; g.add(tapa);
  const cuerpo = caja(0.8, 0.3, 0.6, C.noche); cuerpo.position.set(0.7, 1.22, -0.05); g.add(cuerpo);
  const visor = caja(0.55, 0.32, 0.05, C.grisOscuro); visor.position.set(0.7, 1.55, -0.3); visor.rotation.x = -0.35; g.add(visor);
  const pantalla = caja(0.47, 0.24, 0.01, C.celeste, { emissive: C.neon, emissiveIntensity: 0.7 }); pantalla.position.set(0.7, 1.55, -0.27); pantalla.rotation.x = -0.35; g.add(pantalla);
  const cajon = caja(0.68, 0.11, 0.5, C.grisOscuro); cajon.position.set(0.7, 1.12, 0.05); g.add(cajon);
  const geoPila = new THREE.BoxGeometry(0.55, 1, 0.3); geoPila.translate(0, 0.5, 0);
  const pila = new THREE.Mesh(geoPila, mat(C.verde)); pila.position.set(-0.7, 1.07, 0); pila.scale.y = 0.05; g.add(pila);
  const faja = caja(0.57, 0.06, 0.32, 0xe9f6ef); faja.position.set(-0.7, 1.1, 0); g.add(faja);
  marcar(g, 'caja');
  const altoMax = 1.3;
  return {
    id: 'caja', grupo: g, anclaY: 2.0, focoY: 1.0, zoomFoco: 2.1,
    actualizar(m, ref) {
      const proporcion = ref.facturacionMax > 0 ? m.caja.facturacion / ref.facturacionMax : 0;
      const h = Math.max(0.04, proporcion * altoMax);
      anim.ir({ desde: pila.scale.y, hasta: h, aplicar: (v) => { pila.scale.y = v; faja.position.y = 1.07 + v * 0.55; }, dur: 800 });
      this.anclaY = Math.max(1.9, 1.07 + h + 0.3);
    },
    seleccionar(on) {
      anim.ir({ desde: cajon.position.z, hasta: on ? 0.45 : 0.05, aplicar: (v) => { cajon.position.z = v; }, dur: 420 });
    },
  };
}

function crearGanancia(anim) {
  const g = new THREE.Group();
  const mesa = caja(1.6, 0.8, 0.9, C.blanco); mesa.position.y = 0.4; g.add(mesa);
  const tapa = caja(1.7, 0.06, 1.0, C.madera); tapa.position.y = 0.83; g.add(tapa);
  const base = cilindro(0.32, 0.08, C.noche); base.position.y = 0.9; g.add(base);
  const poste = cilindro(0.04, 1.1, C.noche, 12); poste.position.y = 1.45; g.add(poste);
  const pivote = new THREE.Group(); pivote.position.y = 2.0; g.add(pivote);
  const brazo = caja(1.5, 0.06, 0.08, C.celeste); pivote.add(brazo);
  const L = 0.7;
  const platillo = (color) => {
    const p = new THREE.Group();
    const hilo = caja(0.015, 0.4, 0.015, C.noche); hilo.position.y = -0.2; p.add(hilo);
    const plato = cilindro(0.26, 0.04, color); plato.position.y = -0.42; p.add(plato);
    g.add(p); return p;
  };
  const izq = platillo(C.verde); // ventas: entra plata
  const der = platillo(C.rojo);  // costos: sale plata
  marcar(g, 'ganancia');
  let angulo = 0;
  function aplicar(a) {
    angulo = a; pivote.rotation.z = a;
    izq.position.set(-L * Math.cos(a), 2.0 - L * Math.sin(a), 0);
    der.position.set(L * Math.cos(a), 2.0 + L * Math.sin(a), 0);
  }
  aplicar(0);
  return {
    id: 'ganancia', grupo: g, anclaY: 2.6, focoY: 1.3, zoomFoco: 2.3,
    actualizar(m) {
      const ventas = m.ganancia.facturacion;
      const costos = m.ganancia.costoMercaderia + m.ganancia.totalGastos;
      const escala = Math.max(ventas, costos, 1);
      // Ganancia positiva: baja el platillo de las ventas.
      const destino = clamp((ventas - costos) / escala, -1, 1) * 0.35;
      brazo.material.color.setHex(ventas - costos < 0 ? C.rojo : C.celeste);
      anim.ir({ desde: angulo, hasta: destino, aplicar, dur: 900 });
    },
  };
}

function persona(color) {
  const p = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.75, 14), mat(color)); cuerpo.position.y = 0.55; p.add(cuerpo);
  const piernas = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.25, 12), mat(C.noche)); piernas.position.y = 0.12; p.add(piernas);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat(0xe8c4a0)); cabeza.position.y = 1.08; p.add(cabeza);
  return p;
}

function crearClientes(anim) {
  const g = new THREE.Group();
  // Atril con el celular del bot de WhatsApp
  const atril = cilindro(0.05, 1.0, C.noche, 10); atril.position.set(0, 0.5, 0); g.add(atril);
  const pie = cilindro(0.3, 0.05, C.noche); pie.position.set(0, 0.025, 0); g.add(pie);
  const tel = caja(0.5, 0.85, 0.06, C.noche); tel.position.set(0, 1.45, 0); tel.rotation.y = Math.PI / 4; g.add(tel);
  const pant = caja(0.42, 0.74, 0.01, C.celeste, { emissive: C.neon, emissiveIntensity: 0.6 }); pant.position.set(0.024, 1.45, 0.024); pant.rotation.y = Math.PI / 4; g.add(pant);
  marcar(g, 'clientes');

  const MAXB = 12, burbujas = [];
  const geoB = new THREE.SphereGeometry(0.1, 16, 12);
  for (let i = 0; i < MAXB; i++) {
    const b = new THREE.Mesh(geoB, mat(0xffffff, { transparent: true, opacity: 0.95, emissive: C.neon, emissiveIntensity: 0.25 }));
    b.visible = false; b.userData = { objeto: 'clientes' }; g.add(b); burbujas.push(b);
  }
  const MAXP = 8, gente = [];
  for (let i = 0; i < MAXP; i++) { const p = persona(PERSONAS[i % PERSONAS.length]); p.visible = false; marcar(p, 'clientes'); g.add(p); gente.push(p); }
  // Lugares donde se paran los clientes (relativos al atril)
  const lugares = [[0.9, 0.3], [1.5, -0.2], [0.6, 1.0], [1.4, 0.8], [2.1, 0.3], [2.0, 1.3], [0.2, 1.6], [2.7, 0.9]];
  // La puerta del local queda en (0, 4): en coordenadas del grupo
  const puerta = { x: 0 - POS.clientes[0], z: LOCAL.z1 - POS.clientes[1] + 0.4 };
  let activas = 0, presentes = 0;

  function ubicarBurbuja(b, i, fase) {
    const x = Math.sin(i * 1.7) * 0.25, z = Math.cos(i * 2.3) * 0.15;
    b.position.set(x, 1.95 + fase * 1.1, z);
    b.material.opacity = 0.95 * (1 - Math.max(0, fase - 0.6) / 0.4);
    b.scale.setScalar(0.7 + fase * 0.5);
  }
  return {
    id: 'clientes', grupo: g, anclaY: 3.2, focoY: 1.0, zoomFoco: 1.9,
    actualizar(m) {
      const total = m.clientes.mensajesDeClientes + m.clientes.mensajesDelBot;
      activas = total > 0 ? clamp(Math.ceil(total / 30), 1, MAXB) : 0;
      burbujas.forEach((b, i) => { b.visible = i < activas; ubicarBurbuja(b, i, i / Math.max(activas, 1)); });
      // Una persona por cliente que compró en el período: entran por la puerta.
      const n = Math.min(m.clientes.compradoresPeriodo, MAXP);
      gente.forEach((p, i) => {
        const [lx, lz] = lugares[i];
        if (i < n && i >= presentes) {
          p.visible = true; p.position.set(puerta.x, 0, puerta.z); p.rotation.y = Math.atan2(lx - puerta.x, lz - puerta.z);
          anim.ir({ desde: 0, hasta: 1, aplicar: (t) => { p.position.x = lerp(puerta.x, lx, t); p.position.z = lerp(puerta.z, lz, t); p.position.y = Math.abs(Math.sin(t * Math.PI * 6)) * 0.06; }, dur: 1400, demora: i * 220, ease: (t) => t });
          anim.ir({ desde: 0, hasta: 1, aplicar: (t) => { if (t >= 1) p.rotation.y = Math.atan2(-lx, -lz); }, dur: 1, demora: i * 220 + 1400 });
        } else if (i >= n) {
          p.visible = false;
        }
      });
      presentes = n;
    },
    cuadro(t) {
      if (!activas && !presentes) return false;
      for (let i = 0; i < activas; i++) ubicarBurbuja(burbujas[i], i, (t / 3.2 + i / activas) % 1);
      return true;
    },
  };
}

function crearMarketing(anim) {
  // Pantalla vertical en la pared izquierda: un cuadrito por publicación de Instagram.
  const g = new THREE.Group();
  const marco = caja(0.1, 2.3, 1.7, C.noche); marco.position.set(0.05, 1.65, 0); g.add(marco);
  const fondo = caja(0.02, 2.1, 1.5, 0x101a36); fondo.position.set(0.11, 1.65, 0); g.add(fondo);
  const soporte = caja(0.4, 0.06, 0.8, C.noche); soporte.position.set(0.2, 0.45, 0); g.add(soporte);
  marcar(g, 'marketing');
  const MAX = 12, tiles = [];
  const colorFormato = { carrusel: C.celeste, historias: C.violeta, post: C.ambar };
  for (let i = 0; i < MAX; i++) {
    const col = i % 3, fila = Math.floor(i / 3);
    const t = caja(0.02, 0.42, 0.42, 0x26335c, { emissive: 0x000000, emissiveIntensity: 0 });
    t.position.set(0.13, 2.5 - fila * 0.5, -0.47 + col * 0.47);
    t.userData = { objeto: 'marketing' }; g.add(t); tiles.push(t);
  }
  let encendidos = 0;
  return {
    id: 'marketing', grupo: g, anclaY: 3.1, focoY: 1.6, zoomFoco: 2.0,
    actualizar(m) {
      const formatos = [];
      for (const [f, n] of Object.entries(m.marketing.porFormato)) for (let k = 0; k < n; k++) formatos.push(f);
      encendidos = Math.min(formatos.length, MAX);
      tiles.forEach((t, i) => {
        if (i < encendidos) {
          const c = colorFormato[formatos[i]] ?? C.celeste;
          t.material.color.setHex(c); t.material.emissive.setHex(c);
          anim.ir({ desde: 0, hasta: 0.9, aplicar: (v) => { t.material.emissiveIntensity = v; }, dur: 300, demora: i * 90 });
        } else {
          t.material.color.setHex(0x26335c); t.material.emissiveIntensity = 0;
        }
      });
    },
    cuadro(t) {
      if (!encendidos) return false;
      for (let i = 0; i < encendidos; i++) tiles[i].material.emissiveIntensity = 0.7 + 0.25 * Math.sin(t * 2 + i * 0.7);
      return true;
    },
  };
}

function crearCamioneta(anim) {
  const g = new THREE.Group();
  const LUGARES = { pendiente: -2.1, en_camino: 0, entregado: 2.1 };
  const blanca = new THREE.LineBasicMaterial({ color: C.linea });
  const punteada = new THREE.LineDashedMaterial({ color: C.gris, dashSize: 0.12, gapSize: 0.1 });
  for (const [estado, x] of Object.entries(LUGARES)) {
    const marco = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.6, 2.2)), estado === 'en_camino' ? punteada : blanca);
    marco.rotation.x = -Math.PI / 2; marco.position.set(x, -0.13, 0.3); marco.computeLineDistances(); g.add(marco);
    const toque = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 2.2), invisible()); toque.position.set(x, -0.12, 0.3); g.add(toque);
  }
  function furgon() {
    const f = new THREE.Group();
    const cuerpo = caja(0.7, 0.62, 1.05, C.blanco); cuerpo.position.set(0, 0.42, -0.12); f.add(cuerpo);
    const franja = caja(0.72, 0.12, 1.07, C.celeste, { emissive: C.neon, emissiveIntensity: 0.2 }); franja.position.set(0, 0.42, -0.12); f.add(franja);
    const cabina = caja(0.68, 0.44, 0.4, C.blanco); cabina.position.set(0, 0.33, 0.6); f.add(cabina);
    const vidrio = caja(0.56, 0.2, 0.02, C.grisOscuro); vidrio.position.set(0, 0.45, 0.81); f.add(vidrio);
    for (const [x, z] of [[-0.35, -0.45], [0.35, -0.45], [-0.35, 0.55], [0.35, 0.55]]) {
      const r = cilindro(0.14, 0.09, C.noche, 14); r.rotation.z = Math.PI / 2; r.position.set(x, 0.0, z); f.add(r);
    }
    f.rotation.y = Math.PI; // mira hacia la vidriera
    g.add(f); return f;
  }
  const furgones = { pendiente: furgon(), entregado: furgon() };
  marcar(g, 'camioneta');
  const visibles = { pendiente: false, entregado: false };
  for (const [estado, f] of Object.entries(furgones)) { f.position.set(LUGARES[estado], 0, 0.3); f.visible = false; }
  return {
    id: 'camioneta', grupo: g, anclaY: 1.3, lugares: LUGARES, focoY: 0.3, zoomFoco: 1.9,
    actualizar(m) {
      const cuenta = { pendiente: m.pedidos.pendientes, entregado: m.pedidos.entregados };
      for (const [estado, f] of Object.entries(furgones)) {
        const ver = cuenta[estado] > 0;
        if (ver && !visibles[estado]) {
          f.visible = true;
          // Entra desde la calle y se estaciona en el lugar de su estado: es un cambio de estado, no un recorrido real.
          anim.ir({ desde: 2.8, hasta: 0.3, aplicar: (v) => { f.position.z = v; }, dur: 900 });
        }
        if (!ver) f.visible = false;
        visibles[estado] = ver;
      }
    },
  };
}

// ---------- El dueño: camina hasta cada zona ----------

// Dónde se para en cada zona y hacia dónde mira (x, z del piso).
const PARADAS = {
  caja: { p: [0.3, -0.35], mira: [0, -1] },        // frente al mostrador, mirando la caja
  ganancia: { p: [2.7, -0.15], mira: [0, -1] },
  productos: { p: [5.0, -4.4], mira: [0, -1] },
  deposito: { p: [-4.05, -2.2], mira: [0, -1] },   // en la puerta del depósito
  marketing: { p: [-5.9, -1.0], mira: [-1, 0] },
  proveedores: { p: [-6.1, 1.9], mira: [-1, 0] },
  clientes: { p: [-4.75, 0.55], mira: [0.6, 0.8] },
  camioneta: { p: [4.0, 4.75], mira: [0, 1] },     // en la vereda, mirando a la calle
};
// Puntos de paso por los pasillos. Cada tramo se revisó contra el plano: no cruza muebles ni clientes.
const PASOS = {
  centro: [0.5, 0.7], puertaAdentro: [0, 3.2], puertaAfuera: [0, 4.65], izquierda: [-5.5, 0.0],
  izqCaja: [-2.9, -0.3], pasillo: [1.5, -0.3], detrasCaja: [1.5, -2.6], este: [4.3, -0.3],
};
const TRAMOS = [
  ['centro', 'puertaAdentro'], ['puertaAdentro', 'puertaAfuera'], ['puertaAfuera', 'camioneta'],
  ['centro', 'izquierda'], ['izquierda', 'marketing'], ['izquierda', 'proveedores'], ['izquierda', 'clientes'],
  ['centro', 'clientes'], ['izquierda', 'deposito'], ['centro', 'izqCaja'], ['izqCaja', 'deposito'], ['izqCaja', 'izquierda'],
  ['centro', 'pasillo'], ['pasillo', 'detrasCaja'], ['centro', 'caja'], ['pasillo', 'caja'], ['centro', 'ganancia'], ['pasillo', 'ganancia'],
  ['ganancia', 'este'], ['este', 'productos'], ['detrasCaja', 'productos'],
];
const NODOS = { ...PASOS, ...Object.fromEntries(Object.entries(PARADAS).map(([k, v]) => [k, v.p])) };
const VECINOS = {};
for (const [a, b] of TRAMOS) { (VECINOS[a] ||= []).push(b); (VECINOS[b] ||= []).push(a); }
const distancia2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Camino más corto entre dos puntos de paso (Dijkstra; son pocos nodos).
function rutaEntre(desde, hasta) {
  const dist = { [desde]: 0 }, previo = {}, pendientes = new Set(Object.keys(NODOS));
  while (pendientes.size) {
    let u = null;
    for (const n of pendientes) if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n;
    if (u === null || u === hasta) break;
    pendientes.delete(u);
    for (const w of VECINOS[u] || []) {
      const d = dist[u] + distancia2(NODOS[u], NODOS[w]);
      if (dist[w] === undefined || d < dist[w]) { dist[w] = d; previo[w] = u; }
    }
  }
  const ruta = [hasta];
  while (ruta[0] !== desde && previo[ruta[0]]) ruta.unshift(previo[ruta[0]]);
  return ruta[0] === desde ? ruta : [desde, hasta];
}

function texturaLogoRemera() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '64px "Archivo Black", "Arial Black", sans-serif'; g.textBaseline = 'middle';
  const wt = g.measureText('T').width, wr = g.measureText('R').width, x = (128 - wt - wr) / 2;
  g.fillStyle = '#ffffff'; g.fillText('T', x, 60);
  g.fillStyle = '#0e1630'; g.fillText('R', x + wt, 60);
  g.fillStyle = '#ffffff'; g.fillRect(x, 98, wt + wr, 7);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crearDuenio(anim) {
  const g = new THREE.Group();
  const cuerpo = new THREE.Group(); g.add(cuerpo);
  const PIEL = 0xe8c4a0, JEAN = 0x1f2f55, PELO = 0x2a1d14, CADERA = 0.62;
  const pierna = (x) => {
    const piv = new THREE.Group(); piv.position.set(x, CADERA, 0);
    const p = caja(0.15, 0.56, 0.17, JEAN); p.position.y = -0.28; piv.add(p);
    const zapa = caja(0.17, 0.08, 0.27, 0xf4f6fa); zapa.position.set(0, -0.58, 0.04); piv.add(zapa);
    cuerpo.add(piv); return piv;
  };
  const brazo = (x) => {
    const piv = new THREE.Group(); piv.position.set(x, CADERA + 0.48, 0);
    const manga = caja(0.13, 0.2, 0.15, C.celeste); manga.position.y = -0.08; piv.add(manga);
    const b = caja(0.1, 0.32, 0.11, PIEL); b.position.y = -0.33; piv.add(b);
    cuerpo.add(piv); return piv;
  };
  const piernaI = pierna(-0.1), piernaD = pierna(0.1);
  const torso = caja(0.44, 0.52, 0.26, C.celeste); torso.position.y = CADERA + 0.27; cuerpo.add(torso);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ map: texturaLogoRemera(), transparent: true, depthWrite: false }));
  logo.position.set(0, CADERA + 0.33, 0.132); cuerpo.add(logo);
  const brazoI = brazo(-0.295), brazoD = brazo(0.295);
  const cuello = cilindro(0.06, 0.08, PIEL, 10); cuello.position.y = CADERA + 0.57; cuerpo.add(cuello);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), mat(PIEL)); cabeza.position.y = CADERA + 0.76; cuerpo.add(cabeza);
  const pelo = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(PELO));
  pelo.position.y = CADERA + 0.77; pelo.rotation.x = -0.3; cuerpo.add(pelo);
  // Aro celeste en el piso: así se distingue de los clientes
  const aroMat = new THREE.MeshBasicMaterial({ color: C.neon, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
  const aro = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 36), aroMat); aro.rotation.x = -Math.PI / 2; aro.position.y = 0.025; g.add(aro);
  g.renderOrder = 2;

  // Arranca en el medio del local, mirando hacia la cámara
  let ruta = null, paso = 0, velocidad = 3, fase = 0, rumbo = Math.PI / 4, alLlegar = null, destino = 'centro';
  let parado = 'centro';
  g.position.set(PASOS.centro[0], 0, PASOS.centro[1]);
  g.rotation.y = rumbo;

  const anguloCorto = (desde, hasta) => desde + Math.atan2(Math.sin(hasta - desde), Math.cos(hasta - desde));
  function quieto() { piernaI.rotation.x = piernaD.rotation.x = 0; brazoI.rotation.x = brazoD.rotation.x = 0; cuerpo.position.y = 0; }

  function llegar() {
    ruta = null; parado = destino; quieto();
    const m = PARADAS[destino].mira;
    const final = anguloCorto(g.rotation.y, Math.atan2(m[0], m[1]));
    anim.ir({ desde: g.rotation.y, hasta: final, aplicar: (a) => { g.rotation.y = a; }, dur: 260 });
    // Señala la zona y después se abren los datos
    anim.ir({ desde: 0, hasta: -1.25, aplicar: (a) => { brazoD.rotation.x = a; }, dur: 260, demora: 160 });
    anim.ir({ desde: -1.25, hasta: 0, aplicar: (a) => { brazoD.rotation.x = a; }, dur: 380, demora: 1000 });
    const cb = alLlegar; alLlegar = null;
    if (cb) anim.ir({ desde: 0, hasta: 1, aplicar: (t) => { if (t >= 1) cb(); }, dur: 1, demora: 380 });
  }

  return {
    grupo: g,
    get destino() { return destino; },
    get caminando() { return !!ruta; },
    // Devuelve cuánto va a tardar (ms). Con el movimiento en pausa llega al instante.
    irA(id, { reducido = false, cb } = {}) {
      if (!PARADAS[id]) { cb?.(); return 0; }
      destino = id;
      alLlegar = cb || null;
      const aqui = [g.position.x, g.position.z];
      let nodos;
      if (!ruta && parado && distancia2(aqui, NODOS[parado]) < 0.05) {
        nodos = rutaEntre(parado, id);
      } else {
        // A mitad de camino: entra a la red por el punto de paso más cercano.
        let cerca = null;
        for (const n of Object.keys(NODOS)) if (cerca === null || distancia2(aqui, NODOS[n]) < distancia2(aqui, NODOS[cerca])) cerca = n;
        nodos = rutaEntre(cerca, id);
      }
      const puntos = nodos.map((n) => NODOS[n]).filter((p, i) => i > 0 || distancia2(aqui, p) > 0.05);
      let largo = 0, previo = aqui;
      for (const p of puntos) { largo += distancia2(previo, p); previo = p; }
      parado = null;
      if (reducido || largo < 0.05) {
        const [x, z] = PARADAS[id].p;
        g.position.set(x, 0, z);
        g.rotation.y = Math.atan2(PARADAS[id].mira[0], PARADAS[id].mira[1]);
        ruta = null; parado = id; quieto();
        const c = alLlegar; alLlegar = null;
        if (c) requestAnimationFrame(() => c());
        return 0;
      }
      ruta = puntos; paso = 0;
      velocidad = Math.max(3, largo / 2.8); // nunca más de unos 3 segundos de caminata
      return (largo / velocidad) * 1000;
    },
    terminar() { if (ruta) { const [x, z] = PARADAS[destino].p; g.position.set(x, 0, z); llegar(); } },
    detener() { alLlegar = null; },
    cuadro(dt) {
      if (!ruta) return false;
      let avance = velocidad * dt;
      while (avance > 0 && ruta) {
        const [tx, tz] = ruta[paso];
        const dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
        if (d <= avance) {
          g.position.x = tx; g.position.z = tz; avance -= d; paso++;
          if (paso >= ruta.length) { llegar(); return true; }
        } else {
          g.position.x += (dx / d) * avance; g.position.z += (dz / d) * avance; avance = 0;
          rumbo = Math.atan2(dx, dz);
        }
      }
      // Gira suave hacia donde camina, mueve piernas y brazos
      g.rotation.y = lerp(g.rotation.y, anguloCorto(g.rotation.y, rumbo), Math.min(1, dt * 12));
      fase += dt * velocidad * 3.4;
      const s = Math.sin(fase);
      piernaI.rotation.x = s * 0.6; piernaD.rotation.x = -s * 0.6;
      brazoI.rotation.x = -s * 0.5; brazoD.rotation.x = s * 0.5;
      cuerpo.position.y = Math.abs(Math.cos(fase)) * 0.04;
      return true;
    },
  };
}

// ---------- Escena ----------

export function crearEscena(contenedor, { rotulos, alSeleccionar, alPasar }) {
  const lienzo = document.createElement('canvas');
  lienzo.className = 'escena-lienzo';
  lienzo.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  contenedor.prepend(lienzo);

  const escena = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa6bd, 2.2); escena.add(hemi);
  const sol = new THREE.DirectionalLight(0xffffff, 1.5); sol.position.set(6, 10, 5); escena.add(sol);

  const anim = new Animador();
  const local = crearLocal(anim);
  escena.add(local.grupo);
  let sucio = true;
  local.redibujar = () => { sucio = true; };

  const objetos = [
    crearDeposito(anim), crearProveedores(), crearProductos(anim), crearCaja(anim),
    crearGanancia(anim), crearClientes(anim), crearMarketing(anim), crearCamioneta(anim),
  ];
  const porId = new Map(objetos.map((o) => [o.id, o]));
  for (const o of objetos) { const [x, z] = POS[o.id]; o.grupo.position.set(x, 0, z); escena.add(o.grupo); }

  // El dueño (vos) con su rótulo
  const duenio = crearDuenio(anim);
  escena.add(duenio.grupo);
  const rotuloDuenio = document.createElement('span');
  rotuloDuenio.className = 'rotulo-duenio'; rotuloDuenio.setAttribute('aria-hidden', 'true');
  const rotuloDuenioNombre = document.createElement('b'); rotuloDuenioNombre.textContent = 'Vos';
  const rotuloDuenioDestino = document.createElement('span');
  rotuloDuenio.append(rotuloDuenioNombre, rotuloDuenioDestino);
  rotulos.appendChild(rotuloDuenio);

  // Rótulos HTML que siguen a cada objeto
  const elRotulos = new Map();
  for (const btn of rotulos.querySelectorAll('[data-objeto]')) elRotulos.set(btn.dataset.objeto, btn);
  const subrotulos = [];
  function agregarSubrotulo(texto, objetoId, x, y, z, clase = '') {
    const el = document.createElement('span');
    el.className = 'subrotulo ' + clase; el.textContent = texto; el.setAttribute('aria-hidden', 'true');
    rotulos.appendChild(el);
    subrotulos.push({ el, objetoId, local: new THREE.Vector3(x, y, z) });
  }
  const cam = porId.get('camioneta');
  agregarSubrotulo('Pendiente', 'camioneta', cam.lugares.pendiente, 0, 1.6);
  agregarSubrotulo('En camino · sin datos', 'camioneta', cam.lugares.en_camino, 0, 1.6, 'apagado');
  agregarSubrotulo('Entregado', 'camioneta', cam.lugares.entregado, 0, 1.6);
  agregarSubrotulo('Muestra el estado, no la ubicación', 'camioneta', 0, 0, -0.95, 'nota');

  // Cámara isométrica con encuadre y foco animados
  const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const CENTRO_GENERAL = new THREE.Vector3(0.8, 1.2, -0.6);
  const centro = CENTRO_GENERAL.clone();
  let yaw = Math.PI / 4, yawDestino = yaw, zoom = 1, zoomGeneral = 1;
  let medioAlto = 7;
  function ubicarCamara() {
    const r = 22;
    camara.position.set(centro.x + Math.sin(yaw) * r, centro.y + 17, centro.z + Math.cos(yaw) * r);
    camara.lookAt(centro);
    local.paredes(Math.sin(yaw) * 10, Math.cos(yaw) * 10);
    sucio = true;
  }
  function encuadrar() {
    const w = contenedor.clientWidth || 1, h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspecto = w / h;
    // Entra todo el local con la vereda, en horizontal o en vertical.
    // En vertical se deja cortar un poco la calle para que el local se vea más grande.
    medioAlto = Math.max(7.0, (aspecto < 1 ? 8.4 : 9.8) / aspecto);
    const medioAncho = medioAlto * aspecto;
    Object.assign(camara, { left: -medioAncho, right: medioAncho, top: medioAlto, bottom: -medioAlto, zoom });
    camara.updateProjectionMatrix();
    sucio = true;
  }

  let movimiento = true, seleccion = null, noche = 0;
  const v = new THREE.Vector3();
  function posicionarRotulos() {
    const w = contenedor.clientWidth, h = contenedor.clientHeight;
    const cajas = [];
    for (const o of objetos) {
      const el = elRotulos.get(o.id); if (!el) continue;
      v.set(o.grupo.position.x, o.anclaY, o.grupo.position.z).project(camara);
      const fuera = Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02;
      el.hidden = fuera;
      if (!fuera) cajas.push({ el, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, w: el.offsetWidth, h: el.offsetHeight });
    }
    // En pantallas angostas los botones van en una fila arriba: los rótulos no suben hasta ahí.
    const reservaArriba = w < 560 ? 50 : 0;
    // Si dos rótulos se pisan, el de más arriba sube hasta quedar libre. Ninguno sale de la escena.
    // Tu rótulo ("Vos") va primero y no se mueve: los de las zonas lo esquivan.
    cajas.sort((a, b) => b.y - a.y);
    const puestos = [];
    v.set(duenio.grupo.position.x, 1.72, duenio.grupo.position.z).project(camara);
    const dx = ((v.x + 1) / 2) * w, dy = ((1 - v.y) / 2) * h;
    rotuloDuenio.hidden = Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02;
    rotuloDuenio.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -100%)`;
    if (!rotuloDuenio.hidden) puestos.push({ x: dx, y: dy, w: rotuloDuenio.offsetWidth, h: rotuloDuenio.offsetHeight });
    for (const c of cajas) {
      c.x = clamp(c.x, c.w / 2 + 4, w - c.w / 2 - 4);
      for (let intento = 0; intento < 8; intento++) {
        const choca = puestos.find((p) => Math.abs(p.x - c.x) < (p.w + c.w) / 2 + 4 && c.y > p.y - p.h - 3 && c.y - c.h < p.y + 3);
        if (!choca) break;
        c.y = choca.y - choca.h - 4;
      }
      c.y = Math.max(c.y, c.h + 2 + reservaArriba);
      puestos.push(c);
      c.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%)`;
    }
    for (const s of subrotulos) {
      // Los nombres de los lugares solo aparecen con la camioneta elegida, para no llenar la escena.
      const g = porId.get(s.objetoId).grupo;
      v.copy(s.local).add(g.position).project(camara);
      s.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      s.el.hidden = seleccion?.id !== s.objetoId || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
    }
  }

  let raf = 0, ultimoCuadro = 0;
  function bucle(ahora) {
    raf = requestAnimationFrame(bucle);
    const dt = ultimoCuadro ? Math.min(0.05, (ahora - ultimoCuadro) / 1000) : 0;
    ultimoCuadro = ahora;
    const hayAnim = anim.paso(ahora);
    let hayBucles = false;
    if (movimiento) for (const o of objetos) if (o.cuadro && o.cuadro(ahora / 1000)) hayBucles = true;
    if (duenio.cuadro(dt)) hayBucles = true;
    if (hayAnim || hayBucles || sucio) {
      renderer.render(escena, camara);
      posicionarRotulos();
      sucio = false;
    }
  }

  // Resaltado de lo elegido
  function resaltar(id, on) {
    const o = porId.get(id); if (!o) return;
    o.grupo.traverse((m) => {
      if (!m.isMesh || !m.material || !m.material.emissive || m.userData.producto !== undefined) return;
      if (on) { m.userData.emisivo = m.material.emissive.getHex(); m.userData.intensidad = m.material.emissiveIntensity; m.material.emissive.setHex(0x1b3a66); m.material.emissiveIntensity = 1; }
      else if (m.userData.emisivo !== undefined) { m.material.emissive.setHex(m.userData.emisivo); m.material.emissiveIntensity = m.userData.intensidad; delete m.userData.emisivo; }
    });
    const el = elRotulos.get(id); if (el) el.classList.toggle('activo', on);
  }

  const raycaster = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const seVe = (m) => { for (let x = m; x; x = x.parent) if (!x.visible) return false; return true; };
  function elegir(cx, cy) {
    const r = lienzo.getBoundingClientRect();
    puntero.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(puntero, camara);
    const tocables = [];
    for (const o of objetos) o.grupo.traverse((m) => { if (m.isMesh && m.userData.objeto && seVe(m)) tocables.push(m); });
    const hit = raycaster.intersectObjects(tocables, false)[0];
    return hit ? hit.object.userData : null;
  }

  // Cámara: mover el centro y el zoom de forma suave
  function moverCamara(destino, zoomDestino, dur = 700) {
    const desde = centro.clone(), z0 = zoom;
    anim.ir({
      desde: 0, hasta: 1, dur,
      aplicar: (t) => { centro.lerpVectors(desde, destino, t); zoom = lerp(z0, zoomDestino, t); camara.zoom = zoom; camara.updateProjectionMatrix(); ubicarCamara(); },
    });
    sucio = true;
  }

  // Gestos: tocar = elegir, deslizar en horizontal = girar 90°, pellizcar o rueda = zoom, pasar el mouse = ver dato
  const punteros = new Map();
  let pellizco = null, huboMulti = false, pasoPendiente = null;
  const distancia = () => { const [a, b] = [...punteros.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  lienzo.addEventListener('pointerdown', (e) => {
    punteros.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
    if (punteros.size === 2) { pellizco = { d0: distancia(), z0: zoom }; huboMulti = true; }
  });
  lienzo.addEventListener('pointermove', (e) => {
    const p = punteros.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (pellizco && punteros.size === 2) api.zoom(pellizco.z0 * (distancia() / Math.max(pellizco.d0, 1)), true);
    if (!p && e.pointerType === 'mouse') {
      if (!pasoPendiente) requestAnimationFrame(() => {
        const ev = pasoPendiente; pasoPendiente = null;
        const hit = elegir(ev.clientX, ev.clientY);
        lienzo.style.cursor = hit ? 'pointer' : 'grab';
        const r = contenedor.getBoundingClientRect();
        alPasar?.(hit, ev.clientX - r.left, ev.clientY - r.top);
      });
      pasoPendiente = e;
    }
  });
  lienzo.addEventListener('pointerleave', () => { alPasar?.(null); });
  const soltar = (e) => {
    const p = punteros.get(e.pointerId); punteros.delete(e.pointerId);
    if (punteros.size < 2) pellizco = null;
    if (!p || e.type === 'pointercancel') { if (!punteros.size) huboMulti = false; return; }
    if (huboMulti) { if (!punteros.size) huboMulti = false; return; }
    const dx = p.x - p.x0, dy = p.y - p.y0;
    if (Math.hypot(dx, dy) < 10) {
      const hit = elegir(p.x, p.y);
      if (hit) alSeleccionar(hit.objeto, hit.producto);
    } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      api.girar(dx > 0 ? -1 : 1);
    }
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('wheel', (e) => { e.preventDefault(); api.zoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });

  const observador = new ResizeObserver(() => encuadrar());
  observador.observe(contenedor);

  const api = {
    actualizar(m, ref) {
      for (const o of objetos) o.actualizar(m, ref);
      sucio = true;
    },
    seleccionar(id, productoId) {
      if (seleccion) { resaltar(seleccion.id, false); porId.get(seleccion.id)?.seleccionar?.(false); }
      seleccion = { id, productoId };
      resaltar(id, true);
      porId.get(id)?.seleccionar?.(true, productoId);
      sucio = true;
    },
    deseleccionar() {
      if (!seleccion) return;
      resaltar(seleccion.id, false); porId.get(seleccion.id)?.seleccionar?.(false);
      seleccion = null; sucio = true;
    },
    // Acerca la cámara a un objeto. "subir" corre el objeto hacia arriba de la pantalla (para la hoja del celular).
    enfocar(id, { subir = 0 } = {}) {
      const o = porId.get(id); if (!o) return;
      const z = Math.max(zoomGeneral, o.zoomFoco || 1.8);
      const destino = new THREE.Vector3(o.grupo.position.x, o.focoY ?? 1, o.grupo.position.z);
      if (subir) {
        const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(camara.quaternion);
        destino.addScaledVector(arriba, -subir * (medioAlto / z));
      }
      moverCamara(destino, z);
    },
    vistaGeneral() { moverCamara(CENTRO_GENERAL.clone(), zoomGeneral); },
    // Tu personaje camina hasta la zona; cuando llega, llama a alLlegar. La cámara lo acompaña.
    irA(id, { nombre = '', alLlegar } = {}) {
      rotuloDuenioDestino.textContent = nombre ? ` → ${nombre}` : '';
      rotuloDuenio.classList.add('caminando');
      const terminar = () => {
        rotuloDuenioDestino.textContent = '';
        rotuloDuenio.classList.remove('caminando');
        alLlegar?.();
      };
      const ms = duenio.irA(id, { reducido: anim.reducido || !movimiento, cb: terminar });
      if (ms > 0) {
        const o = porId.get(id);
        const destino = new THREE.Vector3(o.grupo.position.x, o.focoY ?? 1, o.grupo.position.z);
        // A mitad de camino entre donde estás y la zona, para que se vea la caminata.
        destino.x = (destino.x + duenio.grupo.position.x) / 2;
        destino.z = (destino.z + duenio.grupo.position.z) / 2;
        moverCamara(destino, Math.max(zoomGeneral, 1.25), Math.max(600, ms * 0.8));
      }
      sucio = true;
      return ms;
    },
    detenerDuenio() { duenio.detener(); rotuloDuenioDestino.textContent = ''; rotuloDuenio.classList.remove('caminando'); },
    get duenioCaminando() { return duenio.caminando; },
    girar(dir) {
      const desde = yaw; yawDestino += (dir * Math.PI) / 2;
      anim.ir({ desde, hasta: yawDestino, aplicar: (a) => { yaw = a; ubicarCamara(); }, dur: 550 });
    },
    zoom(z, inmediato = false) {
      const destino = clamp(z, 0.75, 3.2);
      const aplicar = (val) => { zoom = val; camara.zoom = val; camara.updateProjectionMatrix(); sucio = true; };
      if (inmediato) aplicar(destino); else anim.ir({ desde: zoom, hasta: destino, aplicar, dur: 220 });
      if (!seleccion) zoomGeneral = destino;
    },
    obtenerZoom: () => zoom,
    centrar() {
      const desde = yaw; yawDestino = Math.PI / 4;
      anim.ir({ desde, hasta: yawDestino, aplicar: (a) => { yaw = a; ubicarCamara(); }, dur: 550 });
      zoomGeneral = 1;
      moverCamara(CENTRO_GENERAL.clone(), 1);
    },
    filtrarProductos(estado) { porId.get('productos').filtrar(estado); sucio = true; },
    setNoche(activa) {
      const desde = noche, hasta = activa ? 1 : 0;
      anim.ir({
        desde, hasta, dur: 700,
        aplicar: (val) => { noche = val; hemi.intensity = lerp(2.2, 0.45, val); sol.intensity = lerp(1.5, 0.15, val); local.setNoche(val); sucio = true; },
      });
    },
    encender() { local.encender(); },
    setMovimiento(activo) {
      movimiento = activo; anim.reducido = !activo;
      if (!activo) { duenio.terminar(); anim.terminar(); }
      sucio = true;
    },
    destruir() { cancelAnimationFrame(raf); observador.disconnect(); renderer.dispose(); lienzo.remove(); },
  };

  ubicarCamara();
  encuadrar();
  local.setNoche(0);
  raf = requestAnimationFrame(bucle);
  return api;
}
