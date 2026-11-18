// Días con huecos libres para una duración: GET ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&horas=2
import { consultarDias, listarFestivos } from '../../../lib/reservas/servicio.js'
import { duracion } from '../../../lib/reservas/config.js'
import { soloMetodos, responderError, reservasAbiertas, sinCache } from '../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET'])) return
  sinCache(res)
  if (!reservasAbiertas()) return res.status(503).json({ error: 'cerrado', mensaje: 'Las reservas online aún no están abiertas.' })
  const { desde, hasta } = req.query
  const horas = Number(req.query.horas)
  if (!duracion(horas)) return res.status(400).json({ error: 'horas', mensaje: 'Duración no válida.' })
  try {
    const [dias, festivos] = await Promise.all([consultarDias({ desde, hasta, horas }), listarFestivos()])
    res.status(200).json({ dias, festivos: festivos.filter((f) => f.fecha >= desde && f.fecha <= hasta).map((f) => f.fecha) })
  } catch (e) {
    responderError(res, e)
  }
}
