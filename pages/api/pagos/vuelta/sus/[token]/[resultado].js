// El cliente vuelve del TPV tras pagar el alta o una cuota. Si Redsys añade el resultado
// firmado, se apunta ya (por si su aviso de servidor tarda). Luego, a su contrato o a su cuota.
import { recibirResultado } from '../../../../../../lib/reservas/flujo.js'
import { query } from '../../../../../../lib/db/index.js'
import { urlBase, sinCache } from '../../../../../../lib/http.js'

export default async function handler(req, res) {
  sinCache(res)
  const { token, resultado, ...resto } = req.query
  if (resto.Ds_MerchantParameters && resto.Ds_Signature) {
    try {
      await recibirResultado('redsys', resto, urlBase(req))
    } catch (e) {
      console.error('[pagos] vuelta de Redsys no válida', e.message)
    }
  }
  const t = String(token || '')
  const estado = resultado === 'ok' ? 'ok' : 'ko'
  const { rows: alta } = await query('SELECT 1 FROM altas WHERE token = $1', [t])
  if (alta.length) return res.redirect(302, `/contrato/${encodeURIComponent(t)}?pago=${estado}`)
  const { rows: cuota } = await query('SELECT 1 FROM cuotas WHERE pago_token = $1', [t])
  if (cuota.length) return res.redirect(302, `/cuota/${encodeURIComponent(t)}?pago=${estado}`)
  res.redirect(302, '/')
}
