// Fechas y horas en la zona horaria del estudio (Madrid), sin librerías.
// Las reservas se guardan como instantes (UTC) y se enseñan siempre en hora de Madrid,
// también en los cambios de horario de marzo y octubre.

import { ZONA_HORARIA } from './config.js'

const formato = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_HORARIA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function partes(fecha) {
  const p = {}
  for (const { type, value } of formato.formatToParts(fecha)) p[type] = value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second }
}

// Minutos que Madrid va por delante de UTC en ese instante (60 en invierno, 120 en verano)
function desfaseMin(fecha) {
  const p = partes(fecha)
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - fecha.getTime()) / 60000)
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}$/

export function esFecha(texto) {
  if (typeof texto !== 'string' || !RE_FECHA.test(texto)) return false
  const [y, m, d] = texto.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}

export function esHora(texto) {
  if (typeof texto !== 'string' || !RE_HORA.test(texto)) return false
  const [h, mi] = texto.split(':').map(Number)
  return h >= 0 && h <= 24 && mi >= 0 && mi < 60 && !(h === 24 && mi > 0)
}

// 'AAAA-MM-DD' + 'HH:MM' en hora de Madrid -> Date (instante)
export function madridAInstante(fecha, hora) {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const comoUtc = Date.UTC(y, m - 1, d, h, mi)
  let t = comoUtc - desfaseMin(new Date(comoUtc)) * 60000
  t = comoUtc - desfaseMin(new Date(t)) * 60000
  return new Date(t)
}

const dos = (n) => String(n).padStart(2, '0')

// Date -> 'AAAA-MM-DD' en Madrid
export function fechaMadrid(instante) {
  const p = partes(new Date(instante))
  return `${p.y}-${dos(p.m)}-${dos(p.d)}`
}

// Date -> 'HH:MM' en Madrid
export function horaMadrid(instante) {
  const p = partes(new Date(instante))
  return `${dos(p.h)}:${dos(p.mi)}`
}

// Día de la semana de una fecha 'AAAA-MM-DD': 0 domingo … 6 sábado
export function diaSemana(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d + dias))
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`
}

// Suma meses a 'AAAA-MM-DD' contando siempre desde el día ancla: 31-ene + 1 = 28-feb, + 2 = 31-mar
export function sumarMeses(fecha, n, dia = Number(fecha.slice(8, 10))) {
  const [y, m] = fecha.split('-').map(Number)
  const t = m - 1 + n
  const yy = y + Math.floor(t / 12)
  const mm = (((t % 12) + 12) % 12) + 1
  const ultimo = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  return `${yy}-${dos(mm)}-${dos(Math.min(dia, ultimo))}`
}

// Días de a hasta b ('AAAA-MM-DD'); negativo si b es antes
export function diasEntre(a, b) {
  const utc = (f) => {
    const [y, m, d] = f.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(b) - utc(a)) / 86400000)
}

export function minutosDeHora(hora) {
  const [h, mi] = hora.split(':').map(Number)
  return h * 60 + mi
}

export function horaDeMinutos(min) {
  return `${dos(Math.floor(min / 60))}:${dos(min % 60)}`
}

// Textos para el cliente
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function nombreMes(mes) {
  return MESES[mes - 1]
}

// 'martes, 10 de noviembre de 2026'
export function textoFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return `${DIAS[diaSemana(fecha)]}, ${d} de ${MESES[m - 1]} de ${y}`
}

// 'martes, 10 de noviembre de 2026, de 10:00 a 12:00'
export function textoFranja(inicio, fin) {
  return `${textoFecha(fechaMadrid(inicio))}, de ${horaMadrid(inicio)} a ${horaMadrid(fin)}`
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// '20 nov' o '20 nov 2026'
export function textoFechaCorta(fecha, { anio = false } = {}) {
  const [y, m, d] = fecha.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}${anio ? ` ${y}` : ''}`
}

// 'jue 26 nov'
export function textoDiaCorto(fecha) {
  return `${DIAS_CORTOS[diaSemana(fecha)]} ${textoFechaCorta(fecha)}`
}

// '20/11/2026'
export function fechaDdMmAaaa(fecha) {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}
