// Página privada de cada reserva (el enlace va en el correo de confirmación)
import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { reservaPorToken } from '../../lib/reservas/servicio'
import { vistaPublica } from '../../lib/reservas/publico'
import { ESTUDIO, TEXTO_CANCELACION } from '../../lib/reservas/config'
import { irAlTpv, pedirJson } from '../../lib/reservas/navegador'

const ETIQUETAS = {
  confirmada: ['Confirmada', 'is-ok'],
  pendiente: ['Pendiente de pago', 'is-aviso'],
  caducada: ['Sin pagar', 'is-error'],
  conflicto: ['Pago en revisión', 'is-aviso'],
  cancelada: ['Cancelada', 'is-error'],
}

function enlaceGoogle(r) {
  const f = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const fin = new Date(new Date(r.inicioIso).getTime() + r.duracionHoras * 3600000).toISOString()
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `Estudio AR Studio (${r.duracionHoras} h)`, dates: `${f(r.inicioIso)}/${f(fin)}`, location: r.direccion, details: `Reserva ${r.codigo}` })
  return `https://calendar.google.com/calendar/render?${p}`
}

export default function PaginaReserva({ inicial, token, pago }) {
  const [r, setR] = useState(inicial)
  const [esperando, setEsperando] = useState(inicial.estado === 'pendiente' && pago === 'ok')
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(false)
  const [solicitud, setSolicitud] = useState({ abierta: false, tipo: 'cambiar', mensaje: '', enviada: false, enviando: false })

  // Al volver del banco el pago puede tardar unos segundos en llegar
  useEffect(() => {
    if (!esperando) return
    let intentos = 0
    const t = setInterval(async () => {
      intentos++
      try {
        const nuevo = await pedirJson(`/api/reservas/${token}`)
        setR(nuevo)
        if (nuevo.estado !== 'pendiente' || intentos >= 20) {
          clearInterval(t)
          setEsperando(false)
        }
      } catch {
        if (intentos >= 20) {
          clearInterval(t)
          setEsperando(false)
        }
      }
    }, 2000)
    return () => clearInterval(t)
  }, [esperando, token])

  async function reintentar() {
    setPagando(true)
    setError(null)
    try {
      const x = await pedirJson(`/api/reservas/${token}/pagar`, { method: 'POST', body: {} })
      irAlTpv(x.pago)
    } catch (e) {
      setPagando(false)
      setError(e.message)
    }
  }

  async function enviarSolicitud(e) {
    e.preventDefault()
    setSolicitud((s) => ({ ...s, enviando: true }))
    try {
      await pedirJson(`/api/reservas/${token}/solicitud`, { method: 'POST', body: { tipo: solicitud.tipo, mensaje: solicitud.mensaje } })
      setSolicitud((s) => ({ ...s, enviando: false, enviada: true }))
    } catch (err) {
      setSolicitud((s) => ({ ...s, enviando: false }))
      setError(err.message)
    }
  }

  const [etiqueta, clase] = ETIQUETAS[r.estado] || ['', '']
  const wa = `https://wa.me/${ESTUDIO.whatsapp}?text=${encodeURIComponent(`Hola, tengo la reserva ${r.codigo} (${r.franja}).`)}`

  return (
    <>
      <Head>
        <title>Reserva {r.codigo} | AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="rsv">
        <div className="rsv-ficha">
          <span className={`rsv-ficha__estado ${clase}`}>{etiqueta}</span>

          {r.estado === 'confirmada' && <h1>¡Reserva confirmada!</h1>}
          {r.estado === 'pendiente' && <h1>{esperando ? 'Confirmando el pago' : 'Falta el pago'}</h1>}
          {r.estado === 'caducada' && <h1>La reserva no se llegó a pagar</h1>}
          {r.estado === 'conflicto' && <h1>Estamos revisando tu pago</h1>}
          {r.estado === 'cancelada' && <h1>Reserva cancelada</h1>}

          {r.estado === 'confirmada' && <p className="rsv__intro">Gracias, {r.nombre}. Te hemos mandado la confirmación a {r.email}.</p>}
          {r.estado === 'pendiente' && esperando && (
            <p className="rsv__intro"><span className="rsv__spinner" />El banco nos está confirmando el pago. Esto tarda unos segundos.</p>
          )}
          {r.estado === 'pendiente' && !esperando && (
            <p className="rsv__intro">
              {pago === 'ok'
                ? 'El banco aún no nos ha confirmado el pago. Si te ha llegado el cargo, recibirás el correo de confirmación en unos minutos; si no, puedes volver a intentarlo.'
                : 'El pago no se ha completado. Tu hora sigue guardada unos minutos: puedes volver a intentarlo.'}
            </p>
          )}
          {r.estado === 'caducada' && <p className="rsv__intro">Pasó el tiempo para pagar y la hora se liberó. Si sigue libre, puedes pagarla ahora; si no, haz una reserva nueva.</p>}
          {r.estado === 'conflicto' && <p className="rsv__intro">Hemos recibido tu pago, pero tenemos que revisar la hora con el estudio. Te escribimos enseguida por WhatsApp o correo.</p>}
          {r.estado === 'cancelada' && <p className="rsv__intro">{r.reembolso ? `Te devolvemos ${r.reembolso}. Puede tardar unos días en verse en tu cuenta.` : 'Esta reserva ya no está activa.'}</p>}

          <dl>
            <dt>Reserva</dt>
            <dd>{r.codigo}</dd>
            <dt>Cuándo</dt>
            <dd>{r.franja}</dd>
            <dt>Duración</dt>
            <dd>{r.duracionHoras} horas</dd>
            <dt>Importe</dt>
            <dd>{r.importe} (IVA incluido){r.pagoEstado === 'pagado' ? ' · pagado' : ''}</dd>
            <dt>Dónde</dt>
            <dd><a className="rsv-enlace" href={r.mapa} target="_blank" rel="noopener noreferrer">{r.direccion}</a></dd>
          </dl>

          {error && <p className="rsv__alerta is-error">{error}</p>}

          {['pendiente', 'caducada'].includes(r.estado) && !esperando && r.origen === 'web' && (
            <div className="rsv-ficha__acciones">
              <button type="button" className="rsv__boton" disabled={pagando} onClick={reintentar}>{pagando ? 'Abriendo el pago…' : `Pagar ${r.importe}`}</button>
              <Link className="rsv__boton rsv__boton--claro" href="/reservar">Hacer otra reserva</Link>
            </div>
          )}

          {r.estado === 'confirmada' && !r.pasada && (
            <>
              <div className="rsv-ficha__acciones">
                <a className="rsv__boton" href={enlaceGoogle(r)} target="_blank" rel="noopener noreferrer">Añadir a Google Calendar</a>
                <a className="rsv__boton rsv__boton--claro" href={`/api/reservas/${token}/ics`}>Añadir a otro calendario</a>
              </div>

              <h2>¿Necesitas cambiarla?</h2>
              <ul className="rsv-ficha__politica">
                {TEXTO_CANCELACION.map((t) => <li key={t}>{t}</li>)}
              </ul>
              {solicitud.enviada ? (
                <p className="rsv__alerta is-ok">Recibido. Te escribimos enseguida para cerrarlo.</p>
              ) : solicitud.abierta ? (
                <form onSubmit={enviarSolicitud} className="rsv__form">
                  <div className="rsv__campo rsv__ancho">
                    <span>¿Qué necesitas?</span>
                    <div className="rsv__opciones">
                      {[['cambiar', 'Cambiar la fecha'], ['cancelar', 'Cancelar']].map(([v, t]) => (
                        <label key={v} className={`rsv__opcion${solicitud.tipo === v ? ' is-activo' : ''}`}>
                          <input type="radio" checked={solicitud.tipo === v} onChange={() => setSolicitud((s) => ({ ...s, tipo: v }))} /> {t}
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="rsv__campo rsv__ancho">
                    <span>{solicitud.tipo === 'cambiar' ? '¿Qué día y hora te vendría bien?' : 'Cuéntanos el motivo (opcional)'}</span>
                    <textarea value={solicitud.mensaje} onChange={(e) => setSolicitud((s) => ({ ...s, mensaje: e.target.value }))} maxLength={1000} />
                  </label>
                  {solicitud.tipo === 'cancelar' && (
                    <p className="rsv__nota rsv__ancho">Si cancelas hoy, según las condiciones te corresponde el {r.reembolsoHoy} % del importe.</p>
                  )}
                  <button type="submit" className="rsv__boton rsv__ancho" disabled={solicitud.enviando}>{solicitud.enviando ? 'Enviando…' : 'Enviar al estudio'}</button>
                </form>
              ) : (
                <div className="rsv-ficha__acciones">
                  <button type="button" className="rsv__boton rsv__boton--claro" onClick={() => setSolicitud((s) => ({ ...s, abierta: true }))}>Pedir un cambio o cancelar</button>
                  <a className="rsv__boton rsv__boton--claro" href={wa} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
                </div>
              )}
            </>
          )}

          {['conflicto', 'cancelada'].includes(r.estado) && (
            <div className="rsv-ficha__acciones">
              <a className="rsv__boton" href={wa} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export async function getServerSideProps({ params, query, res }) {
  res.setHeader('Cache-Control', 'no-store')
  const r = await reservaPorToken(String(params.token))
  if (!r) return { notFound: true }
  return { props: { inicial: vistaPublica(r), token: String(params.token), pago: query.pago === 'ok' ? 'ok' : query.pago === 'ko' ? 'ko' : null } }
}
