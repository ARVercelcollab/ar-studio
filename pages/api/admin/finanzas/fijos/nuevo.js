// Nuevo gasto fijo (se apunta solo cada mes que toca)
import { rutaAdmin } from '../../../../../lib/admin/api.js'
import { crearGastoFijo } from '../../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const r = await crearGastoFijo(req.body || {})
  const meses = r.mesesApuntados === 1 ? '1 mes' : `${r.mesesApuntados} meses`
  res.status(200).json({ ok: true, id: r.id, concepto: r.concepto, mensaje: `Gasto fijo guardado.${r.mesesApuntados ? ` Se han apuntado ${meses}.` : ''}` })
})
