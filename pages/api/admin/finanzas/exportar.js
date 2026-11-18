// CSV para la gestoría (ingresos, gastos o facturas emitidas de un periodo)
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { exportarCsv } from '../../../../lib/finanzas/servicio.js'
import { leerPeriodo } from '../../../../lib/finanzas/calculos.js'
import { fechaMadrid } from '../../../../lib/reservas/tiempo.js'

export default rutaAdmin(async (req, res) => {
  const periodo = leerPeriodo(req.query.p, fechaMadrid(new Date()))
  if (!periodo) return res.status(400).json({ error: 'periodo', mensaje: 'Periodo no válido.' })
  const { nombre, contenido } = await exportarCsv(periodo, { tipo: req.query.tipo })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`)
  res.status(200).send(`﻿${contenido}`)
}, { metodos: ['GET'] })
