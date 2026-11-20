// «Añadir» con tus palabras: entiende frases cortas con palabras clave, SIN inteligencia
// artificial ni servicios externos. Siempre devuelve lo que ha entendido para que el estudio lo
// revise y lo guarde (o lo corrija en el formulario); nunca guarda nada por sí solo.
//
//   interpretar('Reserva de Laura el lunes de 17 a 19', contexto)
//   → { tipo: 'reserva', campos: { modo: 'horas', fecha, desde, hasta, nombre, … }, filas, faltan, avisos, listo }
//
// contexto: { hoy: 'AAAA-MM-DD', categorias, miembros, clientes, cuotas, festivos }
//   categorias: [{ id, clave, nombre, tipoFactura, ivaPct, retencionPct, activa }]
//   miembros:   [{ id, nombre }]                       (suscripciones activas)
//   clientes:   [{ nombre, apellidos, email, telefono }] (quien ya ha reservado alguna vez)
//   cuotas:     [{ id, susId, nombre, periodo, desde, importeCent, cobroEstado }] (pendientes)
//   festivos:   ['AAAA-MM-DD', …]

import { DURACIONES, HORARIO } from '../reservas/config.js'

export const EJEMPLOS = [
  { que: 'Una reserva', frase: 'Reserva de Laura el lunes de 17 a 19' },
  { que: 'Un gasto', frase: 'Aquaservice 32 € con tarjeta' },
  { que: 'Un cobro de cuota', frase: 'Cobrado 199 € de cuota de Irene por Bizum' },
  { que: 'Unas horas bloqueadas', frase: 'Bloquear el sábado por la mañana' },
  { que: 'Otro ingreso', frase: 'Cobrado 24,20 € de fondo blanco en efectivo' },
  { que: 'Una pregunta', frase: '¿Cómo va el mes?' },
]

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const DIAS_TEXTO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const METODO_TEXTO = { tarjeta: 'Tarjeta', bizum: 'Bizum', efectivo: 'Efectivo', transferencia: 'Transferencia', domiciliacion: 'Recibo domiciliado', stripe: 'Stripe', otro: 'Otro' }
const ABRE = HORARIO.laborable.abre
const CIERRA = HORARIO.laborable.cierra

// ---------- Texto ----------

export function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim()
}

const mayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
const palabras = (t) => normalizar(t).split(/[^a-z0-9ñ]+/).filter(Boolean)

export function euros(cent) {
  const neg = cent < 0
  const [e, c] = (Math.abs(cent) / 100).toFixed(2).split('.')
  return `${neg ? '−' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${c} €`
}

// ---------- Fechas (AAAA-MM-DD, sin horas ni zonas) ----------

const aFecha = (s) => new Date(`${s}T12:00:00Z`)
const deFecha = (d) => d.toISOString().slice(0, 10)
export const sumarDias = (s, n) => {
  const d = aFecha(s)
  d.setUTCDate(d.getUTCDate() + n)
  return deFecha(d)
}
const diaSemana = (s) => aFecha(s).getUTCDay()
const diasDelMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()
const fechaDe = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

export function textoFecha(fecha, hoy) {
  const [a, m, d] = fecha.split('-').map(Number)
  const base = `${mayuscula(DIAS_TEXTO[diaSemana(fecha)])} ${d} de ${MESES[m - 1]}`
  const extra = fecha === hoy ? ' (hoy)' : fecha === sumarDias(hoy, 1) ? ' (mañana)' : fecha === sumarDias(hoy, -1) ? ' (ayer)' : ''
  return `${base}${a !== Number(hoy.slice(0, 4)) ? ` de ${a}` : ''}${extra}`
}

// Las franjas «por la mañana / por la tarde» no son la fecha «mañana»
const RE_FRANJA_MANANA = /\b(?:por|de|a) la manana\b|\bpor las mananas\b|\besta manana\b/
const RE_FRANJA_TARDE = /\b(?:por|de|a) la tarde\b|\bpor las tardes\b|\besta tarde\b/
const RE_TODO_DIA = /\btodo el dia\b|\bdia (?:entero|completo)\b|\btoda la jornada\b/

// sentido: 'futuro' (reservas, bloqueos) o 'pasado' (gastos, cobros). Devuelve { fecha, fechaFin } o null
export function leerFecha(n, hoy, sentido = 'futuro') {
  const anioHoy = Number(hoy.slice(0, 4))
  const mesHoy = Number(hoy.slice(5, 7))
  const diaHoy = Number(hoy.slice(8, 10))
  const sinFranjas = n.replace(RE_FRANJA_MANANA, ' ').replace(RE_FRANJA_TARDE, ' ')
  if (/\besta (?:manana|tarde|noche)\b/.test(n)) return { fecha: hoy }
  if (/\bpasado manana\b/.test(sinFranjas)) return { fecha: sumarDias(hoy, 2) }
  if (/\bmanana\b/.test(sinFranjas)) return { fecha: sumarDias(hoy, 1) }
  if (/\bhoy\b/.test(n)) return { fecha: hoy }
  if (/\banteayer\b/.test(n)) return { fecha: sumarDias(hoy, -2) }
  if (/\bayer\b/.test(n)) return { fecha: sumarDias(hoy, -1) }

  // «del 24 al 28 de diciembre» (varios días)
  const varios = /\bdel? (\d{1,2}) al (\d{1,2})(?: de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))?\b/.exec(n)
  if (varios) {
    const mes = varios[3] ? MESES.indexOf(varios[3]) + 1 : null
    const ini = fechaConDia(Number(varios[1]), mes, null, { anioHoy, mesHoy, diaHoy, hoy, sentido })
    const fin = ini && fechaConDia(Number(varios[2]), mes || Number(ini.slice(5, 7)), Number(ini.slice(0, 4)), { anioHoy, mesHoy, diaHoy, hoy, sentido: 'futuro', minimo: ini })
    if (ini && fin && fin > ini) return { fecha: ini, fechaFin: fin }
  }

  // «25 de noviembre (de 2026)»
  const conMes = /\b(\d{1,2}) (?:de )?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?: (?:de )?(\d{4}))?\b/.exec(n)
  if (conMes) {
    const f = fechaConDia(Number(conMes[1]), MESES.indexOf(conMes[2]) + 1, conMes[3] ? Number(conMes[3]) : null, { anioHoy, mesHoy, diaHoy, hoy, sentido })
    if (f) return { fecha: f }
  }
  // «25/11», «25/11/2026» (o con guion si va detrás de «el» o «día»)
  const barra = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(n) || /\b(?:el|dia) (\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?\b/.exec(n)
  if (barra && Number(barra[2]) >= 1 && Number(barra[2]) <= 12) {
    const anio = barra[3] ? (barra[3].length === 2 ? 2000 + Number(barra[3]) : Number(barra[3])) : null
    const f = fechaConDia(Number(barra[1]), Number(barra[2]), anio, { anioHoy, mesHoy, diaHoy, hoy, sentido })
    if (f) return { fecha: f }
  }

  // «el lunes», «este sábado», «el viernes que viene», «el próximo martes»
  const dia = /\b(este |esta |el proximo |proximo |el )?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b( que viene)?/.exec(n)
  if (dia) {
    const objetivo = DIAS.indexOf(dia[2])
    const hoyDia = diaSemana(hoy)
    const siguiente = /proximo/.test(dia[1] || '') || Boolean(dia[3])
    let salto
    if (sentido === 'pasado' && !siguiente) salto = -((hoyDia - objetivo + 7) % 7)
    else if (/^est/.test(dia[1] || '')) salto = (objetivo - hoyDia + 7) % 7
    else salto = (objetivo - hoyDia + 7) % 7 || 7
    return { fecha: sumarDias(hoy, salto) }
  }

  // «el 25», «el día 25» (sin mes): el próximo 25 (o el último, si es algo pasado)
  const soloDia = /\b(?:el dia|el|dia) (\d{1,2})\b(?!\s*(?::|h\b|horas?\b|€|euros?\b|de la (?:manana|tarde)))/.exec(n)
  if (soloDia) {
    const f = fechaConDia(Number(soloDia[1]), null, null, { anioHoy, mesHoy, diaHoy, hoy, sentido })
    if (f) return { fecha: f }
  }
  return null
}

function fechaConDia(dia, mes, anio, { anioHoy, mesHoy, diaHoy, hoy, sentido, minimo = null }) {
  if (dia < 1 || dia > 31) return null
  if (mes && anio) return dia <= diasDelMes(anio, mes) ? fechaDe(anio, mes, dia) : null
  if (mes) {
    let a = anioHoy
    let f = dia <= diasDelMes(a, mes) ? fechaDe(a, mes, dia) : null
    if (sentido === 'futuro' && f && f < (minimo || hoy)) { a++; f = dia <= diasDelMes(a, mes) ? fechaDe(a, mes, dia) : null }
    if (sentido === 'pasado' && f && f > hoy) { a--; f = dia <= diasDelMes(a, mes) ? fechaDe(a, mes, dia) : null }
    return f
  }
  // Sin mes: este mes o el siguiente (o el anterior, si es pasado)
  let a = anioHoy
  let m = mesHoy
  if (sentido === 'futuro' && dia < diaHoy) { m++; if (m > 12) { m = 1; a++ } }
  if (sentido === 'pasado' && dia > diaHoy) { m--; if (m < 1) { m = 12; a-- } }
  return dia <= diasDelMes(a, m) ? fechaDe(a, m, dia) : null
}

// ---------- Horas ----------

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const aMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

// El estudio abre de 9 a 22: «de 5 a 7» es por la tarde
function hora(h, m = 0) {
  let x = Number(h)
  if (x >= 1 && x <= 8) x += 12
  if (x > 24 || Number(m) > 59) return null
  return x * 60 + Number(m || 0)
}

// Devuelve { desde, hasta } (las dos o ninguna), { duracionH } o { franja: 'manana'|'tarde'|'dia' }
export function leerHoras(n) {
  const r = {}
  const rango = /\b(?:de|desde|entre) (?:las |la )?(\d{1,2})(?:[:.h](\d{2}))? ?(?:h|horas)? (?:a|hasta|y) (?:las |la )?(\d{1,2})(?:[:.h](\d{2}))? ?h?\b/.exec(n)
    || /\b(\d{1,2})(?::(\d{2}))? ?h? ?- ?(\d{1,2})(?::(\d{2}))? ?h\b/.exec(n)
    || /\b(\d{1,2}):(\d{2}) ?- ?(\d{1,2}):(\d{2})\b/.exec(n)
  if (rango) {
    const d = hora(rango[1], rango[2])
    let h = hora(rango[3], rango[4])
    if (d !== null && h !== null && h <= d && h + 12 * 60 <= 24 * 60 && Number(rango[3]) <= 12) h += 12 * 60
    if (d !== null && h !== null && h > d) return { desde: hhmm(d), hasta: hhmm(h) }
  }
  const dur = /\b(\d{1,2}(?:[.,]5)?) ?(?:h|horas?)\b/.exec(n)
  const duracionH = dur ? Number(dur[1].replace(',', '.')) : null
  const una = /\ba las (\d{1,2})(?:[:.h](\d{2}))?\b/.exec(n) || /\b(?:desde las|entrando a las) (\d{1,2})(?:[:.h](\d{2}))?\b/.exec(n)
  if (una) {
    const d = hora(una[1], una[2])
    if (d !== null && duracionH) return { desde: hhmm(d), hasta: hhmm(Math.min(d + Math.round(duracionH * 60), 24 * 60)) }
    if (d !== null) r.desde = hhmm(d)
  }
  if (duracionH) r.duracionH = duracionH
  if (RE_TODO_DIA.test(n)) r.franja = 'dia'
  else if (RE_FRANJA_MANANA.test(n)) r.franja = 'manana'
  else if (RE_FRANJA_TARDE.test(n)) r.franja = 'tarde'
  return r
}

export const FRANJAS = { manana: [ABRE, '14:00'], tarde: ['15:00', CIERRA], dia: [ABRE, CIERRA] }
const FRANJA_TEXTO = { manana: 'por la mañana', tarde: 'por la tarde', dia: 'todo el día' }

// ---------- Importe y forma de pago ----------

// «32 €», «32,50 €», «1.200 euros», «€ 18», «199€» → céntimos
export function leerImporte(n) {
  const m = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?) ?(?:€|eur\b|euros?\b)/.exec(n) || /€ ?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/.exec(n)
  if (!m) return null
  let t = m[1]
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const v = Math.round(Number(t) * 100)
  return Number.isFinite(v) && v > 0 ? v : null
}

const RE_IMPORTE = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?) ?(?:€|eur\b|euros?\b)|€ ?\d+(?:[.,]\d{1,2})?/g

export function leerMetodo(n) {
  if (/\bbizum\b/.test(n)) return 'bizum'
  if (/\b(?:tarjeta|datafono|tpv)\b/.test(n)) return 'tarjeta'
  if (/\b(?:efectivo|en mano|metalico|cash)\b/.test(n)) return 'efectivo'
  if (/\btransferencia\b/.test(n)) return 'transferencia'
  if (/\b(?:domiciliad[oa]|domiciliacion|recibo)\b/.test(n)) return 'domiciliacion'
  if (/\bstripe\b/.test(n)) return 'stripe'
  return null
}

const RE_METODO = /\b(?:con|por|en|mediante|pagad[oa] con|pagad[oa] por)? ?(?:la )?(?:tarjeta|bizum|efectivo|en mano|metalico|cash|transferencia|domiciliad[oa]|domiciliacion|recibo|datafono|tpv|stripe)\b/g

// ---------- Personas ----------

const tokens = (t) => palabras(t).filter((w) => w.length > 1)

// ¿Qué persona de la lista se nombra? Puntúa por palabras del nombre que aparecen en el texto.
// Devuelve { una } si hay una clara, { varias } si empatan, o {} si ninguna.
export function buscarPersona(dicho, lista, nombreDe = (x) => x.nombre) {
  const t = new Set(tokens(dicho))
  if (!t.size) return {}
  let mejor = 0
  let elegidas = []
  for (const p of lista) {
    const ps = tokens(nombreDe(p))
    if (!ps.length || !t.has(ps[0])) continue // el nombre de pila tiene que estar
    const puntos = ps.filter((w) => t.has(w)).length
    if (puntos > mejor) { mejor = puntos; elegidas = [p] } else if (puntos === mejor) elegidas.push(p)
  }
  if (!elegidas.length) return {}
  return elegidas.length === 1 ? { una: elegidas[0], puntos: mejor } : { varias: elegidas, puntos: mejor }
}

// Nombre tras «reserva de / para / a nombre de» (hasta la fecha, la hora o el final)
const PARADAS = new Set(['el', 'la', 'los', 'las', 'este', 'esta', 'hoy', 'manana', 'pasado', 'de', 'del', 'a', 'al', 'desde', 'entre', 'para', 'por', 'con', 'en', 'y', 'dia', 'proximo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'que', 'sesion', 'reserva', 'fotos', 'podcast', 'taller', 'cuota', 'plan', 'mensualidad'])
function nombreTras(original, claves) {
  const n = normalizar(original)
  const re = new RegExp(`\\b(?:${claves})\\s+(?:de|para|a nombre de|con)\\s+(.+)$`)
  const m = re.exec(n)
  if (!m) return ''
  const sigue = m[1].split(' ')
  const tomadas = []
  for (const w of sigue) {
    const limpio = w.replace(/[^a-zñ]/g, '')
    if (!limpio || PARADAS.has(limpio) || /\d/.test(w)) break
    tomadas.push(limpio)
    if (tomadas.length === 3) break
  }
  if (!tomadas.length) return ''
  // Recupera las mayúsculas y tildes que escribió el usuario
  const orig = original.split(/\s+/)
  return tomadas.map((w) => {
    const igual = orig.find((o) => normalizar(o).replace(/[^a-zñ]/g, '') === w)
    return igual ? mayuscula(igual.replace(/[^\p{L}]/gu, '')) : mayuscula(w)
  }).join(' ')
}

// ---------- Categorías de gasto ----------

const CATEGORIAS_CLAVE = [
  ['aquaservice', /\baquaservice|garrafa|garrafas|agua embotellada\b/],
  ['luz', /\b(?:luz|electricidad|iberdrola|endesa|naturgy|holaluz|factura electrica)\b/],
  ['agua', /\b(?:agua|emivasa|aguas de valencia)\b/],
  ['internet', /\b(?:internet|fibra|wifi|movistar|vodafone|orange|digi|o2|telefono|movil)\b/],
  ['alquiler', /\balquiler\b/],
  ['alarma', /\b(?:alarma|securitas|prosegur|movistar prosegur)\b/],
  ['seguro', /\bseguro\b/],
  ['gestoria', /\b(?:gestoria|gestor|asesoria|asesor)\b/],
  ['limpieza', /\b(?:limpieza|lejia|fregona|friegasuelos|productos de limpieza|bayetas|papel higienico|jabon)\b/],
  ['reparaciones', /\b(?:reparacion|arreglo|arreglar|mantenimiento|fontanero|electricista|cerrajero|pintura|pintor)\b/],
  ['comisiones', /\b(?:comision|comisiones|banco|tpv)\b/],
  ['publicidad', /\b(?:publicidad|anuncio|anuncios|meta ads|facebook ads|instagram ads|google ads|promocion)\b/],
  ['programas', /\b(?:programa|app|aplicacion|suscripcion|dominio|hosting|canva|adobe|capcut|icloud|google one|dropbox|notion|chatgpt)\b/],
  ['fondos', /\b(?:fondo|fondos|vinilo|vinilos|papel continuo|tela|telas|ciclorama)\b/],
  ['equipo', /\b(?:foco|focos|camara|camaras|tripode|tripodes|micro|microfono|microfonos|objetivo|flash|softbox|bateria|baterias|led)\b/],
  ['material', /\b(?:material|atrezo|cinta|pinzas|consumibles|bombilla|bombillas|alargador|regleta|ferreteria|ikea|amazon|decoracion|planta|plantas)\b/],
]

export function categoriaDeGasto(n, categorias) {
  const activas = categorias.filter((c) => c.activa !== false)
  const porClave = (k) => activas.find((c) => c.clave === k)
  for (const [k, re] of CATEGORIAS_CLAVE) {
    if (re.test(n) && porClave(k)) return { categoria: porClave(k), segura: true }
  }
  return { categoria: porClave('otros') || activas.find((c) => c.grupo === 'variable') || activas[0] || null, segura: false }
}

// Concepto del gasto o ingreso: la frase sin importe, forma de pago, fecha ni muletillas
function concepto(original) {
  let t = ` ${normalizar(original)} `
  t = t.replace(RE_IMPORTE, ' ').replace(RE_METODO, ' ')
  t = t.replace(/\b(?:hoy|ayer|anteayer|esta manana|esta tarde)\b/g, ' ')
  t = t.replace(/\b(?:el|este) (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g, ' ')
  t = t.replace(/\b(?:el )?(?:dia )?\d{1,2}(?: de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))?\b/g, ' ')
  t = t.replace(/\b(?:he |hemos )?(?:pagado|pagamos|gastado|comprado|cobrado|cobramos|ingresado)\b/g, ' ')
  t = t.replace(/\b(?:gasto|compra|ingreso|apunta|apuntar|anade|anadir|pon)\b/g, ' ')
  t = t.replace(/^\s*(?:de|del|en|por|un|una|el|la|los|las)\b/, ' ').replace(/\s+(?:de|del|en|por|con|y)\s*$/, ' ')
  t = t.replace(/\s+/g, ' ').trim().replace(/^(?:de|del|en|por|el|la|un|una) /, '')
  if (!t) return ''
  // Recupera la forma escrita (tildes, mayúsculas) de cada palabra
  const orig = original.split(/\s+/)
  const salida = t.split(' ').map((w) => {
    const igual = orig.find((o) => normalizar(o).replace(/[^a-z0-9ñ]/g, '') === w)
    return igual ? igual.replace(/[.,;:!?¿¡]+$/g, '') : w
  }).join(' ')
  return mayuscula(salida)
}

// ---------- Tarifas ----------

function tipoDia(fecha, festivos) {
  const d = diaSemana(fecha)
  return d === 0 || d === 6 || festivos.includes(fecha) ? 'finde' : 'laborable'
}

function tarifa(horas, tipo) {
  const d = DURACIONES.find((x) => x.horas === horas)
  return d ? d[tipo] : null
}

const textoHoras = (h) => (h === 1 ? '1 hora' : `${String(h).replace('.', ',')} horas`)

// ---------- Intérprete ----------

// elegido (opcional): la persona que el estudio ha elegido entre varias posibles
//   { miembroId } o { cliente: { nombre, apellidos, email, telefono } }
export function interpretar(texto, contexto = {}, elegido = null) {
  const ctx = { categorias: [], miembros: [], clientes: [], cuotas: [], festivos: [], ...contexto }
  const original = String(texto || '').trim()
  const n = normalizar(original)
  const vacio = { tipo: 'nada', campos: {}, filas: [], faltan: [], avisos: [], listo: false }
  if (!n) return { ...vacio, mensaje: 'Escribe qué quieres añadir.' }

  if (/\b(?:como|que tal) (?:va|vamos|llevamos|van|ha ido|fue)\b|\bresumen del mes\b|\bcuanto (?:llevamos|hemos (?:ganado|facturado))\b/.test(n)) {
    return { ...vacio, tipo: 'pregunta', listo: true }
  }
  if (/\b(?:bloque(?:a|ar|o|ad|ame)|cerrar|cierra|cerrad[oa]|no se puede reservar|vacaciones)\b/.test(n)) return bloqueo(original, n, ctx)

  const importe = leerImporte(n)
  const cobro = /\b(?:cobrad[oa]|cobramos|he cobrado|hemos cobrado|ha pagado|han pagado|me ha pagado|nos ha pagado|pago de|ingres(?:o|ado|ar))\b/.test(n)
  if (/\b(?:cuota|cuotas|mensualidad)\b/.test(n)) return cuota(original, n, ctx, importe, elegido)
  if (cobro && !/\breserv/.test(n) && buscarPersona(n, ctx.miembros).una) return cuota(original, n, ctx, importe, elegido)
  if (/\b(?:reserv(?:a|ar|ame|amos)|sesion)\b/.test(n)) return reserva(original, n, ctx, elegido)
  if (importe && cobro) return ingreso(original, n, ctx, importe)
  if (importe || /\b(?:gasto|he pagado|hemos pagado|compra|comprado)\b/.test(n)) return gasto(original, n, ctx, importe)
  // Sin palabra clave pero con nombre, día y horas: es una reserva
  const h = leerHoras(n)
  if (leerFecha(n, ctx.hoy) && h.desde && h.hasta) return reserva(original, n, ctx, elegido)
  return { ...vacio, mensaje: 'No lo he entendido. Prueba con una de las frases de ejemplo o usa el formulario.' }
}

function resultado(tipo, campos, filas, faltan, avisos, extra = {}) {
  return { tipo, campos, filas: filas.filter(([, v]) => v), faltan, avisos, listo: faltan.length === 0, ...extra }
}

function reserva(original, n, ctx, elegido) {
  const faltan = []
  const avisos = []
  const f = leerFecha(n, ctx.hoy, 'futuro')
  const h = leerHoras(n)
  let desde = h.desde || null
  let hasta = h.hasta || null
  if (!hasta && h.franja && !desde) [desde, hasta] = FRANJAS[h.franja]
  if (!f) faltan.push('el día')
  if (!desde || !hasta) faltan.push(desde ? 'hasta qué hora (o cuántas horas)' : 'la hora (por ejemplo «de 17 a 19»)')
  const horaTexto = desde && hasta ? `${desde} a ${hasta} (${textoHoras((aMin(hasta) - aMin(desde)) / 60)})` : ''

  const dicho = nombreTras(original, 'reserva|reservar|reservame|sesion|sesion del plan')
  const fuente = dicho || n
  const email = (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(original) || [])[0] || ''
  const telefono = ((/(?:\+?34[\s-]?)?[6789](?:[\s-]?\d){8}\b/.exec(original) || [])[0] || '').replace(/[\s-]/g, '')
  const actividad = /\bpodcast\b/.test(n) ? 'Podcast' : /\b(?:taller|curso|workshop)\b/.test(n) ? 'Taller' : /\b(?:contenido|video|videos|reels?|grabar)\b/.test(n) ? 'Creación de contenido' : /\b(?:fotos?|sesion de fotos|shooting)\b/.test(n) ? 'Fotos' : null

  // ¿Quién es? Alguien con suscripción (sesión de su plan), alguien que ya ha reservado o alguien nuevo
  const nombreCliente = (c) => `${c.nombre} ${c.apellidos || ''}`.trim()
  let persona = null
  let opciones = null
  if (elegido?.miembroId != null) {
    const m = ctx.miembros.find((x) => x.id === elegido.miembroId)
    persona = m ? { tipo: 'miembro', m } : { tipo: 'nuevo' }
  } else if (elegido?.cliente) {
    persona = { tipo: 'cliente', c: elegido.cliente }
  } else {
    const m = buscarPersona(fuente, ctx.miembros)
    const c = buscarPersona(fuente, ctx.clientes, nombreCliente)
    const miembros = m.una ? [m.una] : m.varias || []
    // Un miembro también es cliente: no cuenta dos veces
    const clientes = (c.una ? [c.una] : c.varias || []).filter((cl) => !miembros.some((x) => normalizar(x.nombre) === normalizar(nombreCliente(cl))))
    const plan = /\b(?:sesion|plan)\b/.test(n)
    if (miembros.length === 1 && (plan || !clientes.length || m.puntos > (c.puntos || 0))) persona = { tipo: 'miembro', m: miembros[0] }
    else if (clientes.length === 1 && (!miembros.length || c.puntos > (m.puntos || 0))) persona = { tipo: 'cliente', c: clientes[0] }
    else if (miembros.length + clientes.length > 1) {
      opciones = [
        ...miembros.map((x) => ({ etiqueta: `${x.nombre} · sesión de su plan`, persona: { miembroId: x.id } })),
        ...clientes.slice(0, 5).map((cl) => ({ etiqueta: `${nombreCliente(cl)}${cl.telefono ? ` · ${cl.telefono}` : cl.email ? ` · ${cl.email}` : ''}`, persona: { cliente: cl } })),
      ]
    } else persona = { tipo: 'nuevo' }
  }

  if (persona?.tipo === 'miembro') {
    const m = persona.m
    const campos = { modo: 'suscripcion', susId: m.id, nombre: m.nombre, fecha: f?.fecha || '', desde: desde || '', hasta: hasta || '' }
    if (f && f.fecha < ctx.hoy) avisos.push('Es un día que ya ha pasado.')
    return resultado('reserva', campos, [
      ['Es', 'Una sesión de su plan'],
      ['Quién', m.nombre],
      ['Día', f ? textoFecha(f.fecha, ctx.hoy) : ''],
      ['Hora', horaTexto],
    ], faltan, avisos, { revisar: 'Las sesiones de los miembros se guardan desde el formulario, para ver antes sus horas del mes y los avisos.' })
  }

  let campos = { modo: 'horas', fecha: f?.fecha || '', desde: desde || '', hasta: hasta || '', nombre: '', apellidos: '', email, telefono, actividad: actividad || 'Fotos' }
  if (persona?.tipo === 'cliente') {
    const c = persona.c
    campos = { ...campos, nombre: c.nombre, apellidos: c.apellidos || '', email: email || c.email || '', telefono: telefono || c.telefono || '' }
  } else if (persona?.tipo === 'nuevo' && dicho) {
    const [nom, ...ape] = dicho.split(' ')
    campos = { ...campos, nombre: nom, apellidos: ape.join(' ') }
  }
  if (opciones) faltan.push('quién es (hay varias personas con ese nombre)')
  else if (!campos.nombre) faltan.push('a nombre de quién')
  else if (!campos.email && !campos.telefono) faltan.push('su teléfono o su correo (es la primera vez que reserva)')

  let precio = null
  if (f && desde && hasta) {
    const horas = (aMin(hasta) - aMin(desde)) / 60
    const tipo = tipoDia(f.fecha, ctx.festivos)
    precio = tarifa(horas, tipo)
    if (precio === null) faltan.push(`el precio (no hay tarifa de ${textoHoras(horas)}${tipo === 'finde' ? ' en fin de semana o festivo' : ''})`)
    else campos.precioCent = precio
    if (aMin(desde) < aMin(ABRE) || aMin(hasta) > aMin(CIERRA)) avisos.push(`Está fuera del horario (${ABRE}–${CIERRA}).`)
    if (f.fecha < ctx.hoy) avisos.push('Es un día que ya ha pasado.')
    if (h.franja && !h.desde) avisos.push(`No dices la hora: pongo ${FRANJA_TEXTO[h.franja]} (${desde}–${hasta}).`)
  }
  if (!actividad) avisos.push('No dices qué va a hacer: lo apunto como «Fotos».')

  return resultado('reserva', campos, [
    ['Es', persona?.tipo === 'cliente' ? 'Una reserva por horas · ya ha venido antes' : 'Una reserva por horas'],
    ['Quién', `${campos.nombre} ${campos.apellidos}`.trim()],
    ['Contacto', [campos.telefono, campos.email].filter(Boolean).join(' · ')],
    ['Día', f ? textoFecha(f.fecha, ctx.hoy) : ''],
    ['Hora', horaTexto],
    ['Qué va a hacer', actividad || ''],
    ['Precio', precio !== null && f ? `${euros(precio)} · ${tipoDia(f.fecha, ctx.festivos) === 'finde' ? 'fin de semana o festivo' : 'entre semana'} · sin pagar` : ''],
  ], faltan, avisos, opciones ? { opciones } : {})
}

function gasto(original, n, ctx, importe) {
  const faltan = []
  const avisos = []
  const f = leerFecha(n, ctx.hoy, 'pasado')
  const metodo = leerMetodo(n)
  const { categoria, segura } = categoriaDeGasto(n, ctx.categorias)
  if (!importe) faltan.push('el importe (por ejemplo «32 €»)')
  if (!categoria) faltan.push('la categoría')
  if (categoria && !segura) avisos.push(`No sé de qué tipo es: lo pongo en «${categoria.nombre}». Cámbialo en el formulario si no es eso.`)
  const fecha = f?.fecha || ctx.hoy
  if (fecha > ctx.hoy) avisos.push('Es una fecha futura: los gastos se apuntan el día de la factura o del cargo.')
  const texto = concepto(original) || categoria?.nombre || ''
  const campos = { categoriaId: categoria?.id ?? null, importeCent: importe, metodoPago: metodo || '', fecha, concepto: texto }
  return resultado('gasto', campos, [
    ['Es', 'Un gasto'],
    ['Concepto', texto],
    ['Importe', importe ? `${euros(importe)} (lo pagado, con IVA)` : ''],
    ['Categoría', categoria?.nombre || ''],
    ['Pago', metodo ? METODO_TEXTO[metodo] : 'Sin indicar'],
    ['Fecha', textoFecha(fecha, ctx.hoy)],
  ], faltan, avisos)
}

function ingreso(original, n, ctx, importe) {
  const avisos = []
  const f = leerFecha(n, ctx.hoy, 'pasado')
  const metodo = leerMetodo(n)
  const tipo = /\b(?:fondo|fondos|teleprompter|kit|podcast|proyector|equipo)\b/.test(n) ? 'extras' : 'otro'
  const fecha = f?.fecha || ctx.hoy
  const texto = concepto(original) || (tipo === 'extras' ? 'Fondos o equipo del día' : 'Otro ingreso')
  if (fecha > ctx.hoy) avisos.push('Es una fecha futura: los cobros se apuntan el día que llega el dinero.')
  const campos = { tipo, importeCent: importe, metodoPago: metodo || '', fecha, concepto: texto }
  return resultado('ingreso', campos, [
    ['Es', tipo === 'extras' ? 'Otro ingreso · fondos o equipo del día' : 'Otro ingreso'],
    ['Concepto', texto],
    ['Importe', `${euros(importe)} (con IVA del 21 %)`],
    ['Pago', metodo ? METODO_TEXTO[metodo] : 'Sin indicar'],
    ['Fecha', textoFecha(fecha, ctx.hoy)],
  ], [], avisos)
}

function cuota(original, n, ctx, importe, elegido) {
  const faltan = []
  const avisos = []
  const dicho = nombreTras(original, 'cuota|cuotas|mensualidad|plan')
  const elegida = elegido?.miembroId != null ? ctx.miembros.find((x) => x.id === elegido.miembroId) : null
  const quien = elegida ? { una: elegida } : buscarPersona(dicho || n, ctx.miembros)
  let campos = { cuotaId: null, susId: null, metodo: leerMetodo(n) || 'transferencia', fecha: leerFecha(n, ctx.hoy, 'pasado')?.fecha || ctx.hoy, importeCent: importe }
  let opciones = null
  let cuotaElegida = null
  if (quien.varias) {
    faltan.push('de quién es (hay varias personas con ese nombre)')
    opciones = quien.varias.slice(0, 5).map((m) => ({ etiqueta: m.nombre, persona: { miembroId: m.id } }))
  } else if (!quien.una) {
    faltan.push('de quién es la cuota')
  } else {
    const suyas = ctx.cuotas.filter((c) => c.susId === quien.una.id).sort((a, b) => (a.desde < b.desde ? -1 : 1))
    cuotaElegida = suyas.find((c) => c.desde <= ctx.hoy) || suyas[0] || null
    if (!cuotaElegida) faltan.push(`una cuota pendiente (${quien.una.nombre} no tiene ninguna sin pagar)`)
    else {
      campos = { ...campos, cuotaId: cuotaElegida.id, susId: quien.una.id }
      if (suyas.length > 1) avisos.push(`Tiene ${suyas.length} cuotas sin pagar: marco la más antigua (mes ${cuotaElegida.periodo}).`)
      if (importe && importe !== cuotaElegida.importeCent) avisos.push(`Dices ${euros(importe)} y la cuota es de ${euros(cuotaElegida.importeCent)}: se marca pagada la cuota entera. Si pagó otra cantidad, cámbiala antes en su ficha.`)
      if (cuotaElegida.cobroEstado === 'cobrando' || cuotaElegida.cobroEstado === 'revisar') avisos.push('Esta cuota tiene un cobro con tarjeta sin resolver: compruébalo en el TPV antes de marcarla pagada.')
    }
  }
  if (!leerMetodo(n)) avisos.push('No dices cómo ha pagado: pongo transferencia.')
  if (campos.fecha > ctx.hoy) avisos.push('Es una fecha futura.')
  return resultado('cuota', campos, [
    ['Es', 'Un cobro de cuota'],
    ['Quién', quien.una ? quien.una.nombre : ''],
    ['Cuota', cuotaElegida ? `Mes ${cuotaElegida.periodo} · desde el ${textoFecha(cuotaElegida.desde, ctx.hoy).toLowerCase()} · ${euros(cuotaElegida.importeCent)}` : ''],
    ['Pago', METODO_TEXTO[campos.metodo]],
    ['Fecha', textoFecha(campos.fecha, ctx.hoy)],
  ], faltan, avisos, opciones ? { opciones } : {})
}

function bloqueo(original, n, ctx) {
  const faltan = []
  const avisos = []
  const f = leerFecha(n, ctx.hoy, 'futuro')
  const h = leerHoras(n)
  let desde = h.desde && h.hasta ? h.desde : null
  let hasta = h.desde && h.hasta ? h.hasta : null
  if (!desde && h.franja) [desde, hasta] = FRANJAS[h.franja]
  if (!desde) {
    ;[desde, hasta] = FRANJAS.dia
    avisos.push('No dices las horas: bloqueo todo el día.')
  }
  if (!f) faltan.push('el día')
  if (f && f.fecha < ctx.hoy) avisos.push('Es un día que ya ha pasado.')
  const m = /\b(?:para|porque|motivo:?)\s+(.+)$/i.exec(original)
  const motivo = m ? mayuscula(m[1].replace(/[.!]+$/, '').trim()) : (/\bvacaciones\b/.test(n) ? 'Vacaciones' : '')
  const campos = { fecha: f?.fecha || '', fechaFin: f?.fechaFin || '', desde, hasta, motivo }
  return resultado('bloqueo', campos, [
    ['Es', 'Unas horas bloqueadas (nadie puede reservar)'],
    ['Día', f ? (f.fechaFin ? `Del ${textoFecha(f.fecha, ctx.hoy).toLowerCase()} al ${textoFecha(f.fechaFin, ctx.hoy).toLowerCase()}` : textoFecha(f.fecha, ctx.hoy)) : ''],
    ['Horas', `${desde} a ${hasta}`],
    ['Motivo', motivo || 'Sin motivo (solo lo veis vosotros)'],
  ], faltan, avisos)
}
