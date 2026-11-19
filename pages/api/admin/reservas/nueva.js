// Reserva apuntada a mano por el estudio
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { crearReservaManual } from '../../../../lib/reservas/servicio.js'
import { validarCliente } from '../../../../lib/reservas/validacion.js'
import { correoConfirmacion } from '../../../../lib/reservas/correos.js'
import { urlReserva, urlPanel } from '../../../../lib/reservas/flujo.js'
import { facturasAutomaticas, seFactura } from '../../../../lib/facturas/servicio.js'
import { facturarAlCobrar } from '../../../../lib/facturas/envio.js'
import { urlBase } from '../../../../lib/http.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  const c = validarCliente({ ...b, actividad: b.actividad || 'Fotos' })
  // En el panel el correo y el teléfono son opcionales: con uno de los dos basta
  const errores = { ...c.errores }
  delete errores.email
  delete errores.telefono
  delete errores.apellidos
  if (!c.datos.email && !c.datos.telefono) errores.email = 'Pon al menos un correo o un teléfono.'
  if (Object.keys(errores).length) return res.status(400).json({ error: 'datos', mensaje: Object.values(errores)[0], errores })
  const precioCent = b.precio === '' || b.precio == null ? null : Math.round(Number(String(b.precio).replace(',', '.')) * 100)
  const reserva = await crearReservaManual({
    ...c.datos,
    email: c.datos.email || '',
    fecha: b.fecha,
    desde: b.desde,
    hasta: b.hasta,
    precioCent,
    pagoEstado: b.pagado ? 'pagado' : 'pendiente',
    // «Por Calendly (ya cobrada en Stripe)»: cuenta en el resumen de Calendly del mes, no aquí
    origen: b.pagado && b.metodoPago === 'calendly' ? 'calendly' : 'manual',
    metodoPago: b.pagado ? (b.metodoPago === 'calendly' ? 'stripe' : b.metodoPago || 'transferencia') : null,
    pagadoEn: b.pagado ? b.pagadoEn || null : null,
    notasInternas: b.notasInternas,
  })
  const base = urlBase(req)
  const conFactura = reserva.pagoEstado === 'pagado' && seFactura(reserva) && facturasAutomaticas()
  if (b.enviarCorreo && reserva.email) await correoConfirmacion(reserva, { urlReserva: urlReserva(base, reserva), facturaAutomatica: conFactura })
  // Apuntada ya pagada: lleva su factura (se manda solo si se avisa al cliente)
  if (conFactura) await facturarAlCobrar(reserva, { urlPanel: urlPanel(base), urlReserva: urlReserva(base, reserva), enviar: Boolean(b.enviarCorreo) })
  res.status(200).json({ id: reserva.id })
})
