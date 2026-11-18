// Horas libres de un día: GET ?fecha=AAAA-MM-DD&horas=2
import { consultarHoras } from '../../../lib/reservas/servicio.js'
import { duracion } from '../../../lib/reservas/config.js'
import { soloMetodos, responderError, reservasAbiertas, sinCache } from '../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET'])) return
  sinCache(res)
  if (!reservasAbiertas()) return res.status(503).json({ error: 'cerrado', mensaje: 'Las reservas online aún no están abiertas.' })
  const horas = Number(req.query.horas)
  if (!duracion(horas)) return res.status(400).json({ error: 'horas', mensaje: 'Duración no válida.' })
  try {
    res.status(200).json(await consultarHoras({ fecha: req.query.fecha, horas }))
  } catch (e) {
    responderError(res, e)
  }
}
