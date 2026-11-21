// Entrar en el panel. Con cuentas: correo y contraseña de cada persona. Sin cuentas todavía: la
// contraseña compartida (ADMIN_PASSWORD), como hasta ahora (ver lib/admin/auth.js).
// Solo cuentan los intentos fallidos: 8 cada 15 minutos por conexión y 5 por correo. No hay tope
// global para que nadie pueda dejar al estudio fuera del panel.
import { contrasenaCorrecta, abrirSesion, panelConfigurado, hayCuentas } from '../../../lib/admin/auth.js'
import { comprobarEntrada, normalizarEmail, MENSAJE_ENTRADA_MALA } from '../../../lib/admin/cuentas.js'
import { vecesEnLimite, apuntarEnLimite } from '../../../lib/db/index.js'
import { soloMetodos, mismoOrigen, huellaDe, sinCache, responderError } from '../../../lib/http.js'

const DEMASIADOS = 'Demasiados intentos fallidos. Espera 15 minutos.'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ mensaje: 'Petición no permitida.' })
  try {
    const cuentas = await hayCuentas()
    if (!panelConfigurado({ cuentas })) return res.status(503).json({ mensaje: 'Falta configurar ADMIN_PASSWORD (12 caracteres o más) y SESSION_SECRET.' })
    const porConexion = `login_fallido:${huellaDe(req)}`
    if ((await vecesEnLimite(porConexion, 15)) >= 8) return res.status(429).json({ mensaje: DEMASIADOS })

    if (!cuentas) {
      if (!contrasenaCorrecta(req.body?.contrasena)) {
        await apuntarEnLimite(porConexion)
        return res.status(401).json({ mensaje: 'Contraseña incorrecta.' })
      }
      abrirSesion(res)
      return res.status(200).json({ ok: true })
    }

    const email = normalizarEmail(req.body?.email)
    const porCorreo = `login_fallido_correo:${email}`
    if (email && (await vecesEnLimite(porCorreo, 15)) >= 5) return res.status(429).json({ mensaje: DEMASIADOS })
    const ahora = new Date()
    const persona = await comprobarEntrada(email, req.body?.contrasena, { ahora })
    if (!persona) {
      await apuntarEnLimite(porConexion)
      if (email) await apuntarEnLimite(porCorreo)
      return res.status(401).json({ mensaje: MENSAJE_ENTRADA_MALA })
    }
    abrirSesion(res, persona.id, ahora)
    return res.status(200).json({ ok: true })
  } catch (e) {
    return responderError(res, e)
  }
}
