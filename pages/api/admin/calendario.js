// Calendario del estudio para suscribirse desde Google Calendar:
// /api/admin/calendario?clave=CALENDARIO_TOKEN
import crypto from 'node:crypto'
import { listarReservas, listarBloqueos } from '../../../lib/reservas/servicio.js'
import { icsEstudio } from '../../../lib/reservas/ics.js'
import { urlPanel } from '../../../lib/reservas/flujo.js'
import { urlBase } from '../../../lib/http.js'

function claveValida(clave) {
  const buena = process.env.CALENDARIO_TOKEN
  if (!buena || buena.length < 24 || typeof clave !== 'string') return false
  const a = crypto.createHash('sha256').update(clave).digest()
  const b = crypto.createHash('sha256').update(buena).digest()
  return crypto.timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  if (!claveValida(req.query.clave)) return res.status(404).send('No encontrado')
  const desde = new Date(Date.now() - 30 * 86400000)
  const hasta = new Date(Date.now() + 365 * 86400000)
  const [reservas, bloqueos] = await Promise.all([
    listarReservas({ desde, hasta, estados: ['confirmada', 'conflicto'] }),
    listarBloqueos({ desde }),
  ])
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.status(200).send(icsEstudio(reservas, bloqueos, urlPanel(urlBase(req))))
}
