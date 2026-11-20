// Contadores del menú del panel: reservas de hoy y cosas por resolver de los miembros.
// GET, con sesión del panel. Si algo falla, devuelve ceros (el menú no debe romperse).
import { rutaAdmin } from '../../../lib/admin/api'
import { listarReservas } from '../../../lib/reservas/servicio'
import { listarSuscripciones } from '../../../lib/suscripciones/servicio'
import { fechaMadrid, madridAInstante, sumarDias } from '../../../lib/reservas/tiempo'

export async function contadoresDelMenu({ ahora = new Date() } = {}) {
  const hoy = fechaMadrid(ahora)
  const [reservas, subs] = await Promise.all([
    listarReservas({ desde: madridAInstante(hoy, '00:00'), hasta: madridAInstante(sumarDias(hoy, 1), '00:00') }).catch(() => []),
    listarSuscripciones({ ahora }).catch(() => ({ tareas: [] })),
  ])
  return { reservasHoy: reservas.length, miembros: subs.tareas.length }
}

export default rutaAdmin(async (req, res) => {
  res.status(200).json(await contadoresDelMenu())
}, { metodos: ['GET'], calendario: false })
