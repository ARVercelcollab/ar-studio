// Ficheros de calendario (.ics) para que el cliente y el estudio añadan las reservas
// a Google Calendar, Apple Calendar u Outlook.

import { ESTUDIO } from './config.js'

function utc(fecha) {
  return new Date(fecha).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapar(texto) {
  return String(texto ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Las líneas de un .ics no deben pasar de 75 bytes
function plegar(linea) {
  const bytes = Buffer.from(linea, 'utf8')
  if (bytes.length <= 75) return linea
  const trozos = []
  let actual = ''
  for (const caracter of linea) {
    if (Buffer.byteLength(actual + caracter, 'utf8') > (trozos.length ? 74 : 75)) {
      trozos.push(actual)
      actual = ''
    }
    actual += caracter
  }
  trozos.push(actual)
  return trozos.join('\r\n ')
}

function evento({ uid, inicio, fin, titulo, descripcion, url, cancelado }) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(inicio)}`,
    `DTEND:${utc(fin)}`,
    `SUMMARY:${escapar(titulo)}`,
    `LOCATION:${escapar(ESTUDIO.direccion)}`,
    descripcion ? `DESCRIPTION:${escapar(descripcion)}` : null,
    url ? `URL:${url}` : null,
    cancelado ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
  ].filter(Boolean)
}

function calendario(nombre, eventos) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AR Studio//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nombre)}`,
    'X-WR-TIMEZONE:Europe/Madrid',
    ...eventos.flat(),
    'END:VCALENDAR',
  ].map(plegar).join('\r\n') + '\r\n'
}

// Para el cliente: su reserva
export function icsCliente(reserva, urlReserva) {
  return calendario('AR Studio', [
    evento({
      uid: `${reserva.codigo}@studioar.es`,
      inicio: reserva.inicio,
      fin: reserva.fin,
      titulo: `Estudio AR Studio (${reserva.duracionHoras} h)`,
      descripcion: `Reserva ${reserva.codigo}. Detalles y cambios: ${urlReserva}`,
      url: urlReserva,
      cancelado: reserva.estado === 'cancelada',
    }),
  ])
}

// Para el estudio: todas las reservas y bloqueos (suscripción desde Google Calendar)
export function icsEstudio(reservas, bloqueos, urlPanel) {
  const eventos = reservas.map((r) =>
    evento({
      uid: `${r.codigo}@studioar.es`,
      inicio: r.inicio,
      fin: r.fin,
      titulo: `${r.nombre} ${r.apellidos} · ${r.duracionHoras} h${r.pagoEstado === 'pagado' ? '' : ' · SIN PAGAR'}`,
      descripcion: [`${r.codigo}`, r.telefono, r.email, r.actividad, `${urlPanel}/reserva/${r.id}`].filter(Boolean).join('\n'),
      url: `${urlPanel}/reserva/${r.id}`,
    })
  )
  const bloques = bloqueos.map((b) =>
    evento({ uid: `bloqueo-${b.id}@studioar.es`, inicio: b.inicio, fin: b.fin, titulo: `Cerrado: ${b.motivo || 'bloqueo'}` })
  )
  return calendario('AR Studio · Reservas', [...eventos, ...bloques])
}
