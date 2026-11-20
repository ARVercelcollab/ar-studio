// SOLO EN ESTE ORDENADOR: el área de miembros con datos inventados, para revisar el diseño
// sin servidor ni sesión. ?caso=normal|sin-horas|impago|contrato|fianza|usada|entrada|entrar|
// reservar|reservar-extra|cambiar|pago-ko. En producción y en Vercel no existe (404).
import Head from 'next/head'
import Link from 'next/link'
import { useMemo } from 'react'
import Area, { avisoDeVuelta } from '../../components/miembros/Area'
import Entrada, { EntrarConEnlace } from '../../components/miembros/Entrada'
import Reservar from '../../components/miembros/Reservar'
import { CASOS, apiMuestra } from '../../components/miembros/muestra'

export default function MuestraMiembros({ caso, datos }) {
  const api = useMemo(() => apiMuestra(caso), [caso])
  let pantalla
  if (caso === 'entrada') pantalla = <Entrada />
  else if (caso === 'entrar') pantalla = <EntrarConEnlace token="token-de-muestra-0000" />
  else if (['reservar', 'reservar-extra', 'cambiar'].includes(caso)) pantalla = <Reservar key={caso} {...datos} api={api} />
  else pantalla = <Area key={caso} {...datos} aviso={caso === 'pago-ko' ? avisoDeVuelta({ pago: 'ko' }) : null} />
  return (
    <>
      <Head>
        <title>Muestra · Área de miembros</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <nav className="mbr-muestra" aria-label="Casos de la muestra">
        <span>Muestra (datos inventados):</span>
        {Object.entries(CASOS).map(([id, t]) => (
          <Link key={id} href={`/miembros/muestra-local?caso=${id}`} className={id === caso ? 'is-activo' : undefined}>{t}</Link>
        ))}
      </nav>
      {pantalla}
    </>
  )
}

export async function getServerSideProps(ctx) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return { notFound: true }
  const { datosMuestra, reservarMuestra } = await import('../../components/miembros/muestra')
  const { fechaMadrid } = await import('../../lib/reservas/tiempo')
  const caso = Object.keys(CASOS).includes(ctx.query.caso) ? ctx.query.caso : 'normal'
  const hoy = fechaMadrid(new Date())
  const datos = ['reservar', 'reservar-extra', 'cambiar'].includes(caso) ? reservarMuestra(caso, hoy) : datosMuestra(caso, hoy)
  return { props: { caso, datos: JSON.parse(JSON.stringify(datos)) } }
}
