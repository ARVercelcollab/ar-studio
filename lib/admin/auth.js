// Acceso al panel. Cada persona entra con su correo y su contraseña (tabla personas_panel; las
// cuentas se gestionan en lib/admin/cuentas.js). La sesión es una cookie firmada con
// SESSION_SECRET que dura 7 días y lleva quién es y cuándo entró.
//
// Paso de la contraseña compartida a las cuentas, sin dejar a nadie fuera: mientras NO haya
// ninguna persona activa con contraseña, se entra como antes con ADMIN_PASSWORD (sesión «del
// estudio», id 0, que puede dar acceso). En cuanto la haya, ADMIN_PASSWORD y las sesiones id 0
// dejan de valer.
//
// Cada página y cada ruta comprueban la sesión contra la base de datos: una persona sin acceso o
// con las sesiones cerradas queda fuera al momento, aunque tenga la cookie.

import crypto from 'node:crypto'
import { query } from '../db/index.js'

const COOKIE = 'ar_admin'
const DURACION_S = 7 * 24 * 3600
export const ID_COMPARTIDA = 0

function enVercel() {
  return Boolean(process.env.VERCEL)
}

function secreto() {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 32) return s
  if (enVercel()) throw new Error('Falta SESSION_SECRET (32 caracteres o más) para el panel')
  return 'solo-para-desarrollo-local-no-usar-en-produccion'
}

// Para cifrar lo que se guarda en la base de datos (p. ej. la conexión con Google)
export function secretoDeSesion() {
  return secreto()
}

// ---------- Contraseña compartida (solo hasta que haya cuentas) ----------

function contrasenaConfigurada() {
  const p = process.env.ADMIN_PASSWORD
  if (p) return enVercel() && p.length < 12 ? null : p
  if (enVercel()) return null
  return 'estudio' // solo en local
}

// ¿Se puede entrar? Con cuentas basta SESSION_SECRET; sin ellas hace falta ADMIN_PASSWORD
export function panelConfigurado({ cuentas = false } = {}) {
  try {
    secreto()
    return cuentas || Boolean(contrasenaConfigurada())
  } catch {
    return false
  }
}

const resumen = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest()

export function contrasenaCorrecta(intento) {
  const buena = contrasenaConfigurada()
  if (!buena || typeof intento !== 'string') return false
  return crypto.timingSafeEqual(resumen(intento), resumen(buena))
}

// ¿Hay ya alguna persona activa con contraseña? Entonces se entra con correo y contraseña.
export async function hayCuentas() {
  const { rows } = await query('SELECT 1 FROM personas_panel WHERE activa AND clave_hash IS NOT NULL LIMIT 1')
  return rows.length > 0
}

// ---------- Cookie ----------

function firma(valor) {
  return crypto.createHmac('sha256', secreto()).update(`panel:${valor}`).digest('base64url')
}

function cookieTexto(valor, maxAge) {
  const partes = [`${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (enVercel() || process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

// id.emitida(ms).caduca(s).firma
export function valorCookie(personaId = ID_COMPARTIDA, emitidaMs = Date.now()) {
  const v = `${Number(personaId)}.${Math.floor(emitidaMs)}.${Math.floor(emitidaMs / 1000) + DURACION_S}`
  return `${v}.${firma(v)}`
}

// { id, emitidaMs } si la cookie está bien firmada y no ha caducado; null si no
export function leerCookie(valor, ahoraMs = Date.now()) {
  if (!valor || typeof valor !== 'string' || valor.length > 300) return null
  const partes = valor.split('.')
  if (partes.length !== 4) return null
  const [id, emitida, caduca, f] = partes
  if (!/^\d{1,9}$/.test(id) || !/^\d{1,15}$/.test(emitida) || !/^\d{1,12}$/.test(caduca)) return null
  if (Number(caduca) < ahoraMs / 1000) return null
  let buena
  try {
    buena = firma(`${id}.${emitida}.${caduca}`)
  } catch {
    return null
  }
  const a = Buffer.from(buena)
  const b = Buffer.from(f)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return { id: Number(id), emitidaMs: Number(emitida) }
}

// personaId: la persona que entra (0 = la sesión compartida del estudio)
export function abrirSesion(res, personaId = ID_COMPARTIDA, ahora = new Date()) {
  res.setHeader('Set-Cookie', cookieTexto(valorCookie(personaId, ahora.getTime()), DURACION_S))
}

export function cerrarSesion(res) {
  res.setHeader('Set-Cookie', cookieTexto('', 0))
}

// ---------- ¿Quién es? ----------

export function iniciales(nombre = '') {
  const p = String(nombre).trim().split(/\s+/).filter(Boolean)
  if (!p.length) return 'AR'
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

const COMPARTIDA = Object.freeze({ id: ID_COMPARTIDA, nombre: 'Estudio', email: null, puedeDarAcceso: true, compartida: true, iniciales: 'AR' })

// La persona de una cookie (o null si no vale): existe, está activa, tiene contraseña y la cookie
// es posterior a cuando se cerraron sus sesiones. La id 0 solo vale mientras no haya cuentas.
export async function personaDeCookie(valor, { ahoraMs = Date.now() } = {}) {
  const c = leerCookie(valor, ahoraMs)
  if (!c) return null
  if (c.id === ID_COMPARTIDA) return (await hayCuentas()) ? null : COMPARTIDA
  const { rows } = await query(
    'SELECT id, nombre, email, puede_dar_acceso, activa, clave_hash IS NOT NULL AS con_clave, sesiones_desde FROM personas_panel WHERE id = $1',
    [c.id]
  )
  const p = rows[0]
  if (!p || !p.activa || !p.con_clave) return null
  if (p.sesiones_desde && c.emitidaMs < new Date(p.sesiones_desde).getTime()) return null
  return { id: p.id, nombre: p.nombre, email: p.email, puedeDarAcceso: Boolean(p.puede_dar_acceso), compartida: false, iniciales: iniciales(p.nombre) }
}

// { id, nombre, email, puedeDarAcceso, compartida, iniciales } | null. Se guarda en la petición.
export async function personaDeLaPeticion(req) {
  if (req && req._personaPanel !== undefined) return req._personaPanel
  const persona = await personaDeCookie(req?.cookies?.[COOKIE])
  if (req) req._personaPanel = persona
  return persona
}

export async function esAdmin(req) {
  return Boolean(await personaDeLaPeticion(req))
}

// Para getServerSideProps de las páginas del panel
export async function redirigirSiNoAdmin(ctx) {
  if (await esAdmin(ctx.req)) return null
  const destino = encodeURIComponent(ctx.resolvedUrl || '/admin')
  return { redirect: { destination: `/admin/login?volver=${destino}`, permanent: false } }
}
