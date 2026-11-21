// Acceso al panel. Cada persona entra con su correo y su contraseña (tabla personas_panel; las
// cuentas se gestionan en lib/admin/cuentas.js).
//
// Sesiones (tabla sesiones_panel, migración 19): la cookie lleva un código aleatorio y la base de
// datos solo su resumen (sha256), quién es, cuándo caduca (7 días) y si se ha revocado. Cada página
// y cada ruta lo comprueban: salir, cambiar la contraseña, cerrar sesiones o quitar el acceso las
// anulan al momento.
//
// Paso de la contraseña compartida a las cuentas, sin dejar a nadie fuera y sin vuelta atrás:
// mientras nadie haya puesto su contraseña se entra con ADMIN_PASSWORD (sesión con persona NULL,
// que puede dar acceso). La primera vez que alguien pone contraseña se guarda la marca permanente
// «panel_cuentas_activadas» (tabla ajustes): desde ahí ADMIN_PASSWORD y esas sesiones no valen.

import crypto from 'node:crypto'
import { query } from '../db/index.js'

const COOKIE = 'ar_admin'
const DURACION_S = 7 * 24 * 3600
export const MARCA_CUENTAS = 'panel_cuentas_activadas'
const TOKEN = /^[A-Za-z0-9_-]{43}$/
// La última vez que se usó una sesión se apunta como mucho cada 5 minutos
const APUNTAR_USO_MS = 5 * 60 * 1000

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

const resumenHex = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex')

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

// ¿Va ya el panel con cuentas? (marca permanente: una vez activadas no se vuelve atrás)
export async function hayCuentas(q = query) {
  const { rows } = await q('SELECT 1 FROM ajustes WHERE clave = $1', [MARCA_CUENTAS])
  return rows.length > 0
}

// ---------- Sesiones ----------

function cookieTexto(valor, maxAge) {
  const partes = [`${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (enVercel() || process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

// Crea una sesión (dentro de la transacción que se le pase) y devuelve el código para la cookie.
// personaId null = la contraseña compartida.
export async function crearSesion(q, personaId = null, ahora = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url')
  await q(
    `INSERT INTO sesiones_panel (token_hash, persona_id, creada_en, expira_en, ultimo_uso_en)
     VALUES ($1, $2, $3, $3::timestamptz + make_interval(secs => $4), $3)`,
    [resumenHex(token), personaId, ahora, DURACION_S]
  )
  return token
}

export function ponerCookie(res, token) {
  res.setHeader('Set-Cookie', cookieTexto(token, DURACION_S))
}

// Abre una sesión y pone la cookie (personaId null = la contraseña compartida)
export async function abrirSesion(res, personaId = null, ahora = new Date()) {
  const token = await crearSesion(query, personaId, ahora)
  ponerCookie(res, token)
  return token
}

export function cerrarSesion(res) {
  res.setHeader('Set-Cookie', cookieTexto('', 0))
}

// Revoca la sesión de esta cookie (al salir)
export async function revocarSesion(valor, ahora = new Date()) {
  if (!valor || typeof valor !== 'string' || !TOKEN.test(valor)) return
  await query('UPDATE sesiones_panel SET revocada_en = $2 WHERE token_hash = $1 AND revocada_en IS NULL', [resumenHex(valor), ahora])
}

// Revoca todas las sesiones de una persona (o, con null, las de la contraseña compartida)
export async function revocarSesionesDe(q, personaId, ahora = new Date()) {
  if (personaId === null) {
    await q('UPDATE sesiones_panel SET revocada_en = $1 WHERE persona_id IS NULL AND revocada_en IS NULL', [ahora])
  } else {
    await q('UPDATE sesiones_panel SET revocada_en = $2 WHERE persona_id = $1 AND revocada_en IS NULL', [personaId, ahora])
  }
}

// ---------- ¿Quién es? ----------

export function iniciales(nombre = '') {
  const p = String(nombre).trim().split(/\s+/).filter(Boolean)
  if (!p.length) return 'AR'
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

const COMPARTIDA = Object.freeze({ id: 0, nombre: 'Estudio', email: null, puedeDarAcceso: true, compartida: true, iniciales: 'AR' })

// La persona de una cookie (o null si no vale): la sesión existe, no está revocada ni caducada y
// la persona está activa y tiene contraseña. Las de la contraseña compartida solo valen sin cuentas.
export async function personaDeCookie(valor, { ahora = new Date() } = {}) {
  if (!valor || typeof valor !== 'string' || !TOKEN.test(valor)) return null
  const { rows } = await query(
    `SELECT s.id AS sesion_id, s.persona_id, s.ultimo_uso_en, p.nombre, p.email, p.puede_dar_acceso, p.activa,
            p.clave_hash IS NOT NULL AS con_clave
       FROM sesiones_panel s LEFT JOIN personas_panel p ON p.id = s.persona_id
      WHERE s.token_hash = $1 AND s.revocada_en IS NULL AND s.expira_en > $2`,
    [resumenHex(valor), ahora]
  )
  const s = rows[0]
  if (!s) return null
  let persona
  if (s.persona_id === null) {
    if (await hayCuentas()) return null
    persona = COMPARTIDA
  } else {
    if (!s.activa || !s.con_clave) return null
    persona = { id: s.persona_id, nombre: s.nombre, email: s.email, puedeDarAcceso: Boolean(s.puede_dar_acceso), compartida: false, iniciales: iniciales(s.nombre) }
  }
  if (!s.ultimo_uso_en || ahora.getTime() - new Date(s.ultimo_uso_en).getTime() > APUNTAR_USO_MS) {
    await query('UPDATE sesiones_panel SET ultimo_uso_en = $2 WHERE id = $1', [s.sesion_id, ahora]).catch(() => {})
  }
  return persona
}

// { id, nombre, email, puedeDarAcceso, compartida, iniciales } | null. Se guarda en la petición.
export async function personaDeLaPeticion(req) {
  if (req && req._personaPanel !== undefined) return req._personaPanel
  const persona = await personaDeCookie(req?.cookies?.[COOKIE])
  if (req) req._personaPanel = persona
  return persona
}

export function cookieDeLaPeticion(req) {
  return req?.cookies?.[COOKIE] || null
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
