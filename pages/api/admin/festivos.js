import { rutaAdmin } from '../../../lib/admin/api.js'
import { guardarFestivo, borrarFestivo } from '../../../lib/reservas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  if (b.accion === 'borrar') await borrarFestivo(b.fecha)
  else await guardarFestivo({ fecha: b.fecha, nombre: b.nombre })
  res.status(200).json({ ok: true })
})
