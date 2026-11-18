import Head from 'next/head'
import Reservador from '../components/reservas/Reservador'
import { reservasAbiertas } from '../lib/http'

export default function Reservar() {
  return (
    <>
      <Head>
        <title>Reservar el estudio | AR Studio</title>
        <meta name="description" content="Reserva AR Studio por horas en Valencia: elige duración, día y hora y paga online. Luz natural, fondo neutro y todo listo para tu sesión." />
        <link rel="canonical" href="https://www.studioar.es/reservar" />
      </Head>
      <main className="rsv">
        <h1>Reserva el estudio</h1>
        <p className="rsv__intro">Elige cuántas horas necesitas, el día y la hora. Pagas online y recibes la confirmación al momento en tu correo.</p>
        <Reservador />
      </main>
    </>
  )
}

// Mientras las reservas propias no estén abiertas en producción, se sigue usando Calendly
export async function getServerSideProps() {
  if (!reservasAbiertas()) return { redirect: { destination: 'https://calendly.com/ar-studio', permanent: false } }
  return { props: {} }
}
