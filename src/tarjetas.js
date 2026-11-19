// Contenido de cada tarjeta, armado solo con las métricas calculadas.
// Devuelve estructuras simples; app.js las convierte en HTML.
import { pesos, numero, porcentaje, fecha, fechaCorta, plural, listaIds } from './formato.js';

export const OBJETOS = [
  { id: 'deposito', titulo: 'Depósito', estado: 'datos' },
  { id: 'caja', titulo: 'Caja', estado: 'datos' },
  { id: 'camioneta', titulo: 'Pedidos', estado: 'parcial' },
  { id: 'productos', titulo: 'Productos', estado: 'datos' },
  { id: 'ganancia', titulo: 'Ganancia', estado: 'datos' },
  { id: 'meta', titulo: 'Meta del mes', estado: 'datos' },
  { id: 'clientes', titulo: 'Clientes', estado: 'datos' },
  { id: 'marketing', titulo: 'Marketing', estado: 'parcial' },
  { id: 'proveedores', titulo: 'Proveedores', estado: 'no_disponible' },
];

export const ETIQUETA_ESTADO = { datos: 'Con datos', parcial: 'Datos parciales', no_disponible: 'No disponible' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function etiquetaPeriodo(rango) {
  if (rango.id === 'tiempo') return `Máquina del tiempo: acumulado hasta el ${fecha(rango.hasta)}`;
  if (rango.id === 'semana') return `Últimos 7 días (${fecha(rango.desde)} al ${fecha(rango.hasta)})`;
  if (rango.id === 'mes') {
    const mes = MESES[Number(rango.hasta.slice(5, 7)) - 1];
    return `${mes[0].toUpperCase() + mes.slice(1)} ${rango.hasta.slice(0, 4)} (${fecha(rango.desde)} al ${fecha(rango.hasta)})`;
  }
  return `Todo, hasta el ${fecha(rango.hasta)}`;
}

export function etiquetaBotonMes(fechaCarga) {
  const mes = MESES[Number(fechaCarga.slice(5, 7)) - 1];
  return mes[0].toUpperCase() + mes.slice(1);
}

const ESTADO_STOCK = { ok: 'Con stock', bajo: 'Stock bajo', sin_stock: 'Sin stock' };
const ESTADO_VENTA = { pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado' };

// Texto corto para rótulos y lista.
export function resumenObjeto(id, m) {
  switch (id) {
    case 'deposito': return `${numero(m.deposito.unidades)} u. en stock`;
    case 'caja': return pesos(m.caja.facturacion);
    case 'camioneta': return `${plural(m.pedidos.entregados, 'entregado', 'entregados')} · ${plural(m.pedidos.pendientes, 'pendiente', 'pendientes')}`;
    case 'productos': return plural(m.deposito.productosActivos, 'activo', 'activos');
    case 'ganancia': return `Neta ${pesos(m.ganancia.neta)}`;
    case 'meta': return m.meta?.meta ? `${porcentaje(Math.min(m.meta.progreso, 9.99))} de ${pesos(m.meta.meta)}` : 'Cargá tu meta';
    case 'clientes': return plural(m.clientes.contactos, 'contacto', 'contactos');
    case 'marketing': return `Meta ${pesos(m.marketing.gastoPublicidad)}`;
    case 'proveedores': return 'No disponible';
    default: return '';
  }
}

const fila = (etiqueta, valor, nota) => ({ etiqueta, valor, nota });

// Números grandes de arriba, como en la app de finanzas. Cada uno lleva a su objeto.
export function kpis(m) {
  return [
    { objeto: 'caja', etiqueta: 'Facturación', valor: pesos(m.caja.facturacion), detalle: plural(m.caja.ventas, 'venta', 'ventas'), tono: '' },
    { objeto: 'ganancia', etiqueta: 'Ganancia neta', valor: pesos(m.ganancia.neta), detalle: `Margen ${porcentaje(m.ganancia.margenNeto)}`, tono: m.ganancia.neta < 0 ? 'sale' : 'entra' },
    { objeto: 'clientes', etiqueta: 'Conversión', valor: porcentaje(m.clientes.conversion), detalle: `${numero(m.clientes.compradoresContacto)} de ${plural(m.clientes.contactos, 'contacto', 'contactos')}`, tono: '' },
    { objeto: 'deposito', etiqueta: 'Stock', valor: `${numero(m.deposito.unidades)} u.`, detalle: `${pesos(m.deposito.valorCosto)} al costo`, tono: '' },
  ];
}

export const FILTROS_STOCK = [
  { id: null, etiqueta: 'Todos' },
  { id: 'ok', etiqueta: 'Con stock' },
  { id: 'bajo', etiqueta: 'Stock bajo' },
  { id: 'sin_stock', etiqueta: 'Sin stock' },
];

function lineaVenta(v) {
  const productos = plural(v.lineas, 'producto', 'productos');
  return `${fechaCorta(v.fecha)} · venta ${v.id} · pedidos ${listaIds(v.pedido_ids)} · ${productos} · ${pesos(v.monto)} · ${ESTADO_VENTA[v.estado] || v.estado}`;
}

function porClave(obj, nombres = {}) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => fila(nombres[k] || k[0].toUpperCase() + k.slice(1), pesos(v)));
}

export function construirTarjeta(id, m, { productoId } = {}) {
  const def = OBJETOS.find((o) => o.id === id);
  const periodo = etiquetaPeriodo(m.rango);

  if (id === 'productos' && productoId !== undefined && productoId !== null) {
    return fichaProducto(m, productoId, periodo);
  }

  switch (id) {
    case 'deposito': {
      const d = m.deposito;
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Stock actual según la app del bot. Es una foto del momento de la carga: las ventas ya están descontadas.',
        secciones: [{
          filas: [
            fila('Unidades en stock', numero(d.unidades), `En ${plural(d.productosActivos, 'producto activo', 'productos activos')}`),
            fila('Valor al costo', pesos(d.valorCosto), d.activosSinCosto ? `${plural(d.activosSinCosto, 'producto', 'productos')} sin costo cargado` : undefined),
            fila('Valor a precio de lista', pesos(d.valorLista)),
            fila('Sin stock', plural(d.sinStock.length, 'producto', 'productos')),
            fila('Stock bajo', plural(d.stockBajo.length, 'producto', 'productos'), 'Stock mayor a 0 y menor o igual a su alerta'),
            fila('Productos inactivos', plural(d.inactivos, 'producto', 'productos'), `${plural(d.unidadesInactivas, 'unidad', 'unidades')}, no se suman arriba`),
          ],
        }],
        listas: [
          { titulo: 'Sin stock', items: d.sinStock.map((p) => `${p.nombre} (id ${p.id})`) },
          { titulo: 'Stock bajo', items: d.stockBajo.map((p) => `${p.nombre} (id ${p.id}) · ${p.stock} de alerta ${p.alerta}`) },
        ],
        notas: ['El período elegido no cambia el stock. En la maqueta, las cajas verdes son unidades con stock normal, las ámbar son de productos con stock bajo y las baldosas rojas son productos agotados.'],
        fuente: 'Tabla productos de tecnoriv-bot',
        periodo: `Foto del ${fecha(m.fechaCarga)}`,
      };
    }
    case 'caja': {
      const c = m.caja;
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Lo que se vendió en el período. Una venta es un mismo cliente en un mismo día. Si está entregada, cuenta como cobrada. La ganancia está en la balanza.',
        secciones: [
          {
            filas: [
              fila('Facturación', pesos(c.facturacion)),
              fila('Ventas', numero(c.ventas), `Formadas por ${plural(c.lineas, 'línea de pedido', 'líneas de pedido')}`),
              fila('Ticket promedio', pesos(c.ticketPromedio)),
              fila('Cobrado', pesos(c.cobrado), 'Ventas entregadas'),
              fila('Pendiente de cobro', pesos(c.pendienteCobro)),
            ],
          },
          { titulo: 'Por medio de pago', filas: porClave(c.porPago) },
          { titulo: 'Por canal', filas: porClave(c.porCanal) },
        ],
        grafico: {
          tipo: 'barras', titulo: 'Ventas por día',
          datos: c.porDia.map((d) => ({ etiqueta: fechaCorta(d.fecha), valor: d.monto, texto: `${fecha(d.fecha)}: ${pesos(d.monto)} · ${plural(d.ventas, 'venta', 'ventas')}` })),
        },
        listas: [{ titulo: 'Ventas del período', items: c.lista.map(lineaVenta) }],
        fuente: 'Tabla pedidos de tecnoriv-bot',
        periodo,
      };
    }
    case 'camioneta': {
      const p = m.pedidos;
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Ventas según su estado. En la calle hay tres lugares: Pendiente, En camino y Entregado. La camioneta se estaciona en el lugar de su estado: muestra el estado, no la ubicación.',
        secciones: [
          {
            titulo: 'Estado',
            filas: [
              fila('Pendientes', numero(p.pendientes)),
              fila('En camino', p.enCamino === null ? 'No disponible' : numero(p.enCamino), p.enCamino === null ? 'Ese estado no existe en los datos' : undefined),
              fila('Entregados', numero(p.entregados)),
            ],
          },
          {
            titulo: 'Entrega',
            filas: [
              fila('Con envío', numero(p.conEnvio)),
              fila('Retiro u otra forma', numero(p.otraEntrega)),
              fila('Sin dato de entrega', numero(p.sinDatoEntrega)),
              fila('Gasto en envíos', pesos(p.gastoEnvios), `${plural(p.gastosEnviosRegistrados, 'gasto registrado', 'gastos registrados')}. El envío es gratis para el cliente.`),
              fila('Costo de envío por venta con envío', pesos(p.costoEnvioPorVenta), p.gastosEnviosRegistrados < p.conEnvio ? 'Hay envíos sin gasto cargado, así que el número real puede ser mayor' : undefined),
            ],
          },
        ],
        listas: [{ titulo: 'Ventas del período', items: p.lista.map(lineaVenta) }],
        noDisponible: [
          'Ubicación real de los envíos.',
          'Tiempo de entrega: la fecha de entrega se completa sola al marcar el pedido, no cuando llega.',
          'Estado "En camino": hoy los pedidos pasan directo a entregado.',
        ],
        fuente: 'Tabla pedidos de tecnoriv-bot y gastos de envío de finanzas-valen',
        periodo,
      };
    }
    case 'productos': {
      const grupos = m.categorias.map((cat) => ({
        titulo: cat,
        productos: m.productos
          .filter((f) => f.activo && f.categoria === cat)
          .map((f) => ({ id: f.id, estado: f.estadoStock, texto: `${f.nombre} · ${ESTADO_STOCK[f.estadoStock]} (${f.stock})` })),
      }));
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Un estante por categoría en la pared del fondo. Filtrá por stock o elegí un producto para ver su ficha.',
        filtros: true,
        secciones: [{
          filas: [
            fila('Productos activos', numero(m.deposito.productosActivos)),
            fila('Categorías', numero(m.categorias.length)),
          ],
        }],
        grupos,
        notas: ['En la maqueta, cada cajita del estante es un producto. Celeste: con stock. Ámbar: stock bajo. Rojo: sin stock.'],
        fuente: 'Tabla productos de tecnoriv-bot',
        periodo,
      };
    }
    case 'ganancia': {
      const g = m.ganancia;
      const filasGastos = Object.entries(g.gastosPorCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => fila(k, `− ${pesos(v)}`));
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Lo que queda de las ventas después de pagar la mercadería y los gastos. En la balanza, el platillo verde son las ventas y el rojo, los costos.',
        grafico: {
          tipo: 'reparto', titulo: 'En qué se va lo que vendiste', total: g.facturacion,
          partes: [
            { etiqueta: 'Mercadería', valor: g.costoMercaderia, clase: 'sale' },
            { etiqueta: 'Gastos', valor: g.totalGastos, clase: 'gasto' },
            { etiqueta: 'Ganancia neta', valor: Math.max(g.neta, 0), clase: 'entra' },
          ].map((p) => ({ ...p, texto: `${p.etiqueta}: ${pesos(p.valor)} (${porcentaje(g.facturacion ? p.valor / g.facturacion : null)})` })),
          aviso: g.neta < 0 ? `Los costos superan a las ventas por ${pesos(-g.neta)}.` : undefined,
        },
        secciones: [
          {
            filas: [
              fila('Facturación', pesos(g.facturacion)),
              fila('Costo de mercadería', `− ${pesos(g.costoMercaderia)}`, g.lineasSinCosto ? `${plural(g.lineasSinCosto, 'línea', 'líneas')} sin costo cargado` : 'Incluye los regalos'),
              fila('Ganancia bruta', pesos(g.bruta), `Margen ${porcentaje(g.margenBruto)}`),
            ],
          },
          { titulo: 'Gastos del negocio', filas: filasGastos.length ? filasGastos : [fila('Gastos', pesos(0))] },
          { filas: [fila('Ganancia neta', pesos(g.neta), `Margen ${porcentaje(g.margenNeto)}`)] },
        ],
        notas: ['Los aportes de plata del dueño no se cuentan como ingreso ni como gasto.', `Gastos incluidos: ${listaIds(g.gastosIds)}.`],
        fuente: 'Pedidos de tecnoriv-bot y gastos de finanzas-valen',
        periodo,
      };
    }
    case 'meta': {
      const t = m.meta;
      const mes = MESES[Number(t.mes.slice(5, 7)) - 1];
      const filas = [fila(`Facturado en ${mes}`, pesos(t.facturado), `Del ${fecha(t.desde)} al ${fecha(t.hasta)}`)];
      if (t.meta) {
        filas.push(
          fila('Meta', pesos(t.meta)),
          fila('Avance', porcentaje(t.progreso), t.alcanzada ? '¡Meta cumplida!' : undefined),
          fila('Falta', pesos(t.falta)),
          fila('Días que quedan del mes', numero(t.diasRestantes)),
          fila('Para llegar, vender por día', t.alcanzada ? '—' : pesos(t.porDiaNecesario), t.alcanzada ? undefined : 'Falta ÷ días que quedan'),
        );
      }
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'El termómetro de neón de la pared se llena con lo que facturaste en el mes. La meta la elegís vos y queda guardada en este dispositivo.',
        secciones: [{ filas }],
        formMeta: { valor: t.meta, mes },
        notas: t.meta ? [] : ['Cargá una meta de facturación para ver cuánto te falta y cuánto tenés que vender por día.'],
        fuente: 'Pedidos de tecnoriv-bot y la meta que cargaste',
        periodo: `${mes[0].toUpperCase() + mes.slice(1)} ${t.mes.slice(0, 4)}`,
      };
    }
    case 'clientes': {
      const c = m.clientes;
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Contactos y conversaciones del bot de WhatsApp. En la maqueta, cada persona es un cliente que compró en el período y cada burbuja equivale a unos 30 mensajes.',
        secciones: [
          {
            titulo: 'Acumulado',
            filas: [
              fila('Contactos', numero(c.contactos), `Sin el contacto de prueba (id ${listaIds(c.excluidos)}). Unidos por teléfono: ${c.unidos.map((u) => 'ids ' + u.join(' y ')).join(', ') || 'ninguno'}`),
              fila('Compraron alguna vez', numero(c.compradoresContacto)),
              fila('Conversión', porcentaje(c.conversion), 'Contactos que compraron ÷ contactos'),
              fila('Recompras', numero(c.recompras), 'Clientes que compraron en dos días distintos o más'),
            ],
          },
          {
            titulo: 'En el período',
            filas: [
              fila('Contactos nuevos', numero(c.nuevosEnPeriodo)),
              fila('Clientes que compraron', numero(c.compradoresPeriodo)),
              fila('Conversaciones', numero(c.conversaciones)),
              fila('Mensajes de clientes', numero(c.mensajesDeClientes)),
              fila('Mensajes del bot', numero(c.mensajesDelBot)),
            ],
          },
          { titulo: 'Contactos por origen', filas: Object.entries(c.porOrigen).sort((a, b) => b[1] - a[1]).map(([k, v]) => fila(k, numero(v))) },
        ],
        fuente: 'Tablas clientes, mensajes y pedidos de tecnoriv-bot',
        periodo,
      };
    }
    case 'marketing': {
      const k = m.marketing;
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Gasto en publicidad y publicaciones de Instagram. La pantalla de la pared enciende un cuadro por publicación del período: celeste los carruseles, violeta las historias y ámbar los posts.',
        secciones: [
          {
            filas: [
              fila('Gasto en Meta', pesos(k.gastoPublicidad), plural(k.cargosPublicidad, 'cargo', 'cargos')),
              fila('Costo de publicidad por venta', pesos(k.costoPorVenta), 'Gasto en Meta ÷ ventas del período'),
              fila('Publicaciones en Instagram', numero(k.publicaciones), k.publicacionIds.length ? `Piezas ${listaIds(k.publicacionIds)}` : undefined),
            ],
          },
          { titulo: 'Publicaciones por formato', filas: Object.entries(k.porFormato).sort((a, b) => b[1] - a[1]).map(([f, n]) => fila(f[0].toUpperCase() + f.slice(1), numero(n))) },
        ],
        noDisponible: ['Alcance, clics y retorno de las campañas: Meta Ads no está conectado.'],
        fuente: 'Gastos de finanzas-valen y tabla piezas de tecnoriv-bot',
        periodo,
      };
    }
    case 'proveedores':
      return {
        id, titulo: def.titulo, estado: def.estado,
        representa: 'Compras de mercadería a proveedores. En la maqueta es la puerta de carga de la pared izquierda, con el pallet vacío.',
        secciones: [],
        noDisponible: ['No hay compras registradas: la tabla de pedidos a proveedores está vacía.'],
        fuente: 'Tabla prov_pedidos de tecnoriv-bot',
        periodo,
      };
    default:
      return null;
  }
}

function fichaProducto(m, productoId, periodo) {
  const f = m.productos.find((p) => p.id === productoId);
  if (!f) return null;
  return {
    id: 'productos', productoId: f.id, titulo: f.nombre, estado: 'datos',
    representa: `Producto ${f.id} · ${f.categoria}${f.activo ? '' : ' · inactivo'}`,
    secciones: [
      {
        titulo: 'Ficha',
        filas: [
          fila('Precio de lista', pesos(f.precio), 'Precio actual. Las ventas pueden tener descuento.'),
          fila('Costo', f.costo === null ? 'Sin dato' : pesos(f.costo)),
          fila('Margen por unidad', f.margenUnitario === null ? 'Sin dato' : pesos(f.margenUnitario), f.margenPct === null ? undefined : porcentaje(f.margenPct)),
          fila('Stock', numero(f.stock), ESTADO_STOCK[f.estadoStock]),
          fila('Alerta de stock', numero(f.alerta)),
        ],
      },
      {
        titulo: 'En el período',
        filas: [
          fila('Unidades vendidas', numero(f.unidadesVendidas), f.regalos ? `${plural(f.regalos, 'regalo', 'regalos')} sin cargo` : undefined),
          fila('Facturado', pesos(f.facturado)),
          fila('Pedidos', listaIds(f.pedidoIds)),
          fila('Publicaciones de Instagram', f.publicaciones.length ? `Piezas ${listaIds(f.publicaciones)}` : 'Ninguna'),
        ],
      },
    ],
    notas: ['La foto del producto no se muestra: está en un servicio externo y esta versión no se conecta a nada.'],
    volver: true,
    fuente: 'Tablas productos, pedidos y piezas de tecnoriv-bot',
    periodo,
  };
}
