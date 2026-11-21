// Ajustes › Bloqueos: horas en las que el estudio no se puede reservar (grabaciones propias,
// mantenimiento, vacaciones…)
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import SubmenuAjustes from '../../../components/admin/ajustes/SubmenuAjustes'
import { Tarjeta, Boton, Vacio } from '../../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarBloqueos } from '../../../lib/reservas/servicio'
import { fechaMadrid, horaMadrid, textoFecha } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'

export default function Bloqueos({ bloqueos }) {
  const router = useRouter()
  const [f, setF] = useState({ fecha: '', desde: '09:00', hasta: '22:00', fechaFin: '', motivo: '' })
  const [estado, setEstado] = useState({ enviando: false, error: null, ok: null })

  async function enviar(datos, ok) {
    setEstado({ enviando: true, error: null, ok: null })
    try {
      await pedirJson('/api/admin/bloqueos', { method: 'POST', body: datos })
      setEstado({ enviando: false, error: null, ok })
      if (datos.accion === 'crear') setF({ fecha: '', desde: '09:00', hasta: '22:00', fechaFin: '', motivo: '' })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setEstado({ enviando: false, error: e.message, ok: null })
    }
  }

  return (
    <Panel titulo="Bloqueos" sub="Horas en las que nadie puede reservar." clase="adm-ajustes">
      <SubmenuAjustes />
      <div className="adm-ajustes__pila">
        <Tarjeta titulo="Cerrar unas horas" nota="También puedes hacerlo desde Añadir: «Bloquear el sábado por la mañana».">
          <form onSubmit={(e) => { e.preventDefault(); enviar({ accion: 'crear', ...f }, 'Horas bloqueadas.') }}>
            <div className="adm-form">
              <label>Día<input type="date" required value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
              <label>Hasta el día (si son varios)<input type="date" value={f.fechaFin} min={f.fecha || undefined} onChange={(e) => setF({ ...f, fechaFin: e.target.value })} /></label>
              <label>Desde<input type="time" step="1800" required value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label>
              <label>Hasta<input type="time" step="1800" required value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label>
              <label className="adm-ancho">Motivo (solo lo veis vosotros)<input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Grabación de Ari, vacaciones…" /></label>
            </div>
            {estado.ok && <p className="adm-mensaje" role="status">{estado.ok}</p>}
            {estado.error && <p className="adm-mensaje is-error" role="alert">{estado.error}</p>}
            <div className="adm-ajustes__botones"><Boton type="submit" icono="candado" disabled={estado.enviando}>Bloquear</Boton></div>
          </form>
        </Tarjeta>

        <Tarjeta titulo="Próximos bloqueos" tabla={bloqueos.length > 0}>
          {bloqueos.length === 0 ? <Vacio compacto texto="No hay ningún bloqueo próximo." /> : (
            <div className="ui-tabla-caja">
              <table className="ui-tabla adm-ajustes__tabla">
                <thead><tr><th scope="col">Desde</th><th scope="col">Hasta</th><th scope="col">Motivo</th><th scope="col"><span className="ui-solo-lector">Quitar</span></th></tr></thead>
                <tbody>
                  {bloqueos.map((b) => (
                    <tr key={b.id}>
                      <td>{b.desde}</td><td>{b.hasta}</td><td>{b.motivo || <span className="ui-t3">—</span>}</td>
                      <td className="der"><Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => enviar({ accion: 'borrar', id: b.id }, 'Bloqueo quitado.')}>Quitar</Boton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const bloqueos = await listarBloqueos({ desde: new Date() })
  const texto = (d) => `${textoFecha(fechaMadrid(d))}, ${horaMadrid(d)}`
  return { props: { bloqueos: bloqueos.map((b) => ({ id: b.id, desde: texto(b.inicio), hasta: texto(b.fin), motivo: b.motivo })) } }
}
