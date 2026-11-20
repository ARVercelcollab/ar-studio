// Ajustes › Festivos: esos días se abren y se cobran como un fin de semana (mínimo 4 horas)
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import SubmenuAjustes from '../../../components/admin/ajustes/SubmenuAjustes'
import { Tarjeta, Boton, Vacio, Aviso } from '../../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarFestivos } from '../../../lib/reservas/servicio'
import { fechaMadrid, textoFecha } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'

export default function Festivos({ festivos }) {
  const router = useRouter()
  const [f, setF] = useState({ fecha: '', nombre: '' })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(datos) {
    setError(null)
    setEnviando(true)
    try {
      await pedirJson('/api/admin/festivos', { method: 'POST', body: datos })
      setF({ fecha: '', nombre: '' })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Panel titulo="Festivos" sub="Se reservan como fin de semana: mínimo 4 horas y precio de finde." clase="adm-ajustes">
      <SubmenuAjustes />
      <div className="adm-ajustes__pila">
        <Aviso tono="info">La lista inicial de València se sacó de prensa local en noviembre de 2026: compruébala con el calendario laboral oficial.</Aviso>
        <Tarjeta titulo="Añadir un festivo">
          <form onSubmit={(e) => { e.preventDefault(); enviar({ accion: 'guardar', ...f }) }}>
            <div className="adm-form">
              <label>Día<input type="date" required value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
              <label>Nombre<input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="San José" /></label>
            </div>
            {error && <p className="adm-mensaje is-error" role="alert">{error}</p>}
            <div className="adm-ajustes__botones"><Boton type="submit" icono="mas" disabled={enviando}>Añadir festivo</Boton></div>
          </form>
        </Tarjeta>
        <Tarjeta titulo="Próximos festivos" tabla={festivos.length > 0}>
          {festivos.length === 0 ? <Vacio compacto texto="No hay festivos apuntados desde hoy." /> : (
            <div className="ui-tabla-caja">
              <table className="ui-tabla adm-ajustes__tabla">
                <thead><tr><th scope="col">Día</th><th scope="col">Festivo</th><th scope="col"><span className="ui-solo-lector">Quitar</span></th></tr></thead>
                <tbody>
                  {festivos.map((x) => (
                    <tr key={x.fecha}>
                      <td>{x.texto}</td><td>{x.nombre}</td>
                      <td className="der"><Boton variante="secundario" tam="peq" disabled={enviando} onClick={() => enviar({ accion: 'borrar', fecha: x.fecha })}>Quitar</Boton></td>
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
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const hoy = fechaMadrid(new Date())
  const festivos = (await listarFestivos()).filter((x) => x.fecha >= hoy)
  return { props: { festivos: festivos.map((x) => ({ ...x, texto: textoFecha(x.fecha) })) } }
}
