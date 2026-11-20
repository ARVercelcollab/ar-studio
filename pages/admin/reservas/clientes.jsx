// Reservas · Clientes. PROVISIONAL: la tanda de Reservas la rellena (una ficha por persona que ha
// reservado, agrupando sus reservas por correo o teléfono; ver panel-prototipo/README.md).
import Panel from '../../../components/admin/Panel'
import VistasReservas from '../../../components/admin/reservas/VistasReservas'
import { Boton, Tarjeta, Vacio } from '../../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'

export default function Clientes() {
  return (
    <Panel titulo="Reservas" sub="Cada persona que ha reservado en el estudio, con todas sus reservas." acciones={<><VistasReservas /><Boton href="/admin/nueva" icono="mas">Nueva reserva</Boton></>}>
      <Tarjeta>
        <Vacio icono="persona" texto="Aquí saldrá la lista de clientes, con la ficha de cada uno. Está en preparación." />
      </Tarjeta>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  return { props: {} }
}
