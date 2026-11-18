// Dar por visto un aviso de «Para revisar»
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { marcarAvisoVisto } from '../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  await marcarAvisoVisto((req.body || {}).clave)
  res.status(200).json({ ok: true, mensaje: 'Hecho.' })
})
