// Alta de miembros por la web: guarda los datos y devuelve el formulario para pagar el
// primer mes en el TPV. También sirve para volver a intentar un pago que no se completó.
import { validarAlta, crearAlta, reintentarAlta } from '../../../lib/suscripciones/alta.js'
import { soloMetodos, mismoOrigen, urlBase, huellaDe, limitar, responderError, reservasAbiertas, sinCache } from '../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  sinCache(res)
  if (!reservasAbiertas()) return res.status(503).json({ error: 'cerrado', mensaje: 'El alta online aún no está abierta. Escríbenos por WhatsApp.' })
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  const b = req.body || {}
  try {
    if (!(await limitar(req, res, 'alta', 8, 30, 'Demasiados intentos seguidos. Espera unos minutos o escríbenos por WhatsApp.'))) return
    if (b.accion === 'reintentar') return res.status(200).json(await reintentarAlta(b.token, urlBase(req)))
    const v = validarAlta(b)
    if (!v.ok) return res.status(400).json({ error: 'datos', mensaje: 'Revisa los datos marcados.', errores: v.errores })
    res.status(200).json(await crearAlta(v.datos, urlBase(req), { huella: huellaDe(req) }))
  } catch (e) {
    responderError(res, e)
  }
}
