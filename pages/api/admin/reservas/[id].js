// Acciones sobre una reserva desde el panel
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { marcarPagada, cancelar, reprogramar, guardarNotas } from '../../../../lib/reservas/servicio.js'
import { correoCancelacion, correoCambio, correoConfirmacion } from '../../../../lib/reservas/correos.js'
import { urlReserva } from '../../../../lib/reservas/flujo.js'
import { urlBase } from '../../../../lib/http.js'

const aCent = (v) => (v === '' || v == null ? 0 : Math.round(Number(String(v).replace(',', '.')) * 100))

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  const base = urlBase(req)
  let reserva
  switch (b.accion) {
    case 'pagada':
      reserva = await marcarPagada(id, { metodo: b.metodo, nota: b.nota })
      if (b.enviarCorreo && reserva.email) await correoConfirmacion(reserva, { urlReserva: urlReserva(base, reserva) })
      break
    case 'cancelar':
      reserva = await cancelar(id, { motivo: b.motivo, reembolsoCent: aCent(b.reembolso) })
      if (b.enviarCorreo && reserva.email) await correoCancelacion(reserva)
      break
    case 'mover':
      reserva = await reprogramar(id, { fecha: b.fecha, hora: b.hora, horas: b.horas ? Number(b.horas) : undefined })
      if (b.enviarCorreo && reserva.email) await correoCambio(reserva, { urlReserva: urlReserva(base, reserva) })
      break
    case 'notas':
      reserva = await guardarNotas(id, b.notas)
      break
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
  res.status(200).json({ ok: true, estado: reserva?.estado })
})
