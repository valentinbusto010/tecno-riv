// Capa de datos: lee la copia de las tablas y revisa que esté completa.
// En tu PC lee los archivos de /data en claro. En la versión publicada solo existe
// data/datos.cifrados.json, y hace falta la clave para abrirlo.
export const ARCHIVOS = ['fuente', 'productos', 'pedidos', 'clientes', 'mensajes_dia', 'piezas', 'gastos'];

export async function leerDatosPlanos(base = './data/') {
  const entradas = await Promise.all(
    ARCHIVOS.map(async (nombre) => {
      const r = await fetch(`${base}${nombre}.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`No se pudo leer data/${nombre}.json (${r.status}).`);
      return [nombre, await r.json()];
    }),
  );
  return Object.fromEntries(entradas);
}

export async function cargarDatos(base = './data/', { pedirClave } = {}) {
  const prueba = await fetch(`${base}fuente.json`, { cache: 'no-store' }).catch(() => null);
  if (prueba && prueba.ok) {
    const datos = await leerDatosPlanos(base);
    return { datos, avisos: revisarDatos(datos), cifrado: false };
  }
  const r = await fetch(`${base}datos.cifrados.json`, { cache: 'no-store' }).catch(() => null);
  if (!r || !r.ok) throw new Error('No se encontraron los datos de la maqueta.');
  const paquete = await r.json();
  if (!pedirClave) throw new Error('Los datos están cifrados y hace falta la clave.');
  const datos = await pedirClave(paquete);
  for (const k of ARCHIVOS) if (!(k in datos)) throw new Error(`Al paquete cifrado le falta ${k}.`);
  return { datos, avisos: revisarDatos(datos), cifrado: true, creado: paquete.creado };
}

export function revisarDatos(d) {
  const avisos = [];
  for (const k of ARCHIVOS.slice(1)) {
    if (!Array.isArray(d[k])) avisos.push(`data/${k}.json no es una lista.`);
  }
  const c = d.fuente.control || {};
  const comparar = (etiqueta, real, esperado) => {
    if (esperado !== undefined && real !== esperado) avisos.push(`${etiqueta}: hay ${real} y la base tenía ${esperado}.`);
  };
  comparar('Pedidos', d.pedidos.length, c.pedidos);
  comparar('Productos', d.productos.length, c.productos);
  comparar('Clientes', d.clientes.length, c.clientes);
  comparar('Gastos del negocio', d.gastos.length, c.gastos_negocio);
  comparar('Mensajes', d.mensajes_dia.reduce((a, m) => a + m.de_clientes + m.del_bot, 0), c.mensajes);
  const ids = new Set();
  for (const p of d.pedidos) {
    if (ids.has(p.id)) avisos.push(`El pedido ${p.id} está repetido.`);
    ids.add(p.id);
  }
  return avisos;
}
