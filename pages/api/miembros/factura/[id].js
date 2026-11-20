// PDF de una factura suya (de una cuota o de las horas aparte de una sesión)
import { rutaMiembro } from '../../../../lib/miembros/api.js'
import { facturaDelMiembro } from '../../../../lib/miembros/acciones.js'

export default rutaMiembro(async (req, res, { email }) => {
  const { pdf, nombre } = await facturaDelMiembro(email, req.query.id)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${nombre.replace(/"/g, '')}"`)
  return res.status(200).send(Buffer.from(pdf))
}, { metodos: ['GET'], calendario: false })
