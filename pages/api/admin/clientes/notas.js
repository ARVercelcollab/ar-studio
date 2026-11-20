// Notas del estudio sobre un cliente: POST { clave, notas }
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { guardarNotasCliente } from '../../../../lib/reservas/clientes.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  const r = await guardarNotasCliente(b.clave, b.notas)
  res.status(200).json({ ok: true, ...r, mensaje: r.notas ? 'Notas guardadas.' : 'Notas borradas.' })
}, { calendario: false })
