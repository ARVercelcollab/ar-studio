// Importar el CSV que exporta Calendly (Eventos programados → Exportar) a la agenda del panel.
//
// Para qué: el día del cambio, las reservas FUTURAS de Calendly tienen que ocupar su hueco en el
// sistema nuevo (nadie puede reservar encima) y el HISTORIAL pasa a las fichas de los clientes.
//
// - Se hace en dos pasos: primero se analiza el archivo sin tocar nada (resumen y problemas) y
//   luego se importa todo en una transacción con el candado de la agenda.
// - Cada reserva guarda su referencia de Calendly (reservas.externo_ref): subir el mismo
//   archivo otra vez no duplica nada.
// - El dinero NO entra por aquí: lo cobrado por Calendly se apunta por meses (calendly_meses) y
//   las reservas de origen 'calendly' no cuentan en Movimientos, Mes a mes, Impuestos ni Inicio.
// - No se adivina nada: una fecha que no se entiende va a problemas y no se importa.

import crypto from 'node:crypto'
import { query } from '../db/index.js'
import { DURACIONES, HORARIO, ACTIVIDADES, EQUIPO, ZONA_HORARIA, precioCent, tarifaWebCent, formatoEuros } from './config.js'
import { tipoDeDia, bloqueoHasta } from './disponibilidad.js'
import { madridAInstante, fechaMadrid, horaMadrid, esFecha, esHora, minutosDeHora, fechaDdMmAaaa } from './tiempo.js'
import { conAgenda, codigoNuevo, tokenNuevo, registrar, festivos, ErrorReserva } from './servicio.js'

// Vercel no deja pasar peticiones de más de 4,5 MB: el CSV, como mucho 3 MB (unas 10.000 reservas)
export const MAX_BYTES = 3 * 1024 * 1024
export const MAX_FILAS = 5000
const H = 3600000
const PREFIJO = 'calendly:'

// ---------- Lector de CSV ----------

// Separador: el que más aparece en la primera línea fuera de comillas (coma, punto y coma o tabulador)
function separadorDe(texto) {
  const cuenta = { ',': 0, ';': 0, '\t': 0 }
  let dentro = false
  for (const c of texto) {
    if (c === '"') dentro = !dentro
    else if (!dentro && (c === '\n' || c === '\r')) break
    else if (!dentro && c in cuenta) cuenta[c]++
  }
  const [mejor, veces] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]
  return veces > 0 ? mejor : ','
}

// Texto CSV -> lista de filas (cada una, lista de celdas). Comillas, comillas dobles escapadas,
// separadores y saltos de línea dentro de comillas, BOM y finales de línea \r\n.
export function leerCsv(texto) {
  let t = String(texto || '')
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
  const sep = separadorDe(t)
  const filas = []
  let fila = []
  let celda = ''
  let dentro = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (dentro) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"'
          i++
        } else dentro = false
      } else celda += c
    } else if (c === '"') {
      dentro = true
    } else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda !== '' || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }
  return { separador: sep, filas: filas.filter((f) => f.some((x) => String(x).trim() !== '')) }
}

// ---------- Columnas de Calendly (en inglés y en español) ----------

export const normalizar = (t) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim()

// Cabeceras conocidas, ya normalizadas. La primera columna que encaja gana.
const COLUMNAS = {
  nombreCompleto: ['invitee name', 'nombre del invitado', 'nombre del invitado a', 'nombre de la persona invitada', 'invitado', 'name', 'nombre', 'nombre completo'],
  nombre: ['invitee first name', 'nombre de pila del invitado', 'first name', 'nombre de pila'],
  apellidos: ['invitee last name', 'apellido del invitado', 'apellidos del invitado', 'last name', 'apellido', 'apellidos'],
  email: ['invitee email', 'correo electronico del invitado', 'correo del invitado', 'email del invitado', 'e mail del invitado', 'email', 'e mail', 'correo electronico', 'correo'],
  telefono: ['text reminder number', 'numero de recordatorio de texto', 'numero de recordatorio por texto', 'numero para recordatorios de texto', 'numero de telefono para recordatorios', 'phone number', 'phone', 'telefono', 'numero de telefono', 'movil'],
  tipo: ['event type name', 'nombre del tipo de evento', 'tipo de evento', 'event type'],
  inicio: ['start date & time', 'start date and time', 'start time', 'start date', 'fecha y hora de inicio', 'fecha y hora del inicio', 'fecha de inicio', 'hora de inicio', 'inicio'],
  fin: ['end date & time', 'end date and time', 'end time', 'end date', 'fecha y hora de finalizacion', 'fecha y hora de fin', 'fecha y hora del final', 'fecha de finalizacion', 'fecha de fin', 'hora de finalizacion', 'fin'],
  zona: ['invitee time zone', 'zona horaria del invitado', 'time zone', 'timezone', 'zona horaria'],
  programado: ['scheduled at', 'event created date & time', 'created at', 'programado el', 'programado en', 'programada el', 'fecha de programacion', 'creado el', 'fecha de creacion'],
  cancelado: ['canceled', 'cancelled', 'cancelado', 'cancelada', 'is canceled'],
  canceladoEn: ['canceled at', 'cancelled at', 'cancelado el', 'cancelada el', 'fecha de cancelacion'],
  motivo: ['cancellation reason', 'motivo de la cancelacion', 'motivo de cancelacion', 'razon de la cancelacion', 'razon de cancelacion'],
  estado: ['status', 'estado', 'event status', 'estado del evento'],
  uuidInvitado: ['invitee uuid', 'uuid del invitado', 'invitee id', 'id del invitado'],
  uuidEvento: ['event uuid', 'uuid del evento', 'event id', 'id del evento'],
  importe: ['payment amount', 'amount paid', 'amount', 'payment', 'importe', 'importe del pago', 'importe pagado', 'monto', 'monto del pago', 'precio', 'price', 'event price', 'pago'],
  moneda: ['payment currency', 'currency', 'moneda', 'divisa'],
}
const NOMBRES_COLUMNA = {
  nombreCompleto: 'Nombre', nombre: 'Nombre de pila', apellidos: 'Apellidos', email: 'Correo', telefono: 'Teléfono',
  tipo: 'Tipo de evento', inicio: 'Inicio', fin: 'Fin', zona: 'Zona horaria', programado: 'Programado el',
  cancelado: 'Cancelado', canceladoEn: 'Cancelado el', motivo: 'Motivo de cancelación', estado: 'Estado',
  uuidInvitado: 'UUID del invitado', uuidEvento: 'UUID del evento', importe: 'Importe', moneda: 'Moneda',
}
const RE_PREGUNTA = /^(question|pregunta) ?(\d+)$/
const RE_RESPUESTA = /^(response|respuesta|answer) ?(\d+)$/
// Pistas de idioma (para el orden día/mes de las fechas con barras)
const PALABRAS_ES = ['invitado', 'fecha', 'correo', 'pregunta', 'respuesta', 'cancelad', 'zona horaria', 'nombre']

export function mapearColumnas(cabeceras) {
  const norm = cabeceras.map(normalizar)
  const col = {}
  const usadas = new Set()
  for (const [campo, nombres] of Object.entries(COLUMNAS)) {
    for (const n of nombres) {
      const i = norm.findIndex((h, j) => h === n && !usadas.has(j))
      if (i >= 0) {
        col[campo] = i
        usadas.add(i)
        break
      }
    }
  }
  const preguntas = []
  norm.forEach((h, i) => {
    const p = h.match(RE_PREGUNTA)
    if (p) {
      const r = norm.findIndex((x) => (x.match(RE_RESPUESTA) || [])[2] === p[2])
      preguntas.push({ n: Number(p[2]), pregunta: i, respuesta: r })
      usadas.add(i)
      if (r >= 0) usadas.add(r)
    }
  })
  const espanol = norm.some((h) => PALABRAS_ES.some((p) => h.includes(p)))
  return {
    col,
    preguntas: preguntas.sort((a, b) => a.n - b.n),
    reconocidas: Object.keys(col).map((c) => NOMBRES_COLUMNA[c]).concat(preguntas.length ? [`${preguntas.length} preguntas con su respuesta`] : []),
    noReconocidas: cabeceras.filter((_, i) => !usadas.has(i) && String(cabeceras[i]).trim() !== ''),
    idioma: espanol ? 'es' : 'en',
  }
}

// ---------- Fechas y horas ----------

const dos = (n) => String(n).padStart(2, '0')

function zonaValida(z) {
  if (!z || typeof z !== 'string' || !z.includes('/')) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: z })
    return true
  } catch {
    return false
  }
}

// Minutos que la zona va por delante de UTC en ese instante
function desfaseEn(zona, instante) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = {}
  for (const { type, value } of f.formatToParts(instante)) p[type] = value
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instante.getTime()) / 60000)
}

// 'AAAA-MM-DD' + 'HH:MM' en una zona horaria cualquiera -> instante
export function instanteEnZona(fecha, hora, zona) {
  if (zona === ZONA_HORARIA) return madridAInstante(fecha, hora)
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const comoUtc = Date.UTC(y, m - 1, d, h, mi)
  let t = comoUtc - desfaseEn(zona, new Date(comoUtc)) * 60000
  t = comoUtc - desfaseEn(zona, new Date(t)) * 60000
  return new Date(t)
}

// Orden de las fechas con barras (12/03/2026): por las propias fechas (un número > 12) o, si
// ninguna lo aclara, por el idioma del archivo. Se dice en el resumen para que se compruebe.
export function ordenDeFechas(valores, idioma) {
  let dm = false
  let md = false
  let ampm = false
  let hay = false
  for (const v of valores) {
    const m = String(v || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
    if (/\b[ap]\.?\s?m\.?\b/i.test(String(v || ''))) ampm = true
    if (!m) continue
    hay = true
    if (Number(m[1]) > 12) dm = true
    if (Number(m[2]) > 12) md = true
  }
  if (!hay) return { orden: null, deducido: false }
  if (dm && md) return { orden: 'mezcla', deducido: false }
  if (dm) return { orden: 'dm', deducido: false }
  if (md) return { orden: 'md', deducido: false }
  return { orden: idioma === 'es' || !ampm ? 'dm' : 'md', deducido: true }
}

// Lee una fecha y hora de Calendly. Devuelve { fecha, hora } (hora local, sin zona) o
// { instante } si el texto lleva su desfase (ISO con Z o +01:00); null si no se entiende.
export function leerFechaHora(texto, orden = 'dm') {
  let t = String(texto || '').trim().replace(/\s+/g, ' ')
  if (!t) return null
  // ISO con zona: 2026-11-26T15:00:00+01:00 / 2026-11-26 14:00:00Z
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s?(Z|[+-]\d{2}:?\d{2})$/i)
  if (m) {
    const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${dos(m[4])}:${m[5]}:${m[6] || '00'}${m[7].toUpperCase() === 'Z' ? 'Z' : m[7].length === 5 ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : m[7]}`)
    return Number.isFinite(ms) ? { instante: new Date(ms) } : null
  }
  // am / pm (también «p. m.» y «a. m.»)
  let ampm = null
  const mm = t.match(/\s?([ap])\.?\s?m\.?$/i)
  if (mm) {
    ampm = mm[1].toLowerCase()
    t = t.slice(0, mm.index).trim()
  }
  t = t.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  let y, mo, d, h, mi
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/))) {
    ;[y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number)
  } else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})[T ](\d{1,2}):(\d{2})(?::\d{2})?$/))) {
    if (orden !== 'dm' && orden !== 'md') return null
    const [a, b] = [Number(m[1]), Number(m[2])]
    ;[d, mo] = orden === 'dm' ? [a, b] : [b, a]
    y = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    h = Number(m[4])
    mi = Number(m[5])
  } else return null
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (ampm === 'a' && h === 12) h = 0
    else if (ampm === 'p' && h !== 12) h += 12
  }
  const fecha = `${y}-${dos(mo)}-${dos(d)}`
  const hora = `${dos(h)}:${dos(mi)}`
  if (!esFecha(fecha) || !esHora(hora) || h === 24) return null
  return { fecha, hora }
}

function aInstante(v, { zona, zonaFila }) {
  if (!v) return null
  if (v.instante) return v.instante
  if (zona === 'invitado') return zonaValida(zonaFila) ? instanteEnZona(v.fecha, v.hora, zonaFila) : null
  return madridAInstante(v.fecha, v.hora)
}

// ---------- Respuestas a las preguntas ----------

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function actividadDe(respuesta) {
  const r = sinTildes(respuesta)
  const encaja = [
    [/podcast/, 'Podcast'],
    [/taller|workshop|curso|clase|formacion/, 'Taller'],
    [/contenido|reel|video|tiktok|youtube|content/, 'Creación de contenido'],
    [/foto|photo|sesion de fotos|book/, 'Fotos'],
  ].filter(([re]) => re.test(r)).map(([, a]) => a)
  // Solo si está claro (una sola actividad); si no, va a comentarios
  return encaja.length === 1 && ACTIVIDADES.includes(encaja[0]) ? encaja[0] : null
}

function fondosDe(respuesta) {
  const r = sinTildes(respuesta)
  const blanco = /blanc|white/.test(r)
  const negro = /negr|black/.test(r)
  if (blanco && negro) return 'blanco-negro'
  if (blanco) return 'blanco'
  if (negro) return 'negro'
  if (/^(no|ninguno|ninguna|nada|sin fondo|none)\b/.test(r.trim())) return 'no'
  return null
}

function equipoDe(respuesta) {
  const r = sinTildes(respuesta)
  const ids = []
  if (/podcast/.test(r)) ids.push('podcast')
  if (/teleprompter|prompter/.test(r)) ids.push('teleprompter')
  if (/proyector|projector/.test(r)) ids.push('proyector')
  return ids.filter((id) => EQUIPO.some((e) => e.id === id))
}

// Reparte las preguntas y respuestas de Calendly en los campos de la reserva (como el formulario
// de la web) y deja el resto en comentarios
export function repartirRespuestas(pares) {
  const out = { telefono: null, apellidos: null, actividad: null, fondos: null, equipo: [], comentarios: [] }
  for (const { pregunta, respuesta } of pares) {
    const p = sinTildes(pregunta)
    const r = String(respuesta || '').trim()
    if (!r) continue
    if (/telefono|whatsapp|movil|phone|celular/.test(p) && !out.telefono) {
      out.telefono = r
      continue
    }
    if (/apellido/.test(p) && !out.apellidos) {
      out.apellidos = r
      continue
    }
    if (/fondo/.test(p)) {
      const f = fondosDe(r)
      if (f) {
        out.fondos = f
        continue
      }
    } else if (/equipo|kit|teleprompter|proyector|material/.test(p)) {
      const e = equipoDe(r)
      if (e.length) {
        out.equipo = [...new Set([...out.equipo, ...e])]
        continue
      }
      if (/^(no|ninguno|nada|none)\b/.test(sinTildes(r))) continue
    } else if (/actividad|que vas a hacer|para que|tipo de sesion|tipo de uso|uso del estudio|activity|purpose|que haras|que vais a hacer/.test(p)) {
      const a = actividadDe(r)
      if (a) {
        out.actividad = a
        continue
      }
    }
    out.comentarios.push(`${String(pregunta || '').trim() || 'Pregunta'}: ${r}`)
  }
  return out
}

// ---------- Leer las filas ----------

const VERDADERO = new Set(['true', 'yes', 'si', 'sí', '1', 'x', 'canceled', 'cancelled', 'cancelado', 'cancelada', 'verdadero'])

function importeDe(texto) {
  let t = String(texto || '').replace(/[^\d.,-]/g, '')
  if (!t) return null
  // 1.234,56 o 1,234.56 o 79,50 o 79.50
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma > punto) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

const limpio = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const telefonoLimpio = (v) => limpio(String(v || '').replace(/[^0-9+() -]/g, ''), 20)
const cifrasTel = (t) => String(t || '').replace(/[^0-9]/g, '').slice(-9)

function claveDe({ uuidInvitado, uuidEvento, email, telefono, inicio }) {
  if (uuidInvitado) return `${PREFIJO}${uuidInvitado}`
  if (uuidEvento) return `${PREFIJO}ev:${uuidEvento}:${email || cifrasTel(telefono)}`
  const h = crypto.createHash('sha256').update(`${email}|${cifrasTel(telefono)}|${inicio.toISOString()}`).digest('hex').slice(0, 24)
  return `${PREFIJO}h:${h}`
}

const DURACIONES_WEB = new Set(DURACIONES.map((d) => d.horas))
const textoHoras = (h) => `${String(Math.round(h * 100) / 100).replace('.', ',')} h`

// Una fila del CSV -> { ok, datos, errores, avisos }
function leerFila(celdas, map, { zona, orden, ahora, fest }) {
  const { col, preguntas } = map
  const v = (campo) => (col[campo] === undefined ? '' : String(celdas[col[campo]] ?? '').trim())
  const errores = []
  const avisos = []

  // Persona
  let nombre = limpio(v('nombre'), 80)
  let apellidos = limpio(v('apellidos'), 80)
  if (!nombre) {
    const completo = limpio(v('nombreCompleto'), 160)
    const [primero, ...resto] = completo.split(' ')
    nombre = limpio(primero, 80)
    if (!apellidos) apellidos = limpio(resto.join(' '), 80)
  }
  const email = limpio(v('email'), 120).toLowerCase()
  const pares = preguntas.map((p) => ({ pregunta: celdas[p.pregunta], respuesta: p.respuesta >= 0 ? celdas[p.respuesta] : '' }))
  const resp = repartirRespuestas(pares)
  const telefono = telefonoLimpio(v('telefono') || resp.telefono)
  if (!apellidos && resp.apellidos) apellidos = limpio(resp.apellidos, 80)
  if (!nombre) nombre = email ? email.split('@')[0] : 'Cliente de Calendly'
  if (!email && cifrasTel(telefono).length < 6) avisos.push('Sin correo ni teléfono: no irá a la ficha de ningún cliente.')

  // Fechas
  const zonaFila = v('zona')
  const inicioL = leerFechaHora(v('inicio'), orden)
  const finL = leerFechaHora(v('fin'), orden)
  if (!inicioL) errores.push(`No se entiende la fecha de inicio («${limpio(v('inicio'), 40) || 'vacía'}»).`)
  if (!finL) errores.push(`No se entiende la fecha de fin («${limpio(v('fin'), 40) || 'vacía'}»).`)
  let inicio = null
  let fin = null
  if (inicioL && finL) {
    if (zona === 'invitado' && !inicioL.instante && !zonaValida(zonaFila)) {
      errores.push(`Zona horaria del invitado no reconocida («${limpio(zonaFila, 40) || 'vacía'}»).`)
    } else {
      inicio = aInstante(inicioL, { zona, zonaFila })
      fin = aInstante(finL, { zona, zonaFila })
    }
  }
  let horas = null
  let fecha = null
  if (inicio && fin) {
    const min = Math.round((fin - inicio) / 60000)
    fecha = fechaMadrid(inicio)
    if (min <= 0) errores.push('La hora de fin es antes que la de inicio.')
    else if (min < 30 || min > 14 * 60) errores.push(`Duración rara (${textoHoras(min / 60)}): tiene que ser de 30 minutos a 14 horas.`)
    else if (min % 15) errores.push(`Duración rara (${min} minutos): no va en cuartos de hora.`)
    else if (fechaMadrid(new Date(fin.getTime() - 1)) !== fecha) errores.push('Pasa de un día a otro.')
    else {
      horas = min / 60
      if (!DURACIONES_WEB.has(horas)) avisos.push(`Duración que la web no vende (${textoHoras(horas)}): se importa igual.`)
      const tipo = tipoDeDia(fecha, fest)
      const { abre, cierra } = HORARIO[tipo]
      const ini = minutosDeHora(horaMadrid(inicio))
      const fi = ini + min
      if (ini < minutosDeHora(abre) || fi > minutosDeHora(cierra)) {
        avisos.push(`Hora fuera del horario del estudio (${horaMadrid(inicio)}–${horaMadrid(fin)} en Madrid): comprueba la zona horaria.`)
      }
    }
    if (zona === 'madrid' && !inicioL.instante && zonaValida(zonaFila) && desfaseEn(zonaFila, inicio) !== desfaseEn(ZONA_HORARIA, inicio)) {
      avisos.push(`Esta persona tenía otra zona horaria (${zonaFila}). Si las horas del archivo están en su zona, elige «Zona horaria de cada persona».`)
    }
  }

  // Cancelada
  const cancelTxt = sinTildes(v('cancelado'))
  const estadoTxt = sinTildes(v('estado'))
  let cancelada = false
  if (col.cancelado !== undefined) cancelada = VERDADERO.has(cancelTxt)
  else if (col.estado !== undefined) cancelada = /cancel/.test(estadoTxt)
  else cancelada = Boolean(v('motivo'))
  const programadoL = leerFechaHora(v('programado'), orden)
  const programado = programadoL ? aInstante(programadoL, { zona: zona === 'invitado' && zonaValida(zonaFila) ? 'invitado' : 'madrid', zonaFila }) : null
  const canceladoEnL = leerFechaHora(v('canceladoEn'), orden)
  const canceladoEn = canceladoEnL ? aInstante(canceladoEnL, { zona: zona === 'invitado' && zonaValida(zonaFila) ? 'invitado' : 'madrid', zonaFila }) : null

  // Dinero (solo para la reserva y su ficha; no cuenta en las cuentas del estudio)
  let precio = null
  let estimado = false
  const moneda = v('moneda').toUpperCase()
  const importe = importeDe(v('importe'))
  if (importe && (!moneda || moneda === 'EUR' || moneda === '€')) precio = importe
  else if (importe) avisos.push(`El importe viene en ${moneda}: se pone el precio de la web.`)
  if (horas && precio === null) {
    const tipo = tipoDeDia(fecha, fest)
    precio = precioCent(horas, tipo) ?? tarifaWebCent(horas, tipo)
    estimado = true
  }

  const uuidInvitado = limpio(v('uuidInvitado'), 80)
  const uuidEvento = limpio(v('uuidEvento'), 80)
  const tipoEvento = limpio(v('tipo'), 120)
  const comentarios = resp.comentarios.join('\n').slice(0, 1000) || null
  const datos = inicio && fin && horas ? {
    clave: claveDe({ uuidInvitado, uuidEvento, email, telefono, inicio }),
    inicio, fin, horas, fecha, tipoDia: tipoDeDia(fecha, fest),
    futura: fin.getTime() > ahora.getTime(),
    cancelada, motivo: limpio(v('motivo'), 300) || null, canceladoEn,
    nombre, apellidos, email, telefono,
    actividad: resp.actividad, fondos: resp.fondos || 'no', equipo: resp.equipo, comentarios,
    precioCent: precio, estimado, programado, tipoEvento,
  } : null
  return { ok: errores.length === 0 && Boolean(datos), datos, errores, avisos, nombre: `${nombre} ${apellidos}`.trim() }
}

// ---------- Analizar ----------

const solapan = (a1, a2, b1, b2) => a1 < b2 && b1 < a2

// Lo que ocupa cada reserva activa (como la restricción de la base de datos): las futuras con su
// margen de 30 minutos; las pasadas solo su hora (en el pasado ya no hace falta preparar nada)
const finOcupa = (d) => (d.futura ? bloqueoHasta(d.fin) : d.fin)

/**
 * Analiza el CSV sin tocar nada. Devuelve el resumen y, para importar, la lista de filas nuevas.
 * zona: 'madrid' (las horas del archivo están en hora de Madrid, la de la cuenta del estudio) o
 * 'invitado' (cada fila en la zona horaria de su persona).
 */
export async function analizarCsv(csv, { zona = 'madrid', ahora = new Date(), q = query } = {}) {
  if (typeof csv !== 'string' || !csv.trim()) throw new ErrorReserva('archivo', 'El archivo está vacío.', 400)
  if (Buffer.byteLength(csv, 'utf8') > MAX_BYTES) throw new ErrorReserva('archivo', 'El archivo es demasiado grande (más de 3 MB). Exporta un rango de fechas más corto.', 400)
  if (!['madrid', 'invitado'].includes(zona)) throw new ErrorReserva('zona', 'Elige la zona horaria de las horas del archivo.', 400)
  const { filas } = leerCsv(csv)
  if (filas.length < 2) throw new ErrorReserva('archivo', 'El archivo no tiene filas de reservas.', 400)
  if (filas.length - 1 > MAX_FILAS) throw new ErrorReserva('archivo', `Demasiadas filas (más de ${MAX_FILAS}). Exporta un rango de fechas más corto.`, 400)
  const [cabeceras, ...cuerpo] = filas
  const map = mapearColumnas(cabeceras)
  const faltan = ['inicio', 'fin'].filter((c) => map.col[c] === undefined).map((c) => NOMBRES_COLUMNA[c])
  if (map.col.email === undefined && map.col.nombreCompleto === undefined && map.col.nombre === undefined) faltan.push('Nombre o correo')
  if (faltan.length) {
    throw new ErrorReserva('columnas', `No es el archivo de Calendly o le faltan columnas: ${faltan.join(', ')}. Expórtalo desde Calendly (Eventos programados → Exportar).`, 400, { columnas: { reconocidas: map.reconocidas, noReconocidas: map.noReconocidas } })
  }
  const orden = ordenDeFechas(cuerpo.map((f) => f[map.col.inicio]), map.idioma)
  const fest = await festivos(q)

  const leidas = cuerpo.map((celdas, i) => ({ fila: i + 2, ...leerFila(celdas, map, { zona, orden: orden.orden, ahora, fest }) }))
  const buenas = leidas.filter((l) => l.ok)

  // Ya importadas antes (misma referencia) y ya apuntadas a mano en el panel (misma hora y persona)
  const claves = [...new Set(buenas.map((l) => l.datos.clave))]
  const { rows: ya } = claves.length ? await q('SELECT id, externo_ref FROM reservas WHERE externo_ref = ANY($1::text[])', [claves]) : { rows: [] }
  const yaRef = new Map(ya.map((r) => [r.externo_ref, r.id]))
  const inicios = [...new Set(buenas.map((l) => l.datos.inicio.toISOString()))]
  const { rows: mismas } = inicios.length
    ? await q(
      `SELECT id, inicio, fin, lower(btrim(email)) AS email, telefono, externo_ref FROM reservas
        WHERE inicio = ANY($1::timestamptz[]) AND estado IN ('confirmada', 'conflicto', 'pendiente')`,
      [inicios]
    )
    : { rows: [] }

  // Lo que ya ocupa la agenda en el rango del archivo (reservas activas y, para las futuras, bloqueos)
  const activas = buenas.filter((l) => !l.datos.cancelada)
  let ocupadas = []
  let bloqueos = []
  if (activas.length) {
    const min = new Date(Math.min(...activas.map((l) => l.datos.inicio.getTime())) - 86400000)
    const max = new Date(Math.max(...activas.map((l) => finOcupa(l.datos).getTime())) + 86400000)
    ;({ rows: ocupadas } = await q(
      `SELECT id, codigo, inicio, bloqueo_hasta, nombre, apellidos FROM reservas
        WHERE (estado IN ('confirmada', 'conflicto') OR (estado = 'pendiente' AND (expira_en IS NULL OR expira_en > now())))
          AND inicio < $2 AND bloqueo_hasta > $1`,
      [min, max]
    ))
    ;({ rows: bloqueos } = await q('SELECT inicio, fin, motivo FROM bloqueos WHERE inicio < $2 AND fin > $1', [min, max]))
  }

  const nuevas = []
  const enPanel = []
  let yaImportadas = 0
  const problemas = []
  const vistas = new Set()
  const aceptadasActivas = []
  const ordenadas = [...leidas].sort((a, b) => (a.datos?.inicio?.getTime() ?? 0) - (b.datos?.inicio?.getTime() ?? 0) || a.fila - b.fila)
  for (const l of ordenadas) {
    const etiqueta = l.datos ? `${fechaDdMmAaaa(l.datos.fecha)} ${horaMadrid(l.datos.inicio)}` : ''
    if (!l.ok) {
      for (const e of l.errores) problemas.push({ fila: l.fila, nombre: l.nombre, cuando: etiqueta, texto: e, tipo: 'error' })
      continue
    }
    const d = l.datos
    if (vistas.has(d.clave)) {
      problemas.push({ fila: l.fila, nombre: l.nombre, cuando: etiqueta, texto: 'Repetida en el archivo: se importa solo una vez.', tipo: 'aviso' })
      continue
    }
    vistas.add(d.clave)
    if (yaRef.has(d.clave)) {
      yaImportadas++
      continue
    }
    const tel = cifrasTel(d.telefono)
    const misma = mismas.find((r) => new Date(r.inicio).getTime() === d.inicio.getTime() && new Date(r.fin).getTime() === d.fin.getTime()
      && !r.externo_ref && ((d.email && r.email === d.email) || (tel.length >= 6 && cifrasTel(r.telefono) === tel)))
    if (misma && !d.cancelada) {
      enPanel.push({ fila: l.fila, id: misma.id, clave: d.clave })
      continue
    }
    if (!d.cancelada) {
      const a1 = d.inicio.getTime()
      const a2 = finOcupa(d).getTime()
      const choque = ocupadas.find((r) => solapan(a1, a2, new Date(r.inicio).getTime(), new Date(r.bloqueo_hasta).getTime()))
      const bloqueo = d.futura && bloqueos.find((b) => solapan(a1, d.fin.getTime(), new Date(b.inicio).getTime(), new Date(b.fin).getTime()))
      const ultima = aceptadasActivas.at(-1)
      if (choque) {
        problemas.push({ fila: l.fila, nombre: l.nombre, cuando: etiqueta, texto: `Choca con la reserva ${choque.codigo} (${`${choque.nombre} ${choque.apellidos || ''}`.trim()}) del panel: no se importa.`, tipo: 'error' })
        continue
      }
      if (bloqueo) {
        problemas.push({ fila: l.fila, nombre: l.nombre, cuando: etiqueta, texto: `Choca con un bloqueo del estudio${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}: no se importa.`, tipo: 'error' })
        continue
      }
      if (ultima && solapan(a1, a2, ultima.inicio.getTime(), finOcupa(ultima).getTime())) {
        problemas.push({ fila: l.fila, nombre: l.nombre, cuando: etiqueta, texto: `Se pisa con otra reserva del archivo (fila ${ultima.fila}): no se importa.`, tipo: 'error' })
        continue
      }
      aceptadasActivas.push({ ...d, fila: l.fila })
    }
    for (const a of l.avisos) problemas.push({ fila: l.fila, nombre: l.nombre, cuando: etiqueta, texto: a, tipo: 'aviso' })
    nuevas.push({ fila: l.fila, ...d })
  }

  const conError = new Set(problemas.filter((p) => p.tipo === 'error').map((p) => p.fila))
  const resumen = {
    filas: cuerpo.length,
    nuevas: nuevas.length,
    pasadas: nuevas.filter((d) => !d.cancelada && !d.futura).length,
    futuras: nuevas.filter((d) => !d.cancelada && d.futura).length,
    canceladas: nuevas.filter((d) => d.cancelada).length,
    yaImportadas,
    yaEnPanel: enPanel.length,
    conError: conError.size,
    estimadas: nuevas.filter((d) => d.estimado).length,
  }
  const avisoOrden = orden.orden === 'mezcla'
    ? 'Las fechas con barras mezclan día/mes y mes/día: no se han podido leer.'
    : orden.deducido ? `Las fechas con barras se han leído como ${orden.orden === 'dm' ? 'día/mes' : 'mes/día'} (por el idioma del archivo): comprueba la muestra.` : null
  return {
    columnas: { reconocidas: map.reconocidas, noReconocidas: map.noReconocidas },
    zona,
    avisoOrden,
    resumen,
    problemas: problemas.sort((a, b) => (a.tipo === b.tipo ? a.fila - b.fila : a.tipo === 'error' ? -1 : 1)),
    muestra: nuevas.slice().sort((a, b) => b.inicio - a.inicio).slice(0, 12).map(filaMuestra),
    proximas: nuevas.filter((d) => !d.cancelada && d.futura).slice(0, 30).map(filaMuestra),
    _nuevas: nuevas,
    _enPanel: enPanel,
  }
}

const filaMuestra = (d) => ({
  fila: d.fila,
  fecha: d.fecha,
  desde: horaMadrid(d.inicio),
  hasta: horaMadrid(d.fin),
  horas: d.horas,
  nombre: `${d.nombre} ${d.apellidos}`.trim(),
  email: d.email,
  estado: d.cancelada ? 'cancelada' : d.futura ? 'futura' : 'pasada',
  importe: d.precioCent != null ? `${formatoEuros(d.precioCent)}${d.estimado ? ' (estimado)' : ''}` : '',
})

// Lo que se enseña en el navegador (sin las listas internas)
export function paraPantalla(a) {
  const { _nuevas, _enPanel, ...resto } = a
  return resto
}

// ---------- Importar ----------

function notasDe(d, hoy) {
  const n = [`Importada de Calendly el ${fechaDdMmAaaa(hoy)}.`]
  if (d.tipoEvento) n.push(`Tipo en Calendly: ${d.tipoEvento}.`)
  if (d.estimado) n.push('Precio estimado con la tarifa de la web: el archivo de Calendly no traía el importe (lo cobrado está en Stripe).')
  return n.join(' ')
}

/**
 * Importa lo que diga analizarCsv. Todo con el candado de la agenda; cada fila con su
 * SAVEPOINT, para que una mala no tumbe el resto. Devuelve { importadas, futuras, problemas, resumen, … }.
 */
export async function importarCsv(csv, { zona = 'madrid', ahora = new Date() } = {}) {
  return conAgenda(async (q) => {
    // Se vuelve a analizar dentro del candado: la agenda puede haber cambiado desde la vista previa
    const a = await analizarCsv(csv, { zona, ahora, q })
    const hoy = fechaMadrid(ahora)
    const problemas = [...a.problemas]
    let importadas = 0
    let futuras = 0
    for (const d of a._nuevas) {
      await q('SAVEPOINT fila_calendly')
      try {
        const { rows } = await q(
          `INSERT INTO reservas (codigo, token, origen, estado, pago_estado, metodo_pago, pagado_en, inicio, fin, bloqueo_hasta,
              duracion_horas, tipo_dia, precio_cent, nombre, apellidos, email, telefono, actividad, fondos, equipo, factura,
              comentarios, notas_internas, cancelada_en, motivo_cancelacion, recordatorio_enviado_en, externo_ref)
           VALUES ($1, $2, 'calendly', $3, 'pagado', 'stripe', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
              NULL, $18, $19, $20, $21, now(), $22)
           RETURNING id`,
          [codigoNuevo(), tokenNuevo(), d.cancelada ? 'cancelada' : 'confirmada', d.programado || d.inicio, d.inicio, d.fin,
            finOcupa(d), d.horas, d.tipoDia, d.precioCent, d.nombre, d.apellidos || '', d.email || '', d.telefono || '',
            d.actividad, d.fondos, JSON.stringify(d.equipo || []), d.comentarios, notasDe(d, hoy),
            d.cancelada ? d.canceladoEn || d.programado || d.inicio : null, d.cancelada ? d.motivo || 'Cancelada en Calendly' : null, d.clave]
        )
        // No van a Google Calendar (Calendly ya las pone) ni llevan recordatorio (lo manda Calendly)
        await q(`UPDATE reservas SET gcal_estado = 'ok' WHERE id = $1`, [rows[0].id])
        await registrar(q, rows[0].id, 'creada', { origen: 'calendly', importada: true, ref: d.clave }, { autor: 'panel' })
        await q('RELEASE SAVEPOINT fila_calendly')
        importadas++
        if (!d.cancelada && d.futura) futuras++
      } catch (e) {
        await q('ROLLBACK TO SAVEPOINT fila_calendly')
        const texto = e.code === '23P01' ? 'Choca con otra reserva activa: no se importa.'
          : e.code === '23505' ? 'Ya estaba importada.' : `No se ha podido importar (${String(e.message || e).slice(0, 120)}).`
        problemas.push({ fila: d.fila, nombre: `${d.nombre} ${d.apellidos}`.trim(), cuando: `${fechaDdMmAaaa(d.fecha)} ${horaMadrid(d.inicio)}`, texto, tipo: 'error' })
      }
    }
    // Las que ya estaban apuntadas a mano en el panel (misma hora y persona) se dejan como están:
    // se reconocen igual cada vez que se sube el archivo, así que no hace falta marcarlas
    const r = paraPantalla(a)
    return {
      ...r,
      problemas,
      importadas,
      futuras,
      mensaje: importadas
        ? `${importadas === 1 ? 'Importada 1 reserva' : `Importadas ${importadas} reservas`} de Calendly${futuras ? ` (${futuras === 1 ? 'la futura ya ocupa su hora' : `${futuras} futuras ya ocupan su hora`})` : ''}.`
        : 'No había reservas nuevas que importar.',
    }
  })
}
