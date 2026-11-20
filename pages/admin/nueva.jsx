// Apuntar una reserva a mano (WhatsApp, transferencia, Bizum, una reserva que venía de Calendly…)
// o una sesión de alguien con suscripción (gasta horas de su plan).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel, { Segmento } from '../../components/admin/Panel'
import SesionPlan from '../../components/admin/SesionPlan'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { ACTIVIDADES, FONDOS, EQUIPO, DURACIONES, formatoEuros, textoDuracion } from '../../lib/reservas/config'
import { minutosDeHora, horaDeMinutos, fechaMadrid } from '../../lib/reservas/tiempo'
import { pedirJson } from '../../lib/reservas/navegador'
import { opcionesParaReservar } from '../../lib/suscripciones/servicio'

const VACIA = {
  fecha: '', desde: '10:00', hasta: '12:00', nombre: '', apellidos: '', email: '', telefono: '',
  actividad: 'Fotos', fondos: 'no', equipo: [], comentarios: '', precio: '',
  pagado: false, metodoPago: 'transferencia', pagadoEn: '', notasInternas: '', enviarCorreo: false,
}

export default function NuevaReserva({ miembros, modoInicial, susInicial, hoy }) {
  const router = useRouter()
  const [modo, setModo] = useState(modoInicial)
  const cambiarModo = (m) => {
    setModo(m)
    router.replace({ pathname: '/admin/nueva', query: m === 'suscripcion' ? { modo: 'suscripcion' } : {} }, undefined, { shallow: true })
  }
  return (
    <Panel titulo="Nueva reserva">
      <div style={{ marginBottom: 16 }}>
        <Segmento opciones={[['horas', 'Por horas'], ['suscripcion', 'Suscripción']]} valor={modo} onCambio={cambiarModo} />
      </div>
      {modo === 'suscripcion' ? <SesionDeMiembro miembros={miembros} susInicial={susInicial} /> : <ReservaPorHoras hoy={hoy} />}
    </Panel>
  )
}

function SesionDeMiembro({ miembros, susInicial }) {
  const router = useRouter()
  const [susId, setSusId] = useState(susInicial || (miembros.length === 1 ? String(miembros[0].id) : ''))
  const [fondos, setFondos] = useState('no')
  const [notasInternas, setNotas] = useState('')
  const [enviarCorreo, setEnviarCorreo] = useState(true)
  const m = miembros.find((x) => String(x.id) === String(susId))

  if (miembros.length === 0) {
    return (
      <div className="adm-caja">
        <p>Todavía no hay nadie con suscripción activa.</p>
        <p style={{ marginTop: 12 }}><Link href="/admin/miembros/nueva" className="adm-boton">+ Nueva suscripción</Link></p>
      </div>
    )
  }

  const inicial = m
    ? { fecha: '', desde: m.franjaDesde, hasta: horaDeMinutos(Math.min(minutosDeHora(m.franjaDesde) + Math.round(m.duracionPorDefecto * 60), minutosDeHora(m.franjaHasta))) }
    : { fecha: '', desde: '', hasta: '' }

  return (
    <div className="adm-caja">
      <div className="adm-form">
        <label className="adm-ancho">Quién
          <select value={susId} onChange={(e) => setSusId(e.target.value)}>
            <option value="">Elige a la persona…</option>
            {miembros.map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.planNombre}</option>)}
          </select>
        </label>
        {m && (
          <p className="adm-ancho adm-nota">
            {m.planNombre} · le quedan <strong>{textoDuracion(m.resumen.restantes, { corto: true })}</strong> de {textoDuracion(m.resumen.horas, { corto: true })} hasta el {m.resumen.hastaTexto}.{' '}
            {m.condiciones.slice(1, 3).join(' · ')}. <Link href={`/admin/miembros/${m.id}`} className="adm-enlace">Ver ficha</Link>
          </p>
        )}
      </div>
      {m && (
        <div style={{ marginTop: 14 }}>
          <SesionPlan
            key={m.id}
            susId={m.id}
            inicial={inicial}
            datosExtra={{ fondos, notasInternas, enviarCorreo }}
            onHecho={(r) => router.push(`/admin/miembros/${m.id}?ok=${r?.correoFallido ? 'sesion_sin_correo' : 'sesion'}`)}
          >
            <label>Fondos
              <select value={fondos} onChange={(e) => setFondos(e.target.value)}>{FONDOS.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}</select>
            </label>
            <div />
            <label className="adm-ancho">Notas internas<textarea value={notasInternas} onChange={(e) => setNotas(e.target.value)} placeholder="Solo las ve el estudio" /></label>
            <label className="adm-check adm-ancho">
              <input type="checkbox" checked={enviarCorreo} onChange={(e) => setEnviarCorreo(e.target.checked)} disabled={!m.email} />
              {m.email ? ' Mandarle el correo de confirmación' : ' No tiene correo apuntado: no se le puede mandar la confirmación'}
            </label>
          </SesionPlan>
        </div>
      )}
    </div>
  )
}

function ReservaPorHoras({ hoy }) {
  const router = useRouter()
  const [f, setF] = useState(VACIA)
  const [estado, setEstado] = useState({ enviando: false, error: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const minutos = f.desde && f.hasta ? minutosDeHora(f.hasta) - minutosDeHora(f.desde) : 0
  const horas = minutos / 60
  const tarifa = DURACIONES.find((d) => d.horas === horas)

  async function guardar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: null })
    try {
      const { id } = await pedirJson('/api/admin/reservas/nueva', { method: 'POST', body: f })
      router.push(`/admin/reserva/${id}`)
    } catch (err) {
      setEstado({ enviando: false, error: err.message })
    }
  }

  return (
    <>
      <form className="adm-caja" onSubmit={guardar}>
        <div className="adm-form">
          <label>Día<input type="date" required value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
          <div />
          <label>Desde<input type="time" required step="900" value={f.desde} onChange={(e) => poner('desde', e.target.value)} /></label>
          <label>Hasta<input type="time" required step="900" value={f.hasta} onChange={(e) => poner('hasta', e.target.value)} /></label>
          <p className="adm-ancho adm-nota">{minutos > 0 ? `Duración: ${textoDuracion(horas)}.` : 'La hora de fin tiene que ser después de la de inicio.'}</p>
          <label className="adm-ancho">Precio total con IVA (€)
            <input inputMode="decimal" value={f.precio} onChange={(e) => poner('precio', e.target.value)}
              placeholder={tarifa ? `Vacío = tarifa (${formatoEuros(tarifa.laborable)} entre semana${tarifa.finde ? `, ${formatoEuros(tarifa.finde)} finde o festivo` : ''})` : 'Pon el precio: esta duración no tiene tarifa fija'} />
          </label>
          <label>Nombre<input required value={f.nombre} onChange={(e) => poner('nombre', e.target.value)} /></label>
          <label>Apellidos<input value={f.apellidos} onChange={(e) => poner('apellidos', e.target.value)} /></label>
          <label>Correo<input type="email" value={f.email} onChange={(e) => poner('email', e.target.value)} /></label>
          <label>WhatsApp<input value={f.telefono} onChange={(e) => poner('telefono', e.target.value)} /></label>
          <label>Actividad
            <select value={f.actividad} onChange={(e) => poner('actividad', e.target.value)}>{ACTIVIDADES.map((a) => <option key={a}>{a}</option>)}</select>
          </label>
          <label>Fondos
            <select value={f.fondos} onChange={(e) => poner('fondos', e.target.value)}>{FONDOS.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}</select>
          </label>
          <div className="adm-ancho" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {EQUIPO.map((q) => (
              <label key={q.id} className="adm-check">
                <input type="checkbox" checked={f.equipo.includes(q.id)} onChange={() => poner('equipo', f.equipo.includes(q.id) ? f.equipo.filter((x) => x !== q.id) : [...f.equipo, q.id])} /> {q.texto}
              </label>
            ))}
          </div>
          <label className="adm-ancho">Comentarios del cliente<textarea value={f.comentarios} onChange={(e) => poner('comentarios', e.target.value)} /></label>
          <label className="adm-ancho">Notas internas<textarea value={f.notasInternas} onChange={(e) => poner('notasInternas', e.target.value)} placeholder="Solo las ve el estudio" /></label>
          <label className="adm-check"><input type="checkbox" checked={f.pagado} onChange={(e) => poner('pagado', e.target.checked)} /> Ya está pagada</label>
          {f.pagado ? (
            <label>Cómo
              <select value={f.metodoPago} onChange={(e) => poner('metodoPago', e.target.value)}>
                <option value="transferencia">Transferencia</option><option value="bizum">Bizum</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option>
                <option value="calendly">Por Calendly (ya cobrada en Stripe)</option>
              </select>
            </label>
          ) : <div />}
          {f.pagado && (
            <>
              <label>Cobrada el<input type="date" max={hoy} value={f.pagadoEn} onChange={(e) => poner('pagadoEn', e.target.value)} /></label>
              {f.metodoPago === 'calendly'
                ? <p className="adm-notas" style={{ alignSelf: 'end' }}>No cuenta en Finanzas como reserva: ese dinero va en el resumen de Calendly del mes. Tampoco se le hace factura aquí: la hace Stripe.</p>
                : <p className="adm-nota" style={{ alignSelf: 'end' }}>Vacío = hoy. Cuenta en Finanzas el día del cobro.</p>}
            </>
          )}
          <label className="adm-check adm-ancho"><input type="checkbox" checked={f.enviarCorreo} onChange={(e) => poner('enviarCorreo', e.target.checked)} /> Mandar al cliente el correo de confirmación</label>
        </div>
        <p style={{ fontSize: '0.82rem', marginTop: 12 }}>Desde el panel puedes reservar cualquier hora y duración; solo se comprueba que no choque con otra reserva (con sus 30 minutos) ni con un bloqueo.</p>
        {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
        <p style={{ marginTop: 14 }}><button type="submit" className="adm-boton" disabled={estado.enviando}>{estado.enviando ? 'Guardando…' : 'Guardar reserva'}</button></p>
      </form>
    </>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const miembros = await opcionesParaReservar()
  const pedido = typeof ctx.query.suscripcion === 'string' ? ctx.query.suscripcion : ''
  const susInicial = miembros.some((x) => String(x.id) === pedido) ? pedido : ''
  return {
    props: {
      miembros,
      susInicial,
      modoInicial: susInicial || ctx.query.modo === 'suscripcion' ? 'suscripcion' : 'horas',
      hoy: fechaMadrid(new Date()),
    },
  }
}
