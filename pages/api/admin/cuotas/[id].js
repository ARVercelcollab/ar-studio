// Acciones sobre la cuota de un periodo
import { rutaAdmin, centimos } from '../../../../lib/admin/api.js'
import * as SUS from '../../../../lib/suscripciones/servicio.js'
import { emitirYEnviarCuota } from '../../../../lib/facturas/envio.js'
import { facturaDeCuota } from '../../../../lib/facturas/servicio.js'
import { registrarEvento } from '../../../../lib/reservas/servicio.js'

// Emitir y mandar la factura de una cuota. Si se emite pero falla el correo, lo dice
// claro (la factura ya existe: se reenvía desde la ficha) y lo apunta en el historial.
async function facturar(id, opciones = {}) {
  try {
    const r = await emitirYEnviarCuota(id, opciones)
    return { ok: true, texto: `Factura ${r.factura.codigo} ${r.enviada ? 'enviada' : 'emitida'}.` }
  } catch (e) {
    const f = await facturaDeCuota(id).catch(() => null)
    if (f) {
      const c = await SUS.cuotaPorId(id).catch(() => null)
      await registrarEvento(null, 'factura_fallida', { codigo: f.codigo, error: String(e.message || e) }, { suscripcionId: c?.suscripcionId ?? null, autor: 'panel' }).catch(() => {})
      return { ok: false, texto: `Factura ${f.codigo} emitida, pero no se ha podido enviar (${e.message}). Reenvíala desde la cuota.` }
    }
    return { ok: false, texto: `La factura no se ha podido emitir: ${e.message}`, error: e }
  }
}

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  switch (b.accion) {
    case 'pagada': {
      await SUS.marcarCuotaPagada(id, { metodo: b.metodo, pagadaEn: b.fecha, referencia: b.referencia, enlace: b.enlace, nota: b.nota })
      let mensaje = 'Cuota marcada como pagada.'
      if (b.emitirFactura) mensaje += ` ${(await facturar(id)).texto}`
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
      const r = await SUS.devolverCuota(id, { nota: b.nota, fecha: b.fecha || null })
      return res.status(200).json({ ok: true, mensaje: r.facturaCodigo ? `Apuntada como devuelta. Tiene la factura ${r.facturaCodigo}: haz la rectificativa a mano.` : 'Apuntada como devuelta.' })
    }
    case 'factura': {
      const datos = b.nombre || b.nif || b.direccion ? { nombre: b.nombre, nif: b.nif, direccion: b.direccion } : null
      const r = await facturar(id, { datosCliente: datos, reenviar: true })
      if (r.error) throw r.error
      return res.status(200).json({ ok: r.ok, mensaje: r.texto })
    }
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
})
