// Acciones del apartado Google Calendar del panel
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { elegirCalendario, desconectar, sincronizarPendientes, ErrorGoogle } from '../../../../lib/google/calendario.js'
import { urlBase } from '../../../../lib/http.js'
import { query } from '../../../../lib/db/index.js'
import { ErrorReserva } from '../../../../lib/reservas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  try {
    if (b.accion === 'calendario') {
      const c = await elegirCalendario(String(b.id || ''))
      const r = await sincronizarPendientes({ base: urlBase(req), limite: 25, tiempoMaxMs: 5000 })
      return res.status(200).json({ ok: true, calendario: c.nombre, resumen: r })
    }
    if (b.accion === 'desconectar') {
      await desconectar()
      return res.status(200).json({ ok: true })
    }
    if (b.accion === 'sincronizar') {
      // Los que fallaron se vuelven a intentar desde cero
      await query(`UPDATE reservas SET gcal_intentos = 0 WHERE gcal_estado = 'error'`)
      await query(`UPDATE bloqueos SET gcal_intentos = 0 WHERE gcal_estado = 'error'`)
      await query(`UPDATE gcal_borrar SET intentos = 0`)
      const r = await sincronizarPendientes({ base: urlBase(req), limite: 50, tiempoMaxMs: 5000, todo: true })
      return res.status(200).json({ ok: true, resumen: r })
    }
  } catch (e) {
    if (e instanceof ErrorGoogle) throw new ErrorReserva('google', e.message, 502)
    throw e
  }
  throw new ErrorReserva('accion', 'Acción no válida.', 400)
}, { calendario: false })
