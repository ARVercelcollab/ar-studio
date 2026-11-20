// Enlace del correo para entrar en el área de miembros (/miembros/entrar?t=…).
// No entra solo al abrirlo: hay que pulsar «Entrar» (los programas del correo que abren
// los enlaces para revisarlos no lo gastan).
import Head from 'next/head'
import { EntrarConEnlace } from '../../components/miembros/Entrada'

export default function Entrar({ token }) {
  return (
    <>
      <Head>
        <title>Entrar | Área de miembros | AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <EntrarConEnlace token={token} />
    </>
  )
}

export async function getServerSideProps(ctx) {
  ctx.res.setHeader('Cache-Control', 'private, no-store')
  const t = Array.isArray(ctx.query.t) ? ctx.query.t[0] : ctx.query.t
  return { props: { token: typeof t === 'string' && /^[A-Za-z0-9_-]{16,200}$/.test(t) ? t : null } }
}
