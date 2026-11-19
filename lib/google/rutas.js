// Ayudas de las rutas /api/admin/google (vuelta de Google y cookie de seguridad)
import crypto from 'node:crypto'

export const COOKIE_ESTADO = 'ar_google_estado'

// La dirección de vuelta tiene que ser la de esta misma web (la cookie del panel es de este
// dominio): por eso se saca de la petición y no de SITIO_URL
export function urlVuelta(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1)(:|$)/.test(String(host)) ? 'http' : 'https')
  return `${proto}://${host}/api/admin/google/callback`
}

export function cookieEstado(valor, maxAge) {
  const partes = [`${COOKIE_ESTADO}=${valor}`, 'Path=/api/admin/google', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

export function mismoEstado(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const x = crypto.createHash('sha256').update(a).digest()
  const y = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(x, y)
}
