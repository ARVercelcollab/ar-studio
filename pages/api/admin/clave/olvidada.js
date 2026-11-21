// «¿Has olvidado la contraseña?»: manda un enlace (1 hora) para poner otra. Siempre se contesta
// lo mismo y tras el mismo tiempo, tenga o no acceso ese correo.
// Límites: 10 por hora por conexión; 3 por hora por correo y conexión; 10 por hora por correo en
// total (pedir enlaces no anula el que ya tenga la persona).
import { pedirRecuperar, normalizarEmail, MENSAJE_OLVIDADA } from '../../../../lib/admin/cuentas.js'
import { esperarMinimo } from '../../../../lib/miembros/acceso.js'
import { soloMetodos, mismoOrigen, sinCache, urlBase, limitar, huellaDe } from '../../../../lib/http.js'
import { dentroDelLimite } from '../../../../lib/db/index.js'

const LIMITE = 'Has pedido varios enlaces seguidos. Espera un rato y mira tu correo (también en spam).'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  const inicio = Date.now()
  if (!(await limitar(req, res, 'panel_olvidada', 10, 60, LIMITE))) return
  const email = normalizarEmail(req.body?.email)
  const dentro = !email || ((await dentroDelLimite(`panel_olvidada_cc:${email}:${huellaDe(req)}`, 3, 60)) && (await dentroDelLimite(`panel_olvidada_correo:${email}`, 10, 60)))
  if (!dentro) {
    await esperarMinimo(inicio)
    return res.status(429).json({ error: 'limite', mensaje: LIMITE })
  }
  try {
    await pedirRecuperar(email, urlBase(req))
  } catch (e) {
    // Si falla el envío no se dice (sería una pista): queda en el registro
    console.error('[panel] no se pudo mandar el enlace para recuperar la contraseña', e.message)
  }
  await esperarMinimo(inicio)
  return res.status(200).json({ ok: true, mensaje: MENSAJE_OLVIDADA })
}
