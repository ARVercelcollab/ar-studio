// Antes era la lista de Gastos: ahora todo está en Movimientos (filtrado por lo que sale).
// Se mantiene para que los enlaces de antes (y los avisos) sigan funcionando.
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { GRUPOS } from '../../../../lib/finanzas/config'

export default function Gastos() {
  return null
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const q = new URLSearchParams()
  if (typeof ctx.query.p === 'string' && /^\d{4}(-\d{2}|-T[1-4])?$/.test(ctx.query.p)) q.set('p', ctx.query.p)
  const grupo = GRUPOS.some(([g]) => g === ctx.query.grupo) ? ctx.query.grupo : null
  q.set('tipo', grupo === 'fijo' ? 'fijos' : 'sale')
  if (/^\d+$/.test(String(ctx.query.categoria || ''))) q.set('cat', `c:${ctx.query.categoria}`)
  if (typeof ctx.query.ok === 'string' && /^(gasto|cambiado):\d+$|^borrado$/.test(ctx.query.ok)) q.set('ok', ctx.query.ok)
  return { redirect: { destination: `/admin/movimientos?${q.toString()}`, permanent: false } }
}
