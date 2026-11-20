// El miembro pide el enlace para entrar en su área. Siempre se contesta lo mismo y tras el mismo
// tiempo (unos 1,5 s), esté o no su correo dado de alta: ni el texto ni lo que tarda dan pistas.
import { pedirEnlace, esperarMinimo, MENSAJE_ENLACE } from '../../../lib/miembros/acceso.js'
import { areaAbierta, CERRADA } from '../../../lib/miembros/api.js'
import { soloMetodos, mismoOrigen, sinCache, urlBase, limitar, huellaDe } from '../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!areaAbierta()) return res.status(503).json(CERRADA)
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  const inicio = Date.now()
  if (!(await limitar(req, res, 'miembro_enlace', 5, 15, 'Has pedido varios enlaces seguidos. Espera unos minutos y mira tu correo (también en spam).'))) return
  let malo = false
  try {
    const r = await pedirEnlace(req.body?.email, urlBase(req), { huella: huellaDe(req) })
    malo = !r.enviado && r.motivo === 'correo'
  } catch (e) {
    // Si falla el envío no se dice a quien lo pide (sería una pista): se apunta en el registro
    console.error('[miembros] no se pudo mandar el enlace', e.message)
  }
  await esperarMinimo(inicio)
  if (malo) return res.status(400).json({ error: 'email', mensaje: 'Revisa tu correo: parece que falta algo.' })
  return res.status(200).json({ ok: true, mensaje: MENSAJE_ENLACE })
}
