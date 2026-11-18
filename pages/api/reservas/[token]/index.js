// Estado de una reserva (la página de la reserva lo consulta mientras llega el pago)
import { reservaPorToken } from '../../../../lib/reservas/servicio.js'
import { vistaPublica } from '../../../../lib/reservas/publico.js'
import { soloMetodos, responderError, sinCache } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET'])) return
  sinCache(res)
  try {
    const r = await reservaPorToken(String(req.query.token))
    if (!r) return res.status(404).json({ error: 'no_existe', mensaje: 'No encontramos esa reserva.' })
    res.status(200).json(vistaPublica(r))
  } catch (e) {
    responderError(res, e)
  }
}
