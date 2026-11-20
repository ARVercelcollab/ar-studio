// Reservar una sesión del plan (/miembros/reservar) o cambiar una (?cambiar=CODIGO).
import Head from 'next/head'
import Reservar from '../../components/miembros/Reservar'

export default function PaginaReservar({ datos }) {
  return (
    <>
      <Head>
        <title>{datos.cambiando ? 'Cambiar la sesión' : 'Reservar sesión'} | Área de miembros | AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Reservar {...datos} />
    </>
  )
}

const aJson = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)))

export async function getServerSideProps(ctx) {
  ctx.res.setHeader('Cache-Control', 'private, no-store')
  const { areaAbierta } = await import('../../lib/miembros/api')
  if (!areaAbierta()) return { redirect: { destination: '/miembros', permanent: false } }
  const { redirigirSiNoMiembro, miembroDeLaPeticion } = await import('../../lib/miembros/acceso')
  const redir = await redirigirSiNoMiembro(ctx)
  if (redir) return redir
  const { datosReservar } = await import('../../lib/miembros/area')
  const miembro = await miembroDeLaPeticion(ctx.req)
  const cambiar = typeof ctx.query.cambiar === 'string' ? ctx.query.cambiar : null
  const datos = miembro ? await datosReservar(miembro.email, { codigo: cambiar }) : null
  if (!datos) return { redirect: { destination: '/miembros', permanent: false } }
  // Si pide cambiar una sesión que no es suya o ya no se puede cambiar, a su área
  if (cambiar && !datos.cambiando) return { redirect: { destination: '/miembros', permanent: false } }
  return { props: { datos: aJson(datos) } }
}
