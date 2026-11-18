// La reserva en formato calendario (.ics) para añadirla al móvil
import { reservaPorToken } from '../../../../lib/reservas/servicio.js'
import { icsCliente } from '../../../../lib/reservas/ics.js'
import { urlReserva } from '../../../../lib/reservas/flujo.js'
import { soloMetodos, urlBase } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET'])) return
  const r = await reservaPorToken(String(req.query.token))
  if (!r || !['confirmada', 'cancelada'].includes(r.estado)) return res.status(404).send('No encontrada')
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="reserva-${r.codigo}.ics"`)
  res.status(200).send(icsCliente(r, urlReserva(urlBase(req), r)))
}
