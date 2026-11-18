// Ajustes de Finanzas: desde cuándo se llevan aquí las cuentas y hasta cuándo se cobró por Calendly
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { guardarAjustesFinanzas } from '../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  await guardarAjustesFinanzas({ desde: b.desde, calendlyHasta: b.calendlyHasta })
  res.status(200).json({ ok: true, mensaje: 'Ajustes guardados.' })
})
