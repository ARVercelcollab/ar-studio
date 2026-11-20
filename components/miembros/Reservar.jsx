// Reservar (o cambiar) una sesión del plan: duración, día, hora y resumen.
// Datos de datosReservar() (lib/miembros/area.js), pasados por deReservar() (./datos)
// Las consultas van a /api/miembros/{dias,huecos,comprobar,reservar,cambiar}; la página de muestra
// le pasa `api` con respuestas inventadas para revisar el diseño sin servidor.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { pedirJson, irAlTpv } from '../../lib/reservas/navegador'
import { fechaMadrid, diaSemana, nombreMes } from '../../lib/reservas/tiempo'
import { h, euros, horaFin, fechaLarga, capital, partesSesion, diaCorto, WHATSAPP } from './formato'
import { deReservar } from './datos'

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const dos = (n) => String(n).padStart(2, '0')
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString()

function diasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${mes}-${dos(i + 1)}`)
}
function moverMes(mes, delta) {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}`
}

export const API_MIEMBROS = {
  dias: (p) => pedirJson(`/api/miembros/dias?${qs(p)}`),
  huecos: (p) => pedirJson(`/api/miembros/huecos?${qs(p)}`),
  comprobar: (b) => pedirJson('/api/miembros/comprobar', { method: 'POST', body: b }),
  reservar: (b) => pedirJson('/api/miembros/reservar', { method: 'POST', body: b }),
  cambiar: (b) => pedirJson('/api/miembros/cambiar', { method: 'POST', body: b }),
}

// { dias: [{fecha, huecos}] } o { dias: { 'AAAA-MM-DD': n } } -> { fecha: n }
function mapaDias(r) {
  const d = r?.dias
  if (Array.isArray(d)) return Object.fromEntries(d.map((x) => (typeof x === 'string' ? [x, 1] : [x.fecha, Number(x.huecos ?? 1)])))
  return d && typeof d === 'object' ? d : {}
}

function Lista({ items, tono }) {
  if (!items?.length) return null
  return (
    <ul className={`mbr-mensajes mbr-mensajes--${tono}`}>
      {items.map((x, i) => <li key={`${x.codigo || ''}${i}`}>{x.texto || x}</li>)}
    </ul>
  )
}

function Hecho({ hecho, cambiando, onOtra }) {
  return (
    <main className="mbr">
      <section className="mbr-tarjeta mbr-hecho" aria-live="polite">
        <p className="mbr-hecho__marca" aria-hidden="true">✓</p>
        <h1>{cambiando ? 'Sesión cambiada' : 'Sesión reservada'}</h1>
        <p className="mbr-hecho__cuando">{capital(fechaLarga(hecho.fecha))}<br />de {hecho.desde} a {hecho.hasta}</p>
        {hecho.restantes != null && (Number(hecho.restantes) > 0
          ? <p>Te quedan <strong>{h(hecho.restantes)}</strong> de tu plan este mes.</p>
          : <p>Con esta, ya tienes reservadas todas las horas de tu plan de este mes.</p>)}
        <p className="mbr-nota">Te hemos mandado la confirmación por correo{hecho.codigo ? ` (${hecho.codigo})` : ''}.</p>
        <div className="mbr-fila mbr-fila--centro">
          <Link className="mbr-boton" href="/miembros">Volver a mi área</Link>
          {!cambiando && <button type="button" className="mbr-boton mbr-boton--claro" onClick={onOtra}>Reservar otra</button>}
        </div>
      </section>
    </main>
  )
}

export default function Reservar(props) {
  const api = props.api || API_MIEMBROS
  const { duraciones, horasIniciales, primerDia, ultimoDia, periodos, cambiando, franjaDesde, franjaHasta, antelacionH, puedeReservar, motivoNoReservar } = deReservar(props)
  const original = cambiando ? partesSesion(cambiando) : null
  const [horas, setHoras] = useState(horasIniciales)
  const [mes, setMes] = useState(() => (primerDia || fechaMadrid(new Date())).slice(0, 7))
  const [dias, setDias] = useState({})
  const [cargandoDias, setCargandoDias] = useState(false)
  const [fecha, setFecha] = useState(null)
  const [libres, setLibres] = useState(null)
  const [hora, setHora] = useState(null)
  const [revision, setRevision] = useState(null)
  const [revisando, setRevisando] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(null)
  const [ronda, setRonda] = useState(0) // sube al empezar otra reserva: vuelve a pedir los días
  const refDia = useRef(null)
  const refResumen = useRef(null)
  const codigo = cambiando?.codigo || null
  const router = useRouter()

  const puede = puedeReservar

  // Días posibles del mes visible
  useEffect(() => {
    if (!horas || !mes || !puede) return
    const lista = diasDelMes(mes)
    const desde = primerDia && lista[0] < primerDia ? primerDia : lista[0]
    const hasta = ultimoDia && lista.at(-1) > ultimoDia ? ultimoDia : lista.at(-1)
    if (desde > hasta) return setDias({})
    let vivo = true
    setCargandoDias(true)
    api.dias({ desde, hasta, horas, codigo })
      .then((r) => vivo && setDias(mapaDias(r)))
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargandoDias(false))
    return () => {
      vivo = false
    }
  }, [horas, mes, primerDia, ultimoDia, codigo, puede, ronda]) // eslint-disable-line react-hooks/exhaustive-deps

  // Horas libres del día
  useEffect(() => {
    if (!horas || !fecha) return
    let vivo = true
    setLibres(null)
    api.huecos({ fecha, horas, codigo })
      .then((r) => vivo && setLibres(r?.huecos || r?.horas || []))
      .catch((e) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [horas, fecha, codigo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resumen de la hora elegida (horas del plan, aparte, lo que le quedará)
  useEffect(() => {
    if (!horas || !fecha || !hora) return setRevision(null)
    let vivo = true
    setRevisando(true)
    setRevision(null)
    api.comprobar({ fecha, desde: hora, horas, codigo })
      .then((r) => vivo && setRevision(r))
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setRevisando(false))
    return () => {
      vivo = false
    }
  }, [horas, fecha, hora, codigo]) // eslint-disable-line react-hooks/exhaustive-deps

  const elegirDuracion = (x) => {
    setHoras(x)
    setFecha(null)
    setHora(null)
    setLibres(null)
    setError(null)
  }
  const elegirDia = (f) => {
    setFecha(f)
    setHora(null)
    setError(null)
    setTimeout(() => refDia.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }
  const elegirHora = (x) => {
    setHora(x)
    setError(null)
    setTimeout(() => refResumen.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
  }

  const extra = Number(revision?.horasExtra) || 0
  const precioExtra = revision?.precioExtraCent ? euros(revision.precioExtraCent) : null
  const errores = revision?.errores || []
  const listo = Boolean(horas && fecha && hora && revision && !errores.length && !revisando)

  async function confirmar() {
    if (!listo || enviando) return
    setEnviando(true)
    setError(null)
    const base = { fecha, desde: hora, horas }
    try {
      if (cambiando) {
        const r = await api.cambiar({ ...base, codigo })
        return setHecho({ fecha, desde: hora, hasta: horaFin(hora, horas), codigo: r?.codigo || codigo, restantes: r?.restantes ?? revision?.restantesDespues ?? null })
      }
      const r = await api.reservar({ ...base, aceptoPagoExtra: extra > 0, aceptoExtra: extra > 0 })
      if (r?.estado === 'pago' && r.pago) return irAlTpv(r.pago)
      setHecho({ fecha, desde: hora, hasta: horaFin(hora, horas), codigo: r?.codigo || null, restantes: r?.restantes ?? r?.restantesDespues ?? revision?.restantesDespues ?? null })
    } catch (e) {
      setEnviando(false)
      // Reglas del plan (409 'reglas'): se enseñan en la lista de errores del resumen
      if (Array.isArray(e.datos?.errores) && e.datos.errores.length) {
        setRevision((r) => ({ ...(r || {}), errores: e.datos.errores }))
      } else {
        setError(e.message)
      }
      if (e.datos?.error === 'ocupada') {
        setHora(null)
        api.huecos({ fecha, horas, codigo }).then((x) => setLibres(x?.huecos || x?.horas || [])).catch(() => {})
      }
    }
  }

  const celdas = useMemo(() => {
    const lista = diasDelMes(mes)
    const vacios = (diaSemana(lista[0]) + 6) % 7
    return [...Array(vacios).fill(null), ...lista]
  }, [mes])
  const [anio, numMes] = mes.split('-').map(Number)

  // Otra reserva: se vacía todo y se vuelven a pedir los datos (las horas que le quedan han cambiado)
  const otra = () => {
    setHecho(null)
    setFecha(null)
    setHora(null)
    setLibres(null)
    setRevision(null)
    setEnviando(false)
    setDias({})
    setRonda((n) => n + 1)
    router.replace(router.asPath, undefined, { scroll: true })
  }

  if (hecho) return <Hecho hecho={hecho} cambiando={Boolean(cambiando)} onOtra={otra} />

  const titulo = cambiando ? 'Cambiar la sesión' : 'Reservar sesión'
  if (!puede) {
    return (
      <main className="mbr">
        <Link className="mbr-volver" href="/miembros">‹ Mi área</Link>
        <h1 className="mbr-titulo">{titulo}</h1>
        <p className="mbr-aviso mbr-aviso--aviso">{motivoNoReservar || 'Ahora mismo no puedes reservar desde aquí.'}</p>
        <p className="mbr-nota">Si crees que es un error, escríbenos por <a className="mbr-enlace" href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
      </main>
    )
  }

  const restantes = fecha ? periodos.find((p) => fecha <= (p.ultimoDia || p.hasta))?.restantes : undefined
  return (
    <main className="mbr">
      <Link className="mbr-volver" href="/miembros">‹ Mi área</Link>
      <h1 className="mbr-titulo">{titulo}</h1>
      {cambiando ? (
        <p className="mbr-intro">Ahora: {capital(fechaLarga(original.fecha))}, de {original.desde} a {original.hasta}. Elige el nuevo día y la hora.</p>
      ) : (
        <p className="mbr-intro">
          {franjaDesde && franjaHasta ? `Tu plan es de lunes a viernes, de ${franjaDesde} a ${franjaHasta}. ` : ''}
          {antelacionH ? `Se reserva con ${antelacionH} horas de antelación como mínimo.` : 'Los días que ves son los que puedes reservar.'}
        </p>
      )}

      <div className="mbr-reservar">
        <div>
          {duraciones.length > 1 && (
            <section className="mbr-paso" aria-labelledby="mbr-paso-1">
              <h2 id="mbr-paso-1"><span className="mbr-paso__num">1</span> ¿Cuántas horas?</h2>
              <div className="mbr-chips" role="group" aria-label="Duración">
                {duraciones.map((x) => (
                  <button key={x.horas} type="button" className={`mbr-chip mbr-chip--grande${horas === x.horas ? ' is-activo' : ''}`} aria-pressed={horas === x.horas} onClick={() => elegirDuracion(x.horas)}>{x.texto || h(x.horas)}</button>
                ))}
              </div>
            </section>
          )}

          <section className={`mbr-paso${horas ? '' : ' is-cerrado'}`} aria-labelledby="mbr-paso-2">
            <h2 id="mbr-paso-2"><span className="mbr-paso__num">{duraciones.length > 1 ? 2 : 1}</span> Elige el día{duraciones.length === 1 && horas ? <span className="mbr-paso__extra"> · sesión de {h(horas)}</span> : ''}</h2>
            <div className="mbr-cal">
              <div className="mbr-cal__mes">
                <button type="button" aria-label="Mes anterior" disabled={!primerDia || mes <= primerDia.slice(0, 7)} onClick={() => setMes(moverMes(mes, -1))}>‹</button>
                <p>{nombreMes(numMes)} {anio}</p>
                <button type="button" aria-label="Mes siguiente" disabled={!ultimoDia || mes >= ultimoDia.slice(0, 7)} onClick={() => setMes(moverMes(mes, 1))}>›</button>
              </div>
              <div className="mbr-cal__semana" aria-hidden="true">{SEMANA.map((s) => <span key={s}>{s}</span>)}</div>
              <div className="mbr-cal__dias">
                {celdas.map((f, i) => {
                  if (!f) return <span key={`v${i}`} />
                  const n = Number(dias[f] || 0)
                  const cl = `mbr-cal__dia${n ? ' is-libre' : ''}${fecha === f ? ' is-elegido' : ''}`
                  return n ? (
                    <button key={f} type="button" className={cl} onClick={() => elegirDia(f)} aria-label={fechaLarga(f)} aria-pressed={fecha === f}>{Number(f.slice(8))}</button>
                  ) : (
                    <span key={f} className={cl} aria-hidden="true">{Number(f.slice(8))}</span>
                  )
                })}
              </div>
              <p className="mbr-cargando" aria-live="polite">
                {cargandoDias ? 'Buscando huecos…' : horas && !Object.values(dias).some((n) => Number(n) > 0) ? 'Este mes no queda ningún hueco para ti. Prueba el siguiente.' : ''}
              </p>
            </div>
          </section>

          <section ref={refDia} className={`mbr-paso${fecha ? '' : ' is-cerrado'}`} aria-labelledby="mbr-paso-3">
            <h2 id="mbr-paso-3"><span className="mbr-paso__num">{duraciones.length > 1 ? 3 : 2}</span> Elige la hora{fecha ? <span className="mbr-paso__extra"> · {fechaLarga(fecha)}</span> : ''}</h2>
            {fecha && (libres === null ? (
              <p className="mbr-cargando">Cargando horas…</p>
            ) : libres.length === 0 ? (
              <p className="mbr-cargando">Ese día ya no queda hueco de {h(horas)}.</p>
            ) : (
              <div className="mbr-horas" role="group" aria-label="Hora de empezar">
                {libres.map((x) => (
                  <button key={x} type="button" className={`mbr-hora${hora === x ? ' is-activo' : ''}`} aria-pressed={hora === x} onClick={() => elegirHora(x)}>{x}</button>
                ))}
              </div>
            ))}
            <p className="mbr-nota">Entre una reserva y otra dejamos 30 minutos para preparar el estudio.</p>
          </section>
        </div>

        <aside ref={refResumen} className="mbr-resumen" aria-labelledby="mbr-resumen-titulo">
          <h2 id="mbr-resumen-titulo">Tu sesión</h2>
          <dl>
            <dt>Día</dt>
            <dd>{fecha ? capital(diaCorto(fecha)) : '—'}</dd>
            <dt>Hora</dt>
            <dd>{hora && horas ? `${hora} – ${horaFin(hora, horas)}` : '—'}</dd>
            <dt>Del plan</dt>
            <dd>{revision ? h(revision.horasPlan) : '—'}</dd>
            {extra > 0 && (
              <>
                <dt>Aparte</dt>
                <dd>{h(extra)}{precioExtra ? ` · ${precioExtra}` : ''}</dd>
              </>
            )}
            <dt>Te quedarán</dt>
            <dd>{revision?.restantesDespues != null ? h(revision.restantesDespues) : restantes != null && horas ? h(Math.max(0, restantes - horas)) : '—'}</dd>
          </dl>
          {revisando && <p className="mbr-cargando">Comprobando…</p>}
          <Lista items={errores} tono="mal" />
          <Lista items={(revision?.notas || []).filter((n) => n.codigo !== 'extra')} tono="info" />
          {extra > 0 && !errores.length && (
            <p className="mbr-aviso mbr-aviso--info">No te quedan horas del plan para toda la sesión: {h(extra)} van aparte{precioExtra ? ` (${precioExtra}, IVA incluido)` : ''} y se pagan ahora con tarjeta o Bizum. Te guardamos la hora unos minutos mientras pagas.</p>
          )}
          {error && <p className="mbr-aviso mbr-aviso--mal" role="alert">{error}</p>}
          <button type="button" className="mbr-boton" disabled={!listo || enviando} onClick={confirmar}>
            {enviando ? (extra > 0 && !cambiando ? 'Abriendo el pago…' : 'Guardando…') : cambiando ? 'Cambiar a esta hora' : extra > 0 ? `Pagar ${precioExtra || ''} y reservar`.replace('  ', ' ') : 'Reservar'}
          </button>
          {!hora && <p className="mbr-nota mbr-nota--centro">Elige día y hora.</p>}
        </aside>
      </div>
    </main>
  )
}
