// Contrato de una suscripción (id de la suscripción): GET descarga el PDF firmado,
// POST manda (o vuelve a mandar) el enlace para firmarlo.
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { pdfDelContrato, enviarEnlaceContrato } from '../../../../lib/suscripciones/alta.js'
import { urlBase } from '../../../../lib/http.js'

export default rutaAdmin(async (req, res) => {
  const id = Number(req.query.id)
  if (req.method === 'GET') {
    const r = await pdfDelContrato({ susId: id })
    if (!r) return res.status(404).json({ error: 'no_existe', mensaje: 'Aún no hay contrato firmado.' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${r.nombre}"`)
    return res.status(200).send(r.pdf)
  }
  const r = await enviarEnlaceContrato(id, urlBase(req))
  return res.status(200).json({ ok: true, mensaje: 'Enlace para firmar enviado por correo.', url: r.url })
}, { metodos: ['GET', 'POST'], calendario: false })
