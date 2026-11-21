// Lo que dice un enlace de contraseña (invitación o recuperar), sin gastarlo: para el título de
// la página /admin/clave.
import { verEnlace, MENSAJE_ENLACE_MALO } from '../../../../lib/admin/cuentas.js'
import { soloMetodos, mismoOrigen, sinCache, limitar, responderError } from '../../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  try {
    if (!(await limitar(req, res, 'panel_clave_ver', 30, 60, 'Demasiados intentos. Espera un rato.'))) return
    const e = await verEnlace(req.body?.token)
    if (!e) return res.status(400).json({ error: 'enlace', mensaje: MENSAJE_ENLACE_MALO })
    return res.status(200).json({ tipo: e.tipo, nombre: e.nombre.split(' ')[0], email: e.email })
  } catch (e) {
    return responderError(res, e)
  }
}
