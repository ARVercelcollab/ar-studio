// Cierra la sesión del área de miembros
import { cerrarSesionMiembro } from '../../../lib/miembros/acceso.js'
import { soloMetodos, mismoOrigen, sinCache } from '../../../lib/http.js'

export default function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  cerrarSesionMiembro(res)
  return res.status(200).json({ ok: true })
}
