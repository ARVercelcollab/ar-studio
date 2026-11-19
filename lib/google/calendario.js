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
import { query, servidorDeLaBase, esCopiaDeProduccion } from '../db/index.js'
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
const CLAVE_BASE = 'google_base' // servidor de la base en la que se conectó Google
const CLAVE_ULTIMA = 'google_ultima' // cuenta y calendario de la última conexión (al desconectar)
const ESPERA_MS = 4000 // tiempo máximo de cada llamada a Google
const TRAS_CAMBIO_MS = 3000 // tiempo total que una respuesta del panel o del pago espera a Google
const TOMA_S = 60 // una fila «tomada» por un proceso se libera sola pasado este tiempo
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

// Las vistas previas usan una copia de la base de producción (rama de Neon): con ella llegan
// la conexión con Google, la semilla de los ids y los ids de los eventos de producción. Si se
// usaran, la vista previa escribiría en el calendario real (o, al desconectar, cortaría el
// acceso de producción). Por eso, la primera vez que se usa una base que no es en la que se
// conectó Google, se olvida todo lo de Google SOLO en esta base: nunca se llama a Google.
async function asegurarBasePropia() {
  const servidor = servidorDeLaBase()
  const guardado = await leerAjuste(CLAVE_BASE)
  if (guardado === servidor) return
  if (guardado || (await esCopiaDeProduccion())) {
    await query('DELETE FROM ajustes WHERE clave = ANY($1)', [[CLAVE_CONEXION, CLAVE_ULTIMA, CLAVE_SEMILLA]])
    await query('DELETE FROM gcal_borrar')
    for (const tabla of ['reservas', 'bloqueos']) {
      await query(`UPDATE ${tabla} SET gcal_evento_id = NULL, gcal_estado = 'pendiente', gcal_intentos = 0, gcal_error = NULL,
                     gcal_tomado_por = NULL, gcal_tomado_en = NULL
                    WHERE gcal_evento_id IS NOT NULL OR gcal_estado <> 'pendiente'`)
    }
    acceso = null
  }
  await guardarAjuste(CLAVE_BASE, servidor)
}

// { cuenta, calendarioId, calendarioNombre, estado: 'ok' | 'revocado', conectadoEn, token (cifrado),
//   base (servidor de la base), entorno (VERCEL_ENV) }
export async function leerConexion() {
  await asegurarBasePropia()
  const v = await leerAjuste(CLAVE_CONEXION)
  if (!v) return null
  let c
  try {
    c = JSON.parse(v)
  } catch {
    return null
  }
  // Conexión hecha en otra base (no debería llegar aquí, pero por si acaso): como si no hubiera
  if (c.base && c.base !== servidorDeLaBase()) return null
  return c
}

const entornoActual = () => process.env.VERCEL_ENV || 'local'

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
  await asegurarBasePropia()
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

async function pedirToken(campos, plazo = null) {
  let res
  const signal = senalDelPlazo(plazo)
  try {
    res = await globalThis.fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...campos }),
      signal,
    })
  } catch (e) {
    throw new ErrorGoogle(`No se pudo hablar con Google (${e.name === 'TimeoutError' ? 'tarda demasiado' : e.message}).`, { codigo: e.name === 'TimeoutError' ? 'espera' : null })
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
  // La conexión de ahora o, si se desconectó, la última (cuenta y calendario)
  const anterior = (await leerConexion()) || (await leerUltima())
  const cuenta = emailDelIdToken(t.id_token)
  const mismaCuenta = Boolean(anterior && anterior.cuenta && anterior.cuenta === cuenta)
  const conexion = {
    cuenta,
    calendarioId: mismaCuenta ? anterior.calendarioId : 'primary',
    calendarioNombre: mismaCuenta ? anterior.calendarioNombre : cuenta || 'Calendario principal',
    estado: 'ok',
    conectadoEn: new Date().toISOString(),
    token: cifrar(t.refresh_token),
    base: servidorDeLaBase(),
    entorno: entornoActual(),
  }
  // Misma cuenta: se sigue en el mismo calendario y se ponen al día los eventos que ya había
  // (incluidos los de reservas canceladas mientras estaba desconectado). Otra cuenta: los
  // eventos de la anterior se quedan allí (no hay permiso para quitarlos) y se crean en esta;
  // a los cambios en la cola de borrado de la otra cuenta ya no se puede llegar.
  if (anterior && !mismaCuenta) await query('DELETE FROM gcal_borrar')
  await guardarConexion(conexion)
  guardarAccesoEnMemoria(t.access_token, t.expires_in, t.refresh_token)
  await marcarTodoPendiente()
  return { cuenta }
}

async function leerUltima() {
  const v = await leerAjuste(CLAVE_ULTIMA)
  try {
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}

export async function desconectar() {
  const c = await leerConexion() // en una copia de otra base no hay conexión: nunca se revoca la de la otra
  if (c?.token) {
    let refresco = null
    try {
      refresco = descifrar(c.token)
    } catch {
      // No se puede leer (SESSION_SECRET distinto): no se revoca nada en Google
    }
    if (refresco) {
      try {
        await globalThis.fetch(`${REVOCAR}?token=${encodeURIComponent(refresco)}`, { method: 'POST', signal: AbortSignal.timeout(ESPERA_MS) })
      } catch {
        // Si Google no contesta, se borra igual de aquí
      }
    }
  }
  // Se recuerda la cuenta y el calendario: si se vuelve a conectar la misma cuenta, se sigue
  // en ese calendario y los eventos que ya había se ponen al día (sin duplicarlos en otro)
  if (c) await guardarAjuste(CLAVE_ULTIMA, JSON.stringify({ cuenta: c.cuenta, calendarioId: c.calendarioId, calendarioNombre: c.calendarioNombre }))
  await query('DELETE FROM ajustes WHERE clave = $1', [CLAVE_CONEXION])
  acceso = null
}

// El token de acceso dura una hora: se guarda en memoria y se renueva con el refresh token.
// Va ligado (por su huella) al refresh token del que salió: si se conecta otra cuenta, el de
// la anterior ya no se usa aunque esta instancia siga viva.
let acceso = null
const huella = (refresco) => crypto.createHash('sha256').update(String(refresco)).digest('hex')
function guardarAccesoEnMemoria(token, segundos, refresco) {
  if (token && refresco) acceso = { token, caduca: Date.now() + (Number(segundos) || 3000) * 1000 - 60000, de: huella(refresco) }
}

// Solo para pruebas
export function _olvidarAcceso() {
  acceso = null
}

async function revocadaAqui(conexion, mensaje) {
  await guardarConexion({ ...conexion, estado: 'revocado' })
  acceso = null
  return new ErrorGoogle(mensaje, { codigo: 'revocado' })
}

async function tokenDeAcceso(conexion, plazo) {
  let refresco
  try {
    refresco = descifrar(conexion.token)
  } catch {
    // Cifrado con otro SESSION_SECRET: no sirve; hay que volver a conectar (sin revocar nada)
    throw await revocadaAqui(conexion, 'La conexión guardada con Google no se puede leer (cambió la clave de la web). Vuelve a conectar Google Calendar desde el panel.')
  }
  if (acceso && acceso.caduca > Date.now() && acceso.de === huella(refresco)) return acceso.token
  let t
  try {
    t = await pedirToken({ refresh_token: refresco, grant_type: 'refresh_token' }, plazo)
  } catch (e) {
    // invalid_grant: se quitó el permiso desde Google o caducó (app en modo «pruebas»)
    if (e.codigo === 'invalid_grant') throw await revocadaAqui(conexion, 'Google ha cortado la conexión. Vuelve a conectar Google Calendar desde el panel.')
    throw e
  }
  guardarAccesoEnMemoria(t.access_token, t.expires_in, refresco)
  return acceso.token
}

// Plazo total compartido por toda una sincronización: cada llamada a Google espera como mucho
// lo que quede (y nunca más de ESPERA_MS). Sin tiempo, no se llama.
function senalDelPlazo(plazo) {
  const queda = plazo ? plazo - Date.now() : ESPERA_MS
  if (queda <= 50) throw new ErrorGoogle('No queda tiempo: se hará en la siguiente pasada.', { codigo: 'tiempo' })
  return AbortSignal.timeout(Math.min(ESPERA_MS, queda))
}

async function llamar(conexion, metodo, ruta, cuerpo, plazo = null) {
  const token = await tokenDeAcceso(conexion, plazo)
  let res
  const signal = senalDelPlazo(plazo)
  try {
    res = await globalThis.fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal,
    })
  } catch (e) {
    throw new ErrorGoogle(`No se pudo hablar con Google (${e.name === 'TimeoutError' ? 'tarda demasiado' : e.message}).`, { codigo: e.name === 'TimeoutError' ? 'espera' : null })
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
    // Lo que estaba en la cola para borrar del calendario al que se vuelve ya no se borra:
    // esos eventos se van a reescribir ahí
    await query(`DELETE FROM gcal_borrar WHERE calendario = $1`, [nuevoId])
    // Se quitan del anterior y se vuelven a crear en el nuevo con el mismo id (TODOS los que
    // tenían evento, también los antiguos; ver ponerEvento: PUT y, si no existe, POST)
    await query(
      `INSERT INTO gcal_borrar (evento_id, calendario)
       SELECT gcal_evento_id, $1 FROM reservas WHERE gcal_evento_id IS NOT NULL
       UNION ALL SELECT gcal_evento_id, $1 FROM bloqueos WHERE gcal_evento_id IS NOT NULL`,
      [c.calendarioId]
    )
    await guardarConexion({ ...c, calendarioId: nuevoId, calendarioNombre: elegido.nombre })
    await marcarTodoPendiente()
    return elegido
  }
  await guardarConexion({ ...c, calendarioId: nuevoId, calendarioNombre: elegido.nombre })
  return elegido
}

// Al conectar (o cambiar de calendario) se repasan las que ya tenían evento (aunque sean
// antiguas) y las de la última semana en adelante
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
  // Sin el NIF: el calendario puede estar compartido (el NIF está en el panel)
  const factura = r.factura && r.factura.nif ? `con sus datos (${texto(r.factura.nombre)})` : 'simplificada (sin datos)'
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
    visibility: 'private',
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
    visibility: 'private',
    extendedProperties: { private: { arstudio: 'bloqueo', arstudioRef: String(b.id) } },
  }
}

const enc = encodeURIComponent

// Crea o actualiza el evento con id fijo: si ya existe (409), se reescribe entero
async function ponerEvento(c, id, evento, plazo) {
  const cal = enc(c.calendarioId)
  if (evento.__existe) {
    const r = await llamar(c, 'PUT', `/calendars/${cal}/events/${enc(id)}`, { ...evento, __existe: undefined }, plazo)
    if (r.estado === 200) return
    if (r.estado !== 404 && r.estado !== 410) throw errorDeRespuesta(r, 'cambiar el evento')
  }
  const r = await llamar(c, 'POST', `/calendars/${cal}/events`, { id, ...evento, __existe: undefined }, plazo)
  if (r.estado === 200) return
  if (r.estado === 409) {
    const u = await llamar(c, 'PUT', `/calendars/${cal}/events/${enc(id)}`, { ...evento, __existe: undefined }, plazo)
    if (u.estado === 200) return
    throw errorDeRespuesta(u, 'cambiar el evento')
  }
  throw errorDeRespuesta(r, 'crear el evento')
}

async function quitarEvento(c, id, calendario = null, plazo = null) {
  const r = await llamar(c, 'DELETE', `/calendars/${enc(calendario || c.calendarioId)}/events/${enc(id)}`, null, plazo)
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

async function sincronizarFila(c, tabla, fila, s, urlPanel, plazo) {
  const tipo = tabla === 'bloqueos' ? 'bloqueo' : 'reserva'
  if (debeTenerEvento(fila, tabla)) {
    const id = fila.gcal_evento_id || idEvento(s, tipo, fila.id)
    const ev = tipo === 'bloqueo' ? eventoDeBloqueo(fila, { urlPanel }) : eventoDeReserva(fila, { urlPanel })
    // El id se apunta ANTES de crear el evento: si Google lo crea pero la respuesta no llega
    // (o la reserva se cancela mientras tanto), la próxima pasada sabe qué evento quitar
    if (!fila.gcal_evento_id) await query(`UPDATE ${tabla} SET gcal_evento_id = $2 WHERE id = $1 AND gcal_evento_id IS NULL`, [fila.id, id])
    await ponerEvento(c, id, { ...ev, __existe: Boolean(fila.gcal_evento_id) }, plazo)
    await apuntarOk(tabla, fila, id)
  } else {
    if (fila.gcal_evento_id) await quitarEvento(c, fila.gcal_evento_id, null, plazo)
    await apuntarOk(tabla, fila, null)
  }
}

// Una fila la pasa a Google un solo proceso a la vez (otra petición, otra instancia o el
// cron se la saltan). Devuelve la fila recién leída o null si la tiene otro.
async function tomarFila(tabla, id, quien) {
  const { rows } = await query(
    `UPDATE ${tabla} SET gcal_tomado_por = $2, gcal_tomado_en = now()
      WHERE id = $1 AND (gcal_tomado_en IS NULL OR gcal_tomado_en < now() - make_interval(secs => $3) OR gcal_tomado_por = $2)
      RETURNING id`,
    [id, quien, TOMA_S]
  )
  if (!rows[0]) return null
  const leer = tabla === 'reservas'
    ? `SELECT r.*, s.plan AS plan_suscripcion FROM reservas r LEFT JOIN suscripciones s ON s.id = r.suscripcion_id WHERE r.id = $1`
    : `SELECT * FROM bloqueos WHERE id = $1`
  return (await query(leer, [id])).rows[0] || null
}

async function soltarFila(tabla, id, quien) {
  await query(`UPDATE ${tabla} SET gcal_tomado_por = NULL, gcal_tomado_en = NULL WHERE id = $1 AND gcal_tomado_por = $2`, [id, quien])
}

// Pasa a Google lo pendiente. Nunca lanza: devuelve un resumen.
// tiempoMaxMs: tiempo TOTAL (todas las llamadas a Google juntas) que puede tardar.
// todo: también los que ya fallaron muchas veces (cron diario y botón del panel)
// Ya no se espera a otra sincronización de la misma instancia: cada fila la toma un solo
// proceso (tomarFila), así que dos a la vez no se pisan.
export async function sincronizarPendientes({ base = null, limite = 25, tiempoMaxMs = 6000, todo = false } = {}) {
  if (!googleConfigurado()) return { hecho: false, motivo: 'sin_configurar' }
  return sincronizar({ base, limite, tiempoMaxMs, todo })
}

async function sincronizar({ base, limite, tiempoMaxMs, todo }) {
  const resumen = { hecho: true, creados: 0, quitados: 0, errores: 0, quedan: 0 }
  const plazo = Date.now() + tiempoMaxMs
  const queda = () => plazo - Date.now() > 50
  const quien = crypto.randomBytes(8).toString('hex')
  try {
    const c = await leerConexion()
    if (!c || c.estado !== 'ok') return { hecho: false, motivo: c ? 'revocado' : 'sin_conectar' }
    const s = await semilla()
    const urlPanel = urlDelPanel(base)
    const filtroIntentos = todo ? '' : `AND gcal_intentos < ${INTENTOS_SOLOS}`

    // 1. Eventos de filas borradas o de un calendario anterior (por tandas, sin repetir)
    const vistosBorrar = [0]
    while (queda()) {
      const { rows: borrar } = await query(
        `SELECT * FROM gcal_borrar WHERE NOT (id = ANY($2::int[])) ${todo ? '' : `AND intentos < ${INTENTOS_SOLOS}`} ORDER BY id LIMIT $1`,
        [limite, vistosBorrar]
      )
      if (!borrar.length) break
      for (const b of borrar) {
        vistosBorrar.push(b.id)
        if (!queda()) break
        try {
          const id = b.evento_id || idEvento(s, b.tipo, b.ref)
          const calendario = b.calendario || c.calendarioId
          // Si una fila que está bien en el calendario de ahora usa ese evento, no se toca
          const enUso = calendario === c.calendarioId && (await query(
            `SELECT 1 FROM reservas WHERE gcal_evento_id = $1 UNION ALL SELECT 1 FROM bloqueos WHERE gcal_evento_id = $1 LIMIT 1`, [id]
          )).rows.length > 0
          if (!enUso) await quitarEvento(c, id, calendario, plazo)
          await query('DELETE FROM gcal_borrar WHERE id = $1', [b.id])
          if (!enUso) resumen.quitados++
        } catch (e) {
          if (e.codigo === 'revocado') throw e
          if (e.codigo === 'tiempo') break
          await query('UPDATE gcal_borrar SET intentos = intentos + 1 WHERE id = $1', [b.id])
          resumen.errores++
        }
      }
      if (borrar.length < limite) break
    }

    // 2. Reservas y bloqueos: primero lo pendiente, luego lo que falló; cada fila una sola
    //    vez por pasada (las que fallan siempre no tapan a las nuevas)
    for (const tabla of ['reservas', 'bloqueos']) {
      const p = tabla === 'reservas' ? 'r.' : ''
      const vistos = [0]
      while (queda()) {
        const { rows } = await query(
          `SELECT ${p}id FROM ${tabla} ${tabla === 'reservas' ? 'r' : ''}
            WHERE (${p}gcal_estado = 'pendiente' OR (${p}gcal_estado = 'error' ${filtroIntentos.replace('gcal_', `${p}gcal_`)}))
              AND NOT (${p}id = ANY($2::int[]))
            ORDER BY (${p}gcal_estado = 'error'), ${p}inicio LIMIT $1`,
          [limite, vistos]
        )
        if (!rows.length) break
        for (const { id } of rows) {
          vistos.push(id)
          if (!queda()) break
          const fila = await tomarFila(tabla, id, quien)
          if (!fila) continue // la está pasando otro proceso
          const tenia = Boolean(fila.gcal_evento_id)
          const debe = debeTenerEvento(fila, tabla)
          try {
            await sincronizarFila(c, tabla, fila, s, urlPanel, plazo)
            if (debe) resumen.creados++
            else if (tenia) resumen.quitados++
          } catch (e) {
            if (e.codigo === 'revocado') throw e
            // Sin tiempo (o Google tardó más que el plazo): no cuenta como fallo, queda pendiente
            if (e.codigo !== 'tiempo' && !(e.codigo === 'espera' && !queda())) {
              await apuntarError(tabla, fila, e)
              resumen.errores++
            }
          } finally {
            await soltarFila(tabla, id, quien)
          }
        }
        if (rows.length < limite) break
      }
    }
    if (!queda()) resumen.quedan = await contarPendientes(todo)
    return resumen
  } catch (e) {
    console.error('[google] no se pudo sincronizar:', e.message)
    return { ...resumen, hecho: false, motivo: e.codigo === 'revocado' ? 'revocado' : 'error', mensaje: e.message }
  }
}

async function contarPendientes(todo) {
  const f = (t) => `(gcal_estado = 'pendiente' OR (gcal_estado = 'error' ${todo ? '' : `AND gcal_intentos < ${INTENTOS_SOLOS}`}))`
  const { rows } = await query(
    `SELECT (SELECT count(*)::int FROM reservas WHERE ${f()}) + (SELECT count(*)::int FROM bloqueos WHERE ${f()})
          + (SELECT count(*)::int FROM gcal_borrar ${todo ? '' : `WHERE intentos < ${INTENTOS_SOLOS}`}) AS n`
  )
  return rows[0].n
}

// Después de un cambio (pago, panel): como mucho unos 3 s en total y sin romper nunca la
// respuesta. Lo que no dé tiempo se queda pendiente para la próxima pasada o el cron.
export async function sincronizarTrasCambio(base) {
  if (!googleConfigurado()) return null
  try {
    return await sincronizarPendientes({ base, limite: 10, tiempoMaxMs: TRAS_CAMBIO_MS })
  } catch (e) {
    console.error('[google] fallo al sincronizar tras un cambio:', e.message)
    return null
  }
}
