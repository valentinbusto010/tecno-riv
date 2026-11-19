// Reglas de negocio acordadas. Cambiar acá cambia todos los cálculos.
export const REGLAS = {
  // Contactos que no son clientes reales (id 1 = número de prueba del dueño).
  clientesExcluidos: [1],
  // Una venta entregada cuenta como cobrada.
  estadoCobrado: 'entregado',
  // Estado que se muestra en la camioneta aunque no exista en los datos.
  estadosCamioneta: ['pendiente', 'en_camino', 'entregado'],
  // Categorías de gasto (vienen de finanzas-valen).
  categoriaPublicidad: 'Publicidad',
  categoriaEnvios: 'Envíos',
};

export const PERIODOS = [
  { id: 'semana', etiqueta: '7 días' },
  { id: 'mes', etiqueta: 'Este mes' },
  { id: 'todo', etiqueta: 'Todo' },
];

export const PERIODO_INICIAL = 'todo';

// Datos en vivo: base del bot en Supabase. La clave publicable está hecha para ir en páginas públicas;
// la seguridad la dan las reglas de la base y la función maqueta_datos, que solo responde al usuario dueño.
export const SUPABASE = {
  url: 'https://wecwgwhlczspysldlwbb.supabase.co',
  clave: 'sb_publishable_Ecs3BDpzolG30blkg1fpmw_mWodt_KB',
  funcion: 'maqueta_datos',
};

// Cada cuánto se vuelven a traer los datos mientras la app está abierta y a la vista.
export const REFRESCO_MS = 5 * 60 * 1000;
