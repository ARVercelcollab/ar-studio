// Alta a mano de una suscripción (/admin/miembros/nueva). La pantalla está en components/admin/miembros/AltaMiembro.
import AltaMiembro from '../../../components/admin/miembros/AltaMiembro'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

export default AltaMiembro

export async function getServerSideProps(ctx) {
  return redirigirSiNoAdmin(ctx) || { props: { hoy: fechaMadrid(new Date()) } }
}
