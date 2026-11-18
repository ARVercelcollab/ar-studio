// PDF de una factura (panel)
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { facturaPorId } from '../../../../lib/facturas/servicio.js'
import { pdfFactura } from '../../../../lib/facturas/pdf.js'

export default rutaAdmin(async (req, res) => {
  const f = await facturaPorId(req.query.id)
  if (!f) return res.status(404).json({ error: 'no_existe', mensaje: 'Factura no encontrada.' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="Factura ${f.codigo}.pdf"`)
  res.status(200).send(await pdfFactura(f))
}, { metodos: ['GET'] })
