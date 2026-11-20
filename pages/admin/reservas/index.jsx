// Reservas · Calendario (la vista está en components/admin/reservas/VistaCalendario.jsx)
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { cargarCalendario } from '../../../components/admin/reservas/datos'

export { default } from '../../../components/admin/reservas/VistaCalendario'

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  return { props: await cargarCalendario(ctx.query) }
}
