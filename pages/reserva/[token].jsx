// Página privada de cada reserva (el enlace va en el correo de confirmación)
import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { reservaPorToken } from '../../lib/reservas/servicio'
import { vistaPublica } from '../../lib/reservas/publico'
import { facturaDeReserva } from '../../lib/facturas/servicio'
import { ESTUDIO, TEXTO_CANCELACION, PLAN_TEXTO_CANCELACION, PLAN_COMUN } from '../../lib/reservas/config'
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
  const fin = r.finIso
  const p = new URLSearchParams({ action: 'TEMPLATE', text: 'Estudio AR Studio', dates: `${f(r.inicioIso)}/${f(fin)}`, location: r.direccion, details: `Reserva ${r.codigo}` })
  return `https://calendar.google.com/calendar/render?${p}`
}

export default function PaginaReserva({ inicial, token, pago, factura: facturaInicial }) {
  const [r, setR] = useState(inicial)
  const [factura, setFactura] = useState(facturaInicial) // { codigo, simplificada } o null
  const [pideFactura, setPideFactura] = useState({ abierta: false, nombre: '', nif: '', direccion: '', enviando: false, hecha: null })
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

  async function pedirFacturaCompleta(e) {
    e.preventDefault()
    setError(null)
    setPideFactura((f) => ({ ...f, enviando: true }))
    try {
      const x = await pedirJson(`/api/reservas/${token}/factura`, { method: 'POST', body: { nombre: pideFactura.nombre, nif: pideFactura.nif, direccion: pideFactura.direccion } })
      setFactura({ codigo: x.codigo, simplificada: false })
      setPideFactura((f) => ({ ...f, enviando: false, abierta: false, hecha: x }))
    } catch (err) {
      setPideFactura((f) => ({ ...f, enviando: false }))
      setError(err.message)
    }
  }
  const cambiarDato = (campo) => (e) => setPideFactura((f) => ({ ...f, [campo]: e.target.value }))

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
            <dd>{r.duracionTexto}</dd>
            <dt>Importe</dt>
            <dd>{r.esPlan && r.importe.startsWith('Incluida') ? r.importe : `${r.importe} (IVA incluido)${r.pagoEstado === 'pagado' ? ' · pagado' : ''}`}</dd>
            <dt>Dónde</dt>
            <dd><a className="rsv-enlace" href={r.mapa} target="_blank" rel="noopener noreferrer">{r.direccion}</a></dd>
          </dl>

          {factura && (
            <p className="rsv__nota" style={{ marginBottom: 18 }}>
              {factura.simplificada ? 'Factura simplificada' : 'Factura'} {factura.codigo}: <a className="rsv-enlace" href={`/api/reservas/${token}/factura`}>descargar PDF</a>
            </p>
          )}
          {pideFactura.hecha && (
            <p className="rsv__alerta is-ok">Hecho: {pideFactura.hecha.enviada ? `te hemos enviado la factura ${pideFactura.hecha.codigo} a tu correo` : `ya tienes la factura ${pideFactura.hecha.codigo}`}. Sustituye a la simplificada.</p>
          )}
          {factura?.simplificada && r.pagoEstado === 'pagado' && (
            pideFactura.abierta ? (
              <form onSubmit={pedirFacturaCompleta} className="rsv__form" style={{ marginBottom: 18 }}>
                <p className="rsv__nota rsv__ancho">Con tus datos te hacemos la factura completa, que sustituye a la simplificada.</p>
                <label className="rsv__campo rsv__ancho"><span>Nombre o razón social</span><input value={pideFactura.nombre} onChange={cambiarDato('nombre')} autoComplete="organization" maxLength={120} required /></label>
                <label className="rsv__campo"><span>NIF o CIF</span><input value={pideFactura.nif} onChange={cambiarDato('nif')} maxLength={20} required /></label>
                <label className="rsv__campo"><span>Dirección de facturación</span><input value={pideFactura.direccion} onChange={cambiarDato('direccion')} autoComplete="street-address" maxLength={200} required /></label>
                <button type="submit" className="rsv__boton rsv__ancho" disabled={pideFactura.enviando}>{pideFactura.enviando ? 'Haciendo la factura…' : 'Pedir la factura'}</button>
              </form>
            ) : (
              <div className="rsv-ficha__acciones" style={{ marginBottom: 18 }}>
                <button type="button" className="rsv__boton rsv__boton--claro" onClick={() => setPideFactura((f) => ({ ...f, abierta: true }))}>Necesito factura con mis datos</button>
              </div>
            )
          )}

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
                {(r.esPlan ? PLAN_TEXTO_CANCELACION : TEXTO_CANCELACION).map((t) => <li key={t}>{t}</li>)}
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
                    <p className="rsv__nota rsv__ancho">
                      {r.esPlan
                        ? `Faltan ${r.horasHastaInicio} h para la sesión: con menos de ${PLAN_COMUN.avisoCancelacionH} h cuenta como usada.`
                        : `Si cancelas hoy, según las condiciones te corresponde el ${r.reembolsoHoy} % del importe.`}
                    </p>
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
  const factura = await facturaDeReserva(r.id)
  return { props: { inicial: vistaPublica(r), token: String(params.token), pago: query.pago === 'ok' ? 'ok' : query.pago === 'ko' ? 'ko' : null, factura: factura ? { codigo: factura.codigo, simplificada: factura.simplificada } : null } }
}
