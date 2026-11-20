// Área de miembros · ayudas de formato (solo funciones puras: valen en el navegador).
//
// Las pantallas leen los datos que preparan lib/miembros/area.js (datosArea y datosReservar)
// y las rutas /api/miembros/*. Aquí se leen con cuidado (campos que pueden faltar) para que
// una sesión, una cuota o un aviso con menos datos no rompa la página.
import { formatoEuros, textoDuracion, ESTUDIO } from '../../lib/reservas/config'
import { fechaMadrid, horaMadrid, textoFecha, textoFechaCorta, textoDiaCorto, minutosDeHora, horaDeMinutos } from '../../lib/reservas/tiempo'

export const h = (x) => textoDuracion(Number(x) || 0, { corto: true })
export const euros = (cent) => formatoEuros(Number(cent) || 0)
export const WHATSAPP = `https://wa.me/${ESTUDIO.whatsapp}`
export const whatsapp = (texto) => `${WHATSAPP}?text=${encodeURIComponent(texto)}`

export const fechaCorta = (f, anio = false) => (f ? textoFechaCorta(String(f).slice(0, 10), { anio }) : '')
export const fechaLarga = (f) => (f ? textoFecha(String(f).slice(0, 10)) : '')
export const diaCorto = (f) => (f ? textoDiaCorto(String(f).slice(0, 10)) : '')

// Una sesión: { inicio, fin } en ISO (o fecha y desde/hasta)
export function partesSesion(s) {
  const fecha = s.fecha || (s.inicio ? fechaMadrid(new Date(s.inicio)) : null)
  const desde = s.desde || (s.inicio ? horaMadrid(new Date(s.inicio)) : '')
  const hasta = s.hasta || (s.fin ? horaMadrid(new Date(s.fin)) : '')
  const horas = s.horas ?? s.duracionHoras ?? (s.inicio && s.fin ? (new Date(s.fin) - new Date(s.inicio)) / 3600000 : 0)
  return { fecha, desde, hasta, horas: Number(horas) || 0 }
}

// '10:00' + 4 h -> '14:00'
export const horaFin = (desde, horas) => horaDeMinutos(minutosDeHora(desde) + Math.round(Number(horas) * 60))

// 'jueves, 26 de noviembre de 2026'
export const capital = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '')

// Reparto de las horas de una sesión: «4 h del plan» · «2 h del plan + 2 h aparte»
export function textoReparto(s) {
  const plan = Number(s.horasPlan ?? 0)
  const extra = Number(s.horasExtra ?? Math.max(0, partesSesion(s).horas - plan))
  if (extra > 0 && plan > 0) return `${h(plan)} del plan + ${h(extra)} aparte`
  if (extra > 0) return `${h(extra)} aparte`
  return `${h(plan)} del plan`
}

// Estado de una cuota en palabras
const ESTADOS_CUOTA = {
  pagada: 'Pagada', pendiente: 'Pendiente', anulada: 'Anulada', devuelta: 'Devuelta', sin_cargo: 'Sin cargo',
  proxima: 'Próxima', sin_pagar: 'Sin pagar', atrasada: 'Sin pagar',
}
export function estadoCuota(c) {
  const clave = c.chip || c.estado
  const texto = c.estadoTexto || ESTADOS_CUOTA[clave] || clave || ''
  return { texto, tono: /^Cobr/.test(texto) ? 'info' : TONO_CUOTA[clave] || 'gris' }
}
// (pendiente: ya ha empezado el mes y no está pagada)
const TONO_CUOTA = { pagada: 'bien', sin_cargo: 'gris', anulada: 'gris', devuelta: 'gris', proxima: 'info', pendiente: 'mal', sin_pagar: 'mal', atrasada: 'mal' }

// Lista de condiciones (texto con saltos o lista)
export function lineas(v) {
  if (!v) return []
  if (Array.isArray(v)) return v.filter(Boolean)
  // (sin «lookbehind»: los Safari antiguos no lo entienden)
  return String(v).replace(/\.\s+(?=[A-ZÁÉÍÓÚ¿])/g, '.\n').split(/\n+/).map((t) => t.trim()).filter(Boolean)
}

export const ESTADOS_PLAN = { por_empezar: 'Empieza pronto', activa: 'Activo', baja_avisada: 'Se da de baja', finalizada: 'Terminado' }
