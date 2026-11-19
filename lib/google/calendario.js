// Google Calendar del estudio: cada reserva confirmada (web, panel y sesiones de los planes)
// y cada bloqueo se copia al momento como evento, con los datos que rellenó el cliente.
// Si cambia, se actualiza; si se cancela o se borra, se quita.
//
// Cómo funciona:
// - El estudio conecta su cuenta desde el panel (/admin/google) con OAuth 2.0. Se guarda solo
//   el «refresh token», cifrado con una clave sacada de SESSION_SECRET (nunca en claro).
// - Un disparador de la base de datos marca como «pendiente» toda reserva o bloqueo que cambia
//   (ver migración 9). Después de cada cambio del panel, de cada pago y en el cron diario se
//   pasan a Google los pendientes. Si Google falla, la reserva sigue adelante igual: queda
//   «error» y se reintenta más tarde (o con «Volver a sincronizar» en el panel).
// - Cada evento tiene un id fijo sacado de la reserva, así nunca se crea dos veces.
// - Sin GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET, o sin conectar, no hace nada.

import crypto from 'node:crypto'
import { query } from '../db/index.js'
import { secretoDeSesion } from '../admin/auth.js'
import { ESTUDIO, FONDOS, EQUIPO, ZONA_HORARIA, formatoEuros, textoDuracion } from '../reservas/config.js'

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const REVOCAR = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'

// calendar.events: crear, cambiar y borrar eventos (no deja tocar los calendarios en sí).
// calendar.calendarlist.readonly: solo para enseñar la lista y elegir en qué calendario van.
// openid email: para enseñar con qué cuenta está conectado.
export const PERMISOS = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
]

const CLAVE_CONEXION = 'google_conexion'
const CLAVE_SEMILLA = 'google_semilla'
const ESPERA_MS = 4000 // tiempo máximo de cada llamada a Google (Vercel corta las funciones a los 10 s en Hobby)
const INTENTOS_SOLOS = 5 // después, solo el cron diario y el botón del panel lo reintentan
const PLAN_NOMBRE = { starter: 'Starter', creator: 'Creator', pro: 'Pro' }
const METODOS = { tarjeta: 'tarjeta', transferencia: 'transferencia', bizum: 'Bizum', efectivo: 'efectivo', otro: 'otro medio', stripe: 'Stripe', plan: 'incluida en el plan' }

export class ErrorGoogle extends Error {
  constructor(mensaje, { estado = null, codigo = null } = {}) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
  }
}

export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

// ---------- Cifrado del token (AES-256-GCM) ----------

function claveCifrado() {
  return Buffer.from(crypto.hkdfSync('sha256', secretoDeSesion(), 'ar-studio', 'google-calendar-token', 32))
}

export function cifrar(texto) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', claveCifrado(), iv)
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), datos.toString('base64url')].join('.')
}

export function descifrar(cifrado) {
  const [v, iv, tag, datos] = String(cifrado || '').split('.')
  if (v !== 'v1' || !iv || !tag || !datos) throw new ErrorGoogle('La conexión guardada con Google no se puede leer.')
  const d = crypto.createDecipheriv('aes-256-gcm', claveCifrado(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8')
}

// ---------- Conexión guardada (tabla ajustes) ----------

async function leerAjuste(clave) {
  const { rows } = await query('SELECT valor FROM ajustes WHERE clave = $1', [clave])
  return rows[0]?.valor ?? null
}

async function guardarAjuste(clave, valor) {
  await query(
    `INSERT INTO ajustes (clave, valor) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`,
    [clave, valor]
  )
}

// { cuenta, calendarioId, calendarioNombre, estado: 'ok' | 'revocado', conectadoEn, token (cifrado) }
export async function leerConexion() {
  const v = await leerAjuste(CLAVE_CONEXION)
  if (!v) return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

async function guardarConexion(c) {
  await guardarAjuste(CLAVE_CONEXION, JSON.stringify(c))
}

// Lo que el panel puede enseñar (sin el token)
export async function estadoGoogle() {
  const configurado = googleConfigurado()
  const c = await leerConexion()
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM reservas WHERE gcal_estado = 'error') + (SELECT count(*)::int FROM bloqueos WHERE gcal_estado = 'error') AS errores,
       (SELECT count(*)::int FROM reservas WHERE gcal_estado = 'pendiente' AND ${condicionDebeTener('reservas')}) +
       (SELECT count(*)::int FROM bloqueos WHERE gcal_estado = 'pendiente' AND ${condicionDebeTener('bloqueos')}) AS pendientes,
       (SELECT count(*)::int FROM gcal_borrar) AS por_borrar,
       (SELECT max(gcal_error) FROM reservas WHERE gcal_estado = 'error') AS ultimo_error`
  )
  return {
    configurado,
    conectado: Boolean(c && c.estado === 'ok'),
    revocado: Boolean(c && c.estado === 'revocado'),
    cuenta: c?.cuenta || null,
    calendarioId: c?.calendarioId || null,
    calendarioNombre: c?.calendarioNombre || null,
    conectadoEn: c?.conectadoEn || null,
    errores: rows[0].errores,
    pendientes: rows[0].pendientes,
    porBorrar: rows[0].por_borrar,
    ultimoError: rows[0].ultimo_error,
  }
}

// Id fijo del evento: el mismo para la misma reserva, así nunca se crea dos veces. Lleva una
// semilla propia de cada base de datos para que una base de pruebas no pise eventos de la real.
async function semilla() {
  let s = await leerAjuste(CLAVE_SEMILLA)
  if (!s) {
    await query(`INSERT INTO ajustes (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING`, [CLAVE_SEMILLA, crypto.randomBytes(16).toString('hex')])
    s = await leerAjuste(CLAVE_SEMILLA)
  }
  return s
}

// Google pide ids con letras a-v y números (base32hex); el hexadecimal vale
export function idEvento(semillaBase, tipo, ref) {
  return `ar${crypto.createHash('sha256').update(`${semillaBase}:${tipo}:${ref}`).digest('hex').slice(0, 40)}`
}

// ---------- OAuth ----------

export function urlAutorizacion({ redirectUri, estado }) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: PERMISOS.join(' '),
    access_type: 'offline',
    prompt: 'consent', // así Google siempre devuelve el refresh token
    include_granted_scopes: 'true',
    state: estado,
  })
  return `${AUTORIZAR}?${p}`
}

async function pedirToken(campos) {
  let res
  try {
    res = await globalThis.fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...campos }),
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (e) {
    throw new ErrorGoogle(`No se pudo hablar con Google (${e.name === 'TimeoutError' ? 'tarda demasiado' : e.message}).`)
  }
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErrorGoogle(`Google no dio acceso: ${datos.error_description || datos.error || res.status}.`, { estado: res.status, codigo: datos.error })
  return datos
}

function emailDelIdToken(idToken) {
  try {
    const cuerpo = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'))
    return cuerpo.email || null
  } catch {
    return null
  }
}

// Vuelta de Google con el código: se cambia por el token y se guarda la conexión
export async function completarConexion({ codigo, redirectUri }) {
  const t = await pedirToken({ code: codigo, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  const permisos = String(t.scope || '').split(' ')
  if (!permisos.includes('https://www.googleapis.com/auth/calendar.events')) {
    throw new ErrorGoogle('Falta el permiso para crear eventos en el calendario. Vuelve a conectar y marca todas las casillas.')
  }
  if (!t.refresh_token) throw new ErrorGoogle('Google no ha dado acceso permanente. Vuelve a conectar.')
  const anterior = await leerConexion()
  const cuenta = emailDelIdToken(t.id_token)
  const mismaCuenta = anterior && anterior.cuenta && anterior.cuenta === cuenta
  const conexion = {
    cuenta,
    calendarioId: mismaCuenta ? anterior.calendarioId : 'primary',
    calendarioNombre: mismaCuenta ? anterior.calendarioNombre : cuenta || 'Calendario principal',
    estado: 'ok',
    conectadoEn: new Date().toISOString(),
    token: cifrar(t.refresh_token),
  }
  // Si antes había otra cuenta o calendario, sus eventos se quedan allí (no hay permiso para
  // quitarlos con esta cuenta); los de ahora se crean en el nuevo.
  if (anterior && !mismaCuenta) await olvidarEventos()
  await guardarConexion(conexion)
  guardarAccesoEnMemoria(t.access_token, t.expires_in)
  await marcarTodoPendiente()
  return { cuenta }
}

export async function desconectar() {
  const c = await leerConexion()
  if (c?.token) {
    try {
      await globalThis.fetch(`${REVOCAR}?token=${encodeURIComponent(descifrar(c.token))}`, { method: 'POST', signal: AbortSignal.timeout(ESPERA_MS) })
    } catch {
      // Si Google no contesta, se borra igual de aquí
    }
  }
  await query('DELETE FROM ajustes WHERE clave = $1', [CLAVE_CONEXION])
  acceso = null
}

// El token de acceso dura una hora: se guarda en memoria y se renueva con el refresh token
let acceso = null
function guardarAccesoEnMemoria(token, segundos) {
  if (token) acceso = { token, caduca: Date.now() + (Number(segundos) || 3000) * 1000 - 60000 }
}

// Solo para pruebas
export function _olvidarAcceso() {
  acceso = null
}

async function tokenDeAcceso(conexion) {
  if (acceso && acceso.caduca > Date.now()) return acceso.token
  let t
  try {
    t = await pedirToken({ refresh_token: descifrar(conexion.token), grant_type: 'refresh_token' })
  } catch (e) {
    // invalid_grant: se quitó el permiso desde Google o caducó (app en modo «pruebas»)
    if (e.codigo === 'invalid_grant') {
      await guardarConexion({ ...conexion, estado: 'revocado' })
      throw new ErrorGoogle('Google ha cortado la conexión. Vuelve a conectar Google Calendar desde el panel.', { codigo: 'revocado' })
    }
    throw e
  }
  guardarAccesoEnMemoria(t.access_token, t.expires_in)
  return acceso.token
}

async function llamar(conexion, metodo, ruta, cuerpo) {
  const token = await tokenDeAcceso(conexion)
  let res
  try {
    res = await globalThis.fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(ESPERA_MS),
    })
  } catch (e) {
    throw new ErrorGoogle(`No se pudo hablar con Google (${e.name === 'TimeoutError' ? 'tarda demasiado' : e.message}).`)
  }
  if (res.status === 401) acceso = null
  if (res.status === 204) return { estado: 204, datos: null }
  const datos = await res.json().catch(() => null)
  return { estado: res.status, datos }
}

function errorDeRespuesta(r, que) {
  const m = r.datos?.error?.message || `código ${r.estado}`
  return new ErrorGoogle(`Google no dejó ${que}: ${m}`, { estado: r.estado })
}

export async function listarCalendarios() {
  const c = await leerConexion()
  if (!c || c.estado !== 'ok') throw new ErrorGoogle('Google Calendar no está conectado.')
  const r = await llamar(c, 'GET', '/users/me/calendarList?minAccessRole=writer&maxResults=100')
  if (r.estado !== 200) throw errorDeRespuesta(r, 'ver los calendarios')
  return (r.datos.items || []).map((x) => ({ id: x.id, nombre: x.summaryOverride || x.summary || x.id, principal: Boolean(x.primary) }))
}

// Cambiar de calendario: los eventos del anterior se quitan y se crean en el nuevo
export async function elegirCalendario(id) {
  const c = await leerConexion()
  if (!c || c.estado !== 'ok') throw new ErrorGoogle('Google Calendar no está conectado.')
  const lista = await listarCalendarios()
  const elegido = lista.find((x) => x.id === id || (id === 'primary' && x.principal))
  if (!elegido) throw new ErrorGoogle('Ese calendario no está en la cuenta o no deja añadir eventos.')
  const nuevoId = elegido.principal ? 'primary' : elegido.id
  if (nuevoId !== c.calendarioId) {
    await query(
      `INSERT INTO gcal_borrar (evento_id, calendario)
       SELECT gcal_evento_id, $1 FROM reservas WHERE gcal_evento_id IS NOT NULL
       UNION ALL SELECT gcal_evento_id, $1 FROM bloqueos WHERE gcal_evento_id IS NOT NULL`,
      [c.calendarioId]
    )
    await olvidarEventos()
    await marcarTodoPendiente()
  }
  await guardarConexion({ ...c, calendarioId: nuevoId, calendarioNombre: elegido.nombre })
  return elegido
}

async function olvidarEventos() {
  await query(`UPDATE reservas SET gcal_evento_id = NULL WHERE gcal_evento_id IS NOT NULL`)
  await query(`UPDATE bloqueos SET gcal_evento_id = NULL WHERE gcal_evento_id IS NOT NULL`)
}

// Al conectar (o cambiar de calendario) se repasan las reservas de la última semana en adelante
async function marcarTodoPendiente() {
  await query(`UPDATE reservas SET gcal_estado = 'pendiente', gcal_intentos = 0 WHERE gcal_evento_id IS NOT NULL OR ${condicionDebeTener('reservas')}`)
  await query(`UPDATE bloqueos SET gcal_estado = 'pendiente', gcal_intentos = 0 WHERE gcal_evento_id IS NOT NULL OR ${condicionDebeTener('bloqueos')}`)
}

// ---------- El evento ----------

// Qué filas tienen que estar en Google. Las de Calendly no: Calendly ya las pone en el
// calendario. Lo de hace más de una semana tampoco, salvo que ya tenga evento.
function condicionDebeTener(tabla) {
  if (tabla === 'bloqueos') return `(fin > now() - interval '7 days')`
  return `(estado IN ('confirmada', 'conflicto') AND origen <> 'calendly' AND fin > now() - interval '7 days')`
}

function debeTenerEvento(fila, tabla, ahora = new Date()) {
  const reciente = new Date(fila.fin).getTime() > ahora.getTime() - 7 * 86400000
  if (tabla === 'bloqueos') return reciente || Boolean(fila.gcal_evento_id)
  if (!['confirmada', 'conflicto'].includes(fila.estado) || fila.origen === 'calendly') return false
  return reciente || Boolean(fila.gcal_evento_id)
}

const texto = (v) => String(v ?? '').trim()
const horas = (n) => textoDuracion(Number(n), { corto: true })

export function eventoDeReserva(r, { urlPanel }) {
  const nombre = `${texto(r.nombre)} ${texto(r.apellidos)}`.replace(/\s+/g, ' ').trim()
  const duracion = horas(r.duracion_horas)
  const esPlan = r.origen === 'plan'
  const pagada = r.pago_estado === 'pagado'
  const extra = esPlan ? Math.max(0, Number(r.duracion_horas) - Number(r.horas_plan || 0)) : 0
  let titulo = esPlan
    ? `Plan ${PLAN_NOMBRE[r.plan_suscripcion] || ''} · ${nombre} (${duracion})`.replace(/\s+/g, ' ')
    : `Reserva · ${nombre} (${duracion})`
  if (r.estado === 'conflicto') titulo = `REVISAR PAGO · ${titulo}`
  else if (!pagada && (!esPlan || (extra > 0 && r.precio_cent > 0))) titulo += esPlan ? ' · horas aparte sin pagar' : ' · SIN PAGAR'

  const fondos = FONDOS.find((f) => f.id === r.fondos)
  const equipo = (Array.isArray(r.equipo) ? r.equipo : []).map((id) => EQUIPO.find((e) => e.id === id)?.texto || id)
  const factura = r.factura && r.factura.nif ? `con sus datos (${texto(r.factura.nombre)}, ${texto(r.factura.nif)})` : 'simplificada (sin datos)'
  let pago
  if (esPlan) {
    pago = `${horas(r.horas_plan || 0)} del plan${extra > 0 ? ` + ${horas(extra)} aparte (${formatoEuros(r.precio_cent)}${pagada ? ', pagadas' : ', sin pagar'})` : ''}`
  } else {
    pago = `${formatoEuros(r.precio_cent)} · ${pagada ? `pagada${r.metodo_pago ? ` (${METODOS[r.metodo_pago] || r.metodo_pago})` : ''}` : r.pago_estado === 'pendiente' ? 'sin pagar' : 'devuelta (total o en parte)'}`
  }
  const lineas = [
    `Reserva ${r.codigo}${r.estado === 'conflicto' ? ' · el pago llegó pero choca con otra reserva: revisar en el panel' : ''}`,
    '',
    `Nombre: ${nombre}`,
    r.telefono ? `WhatsApp: ${texto(r.telefono)}` : null,
    r.email ? `Correo: ${texto(r.email)}` : null,
    r.actividad ? `Qué va a hacer: ${texto(r.actividad)}` : null,
    fondos && fondos.id !== 'no' ? `Fondos: ${fondos.texto}` : null,
    equipo.length ? `Equipo: ${equipo.join(', ')}` : null,
    r.comentarios ? `Comentarios del cliente: ${texto(r.comentarios)}` : null,
    '',
    `Duración: ${duracion}`,
    `${esPlan ? 'Horas' : 'Importe'}: ${pago}`,
    !esPlan || extra > 0 ? `Factura: ${factura}` : null,
    r.notas_internas ? `Notas del estudio: ${texto(r.notas_internas)}` : null,
    '',
    `Ficha en el panel: ${urlPanel}/reserva/${r.id}`,
  ].filter((l) => l !== null)
  return {
    summary: titulo,
    description: lineas.join('\n').replace(/\n{3,}/g, '\n\n'),
    location: ESTUDIO.direccion,
    start: { dateTime: new Date(r.inicio).toISOString(), timeZone: ZONA_HORARIA },
    end: { dateTime: new Date(r.fin).toISOString(), timeZone: ZONA_HORARIA },
    status: 'confirmed',
    extendedProperties: { private: { arstudio: 'reserva', arstudioRef: String(r.id) } },
  }
}

export function eventoDeBloqueo(b, { urlPanel }) {
  return {
    summary: `Cerrado · ${texto(b.motivo) || 'bloqueo'}`,
    description: `Bloqueo del estudio: no se puede reservar.\n\nBloqueos en el panel: ${urlPanel}/bloqueos`,
    location: ESTUDIO.direccion,
    start: { dateTime: new Date(b.inicio).toISOString(), timeZone: ZONA_HORARIA },
    end: { dateTime: new Date(b.fin).toISOString(), timeZone: ZONA_HORARIA },
    status: 'confirmed',
    transparency: 'opaque',
    extendedProperties: { private: { arstudio: 'bloqueo', arstudioRef: String(b.id) } },
  }
}

const enc = encodeURIComponent

// Crea o actualiza el evento con id fijo: si ya existe (409), se reescribe entero
async function ponerEvento(c, id, evento) {
  const cal = enc(c.calendarioId)
  if (evento.__existe) {
    const r = await llamar(c, 'PUT', `/calendars/${cal}/events/${enc(id)}`, { ...evento, __existe: undefined })
    if (r.estado === 200) return
    if (r.estado !== 404 && r.estado !== 410) throw errorDeRespuesta(r, 'cambiar el evento')
  }
  const r = await llamar(c, 'POST', `/calendars/${cal}/events`, { id, ...evento, __existe: undefined })
  if (r.estado === 200) return
  if (r.estado === 409) {
    const u = await llamar(c, 'PUT', `/calendars/${cal}/events/${enc(id)}`, { ...evento, __existe: undefined })
    if (u.estado === 200) return
    throw errorDeRespuesta(u, 'cambiar el evento')
  }
  throw errorDeRespuesta(r, 'crear el evento')
}

async function quitarEvento(c, id, calendario = null) {
  const r = await llamar(c, 'DELETE', `/calendars/${enc(calendario || c.calendarioId)}/events/${enc(id)}`)
  if ([200, 204, 404, 410].includes(r.estado)) return
  throw errorDeRespuesta(r, 'quitar el evento')
}

// ---------- Sincronizar ----------

function urlDelPanel(base) {
  const b = (base || process.env.SITIO_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${b}/admin`
}

async function apuntarError(tabla, fila, e) {
  const mensaje = String(e.message || e).slice(0, 300)
  await query(
    `UPDATE ${tabla} SET gcal_estado = 'error', gcal_error = $3, gcal_intentos = gcal_intentos + 1 WHERE id = $1 AND gcal_version = $2`,
    [fila.id, fila.gcal_version, mensaje]
  )
}

async function apuntarOk(tabla, fila, eventoId) {
  // Si la fila cambió mientras tanto (otra versión), se queda pendiente para la próxima vez
  await query(
    `UPDATE ${tabla} SET gcal_estado = 'ok', gcal_evento_id = $3, gcal_error = NULL, gcal_intentos = 0, gcal_sincronizado_en = now()
      WHERE id = $1 AND gcal_version = $2`,
    [fila.id, fila.gcal_version, eventoId]
  )
}

async function sincronizarFila(c, tabla, fila, s, urlPanel) {
  const tipo = tabla === 'bloqueos' ? 'bloqueo' : 'reserva'
  if (debeTenerEvento(fila, tabla)) {
    const id = fila.gcal_evento_id || idEvento(s, tipo, fila.id)
    const ev = tipo === 'bloqueo' ? eventoDeBloqueo(fila, { urlPanel }) : eventoDeReserva(fila, { urlPanel })
    await ponerEvento(c, id, { ...ev, __existe: Boolean(fila.gcal_evento_id) })
    await apuntarOk(tabla, fila, id)
  } else {
    if (fila.gcal_evento_id) await quitarEvento(c, fila.gcal_evento_id)
    await apuntarOk(tabla, fila, null)
  }
}

let enMarcha = null

// Pasa a Google lo pendiente. Nunca lanza: devuelve un resumen.
// todo: también los que ya fallaron muchas veces (cron diario y botón del panel)
export async function sincronizarPendientes({ base = null, limite = 25, tiempoMaxMs = 6000, todo = false } = {}) {
  if (!googleConfigurado()) return { hecho: false, motivo: 'sin_configurar' }
  // Dos peticiones a la vez en la misma instancia: la segunda espera a la primera
  if (enMarcha) await enMarcha.catch(() => {})
  const p = sincronizar({ base, limite, tiempoMaxMs, todo })
  enMarcha = p
  try {
    return await p
  } finally {
    if (enMarcha === p) enMarcha = null
  }
}

async function sincronizar({ base, limite, tiempoMaxMs, todo }) {
  const resumen = { hecho: true, creados: 0, quitados: 0, errores: 0, quedan: 0 }
  try {
    const c = await leerConexion()
    if (!c || c.estado !== 'ok') return { hecho: false, motivo: c ? 'revocado' : 'sin_conectar' }
    const empezo = Date.now()
    const queda = () => Date.now() - empezo < tiempoMaxMs
    const s = await semilla()
    const urlPanel = urlDelPanel(base)
    const filtroIntentos = todo ? '' : `AND gcal_intentos < ${INTENTOS_SOLOS}`

    // 1. Eventos de filas borradas o de un calendario anterior
    const { rows: borrar } = await query(`SELECT * FROM gcal_borrar ${todo ? '' : `WHERE intentos < ${INTENTOS_SOLOS}`} ORDER BY id LIMIT $1`, [limite])
    for (const b of borrar) {
      if (!queda()) break
      try {
        await quitarEvento(c, b.evento_id || idEvento(s, b.tipo, b.ref), b.calendario)
        await query('DELETE FROM gcal_borrar WHERE id = $1', [b.id])
        resumen.quitados++
      } catch (e) {
        if (e.codigo === 'revocado') throw e
        await query('UPDATE gcal_borrar SET intentos = intentos + 1 WHERE id = $1', [b.id])
        resumen.errores++
      }
    }

    // 2. Reservas y bloqueos
    for (const tabla of ['reservas', 'bloqueos']) {
      const select = tabla === 'reservas'
        ? `SELECT r.*, s.plan AS plan_suscripcion FROM reservas r LEFT JOIN suscripciones s ON s.id = r.suscripcion_id
            WHERE (r.gcal_estado = 'pendiente' OR (r.gcal_estado = 'error' ${filtroIntentos.replace('gcal_', 'r.gcal_')}))`
        : `SELECT * FROM bloqueos WHERE (gcal_estado = 'pendiente' OR (gcal_estado = 'error' ${filtroIntentos}))`
      const { rows } = await query(`${select} ORDER BY ${tabla === 'reservas' ? 'r.inicio' : 'inicio'} LIMIT $1`, [limite])
      for (const fila of rows) {
        if (!queda()) {
          resumen.quedan++
          continue
        }
        const tenia = Boolean(fila.gcal_evento_id)
        const debe = debeTenerEvento(fila, tabla)
        try {
          await sincronizarFila(c, tabla, fila, s, urlPanel)
          if (debe) resumen.creados++
          else if (tenia) resumen.quitados++
        } catch (e) {
          if (e.codigo === 'revocado') throw e
          await apuntarError(tabla, fila, e)
          resumen.errores++
        }
      }
    }
    return resumen
  } catch (e) {
    console.error('[google] no se pudo sincronizar:', e.message)
    return { ...resumen, hecho: false, motivo: e.codigo === 'revocado' ? 'revocado' : 'error', mensaje: e.message }
  }
}

// Después de un cambio (pago, panel): rápido y sin romper nunca la respuesta
export async function sincronizarTrasCambio(base) {
  if (!googleConfigurado()) return null
  try {
    return await sincronizarPendientes({ base, limite: 10, tiempoMaxMs: 4000 })
  } catch (e) {
    console.error('[google] fallo al sincronizar tras un cambio:', e.message)
    return null
  }
}
