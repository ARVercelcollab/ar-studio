// Envoltorio para las rutas del área de miembros: sesión del miembro, método, mismo origen
// y, después de un cambio, Google Calendar al día antes de contestar (como el panel).
import { miembroDeLaPeticion, suscripcionVisible } from './acceso.js'
import { soloMetodos, mismoOrigen, responderError, sinCache, urlBase, reservasAbiertas } from '../http.js'
import { googleConfigurado, sincronizarTrasCambio } from '../google/calendario.js'

// El área se abre a la vez que las reservas propias (NEXT_PUBLIC_RESERVAS_PROPIAS)
export function areaAbierta() {
  return reservasAbiertas()
}

export const CERRADA = { error: 'cerrado', mensaje: 'El área de miembros aún no está abierta. Escríbenos por WhatsApp.' }

// fn(req, res, { email, sus }): sus es la suscripción que ve (ver suscripcionVisible)
export function rutaMiembro(fn, { metodos = ['POST'], calendario = true } = {}) {
  return async (req, res) => {
    sinCache(res)
    if (!soloMetodos(req, res, metodos)) return
    if (!areaAbierta()) return res.status(503).json(CERRADA)
    const m = miembroDeLaPeticion(req)
    if (!m) return res.status(401).json({ error: 'sesion', mensaje: 'Vuelve a entrar en tu área.' })
    if (req.method !== 'GET' && !mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
    const sincronizar = calendario && req.method !== 'GET' && googleConfigurado()
    const terminar = res.end
    let final = null
    if (sincronizar) {
      res.end = (...args) => {
        final = args
        return res
      }
    }
    try {
      const sus = await suscripcionVisible(m.email)
      if (!sus) {
        res.status(401).json({ error: 'sesion', mensaje: 'Vuelve a entrar en tu área.' })
      } else {
        await fn(req, res, { email: m.email, sus })
      }
    } catch (e) {
      responderError(res, e)
    } finally {
      if (sincronizar) {
        res.end = terminar
        await sincronizarTrasCambio(urlBase(req))
        if (final) terminar.apply(res, final)
      }
    }
  }
}
