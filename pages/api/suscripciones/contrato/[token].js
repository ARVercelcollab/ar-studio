// Firma del contrato de suscripción (desde /contrato/<token>)
import { validarFirma, firmarContrato } from '../../../../lib/suscripciones/alta.js'
import { soloMetodos, mismoOrigen, urlBase, huellaDe, limitar, responderError, sinCache } from '../../../../lib/http.js'

// La firma va como imagen: hace falta algo más de margen que en el resto de la API
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  sinCache(res)
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  try {
    if (!(await limitar(req, res, 'contrato', 10, 30, 'Demasiados intentos seguidos. Espera unos minutos o escríbenos por WhatsApp.'))) return
    const v = validarFirma(req.body || {})
    if (!v.ok) return res.status(400).json({ error: 'datos', mensaje: 'Revisa los datos marcados.', errores: v.errores })
    await firmarContrato(req.query.token, v, { huella: huellaDe(req), base: urlBase(req) })
    res.status(200).json({ ok: true })
  } catch (e) {
    responderError(res, e)
  }
}
