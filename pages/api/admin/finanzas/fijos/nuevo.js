// Nuevo gasto fijo (se apunta solo cada mes que toca)
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import { crearGastoFijo } from '../../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const r = await crearGastoFijo(req.body || {})
  const n = r.mesesApuntados
  const apuntados = n === 1 ? ' Se ha apuntado 1 mes.' : n ? ` Se han apuntado ${n} meses.` : ''
  res.status(200).json({ ok: true, id: r.id, concepto: r.concepto, mensaje: `Gasto fijo guardado.${apuntados}` })
})
