// Ajustes. PROVISIONAL: enlaces a cada apartado. La tanda de Ajustes lo convierte en una sola
// pantalla con secciones (precios y reglas, planes, gastos fijos, Google Calendar, Calendly, festivos).
import Link from 'next/link'
import Panel from '../../../components/admin/Panel'
import { Icono, Rejilla } from '../../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'

const APARTADOS = [
  { href: '/admin/ajustes/fijos', icono: 'euro', titulo: 'Gastos fijos', texto: 'Alquiler, internet, luz, agua, Aquaservice, alarma: los que se apuntan solos cada mes.' },
  { href: '/admin/ajustes/google', icono: 'cal', titulo: 'Google Calendar', texto: 'Que cada reserva salga en el calendario del estudio.' },
  { href: '/admin/ajustes/calendly', icono: 'tarjeta', titulo: 'Calendly', texto: 'Lo cobrado por Calendly cada mes, mientras se siga usando.' },
  { href: '/admin/ajustes/festivos', icono: 'reloj', titulo: 'Festivos', texto: 'Los días que cuentan como fin de semana.' },
  { href: '/admin/ajustes/bloqueos', icono: 'candado', titulo: 'Bloqueos', texto: 'Horas en las que no se puede reservar.' },
]

export default function Ajustes() {
  return (
    <Panel titulo="Ajustes" sub="Precios, planes, gastos fijos, calendario y festivos.">
      <Rejilla columnas={2}>
        {APARTADOS.map((a) => (
          <Link key={a.href} href={a.href} className="ui-tarjeta adm-ajustes__enlace">
            <span className="adm-ajustes__icono"><Icono nombre={a.icono} /></span>
            <span>
              <b>{a.titulo}</b>
              <span>{a.texto}</span>
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
