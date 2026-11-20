// Entrada al área de miembros (studioar.es/miembros) sin contraseña: el miembro pone su
// correo y le llega un enlace de un solo uso que caduca a los 30 minutos. Al usarlo queda
// una cookie firmada (30 días) con su correo.
//
// - Del enlace solo se guarda su resumen (sha256): quien lea la base de datos no puede entrar.
// - La cookie se firma con una clave propia, derivada de SESSION_SECRET con otra etiqueta:
//   una cookie del panel no vale aquí ni al revés.
// - A quien pide un enlace se le contesta siempre lo mismo, exista o no su correo.

import crypto from 'node:crypto'
import { query, dentroDelLimite } from '../db/index.js'
import { secretoDeSesion } from '../admin/auth.js'
import { ErrorReserva, registrar } from '../reservas/servicio.js'
import { fechaMadrid, sumarDias } from '../reservas/tiempo.js'
import { estadoDe } from '../suscripciones/reglas.js'
import { suscripcionesDeCorreo } from '../suscripciones/servicio.js'
import { correoEnlaceAcceso } from './correos.js'

export const COOKIE_MIEMBRO = 'ar_miembro'
const DURACION_S = 30 * 24 * 3600
export const MINUTOS_ENLACE = 30
// Una suscripción ya terminada se puede seguir viendo (facturas, contrato) estos días
const DIAS_TRAS_FINALIZAR = 90
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/

export const MENSAJE_ENLACE = 'Si tu correo está dado de alta, te llega un enlace para entrar en unos segundos.'
export const MENSAJE_ENLACE_MALO = 'Este enlace ya no vale. Pide otro desde studioar.es/miembros.'

const enVercel = () => Boolean(process.env.VERCEL)
const resumen = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex')

export function normalizarEmail(e) {
  return String(e || '').trim().toLowerCase().slice(0, 120)
}

// ---------- Cookie ----------

function clave() {
  return crypto.createHmac('sha256', secretoDeSesion()).update('ar-studio:area-de-miembros:v1').digest()
}

function firma(valor) {
  return crypto.createHmac('sha256', clave()).update(valor).digest('base64url')
}

export function valorCookie(email, ahoraMs = Date.now()) {
  const caduca = Math.floor(ahoraMs / 1000) + DURACION_S
  const v = `${Buffer.from(normalizarEmail(email), 'utf8').toString('base64url')}.${caduca}`
  return `${v}.${firma(v)}`
}

// { email } si la cookie es buena y no ha caducado; null si no
export function leerCookie(valor, ahoraMs = Date.now()) {
  if (!valor || typeof valor !== 'string' || valor.length > 600) return null
  const partes = valor.split('.')
  if (partes.length !== 3) return null
  const [e, caduca, f] = partes
  if (!/^\d+$/.test(caduca) || Number(caduca) < ahoraMs / 1000) return null
  let buena
  try {
    buena = firma(`${e}.${caduca}`)
  } catch {
    return null
  }
  const a = Buffer.from(buena)
  const b = Buffer.from(f)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  const email = Buffer.from(e, 'base64url').toString('utf8')
  return EMAIL.test(email) ? { email } : null
}

function cookieTexto(valor, maxAge) {
  const partes = [`${COOKIE_MIEMBRO}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (enVercel() || process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

export function abrirSesionMiembro(res, email) {
  res.setHeader('Set-Cookie', cookieTexto(valorCookie(email), DURACION_S))
}

export function cerrarSesionMiembro(res) {
  res.setHeader('Set-Cookie', cookieTexto('', 0))
}

// Solo mira la cookie (no la base de datos)
export function miembroDeLaPeticion(req) {
  return leerCookie(req?.cookies?.[COOKIE_MIEMBRO])
}

// ---------- Suscripción que ve el miembro ----------

// La más reciente que no ha terminado (activa, por empezar o con la baja avisada); si no
// hay, la última terminada hace 90 días o menos (solo para ver, no reserva). null si nada.
export async function suscripcionVisible(email, { ahora = new Date() } = {}) {
  const hoy = fechaMadrid(ahora)
  const lista = await suscripcionesDeCorreo(normalizarEmail(email))
  const viva = lista.find((s) => estadoDe(s, hoy) !== 'finalizada')
  if (viva) return viva
  return lista.find((s) => s.ultimoDia && s.ultimoDia >= sumarDias(hoy, -DIAS_TRAS_FINALIZAR)) || null
}

// Para getServerSideProps de las páginas del área (menos /miembros, que es la entrada)
export async function redirigirSiNoMiembro(ctx) {
  const m = miembroDeLaPeticion(ctx.req)
  if (m && (await suscripcionVisible(m.email))) return null
  return { redirect: { destination: '/miembros', permanent: false } }
}

// ---------- Enlaces ----------

async function crearEnlace(sus, base, { huella = null } = {}) {
  const token = crypto.randomBytes(32).toString('base64url')
  await query(
    `INSERT INTO accesos_miembros (email, token_hash, expira_en, huella) VALUES ($1, $2, now() + make_interval(mins => $3), $4)`,
    [normalizarEmail(sus.email), resumen(token), MINUTOS_ENLACE, huella]
  )
  if (Math.random() < 0.05) await query(`DELETE FROM accesos_miembros WHERE creado_en < now() - interval '7 days'`).catch(() => {})
  const url = `${base}/miembros/entrar?t=${encodeURIComponent(token)}`
  const r = await correoEnlaceAcceso({ email: sus.email, nombre: sus.nombre }, url, { minutos: MINUTOS_ENLACE })
  if (r?.noEnviado) throw new ErrorReserva('correo', r.motivo || 'No se ha podido enviar el correo.', 503)
  return { url }
}

// El miembro pide el enlace desde /miembros. Devuelve { enviado, motivo, url } para las
// pruebas y el registro: a la persona siempre se le contesta lo mismo.
export async function pedirEnlace(email, base, { huella = null, ahora = new Date() } = {}) {
  const e = normalizarEmail(email)
  if (!EMAIL.test(e)) return { enviado: false, motivo: 'correo' }
  // Como mucho 3 enlaces cada 15 minutos por correo (exista o no, para no dar pistas)
  if (!(await dentroDelLimite(`miembro_correo:${resumen(e).slice(0, 32)}`, 3, 15))) return { enviado: false, motivo: 'limite' }
  const sus = await suscripcionVisible(e, { ahora })
  if (!sus) return { enviado: false, motivo: 'desconocido' }
  const { url } = await crearEnlace(sus, base, { huella })
  // La URL solo la ven las pruebas: la ruta de la API nunca la devuelve
  return { enviado: true, url }
}

// Desde el panel («Enviar acceso»): manda el enlace a su correo y lo apunta
export async function enviarAcceso(susId, base) {
  const { rows } = await query('SELECT id, email FROM suscripciones WHERE id = $1', [Number(susId)])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'Suscripción no encontrada.', 404)
  const sus = await suscripcionVisible(rows[0].email)
  if (!sus || sus.id !== rows[0].id) {
    throw new ErrorReserva('acceso', 'Esta suscripción ya no puede entrar en el área (terminó hace más de 90 días o hay otra más reciente con su correo).', 409)
  }
  await crearEnlace(sus, base)
  await query('UPDATE suscripciones SET acceso_enviado_en = now() WHERE id = $1', [sus.id])
  await registrar(query, null, 'acceso_enviado', { a: sus.email }, { suscripcionId: sus.id, autor: 'panel' })
  return { ok: true, mensaje: `Enlace enviado a ${sus.email}.` }
}

// Usa el enlace (una sola vez). Devuelve { email, suscripcion } o lanza 'enlace'.
export async function entrar(token, { ahora = new Date() } = {}) {
  const t = String(token || '')
  const malo = () => new ErrorReserva('enlace', MENSAJE_ENLACE_MALO, 400)
  if (t.length < 20 || t.length > 200) throw malo()
  const { rows } = await query(
    `UPDATE accesos_miembros SET usado_en = now()
      WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > $2
      RETURNING email`,
    [resumen(t), ahora]
  )
  if (!rows[0]) throw malo()
  const sus = await suscripcionVisible(rows[0].email, { ahora })
  if (!sus) throw malo()
  await query('UPDATE suscripciones SET ultimo_acceso_en = now() WHERE id = $1', [sus.id])
  await registrar(query, null, 'acceso_miembro', null, { suscripcionId: sus.id, autor: 'cliente' }).catch(() => {})
  return { email: normalizarEmail(rows[0].email), suscripcion: sus }
}
