// El cliente descarga su factura desde la página de su reserva
import { reservaPorToken } from '../../../../lib/reservas/servicio.js'
import { facturaDeReserva } from '../../../../lib/facturas/servicio.js'
import { pdfFactura } from '../../../../lib/facturas/pdf.js'
import { soloMetodos, sinCache } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET'])) return
  sinCache(res)
  const r = await reservaPorToken(String(req.query.token))
  const f = r ? await facturaDeReserva(r.id) : null
  if (!f) return res.status(404).send('No encontrada')
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="Factura ${f.codigo}.pdf"`)
  res.status(200).send(await pdfFactura(f))
}
