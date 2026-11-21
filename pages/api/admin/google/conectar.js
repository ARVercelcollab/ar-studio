// Empieza la conexión con Google Calendar: lleva a la página de Google para dar permiso
import crypto from 'node:crypto'
import { esAdmin } from '../../../../lib/admin/auth.js'
import { googleConfigurado, urlAutorizacion } from '../../../../lib/google/calendario.js'
import { sinCache } from '../../../../lib/http.js'
import { urlVuelta, cookieEstado } from '../../../../lib/google/rutas.js'

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await esAdmin(req))) return res.redirect(302, `/admin/login?volver=${encodeURIComponent('/admin/ajustes/google')}`)
  if (!googleConfigurado()) return res.redirect(302, `/admin/ajustes/google?error=${encodeURIComponent('Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel.')}`)
  const estado = crypto.randomBytes(24).toString('base64url')
  res.setHeader('Set-Cookie', cookieEstado(estado, 600))
  res.redirect(302, urlAutorizacion({ redirectUri: urlVuelta(req), estado }))
}
