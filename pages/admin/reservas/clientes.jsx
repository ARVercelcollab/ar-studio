// Reservas · Clientes (la vista está en components/admin/reservas/VistaClientes.jsx)
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { cargarClientes } from '../../../components/admin/reservas/datos'

export { default } from '../../../components/admin/reservas/VistaClientes'

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  return { props: await cargarClientes(ctx.query) }
}
