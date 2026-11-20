// Formulario «Reserva» de Añadir: por horas (cualquier hora y duración, con la tarifa y los huecos
// libres de ese día) o una sesión de alguien con suscripción (gasta horas de su plan, con sus avisos
// y «Reservar igualmente»). Es el que había en «Nueva reserva», con el estilo nuevo.
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import SesionPlan from '../SesionPlan'
import { Boton, Conmutador, Vacio } from '../ui'
import { ACTIVIDADES, FONDOS, EQUIPO, DURACIONES, formatoEuros, textoDuracion } from '../../../lib/reservas/config'
import { minutosDeHora, horaDeMinutos } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'

const VACIA = {
  fecha: '', desde: '10:00', hasta: '12:00', nombre: '', apellidos: '', email: '', telefono: '',
  actividad: 'Fotos', fondos: 'no', equipo: [], comentarios: '', precio: '',
  pagado: false, metodoPago: 'transferencia', pagadoEn: '', notasInternas: '', enviarCorreo: false,
}

export default function FormReserva({ miembros, hoy, inicial = {}, onAnadido }) {
  const [modo, setModo] = useState(inicial.modo === 'suscripcion' ? 'suscripcion' : 'horas')
  return (
    <>
      <div className="adm-anadir__subvista">
        <Conmutador etiqueta="Tipo de reserva" valor={modo} onCambio={setModo} opciones={[{ valor: 'horas', texto: 'Por horas' }, { valor: 'suscripcion', texto: 'Sesión de un miembro' }]} />
      </div>
      {modo === 'suscripcion'
        ? <SesionDeMiembro miembros={miembros} inicial={inicial} onAnadido={onAnadido} />
        : <ReservaPorHoras hoy={hoy} inicial={inicial} onAnadido={onAnadido} />}
    </>
  )
}

function SesionDeMiembro({ miembros, inicial, onAnadido }) {
  const router = useRouter()
  const pedido = inicial.susId != null ? String(inicial.susId) : ''
  const [susId, setSusId] = useState(miembros.some((x) => String(x.id) === pedido) ? pedido : miembros.length === 1 ? String(miembros[0].id) : '')
  const [fondos, setFondos] = useState('no')
  const [notasInternas, setNotas] = useState('')
  const [enviarCorreo, setEnviarCorreo] = useState(true)
  const m = miembros.find((x) => String(x.id) === String(susId))

  if (miembros.length === 0) {
    return <Vacio texto="Todavía no hay nadie con suscripción activa." accion={<Boton href="/admin/miembros/nueva" icono="mas">Nueva suscripción</Boton>} />
  }

  // La hora que se dijo en «Escribirlo» (si es de esta persona) o su horario y su sesión de siempre
  const delChat = m && String(inicial.susId) === String(m.id) && inicial.fecha ? { fecha: inicial.fecha, desde: inicial.desde || '', hasta: inicial.hasta || '' } : null
  const deSiempre = m
    ? { fecha: '', desde: m.franjaDesde, hasta: horaDeMinutos(Math.min(minutosDeHora(m.franjaDesde) + Math.round(m.duracionPorDefecto * 60), minutosDeHora(m.franjaHasta))) }
    : { fecha: '', desde: '', hasta: '' }

  return (
    <div>
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
            {m.condiciones.slice(1, 3).join(' · ')}. <Link href={`/admin/miembros/${m.id}`} className="adm-enlace">Ver su ficha</Link>
          </p>
        )}
      </div>
      {m && (
        <div style={{ marginTop: 14 }}>
          <SesionPlan
            key={`${m.id}-${delChat ? `${delChat.fecha}${delChat.desde}` : ''}`}
            susId={m.id}
            inicial={delChat || deSiempre}
            datosExtra={{ fondos, notasInternas, enviarCorreo }}
            onHecho={(r) => {
              onAnadido?.({ texto: `Sesión de ${m.nombre}`, enlace: `/admin/miembros/${m.id}` })
              router.push(`/admin/miembros/${m.id}?ok=${r?.correoFallido ? 'sesion_sin_correo' : 'sesion'}`)
            }}
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

// Horas libres ese día para esa duración, según la web (solo orientativo: el panel deja reservar
// cualquier hora; la web además pide 10 horas de antelación)
function useHuecos(fecha, horas) {
  const [huecos, setHuecos] = useState(null)
  useEffect(() => {
    setHuecos(null)
    if (!fecha || !DURACIONES.some((d) => d.horas === horas)) return undefined
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const r = await pedirJson(`/api/reservas/horas?fecha=${encodeURIComponent(fecha)}&horas=${horas}`)
        const lista = Array.isArray(r?.horas) ? r.horas.map((x) => (typeof x === 'string' ? x : x.desde || x.hora)).filter(Boolean) : null
        if (vivo) setHuecos(lista)
      } catch {
        if (vivo) setHuecos(null)
      }
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [fecha, horas])
  return huecos
}

function ReservaPorHoras({ hoy, inicial, onAnadido }) {
  const router = useRouter()
  const [f, setF] = useState(() => ({
    ...VACIA,
    ...Object.fromEntries(['fecha', 'desde', 'hasta', 'nombre', 'apellidos', 'email', 'telefono', 'actividad'].filter((k) => inicial[k]).map((k) => [k, inicial[k]])),
  }))
  const [estado, setEstado] = useState({ enviando: false, error: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const minutos = f.desde && f.hasta ? minutosDeHora(f.hasta) - minutosDeHora(f.desde) : 0
  const horas = minutos / 60
  const tarifa = DURACIONES.find((d) => d.horas === horas)
  const huecos = useHuecos(f.fecha, horas)
  // Elegir un hueco mantiene la duración
  const elegirHueco = (h) => setF((x) => ({ ...x, desde: h, hasta: horaDeMinutos(minutosDeHora(h) + minutos) }))

  async function guardar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: null })
    try {
      const { id } = await pedirJson('/api/admin/reservas/nueva', { method: 'POST', body: f })
      onAnadido?.({ texto: `Reserva de ${`${f.nombre} ${f.apellidos}`.trim()} · ${f.desde}–${f.hasta}`, enlace: `/admin/reserva/${id}` })
      router.push(`/admin/reserva/${id}`)
    } catch (err) {
      setEstado({ enviando: false, error: err.message })
    }
  }

  return (
    <form onSubmit={guardar}>
      <div className="adm-form">
        <label>Día<input type="date" required value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
        <div />
        <label>Desde<input type="time" required step="900" value={f.desde} onChange={(e) => poner('desde', e.target.value)} /></label>
        <label>Hasta<input type="time" required step="900" value={f.hasta} onChange={(e) => poner('hasta', e.target.value)} /></label>
        <p className="adm-ancho adm-nota">{minutos > 0 ? `Duración: ${textoDuracion(horas)}.` : 'La hora de fin tiene que ser después de la de inicio.'}</p>
        {huecos && (
          <div className="adm-ancho adm-huecos">
            <span>{huecos.length ? 'Libres ese día en la web con esa duración:' : 'Ese día no queda hueco en la web con esa duración.'}</span>
            {huecos.map((h) => <button key={h} type="button" className={h === f.desde ? 'is-activo' : ''} onClick={() => elegirHueco(h)}>{h}</button>)}
          </div>
        )}
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
        <div className="adm-ancho adm-anadir__equipo">
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
              ? <p className="adm-notas" style={{ alignSelf: 'end' }}>No cuenta como reserva en los movimientos: ese dinero va en lo de Calendly del mes. Tampoco se le hace factura aquí: la hace Stripe.</p>
              : <p className="adm-nota" style={{ alignSelf: 'end' }}>Vacío = hoy. Cuenta el día del cobro.</p>}
          </>
        )}
        <label className="adm-check adm-ancho"><input type="checkbox" checked={f.enviarCorreo} onChange={(e) => poner('enviarCorreo', e.target.checked)} /> Mandar al cliente el correo de confirmación</label>
      </div>
      <p className="adm-nota" style={{ marginTop: 12 }}>Desde el panel puedes reservar cualquier hora y duración; solo se comprueba que no choque con otra reserva (con sus 30 minutos) ni con un bloqueo.</p>
      {estado.error && <p className="adm-mensaje is-error" role="alert">{estado.error}</p>}
      <div className="adm-anadir__guardar"><Boton type="submit" icono="check" disabled={estado.enviando}>{estado.enviando ? 'Guardando…' : 'Guardar reserva'}</Boton></div>
    </form>
  )
}
