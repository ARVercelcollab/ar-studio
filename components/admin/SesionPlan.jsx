// Formulario de una sesión de suscripción (reservar o mover), con la vista previa en directo:
// horas del plan y aparte, avisos que hay que aceptar y huecos libres en su horario.
import { useEffect, useState } from 'react'
import { pedirJson } from '../../lib/reservas/navegador'
import { METODOS_CUOTA, textoDuracion } from '../../lib/reservas/config'
import { minutosDeHora, horaDeMinutos } from '../../lib/reservas/tiempo'

const h = (x) => textoDuracion(x, { corto: true })
const euros = (cent) => (cent == null ? '' : (cent / 100).toFixed(2).replace('.', ','))

export function usePreviaSesion(susId, { fecha, desde, hasta, horasPlan, excluirId }) {
  const [previa, setPrevia] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (!susId || !fecha || !desde || !hasta) {
      setPrevia(null)
      return undefined
    }
    let vivo = true
    const t = setTimeout(async () => {
      setCargando(true)
      try {
        const r = await pedirJson(`/api/admin/suscripciones/${susId}`, {
          method: 'POST',
          body: { accion: 'comprobar', fecha, desde, hasta, horasPlan: horasPlan === '' ? null : horasPlan, excluirId },
        })
        if (vivo) setPrevia(r)
      } catch (e) {
        if (vivo) setPrevia({ errores: [{ codigo: 'error', texto: e.message }], avisos: [], notas: [], huecos: [] })
      } finally {
        if (vivo) setCargando(false)
      }
    }, 300)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [susId, fecha, desde, hasta, horasPlan, excluirId, vuelta])
  return { previa, cargando, recargar: () => setVuelta((v) => v + 1) }
}

export function PreviaSesion({ previa, cargando, desde, onElegirHueco }) {
  if (!previa) return null
  return (
    <div className="adm-ancho">
      {previa.linea && <p className="adm-nota" style={{ color: '#4b3828' }}>{cargando ? 'Comprobando…' : previa.linea}</p>}
      {previa.huecos && (
        <div className="adm-huecos">
          <span>{previa.huecos.length ? 'Libres ese día en su horario:' : 'Ese día no queda hueco en su horario con esa duración.'}</span>
          {previa.huecos.map((hu) => (
            <button key={hu} type="button" className={hu === desde ? 'is-activo' : ''} onClick={() => onElegirHueco(hu)}>{hu}</button>
          ))}
        </div>
      )}
      {previa.errores?.map((e) => <p key={e.codigo + e.texto} className="adm-mensaje is-error">{e.texto}</p>)}
      {previa.avisos?.length > 0 && (
        <div className="adm-avisos">
          <strong>Avisos (puedes reservar igualmente)</strong>
          {previa.avisos.map((a) => <div key={a.codigo}>· {a.texto}</div>)}
        </div>
      )}
      {previa.notas?.map((n) => <p key={n.codigo} className="adm-notas">{n.texto}</p>)}
    </div>
  )
}

// accion: 'reservar' (nueva sesión) o 'mover' (reservaId). datosExtra se manda con la petición.
export default function SesionPlan({ susId, inicial, excluirId = null, accion = 'reservar', reservaId = null, datosExtra = {}, children, onHecho, textoBoton }) {
  const [fecha, setFecha] = useState(inicial.fecha || '')
  const [desde, setDesde] = useState(inicial.desde || '')
  const [hasta, setHasta] = useState(inicial.hasta || '')
  const [horasPlan, setHorasPlan] = useState('')
  const [precio, setPrecio] = useState(null) // null = sin tocar (se usa el sugerido)
  const [extraPagado, setExtraPagado] = useState(false)
  const [extraMetodo, setExtraMetodo] = useState('transferencia')
  const [estado, setEstado] = useState({ enviando: false, error: null })
  const { previa, cargando, recargar } = usePreviaSesion(susId, { fecha, desde, hasta, horasPlan, excluirId })

  // Al cambiar de miembro, vuelve a lo de partida
  useEffect(() => {
    setFecha(inicial.fecha || '')
    setDesde(inicial.desde || '')
    setHasta(inicial.hasta || '')
    setHorasPlan('')
    setPrecio(null)
  }, [susId]) // eslint-disable-line react-hooks/exhaustive-deps

  const duracionMin = desde && hasta ? minutosDeHora(hasta) - minutosDeHora(desde) : 0
  const moverDesde = (nuevo) => {
    if (duracionMin > 0 && minutosDeHora(nuevo) + duracionMin <= 24 * 60) setHasta(horaDeMinutos(minutosDeHora(nuevo) + duracionMin))
    setDesde(nuevo)
  }

  const extra = previa?.horasExtra || 0
  const precioMostrado = precio !== null ? precio : euros(previa?.precioExtraSugeridoCent ?? null)
  const hayAvisos = previa?.avisos?.length > 0
  const hayErrores = previa?.errores?.length > 0

  async function enviar() {
    setEstado({ enviando: true, error: null })
    const cuerpo = {
      fecha, desde, hasta,
      horasPlan: horasPlan === '' ? null : horasPlan,
      precioExtra: extra > 0 ? precioMostrado : '',
      extraPagado, extraMetodo,
      avisosAceptados: (previa?.avisos || []).map((a) => a.codigo),
      ...datosExtra,
    }
    try {
      const url = accion === 'mover' ? `/api/admin/reservas/${reservaId}` : `/api/admin/suscripciones/${susId}`
      const r = await pedirJson(url, { method: 'POST', body: { accion: accion === 'mover' ? 'mover' : 'reservar', ...cuerpo } })
      setEstado({ enviando: false, error: null })
      onHecho?.(r)
    } catch (e) {
      setEstado({ enviando: false, error: e.message })
      recargar()
    }
  }

  return (
    <>
      <div className="adm-form">
        <label>Día<input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <div />
        <label>Desde<input type="time" required step="900" value={desde} onChange={(e) => moverDesde(e.target.value)} /></label>
        <label>Hasta<input type="time" required step="900" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <PreviaSesion previa={previa} cargando={cargando} desde={desde} onElegirHueco={moverDesde} />
        {previa && !hayErrores && (
          <>
            <label>Del plan (horas)
              <input type="number" min="0" step="0.25" value={horasPlan === '' ? previa.horasPlanPorDefecto ?? '' : horasPlan} onChange={(e) => setHorasPlan(e.target.value)} />
            </label>
            <p className="adm-nota" style={{ alignSelf: 'end' }}>{extra > 0 ? `${h(extra)} aparte` : 'Todo dentro del plan'}</p>
          </>
        )}
        {previa && !hayErrores && extra > 0 && (
          <>
            <label>Precio de las {h(extra)} aparte (€, IVA incluido)
              <input inputMode="decimal" value={precioMostrado} onChange={(e) => setPrecio(e.target.value)} />
            </label>
            <p className="adm-nota" style={{ alignSelf: 'end' }}>Precio orientativo de las condiciones. 0 = de regalo.</p>
            {accion !== 'mover' && <label className="adm-check"><input type="checkbox" checked={extraPagado} onChange={(e) => setExtraPagado(e.target.checked)} /> Ya están pagadas</label>}
            {accion !== 'mover' && (extraPagado ? (
              <label>Cómo
                <select value={extraMetodo} onChange={(e) => setExtraMetodo(e.target.value)}>
                  {METODOS_CUOTA.filter(([id]) => id !== 'stripe').map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                </select>
              </label>
            ) : <div />)}
          </>
        )}
        {children}
      </div>
      {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
      <p style={{ marginTop: 14 }}>
        <button type="button" className="adm-boton" disabled={estado.enviando || cargando || !previa || hayErrores} onClick={enviar}>
          {estado.enviando ? 'Guardando…' : hayAvisos ? `${textoBoton || 'Reservar sesión'} igualmente` : textoBoton || 'Reservar sesión'}
        </button>
      </p>
    </>
  )
}
