// Capa de cálculos: funciones puras. Reciben las tablas y devuelven métricas.
// No tocan el DOM ni la escena.
import { REGLAS } from './config.js';

const DIA_MS = 86400000;

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const sumar = (filas, f) => filas.reduce((a, x) => a + f(x), 0);
const dividir = (a, b) => (b ? a / b : null);

export function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + dias * DIA_MS).toISOString().slice(0, 10);
}

// Períodos relativos a la fecha de carga de los datos.
// 'tiempo' es la máquina del tiempo: todo lo acumulado desde el principio hasta el día elegido.
export function rangoPeriodo(periodo, fechaCarga, diaElegido) {
  const hasta = fechaCarga;
  if (periodo === 'semana') return { id: 'semana', desde: sumarDias(hasta, -6), hasta };
  if (periodo === 'mes') return { id: 'mes', desde: hasta.slice(0, 8) + '01', hasta };
  if (periodo === 'tiempo' && diaElegido) return { id: 'tiempo', desde: null, hasta: diaElegido < hasta ? diaElegido : hasta };
  return { id: 'todo', desde: null, hasta };
}

// Primer día con ventas: desde ahí arranca la máquina del tiempo.
export function primerDiaDatos(datos) {
  const fechas = datos.pedidos.map((p) => p.fecha).filter(Boolean).sort();
  return fechas[0] || datos.fuente.cargado_at.slice(0, 10);
}

// Meta de facturación del mes de la fecha de carga. La meta la elige el dueño; el resto sale de las tablas.
export function calcularMeta(datos, meta) {
  const m = calcularMetricas(datos, 'mes');
  const { desde, hasta } = m.rango;
  const [y, mes] = hasta.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(y, mes, 0)).getUTCDate();
  const diasRestantes = ultimoDia - Number(hasta.slice(8, 10));
  const facturado = m.caja.facturacion;
  const valor = Number(meta) > 0 ? Number(meta) : null;
  const falta = valor === null ? null : Math.max(valor - facturado, 0);
  return {
    mes: hasta.slice(0, 7), desde, hasta, meta: valor, facturado,
    progreso: valor === null ? null : facturado / valor,
    falta, alcanzada: valor !== null && facturado >= valor,
    diasRestantes,
    porDiaNecesario: falta === null || falta === 0 ? 0 : (diasRestantes > 0 ? falta / diasRestantes : falta),
  };
}

// Ventas que aparecieron entre dos cargas: las que tienen algún pedido que antes no estaba.
export function ventasNuevas(datosAntes, datosAhora) {
  const antes = new Set(datosAntes.pedidos.map((p) => p.id));
  const nuevos = new Set(datosAhora.pedidos.filter((p) => !antes.has(p.id)).map((p) => p.id));
  if (!nuevos.size) return [];
  const idx = indiceContactos(datosAhora.clientes);
  return agruparVentas(datosAhora.pedidos, idx).filter((v) => v.pedido_ids.some((id) => nuevos.has(id)));
}

export function enRango(fecha, rango) {
  if (!fecha) return false;
  if (rango.desde !== null && fecha < rango.desde) return false;
  return fecha <= rango.hasta;
}

export function normalizarPago(pago) {
  if (!pago) return 'sin dato';
  const s = pago.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (s.startsWith('efect')) return 'efectivo';
  if (s.startsWith('tran')) return 'transferencia'; // incluye "Tranferencia"
  return s;
}

export function normalizarEstado(estado) {
  return (estado || 'sin dato').trim().toLowerCase().replace(/\s+/g, '_');
}

// Contactos: une los que comparten teléfono y saca los excluidos.
export function indiceContactos(clientes, excluidos = REGLAS.clientesExcluidos) {
  const grupos = new Map();
  const porId = new Map();
  const porNombre = new Map();
  const telExcluidos = new Set();
  for (const c of clientes) {
    if (excluidos.includes(c.id)) {
      if (c.tel_clave) telExcluidos.add(c.tel_clave);
      continue;
    }
    const clave = c.tel_clave ? 't:' + c.tel_clave : 'c:' + c.id;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, ids: [], origenes: [], alta: c.alta, tel_clave: c.tel_clave };
      grupos.set(clave, g);
    }
    g.ids.push(c.id);
    g.origenes.push(c.origen);
    if (c.alta < g.alta) g.alta = c.alta;
    porId.set(c.id, clave);
    if (c.nombre_clave && !porNombre.has(c.nombre_clave)) porNombre.set(c.nombre_clave, clave);
  }
  return { contactos: [...grupos.values()], porId, porNombre, telExcluidos };
}

export function personaDePedido(p, idx) {
  if (p.cliente_id !== null && idx.porId.has(p.cliente_id)) return idx.porId.get(p.cliente_id);
  if (p.cliente_clave && idx.porNombre.has(p.cliente_clave)) return idx.porNombre.get(p.cliente_clave);
  if (p.cliente_id !== null) return 'c:' + p.cliente_id;
  return 'n:' + (p.cliente_clave || 'pedido-' + p.id);
}

const PRIORIDAD_ESTADO = ['pendiente', 'en_camino', 'entregado'];

// Agrupa líneas de pedido en ventas: mismo cliente + mismo día = 1 venta.
export function agruparVentas(pedidos, idx) {
  const lineas = pedidos.filter((p) => normalizarEstado(p.estado) !== 'cancelado');
  const mapa = new Map();
  for (const p of lineas) {
    const persona = personaDePedido(p, idx);
    const clave = persona + '|' + p.fecha;
    if (!mapa.has(clave)) mapa.set(clave, { persona, fecha: p.fecha, lineas: [] });
    mapa.get(clave).lineas.push(p);
  }
  const ventas = [];
  for (const g of mapa.values()) {
    const ls = g.lineas.slice().sort((a, b) => a.id - b.id);
    const estados = [...new Set(ls.map((l) => normalizarEstado(l.estado)))];
    const estado = estados.length === 1
      ? estados[0]
      : PRIORIDAD_ESTADO.find((e) => estados.includes(e)) || estados[0];
    const tipos = ls.map((l) => l.entrega_tipo);
    ventas.push({
      id: 'V' + ls[0].id,
      fecha: g.fecha,
      persona: g.persona,
      pedido_ids: ls.map((l) => l.id),
      lineas: ls.length,
      unidades: sumar(ls, (l) => num(l.cantidad)),
      regalos: ls.filter((l) => num(l.monto) === 0).length,
      monto: sumar(ls, (l) => num(l.monto)),
      costo: sumar(ls, (l) => num(l.costo)),
      lineasSinCosto: ls.filter((l) => l.costo === null || l.costo === undefined).length,
      canales: [...new Set(ls.map((l) => l.canal || 'sin dato'))],
      pagos: [...new Set(ls.map((l) => normalizarPago(l.pago)))],
      entrega: tipos.includes('envio') ? 'envio' : tipos.includes('otro') ? 'otro' : null,
      estado,
    });
  }
  return ventas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.pedido_ids[0] - b.pedido_ids[0]));
}

function sumarPor(filas, claveDe, valorDe) {
  const out = {};
  for (const f of filas) {
    for (const k of [].concat(claveDe(f))) out[k] = (out[k] || 0) + valorDe(f);
  }
  return out;
}

function estadoStock(p) {
  if (num(p.stock) <= 0) return 'sin_stock';
  if (num(p.stock) <= num(p.alerta)) return 'bajo';
  return 'ok';
}

// Foto del depósito: no depende del período.
export function calcularDeposito(productos) {
  const activos = productos.filter((p) => p.activo);
  const inactivos = productos.filter((p) => !p.activo);
  const conCosto = activos.filter((p) => p.costo !== null && p.costo !== undefined);
  const porEstado = { ok: [], bajo: [], sin_stock: [] };
  for (const p of activos) porEstado[estadoStock(p)].push(p);
  return {
    productosActivos: activos.length,
    unidades: sumar(activos, (p) => Math.max(num(p.stock), 0)),
    unidadesOk: sumar(porEstado.ok, (p) => num(p.stock)),
    unidadesBajo: sumar(porEstado.bajo, (p) => num(p.stock)),
    valorCosto: sumar(conCosto, (p) => Math.max(num(p.stock), 0) * num(p.costo)),
    activosSinCosto: activos.length - conCosto.length,
    valorLista: sumar(activos, (p) => Math.max(num(p.stock), 0) * num(p.precio)),
    sinStock: porEstado.sin_stock.map((p) => ({ id: p.id, nombre: p.nombre })),
    stockBajo: porEstado.bajo.map((p) => ({ id: p.id, nombre: p.nombre, stock: num(p.stock), alerta: num(p.alerta) })),
    inactivos: inactivos.length,
    unidadesInactivas: sumar(inactivos, (p) => Math.max(num(p.stock), 0)),
    inactivosSinCosto: inactivos.filter((p) => p.costo === null || p.costo === undefined).length,
  };
}

export function calcularMetricas(datos, periodoId, { dia } = {}) {
  const fechaCarga = datos.fuente.cargado_at.slice(0, 10);
  const rango = rangoPeriodo(periodoId, fechaCarga, dia);
  const idx = indiceContactos(datos.clientes);

  const todasLasVentas = agruparVentas(datos.pedidos, idx).filter((v) => v.fecha <= rango.hasta);
  const ventas = todasLasVentas.filter((v) => enRango(v.fecha, rango));
  const lineas = datos.pedidos.filter((p) => normalizarEstado(p.estado) !== 'cancelado' && enRango(p.fecha, rango));
  const gastos = datos.gastos.filter((g) => enRango(g.fecha, rango));

  // Caja: ventas del período
  const facturacion = sumar(ventas, (v) => v.monto);
  const primerDia = rango.desde || (todasLasVentas[0] ? todasLasVentas[0].fecha : rango.hasta);
  const porDia = [];
  for (let d = primerDia; d <= rango.hasta; d = sumarDias(d, 1)) {
    const delDia = ventas.filter((v) => v.fecha === d);
    porDia.push({ fecha: d, monto: sumar(delDia, (v) => v.monto), ventas: delDia.length });
  }
  const cobradas = ventas.filter((v) => v.estado === REGLAS.estadoCobrado);
  const caja = {
    facturacion,
    ventas: ventas.length,
    lineas: lineas.length,
    ticketPromedio: dividir(facturacion, ventas.length),
    cobrado: sumar(cobradas, (v) => v.monto),
    pendienteCobro: facturacion - sumar(cobradas, (v) => v.monto),
    porPago: sumarPor(lineas, (l) => normalizarPago(l.pago), (l) => num(l.monto)),
    porCanal: sumarPor(lineas, (l) => l.canal || 'sin dato', (l) => num(l.monto)),
    porDia,
    lista: ventas,
  };

  // Ganancia
  const costoMercaderia = sumar(ventas, (v) => v.costo);
  const gastosPorCategoria = sumarPor(gastos, (g) => g.categoria || 'Otros', (g) => num(g.monto));
  const totalGastos = sumar(gastos, (g) => num(g.monto));
  const bruta = facturacion - costoMercaderia;
  const neta = bruta - totalGastos;
  const ganancia = {
    facturacion,
    costoMercaderia,
    lineasSinCosto: sumar(ventas, (v) => v.lineasSinCosto),
    bruta,
    margenBruto: dividir(bruta, facturacion),
    gastosPorCategoria,
    totalGastos,
    neta,
    margenNeto: dividir(neta, facturacion),
    gastosIds: gastos.map((g) => g.id),
  };

  // Pedidos (camioneta)
  const porEstado = sumarPor(ventas, (v) => v.estado, () => 1);
  const estadosVistos = new Set(datos.pedidos.map((p) => normalizarEstado(p.estado)));
  const conEnvio = ventas.filter((v) => v.entrega === 'envio').length;
  const gastoEnvios = num(gastosPorCategoria[REGLAS.categoriaEnvios]);
  const pedidos = {
    pendientes: num(porEstado.pendiente),
    enCamino: estadosVistos.has('en_camino') ? num(porEstado.en_camino) : null,
    entregados: num(porEstado.entregado),
    otrosEstados: Object.keys(porEstado).filter((e) => !REGLAS.estadosCamioneta.includes(e)),
    conEnvio,
    otraEntrega: ventas.filter((v) => v.entrega === 'otro').length,
    sinDatoEntrega: ventas.filter((v) => v.entrega === null).length,
    gastoEnvios,
    gastosEnviosRegistrados: gastos.filter((g) => g.categoria === REGLAS.categoriaEnvios).length,
    costoEnvioPorVenta: dividir(gastoEnvios, conEnvio),
    lista: ventas,
  };

  // Productos: ficha individual
  const piezasPeriodo = datos.piezas.filter((pz) => pz.estado === 'publicado' && enRango(pz.publicado, rango));
  const fichas = datos.productos.map((p) => {
    const ls = lineas.filter((l) => l.producto_id === p.id);
    const tieneCosto = p.costo !== null && p.costo !== undefined;
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      activo: p.activo,
      precio: num(p.precio),
      costo: tieneCosto ? num(p.costo) : null,
      margenUnitario: tieneCosto ? num(p.precio) - num(p.costo) : null,
      margenPct: tieneCosto ? dividir(num(p.precio) - num(p.costo), num(p.precio)) : null,
      stock: num(p.stock),
      alerta: num(p.alerta),
      estadoStock: estadoStock(p),
      unidadesVendidas: sumar(ls, (l) => num(l.cantidad)),
      facturado: sumar(ls, (l) => num(l.monto)),
      regalos: ls.filter((l) => num(l.monto) === 0).length,
      pedidoIds: ls.map((l) => l.id),
      publicaciones: piezasPeriodo.filter((pz) => (pz.producto_ids || []).includes(p.id)).map((pz) => pz.id),
    };
  });
  const categorias = [...new Set(fichas.filter((f) => f.activo).map((f) => f.categoria))].sort((a, b) => a.localeCompare(b, 'es'));

  // Clientes
  const contactos = idx.contactos.filter((c) => c.alta <= rango.hasta);
  const personasQueCompraron = new Set(todasLasVentas.map((v) => v.persona));
  const compradoresContacto = contactos.filter((c) => personasQueCompraron.has(c.clave)).length;
  const diasPorPersona = new Map();
  for (const v of todasLasVentas) {
    if (!diasPorPersona.has(v.persona)) diasPorPersona.set(v.persona, new Set());
    diasPorPersona.get(v.persona).add(v.fecha);
  }
  const mensajes = datos.mensajes_dia.filter((m) => enRango(m.fecha, rango) && !idx.telExcluidos.has(m.tel_clave));
  const clientes = {
    contactos: contactos.length,
    compradoresContacto,
    conversion: dividir(compradoresContacto, contactos.length),
    nuevosEnPeriodo: contactos.filter((c) => enRango(c.alta, rango)).length,
    compradoresPeriodo: new Set(ventas.map((v) => v.persona)).size,
    recompras: [...diasPorPersona.values()].filter((s) => s.size >= 2).length,
    mensajesDeClientes: sumar(mensajes, (m) => num(m.de_clientes)),
    mensajesDelBot: sumar(mensajes, (m) => num(m.del_bot)),
    conversaciones: new Set(mensajes.map((m) => m.tel_clave)).size,
    porOrigen: sumarPor(contactos, (c) => c.origenes[0] || 'sin dato', () => 1),
    unidos: idx.contactos.filter((c) => c.ids.length > 1).map((c) => c.ids),
    excluidos: REGLAS.clientesExcluidos,
  };

  // Marketing
  const gastoPublicidad = num(gastosPorCategoria[REGLAS.categoriaPublicidad]);
  const marketing = {
    gastoPublicidad,
    cargosPublicidad: gastos.filter((g) => g.categoria === REGLAS.categoriaPublicidad).length,
    costoPorVenta: dividir(gastoPublicidad, ventas.length),
    publicaciones: piezasPeriodo.length,
    porFormato: sumarPor(piezasPeriodo, (pz) => pz.formato, () => 1),
    publicacionIds: piezasPeriodo.map((pz) => pz.id),
  };

  return {
    rango,
    fechaCarga,
    caja,
    ganancia,
    pedidos,
    deposito: calcularDeposito(datos.productos),
    productos: fichas,
    categorias,
    clientes,
    marketing,
    proveedores: { disponible: false },
  };
}
