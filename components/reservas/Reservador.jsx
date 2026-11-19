// Reserva del estudio por horas: duración, día y hora, datos y pago.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { DURACIONES, ACTIVIDADES, FONDOS, EQUIPO, TEXTO_FONDOS, TEXTO_EQUIPO, REGLAS, ESTUDIO, formatoEuros } from '../../lib/reservas/config'
import { fechaMadrid, sumarDias, diaSemana, nombreMes, textoFecha } from '../../lib/reservas/tiempo'
import { irAlTpv, pedirJson } from '../../lib/reservas/navegador'

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const dos = (n) => String(n).padStart(2, '0')

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

const CLIENTE_VACIO = {
  nombre: '',
  apellidos: '',
  email: '',
  telefono: '',
  actividad: '',
  fondos: 'no',
  equipo: [],
  comentarios: '',
  quiereFactura: false,
  factura: { nombre: '', nif: '', direccion: '' },
  aceptaCondiciones: false,
}

function faltaAlgo(c) {
  if (!c.nombre.trim() || !c.apellidos.trim()) return true
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim())) return true
  if (c.telefono.replace(/[^0-9]/g, '').length < 6) return true
  if (!c.actividad) return true
  if (c.quiereFactura && (!c.factura.nombre.trim() || c.factura.nif.trim().length < 5 || !c.factura.direccion.trim())) return true
  return !c.aceptaCondiciones
}

function Campo({ etiqueta, error, ancho, children }) {
  return (
    <label className={`rsv__campo${error ? ' is-error' : ''}${ancho ? ' rsv__ancho' : ''}`}>
      <span>{etiqueta}</span>
      {children}
      {error && <span className="rsv__error">{error}</span>}
    </label>
  )
}

export default function Reservador() {
  const [hoy, setHoy] = useState(null)
  const [horas, setHoras] = useState(null)
  const [mes, setMes] = useState(null)
  const [dias, setDias] = useState({})
  const [festivos, setFestivos] = useState([])
  const [cargandoDias, setCargandoDias] = useState(false)
  const [fecha, setFecha] = useState(null)
  const [libres, setLibres] = useState(null)
  const [precioDia, setPrecioDia] = useState(null)
  const [hora, setHora] = useState(null)
  const [cliente, setCliente] = useState(CLIENTE_VACIO)
  const [errores, setErrores] = useState({})
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const refDia = useRef(null)
  const refDatos = useRef(null)

  useEffect(() => {
    const h = fechaMadrid(new Date())
    setHoy(h)
    setMes(h.slice(0, 7))
  }, [])

  const ultimoDia = hoy ? sumarDias(hoy, REGLAS.horizonteDias) : null

  // Días con huecos del mes visible
  useEffect(() => {
    if (!horas || !mes || !hoy) return
    const lista = diasDelMes(mes)
    const desde = lista[0] < hoy ? hoy : lista[0]
    const hasta = lista.at(-1) > ultimoDia ? ultimoDia : lista.at(-1)
    if (desde > hasta) return setDias({})
    let vivo = true
    setCargandoDias(true)
    pedirJson(`/api/reservas/dias?desde=${desde}&hasta=${hasta}&horas=${horas}`)
      .then((r) => {
        if (!vivo) return
        setDias(r.dias)
        setFestivos(r.festivos || [])
      })
      .catch((e) => vivo && setAviso({ tipo: 'error', texto: e.message }))
      .finally(() => vivo && setCargandoDias(false))
    return () => {
      vivo = false
    }
  }, [horas, mes, hoy, ultimoDia])

  // Horas libres del día elegido
  useEffect(() => {
    if (!horas || !fecha) return
    let vivo = true
    setLibres(null)
    pedirJson(`/api/reservas/horas?fecha=${fecha}&horas=${horas}`)
      .then((r) => {
        if (!vivo) return
        setLibres(r.horas)
        setPrecioDia(r.precioCent)
        if (hora && !r.horas.includes(hora)) setHora(null)
      })
      .catch((e) => vivo && setAviso({ tipo: 'error', texto: e.message }))
    return () => {
      vivo = false
    }
  }, [horas, fecha]) // eslint-disable-line react-hooks/exhaustive-deps

  const elegirDuracion = (h) => {
    setHoras(h)
    setPrecioDia(null)
    setHora(null)
    setLibres(null)
    setAviso(null)
    setTimeout(() => refDia.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const elegirHora = (h) => {
    setHora(h)
    setTimeout(() => refDatos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const cambiar = (campo, valor) => {
    setCliente((c) => ({ ...c, [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
  }
  const cambiarFactura = (campo, valor) => setCliente((c) => ({ ...c, factura: { ...c.factura, [campo]: valor } }))
  const alternarEquipo = (id) =>
    setCliente((c) => ({ ...c, equipo: c.equipo.includes(id) ? c.equipo.filter((e) => e !== id) : [...c.equipo, id] }))

  const elegido = DURACIONES.find((d) => d.horas === horas)
  const precio = precioDia ?? elegido?.laborable ?? null
  const listo = horas && fecha && hora && !faltaAlgo(cliente)

  async function pagar() {
    if (!listo || enviando) return
    setEnviando(true)
    setAviso(null)
    try {
      const r = await pedirJson('/api/reservas/crear', { method: 'POST', body: { ...cliente, fecha, hora, horas } })
      try {
        window.fbq?.('track', 'InitiateCheckout', { value: (precio || 0) / 100, currency: 'EUR' })
      } catch {}
      irAlTpv(r.pago)
    } catch (e) {
      setEnviando(false)
      if (e.datos?.errores) setErrores(e.datos.errores)
      if (e.datos?.error === 'ocupada') {
        setHora(null)
        pedirJson(`/api/reservas/horas?fecha=${fecha}&horas=${horas}`).then((x) => setLibres(x.horas)).catch(() => {})
      }
      setAviso({ tipo: 'error', texto: e.message })
    }
  }

  const celdasMes = useMemo(() => {
    if (!mes) return []
    const lista = diasDelMes(mes)
    const huecos = (diaSemana(lista[0]) + 6) % 7 // lunes primero
    return [...Array(huecos).fill(null), ...lista]
  }, [mes])

  const [anio, numMes] = mes ? mes.split('-').map(Number) : [null, null]

  return (
    <div className="rsv__grid">
      <div>
        {/* 1. Duración */}
        <section className="rsv__paso">
          <h2><span className="rsv__num">1</span> ¿Cuántas horas necesitas?</h2>
          <div className="rsv__duraciones">
            {DURACIONES.map((d) => (
              <button key={d.horas} type="button" className={`rsv__duracion${horas === d.horas ? ' is-activo' : ''}`} onClick={() => elegirDuracion(d.horas)}>
                <strong>{d.horas} h</strong>
                <span>{formatoEuros(d.laborable)} entre semana</span>
                <span className="rsv__finde">{d.finde ? `${formatoEuros(d.finde)} fin de semana` : 'Solo entre semana'}</span>
              </button>
            ))}
          </div>
          <p className="rsv__nota">Precios con IVA incluido. Los sábados, domingos y festivos se reservan a partir de 4 horas.</p>
        </section>

        {/* 2. Día y hora */}
        <section ref={refDia} className={`rsv__paso${horas ? '' : ' is-cerrado'}`}>
          <h2><span className="rsv__num">2</span> Elige día y hora</h2>
          {mes && (
            <div className="rsv__cal">
              <div className="rsv__mes">
                <button type="button" aria-label="Mes anterior" disabled={!hoy || mes <= hoy.slice(0, 7)} onClick={() => setMes(moverMes(mes, -1))}>‹</button>
                <p>{nombreMes(numMes)} {anio}</p>
                <button type="button" aria-label="Mes siguiente" disabled={!ultimoDia || mes >= ultimoDia.slice(0, 7)} onClick={() => setMes(moverMes(mes, 1))}>›</button>
              </div>
              <div className="rsv__semana">{SEMANA.map((s) => <span key={s}>{s}</span>)}</div>
              <div className="rsv__dias">
                {celdasMes.map((f, i) => {
                  if (!f) return <span key={`v${i}`} />
                  const n = dias[f] || 0
                  const finde = [0, 6].includes(diaSemana(f)) || festivos.includes(f)
                  const clases = ['rsv__dia', n ? 'is-libre' : 'is-lleno', finde ? 'is-finde' : '', fecha === f ? 'is-elegido' : ''].join(' ')
                  return n ? (
                    <button key={f} type="button" className={clases} onClick={() => { setFecha(f); setHora(null); setPrecioDia(null) }} aria-label={textoFecha(f)}>
                      {Number(f.slice(8))}
                    </button>
                  ) : (
                    <span key={f} className={clases}>{Number(f.slice(8))}</span>
                  )
                })}
              </div>
              <p className="rsv__cargando">{cargandoDias ? 'Buscando huecos…' : horas && !Object.values(dias).some(Boolean) ? 'No quedan huecos este mes.' : horas && horas >= 4 ? 'Los días con punto son fin de semana o festivo: tienen precio de fin de semana.' : ''}</p>
            </div>
          )}

          {fecha && (
            <>
              <p className="rsv__nota" style={{ marginTop: 18 }}>{textoFecha(fecha)}{precioDia != null ? ` · ${formatoEuros(precioDia)}` : ''}</p>
              {libres === null ? (
                <p className="rsv__cargando">Cargando horas…</p>
              ) : libres.length === 0 ? (
                <p className="rsv__cargando">Ese día ya no queda hueco de {horas} horas.</p>
              ) : (
                <div className="rsv__horas">
                  {libres.map((h) => (
                    <button key={h} type="button" className={`rsv__hora${hora === h ? ' is-activo' : ''}`} onClick={() => elegirHora(h)}>{h}</button>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="rsv__nota">Entre una reserva y otra dejamos {REGLAS.margenEntreReservasMin} minutos para preparar el estudio. Se reserva con al menos {REGLAS.antelacionMinimaHoras} horas de antelación; para antes, escríbenos por <a className="rsv-enlace" href={`https://wa.me/${ESTUDIO.whatsapp}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>WhatsApp</a>.</p>
        </section>

        {/* 3. Datos */}
        <section ref={refDatos} className={`rsv__paso${hora ? '' : ' is-cerrado'}`}>
          <h2><span className="rsv__num">3</span> Tus datos</h2>
          <div className="rsv__form">
            <Campo etiqueta="Nombre" error={errores.nombre}>
              <input value={cliente.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoComplete="given-name" />
            </Campo>
            <Campo etiqueta="Apellidos" error={errores.apellidos}>
              <input value={cliente.apellidos} onChange={(e) => cambiar('apellidos', e.target.value)} autoComplete="family-name" />
            </Campo>
            <Campo etiqueta="Correo electrónico" error={errores.email}>
              <input type="email" value={cliente.email} onChange={(e) => cambiar('email', e.target.value)} autoComplete="email" inputMode="email" />
            </Campo>
            <Campo etiqueta="WhatsApp" error={errores.telefono}>
              <input type="tel" value={cliente.telefono} onChange={(e) => cambiar('telefono', e.target.value)} autoComplete="tel" placeholder="+34" />
            </Campo>

            <div className="rsv__campo rsv__ancho">
              <span>¿Qué vas a hacer en el estudio?</span>
              <div className="rsv__opciones">
                {ACTIVIDADES.map((a) => (
                  <label key={a} className={`rsv__opcion${cliente.actividad === a ? ' is-activo' : ''}`}>
                    <input type="radio" name="actividad" checked={cliente.actividad === a} onChange={() => cambiar('actividad', a)} /> {a}
                  </label>
                ))}
              </div>
              {errores.actividad && <span className="rsv__error">{errores.actividad}</span>}
            </div>

            <div className="rsv__campo rsv__ancho">
              <span>¿Vas a usar alguno de nuestros fondos?</span>
              <div className="rsv__opciones">
                {FONDOS.map((f) => (
                  <label key={f.id} className={`rsv__opcion${cliente.fondos === f.id ? ' is-activo' : ''}`}>
                    <input type="radio" name="fondos" checked={cliente.fondos === f.id} onChange={() => cambiar('fondos', f.id)} /> {f.texto}
                  </label>
                ))}
              </div>
              {cliente.fondos !== 'no' && <p className="rsv__nota">{TEXTO_FONDOS}</p>}
            </div>

            <div className="rsv__campo rsv__ancho">
              <span>¿Necesitas algo de nuestro equipo?</span>
              <div className="rsv__opciones">
                {EQUIPO.map((q) => (
                  <label key={q.id} className={`rsv__opcion${cliente.equipo.includes(q.id) ? ' is-activo' : ''}`}>
                    <input type="checkbox" checked={cliente.equipo.includes(q.id)} onChange={() => alternarEquipo(q.id)} /> {q.texto}
                  </label>
                ))}
              </div>
              {cliente.equipo.length > 0 && <p className="rsv__nota">{TEXTO_EQUIPO}</p>}
            </div>

            <Campo etiqueta="¿Algo que debamos saber? (opcional)" ancho>
              <textarea value={cliente.comentarios} onChange={(e) => cambiar('comentarios', e.target.value)} maxLength={1000} />
            </Campo>

            <label className="rsv__check rsv__ancho">
              <input type="checkbox" checked={cliente.quiereFactura} onChange={(e) => cambiar('quiereFactura', e.target.checked)} />
              Quiero factura con mis datos (nombre, NIF y dirección)
            </label>
            {!cliente.quiereFactura && <p className="rsv__nota rsv__ancho" style={{ marginTop: -6 }}>Si no, te enviamos la factura simplificada (el ticket). Puedes pedir la completa después desde tu reserva.</p>}
            {cliente.quiereFactura && (
              <>
                <Campo etiqueta="Nombre o razón social" error={errores.facturaNombre}>
                  <input value={cliente.factura.nombre} onChange={(e) => cambiarFactura('nombre', e.target.value)} autoComplete="organization" />
                </Campo>
                <Campo etiqueta="NIF o CIF" error={errores.facturaNif}>
                  <input value={cliente.factura.nif} onChange={(e) => cambiarFactura('nif', e.target.value)} />
                </Campo>
                <Campo etiqueta="Dirección de facturación" error={errores.facturaDireccion} ancho>
                  <input value={cliente.factura.direccion} onChange={(e) => cambiarFactura('direccion', e.target.value)} autoComplete="street-address" />
                </Campo>
              </>
            )}

            <label className="rsv__check rsv__ancho">
              <input type="checkbox" checked={cliente.aceptaCondiciones} onChange={(e) => cambiar('aceptaCondiciones', e.target.checked)} />
              <span>He leído y acepto las <Link href="/condiciones" target="_blank">condiciones del estudio</Link> (normas, horas extra y cancelaciones) y la <Link href="/privacidad" target="_blank">política de privacidad</Link>.</span>
            </label>
            {errores.aceptaCondiciones && <span className="rsv__error rsv__ancho">{errores.aceptaCondiciones}</span>}
          </div>
        </section>
      </div>

      {/* Resumen y pago */}
      <aside className="rsv__resumen">
        <h3>Tu reserva</h3>
        <dl>
          <dt>Duración</dt>
          <dd>{horas ? `${horas} horas` : '—'}</dd>
          <dt>Día</dt>
          <dd>{fecha ? textoFecha(fecha) : '—'}</dd>
          <dt>Hora</dt>
          <dd>{hora && horas ? `${hora} – ${String(Number(hora.slice(0, 2)) + horas).padStart(2, '0')}:${hora.slice(3)}` : '—'}</dd>
        </dl>
        <div className="rsv__total">
          <span>Total con IVA</span>
          <strong>{horas ? formatoEuros(precio) : '—'}</strong>
        </div>
        {aviso && <p className={`rsv__alerta${aviso.tipo === 'error' ? ' is-error' : ''}`}>{aviso.texto}</p>}
        <button type="button" className="rsv__boton" disabled={!listo || enviando} onClick={pagar}>
          {enviando ? 'Abriendo el pago…' : horas ? `Pagar ${formatoEuros(precio)}` : 'Pagar'}
        </button>
        <p className="rsv__seguro">
          {listo ? 'Pagarás en la pasarela segura del banco. ' : 'Elige duración, día y hora y rellena tus datos. '}
          Guardamos tu hora {REGLAS.minutosRetencionPago} minutos mientras pagas.
        </p>
      </aside>
    </div>
  )
}
