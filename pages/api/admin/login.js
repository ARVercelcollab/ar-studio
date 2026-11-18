import { contrasenaCorrecta, abrirSesion, panelConfigurado } from '../../../lib/admin/auth.js'
import { checkRateLimit } from '../../../lib/rateLimit.js'
import { soloMetodos, mismoOrigen, ipDe, sinCache } from '../../../lib/http.js'

export default function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ mensaje: 'Petición no permitida.' })
  if (!panelConfigurado()) return res.status(503).json({ mensaje: 'Falta configurar ADMIN_PASSWORD y SESSION_SECRET.' })
  if (!checkRateLimit(`login:${ipDe(req)}`, 8, 15 * 60000).success) {
    return res.status(429).json({ mensaje: 'Demasiados intentos. Espera 15 minutos.' })
  }
  if (!contrasenaCorrecta(req.body?.contrasena)) return res.status(401).json({ mensaje: 'Contraseña incorrecta.' })
  abrirSesion(res)
  res.status(200).json({ ok: true })
}
