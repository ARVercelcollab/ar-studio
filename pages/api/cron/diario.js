// Tarea diaria (Vercel Cron, ver vercel.json): recordatorios de las reservas de mañana,
// limpieza de las horas guardadas que no se llegaron a pagar, contratos sin firmar a las
// 48 h, enlaces de pago de las cuotas que empiezan y reintento de lo que no llegó a
// Google Calendar.
import { reservasParaRecordar, marcarRecordatorio, limpiarRetenciones, registrarEvento } from '../../../lib/reservas/servicio.js'
import { correoRecordatorio } from '../../../lib/reservas/correos.js'
import { urlReserva } from '../../../lib/reservas/flujo.js'
import { urlBase } from '../../../lib/http.js'
import { asegurarCuotasDeTodas } from '../../../lib/suscripciones/servicio.js'
import { asegurarGastosFijos } from '../../../lib/finanzas/servicio.js'
import { sincronizarPendientes } from '../../../lib/google/calendario.js'
import { tareasDiariasSuscripciones } from '../../../lib/suscripciones/alta.js'

// Hasta 60 s (lo máximo en el plan gratuito de Vercel) por si hay mucho que pasar a Google
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET
  if (secreto ? req.headers.authorization !== `Bearer ${secreto}` : Boolean(process.env.VERCEL)) {
    return res.status(401).json({ error: 'no_autorizado' })
  }
  const empezo = Date.now()
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
  // Suscripciones: recordatorio de contratos sin firmar y enlaces de pago de las cuotas
  let suscripciones = null
  try {
    suscripciones = await tareasDiariasSuscripciones(base)
  } catch (e) {
    console.error('[cron] suscripciones', e.message)
  }
  // Google Calendar: todo lo pendiente o con error, por tandas, con un plazo total que deja
  // margen dentro de los 60 s (lo que quede, mañana o con «Volver a sincronizar»)
  const usado = Date.now() - empezo
  const calendario = await sincronizarPendientes({ base, limite: 50, tiempoMaxMs: Math.max(5000, 45000 - usado), todo: true })
  res.status(200).json({ recordatorios: enviados, pendientes: reservas.length - enviados, suscripciones, calendario })
}
