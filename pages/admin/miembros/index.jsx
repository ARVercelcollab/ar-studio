// Miembros (/admin/miembros). La pantalla está en components/admin/miembros/PantallaMiembros.
import PantallaMiembros, { VISTAS } from '../../../components/admin/miembros/PantallaMiembros'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarSuscripciones } from '../../../lib/suscripciones/servicio'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

export default PantallaMiembros

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const modo = ctx.query.modo === 'tablero' ? 'tablero' : 'lista'
  // El tablero enseña a quien sigue (activas y bajas avisadas)
  const vista = modo === 'lista' && VISTAS.some(([v]) => v === ctx.query.vista) ? ctx.query.vista : 'activas'
  const { filas, cifras, tareas } = await listarSuscripciones({ vista })
  return {
    props: {
      modo, vista, filas, cifras, tareas,
      hoy: fechaMadrid(new Date()),
      ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null,
    },
  }
}
