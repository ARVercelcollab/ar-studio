// Cambiar o borrar otro ingreso
import Link from 'next/link'
import { useRouter } from 'next/router'
import Panel from '../../../../components/admin/Panel'
import { SubmenuFinanzas, FormularioIngreso, useAccion, Mensaje } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { fichaIngreso, reservasParaIngreso } from '../../../../lib/finanzas/servicio'
import { fechaMadrid } from '../../../../lib/reservas/tiempo'

const aTexto = (cent) => (cent / 100).toFixed(2).replace('.', ',')

export default function FichaIngreso({ ingreso, hoy, reservas }) {
  const router = useRouter()
  const [estado, ejecutar] = useAccion()
  const i = ingreso
  const inicial = {
    tipo: i.tipo, sentido: i.sentido, fecha: i.fecha, concepto: i.concepto, importe: aTexto(i.totalCent), ivaPct: i.ivaPct ?? 'mano', iva: i.ivaPct === null ? aTexto(i.ivaCent) : '',
    reservaId: i.reservaId ? String(i.reservaId) : '', facturaRef: i.facturaRef, clienteNombre: i.clienteNombre, clienteNif: i.clienteNif, metodoPago: i.metodoPago || '', enlace: i.enlace || '', nota: i.nota,
  }
  const lista = i.reservaId && !reservas.some((r) => r.id === i.reservaId) ? [{ id: i.reservaId, texto: i.reservaCodigo || `Reserva ${i.reservaId}` }, ...reservas] : reservas
  return (
    <Panel titulo="Cambiar ingreso" acciones={<Link href={`/admin/movimientos/ingresos?p=${i.fecha.slice(0, 7)}`} className="adm-boton adm-boton--claro">← Facturación</Link>}>
      <SubmenuFinanzas />
      <FormularioIngreso hoy={hoy} reservas={lista} inicial={inicial} ingreso={i} />
      <div className="adm-caja">
        <Mensaje estado={estado} />
        <button type="button" className="adm-boton adm-boton--peligro" disabled={estado.enviando} onClick={() => {
          if (window.confirm('¿Borrar este ingreso?')) ejecutar(`/api/admin/finanzas/ingresos/${i.id}`, { accion: 'borrar', version: i.version }, { despues: () => router.push('/admin/movimientos/ingresos?ok=borrado') })
        }}>Borrar</button>
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const ingreso = await fichaIngreso(ctx.params.id)
  if (!ingreso) return { notFound: true }
  const hoy = fechaMadrid(new Date())
  return { props: JSON.parse(JSON.stringify({ ingreso, hoy, reservas: await reservasParaIngreso({ hoy }) })) }
}
