import { contrasenaCorrecta, abrirSesion, panelConfigurado } from '../../../lib/admin/auth.js'
import { soloMetodos, mismoOrigen, limitar, sinCache } from '../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ mensaje: 'Petición no permitida.' })
  if (!panelConfigurado()) return res.status(503).json({ mensaje: 'Falta configurar ADMIN_PASSWORD y SESSION_SECRET.' })
  // Cuenta todos los intentos (también los buenos): 8 cada 15 minutos por persona y 50 en total
  if (!(await limitar(req, res, 'login', 8, 15, 'Demasiados intentos. Espera 15 minutos.'))) return
  const { dentroDelLimite } = await import('../../../lib/db/index.js')
  if (!(await dentroDelLimite('login:todos', 50, 15))) return res.status(429).json({ mensaje: 'Demasiados intentos. Espera 15 minutos.' })
  if (!contrasenaCorrecta(req.body?.contrasena)) return res.status(401).json({ mensaje: 'Contraseña incorrecta.' })
  abrirSesion(res)
  res.status(200).json({ ok: true })
}
