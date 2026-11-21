// Apuntar un gasto
import { Boton } from '../../../../components/admin/ui'
import Panel from '../../../../components/admin/Panel'
import { FormularioGasto } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { datosFormularioGasto } from '../../../../lib/finanzas/servicio'
import { fechaMadrid } from '../../../../lib/reservas/tiempo'

export default function NuevoGasto({ datos, hoy, volver, categoria }) {
  return (
    <Panel titulo="Añadir gasto" acciones={<Boton variante="secundario" href={volver}>Cancelar</Boton>}>
      <FormularioGasto datos={datos} hoy={hoy} volver={volver} categoriaInicial={categoria} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const datos = await datosFormularioGasto()
  const v = typeof ctx.query.volver === 'string' && ctx.query.volver.startsWith('/admin') ? ctx.query.volver : '/admin/movimientos'
  const c = /^\d+$/.test(String(ctx.query.categoria || '')) ? Number(ctx.query.categoria) : null
  return { props: { datos, hoy: fechaMadrid(new Date()), volver: v, categoria: datos.categorias.some((x) => x.id === c) ? c : null } }
}
