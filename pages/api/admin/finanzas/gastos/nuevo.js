// Apuntar un gasto suelto (variable, material o de un fijo que no se apunta solo)
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import { crearGasto } from '../../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  const r = await crearGasto(b, { clave: b.clave })
  res.status(200).json({ ok: true, id: r.id, concepto: r.concepto, totalCent: r.totalCent, mensaje: r.repetido ? 'Ya estaba apuntado.' : 'Gasto apuntado.' })
})
