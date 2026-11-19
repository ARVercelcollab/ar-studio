// Acciones sobre una reserva desde el panel
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { marcarPagada, cancelar, reprogramar, guardarNotas, reactivar, reservaPorId, registrarEvento } from '../../../../lib/reservas/servicio.js'
import { correoCancelacion, correoCambio, correoConfirmacion } from '../../../../lib/reservas/correos.js'
import { urlReserva, urlPanel } from '../../../../lib/reservas/flujo.js'
import { facturasAutomaticas, seFactura } from '../../../../lib/facturas/servicio.js'
import { emitirYEnviar, facturarAlCobrar } from '../../../../lib/facturas/envio.js'
import { urlBase } from '../../../../lib/http.js'
import { moverSesionPlan, cancelarSesionPlan } from '../../../../lib/suscripciones/servicio.js'

const aCent = (v) => (v === '' || v == null ? 0 : Math.round(Number(String(v).replace(',', '.')) * 100))
const aCentONulo = (v) => (v === '' || v == null ? null : Math.round(Number(String(v).replace(',', '.')) * 100))

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  const base = urlBase(req)
  let reserva
  let mensaje = null
  let correoFallido = false
  // La acción ya está hecha: si falla el correo se dice y se apunta, sin dar error
  const correo = async (enviar) => {
    try {
      await enviar()
    } catch (e) {
      correoFallido = true
      mensaje = [mensaje, 'No se ha podido mandar el correo al cliente: avísale por WhatsApp.'].filter(Boolean).join(' ')
      await registrarEvento(reserva.id, 'correo_fallido', { error: String(e.message || e) }, { suscripcionId: reserva.suscripcionId ?? null, autor: 'panel' }).catch(() => {})
    }
  }
  // Un pago que llegó con la reserva en revisión o cancelada no se facturó: al resolverla
  // (moverla a otra hora o reactivarla) sale su factura, si aún no la tiene
  const facturaPendiente = async (enviar) => {
    if (reserva?.estado !== 'confirmada') return
    const r = await facturarAlCobrar(reserva, { urlPanel: urlPanel(base), urlReserva: urlReserva(base, reserva), enviar: enviar && Boolean(reserva.email) })
    if (r?.nueva) mensaje = [mensaje, `Factura ${r.factura.codigo} emitida${r.enviada ? ' y enviada' : ''}.`].filter(Boolean).join(' ')
  }
  switch (b.accion) {
    case 'pagada':
      reserva = await marcarPagada(id, { metodo: b.metodo, nota: b.nota, fecha: b.fecha || null })
      if (b.enviarCorreo && reserva.email) await correo(() => correoConfirmacion(reserva, { urlReserva: urlReserva(base, reserva), facturaAutomatica: seFactura(reserva) && facturasAutomaticas() }))
      {
        // Todo lo cobrado lleva factura; si no se avisa al cliente, se emite sin mandarla
        const r = await facturarAlCobrar(reserva, { urlPanel: urlPanel(base), urlReserva: urlReserva(base, reserva), enviar: Boolean(b.enviarCorreo) })
        if (r?.factura) mensaje = [mensaje, `Factura ${r.factura.codigo} emitida${r.enviada ? ' y enviada' : ''}.`].filter(Boolean).join(' ')
      }
      break
    case 'cancelar': {
      const actual = await reservaPorId(id)
      reserva = actual?.origen === 'plan'
        ? await cancelarSesionPlan(id, { motivo: b.motivo, reembolsoCent: aCent(b.reembolso), cuentaComoUsada: b.cuentaComoUsada ?? null })
        : await cancelar(id, { motivo: b.motivo, reembolsoCent: aCent(b.reembolso) })
      if (b.enviarCorreo && reserva.email) await correo(() => correoCancelacion(reserva))
      break
    }
    case 'mover': {
      const actual = await reservaPorId(id)
      reserva = actual?.origen === 'plan'
        ? await moverSesionPlan(id, { fecha: b.fecha, desde: b.desde, hasta: b.hasta, horasPlan: b.horasPlan ?? null, precioExtraCent: b.precioExtra === undefined ? null : aCentONulo(b.precioExtra), avisosAceptados: b.avisosAceptados || [] })
        : await reprogramar(id, { fecha: b.fecha, desde: b.desde || b.hora, hasta: b.hasta, horas: b.horas ? Number(b.horas) : undefined })
      if (b.enviarCorreo && reserva.email) await correo(() => correoCambio(reserva, { urlReserva: urlReserva(base, reserva) }))
      await facturaPendiente(Boolean(b.enviarCorreo))
      break
    }
    case 'reactivar':
      reserva = await reactivar(id)
      await facturaPendiente(true)
      break
    case 'notas':
      reserva = await guardarNotas(id, b.notas)
      break
    case 'factura': {
      reserva = await reservaPorId(id)
      if (!reserva) return res.status(404).json({ error: 'no_existe', mensaje: 'Reserva no encontrada.' })
      const datos = b.nombre || b.nif || b.direccion ? { nombre: b.nombre, nif: b.nif, direccion: b.direccion } : null
      const r = await emitirYEnviar(reserva, { datosCliente: datos, reenviar: true, urlReserva: urlReserva(base, reserva) })
      const queEs = r.factura.sustituye ? `Factura ${r.factura.codigo} (sustituye a la simplificada ${r.factura.sustituye.codigo})` : `${r.factura.simplificada ? 'Factura simplificada' : 'Factura'} ${r.factura.codigo}`
      mensaje = r.errorEnvio
        ? `${queEs} emitida, pero no se ha podido enviar (${r.errorEnvio}). Descárgala y envíala tú, o vuelve a intentarlo.`
        : `${queEs} ${r.enviada ? `enviada a ${reserva.email}` : 'emitida (sin correo del cliente: descárgala y envíala tú)'}.`
      break
    }
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
  res.status(200).json({ ok: true, estado: reserva?.estado, mensaje, correoFallido })
})
