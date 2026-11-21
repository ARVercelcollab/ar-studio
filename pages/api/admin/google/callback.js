// Vuelta de Google después de dar (o no) permiso
import { esAdmin } from '../../../../lib/admin/auth.js'
import { completarConexion, sincronizarPendientes } from '../../../../lib/google/calendario.js'
import { sinCache, urlBase } from '../../../../lib/http.js'
import { urlVuelta, cookieEstado, mismoEstado, COOKIE_ESTADO } from '../../../../lib/google/rutas.js'

const volver = (res, error) =>
  res.redirect(302, error ? `/admin/ajustes/google?error=${encodeURIComponent(String(error).slice(0, 200))}` : '/admin/ajustes/google?conectado=1')

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await esAdmin(req))) return res.redirect(302, `/admin/login?volver=${encodeURIComponent('/admin/ajustes/google')}`)
  const estadoGuardado = req.cookies?.[COOKIE_ESTADO]
  res.setHeader('Set-Cookie', cookieEstado('', 0))
  if (!mismoEstado(String(req.query.state || ''), estadoGuardado)) return volver(res, 'La conexión ha caducado o no viene de este panel. Vuelve a pulsar «Conectar».')
  if (req.query.error) return volver(res, req.query.error === 'access_denied' ? 'No se dio permiso en Google.' : `Google dice: ${req.query.error}`)
  if (!req.query.code) return volver(res, 'Google no ha devuelto el código.')
  try {
    await completarConexion({ codigo: String(req.query.code), redirectUri: urlVuelta(req) })
  } catch (e) {
    console.error('[google] no se pudo conectar:', e.message)
    return volver(res, e.message)
  }
  // Primera tanda de eventos (el resto, con «Volver a sincronizar» o el cron diario)
  await sincronizarPendientes({ base: urlBase(req), limite: 25, tiempoMaxMs: 3000 })
  volver(res, null)
}
