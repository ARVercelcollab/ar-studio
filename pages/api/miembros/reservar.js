// Reserva una sesión del plan. Sin horas aparte: { estado: 'confirmada', codigo }. Con horas
// aparte (y aceptoPagoExtra): { estado: 'pago', codigo, pago, expiraEn } con el formulario del TPV.
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { reservarMiembro } from '../../../lib/miembros/acciones.js'
import { urlBase } from '../../../lib/http.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const b = req.body || {}
  const r = await reservarMiembro(sus, { fecha: b.fecha, desde: b.desde, horas: b.horas, aceptoPagoExtra: Boolean(b.aceptoPagoExtra) }, urlBase(req))
  return res.status(200).json(r)
})
