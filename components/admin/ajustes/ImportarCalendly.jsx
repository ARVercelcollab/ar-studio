// Ajustes › Calendly › Importar reservas de Calendly (el CSV de «Eventos programados → Exportar»).
// Dos pasos: «Revisar el archivo» (no toca nada) y «Importar N reservas».
import { useRef, useState } from 'react'
import { Tarjeta, Boton, Tabla, Aviso } from '../ui'
import { pedirJson } from '../../../lib/reservas/navegador'

const MAX_BYTES = 3 * 1024 * 1024
const ESTADOS = { futura: 'Futura · ocupa su hora', pasada: 'Pasada', cancelada: 'Cancelada' }
const fechaCorta = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

function Cifras({ r }) {
  const filas = [
    ['Filas en el archivo', r.filas],
    ['Nuevas para importar', r.nuevas, true],
    ['· futuras (ocuparán su hora)', r.futuras],
    ['· pasadas (al historial)', r.pasadas],
    ['· canceladas (al historial)', r.canceladas],
    ['Ya importadas antes (se saltan)', r.yaImportadas],
    ['Ya apuntadas a mano en el panel (se saltan)', r.yaEnPanel],
    ['Con problemas (no se importan)', r.conError],
  ]
  return (
    <dl className="aj-importar__cifras">
      {filas.filter(([, n], i) => i < 2 || n > 0).map(([t, n, fuerte]) => (
        <div key={t} className={fuerte ? 'is-fuerte' : undefined}><dt>{t}</dt><dd className="ui-num">{n}</dd></div>
      ))}
    </dl>
  )
}

function Problemas({ lista }) {
  if (!lista?.length) return null
  const errores = lista.filter((p) => p.tipo === 'error').length
  return (
    <details className="aj-importar__problemas" open={errores > 0 && lista.length <= 20}>
      <summary>{plural(lista.length, 'cosa que revisar', 'cosas que revisar')}{errores ? ` (${plural(errores, 'fila no se importa', 'filas no se importan')})` : ''}</summary>
      <Tabla columnas={[{ texto: 'Fila' }, { texto: 'Reserva' }, { texto: 'Qué pasa' }]}>
        {lista.slice(0, 300).map((p, i) => (
          <tr key={`${p.fila}-${i}`} className={p.tipo === 'error' ? 'aj-importar__error' : undefined}>
            <td className="ui-num">{p.fila}</td>
            <td>{p.nombre || '—'}{p.cuando ? <small className="ui-t3"> · {p.cuando}</small> : null}</td>
            <td>{p.tipo === 'error' ? <b>No se importa. </b> : null}{p.texto}</td>
          </tr>
        ))}
      </Tabla>
      {lista.length > 300 && <p className="ui-t3">Y {lista.length - 300} más.</p>}
    </details>
  )
}

function Muestra({ titulo, filas }) {
  if (!filas?.length) return null
  return (
    <div className="aj-importar__muestra">
      <h3>{titulo}</h3>
      <Tabla columnas={[{ texto: 'Día' }, { texto: 'Hora' }, { texto: 'Cliente' }, { texto: 'Estado' }]}>
        {filas.map((f) => (
          <tr key={`${f.fila}`}>
            <td className="ui-num">{fechaCorta(f.fecha)}</td>
            <td className="ui-num">{f.desde}–{f.hasta}</td>
            <td>{f.nombre}{f.email ? <small className="ui-t3"> · {f.email}</small> : null}</td>
            <td>{ESTADOS[f.estado]}</td>
          </tr>
        ))}
      </Tabla>
    </div>
  )
}

export default function ImportarCalendly() {
  const refArchivo = useRef(null)
  const [archivo, setArchivo] = useState(null) // { nombre, texto }
  const [zona, setZona] = useState('madrid')
  const [estado, setEstado] = useState({ cargando: false, error: null })
  const [revision, setRevision] = useState(null)
  const [hecho, setHecho] = useState(null)

  function elegir(e) {
    const f = e.target.files?.[0]
    setRevision(null)
    setHecho(null)
    setEstado({ cargando: false, error: null })
    if (!f) return setArchivo(null)
    if (f.size > MAX_BYTES) {
      setArchivo(null)
      return setEstado({ cargando: false, error: 'El archivo pesa más de 3 MB. Exporta un rango de fechas más corto.' })
    }
    const lector = new FileReader()
    lector.onload = () => setArchivo({ nombre: f.name, texto: String(lector.result || '') })
    lector.onerror = () => setEstado({ cargando: false, error: 'No se ha podido leer el archivo.' })
    lector.readAsText(f, 'utf-8')
  }

  async function enviar(confirmar) {
    if (!archivo || estado.cargando) return
    setEstado({ cargando: true, error: null })
    try {
      const r = await pedirJson('/api/admin/calendly/importar', { method: 'POST', body: { csv: archivo.texto, zona, confirmar } })
      if (confirmar) {
        setHecho(r)
        setRevision(null)
      } else {
        setRevision(r)
      }
      setEstado({ cargando: false, error: null })
    } catch (e) {
      setEstado({ cargando: false, error: e.message })
    }
  }

  function otra() {
    setArchivo(null)
    setRevision(null)
    setHecho(null)
    if (refArchivo.current) refArchivo.current.value = ''
  }

  const r = revision?.resumen
  return (
    <Tarjeta id="importar" titulo="Importar reservas de Calendly" className="aj-importar"
      nota="Sube el archivo que exporta Calendly (Eventos programados → Exportar). Las reservas futuras ocuparán su hora y las pasadas irán a las fichas de los clientes. Se puede subir varias veces: lo ya importado se salta.">
      {!hecho && (
        <div className="aj-importar__paso">
          <label className="aj-importar__archivo">Archivo CSV de Calendly
            <input ref={refArchivo} type="file" accept=".csv,text/csv" onChange={elegir} />
          </label>
          <fieldset className="aj-importar__zona">
            <legend>Las horas del archivo están en</legend>
            <label><input type="radio" name="zona" value="madrid" checked={zona === 'madrid'} onChange={() => { setZona('madrid'); setRevision(null) }} /> Hora de Madrid (la de la cuenta del estudio)</label>
            <label><input type="radio" name="zona" value="invitado" checked={zona === 'invitado'} onChange={() => { setZona('invitado'); setRevision(null) }} /> Zona horaria de cada persona</label>
          </fieldset>
          <div className="adm-acciones">
            <Boton variante={revision ? 'secundario' : 'primario'} disabled={!archivo || estado.cargando} onClick={() => enviar(false)}>
              {estado.cargando && !revision ? 'Revisando…' : revision ? 'Revisar otra vez' : 'Revisar el archivo'}
            </Boton>
          </div>
        </div>
      )}

      {estado.error && <Aviso tono="mal">{estado.error}</Aviso>}

      {revision && r && (
        <div className="aj-importar__revision" aria-live="polite">
          <h3>Antes de importar</h3>
          <p className="ui-t3">Columnas reconocidas: {revision.columnas.reconocidas.join(', ')}.{revision.columnas.noReconocidas.length ? ` Sin usar: ${revision.columnas.noReconocidas.join(', ')}.` : ''}</p>
          {revision.avisoOrden && <Aviso tono="aviso">{revision.avisoOrden}</Aviso>}
          <Cifras r={r} />
          {r.estimadas > 0 && <p className="ui-t3">{plural(r.estimadas, 'reserva no trae', 'reservas no traen')} el importe: se pone el precio de la web y se marca como estimado. El dinero de Calendly no cambia: se sigue apuntando por meses.</p>}
          <Problemas lista={revision.problemas} />
          <Muestra titulo="Próximas que ocuparán su hora" filas={revision.proximas} />
          <Muestra titulo="Las más recientes del archivo" filas={revision.muestra} />
          <div className="adm-acciones">
            <Boton disabled={!r.nuevas || estado.cargando} onClick={() => enviar(true)}>
              {estado.cargando ? 'Importando…' : r.nuevas ? `Importar ${plural(r.nuevas, 'reserva', 'reservas')}` : 'No hay nada nuevo que importar'}
            </Boton>
            <Boton variante="texto" disabled={estado.cargando} onClick={otra}>Cancelar</Boton>
          </div>
        </div>
      )}

      {hecho && (
        <div className="aj-importar__revision" aria-live="polite">
          <Aviso tono="info" icono="ok" titulo={hecho.mensaje} />
          {hecho.problemas?.length > 0 && <Problemas lista={hecho.problemas} />}
          <div className="adm-acciones">
            <Boton variante="secundario" href="/admin/reservas/clientes">Ver clientes</Boton>
            <Boton variante="secundario" href="/admin/reservas">Ver reservas</Boton>
            <Boton variante="texto" onClick={otra}>Subir otro archivo</Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  )
}
