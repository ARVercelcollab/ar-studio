// Apuntar otro ingreso (fondos del día, factura hecha a mano, otros) o una devolución
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import { crearIngresoManual } from '../../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  const r = await crearIngresoManual(b, { clave: b.clave })
  res.status(200).json({ ok: true, id: r.id, concepto: r.concepto, totalCent: r.totalCent, mensaje: r.repetido ? 'Ya estaba apuntado.' : 'Ingreso apuntado.' })
})
