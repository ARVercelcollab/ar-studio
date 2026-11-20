// Festivos: esos días se abren y se cobran como un fin de semana (mínimo 4 horas)
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarFestivos } from '../../../lib/reservas/servicio'
import { fechaMadrid, textoFecha } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'

export default function Festivos({ festivos }) {
  const router = useRouter()
  const [f, setF] = useState({ fecha: '', nombre: '' })
  const [error, setError] = useState(null)

  async function enviar(datos) {
    setError(null)
    try {
      await pedirJson('/api/admin/festivos', { method: 'POST', body: datos })
      setF({ fecha: '', nombre: '' })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Panel titulo="Festivos">
      <div className="adm-caja">
        <p>Los festivos se reservan como un fin de semana: a partir de 4 horas y con precio de fin de semana. La lista inicial de València se sacó de prensa local en noviembre de 2026: compruébala con el calendario laboral oficial.</p>
      </div>
      <form className="adm-caja" onSubmit={(e) => { e.preventDefault(); enviar({ accion: 'guardar', ...f }) }}>
        <div className="adm-form">
          <label>Día<input type="date" required value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
          <label>Nombre<input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="San José" /></label>
        </div>
        {error && <p className="adm-mensaje is-error">{error}</p>}
        <p style={{ marginTop: 12 }}><button type="submit" className="adm-boton">Añadir festivo</button></p>
      </form>
      <div className="adm-caja">
        <table className="adm-tabla">
          <thead><tr><th>Día</th><th>Festivo</th><th /></tr></thead>
          <tbody>
            {festivos.map((x) => (
              <tr key={x.fecha}>
                <td>{x.texto}</td><td>{x.nombre}</td>
                <td><button type="button" className="adm-boton adm-boton--claro" onClick={() => enviar({ accion: 'borrar', fecha: x.fecha })}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const hoy = fechaMadrid(new Date())
  const festivos = (await listarFestivos()).filter((x) => x.fecha >= hoy)
  return { props: { festivos: festivos.map((x) => ({ ...x, texto: textoFecha(x.fecha) })) } }
}
