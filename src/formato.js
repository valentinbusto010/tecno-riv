const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 0 });

export const pesos = (n) => (n === null || n === undefined ? 'Sin dato' : fmtPesos.format(Math.round(n)));
export const numero = (n) => (n === null || n === undefined ? 'Sin dato' : fmtNum.format(n));
export const porcentaje = (x) => (x === null || x === undefined ? 'Sin dato' : fmtPct.format(x));

// Fechas 'YYYY-MM-DD' sin pasar por Date (evita correr el día por zona horaria).
export function fecha(iso) {
  if (!iso) return 'Sin dato';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fechaCorta(iso) {
  if (!iso) return 'Sin dato';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}
export function fechaHora(isoLocal) {
  if (!isoLocal) return 'Sin dato';
  return `${fecha(isoLocal)} ${isoLocal.slice(11, 16)}`;
}

export const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;

export function listaIds(ids) {
  if (!ids || !ids.length) return 'ninguno';
  return ids.join(', ');
}
