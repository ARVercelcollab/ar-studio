// Conmutador de Reservas: Calendario | Lista | Clientes (cada vista es su propia página)
import { useRouter } from 'next/router'
import Conmutador from '../ui/Conmutador'

export const VISTAS_RESERVAS = [
  { valor: 'calendario', texto: 'Calendario', icono: 'cal', href: '/admin/reservas' },
  { valor: 'lista', texto: 'Lista', icono: 'lista', href: '/admin/reservas/lista' },
  { valor: 'clientes', texto: 'Clientes', icono: 'persona', href: '/admin/reservas/clientes' },
]

export function vistaDeRuta(pathname) {
  if (pathname.startsWith('/admin/reservas/lista')) return 'lista'
  if (pathname.startsWith('/admin/reservas/clientes')) return 'clientes'
  return 'calendario'
}

export default function VistasReservas() {
  const { pathname } = useRouter()
  return <Conmutador etiqueta="Vista de las reservas" valor={vistaDeRuta(pathname)} opciones={VISTAS_RESERVAS} />
}
