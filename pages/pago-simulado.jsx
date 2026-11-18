// TPV de pruebas: imita la página del banco para probar sin cobrar. No existe en producción.
import Head from 'next/head'
import { simuladoPermitido } from '../lib/pagos/simulado'
import { formatoEuros } from '../lib/reservas/config'

export default function PagoSimulado({ campos }) {
  return (
    <>
      <Head>
        <title>TPV de pruebas | AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="rsv-sim">
        <h1>TPV de pruebas</h1>
        <p>Esto sustituye a la página del banco mientras probamos. No se cobra nada.</p>
        <p>{campos.concepto}</p>
        <p className="rsv-sim__importe">{formatoEuros(Number(campos.importe))}</p>
        {['ok', 'ko'].map((resultado) => (
          <form key={resultado} method="POST" action="/api/pagos/simulado">
            {Object.entries({ ...campos, resultado, firma: campos[`firma_${resultado}`] }).filter(([k]) => !k.startsWith('firma_') && k !== 'concepto').map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <button type="submit" className={`rsv__boton${resultado === 'ko' ? ' rsv__boton--claro' : ''}`}>{resultado === 'ok' ? 'Pagar (simulado)' : 'Rechazar el pago'}</button>
          </form>
        ))}
      </main>
    </>
  )
}

export async function getServerSideProps({ query }) {
  if (!simuladoPermitido()) return { notFound: true }
  const { firmaSimulada } = await import('../lib/pagos/simulado')
  const { pedido = '', importe = '', concepto = '', ok = '', ko = '', firma = '' } = query
  // La firma de la petición demuestra que el pago lo creó nuestra web
  if (firma !== firmaSimulada(pedido, importe)) return { notFound: true }
  return {
    props: {
      campos: {
        pedido, importe, concepto, ok, ko,
        firma_ok: firmaSimulada(pedido, importe, 'ok'),
        firma_ko: firmaSimulada(pedido, importe, 'ko'),
      },
    },
  }
}
