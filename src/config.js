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
