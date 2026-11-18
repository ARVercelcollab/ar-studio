// Respuesta de Addon Payments (MERCHANT_RESPONSE_URL). La página de pago enseña lo que
// devolvemos aquí, así que se manda al cliente a su reserva.
import { recibirResultado, urlReserva } from '../../../../lib/reservas/flujo.js'
import { esc } from '../../../../lib/reservas/correos.js'
import { ESTUDIO } from '../../../../lib/reservas/config.js'
import { soloMetodos, urlBase } from '../../../../lib/http.js'

function pagina(titulo, texto, enlace) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>${enlace ? `<meta http-equiv="refresh" content="1;url=${esc(enlace)}">` : ''}</head>
<body style="font-family:Helvetica,Arial,sans-serif;color:#4b3828;max-width:480px;margin:60px auto;padding:0 20px">
<h1 style="font-weight:400">${esc(titulo)}</h1><p>${esc(texto)}</p>
${enlace ? `<p><a href="${esc(enlace)}" style="color:#4b3828">Ver mi reserva</a></p><script>window.top.location.href=${JSON.stringify(enlace)}</script>` : ''}
</body></html>`
}

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['POST'])) return
  const base = urlBase(req)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  try {
    const { reserva, resultado } = await recibirResultado('addon', req.body || {}, base)
    const enlace = `${urlReserva(base, reserva)}?pago=${resultado.pagado ? 'ok' : 'ko'}`
    res.status(200).send(pagina(resultado.pagado ? 'Pago recibido' : 'El pago no se ha completado', 'Te llevamos a tu reserva…', enlace))
  } catch (e) {
    console.error('[pagos] respuesta de Addon rechazada', e.message)
    res.status(200).send(pagina('No hemos podido comprobar el pago', `Escríbenos por WhatsApp al ${ESTUDIO.whatsappVisible} y lo miramos.`, null))
  }
}
