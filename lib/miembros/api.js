// Envoltorio para las rutas del área de miembros: sesión del miembro, método, mismo origen
// y, después de un cambio, Google Calendar al día antes de contestar (como el panel).
import { cookieDeLaPeticion, sesionDelMiembro } from './acceso.js'
import { soloMetodos, mismoOrigen, responderError, sinCache, urlBase, reservasAbiertas } from '../http.js'
import { googleConfigurado, sincronizarTrasCambio } from '../google/calendario.js'

// El área se abre a la vez que las reservas propias (NEXT_PUBLIC_RESERVAS_PROPIAS)
export function areaAbierta() {
  return reservasAbiertas()
}

export const CERRADA = { error: 'cerrado', mensaje: 'El área de miembros aún no está abierta. Escríbenos por WhatsApp.' }

// fn(req, res, { email, sus }): sus es la suscripción que ve (ver suscripcionVisible en acceso.js)
export function rutaMiembro(fn, { metodos = ['POST'], calendario = true } = {}) {
  return async (req, res) => {
    sinCache(res)
    if (!soloMetodos(req, res, metodos)) return
    if (!areaAbierta()) return res.status(503).json(CERRADA)
    if (!cookieDeLaPeticion(req)) return res.status(401).json({ error: 'sesion', mensaje: 'Vuelve a entrar en tu área.' })
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
      // Cookie cerrada por el estudio, o sin suscripción que ver: como sin sesión
      const sesion = await sesionDelMiembro(req)
      if (!sesion) {
        res.status(401).json({ error: 'sesion', mensaje: 'Vuelve a entrar en tu área.' })
      } else {
        await fn(req, res, sesion)
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

// A su área, según cómo ha quedado de verdad la sesión (no según la URL de vuelta):
// confirmada → ?reservada; el pago llegó pero hay que revisarla → ?pago=revision; aún sin el
// aviso del banco → ?pago=espera; el pago no salió → ?pago=ko
export function vueltaMiembro(reserva, estado) {
  const codigo = encodeURIComponent(reserva.codigo)
  if (reserva.estado === 'confirmada') return `/miembros?reservada=${codigo}`
  if (estado !== 'ok') return `/miembros?pago=ko&codigo=${codigo}`
  if (['conflicto', 'cancelada'].includes(reserva.estado)) return `/miembros?pago=revision&codigo=${codigo}`
  return `/miembros?pago=espera&codigo=${codigo}`
}
