// Apuntar otro ingreso o una devolución
import Link from 'next/link'
import Panel from '../../../../components/admin/Panel'
import { FormularioIngreso } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { reservasParaIngreso } from '../../../../lib/finanzas/servicio'
import { fechaMadrid } from '../../../../lib/reservas/tiempo'

export default function NuevoIngreso({ hoy, reservas, reserva, sentido }) {
  return (
    <Panel titulo="Apuntar otro ingreso" acciones={<Link href="/admin/movimientos" className="adm-boton adm-boton--claro">Cancelar</Link>}>
      <FormularioIngreso hoy={hoy} reservas={reservas} reservaInicial={reserva} sentidoInicial={sentido} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const r = /^\d+$/.test(String(ctx.query.reserva || '')) ? Number(ctx.query.reserva) : null
  // La reserva del aviso sale en la lista aunque no sea de los últimos 30 días
  const reservas = await reservasParaIngreso({ hoy, incluir: r })
  return { props: { hoy, reservas, reserva: reservas.some((x) => x.id === r) ? r : null, sentido: ctx.query.sentido === 'devolucion' ? 'devolucion' : 'cobro' } }
}
