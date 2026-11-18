// Cambiar, borrar o marcar un mes de un gasto fijo
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import * as FIN from '../../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  const version = b.version
  switch (b.accion) {
    case 'editar':
      await FIN.editarGasto(id, b, { version })
      return res.status(200).json({ ok: true, id: Number(id), mensaje: 'Gasto cambiado.' })
    case 'borrar':
      await FIN.borrarGasto(id, { version })
      return res.status(200).json({ ok: true, mensaje: 'Gasto borrado.' })
    case 'anular_mes':
      await FIN.anularMesFijo(id, { version, nota: b.nota })
      return res.status(200).json({ ok: true, mensaje: 'Apuntado: este mes no se paga.' })
    case 'recuperar_mes':
      await FIN.recuperarMesFijo(id, { version })
      return res.status(200).json({ ok: true, mensaje: 'Vuelve a contar este mes.' })
    case 'como_el_fijo':
      await FIN.volverAlFijo(id, { version })
      return res.status(200).json({ ok: true, mensaje: 'Vuelve al importe del gasto fijo.' })
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
})
