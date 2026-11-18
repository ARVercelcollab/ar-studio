// Acceso al panel del estudio: una contraseña (ADMIN_PASSWORD) y una cookie firmada
// con SESSION_SECRET que dura 12 horas.

import crypto from 'node:crypto'

const COOKIE = 'ar_admin'
const DURACION_S = 12 * 3600

function enVercel() {
  return Boolean(process.env.VERCEL)
}

function secreto() {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 32) return s
  if (enVercel()) throw new Error('Falta SESSION_SECRET (32 caracteres o más) para el panel')
  return 'solo-para-desarrollo-local-no-usar-en-produccion'
}

function contrasenaConfigurada() {
  const p = process.env.ADMIN_PASSWORD
  if (p) return enVercel() && p.length < 12 ? null : p
  if (enVercel()) return null
  return 'estudio' // solo en local
}

export function panelConfigurado() {
  try {
    secreto()
    return Boolean(contrasenaConfigurada())
  } catch {
    return false
  }
}

const hash = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest()

export function contrasenaCorrecta(intento) {
  const buena = contrasenaConfigurada()
  if (!buena || typeof intento !== 'string') return false
  return crypto.timingSafeEqual(hash(intento), hash(buena))
}

function firma(valor) {
  return crypto.createHmac('sha256', secreto()).update(valor).digest('base64url')
}

function cookieTexto(valor, maxAge) {
  const partes = [`${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (enVercel() || process.env.NODE_ENV === 'production') partes.push('Secure')
  return partes.join('; ')
}

export function abrirSesion(res) {
  const caduca = Math.floor(Date.now() / 1000) + DURACION_S
  const valor = `${caduca}.${firma(String(caduca))}`
  res.setHeader('Set-Cookie', cookieTexto(valor, DURACION_S))
}

export function cerrarSesion(res) {
  res.setHeader('Set-Cookie', cookieTexto('', 0))
}

export function esAdmin(req) {
  const valor = req.cookies?.[COOKIE]
  if (!valor) return false
  const [caduca, f] = valor.split('.')
  if (!caduca || !f || Number(caduca) < Date.now() / 1000) return false
  try {
    const a = Buffer.from(firma(caduca))
    const b = Buffer.from(f)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// Para getServerSideProps de las páginas del panel
export function redirigirSiNoAdmin(ctx) {
  if (esAdmin(ctx.req)) return null
  const destino = encodeURIComponent(ctx.resolvedUrl || '/admin')
  return { redirect: { destination: `/admin/login?volver=${destino}`, permanent: false } }
}
