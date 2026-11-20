// Usa el enlace del correo (lo envía el botón de /miembros/entrar) y deja la sesión abierta
import { entrar, abrirSesionMiembro } from '../../../lib/miembros/acceso.js'
import { areaAbierta, CERRADA } from '../../../lib/miembros/api.js'
import { soloMetodos, mismoOrigen, sinCache, limitar, responderError } from '../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!areaAbierta()) return res.status(503).json(CERRADA)
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  if (!(await limitar(req, res, 'miembro_entrar', 10, 15, 'Demasiados intentos. Espera unos minutos.'))) return
  try {
    const { email } = await entrar(req.body?.token)
    abrirSesionMiembro(res, email)
    return res.status(200).json({ ok: true })
  } catch (e) {
    return responderError(res, e)
  }
}
