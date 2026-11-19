// Pagar la cuota de un mes de suscripción (el enlace llega por correo al empezar el mes)
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { ESTUDIO, formatoEuros } from '../../lib/reservas/config'
import { textoFechaCorta } from '../../lib/reservas/tiempo'
import { irAlTpv, pedirJson } from '../../lib/reservas/navegador'

const wa = `https://wa.me/${ESTUDIO.whatsapp}`

export default function PaginaCuota({ token, pago, cuota, sus, pagable }) {
  const router = useRouter()
  const [intentos, setIntentos] = useState(0)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(false)
  const esperando = pago === 'ok' && cuota.estado === 'pendiente'
  // Al volver del banco el pago puede tardar unos segundos en llegar
  useEffect(() => {
    if (!esperando || intentos >= 15) return
    const t = setTimeout(() => {
      setIntentos((n) => n + 1)
      router.replace(router.asPath, undefined, { scroll: false })
    }, 4000)
    return () => clearTimeout(t)
  }, [esperando, intentos, router])

  const pagar = async () => {
    setPagando(true)
    setError(null)
    try {
      const r = await pedirJson(`/api/suscripciones/cuota/${token}`, { method: 'POST', body: {} })
      irAlTpv(r.pago)
    } catch (e) {
      setPagando(false)
      setError(e.message)
    }
  }

  const etiqueta = cuota.estado === 'pagada' ? ['Pagada', 'is-ok'] : esperando ? ['Confirmando el pago', 'is-aviso'] : cuota.estado === 'pendiente' ? ['Pendiente de pago', 'is-aviso'] : ['Sin pago pendiente', '']
  return (
    <>
      <Head><title>Cuota de tu suscripción | AR Studio</title><meta name="robots" content="noindex, nofollow" /></Head>
      <main className="rsv rsv-ficha">
        <span className={`rsv-ficha__estado ${etiqueta[1]}`}>{etiqueta[0]}</span>
        <h1>Tu cuota</h1>
        {cuota.estado === 'pagada' && <p className="rsv__alerta is-ok">Pagada el {textoFechaCorta(cuota.pagadaEn)}. Te hemos enviado la factura por correo. ¡Gracias!</p>}
        {esperando && <p className="rsv__intro"><span className="rsv__spinner" />Estamos esperando la confirmación del banco…</p>}
        {pago === 'ko' && cuota.estado === 'pendiente' && <p className="rsv__alerta is-error">El pago no se ha completado. No se ha cobrado nada: puedes intentarlo de nuevo.</p>}
        <dl>
          <dt>Suscripción</dt>
          <dd>{sus.codigo} · plan {cuota.planNombre}</dd>
          <dt>Mes</dt>
          <dd>{cuota.texto}</dd>
          <dt>Importe</dt>
          <dd>{formatoEuros(cuota.importeCent)} (IVA incluido)</dd>
        </dl>
        {error && <p className="rsv__alerta is-error">{error}</p>}
        {pagable && !esperando && (
          <button type="button" className="rsv__boton" style={{ maxWidth: 320 }} disabled={pagando} onClick={pagar}>
            {pagando ? 'Abriendo el pago…' : `Pagar ${formatoEuros(cuota.importeCent)}`}
          </button>
        )}
        {cuota.estado !== 'pagada' && !pagable && <p className="rsv__nota">Esta cuota ya no se puede pagar desde aquí.</p>}
        <p className="rsv__nota">Pagas con tarjeta o Bizum en la pasarela segura del banco. ¿Dudas? Escríbenos por <a className="rsv-enlace" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
      </main>
    </>
  )
}

export async function getServerSideProps({ params, query, res }) {
  res.setHeader('Cache-Control', 'no-store')
  const { paginaCuota } = await import('../../lib/suscripciones/alta')
  const p = await paginaCuota(params.token)
  if (!p) return { notFound: true }
  const { cuota, sus, pagable } = p
  return {
    props: {
      token: params.token,
      pago: typeof query.pago === 'string' ? query.pago : null,
      cuota: { estado: cuota.estado, importeCent: cuota.importeCent, planNombre: cuota.planNombre, texto: cuota.texto, pagadaEn: cuota.pagadaEn },
      sus: { codigo: sus.codigo },
      pagable,
    },
  }
}
