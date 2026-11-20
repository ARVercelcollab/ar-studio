// Reservas · Lista (la vista está en components/admin/reservas/VistaLista.jsx)
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { cargarLista } from '../../../components/admin/reservas/datos'

export { default } from '../../../components/admin/reservas/VistaLista'

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  return { props: await cargarLista(ctx.query, ctx.req) }
}
