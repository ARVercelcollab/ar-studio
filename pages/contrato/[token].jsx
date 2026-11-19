// Contrato de suscripción de cada miembro (el enlace llega por correo y al volver del pago).
// Solo funciona con el pago confirmado: antes enseña que se está confirmando el pago.
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import TextoContrato from '../../components/suscripciones/TextoContrato'
import Firma from '../../components/suscripciones/Firma'
import FianzaTransferencia from '../../components/suscripciones/Fianza'
import { contratoSecciones } from '../../lib/suscripciones/contrato'
import { PLANES, ESTUDIO, formatoEuros } from '../../lib/reservas/config'
import { textoFechaCorta, fechaMadrid, horaMadrid } from '../../lib/reservas/tiempo'
import { irAlTpv, pedirJson } from '../../lib/reservas/navegador'

function Campo({ etiqueta, error, ancho, children }) {
  return (
    <label className={`rsv__campo${error ? ' is-error' : ''}${ancho ? ' rsv__ancho' : ''}`}>
      <span>{etiqueta}</span>
      {children}
      {error && <span className="rsv__error">{error}</span>}
    </label>
  )
}

const wa = `https://wa.me/${ESTUDIO.whatsapp}`

// Aún no hay suscripción: el pago se está confirmando o no se completó
function EsperandoPago({ alta, token, pago }) {
  const router = useRouter()
  const [intentos, setIntentos] = useState(0)
  const [error, setError] = useState(null)
  const [pagando, setPagando] = useState(false)
  const fallido = alta.estado === 'fallida' || pago === 'ko'
  useEffect(() => {
    if (fallido || intentos >= 15) return
    const t = setTimeout(() => {
      setIntentos((n) => n + 1)
      router.replace(router.asPath, undefined, { scroll: false })
    }, 4000)
    return () => clearTimeout(t)
  }, [fallido, intentos, router])
  const reintentar = async () => {
    setPagando(true)
    setError(null)
    try {
      const r = await pedirJson('/api/suscripciones/alta', { method: 'POST', body: { accion: 'reintentar', token } })
      irAlTpv(r.pago)
    } catch (e) {
      setPagando(false)
      setError(e.message)
    }
  }
  if (fallido) {
    return (
      <>
        <span className="rsv-ficha__estado is-error">Pago no completado</span>
        <h1>El pago no se ha completado</h1>
        <p className="rsv__intro">No se ha cobrado nada. Puedes intentarlo de nuevo con tarjeta o Bizum.</p>
        {error && <p className="rsv__alerta is-error">{error}</p>}
        <button type="button" className="rsv__boton" style={{ maxWidth: 320 }} disabled={pagando} onClick={reintentar}>
          {pagando ? 'Abriendo el pago…' : `Pagar ${formatoEuros(alta.importeCent)}`}
        </button>
        <p className="rsv__nota">¿Algún problema? Escríbenos por <a className="rsv-enlace" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
      </>
    )
  }
  return (
    <>
      <span className="rsv-ficha__estado is-aviso">Confirmando el pago</span>
      <h1>Un momento…</h1>
      <p className="rsv__intro"><span className="rsv__spinner" />Estamos esperando la confirmación del banco. En cuanto llegue, aquí mismo podrás firmar tu contrato.</p>
      {intentos >= 15 && <p className="rsv__nota">Está tardando más de lo normal. Si has pagado, te llegará un correo con el enlace para firmar. Si no, escríbenos por <a className="rsv-enlace" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>}
    </>
  )
}

export default function PaginaContrato(p) {
  const router = useRouter()
  if (p.tipo === 'alta') {
    return (
      <>
        <Head><title>Tu suscripción | AR Studio</title><meta name="robots" content="noindex, nofollow" /></Head>
        <main className="rsv rsv-ficha"><EsperandoPago alta={p.alta} token={p.token} pago={p.pago} /></main>
      </>
    )
  }
  return <Contrato {...p} key={p.contrato.estado} onFirmado={() => router.replace(`/contrato/${p.token}`, undefined, { scroll: true })} />
}

function Contrato({ token, pago, contrato, sus, c, estudio, iban, titular, onFirmado }) {
  const firmado = contrato.estado === 'firmado'
  const [d, setD] = useState({ nombre: sus.nombre, apellidos: sus.apellidos, documento: '', direccion: '', telefono: sus.telefono })
  const [empresa, setEmpresa] = useState(false)
  const [f, setF] = useState({ nombre: '', nif: '', direccion: '' })
  const [firma, setFirma] = useState(null)
  const [acepta, setAcepta] = useState(false)
  const [errores, setErrores] = useState({})
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const cambiar = (k, v) => setD((x) => ({ ...x, [k]: v }))

  const fecha = firmado ? fechaMadrid(contrato.firmadoEn) : null
  const t = useMemo(() => {
    const persona = firmado ? contrato.datos : { ...d, email: sus.email }
    return contratoSecciones({ c, persona, codigo: sus.codigo, fecha, estudio, iban })
  }, [firmado, contrato.datos, d, sus.email, c, sus.codigo, fecha, estudio, iban])

  const firmar = async () => {
    setAviso(null)
    const e = {}
    if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre.'
    if (!d.apellidos.trim()) e.apellidos = 'Escribe tus apellidos.'
    if (d.documento.replace(/[\s.-]/g, '').length < 5) e.documento = 'Escribe tu DNI, NIE o pasaporte.'
    if (d.direccion.trim().length < 8) e.direccion = 'Escribe tu dirección completa.'
    if (d.telefono.replace(/\D/g, '').length < 9) e.telefono = 'Escribe un teléfono de contacto.'
    if (empresa) {
      if (!f.nombre.trim()) e.facturaNombre = 'Escribe el nombre o la razón social.'
      if (f.nif.trim().length < 5) e.facturaNif = 'Escribe el NIF o CIF.'
      if (f.direccion.trim().length < 8) e.facturaDireccion = 'Escribe la dirección de facturación.'
    }
    if (!firma) e.firma = 'Firma en el recuadro con el dedo o el ratón.'
    if (!acepta) e.acepta = 'Marca la casilla para firmar.'
    setErrores(e)
    if (Object.keys(e).length) {
      setAviso('Revisa los datos marcados.')
      return
    }
    setEnviando(true)
    try {
      await pedirJson(`/api/suscripciones/contrato/${token}`, { method: 'POST', body: { datos: d, factura: empresa ? f : null, firma, acepta } })
      onFirmado()
    } catch (err) {
      setEnviando(false)
      if (err.datos?.errores) setErrores(err.datos.errores)
      setAviso(err.message)
    }
  }

  const fianzaPendiente = sus.fianzaEstado === 'pendiente' && sus.fianzaCent > 0
  return (
    <>
      <Head><title>Tu contrato | AR Studio</title><meta name="robots" content="noindex, nofollow" /></Head>
      <main className="rsv rsv-ficha" style={{ maxWidth: 760 }}>
        {firmado ? (
          <>
            <span className="rsv-ficha__estado is-ok">Contrato firmado</span>
            <h1>Tu contrato está firmado</h1>
            <p className="rsv__intro">Lo firmaste el {textoFechaCorta(fecha)} a las {horaMadrid(contrato.firmadoEn)}. Te hemos enviado una copia en PDF por correo.</p>
            <p style={{ margin: '0 0 28px' }}><a className="rsv__boton" style={{ maxWidth: 320 }} href={`/api/suscripciones/contrato-pdf/${token}`} target="_blank" rel="noopener noreferrer">Descargar el contrato (PDF)</a></p>
          </>
        ) : (
          <>
            {pago === 'ok' && <p className="rsv__alerta is-ok">Pago recibido. ¡Ya eres miembro de AR Studio! Te hemos enviado la factura por correo.</p>}
            <span className="rsv-ficha__estado is-aviso">Falta firmar</span>
            <h1>Firma tu contrato</h1>
            <p className="rsv__intro">Plan {PLANES[sus.plan]?.nombre} · {formatoEuros(sus.cuotaCent)}/mes. Rellena tus datos, lee el contrato y fírmalo abajo.</p>
          </>
        )}

        {fianzaPendiente && <FianzaTransferencia importeCent={sus.fianzaCent} iban={iban} titular={titular} codigo={sus.codigo} />}

        {!firmado && (
          <section className="rsv__paso">
            <h2><span className="rsv__num">1</span> Tus datos</h2>
            <div className="rsv__form">
              <Campo etiqueta="Nombre" error={errores.nombre}>
                <input value={d.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoComplete="given-name" />
              </Campo>
              <Campo etiqueta="Apellidos" error={errores.apellidos}>
                <input value={d.apellidos} onChange={(e) => cambiar('apellidos', e.target.value)} autoComplete="family-name" />
              </Campo>
              <Campo etiqueta="DNI, NIE o pasaporte" error={errores.documento}>
                <input value={d.documento} onChange={(e) => cambiar('documento', e.target.value)} autoCapitalize="characters" />
              </Campo>
              <Campo etiqueta="Teléfono" error={errores.telefono}>
                <input type="tel" value={d.telefono} onChange={(e) => cambiar('telefono', e.target.value)} autoComplete="tel" />
              </Campo>
              <Campo etiqueta="Dirección completa (calle, número, código postal y ciudad)" error={errores.direccion} ancho>
                <input value={d.direccion} onChange={(e) => cambiar('direccion', e.target.value)} autoComplete="street-address" />
              </Campo>
              <label className="rsv__check rsv__ancho">
                <input type="checkbox" checked={empresa} onChange={(e) => setEmpresa(e.target.checked)} />
                Quiero las facturas a nombre de una empresa o con otros datos
              </label>
              {empresa && (
                <>
                  <Campo etiqueta="Nombre o razón social" error={errores.facturaNombre}>
                    <input value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} autoComplete="organization" />
                  </Campo>
                  <Campo etiqueta="NIF o CIF" error={errores.facturaNif}>
                    <input value={f.nif} onChange={(e) => setF((x) => ({ ...x, nif: e.target.value }))} />
                  </Campo>
                  <Campo etiqueta="Dirección de facturación" error={errores.facturaDireccion} ancho>
                    <input value={f.direccion} onChange={(e) => setF((x) => ({ ...x, direccion: e.target.value }))} />
                  </Campo>
                </>
              )}
            </div>
          </section>
        )}

        <section className="rsv__paso">
          {!firmado && <h2><span className="rsv__num">2</span> Lee el contrato</h2>}
          <TextoContrato t={t} completo={firmado} />
        </section>

        {!firmado && (
          <section className="rsv__paso">
            <h2><span className="rsv__num">3</span> Firma</h2>
            <Firma onCambio={setFirma} error={errores.firma} />
            <label className="rsv__check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
              <span>He leído el contrato y lo acepto. Firmo con mis datos de arriba.</span>
            </label>
            {errores.acepta && <span className="rsv__error">{errores.acepta}</span>}
            {aviso && <p className="rsv__alerta is-error">{aviso}</p>}
            <button type="button" className="rsv__boton" style={{ marginTop: 18 }} disabled={enviando} onClick={firmar}>
              {enviando ? 'Guardando…' : 'Firmar y guardar'}
            </button>
            <p className="rsv__seguro">Al firmar te llega el contrato en PDF por correo.</p>
          </section>
        )}
      </main>
    </>
  )
}

export async function getServerSideProps({ params, query, res }) {
  res.setHeader('Cache-Control', 'no-store')
  const { paginaContrato } = await import('../../lib/suscripciones/alta')
  const { condicionesDeSuscripcion, firmanteEstudio, ibanEstudio } = await import('../../lib/suscripciones/contrato')
  const pagina = await paginaContrato(params.token)
  if (!pagina) return { notFound: true }
  const pago = typeof query.pago === 'string' ? query.pago : null
  if (pagina.tipo === 'alta') return { props: { tipo: 'alta', alta: pagina.alta, token: params.token, pago } }
  const { contrato, sus } = pagina
  const estudio = firmanteEstudio()
  return {
    props: {
      tipo: 'contrato',
      token: params.token,
      pago,
      contrato: { estado: contrato.estado, firmadoEn: contrato.firmadoEn, datos: contrato.datos, version: contrato.version },
      sus: {
        codigo: sus.codigo, plan: sus.plan, nombre: sus.nombre, apellidos: sus.apellidos, email: sus.email, telefono: sus.telefono,
        cuotaCent: sus.cuotaCent, fianzaCent: sus.fianzaCent, fianzaEstado: sus.fianzaEstado,
      },
      c: condicionesDeSuscripcion(sus),
      estudio,
      iban: ibanEstudio(),
      titular: estudio.nombre,
    },
  }
}
