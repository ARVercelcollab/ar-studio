// Modelo del contrato de suscripción, para leerlo antes de pagar (sin datos de nadie)
import Head from 'next/head'
import Link from 'next/link'
import TextoContrato from '../../components/suscripciones/TextoContrato'
import { PLANES } from '../../lib/reservas/config'

export default function ModeloContrato({ t, plan }) {
  return (
    <>
      <Head>
        <title>Modelo de contrato · Plan {PLANES[plan].nombre} | AR Studio</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rsv rsv-ficha" style={{ maxWidth: 760 }}>
        <p className="rsv__nota" style={{ marginTop: 0, marginBottom: 16 }}>
          Este es el modelo del contrato del plan {PLANES[plan].nombre}. Al darte de alta lo rellenas con tus datos y lo firmas en la web.
          {' '}Otros planes: {Object.entries(PLANES).filter(([id]) => id !== plan).map(([id, x], i) => (
            <span key={id}>{i ? ' · ' : ''}<Link className="rsv-enlace" href={`/planmensual/contrato?plan=${id}`}>{x.nombre}</Link></span>
          ))}
        </p>
        <TextoContrato t={t} completo />
        <p style={{ marginTop: 24 }}><Link className="rsv__boton" href={`/planmensual/alta?plan=${plan}`} style={{ maxWidth: 320 }}>Hacerme miembro</Link></p>
      </main>
    </>
  )
}

export async function getServerSideProps({ query }) {
  const { contratoSecciones, condicionesModelo, firmanteEstudio } = await import('../../lib/suscripciones/contrato')
  const plan = typeof query.plan === 'string' && PLANES[query.plan] ? query.plan : 'creator'
  // En el modelo público solo el nombre de quien firma por el estudio (nunca su NIF ni la cuenta)
  const t = contratoSecciones({ c: condicionesModelo(plan), estudio: { nombre: firmanteEstudio().nombre, nif: null }, iban: null })
  return { props: { t, plan } }
}
