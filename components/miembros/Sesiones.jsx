// Próximas sesiones (con Cambiar y Cancelar) y sesiones pasadas (plegadas).
// Cada sesión: { codigo, inicio, fin, horas, horasPlan, horasExtra, precioCent, pagoEstado, estado,
//   puedeCambiar, puedeCancelar, cancelarCuentaComoUsada, textoCancelar, motivoNoCambiar }
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Dialogo from './Dialogo'
import { pedirJson, irAlTpv } from '../../lib/reservas/navegador'
import { partesSesion, textoReparto, diaCorto, fechaLarga, capital, euros, h, WHATSAPP } from './formato'

function Fecha({ fecha }) {
  const [dia, num, mes] = diaCorto(fecha).split(' ')
  return (
    <div className="mbr-sesion__fecha" aria-hidden="true">
      <span>{dia}</span>
      <strong>{num}</strong>
      <span>{mes}</span>
    </div>
  )
}

function Estado({ s }) {
  if (s.estado === 'pendiente') return <span className="mbr-etiqueta mbr-etiqueta--aviso">Falta pagar las horas aparte</span>
  if (s.estado === 'conflicto') return <span className="mbr-etiqueta mbr-etiqueta--aviso">La estamos revisando</span>
  if (s.estado === 'cancelada') return <span className="mbr-etiqueta">{s.cuentaComoUsada ? 'Cancelada · contó como usada' : 'Cancelada'}</span>
  return null
}

// «4 h del plan» · «2 h del plan + 2 h aparte · 121 € · pagadas»
function reparto(s) {
  const plan = Number(s.horasPlan) || 0
  if (s.extraTexto) return plan > 0 ? `${h(plan)} del plan + ${s.extraTexto}` : s.extraTexto
  const base = textoReparto(s)
  if (!(Number(s.precioCent) > 0)) return base
  return `${base} · ${euros(s.precioCent)}${s.pagoEstado === 'pagado' ? ' · pagadas' : s.pagoEstado ? ' · sin pagar' : ''}`
}

function Cancelar({ s, abierto, onCerrar }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const { fecha, desde, hasta } = partesSesion(s)
  const usada = Boolean(s.cancelarCuentaComoUsada)
  const cerrar = () => {
    if (enviando) return
    setError(null)
    onCerrar()
  }
  const confirmar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const r = await pedirJson('/api/miembros/cancelar', { method: 'POST', body: { codigo: s.codigo } })
      const cuenta = r?.cuentaComoUsada ?? usada
      router.replace(`/miembros?cancelada=${encodeURIComponent(s.codigo)}${cuenta ? '&usada=1' : ''}`)
    } catch (e) {
      setEnviando(false)
      setError(e.message)
    }
  }
  return (
    <Dialogo
      abierto={abierto}
      titulo={s.estado === 'pendiente' ? '¿Soltar esta hora?' : '¿Cancelar esta sesión?'}
      onCerrar={cerrar}
      acciones={
        <>
          <button type="button" className="mbr-boton mbr-boton--claro" onClick={cerrar} disabled={enviando} data-foco>No, la mantengo</button>
          <button type="button" className="mbr-boton" onClick={confirmar} disabled={enviando}>{enviando ? 'Un momento…' : s.estado === 'pendiente' ? 'Sí, soltarla' : 'Sí, cancelarla'}</button>
        </>
      }
    >
      <p className="mbr-dialogo__sesion">{capital(fechaLarga(fecha))}<br />de {desde} a {hasta}</p>
      {usada ? (
        <p className="mbr-aviso mbr-aviso--mal">
          <strong>Cuenta como usada.</strong> {s.textoCancelar || `Faltan menos de ${s.avisoCancelacionH || 48} horas: si la cancelas ahora, esas horas no vuelven a tu plan.`}
        </p>
      ) : (
        <p>{s.textoCancelar || 'Las horas vuelven a tu plan y puedes reservarlas otro día.'}</p>
      )}
      {error && <p className="mbr-aviso mbr-aviso--mal" role="alert">{error}</p>}
    </Dialogo>
  )
}

// Sesión retenida con horas aparte sin pagar (el pago no se completó): volver a pagar
function PagarAhora({ s }) {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: false, error: null })
  const pagar = async () => {
    const { fecha, desde, horas } = partesSesion(s)
    setEstado({ enviando: true, error: null })
    try {
      const r = await pedirJson('/api/miembros/reservar', { method: 'POST', body: { fecha, desde, horas, aceptoPagoExtra: true } })
      if (r?.estado === 'pago' && r.pago) return irAlTpv(r.pago)
      router.replace(`/miembros?reservada=${encodeURIComponent(r?.codigo || s.codigo)}`)
    } catch (e) {
      setEstado({ enviando: false, error: e.message })
    }
  }
  return (
    <>
      <button type="button" className="mbr-boton mbr-boton--peq" onClick={pagar} disabled={estado.enviando}>{estado.enviando ? 'Abriendo el pago…' : 'Pagar ahora'}</button>
      {estado.error && <p className="mbr-sesion__motivo mbr-sesion__error" role="alert">{estado.error}</p>}
    </>
  )
}

function Sesion({ s, pasada = false }) {
  const [cancelando, setCancelando] = useState(false)
  const { fecha, desde, hasta, horas } = partesSesion(s)
  const pagar = !pasada && s.estado === 'pendiente'
  const acciones = !pasada && (s.puedeCambiar || s.puedeCancelar || pagar)
  return (
    <li className={`mbr-sesion${pasada ? ' is-pasada' : ''}${s.estado === 'cancelada' ? ' is-cancelada' : ''}`}>
      <Fecha fecha={fecha} />
      <div className="mbr-sesion__datos">
        <p className="mbr-sesion__hora">{desde} – {hasta} <span>· {h(horas)}</span></p>
        <p className="mbr-sesion__reparto">{reparto(s)}</p>
        <Estado s={s} />
        {!pasada && !s.puedeCambiar && s.motivoNoCambiar && !['pendiente', 'conflicto'].includes(s.estado) && <p className="mbr-sesion__motivo">{s.motivoNoCambiar}</p>}
      </div>
      {acciones && (
        <div className="mbr-sesion__acciones">
          {pagar && <PagarAhora s={s} />}
          {s.puedeCambiar && <Link className="mbr-boton mbr-boton--claro mbr-boton--peq" href={`/miembros/reservar?cambiar=${encodeURIComponent(s.codigo)}`}>Cambiar</Link>}
          {s.puedeCancelar && <button type="button" className="mbr-boton mbr-boton--texto mbr-boton--peq" onClick={() => setCancelando(true)}>{s.estado === 'pendiente' ? 'Soltar la hora' : 'Cancelar'}</button>}
        </div>
      )}
      {s.puedeCancelar && <Cancelar s={s} abierto={cancelando} onCerrar={() => setCancelando(false)} />}
    </li>
  )
}

export function ProximasSesiones({ sesiones = [], puedeReservar }) {
  return (
    <section className="mbr-tarjeta" aria-labelledby="mbr-proximas">
      <h2 id="mbr-proximas" className="mbr-tarjeta__titulo">Próximas sesiones</h2>
      {sesiones.length === 0 ? (
        <p className="mbr-vacio">
          No tienes sesiones reservadas.{puedeReservar ? <> <Link className="mbr-enlace" href="/miembros/reservar">Reserva la siguiente</Link>.</> : null}
        </p>
      ) : (
        <ul className="mbr-sesiones">
          {sesiones.map((s) => <Sesion key={s.codigo} s={s} />)}
        </ul>
      )}
      <p className="mbr-nota">
        Para cambiar o cancelar con menos de 48 horas, o si algo no te cuadra, escríbenos por <a className="mbr-enlace" href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp</a>.
      </p>
    </section>
  )
}

export function SesionesPasadas({ sesiones = [] }) {
  if (!sesiones.length) return null
  return (
    <details className="mbr-tarjeta mbr-plegable">
      <summary>
        <span className="mbr-tarjeta__titulo">Sesiones pasadas</span>
        <span className="mbr-plegable__n">{sesiones.length}</span>
      </summary>
      <ul className="mbr-sesiones">
        {sesiones.map((s) => <Sesion key={s.codigo} s={s} pasada />)}
      </ul>
    </details>
  )
}
