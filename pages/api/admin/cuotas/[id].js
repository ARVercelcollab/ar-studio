// Acciones sobre la cuota de un periodo
import { rutaAdmin, centimos } from '../../../../lib/admin/api.js'
import * as SUS from '../../../../lib/suscripciones/servicio.js'
import { emitirYEnviarCuota } from '../../../../lib/facturas/envio.js'

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  switch (b.accion) {
    case 'pagada': {
      await SUS.marcarCuotaPagada(id, { metodo: b.metodo, pagadaEn: b.fecha, referencia: b.referencia, enlace: b.enlace, nota: b.nota })
      let mensaje = 'Cuota marcada como pagada.'
      if (b.emitirFactura) {
        try {
          const r = await emitirYEnviarCuota(id)
          mensaje += ` Factura ${r.factura.codigo} ${r.enviada ? 'enviada' : 'emitida'}.`
        } catch (e) {
          mensaje += ` La factura no se ha podido emitir: ${e.message}`
        }
      }
      return res.status(200).json({ ok: true, mensaje })
    }
    case 'desmarcar':
      await SUS.desmarcarCuota(id)
      return res.status(200).json({ ok: true, mensaje: 'Vuelve a estar pendiente.' })
    case 'editar':
      await SUS.editarCuota(id, { importeCent: centimos(b.importe), horas: b.horas, nota: b.nota })
      return res.status(200).json({ ok: true, mensaje: 'Cuota cambiada.' })
    case 'anular':
      await SUS.anularCuota(id, { nota: b.nota, pausa: Boolean(b.pausa) })
      return res.status(200).json({ ok: true, mensaje: 'Cuota anulada.' })
    case 'devolver': {
      const r = await SUS.devolverCuota(id, { nota: b.nota })
      return res.status(200).json({ ok: true, mensaje: r.facturaCodigo ? `Apuntada como devuelta. Tiene la factura ${r.facturaCodigo}: haz la rectificativa a mano.` : 'Apuntada como devuelta.' })
    }
    case 'factura': {
      const datos = b.nombre || b.nif || b.direccion ? { nombre: b.nombre, nif: b.nif, direccion: b.direccion } : null
      const r = await emitirYEnviarCuota(id, { datosCliente: datos, reenviar: true })
      return res.status(200).json({ ok: true, mensaje: `Factura ${r.factura.codigo} enviada.` })
    }
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
})
