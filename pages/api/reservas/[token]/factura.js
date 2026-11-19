// Factura desde la página de su reserva:
// - GET: el cliente descarga su factura (la vigente)
// - POST: pide la factura completa con sus datos; si ya tiene la simplificada, la nueva la sustituye
import { reservaPorToken } from '../../../../lib/reservas/servicio.js'
import { facturaDeReserva, datosCompletos, seFactura } from '../../../../lib/facturas/servicio.js'
import { pdfFactura } from '../../../../lib/facturas/pdf.js'
import { emitirYEnviar } from '../../../../lib/facturas/envio.js'
import { urlReserva } from '../../../../lib/reservas/flujo.js'
import { soloMetodos, sinCache, mismoOrigen, limitar, urlBase, responderError } from '../../../../lib/http.js'

const texto = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max)

export default async function handler(req, res) {
  if (!soloMetodos(req, res, ['GET', 'POST'])) return
  sinCache(res)
  if (req.method === 'GET') {
    const r = await reservaPorToken(String(req.query.token))
    const f = r ? await facturaDeReserva(r.id) : null
    if (!f) return res.status(404).send('No encontrada')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${f.simplificada ? 'Factura simplificada' : 'Factura'} ${f.codigo}.pdf"`)
    return res.status(200).send(await pdfFactura(f))
  }

  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
  try {
    if (!(await limitar(req, res, 'factura_cliente', 5, 60, 'Ya lo has intentado varias veces. Escríbenos y te la hacemos nosotros.'))) return
    const r = await reservaPorToken(String(req.query.token))
    if (!r) return res.status(404).json({ error: 'no_existe', mensaje: 'No encontramos esa reserva.' })
    if (!seFactura(r) || r.pagoEstado !== 'pagado') return res.status(409).json({ error: 'estado', mensaje: 'Esta reserva no tiene un pago por el que hacer factura. Escríbenos si la necesitas.' })
    const datos = { nombre: texto(req.body?.nombre, 120), nif: texto(req.body?.nif, 20).toUpperCase(), direccion: texto(req.body?.direccion, 200) }
    if (!datosCompletos(datos)) return res.status(400).json({ error: 'datos', mensaje: 'Para la factura hacen falta el nombre o razón social, el NIF o CIF y la dirección.' })
    const actual = await facturaDeReserva(r.id)
    if (actual && !actual.simplificada) return res.status(409).json({ error: 'ya', mensaje: `Ya tienes la factura ${actual.codigo} con tus datos. Si hay que corregir algo, escríbenos.` })
    const { factura, enviada } = await emitirYEnviar(r, { datosCliente: datos, urlReserva: urlReserva(urlBase(req), r) })
    res.status(200).json({ ok: true, codigo: factura.codigo, enviada })
  } catch (e) {
    responderError(res, e)
  }
}
