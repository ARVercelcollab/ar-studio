// Acciones sobre un gasto fijo
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import * as FIN from '../../../../../lib/finanzas/servicio.js'
import { textoMes, listaMeses } from '../../../../../lib/finanzas/calculos.js'
import { fechaMadrid } from '../../../../../lib/reservas/tiempo.js'

const meses = (n) => (n === 1 ? '1 mes' : `${n} meses`)
// «1 mes ya apuntado» / «3 meses ya apuntados»
const apuntados = (n, ya = '') => (n === 1 ? `1 mes ${ya}apuntado` : `${n} meses ${ya}apuntados`)

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  const version = b.version
  const hoy = fechaMadrid(new Date())
  switch (b.accion) {
    case 'editar': {
      const r = await FIN.editarGastoFijo(id, b, { version })
      return res.status(200).json({ ok: true, mensaje: `Cambiado desde este mes (${meses(r.cambiados)}).` })
    }
    case 'importe': {
      const r = await FIN.cambiarImporteFijo(id, { importe: b.importe, desdeMes: b.desdeMes, version })
      let mensaje = `Importe cambiado desde ${textoMes(b.desdeMes)} (${apuntados(r.cambiados, 'ya ')}).`
      if (r.sinTocar.length) mensaje += ` ${listaMeses(r.sinTocar, hoy).replace(/^./, (c) => c.toUpperCase())} ${r.sinTocar.length === 1 ? 'lo cambiasteis a mano y no se ha tocado' : 'los cambiasteis a mano y no se han tocado'}.`
      return res.status(200).json({ ok: true, mensaje })
    }
    case 'quitar_cambio':
      await FIN.quitarCambioImporte(id, { desdeMes: b.desdeMes, version })
      return res.status(200).json({ ok: true, mensaje: 'Cambio quitado.' })
    case 'terminar': {
      const r = await FIN.terminarGastoFijo(id, { ultimoMes: b.ultimoMes, version })
      let mensaje = `Hecho: ya no se paga después de ${textoMes(b.ultimoMes)}.`
      if (r.seQuedan.length) mensaje += ` Los de ${listaMeses(r.seQuedan, hoy)} los cambiasteis a mano y se han quedado: marcadlos «Este mes no se paga» si no se pagaron.`
      return res.status(200).json({ ok: true, mensaje })
    }
    case 'quitar_final': {
      const r = await FIN.quitarFinalGastoFijo(id, { version })
      return res.status(200).json({ ok: true, mensaje: `Vuelve a apuntarse cada mes (${apuntados(r.apuntados)}).` })
    }
    case 'borrar': {
      const r = await FIN.borrarGastoFijo(id, { version })
      return res.status(200).json({ ok: true, mensaje: r.borrados === 1 ? 'Gasto fijo borrado con su mes apuntado.' : r.borrados ? `Gasto fijo borrado con sus ${r.borrados} meses.` : 'Gasto fijo borrado.' })
    }
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
})
