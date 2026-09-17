// Plazas del plan mensual.
//
// PARA ACTUALIZAR: cambia las plazas LIBRES de cada plan. El total (10) es el
// cupo del estudio. Cada tarjeta y la tabla comparativa leen de aquí.
export const PLAZAS_TOTALES = 10

export const PLAZAS_LIBRES = {
  starter: 2,
  creator: 1,
  pro: 1,
}

export function plazasLibres() {
  return Object.values(PLAZAS_LIBRES).reduce((a, b) => a + b, 0)
}

export function textoBadge() {
  const libres = plazasLibres()
  if (libres <= 0) return 'Sin plazas · lista de espera abierta'
  return `Quedan ${libres} de ${PLAZAS_TOTALES} plazas`
}

export function textoPlazasPlan(n) {
  if (n <= 0) return 'Sin plazas · lista de espera'
  if (n === 1) return 'Queda 1 plaza'
  return `Quedan ${n} plazas`
}
