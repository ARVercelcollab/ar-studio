import { rutaAdmin } from '../../../lib/admin/api.js'
import { crearBloqueo, borrarBloqueo } from '../../../lib/reservas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  if (b.accion === 'borrar') await borrarBloqueo(b.id)
  else await crearBloqueo({ fecha: b.fecha, fechaFin: b.fechaFin, desde: b.desde, hasta: b.hasta, motivo: b.motivo })
  res.status(200).json({ ok: true })
})
