// Acciones sobre una reserva desde el panel
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { marcarPagada, cancelar, reprogramar, guardarNotas, reactivar, reservaPorId } from '../../../../lib/reservas/servicio.js'
import { correoCancelacion, correoCambio, correoConfirmacion } from '../../../../lib/reservas/correos.js'
import { urlReserva, urlPanel } from '../../../../lib/reservas/flujo.js'
import { facturasAutomaticas } from '../../../../lib/facturas/servicio.js'
import { emitirYEnviar, facturaAutomatica } from '../../../../lib/facturas/envio.js'
import { urlBase } from '../../../../lib/http.js'

const aCent = (v) => (v === '' || v == null ? 0 : Math.round(Number(String(v).replace(',', '.')) * 100))

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  const base = urlBase(req)
  let reserva
  let mensaje = null
  switch (b.accion) {
    case 'pagada':
      reserva = await marcarPagada(id, { metodo: b.metodo, nota: b.nota })
      if (b.enviarCorreo && reserva.email) await correoConfirmacion(reserva, { urlReserva: urlReserva(base, reserva), facturaAutomatica: Boolean(reserva.factura) && facturasAutomaticas() })
      if (b.enviarCorreo && reserva.factura && facturasAutomaticas()) {
        const r = await facturaAutomatica(reserva, { urlPanel: urlPanel(base) })
        if (r?.factura) mensaje = `Factura ${r.factura.codigo} emitida${r.enviada ? ' y enviada' : ''}.`
      }
      break
    case 'cancelar':
      reserva = await cancelar(id, { motivo: b.motivo, reembolsoCent: aCent(b.reembolso) })
      if (b.enviarCorreo && reserva.email) await correoCancelacion(reserva)
      break
    case 'mover':
      reserva = await reprogramar(id, { fecha: b.fecha, hora: b.hora, horas: b.horas ? Number(b.horas) : undefined })
      if (b.enviarCorreo && reserva.email) await correoCambio(reserva, { urlReserva: urlReserva(base, reserva) })
      break
    case 'reactivar':
      reserva = await reactivar(id)
      break
    case 'notas':
      reserva = await guardarNotas(id, b.notas)
      break
    case 'factura': {
      reserva = await reservaPorId(id)
      if (!reserva) return res.status(404).json({ error: 'no_existe', mensaje: 'Reserva no encontrada.' })
      const datos = b.nombre || b.nif || b.direccion ? { nombre: b.nombre, nif: b.nif, direccion: b.direccion } : null
      const r = await emitirYEnviar(reserva, { datosCliente: datos, reenviar: true })
      mensaje = `Factura ${r.factura.codigo} ${r.enviada ? `enviada a ${reserva.email}` : 'emitida (sin correo del cliente: descárgala y envíala tú)'}.`
      break
    }
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
  res.status(200).json({ ok: true, estado: reserva?.estado, mensaje })
})
