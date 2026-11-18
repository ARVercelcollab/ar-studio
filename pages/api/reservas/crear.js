// Crea la reserva (guarda la hora unos minutos) y devuelve el formulario para pagar en el TPV
import { validarReserva } from '../../../lib/reservas/validacion.js'
import { empezarReserva } from '../../../lib/reservas/flujo.js'
import { checkRateLimit } from '../../../lib/rateLimit.js'
import { soloMetodos, mismoOrigen, ipDe, urlBase, responderError, reservasAbiertas, sinCache } from '../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  sinCache(res)
  if (!reservasAbiertas()) return res.status(503).json({ error: 'cerrado', mensaje: 'Las reservas online aún no están abiertas.' })
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  if (!checkRateLimit(`crear:${ipDe(req)}`, 10, 10 * 60000).success) {
    return res.status(429).json({ error: 'limite', mensaje: 'Demasiados intentos seguidos. Espera unos minutos.' })
  }
  const v = validarReserva(req.body || {})
  if (!v.ok) return res.status(400).json({ error: 'datos', mensaje: 'Revisa los datos marcados.', errores: v.errores })
  try {
    res.status(200).json(await empezarReserva(v.datos, urlBase(req)))
  } catch (e) {
    responderError(res, e)
  }
}
