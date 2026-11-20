// Comprueba una sesión antes de reservarla (o de cambiarla): errores, horas del plan y aparte
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { comprobarMiembro } from '../../../lib/miembros/acciones.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const b = req.body || {}
  return res.status(200).json(await comprobarMiembro(sus, { fecha: b.fecha, desde: b.desde, horas: b.horas, codigo: b.codigo || null }))
}, { calendario: false })
