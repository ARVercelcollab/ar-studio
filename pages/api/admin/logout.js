// Salir del panel: revoca esta sesión en la base de datos y borra la cookie. Solo POST y desde la
// propia web (un enlace de otra página no puede sacarte).
import { cerrarSesion, revocarSesion, cookieDeLaPeticion } from '../../../lib/admin/auth.js'
import { soloMetodos, mismoOrigen, sinCache } from '../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ mensaje: 'Petición no permitida.' })
  try {
    await revocarSesion(cookieDeLaPeticion(req))
  } catch (e) {
    console.error('[panel] no se pudo revocar la sesión al salir', e.message)
  }
  cerrarSesion(res)
  res.redirect(303, '/admin/login')
}
