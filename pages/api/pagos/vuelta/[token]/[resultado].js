// El cliente vuelve del TPV. Redsys añade a la URL el resultado firmado: si viene,
// se apunta ya (por si su aviso de servidor tarda o no llega). Luego, a la página de la reserva.
import { recibirResultado } from '../../../../../lib/reservas/flujo.js'
import { urlBase, sinCache } from '../../../../../lib/http.js'

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
  const estado = resultado === 'ok' ? 'ok' : 'ko'
  res.redirect(302, `/reserva/${encodeURIComponent(String(token))}?pago=${estado}`)
}
