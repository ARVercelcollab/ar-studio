// Añadir. PROVISIONAL: accesos a cada formulario. La tanda de Añadir lo convierte en la pantalla del
// prototipo («Escribirlo | Formulario», con «Cómo decírselo» y «Añadido desde el panel»).
import Link from 'next/link'
import Panel from '../../components/admin/Panel'
import { Icono, Rejilla } from '../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'

const OPCIONES = [
  { href: '/admin/nueva', icono: 'cal', titulo: 'Una reserva', texto: 'Por horas o una sesión de un miembro.' },
  { href: '/admin/movimientos/gastos/nuevo?volver=/admin/anadir', icono: 'euro', titulo: 'Un gasto', texto: 'Una factura, un ticket o una compra.' },
  { href: '/admin/movimientos/ingresos/nuevo', icono: 'movs', titulo: 'Otro ingreso', texto: 'Un cobro que no pasa por las reservas.' },
  { href: '/admin/ajustes/bloqueos', icono: 'candado', titulo: 'Unas horas bloqueadas', texto: 'Para que nadie reserve en ese hueco.' },
  { href: '/admin/miembros/nueva', icono: 'gente', titulo: 'Un miembro', texto: 'Dar de alta una suscripción a mano.' },
]

export default function Anadir() {
  return (
    <Panel titulo="Añadir" sub="¿Qué quieres añadir?">
      <Rejilla columnas={2}>
        {OPCIONES.map((o) => (
          <Link key={o.href} href={o.href} className="ui-tarjeta adm-ajustes__enlace">
            <span className="adm-ajustes__icono"><Icono nombre={o.icono} /></span>
            <span>
              <b>{o.titulo}</b>
              <span>{o.texto}</span>
            </span>
            <Icono nombre="der" />
          </Link>
        ))}
      </Rejilla>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  return { props: {} }
}
