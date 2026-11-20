// Horas de inicio libres ese día dentro de su horario: { huecos: ['09:00', …] }
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { huecosMiembro } from '../../../lib/miembros/acciones.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const { fecha, horas, codigo } = req.query
  return res.status(200).json(await huecosMiembro(sus, { fecha, horas, codigo: codigo || null }))
}, { metodos: ['GET'], calendario: false })
