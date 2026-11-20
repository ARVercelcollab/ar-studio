// Área de miembros con sesión: «Hola, …», avisos, tu mes, próximas sesiones, pagos y tu plan.
// Los datos llegan de datosArea() (lib/miembros/area.js) ya pasados a JSON.
import { useState } from 'react'
import Link from 'next/link'
import Avisos from './Avisos'
import Pagos from './Pagos'
import TuPlan from './TuPlan'
import { ProximasSesiones, SesionesPasadas } from './Sesiones'
import { pedirJson } from '../../lib/reservas/navegador'
import { h, fechaCorta, ESTADOS_PLAN } from './formato'
import { deArea } from './datos'

function Salir() {
  const [saliendo, setSaliendo] = useState(false)
  const salir = async () => {
    setSaliendo(true)
    try {
      await pedirJson('/api/miembros/salir', { method: 'POST', body: {} })
    } catch {}
    window.location.href = '/miembros'
  }
  return <button type="button" className="mbr-boton mbr-boton--texto mbr-boton--peq" onClick={salir} disabled={saliendo}>{saliendo ? 'Saliendo…' : 'Salir'}</button>
}

// Barra de horas: usadas · reservadas · libres
function Barra({ horas, usadas, reservadas, restantes }) {
  const total = Number(horas) || 0
  if (!total) return null
  const reserv = Math.max(0, Number(reservadas) || 0)
  const gastadas = Math.max(0, (Number(usadas) || 0) - reserv)
  const libres = Math.max(0, Number(restantes) || 0)
  const pct = (x) => `${Math.min(100, (x / total) * 100)}%`
  return (
    <div className="mbr-barra">
      <div className="mbr-barra__pista" role="img" aria-label={`De ${h(total)}: ${h(gastadas)} usadas, ${h(reserv)} reservadas y ${h(libres)} libres`}>
        {gastadas > 0 && <span className="mbr-barra__usadas" style={{ width: pct(gastadas) }} />}
        {reserv > 0 && <span className="mbr-barra__reservadas" style={{ width: pct(reserv) }} />}
      </div>
      <ul className="mbr-barra__leyenda">
        <li><i className="mbr-barra__usadas" />Usadas {h(gastadas)}</li>
        <li><i className="mbr-barra__reservadas" />Reservadas {h(reserv)}</li>
        <li><i className="mbr-barra__libres" />Libres {h(libres)}</li>
      </ul>
    </div>
  )
}

function TuMes({ suscripcion = {}, periodo, siguientePeriodo }) {
  const puede = suscripcion.puedeReservar !== false
  const maxSesiones = suscripcion.maxSesiones ?? periodo?.maxSesiones ?? null
  const sesionesUsadas = periodo?.sesionesUsadas ?? periodo?.sesiones ?? null
  return (
    <section className="mbr-tarjeta mbr-mes" aria-labelledby="mbr-mes">
      <div className="mbr-mes__cab">
        <h2 id="mbr-mes" className="mbr-tarjeta__titulo">Tu mes</h2>
        {periodo?.texto && <span className="mbr-mes__periodo">{periodo.texto}</span>}
      </div>
      {periodo ? (
        <>
          <p className="mbr-mes__cifra">
            {Number(periodo.restantes) > 0 ? <>Te quedan <strong>{h(periodo.restantes)}</strong></> : <>No te quedan horas este mes</>}
          </p>
          <p className="mbr-mes__sub">
            de {h(periodo.horas)} de tu plan
            {periodo.ultimoDia && <> · hasta el {fechaCorta(periodo.ultimoDia)}{Number(periodo.diasParaCaducar) >= 0 && Number(periodo.restantes) > 0 ? ` (${periodo.diasParaCaducar === 0 ? 'hoy es el último día' : periodo.diasParaCaducar === 1 ? 'queda 1 día' : `quedan ${periodo.diasParaCaducar} días`})` : ''}</>}
          </p>
          <Barra {...periodo} />
          {maxSesiones && sesionesUsadas != null && (
            <p className="mbr-nota">Sesiones este mes: {sesionesUsadas} de {maxSesiones} incluidas.</p>
          )}
          {Number(periodo.restantes) > 0 && <p className="mbr-nota">Las horas que no uses no pasan al mes siguiente.</p>}
        </>
      ) : (
        <p className="mbr-vacio">{suscripcion.fechaInicio ? `Tu plan empieza el ${fechaCorta(suscripcion.fechaInicio, true)}.` : 'Aún no hay horas este mes.'}</p>
      )}
      {siguientePeriodo && (
        <p className="mbr-nota">Desde el {fechaCorta(siguientePeriodo.desde)} tienes {h(siguientePeriodo.restantes ?? siguientePeriodo.horas)}{Number(siguientePeriodo.reservadas) > 0 ? ` (ya has reservado ${h(siguientePeriodo.reservadas)})` : ' nuevas'}.</p>
      )}
      <div className="mbr-mes__accion">
        {puede ? (
          <Link className="mbr-boton" href="/miembros/reservar">Reservar sesión</Link>
        ) : (
          <>
            <button type="button" className="mbr-boton" disabled aria-describedby="mbr-motivo">Reservar sesión</button>
            {suscripcion.motivoNoReservar && <p id="mbr-motivo" className="mbr-nota">{suscripcion.motivoNoReservar}</p>}
          </>
        )}
      </div>
    </section>
  )
}

// Mensaje al volver de reservar, cambiar, cancelar o pagar
function Vuelta({ aviso }) {
  if (!aviso) return null
  return <p className={`mbr-aviso mbr-aviso--${aviso.tono}`} role={aviso.tono === 'mal' ? 'alert' : 'status'}>{aviso.texto}</p>
}

export default function Area(props) {
  const { miembro, suscripcion, periodo, siguientePeriodo, proximas, pasadas, avisos, cuotas, facturasExtra, contrato, tarjeta, cobroAutomatico } = deArea(props)
  const aviso = props.aviso || null
  const estado = suscripcion.estadoTexto || ESTADOS_PLAN[suscripcion.estado]
  return (
    <main className="mbr">
      <div className="mbr-cab">
        <div>
          <p className="mbr-cab__ante">Área de miembros</p>
          <h1>Hola, {miembro.nombre || 'miembro'}</h1>
          <p className="mbr-cab__sub">
            {suscripcion.planNombre ? `Plan ${suscripcion.planNombre}` : 'Tu plan'}
            {estado && <span className={`mbr-etiqueta mbr-etiqueta--${suscripcion.estado === 'activa' ? 'bien' : suscripcion.estado === 'finalizada' ? 'gris' : 'aviso'}`}>{estado}</span>}
          </p>
        </div>
        <Salir />
      </div>

      <Vuelta aviso={aviso} />
      <Avisos avisos={avisos} />

      <div className="mbr-rejilla">
        <div className="mbr-columna">
          <TuMes suscripcion={suscripcion} periodo={periodo} siguientePeriodo={siguientePeriodo} />
          <ProximasSesiones sesiones={proximas} puedeReservar={suscripcion.puedeReservar !== false} />
          <SesionesPasadas sesiones={pasadas} />
        </div>
        <div className="mbr-columna">
          <Pagos cuotas={cuotas} facturasExtra={facturasExtra} />
          <TuPlan miembro={miembro} suscripcion={suscripcion} contrato={contrato} tarjeta={tarjeta} cobroAutomatico={cobroAutomatico} />
        </div>
      </div>
    </main>
  )
}

// Mensaje según la dirección (?reservada=…, ?cambiada=…, ?cancelada=…, ?pago=ko…)
export function avisoDeVuelta(q = {}) {
  const uno = (v) => (Array.isArray(v) ? v[0] : v)
  if (uno(q.reservada)) return { tono: 'bien', texto: 'Sesión reservada. Te hemos mandado la confirmación por correo.' }
  if (uno(q.cambiada)) return { tono: 'bien', texto: 'Sesión cambiada. Te hemos mandado la nueva hora por correo.' }
  if (uno(q.cancelada)) {
    return uno(q.usada) === '1'
      ? { tono: 'aviso', texto: 'Sesión cancelada. Como faltaban menos de 48 horas, sus horas cuentan como usadas.' }
      : { tono: 'bien', texto: 'Sesión cancelada. Sus horas vuelven a tu plan.' }
  }
  if (uno(q.pago) === 'ko') return { tono: 'mal', texto: 'El pago no se ha completado y la sesión aún no está reservada. Te guardamos la hora unos minutos: en «Próximas sesiones» puedes pagarla o soltarla. Si el banco te ha cobrado, escríbenos.' }
  return null
}
