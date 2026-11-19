// Descarga del contrato firmado (enlace de /contrato/<token>)
import { pdfDelContrato } from '../../../../lib/suscripciones/alta.js'
import { soloMetodos, sinCache } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET'])) return
  sinCache(res)
  const r = await pdfDelContrato({ token: String(req.query.token || '') })
  if (!r) return res.status(404).send('No encontrado')
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${r.nombre}"`)
  res.status(200).send(r.pdf)
}
