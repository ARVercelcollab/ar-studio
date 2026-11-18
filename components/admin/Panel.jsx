import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'

import { TEXTOS_CHIP_CUOTA } from '../../lib/suscripciones/reglas'
import { textoDuracion } from '../../lib/reservas/config'

const MENU = [
  ['/admin', 'Agenda'],
  ['/admin/nueva', 'Nueva reserva'],
  ['/admin/suscripciones', 'Suscripciones'],
  ['/admin/bloqueos', 'Bloqueos'],
  ['/admin/festivos', 'Festivos'],
]

const activo = (href, pathname) => (href === '/admin' ? pathname === '/admin' || pathname.startsWith('/admin/reserva') : pathname.startsWith(href))

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
              <Link key={href} href={href} className={activo(href, pathname) ? 'is-activo' : ''}>{texto}</Link>
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
  if (r.estado === 'cancelada') return <Chip tipo="gris">{r.cuentaComoUsada ? 'Cancelada (cuenta)' : 'Cancelada'}</Chip>
  if (r.estado === 'caducada') return <Chip tipo="gris">Caducada</Chip>
  if (r.estado === 'pendiente') return <Chip tipo="aviso">Pagando…</Chip>
  if (r.esPlan) return r.pagoEstado === 'pagado' ? <Chip tipo="plan">{r.planTexto || 'Suscripción'}</Chip> : <Chip tipo="aviso">Extra sin pagar</Chip>
  if (r.pagoEstado === 'pagado') return <Chip tipo="ok">Pagada</Chip>
  return <Chip tipo="aviso">Sin pagar</Chip>
}

// Botones de opción; el elegido, en marrón
export function Segmento({ opciones, valor, onCambio }) {
  return (
    <div className="adm-segmento" role="radiogroup">
      {opciones.map(([v, texto]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} className={valor === v ? 'is-activo' : ''} onClick={() => onCambio(v)}>{texto}</button>
      ))}
    </div>
  )
}

const TIPO_CHIP_CUOTA = { pagada: 'ok', sin_pagar: 'aviso', atrasada: 'error', proxima: 'gris', sin_cargo: 'gris', anulada: 'gris', devuelta: 'gris' }

export function ChipCuota({ chip }) {
  return <Chip tipo={TIPO_CHIP_CUOTA[chip] || 'gris'}>{TEXTOS_CHIP_CUOTA[chip] || chip}</Chip>
}

export function BarraHoras({ usadas, total, conTexto = true }) {
  const pct = total > 0 ? Math.min(100, Math.round((usadas / total) * 100)) : 0
  const libres = Math.max(0, total - usadas)
  return (
    <div className="adm-barra-horas">
      <div className="adm-barra-horas__pista"><div style={{ width: `${pct}%` }} /></div>
      {conTexto && <span>{textoDuracion(libres, { corto: true })} libres de {textoDuracion(total, { corto: true })}</span>}
    </div>
  )
}
