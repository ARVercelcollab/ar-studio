// PDF de su contrato firmado
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { contratoDelMiembro } from '../../../lib/miembros/acciones.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const { pdf, nombre } = await contratoDelMiembro(sus)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${nombre.replace(/"/g, '')}"`)
  return res.status(200).send(pdf)
}, { metodos: ['GET'], calendario: false })
