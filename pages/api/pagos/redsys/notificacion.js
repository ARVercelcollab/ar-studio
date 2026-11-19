// Aviso de Redsys de servidor a servidor (DS_MERCHANT_MERCHANTURL)
import { recibirResultado } from '../../../../lib/reservas/flujo.js'
import { soloMetodos, urlBase } from '../../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  try {
    const { codigo, aviso } = await recibirResultado('redsys', req.body || {}, urlBase(req))
    console.log('[pagos] Redsys', codigo, aviso || 'sin cambios')
    res.status(200).send('OK')
  } catch (e) {
    console.error('[pagos] aviso de Redsys rechazado', e.message)
    res.status(400).send('KO')
  }
}
