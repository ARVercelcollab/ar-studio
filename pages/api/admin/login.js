import { contrasenaCorrecta, abrirSesion, panelConfigurado } from '../../../lib/admin/auth.js'
import { vecesEnLimite, apuntarEnLimite } from '../../../lib/db/index.js'
import { soloMetodos, mismoOrigen, huellaDe, sinCache } from '../../../lib/http.js'

// Solo cuentan los intentos fallidos, por conexión: 8 cada 15 minutos.
// No hay tope global para que nadie pueda dejar al estudio fuera del panel; por eso
// ADMIN_PASSWORD tiene que ser larga (en producción se exigen 12 caracteres o más).
export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ mensaje: 'Petición no permitida.' })
  if (!panelConfigurado()) return res.status(503).json({ mensaje: 'Falta configurar ADMIN_PASSWORD (12 caracteres o más) y SESSION_SECRET.' })
  const clave = `login_fallido:${huellaDe(req)}`
  if ((await vecesEnLimite(clave, 15)) >= 8) return res.status(429).json({ mensaje: 'Demasiados intentos fallidos. Espera 15 minutos.' })
  if (!contrasenaCorrecta(req.body?.contrasena)) {
    await apuntarEnLimite(clave)
    return res.status(401).json({ mensaje: 'Contraseña incorrecta.' })
  }
  abrirSesion(res)
  res.status(200).json({ ok: true })
}
