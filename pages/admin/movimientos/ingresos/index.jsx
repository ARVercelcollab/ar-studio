// Antes era la lista de Facturación: ahora todo está en Movimientos (filtrado por lo que entra).
// Las facturas del trimestre están en Impuestos; lo de Calendly, en Ajustes; lo que falta por
// cobrar, en el Inicio. Se mantiene para que los enlaces de antes sigan funcionando.
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'

export default function Facturacion() {
  return null
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const q = new URLSearchParams()
  if (typeof ctx.query.p === 'string' && /^\d{4}(-\d{2}|-T[1-4])?$/.test(ctx.query.p)) q.set('p', ctx.query.p)
  if (ctx.query.filtro === 'devoluciones') q.set('cat', 'devolucion')
  else q.set('tipo', 'entra')
  if (typeof ctx.query.ok === 'string' && /^ingreso:\d+$|^borrado$/.test(ctx.query.ok)) q.set('ok', ctx.query.ok)
  return { redirect: { destination: `/admin/movimientos?${q.toString()}`, permanent: false } }
}
