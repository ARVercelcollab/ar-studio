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

// 2 -> '2 horas', 2.5 -> '2 h 30 min'; corto: '2 h', '2 h 30 min'
export function textoDuracion(horas, { corto = false } = {}) {
  const total = Math.round(Number(horas) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!m) return corto ? `${h} h` : h === 1 ? '1 hora' : `${h} horas`
  return h ? `${h} h ${m} min` : `${m} min`
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

// ---------- Suscripciones (planes mensuales de /planmensual) ----------
// IVA incluido, en céntimos. Al dar de alta a alguien se COPIAN a su suscripción:
// cambiar esto no toca a quien ya es miembro (sus condiciones se cambian en su ficha).
export const PLANES = {
  starter: { nombre: 'Starter', cuotaCent: 12900, horasPeriodo: 4, duracionesH: [4], sesionMinH: 4, sesionMaxH: 4, maxSesiones: 1, franja: ['14:00', '20:00'] },
  creator: { nombre: 'Creator', cuotaCent: 19900, horasPeriodo: 8, duracionesH: [4, 8], sesionMinH: 4, sesionMaxH: 8, maxSesiones: 2, franja: ['09:00', '20:00'] },
  pro: { nombre: 'Pro', cuotaCent: 34900, horasPeriodo: 16, duracionesH: null, sesionMinH: 4, sesionMaxH: 8, maxSesiones: null, franja: ['09:00', '20:00'] },
}

// Comunes a todos los planes: 72 h para reservar, 48 h para cancelar sin perder la sesión,
// 3 meses de permanencia, renovación mes a mes sin preaviso y 100 € de fianza.
export const PLAN_COMUN = { antelacionH: 72, avisoCancelacionH: 48, permanenciaMeses: 3, renovacionMeses: 1, preavisoDias: 0, fianzaCent: 10000 }

// Horas que no entran en el plan (fuera de su horario, finde, festivo o cuando ya no le
// quedan). Si las pide el MISMO DÍA de la sesión, la tarifa de horas no contratadas de
// /condiciones: 50 €/h + IVA entre semana y 60 €/h + IVA finde y festivos. Si las pide
// con días de antelación, la tarifa normal de la web (DURACIONES), ver tarifaWebCent.
// En el panel sale rellenado y se puede cambiar (0 = de regalo).
export const PLAN_HORA_EXTRA_CENT = { laborable: 6050, finde: 7260 }

// Precio de la web para unas horas en un tipo de día: el de la tabla si esa duración se
// vende; si no (1 h, o 2 h en finde), las horas al precio por hora de la duración más corta
// que se vende ese tipo de día.
export function tarifaWebCent(horas, tipoDia) {
  const exacto = precioCent(horas, tipoDia)
  if (exacto != null) return exacto
  const base = DURACIONES.find((d) => d[tipoDia] != null)
  return Math.round((Number(horas) * base[tipoDia]) / base.horas)
}

export const PLAN_TEXTO_CANCELACION = [
  'Reserva cada sesión con al menos 72 horas de antelación.',
  'Si cancelas o cambias una sesión con menos de 48 horas, cuenta como usada.',
  'Las horas son de cada mes: las que no uses se pierden.',
]

export const METODOS_CUOTA = [
  ['transferencia', 'Transferencia'],
  ['bizum', 'Bizum'],
  ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta (datáfono o TPV)'],
  ['stripe', 'Stripe (se cobra solo)'],
  ['otro', 'Otro'],
]
