// Guarda la contraseña con el enlace (invitación o recuperar), lo gasta, cierra todas las demás
// sesiones de esa persona y abre una nueva en este navegador (todo en la misma transacción).
import { guardarClaveConEnlace } from '../../../../lib/admin/cuentas.js'
import { ponerCookie } from '../../../../lib/admin/auth.js'
import { soloMetodos, mismoOrigen, sinCache, limitar, responderError } from '../../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  try {
    if (!(await limitar(req, res, 'panel_clave_guardar', 10, 60, 'Demasiados intentos. Espera un rato.'))) return
    const { token } = await guardarClaveConEnlace(req.body?.token, req.body?.clave, req.body?.repetida)
    ponerCookie(res, token)
    return res.status(200).json({ ok: true })
  } catch (e) {
    return responderError(res, e)
  }
}
