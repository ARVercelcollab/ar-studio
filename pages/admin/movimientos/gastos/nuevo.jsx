// Apuntar un gasto
import Link from 'next/link'
import Panel from '../../../../components/admin/Panel'
import { SubmenuFinanzas, FormularioGasto } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { datosFormularioGasto } from '../../../../lib/finanzas/servicio'
import { fechaMadrid } from '../../../../lib/reservas/tiempo'

export default function NuevoGasto({ datos, hoy, volver, categoria }) {
  return (
    <Panel titulo="Apuntar gasto" acciones={<Link href={volver} className="adm-boton adm-boton--claro">Cancelar</Link>}>
      <SubmenuFinanzas />
      <FormularioGasto datos={datos} hoy={hoy} volver={volver} categoriaInicial={categoria} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const datos = await datosFormularioGasto()
  const v = typeof ctx.query.volver === 'string' && ctx.query.volver.startsWith('/admin') ? ctx.query.volver : '/admin/movimientos/gastos'
  const c = /^\d+$/.test(String(ctx.query.categoria || '')) ? Number(ctx.query.categoria) : null
  return { props: { datos, hoy: fechaMadrid(new Date()), volver: v, categoria: datos.categorias.some((x) => x.id === c) ? c : null } }
}
