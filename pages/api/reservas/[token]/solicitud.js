// El cliente pide cambiar o cancelar su reserva: se avisa al estudio por correo
import { reservaPorToken, registrarEvento } from '../../../../lib/reservas/servicio.js'
import { avisoSolicitud } from '../../../../lib/reservas/correos.js'
import { urlPanel } from '../../../../lib/reservas/flujo.js'
import { checkRateLimit } from '../../../../lib/rateLimit.js'
import { soloMetodos, mismoOrigen, ipDe, urlBase, responderError, sinCache } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  sinCache(res)
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  if (!checkRateLimit(`solicitud:${ipDe(req)}`, 5, 60 * 60000).success) {
    return res.status(429).json({ error: 'limite', mensaje: 'Ya nos has escrito varias veces. Te contestamos enseguida.' })
  }
  const tipo = req.body?.tipo === 'cancelar' ? 'cancelar' : 'cambiar'
  const mensaje = String(req.body?.mensaje || '').trim().slice(0, 1000)
  try {
    const r = await reservaPorToken(String(req.query.token))
    if (!r) return res.status(404).json({ error: 'no_existe', mensaje: 'No encontramos esa reserva.' })
    if (r.estado !== 'confirmada') return res.status(409).json({ error: 'estado', mensaje: 'Esta reserva no está confirmada.' })
    await avisoSolicitud(r, { tipo, mensaje, urlPanel: urlPanel(urlBase(req)) })
    await registrarEvento(r.id, 'solicitud_cliente', { tipo, mensaje })
    res.status(200).json({ ok: true })
  } catch (e) {
    responderError(res, e)
  }
}
