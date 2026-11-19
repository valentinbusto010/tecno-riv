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
  marketing: [-6.95, -1.0], camioneta: [4.0, 6.4], meta: [-6.95, 0.55],
};
const LOCAL = { x0: -7, x1: 7, z0: -6, z1: 4, alto: 3.6 };

const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Materiales y formas ----------

// Números al azar repetibles: las texturas salen siempre iguales.
function azar(semilla) { let s = semilla >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const texturas = new Map();
function texturaMadera(color) {
  if (texturas.has('madera' + color)) return texturas.get('madera' + color);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = azar(color);
  const base = new THREE.Color(color);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y = r() * 256, alto = 1 + r() * 3, oscuro = r() < 0.6;
    g.fillStyle = oscuro ? `rgba(60,35,15,${0.05 + r() * 0.12})` : `rgba(255,240,215,${0.05 + r() * 0.1})`;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 40 + i) * 3 * r());
    g.lineTo(256, y + alto); g.lineTo(0, y + alto); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texturas.set('madera' + color, t);
  return t;
}
function texturaAsfalto() {
  if (texturas.has('asfalto')) return texturas.get('asfalto');
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = azar(7);
  g.fillStyle = '#4b5263'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(55 + r() * 50);
    g.fillStyle = `rgba(${v},${v + 4},${v + 12},${0.35 + r() * 0.4})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1.5);
  texturas.set('asfalto', t);
  return t;
}

function mat(color, extra = {}) {
  const esMadera = color === C.madera || color === C.maderaOscura;
  return new THREE.MeshStandardMaterial({
    color: esMadera ? 0xffffff : color, roughness: esMadera ? 0.55 : 0.75, metalness: 0, envMapIntensity: 0.6,
    ...(esMadera ? { map: texturaMadera(color) } : {}), ...extra,
  });
}
const metal = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.75, envMapIntensity: 1, ...extra });
const vidrioMat = (extra = {}) => new THREE.MeshPhysicalMaterial({
  color: C.vidrio, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, envMapIntensity: 1.4, depthWrite: false, ...extra,
});

// Caja con bordes redondeados: los vértices cerca de los bordes se llevan a un arco y las normales
// se calculan a mano para que la luz no marque costuras.
const geometrias = new Map();
function geoRedondeada(w, h, d, radio = 0.035) {
  const r = Math.max(0.001, Math.min(radio, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const clave = [w, h, d, r].map((n) => n.toFixed(4)).join('|');
  if (geometrias.has(clave)) return geometrias.get(clave);
  const g = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5);
  const lado = (m) => [-m, -m + 0.586 * r, -m + r, m - r, m - 0.586 * r, m];
  const P = [lado(w / 2), lado(h / 2), lado(d / 2)];
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3(), adentro = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const k = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((t) => Math.round((t + 0.5) * 5));
    v.set(P[0][k[0]], P[1][k[1]], P[2][k[2]]);
    adentro.set(clamp(v.x, -w / 2 + r, w / 2 - r), clamp(v.y, -h / 2 + r, h / 2 - r), clamp(v.z, -d / 2 + r, d / 2 - r));
    n.subVectors(v, adentro);
    if (n.lengthSq() > 1e-12) { n.normalize(); v.copy(adentro).addScaledVector(n, r); }
    else n.fromBufferAttribute(nor, i);
    pos.setXYZ(i, v.x, v.y, v.z); nor.setXYZ(i, n.x, n.y, n.z);
  }
  g.computeBoundingSphere();
  geometrias.set(clave, g);
  return g;
}
function caja(w, h, d, color, extra, radio) {
  const r = radio ?? Math.min(0.035, Math.min(w, h, d) * 0.25);
  return new THREE.Mesh(geoRedondeada(w, h, d, r), mat(color, extra));
}
function cilindro(r, h, color, seg = 24) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(color)); }
function capsula(r, largo, color) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, largo, 6, 14), mat(color)); }

// Reflejos: un "estudio de fotos" chico que se convierte en mapa de entorno (día y noche).
function crearEntornos(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hacer = (fondo, luces) => {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: fondo, side: THREE.BackSide })));
    for (const [x, y, z, w, h, color, fuerza] of luces) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(fuerza), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    }
    const t = pmrem.fromScene(s, 0.035).texture;
    s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    return t;
  };
  const dia = hacer(0x7d8aa3, [[0, 12, 0, 14, 14, 0xffffff, 3.2], [12, 4, 5, 6, 8, 0xe6f1ff, 2.2], [-12, 5, -3, 6, 6, 0xfff0dc, 1.6], [0, 4, -12, 10, 3, 0x1eb6ff, 1.4]]);
  const noche = hacer(0x0b1020, [[0, 12, 0, 10, 10, 0x9fb6d8, 0.7], [0, 4, -12, 10, 3, 0x1eb6ff, 2.6], [12, 3, 5, 3, 3, 0xffd98a, 1.2]]);
  pmrem.dispose();
  return { dia, noche };
}
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
    // Lo que se agregue mientras corre este paso (por ejemplo, al llegar a una zona) no se pierde.
    const actuales = this.lista;
    this.lista = [];
    const siguen = actuales.filter((tw) => {
      if (ahora < tw.t0) return true;
      const p = clamp((ahora - tw.t0) / tw.dur, 0, 1);
      tw.aplicar(lerp(tw.desde, tw.hasta, tw.ease(p)));
      return p < 1;
    });
    this.lista = siguen.concat(this.lista);
    return true;
  }
  terminar() {
    // Si al terminar una animación se arma otra, también se termina (con un tope por las dudas).
    for (let vuelta = 0; vuelta < 5 && this.lista.length; vuelta++) {
      const l = this.lista; this.lista = [];
      for (const tw of l) tw.aplicar(tw.hasta);
    }
    this.lista = [];
  }
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

  // Piso de baldosas con un poco de brillo: refleja el cartel y las luces
  const piso = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.2, fondo), mat(0xe9edf3, { map: texturaBaldosas(), roughness: 0.42, envMapIntensity: 0.45 }));
  piso.userData.sinSombraPropia = true;
  piso.position.set((x0 + x1) / 2, -0.1, (z0 + z1) / 2); g.add(piso);

  // Vereda, cordón y calle
  const vereda = caja(ancho, 0.16, 1.2, C.vereda); vereda.position.set(0, -0.12, z1 + 0.6); g.add(vereda);
  const cordon = caja(ancho, 0.18, 0.12, C.cordon); cordon.position.set(0, -0.11, z1 + 1.26); g.add(cordon);
  const calle = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.1, 2.8), mat(0xffffff, { map: texturaAsfalto(), roughness: 0.92 }));
  calle.position.set(0, -0.2, z1 + 2.72); calle.userData.sinSombraPropia = true; g.add(calle);
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
  const vidMat = vidrioMat();
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
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 14), metal(C.grisOscuro)); poste.position.set(-5.5, 1.2, z1 + 1.0); g.add(poste);
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
  const geo = geoRedondeada(S, S, S, 0.035);
  const ok = new THREE.InstancedMesh(geo, mat(C.celeste, { roughness: 0.6 }), MAX);
  const bajo = new THREE.InstancedMesh(geo, mat(C.ambar, { roughness: 0.6 }), MAX);
  const agot = new THREE.InstancedMesh(geoRedondeada(0.3, 0.05, 0.3, 0.015), mat(C.rojo), 40);
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
  const geoCajita = geoRedondeada(0.17, 0.24, 0.18, 0.025);
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
  // Monedas para festejar una venta nueva (no son datos: solo el festejo)
  const monedas = [];
  const geoMoneda = new THREE.CylinderGeometry(0.055, 0.055, 0.016, 20);
  const oro = metal(0xe6b84a, { roughness: 0.25 });
  for (let i = 0; i < 12; i++) { const mo = new THREE.Mesh(geoMoneda, oro); mo.visible = false; mo.castShadow = true; g.add(mo); monedas.push(mo); }
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
    // Venta nueva: se abre el cajón y saltan monedas que caen sobre el mostrador
    celebrar() {
      anim.ir({ desde: cajon.position.z, hasta: 0.45, aplicar: (v) => { cajon.position.z = v; }, dur: 250 });
      anim.ir({ desde: 0.45, hasta: 0.05, aplicar: (v) => { cajon.position.z = v; }, dur: 400, demora: 1500 });
      monedas.forEach((mo, i) => {
        const ang = (i / monedas.length) * Math.PI * 2, dist = 0.25 + (i % 3) * 0.12;
        const x1 = 0.7 + Math.cos(ang) * dist, z1 = 0.05 + Math.sin(ang) * dist * 0.6;
        mo.visible = true; mo.position.set(0.7, 1.3, 0.05);
        anim.ir({
          desde: 0, hasta: 1, dur: 700, demora: i * 35, ease: (t) => t,
          aplicar: (t) => {
            mo.position.x = lerp(0.7, x1, t); mo.position.z = lerp(0.05, z1, t);
            mo.position.y = 1.3 + Math.sin(t * Math.PI) * 0.55 - t * 0.21;
            mo.rotation.x = t * 9 + i; mo.rotation.z = t * 5;
          },
        });
        anim.ir({ desde: 1, hasta: 0, dur: 1, demora: 2600 + i * 20, aplicar: (t) => { if (t <= 0) mo.visible = false; } });
      });
    },
  };
}

function crearGanancia(anim) {
  const g = new THREE.Group();
  const mesa = caja(1.6, 0.8, 0.9, C.blanco); mesa.position.y = 0.4; g.add(mesa);
  const tapa = caja(1.7, 0.06, 1.0, C.madera); tapa.position.y = 0.83; g.add(tapa);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.08, 32), metal(0x9aa3b5)); base.position.y = 0.9; g.add(base);
  const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 16), metal(0xc8ced9)); poste.position.y = 1.45; g.add(poste);
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
  const piernas = capsula(0.12, 0.3, C.noche); piernas.position.y = 0.27; piernas.scale.x = 1.25; p.add(piernas);
  const cuerpo = capsula(0.18, 0.34, color); cuerpo.position.y = 0.72; cuerpo.material.roughness = 0.85; p.add(cuerpo);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), mat(0xe8c4a0, { roughness: 0.6 })); cabeza.position.y = 1.12; p.add(cabeza);
  const pelo = new THREE.Mesh(new THREE.SphereGeometry(0.147, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(0x2a1d14)); pelo.position.y = 1.13; pelo.rotation.x = -0.35; p.add(pelo);
  return p;
}

function crearClientes(anim) {
  const g = new THREE.Group();
  // Atril con el celular del bot de WhatsApp
  const atril = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 16), metal(0xb9c1cf)); atril.position.set(0, 0.5, 0); g.add(atril);
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
    // Dónde están parados los clientes y el atril (para que tu personaje los esquive al manejarlo)
    obstaculos() {
      const lista = [[g.position.x, g.position.z, 0.35]];
      for (const p of gente) if (p.visible) lista.push([g.position.x + p.position.x, g.position.z + p.position.z, 0.24]);
      return lista;
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

// Meta del mes: termómetro de neón en la pared izquierda. Se llena con lo facturado en el mes.
function crearMeta(anim) {
  const g = new THREE.Group();
  const placa = caja(0.06, 2.75, 0.62, C.noche); placa.position.set(0.03, 1.62, 0); g.add(placa);
  const borde = caja(0.04, 2.83, 0.7, C.celeste, { emissive: C.neon, emissiveIntensity: 0.35 }); borde.position.set(0.01, 1.62, 0); g.add(borde);
  // Letrero "META"
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const ctx = c.getContext('2d');
  const dibujar = () => {
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = '64px "Archivo Black", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#1eb6ff'; ctx.shadowBlur = 18; ctx.fillStyle = '#d9f5ff'; ctx.fillText('META', 128, 52);
  };
  dibujar();
  const texLetrero = new THREE.CanvasTexture(c); texLetrero.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.load('64px "Archivo Black"').then(() => { dibujar(); texLetrero.needsUpdate = true; }).catch(() => {});
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.2), new THREE.MeshBasicMaterial({ map: texLetrero, transparent: true, toneMapped: false, depthWrite: false }));
  letrero.position.set(0.075, 2.82, 0); letrero.rotation.y = Math.PI / 2; g.add(letrero);
  // Tubo de vidrio, relleno y bulbo
  const ALTO = 2.0, BASE = 0.62;
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, ALTO, 24, 1, true), vidrioMat({ opacity: 0.25, side: THREE.DoubleSide }));
  tubo.position.set(0.2, BASE + ALTO / 2, 0); g.add(tubo);
  const geoRelleno = new THREE.CylinderGeometry(0.075, 0.075, 1, 20); geoRelleno.translate(0, 0.5, 0);
  const matRelleno = new THREE.MeshStandardMaterial({ color: C.celeste, emissive: C.neon, emissiveIntensity: 1.1, roughness: 0.3, toneMapped: false });
  const relleno = new THREE.Mesh(geoRelleno, matRelleno); relleno.position.set(0.2, BASE, 0); relleno.scale.y = 0.001; g.add(relleno);
  const bulbo = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), matRelleno); bulbo.position.set(0.2, BASE - 0.08, 0); g.add(bulbo);
  // Marcas cada 25 %
  for (let i = 1; i <= 4; i++) {
    const marca = caja(0.02, 0.015, i === 4 ? 0.34 : 0.22, 0xd9f5ff, { emissive: 0xd9f5ff, emissiveIntensity: 0.6 });
    marca.position.set(0.08, BASE + (ALTO * i) / 4, -0.22); g.add(marca);
  }
  marcar(g, 'meta');
  // Papelitos para festejar
  const papelitos = [];
  const colores = [C.celeste, C.neon, 0xffffff, C.verde, C.ambar];
  for (let i = 0; i < 36; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.04), new THREE.MeshBasicMaterial({ color: colores[i % colores.length], side: THREE.DoubleSide, toneMapped: false }));
    p.visible = false; g.add(p); papelitos.push(p);
  }
  let progreso = 0;
  return {
    id: 'meta', grupo: g, anclaY: 3.15, focoY: 1.6, zoomFoco: 2.0,
    actualizar(m) {
      const meta = m.meta;
      const hasta = meta && meta.meta ? clamp(meta.progreso, 0, 1) : 0;
      const llegaste = !!(meta && meta.alcanzada);
      matRelleno.color.setHex(llegaste ? C.verde : C.celeste);
      matRelleno.emissive.setHex(llegaste ? 0x3dd68c : C.neon);
      tubo.material.opacity = meta && meta.meta ? 0.25 : 0.12;
      anim.ir({ desde: progreso, hasta, dur: 1100, aplicar: (v) => { progreso = v; relleno.scale.y = Math.max(0.001, v * ALTO); } });
    },
    festejar() {
      papelitos.forEach((p, i) => {
        const x = 0.4 + Math.random() * 1.6, z = (Math.random() - 0.5) * 1.6, giro = (Math.random() - 0.5) * 12;
        p.visible = true; p.position.set(0.3, 3.0, 0);
        anim.ir({
          desde: 0, hasta: 1, dur: 1800 + Math.random() * 700, demora: i * 25, ease: (t) => t,
          aplicar: (t) => {
            p.position.set(lerp(0.3, x, Math.min(1, t * 1.6)), 3.0 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.6 - t * 2.9, lerp(0, z, t));
            p.rotation.set(t * giro, t * giro * 0.7, t * 3);
            if (t >= 1) p.visible = false;
          },
        });
      });
    },
  };
}

// Ploteo de los costados: TECNO RIV + "Envíos · Río Cuarto" con la franja celeste
function texturaPloteo() {
  if (texturas.has('ploteo')) return texturas.get('ploteo');
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0a8fd6';
  g.beginPath(); g.moveTo(0, 200); g.bezierCurveTo(300, 150, 650, 250, 1024, 170); g.lineTo(1024, 256); g.lineTo(0, 256); g.fill();
  g.fillStyle = '#1eb6ff';
  g.beginPath(); g.moveTo(0, 228); g.bezierCurveTo(320, 190, 700, 270, 1024, 205); g.lineTo(1024, 222); g.bezierCurveTo(700, 285, 320, 205, 0, 244); g.fill();
  g.textBaseline = 'middle';
  g.font = '112px "Archivo Black", "Arial Black", sans-serif';
  const a = 'TECNO ', wa = g.measureText(a).width;
  g.fillStyle = '#0e1630'; g.fillText(a, 36, 84);
  g.fillStyle = '#0a8fd6'; g.fillText('RIV', 36 + wa, 84);
  g.font = '700 40px "Montserrat", "Segoe UI", sans-serif'; g.fillStyle = '#0e1630';
  g.fillText('Envíos · Río Cuarto · @tecno_riv', 40, 158);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texturas.set('ploteo', t);
  return t;
}

// Camioneta de envíos tipo utilitario: el perfil lateral se extruye a lo ancho con bordes biselados.
// Largo en z (trompa hacia +z), ancho en x. Sin marcas de autos: solo el ploteo de Tecno Riv.
function furgonEnvios(lucesDelanteras, lucesTraseras) {
  const f = new THREE.Group();
  const ANCHO = 0.86, BISEL = 0.045;
  const perfil = new THREE.Shape();
  perfil.moveTo(-1.0, 0.16);
  perfil.lineTo(-1.0, 1.08); perfil.quadraticCurveTo(-1.0, 1.12, -0.95, 1.12);
  perfil.lineTo(0.3, 1.12); perfil.quadraticCurveTo(0.36, 1.12, 0.39, 1.07);
  perfil.lineTo(0.66, 0.72); perfil.quadraticCurveTo(0.7, 0.67, 0.76, 0.66);
  perfil.lineTo(0.92, 0.61); perfil.quadraticCurveTo(1.0, 0.58, 1.0, 0.48);
  perfil.lineTo(1.0, 0.2); perfil.quadraticCurveTo(1.0, 0.16, 0.95, 0.16);
  perfil.lineTo(-1.0, 0.16);
  // bevelOffset = -BISEL: el bisel queda dentro del perfil y la carrocería mide exactamente lo dibujado
  const geo = new THREE.ExtrudeGeometry(perfil, { depth: ANCHO - 2 * BISEL, bevelEnabled: true, bevelThickness: BISEL, bevelSize: BISEL, bevelOffset: -BISEL, bevelSegments: 4, curveSegments: 8 });
  const LADO = ANCHO / 2 + 0.004; // superficie de los costados
  geo.translate(0, 0, -(ANCHO - 2 * BISEL) / 2);
  geo.rotateY(-Math.PI / 2);
  const pintura = new THREE.MeshPhysicalMaterial({ color: 0xf4f6fa, roughness: 0.28, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.1 });
  const carroceria = new THREE.Mesh(geo, pintura); f.add(carroceria);

  const vidrioOscuro = new THREE.MeshPhysicalMaterial({ color: 0x15203a, roughness: 0.05, metalness: 0.3, clearcoat: 1, envMapIntensity: 1.6 });
  const plastico = mat(0x2b3242, { roughness: 0.65 });
  const pieza = (w, h, d, material, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geoRedondeada(w, h, d, Math.min(0.02, Math.min(w, h, d) * 0.3)), material);
    m.position.set(x, y, z); m.rotation.x = rx; f.add(m); return m;
  };
  // Parabrisas, siguiendo la inclinación entre el techo y el capó
  const inclinacion = Math.atan2(0.39 - 0.66, 1.07 - 0.72);
  pieza(ANCHO - 0.12, 0.42, 0.015, vidrioOscuro, 0, 0.905, 0.535, inclinacion);
  // Ventanillas de las puertas delanteras
  for (const lado of [-1, 1]) pieza(0.012, 0.25, 0.34, vidrioOscuro, lado * LADO, 0.88, 0.2);
  // Ploteo en los dos costados de la caja de carga (cada uno mira hacia afuera y se lee derecho)
  const plotMat = new THREE.MeshStandardMaterial({ map: texturaPloteo(), transparent: true, roughness: 0.35, envMapIntensity: 0.8, depthWrite: false });
  for (const lado of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), plotMat);
    p.position.set(lado * (LADO + 0.002), 0.62, -0.32);
    p.rotation.y = lado * Math.PI / 2;
    p.renderOrder = 3;
    f.add(p);
  }
  // Puerta corrediza, puertas traseras y riel
  for (const lado of [-1, 1]) {
    pieza(0.006, 0.82, 0.008, plastico, lado * LADO, 0.6, 0.05);
    pieza(0.006, 0.82, 0.008, plastico, lado * LADO, 0.6, -0.62);
    pieza(0.008, 0.012, 0.7, plastico, lado * LADO, 1.0, -0.28);
  }
  pieza(0.008, 0.86, 0.006, plastico, 0, 0.62, -1.005);
  // Paragolpes, guardabarros, parrilla y espejos
  pieza(ANCHO + 0.06, 0.13, 0.1, plastico, 0, 0.24, 1.0);
  pieza(ANCHO + 0.06, 0.13, 0.1, plastico, 0, 0.24, -1.02);
  pieza(ANCHO + 0.02, 0.09, 1.9, plastico, 0, 0.21, 0);
  pieza(ANCHO - 0.34, 0.08, 0.02, plastico, 0, 0.42, 1.0 + 0.012);
  for (const lado of [-1, 1]) {
    pieza(0.05, 0.11, 0.08, plastico, lado * (ANCHO / 2 + 0.1), 0.86, 0.48);
    pieza(0.07, 0.02, 0.02, plastico, lado * (ANCHO / 2 + 0.05), 0.84, 0.5);
  }
  // Faros (se prenden de noche) y luces traseras
  for (const lado of [-1, 1]) {
    const faro = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.35, roughness: 0.1 });
    lucesDelanteras.push(faro);
    pieza(0.17, 0.07, 0.03, faro, lado * 0.29, 0.53, 0.985);
    const trasera = new THREE.MeshStandardMaterial({ color: 0xb01515, emissive: 0xff2a2a, emissiveIntensity: 0.5, roughness: 0.3 });
    lucesTraseras.push(trasera);
    pieza(0.06, 0.28, 0.02, trasera, lado * 0.37, 0.6, -1.008);
  }
  // Ruedas con cubierta y llanta
  const cubierta = mat(0x1a1d24, { roughness: 0.9 }), llanta = metal(0xaab2c0);
  const ruedas = [];
  for (const [x, z] of [[-0.42, 0.6], [0.42, 0.6], [-0.42, -0.62], [0.42, -0.62]]) {
    const r = new THREE.Group(); r.position.set(x, 0.02, z);
    const goma = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.13, 26), cubierta); goma.rotation.z = Math.PI / 2; r.add(goma);
    const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.135, 18), llanta); aro.rotation.z = Math.PI / 2; r.add(aro);
    const rayo = new THREE.Mesh(new THREE.BoxGeometry(0.136, 0.15, 0.03), llanta); r.add(rayo);
    f.add(r); ruedas.push(r);
  }
  // Las ruedas giran según cuánto avanza
  f.userData.girarRuedas = (avance) => { for (const r of ruedas) r.rotation.x += avance / 0.17; };
  return f;
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
  const lucesDelanteras = [], lucesTraseras = [];
  const furgones = { pendiente: furgonEnvios(lucesDelanteras, lucesTraseras), entregado: furgonEnvios(lucesDelanteras, lucesTraseras) };
  for (const f of Object.values(furgones)) { f.rotation.y = Math.PI; g.add(f); } // la trompa mira a la vidriera
  marcar(g, 'camioneta');
  const visibles = { pendiente: false, entregado: false };
  for (const [estado, f] of Object.entries(furgones)) { f.position.set(LUGARES[estado], 0, 0.3); f.visible = false; }
  return {
    id: 'camioneta', grupo: g, anclaY: 1.6, lugares: LUGARES, focoY: 0.4, zoomFoco: 1.9,
    actualizar(m) {
      const cuenta = { pendiente: m.pedidos.pendientes, entregado: m.pedidos.entregados };
      for (const [estado, f] of Object.entries(furgones)) {
        const ver = cuenta[estado] > 0;
        if (ver && !visibles[estado]) {
          f.visible = true;
          // Entra desde la calle y se estaciona en el lugar de su estado: es un cambio de estado, no un recorrido real.
          let previo = 2.8;
          anim.ir({ desde: 2.8, hasta: 0.3, dur: 1100, aplicar: (v) => { f.position.z = v; f.userData.girarRuedas(previo - v); previo = v; } });
        }
        if (!ver) f.visible = false;
        visibles[estado] = ver;
      }
    },
    setNoche(v) {
      for (const m of lucesDelanteras) m.emissiveIntensity = lerp(0.35, 3.0, v);
      for (const m of lucesTraseras) m.emissiveIntensity = lerp(0.5, 2.2, v);
    },
    // Día con envíos (máquina del tiempo): la camioneta de entregados sale a repartir y vuelve.
    // Es solo una animación del estado; no muestra recorridos reales.
    salirYVolver() {
      const f = furgones.entregado;
      if (!f.visible || f.userData.enViaje) return;
      f.userData.enViaje = true;
      const x0 = LUGARES.entregado;
      let pz = 0.3, px = x0;
      const mover = (z, x) => { f.userData.girarRuedas(Math.abs(z - pz) + Math.abs(x - px)); pz = z; px = x; f.position.set(x, 0, z); };
      anim.ir({ desde: 0.3, hasta: 1.6, dur: 500, aplicar: (z) => mover(z, x0) });                       // sale de culata
      anim.ir({ desde: Math.PI, hasta: Math.PI / 2, dur: 400, demora: 500, aplicar: (r) => { f.rotation.y = r; } }); // gira hacia la calle
      anim.ir({ desde: x0, hasta: 7.5, dur: 700, demora: 850, ease: (t) => t * t, aplicar: (x) => mover(1.6, x) }); // se va
      anim.ir({ desde: 0, hasta: 1, dur: 1, demora: 1600, aplicar: () => { f.visible = false; } });
      anim.ir({ desde: 0, hasta: 1, dur: 1, demora: 2300, aplicar: () => { f.visible = true; px = -9; mover(1.6, -9); } }); // vuelve por el otro lado
      anim.ir({ desde: -9, hasta: x0, dur: 900, demora: 2300, aplicar: (x) => mover(1.6, x) });
      anim.ir({ desde: Math.PI / 2, hasta: Math.PI, dur: 400, demora: 3200, aplicar: (r) => { f.rotation.y = r; } });
      anim.ir({ desde: 1.6, hasta: 0.3, dur: 500, demora: 3550, aplicar: (z) => mover(z, x0) });
      anim.ir({ desde: 0, hasta: 1, dur: 1, demora: 4100, aplicar: () => { f.userData.enViaje = false; } });
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
  meta: { p: [-6.0, 0.55], mira: [-1, 0] },         // frente al termómetro de la pared
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
  ['ganancia', 'este'], ['este', 'productos'], ['detrasCaja', 'productos'], ['izquierda', 'meta'],
];
const NODOS = { ...PASOS, ...Object.fromEntries(Object.entries(PARADAS).map(([k, v]) => [k, v.p])) };

// Para manejar a tu personaje: rectángulos que no se pueden atravesar [x0, z0, x1, z1] y círculos [x, z, radio].
const OBSTACULOS = [
  [-2.35, -1.95, 1.15, -0.85],   // mostrador de la caja
  [1.85, -1.8, 3.55, -0.8],      // mesa de la ganancia
  [3.0, -6.1, 7.1, -5.1],        // estante de productos
  [-7.1, -2.9, -4.45, -2.7],     // tabique del depósito (frente)
  [-3.68, -6.1, -3.52, -2.75],   // tabique del depósito (costado)
  [-7.1, -1.9, -6.5, -0.1],      // pantalla de marketing
  [-7.1, 0.15, -6.7, 0.95],      // termómetro de la meta
  [-7.1, 3.9, -1.0, 4.1], [1.0, 3.9, 7.1, 4.1], // vidriera (la puerta queda libre)
];
const CIRCULOS_FIJOS = [[6.3, -2.0, 0.4], [-1.5, 3.5, 0.3], [1.5, 3.5, 0.3], [-5.5, 5.0, 0.12]]; // plantas y farola
const LIMITES = { x0: -6.85, x1: 6.85, z0: -5.85, z1: 5.15 }; // adentro del local y la vereda
const RADIO_DUENIO = 0.22;

function puedeEstar(x, z, circulos) {
  if (x < LIMITES.x0 || x > LIMITES.x1 || z < LIMITES.z0 || z > LIMITES.z1) return false;
  for (const [a, b, c, d] of OBSTACULOS) {
    if (x > a - RADIO_DUENIO && x < c + RADIO_DUENIO && z > b - RADIO_DUENIO && z < d + RADIO_DUENIO) return false;
  }
  for (const [cx, cz, r] of circulos) if (Math.hypot(x - cx, z - cz) < r + RADIO_DUENIO) return false;
  return true;
}
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
  let parado = 'centro', quietoManual = true;
  g.position.set(PASOS.centro[0], 0, PASOS.centro[1]);
  g.rotation.y = rumbo;

  const anguloCorto = (desde, hasta) => desde + Math.atan2(Math.sin(hasta - desde), Math.cos(hasta - desde));
  function quieto() { piernaI.rotation.x = piernaD.rotation.x = 0; brazoI.rotation.x = brazoD.rotation.x = 0; cuerpo.position.y = 0; }

  function llegar() {
    ruta = null; parado = destino; quieto(); quietoManual = true;
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
    // Manejo manual: (vx, vz) es la velocidad en el piso. Si choca, prueba deslizarse por un eje.
    manual(vx, vz, dt, circulos) {
      const v = Math.hypot(vx, vz);
      if (v < 0.01) {
        // Quieto: deja las piernas derechas una sola vez (así no corta el gesto de señalar)
        if (!quietoManual) { quieto(); quietoManual = true; }
        return false;
      }
      quietoManual = false;
      if (ruta) { ruta = null; alLlegar = null; }
      parado = null;
      const x = g.position.x, z = g.position.z;
      const nx = x + vx * dt, nz = z + vz * dt;
      // Si un cliente quedó encima tuyo (ellos también se mueven), podés salir igual: solo frenan los muebles.
      const choques = puedeEstar(x, z, circulos) ? circulos : [];
      if (puedeEstar(nx, nz, choques)) { g.position.x = nx; g.position.z = nz; }
      else if (puedeEstar(nx, z, choques)) g.position.x = nx;
      else if (puedeEstar(x, nz, choques)) g.position.z = nz;
      rumbo = Math.atan2(vx, vz);
      g.rotation.y = lerp(g.rotation.y, anguloCorto(g.rotation.y, rumbo), Math.min(1, dt * 14));
      fase += dt * v * 3.4;
      const s = Math.sin(fase);
      piernaI.rotation.x = s * 0.6; piernaD.rotation.x = -s * 0.6;
      brazoI.rotation.x = -s * 0.5; brazoD.rotation.x = s * 0.5;
      cuerpo.position.y = Math.abs(Math.cos(fase)) * 0.04;
      return true;
    },
    // Zona más cercana (si estás a menos de 1,1 de su lugar)
    zonaCercana() {
      let mejor = null, dist = 1.1;
      for (const [id, p] of Object.entries(PARADAS)) {
        const d = Math.hypot(g.position.x - p.p[0], g.position.z - p.p[1]);
        if (d < dist) { mejor = id; dist = d; }
      }
      return mejor;
    },
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

export function crearEscena(contenedor, { rotulos, alSeleccionar, alPasar, alAcercarse }) {
  const lienzo = document.createElement('canvas');
  lienzo.className = 'escena-lienzo';
  lienzo.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Color tipo cine y sombras suaves
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  contenedor.prepend(lienzo);

  const escena = new THREE.Scene();
  const entornos = crearEntornos(renderer);
  escena.environment = entornos.dia;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8d98ad, 0.85); escena.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff6e8, 2.3);
  // El sol viene de adelante a la izquierda: las sombras caen hacia la derecha, donde la cámara las ve.
  sol.position.set(-5, 13, 8);
  sol.castShadow = true;
  // En el celular, sombras más livianas
  const tamSombra = Math.min(window.innerWidth, window.innerHeight) < 720 ? 1024 : 2048;
  sol.shadow.mapSize.set(tamSombra, tamSombra);
  Object.assign(sol.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.025; sol.shadow.radius = 3;
  escena.add(sol); escena.add(sol.target);

  const anim = new Animador();
  const local = crearLocal(anim);
  escena.add(local.grupo);
  let sucio = true;
  local.redibujar = () => { sucio = true; };

  const objetos = [
    crearDeposito(anim), crearProveedores(), crearProductos(anim), crearCaja(anim),
    crearGanancia(anim), crearClientes(anim), crearMarketing(anim), crearCamioneta(anim), crearMeta(anim),
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

  // Sombras: todo lo sólido proyecta y recibe. Lo transparente (vidrios, burbujas, carteles) no proyecta.
  // Se vuelve a aplicar cuando los datos rearman el estante o los productos.
  function aplicarSombras() {
    escena.traverse((o) => {
      if (!o.isMesh) return;
      const transparente = o.material && (o.material.transparent || o.material.isMeshBasicMaterial);
      o.castShadow = !transparente && !o.userData.sinSombraPropia;
      o.receiveShadow = !o.material?.isMeshBasicMaterial;
    });
  }
  aplicarSombras();
  // Solo en la PC, para revisar la escena desde la consola del navegador
  if (location.hostname === 'localhost') window.__maqueta = { escena, renderer, sol, camara: () => camara, duenio, anim };

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
  let manejo = false, zonaCerca = null;
  const direccion = { x: 0, y: 0 };
  function bucle(ahora) {
    raf = requestAnimationFrame(bucle);
    const dt = ultimoCuadro ? Math.min(0.05, (ahora - ultimoCuadro) / 1000) : 0;
    ultimoCuadro = ahora;
    const hayAnim = anim.paso(ahora);
    let hayBucles = false;
    if (movimiento) for (const o of objetos) if (o.cuadro && o.cuadro(ahora / 1000)) hayBucles = true;
    if (manejo) {
      // Lo que pedís en pantalla (arriba = alejarse de la cámara) pasado al piso del local
      const adelante = [-Math.sin(yaw), -Math.cos(yaw)], derecha = [Math.cos(yaw), -Math.sin(yaw)];
      const vx = (derecha[0] * direccion.x + adelante[0] * direccion.y) * 2.8;
      const vz = (derecha[1] * direccion.x + adelante[1] * direccion.y) * 2.8;
      const hayInput = Math.hypot(direccion.x, direccion.y) > 0.01;
      if (hayInput || !duenio.caminando) {
        const circulos = [...CIRCULOS_FIJOS, ...porId.get('clientes').obstaculos()];
        if (duenio.manual(vx, vz, dt, circulos)) hayBucles = true;
      } else if (duenio.cuadro(dt)) hayBucles = true; // tocaste una zona: sigue caminando solo hasta ahí
      // La cámara te sigue
      const objetivo = new THREE.Vector3(duenio.grupo.position.x, 1.0, duenio.grupo.position.z);
      if (centro.distanceTo(objetivo) > 0.01) { centro.lerp(objetivo, Math.min(1, dt * 4)); ubicarCamara(); hayBucles = true; }
      const cerca = duenio.zonaCercana();
      if (cerca !== zonaCerca) { zonaCerca = cerca; alAcercarse?.(cerca); }
    } else if (duenio.cuadro(dt)) hayBucles = true;
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
      aplicarSombras();
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
      if (ms > 0 && !manejo) { // manejando, la cámara ya te sigue
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
    // Modo manejo: vos movés a tu personaje y la cámara te sigue
    setManejo(activo) {
      manejo = activo;
      direccion.x = 0; direccion.y = 0;
      rotuloDuenio.classList.toggle('manejando', activo);
      if (activo) {
        duenio.detener(); rotuloDuenioDestino.textContent = '';
        api.zoom(Math.max(zoom, 1.7));
        zonaCerca = duenio.zonaCercana(); alAcercarse?.(zonaCerca);
      } else {
        zonaCerca = null; alAcercarse?.(null);
        api.vistaGeneral();
      }
      sucio = true;
    },
    // (x, y) entre -1 y 1: derecha e izquierda, arriba (alejarse) y abajo (acercarse)
    setDireccion(x, y) {
      const largo = Math.hypot(x, y);
      direccion.x = largo > 1 ? x / largo : x;
      direccion.y = largo > 1 ? y / largo : y;
    },
    celebrarVenta() { porId.get('caja').celebrar(); sucio = true; },
    festejarMeta() { porId.get('meta').festejar(); sucio = true; },
    envioDelDia() { porId.get('camioneta').salirYVolver(); sucio = true; },
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
        aplicar: (val) => {
          noche = val;
          hemi.intensity = lerp(0.85, 0.28, val); sol.intensity = lerp(2.3, 0.12, val);
          escena.environment = val > 0.5 ? entornos.noche : entornos.dia;
          local.setNoche(val); porId.get('camioneta').setNoche?.(val);
          sucio = true;
        },
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
