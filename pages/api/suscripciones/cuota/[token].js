// Pagar una cuota con el enlace del correo: devuelve el formulario para ir al TPV
import { pagarCuota } from '../../../../lib/suscripciones/alta.js'
import { soloMetodos, mismoOrigen, urlBase, limitar, responderError, sinCache } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  sinCache(res)
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  try {
    if (!(await limitar(req, res, 'cuota', 8, 30, 'Demasiados intentos seguidos. Espera unos minutos o escríbenos por WhatsApp.'))) return
    res.status(200).json(await pagarCuota(req.query.token, urlBase(req)))
  } catch (e) {
    responderError(res, e)
  }
}
