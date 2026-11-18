import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'

const MENU = [
  ['/admin', 'Agenda'],
  ['/admin/nueva', 'Nueva reserva'],
  ['/admin/bloqueos', 'Bloqueos'],
  ['/admin/festivos', 'Festivos'],
]

export default function Panel({ titulo, children, acciones }) {
  const { pathname } = useRouter()
  return (
    <>
      <Head>
        <title>{`${titulo} · Panel AR Studio`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="adm">
        <header className="adm__barra">
          <Link href="/admin" className="adm__marca">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/AR_Studio_blanco.svg" alt="AR Studio" />
            <span>Panel</span>
          </Link>
          <nav>
            {MENU.map(([href, texto]) => (
              <Link key={href} href={href} className={pathname === href ? 'is-activo' : ''}>{texto}</Link>
            ))}
            <form method="POST" action="/api/admin/logout"><button type="submit">Salir</button></form>
          </nav>
        </header>
        <main className="adm__cuerpo">
          <div className="adm__cabecera">
            <h1>{titulo}</h1>
            {acciones}
          </div>
          {children}
        </main>
      </div>
    </>
  )
}

export function Chip({ tipo, children }) {
  return <span className={`adm-chip adm-chip--${tipo}`}>{children}</span>
}

export function chipEstado(r) {
  if (r.estado === 'conflicto') return <Chip tipo="error">Revisar pago</Chip>
  if (r.estado === 'cancelada') return <Chip tipo="gris">Cancelada</Chip>
  if (r.estado === 'caducada') return <Chip tipo="gris">Caducada</Chip>
  if (r.estado === 'pendiente') return <Chip tipo="aviso">Pagando…</Chip>
  if (r.pagoEstado === 'pagado') return <Chip tipo="ok">Pagada</Chip>
  return <Chip tipo="aviso">Sin pagar</Chip>
}
