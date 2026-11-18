// Cálculo de huecos libres. Son funciones puras: reciben lo ya ocupado y devuelven
// las horas de inicio posibles, para poder probarlas sin base de datos.

import { DURACIONES, HORARIO, REGLAS, precioCent } from './config.js'
import { diaSemana, horaDeMinutos, madridAInstante, minutosDeHora, sumarDias, fechaMadrid } from './tiempo.js'

// 'laborable' o 'finde' (sábado, domingo o festivo)
export function tipoDeDia(fecha, festivos = new Set()) {
  const dia = diaSemana(fecha)
  if (dia === 0 || dia === 6 || festivos.has(fecha)) return 'finde'
  return 'laborable'
}

// Instante en que termina el bloqueo de una reserva (fin + margen para preparar el estudio)
export function bloqueoHasta(fin, reglas = REGLAS) {
  return new Date(new Date(fin).getTime() + reglas.margenEntreReservasMin * 60000)
}

// ¿Choca una reserva [inicio, fin) con lo ocupado?
// - reservas: [{ inicio, bloqueoHasta }] (el bloqueo ya incluye el margen)
// - bloqueos: [{ inicio, fin }] (horas que el estudio cierra; sin margen)
export function choca({ inicio, fin }, { reservas = [], bloqueos = [] }, reglas = REGLAS) {
  const ini = new Date(inicio).getTime()
  const hasta = bloqueoHasta(fin, reglas).getTime()
  const finT = new Date(fin).getTime()
  for (const r of reservas) {
    if (ini < new Date(r.bloqueoHasta).getTime() && new Date(r.inicio).getTime() < hasta) return true
  }
  for (const b of bloqueos) {
    if (ini < new Date(b.fin).getTime() && new Date(b.inicio).getTime() < finT) return true
  }
  return false
}

// Horas de inicio libres ('HH:MM') para una fecha y una duración
export function horasLibres({ fecha, horas, ocupado = {}, festivos = new Set(), ahora = new Date(), reglas = REGLAS, horario = HORARIO }) {
  const tipo = tipoDeDia(fecha, festivos)
  if (precioCent(horas, tipo) == null) return []

  const limite = new Date(new Date(ahora).getTime() + reglas.antelacionMinimaHoras * 3600000)
  const ultimoDia = sumarDias(fechaMadrid(ahora), reglas.horizonteDias)
  if (fecha > ultimoDia) return []

  const { abre, cierra } = horario[tipo]
  const desde = minutosDeHora(abre)
  const hasta = minutosDeHora(cierra) - horas * 60
  const libres = []
  for (let m = desde; m <= hasta; m += reglas.pasoMinutos) {
    const hora = horaDeMinutos(m)
    const inicio = madridAInstante(fecha, hora)
    if (inicio < limite) continue
    const fin = new Date(inicio.getTime() + horas * 3600000)
    if (choca({ inicio, fin }, ocupado, reglas)) continue
    libres.push(hora)
  }
  return libres
}

// ¿Se puede reservar exactamente esa fecha, hora y duración?
export function esHoraLibre({ fecha, hora, horas, ...resto }) {
  return horasLibres({ fecha, horas, ...resto }).includes(hora)
}

// Resumen de un rango de días para el calendario: { 'AAAA-MM-DD': número de huecos }
export function diasConHuecos({ desde, hasta, horas, ocupado, festivos, ahora, reglas, horario }) {
  const dias = {}
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    dias[f] = horasLibres({ fecha: f, horas, ocupado, festivos, ahora, reglas, horario }).length
  }
  return dias
}

// Duraciones que se venden en un tipo de día, con su precio
export function duracionesDelDia(tipo) {
  return DURACIONES.filter((d) => d[tipo] != null).map((d) => ({ horas: d.horas, precioCent: d[tipo] }))
}
