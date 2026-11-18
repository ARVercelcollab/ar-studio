// Resultado del TPV simulado (solo pruebas)
import { recibirResultado } from '../../../lib/reservas/flujo.js'
import { simuladoPermitido } from '../../../lib/pagos/simulado.js'
import { soloMetodos, urlBase } from '../../../lib/http.js'

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  if (!simuladoPermitido()) return res.status(404).send('No disponible')
  const { pedido, importe, resultado, firma, ok, ko } = req.body || {}
  const base = urlBase(req)
  const destino = resultado === 'ok' ? ok : ko
  try {
    await recibirResultado('simulado', { pedido, importe, resultado, firma }, base)
  } catch (e) {
    return res.status(400).send(`Pago simulado no válido: ${e.message}`)
  }
  // Solo se vuelve a páginas de esta web
  const url = new URL(String(destino || '/'), base)
  if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/api/pagos/vuelta/')) return res.redirect(303, '/')
  res.redirect(303, url.pathname)
}
