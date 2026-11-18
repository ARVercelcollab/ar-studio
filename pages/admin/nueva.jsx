// Apuntar una reserva a mano (WhatsApp, transferencia, Bizum, una reserva que venía de Calendly…)
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { ACTIVIDADES, FONDOS, EQUIPO, DURACIONES, formatoEuros } from '../../lib/reservas/config'
import { pedirJson } from '../../lib/reservas/navegador'

const VACIA = {
  fecha: '', hora: '10:00', horas: 2, nombre: '', apellidos: '', email: '', telefono: '',
  actividad: 'Fotos', fondos: 'no', equipo: [], comentarios: '', precio: '',
  pagado: false, metodoPago: 'transferencia', notasInternas: '', enviarCorreo: false,
}

export default function NuevaReserva() {
  const router = useRouter()
  const [f, setF] = useState(VACIA)
  const [estado, setEstado] = useState({ enviando: false, error: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const tarifa = DURACIONES.find((d) => d.horas === Number(f.horas))

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
    <Panel titulo="Nueva reserva">
      <form className="adm-caja" onSubmit={guardar}>
        <div className="adm-form">
          <label>Día<input type="date" required value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
          <label>Hora de inicio<input type="time" required step="1800" value={f.hora} onChange={(e) => poner('hora', e.target.value)} /></label>
          <label>Horas<input type="number" min="1" max="14" required value={f.horas} onChange={(e) => poner('horas', e.target.value)} /></label>
          <label>Precio total con IVA (€)
            <input inputMode="decimal" value={f.precio} onChange={(e) => poner('precio', e.target.value)}
              placeholder={tarifa ? `Vacío = tarifa (${formatoEuros(tarifa.laborable)} entre semana${tarifa.finde ? `, ${formatoEuros(tarifa.finde)} finde` : ''})` : 'Obligatorio para esta duración'} />
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
          {f.pagado && (
            <label>Cómo
              <select value={f.metodoPago} onChange={(e) => poner('metodoPago', e.target.value)}>
                <option value="transferencia">Transferencia</option><option value="bizum">Bizum</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option>
              </select>
            </label>
          )}
          <label className="adm-check adm-ancho"><input type="checkbox" checked={f.enviarCorreo} onChange={(e) => poner('enviarCorreo', e.target.checked)} /> Mandar al cliente el correo de confirmación</label>
        </div>
        <p style={{ fontSize: '0.82rem', marginTop: 12 }}>Desde el panel puedes reservar cualquier hora y duración; solo se comprueba que no choque con otra reserva (con sus 30 minutos) ni con un bloqueo.</p>
        {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
        <p style={{ marginTop: 14 }}><button type="submit" className="adm-boton" disabled={estado.enviando}>{estado.enviando ? 'Guardando…' : 'Guardar reserva'}</button></p>
      </form>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  return redirigirSiNoAdmin(ctx) || { props: {} }
}
