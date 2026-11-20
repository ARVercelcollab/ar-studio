// Submenú de Ajustes (chips como en el prototipo): vuelve al resumen y salta entre los apartados.
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icono } from '../ui'

export const APARTADOS = [
  { href: '/admin/ajustes/fijos', texto: 'Gastos fijos' },
  { href: '/admin/ajustes/google', texto: 'Google Calendar' },
  { href: '/admin/ajustes/calendly', texto: 'Calendly' },
  { href: '/admin/ajustes/festivos', texto: 'Festivos' },
  { href: '/admin/ajustes/bloqueos', texto: 'Bloqueos' },
]

export default function SubmenuAjustes() {
  const { pathname } = useRouter()
  return (
    <nav className="adm-ajustes__submenu" aria-label="Apartados de Ajustes">
      <Link href="/admin/ajustes" className="adm-ajustes__volver"><Icono nombre="izq" />Ajustes</Link>
      {APARTADOS.map((a) => (
        <Link key={a.href} href={a.href} className="adm-ajustes__chip" aria-current={pathname === a.href ? 'page' : undefined}>{a.texto}</Link>
      ))}
    </nav>
  )
}
