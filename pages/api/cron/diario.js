// Tarea diaria (Vercel Cron, ver vercel.json): recordatorios de las reservas de mañana,
// limpieza de las horas guardadas que no se llegaron a pagar y reintento de lo que no
// llegó a Google Calendar.
import { reservasParaRecordar, marcarRecordatorio, limpiarRetenciones, registrarEvento } from '../../../lib/reservas/servicio.js'
import { correoRecordatorio } from '../../../lib/reservas/correos.js'
import { urlReserva } from '../../../lib/reservas/flujo.js'
import { urlBase } from '../../../lib/http.js'
import { asegurarCuotasDeTodas } from '../../../lib/suscripciones/servicio.js'
import { asegurarGastosFijos } from '../../../lib/finanzas/servicio.js'
import { sincronizarPendientes } from '../../../lib/google/calendario.js'

// Hasta 60 s (lo máximo en el plan gratuito de Vercel) por si hay mucho que pasar a Google
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET
  if (secreto ? req.headers.authorization !== `Bearer ${secreto}` : Boolean(process.env.VERCEL)) {
    return res.status(401).json({ error: 'no_autorizado' })
  }
  await limpiarRetenciones()
  await asegurarCuotasDeTodas()
  await asegurarGastosFijos()
  const base = urlBase(req)
  const reservas = await reservasParaRecordar()
  let enviados = 0
  for (const r of reservas) {
    try {
      await correoRecordatorio(r, { urlReserva: urlReserva(base, r) })
      await marcarRecordatorio(r.id)
      await registrarEvento(r.id, 'recordatorio', null)
      enviados++
    } catch (e) {
      console.error('[cron] recordatorio fallido', r.codigo, e.message)
    }
  }
  // Google Calendar: todo lo pendiente o con error, por tandas (como mucho unos 40 segundos)
  let calendario = null
  for (let i = 0; i < 6; i++) {
    const r = await sincronizarPendientes({ base, limite: 50, tiempoMaxMs: 5000, todo: true })
    calendario = r
    if (!r.hecho || (!r.quedan && r.creados + r.quitados + r.errores < 50)) break
  }
  res.status(200).json({ recordatorios: enviados, pendientes: reservas.length - enviados, calendario })
}
