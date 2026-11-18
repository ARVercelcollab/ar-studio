// Tarea diaria (Vercel Cron, ver vercel.json): recordatorios de las reservas de mañana
// y limpieza de las horas guardadas que no se llegaron a pagar.
import { reservasParaRecordar, marcarRecordatorio, limpiarRetenciones, registrarEvento } from '../../../lib/reservas/servicio.js'
import { correoRecordatorio } from '../../../lib/reservas/correos.js'
import { urlReserva } from '../../../lib/reservas/flujo.js'
import { urlBase } from '../../../lib/http.js'
import { asegurarCuotasDeTodas } from '../../../lib/suscripciones/servicio.js'

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET
  if (secreto ? req.headers.authorization !== `Bearer ${secreto}` : Boolean(process.env.VERCEL)) {
    return res.status(401).json({ error: 'no_autorizado' })
  }
  await limpiarRetenciones()
  await asegurarCuotasDeTodas()
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
  res.status(200).json({ recordatorios: enviados, pendientes: reservas.length - enviados })
}
