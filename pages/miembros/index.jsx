// Área de miembros (/miembros). Sin sesión: pedir el enlace de entrada por correo.
// Con sesión: sus horas del mes, sus sesiones, pagos y facturas, y su plan.
import Head from 'next/head'
import Entrada from '../../components/miembros/Entrada'
import Area, { avisoDeVuelta } from '../../components/miembros/Area'

export default function Miembros({ area, aviso, avisoEntrada, cerrada = false }) {
  return (
    <>
      <Head>
        <title>Área de miembros | AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {area ? <Area {...area} aviso={aviso} /> : <Entrada aviso={avisoEntrada} cerrada={cerrada} />}
    </>
  )
}

// Fechas y demás a JSON (las props de Next no admiten Date)
const aJson = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)))

export async function getServerSideProps(ctx) {
  ctx.res.setHeader('Cache-Control', 'private, no-store')
  // Mientras las reservas propias no estén abiertas, el área tampoco (las rutas dan 503)
  const { areaAbierta } = await import('../../lib/miembros/api')
  if (!areaAbierta()) return { props: { area: null, aviso: null, avisoEntrada: null, cerrada: true } }
  const { miembroDeLaPeticion } = await import('../../lib/miembros/acceso')
  const { datosArea } = await import('../../lib/miembros/area')
  const miembro = await miembroDeLaPeticion(ctx.req)
  const area = miembro ? await datosArea(miembro.email) : null
  // Con la cookie pero sin plan visible (p. ej. terminó hace tiempo): como sin sesión
  const avisoEntrada = miembro && !area
    ? { tono: 'aviso', texto: 'No encontramos un plan activo con tu correo. Si crees que es un error, escríbenos.' }
    : null
  return { props: { area: aJson(area), aviso: avisoDeVuelta(ctx.query), avisoEntrada } }
}
