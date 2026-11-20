// Días de su plan con algún hueco libre: { dias: { 'AAAA-MM-DD': número de huecos } }
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { diasConHuecosMiembro } from '../../../lib/miembros/acciones.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const { desde, hasta, horas, codigo } = req.query
  return res.status(200).json(await diasConHuecosMiembro(sus, { desde, hasta, horas, codigo: codigo || null }))
}, { metodos: ['GET'], calendario: false })
