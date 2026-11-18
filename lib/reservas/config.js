// Reglas de las reservas por horas de AR Studio.
//
// PARA CAMBIAR PRECIOS U HORARIOS: este es el único sitio. Los precios van en
// céntimos y con IVA incluido (96,80 € = 9680). Se copiaron de Calendly el
// 07-11-2026, cuando el estudio volvió al plan Standard.

export const ZONA_HORARIA = 'Europe/Madrid'

export const REGLAS = {
  // Cada cuánto empieza un hueco (09:00, 09:30, 10:00…)
  pasoMinutos: 30,
  // Tiempo libre entre una reserva y la siguiente, para recoger y preparar el estudio.
  // Calendly dejaba 30 minutos.
  margenEntreReservasMin: 30,
  // No se puede reservar con menos de estas horas de antelación (Calendly: 10 h)
  antelacionMinimaHoras: 10,
  // Hasta cuántos días en el futuro se enseña el calendario
  horizonteDias: 180,
  // Minutos que se guarda la hora mientras el cliente paga en el TPV
  minutosRetencionPago: 20,
}

// Horario de apertura. "finde" son sábados, domingos y festivos.
export const HORARIO = {
  laborable: { abre: '09:00', cierra: '22:00' },
  finde: { abre: '09:00', cierra: '22:00' },
}

// Duraciones a la venta. Si un precio es null, esa duración no se ofrece ese tipo de día
// (los fines de semana y festivos el mínimo son 4 horas).
export const DURACIONES = [
  { horas: 2, laborable: 9680, finde: null },
  { horas: 3, laborable: 14520, finde: null },
  { horas: 4, laborable: 18392, finde: 22748 },
  { horas: 6, laborable: 27588, finde: 32670 },
  { horas: 8, laborable: 33880, finde: 41624 },
  { horas: 10, laborable: 39930, finde: 48400 },
]

// Preguntas del formulario (las mismas que tenía Calendly)
export const ACTIVIDADES = ['Fotos', 'Creación de contenido', 'Podcast', 'Taller']

export const FONDOS = [
  { id: 'no', texto: 'No' },
  { id: 'blanco', texto: 'Sí, el fondo blanco' },
  { id: 'negro', texto: 'Sí, el fondo negro' },
  { id: 'blanco-negro', texto: 'Sí, el blanco y el negro' },
]
export const TEXTO_FONDOS = 'Requiere montaje y desmontaje por tu cuenta. Sin suelo PVC. Se abonan 20 € + IVA por metro usado el día de la reserva.'

export const EQUIPO = [
  { id: 'podcast', texto: 'Kit podcast (60 €)' },
  { id: 'teleprompter', texto: 'Teleprompter (20 €)' },
  { id: 'proyector', texto: 'Proyector (gratis)' },
]
export const TEXTO_EQUIPO = 'El equipo se paga el día de la reserva.'

export const ESTUDIO = {
  nombre: 'AR Studio',
  direccion: 'C/ de Sant Vicent Màrtir, 338, Jesús, 46007 València',
  mapa: 'https://maps.google.com/?q=C%2F+de+Sant+Vicent+M%C3%A0rtir%2C+338%2C+46007+Val%C3%A8ncia',
  email: 'arstudiospain@gmail.com',
  whatsapp: '34613395533',
  whatsappVisible: '+34 613 39 55 33',
  web: 'https://www.studioar.es',
}

export function duracion(horas) {
  return DURACIONES.find((d) => d.horas === Number(horas)) || null
}

// Precio en céntimos de una duración en un tipo de día, o null si no se vende
export function precioCent(horas, tipoDia) {
  const d = duracion(horas)
  if (!d) return null
  return d[tipoDia] ?? null
}

export function formatoEuros(cent) {
  if (cent == null) return ''
  const euros = cent / 100
  return euros.toLocaleString('es-ES', {
    minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
    maximumFractionDigits: 2,
  }) + ' €'
}

// Política de cancelación de /condiciones: porcentaje que se devuelve según
// los días que faltan para la sesión.
export function porcentajeReembolso(inicio, ahora = new Date()) {
  const dias = (new Date(inicio).getTime() - new Date(ahora).getTime()) / 86400000
  if (dias > 30) return 100
  if (dias >= 15) return 70
  if (dias >= 7) return 50
  return 0
}

export const TEXTO_CANCELACION = [
  'Más de 30 días antes: se devuelve el 100 %.',
  'Entre 30 y 15 días antes: el 70 %.',
  'Entre 15 y 7 días antes: el 50 %.',
  'En los últimos 7 días, o si no vienes sin avisar: no hay devolución.',
  'Los cambios de fecha se piden al menos 7 días antes de la nueva fecha y dependen de la disponibilidad.',
]
