// Nuevo intento de pago de una reserva sin pagar
import { volverAPagar } from '../../../../lib/reservas/flujo.js'
import { soloMetodos, mismoOrigen, urlBase, limitar, responderError, reservasAbiertas, sinCache } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  sinCache(res)
  if (!reservasAbiertas()) return res.status(503).json({ error: 'cerrado', mensaje: 'Las reservas online aún no están abiertas.' })
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  try {
    if (!(await limitar(req, res, 'pagar', 10, 30, 'Demasiados intentos seguidos. Espera unos minutos.'))) return
    res.status(200).json(await volverAPagar(String(req.query.token), urlBase(req)))
  } catch (e) {
    responderError(res, e)
  }
}
