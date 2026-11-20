// El miembro pide el enlace para entrar en su área. Siempre se contesta lo mismo, esté o no
// su correo dado de alta (para no dar pistas a nadie).
import { pedirEnlace, MENSAJE_ENLACE } from '../../../lib/miembros/acceso.js'
import { areaAbierta, CERRADA } from '../../../lib/miembros/api.js'
import { soloMetodos, mismoOrigen, sinCache, urlBase, limitar, huellaDe } from '../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!areaAbierta()) return res.status(503).json(CERRADA)
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  if (!(await limitar(req, res, 'miembro_enlace', 5, 15, 'Has pedido varios enlaces seguidos. Espera unos minutos y mira tu correo (también en spam).'))) return
  try {
    const r = await pedirEnlace(req.body?.email, urlBase(req), { huella: huellaDe(req) })
    if (!r.enviado && r.motivo === 'correo') return res.status(400).json({ error: 'email', mensaje: 'Revisa tu correo: parece que falta algo.' })
  } catch (e) {
    // Si falla el envío no se dice a quien lo pide (sería una pista): se apunta en el registro
    console.error('[miembros] no se pudo mandar el enlace', e.message)
  }
  return res.status(200).json({ ok: true, mensaje: MENSAJE_ENLACE })
}
