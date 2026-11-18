// Cambiar o borrar otro ingreso
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import { editarIngresoManual, borrarIngresoManual } from '../../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  if (b.accion === 'editar') {
    await editarIngresoManual(id, b, { version: b.version })
    return res.status(200).json({ ok: true, id: Number(id), mensaje: 'Ingreso cambiado.' })
  }
  if (b.accion === 'borrar') {
    await borrarIngresoManual(id, { version: b.version })
    return res.status(200).json({ ok: true, mensaje: 'Ingreso borrado.' })
  }
  return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
})
