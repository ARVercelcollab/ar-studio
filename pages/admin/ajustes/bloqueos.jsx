// Horas en las que el estudio no se puede reservar (grabaciones propias, mantenimiento, vacaciones…)
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarBloqueos } from '../../../lib/reservas/servicio'
import { fechaMadrid, horaMadrid, textoFecha } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'

export default function Bloqueos({ bloqueos }) {
  const router = useRouter()
  const [f, setF] = useState({ fecha: '', desde: '09:00', hasta: '22:00', fechaFin: '', motivo: '' })
  const [estado, setEstado] = useState({ enviando: false, error: null })

  async function enviar(datos) {
    setEstado({ enviando: true, error: null })
    try {
      await pedirJson('/api/admin/bloqueos', { method: 'POST', body: datos })
      setEstado({ enviando: false, error: null })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setEstado({ enviando: false, error: e.message })
    }
  }

  return (
    <Panel titulo="Bloqueos">
      <form className="adm-caja" onSubmit={(e) => { e.preventDefault(); enviar({ accion: 'crear', ...f }) }}>
        <h2>Cerrar unas horas</h2>
        <div className="adm-form">
          <label>Día<input type="date" required value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
          <label>Hasta el día (si son varios)<input type="date" value={f.fechaFin} onChange={(e) => setF({ ...f, fechaFin: e.target.value })} /></label>
          <label>Desde<input type="time" step="1800" required value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
          <label>Hasta<input type="time" step="1800" required value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
          <label className="adm-ancho">Motivo (solo lo veis vosotros)<input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Grabación de Ari, vacaciones…" /></label>
        </div>
        {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
        <p style={{ marginTop: 12 }}><button type="submit" className="adm-boton" disabled={estado.enviando}>Bloquear</button></p>
      </form>

      <div className="adm-caja">
        <h2>Próximos bloqueos</h2>
        {bloqueos.length === 0 ? <p>No hay ninguno.</p> : (
          <table className="adm-tabla">
            <thead><tr><th>Desde</th><th>Hasta</th><th>Motivo</th><th /></tr></thead>
            <tbody>
              {bloqueos.map((b) => (
                <tr key={b.id}>
                  <td>{b.desde}</td><td>{b.hasta}</td><td>{b.motivo || '—'}</td>
                  <td><button type="button" className="adm-boton adm-boton--claro" onClick={() => enviar({ accion: 'borrar', id: b.id })}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const bloqueos = await listarBloqueos({ desde: new Date() })
  const texto = (d) => `${textoFecha(fechaMadrid(d))}, ${horaMadrid(d)}`
  return { props: { bloqueos: bloqueos.map((b) => ({ id: b.id, desde: texto(b.inicio), hasta: texto(b.fin), motivo: b.motivo })) } }
}
