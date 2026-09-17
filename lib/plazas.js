// Plazas disponibles del plan mensual.
//
// PARA ACTUALIZAR CADA MES: cambia el número del mes en curso o añade el mes
// siguiente. Formato 'AAAA-MM': plazas. Si un mes no aparece, se usa el último
// mes anterior que sí esté definido. La web muestra el mes en curso sola.
export const PLAZAS_POR_MES = {
  '2026-09': 4,
}

export const PLAZAS_TOTALES = 10

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// Devuelve { plazas, mes } para la fecha dada, calculada en hora de España
// para que el cambio de mes coincida con el real y no con el del servidor.
export function plazasDelMes(fecha = new Date()) {
  const clave = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit',
  }).format(fecha).slice(0, 7) // "2026-09"

  const mesIndex = parseInt(clave.slice(5, 7), 10) - 1
  const aplicable = Object.keys(PLAZAS_POR_MES).sort().filter(k => k <= clave).pop()
  const plazas = aplicable ? PLAZAS_POR_MES[aplicable] : PLAZAS_TOTALES

  return { plazas, mes: MESES[mesIndex] }
}

export function textoPlazas(plazas, mes) {
  if (plazas <= 0) return `Sin plazas en ${mes} · lista de espera abierta`
  if (plazas === 1) return `1 plaza disponible en ${mes}`
  return `${plazas} plazas disponibles en ${mes}`
}
