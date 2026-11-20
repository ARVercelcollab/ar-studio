// SOLO EN ESTE ORDENADOR: las vistas de Reservas con los datos de la base local, sin entrar en
// el panel, para revisarlas. ?vista=calendario|lista|clientes (y los mismos filtros que la vista).
// En producción no existe (404).
import VistaCalendario from '../../../components/admin/reservas/VistaCalendario'
import VistaLista from '../../../components/admin/reservas/VistaLista'
import VistaClientes from '../../../components/admin/reservas/VistaClientes'

export default function MuestraReservas({ vista, datos }) {
  if (vista === 'lista') return <VistaLista {...datos} />
  if (vista === 'clientes') return <VistaClientes {...datos} />
  return <VistaCalendario {...datos} />
}

export async function getServerSideProps(ctx) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return { notFound: true }
  const { cargarCalendario, cargarLista, cargarClientes } = await import('../../../components/admin/reservas/datos')
  const vista = ['lista', 'clientes'].includes(ctx.query.vista) ? ctx.query.vista : 'calendario'
  const datos = vista === 'lista' ? await cargarLista(ctx.query, ctx.req) : vista === 'clientes' ? await cargarClientes(ctx.query) : await cargarCalendario(ctx.query)
  return { props: { vista, datos } }
}
