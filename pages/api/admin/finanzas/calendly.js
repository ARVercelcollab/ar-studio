// Lo cobrado por Calendly (Stripe) en un mes
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { guardarCalendlyMes, borrarCalendlyMes } from '../../../../lib/finanzas/servicio.js'
import { leerImporte, textoMes } from '../../../../lib/finanzas/calculos.js'
import { ErrorReserva } from '../../../../lib/reservas/servicio.js'

const cent = (v) => {
  const c = leerImporte(v)
  if (Number.isNaN(c)) throw new ErrorReserva('importe', 'Revisa los importes.', 400)
  return c ?? 0
}

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  if (b.accion === 'borrar') {
    await borrarCalendlyMes(b.mes)
    return res.status(200).json({ ok: true, mensaje: 'Borrado.' })
  }
  await guardarCalendlyMes({
    mes: b.mes, cobradoCent: cent(b.cobrado), devueltoCent: cent(b.devuelto), comisionCent: cent(b.comision), enlace: b.enlace, nota: b.nota, version: b.version,
  })
  res.status(200).json({ ok: true, mensaje: `Calendly de ${textoMes(b.mes, { soloNombre: true })} guardado.` })
})
