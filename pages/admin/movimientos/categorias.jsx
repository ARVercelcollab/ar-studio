// Categorías de los gastos: nombre, grupo, cómo suele ser la factura, IVA, retención y aviso si falta
import { useState } from 'react'
import { Boton } from '../../../components/admin/ui'
import Panel from '../../../components/admin/Panel'
import { useAccion, Mensaje } from '../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarCategorias } from '../../../lib/finanzas/servicio'
import { GRUPOS, TIPOS_FACTURA, TIPOS_FACTURA_CORTO, RETENCIONES } from '../../../lib/finanzas/config'

const AVISO = { 1: 'Cada mes', 2: 'Cada 2 meses', 3: 'Cada 3 meses' }

function Categorias({ categorias }) {
  const vacia = { nombre: '', grupo: 'variable', tipoFactura: 'nif', ivaPct: 21, retencionPct: 0, avisoCadaMeses: '' }
  const [nueva, setNueva] = useState(vacia)
  const [editando, setEditando] = useState(null)
  const [estado, ejecutar] = useAccion()
  const campos = (v, set) => (
    <>
      <label>Nombre<input value={v.nombre} onChange={(e) => set({ ...v, nombre: e.target.value })} /></label>
      <label>Grupo<select value={v.grupo} onChange={(e) => set({ ...v, grupo: e.target.value })}>{GRUPOS.map(([g, t]) => <option key={g} value={g}>{t}</option>)}</select></label>
      <label>Cómo es la factura<select value={v.tipoFactura} onChange={(e) => set({ ...v, tipoFactura: e.target.value })}>{TIPOS_FACTURA.map(([id]) => <option key={id} value={id}>{TIPOS_FACTURA_CORTO[id]}</option>)}</select></label>
      <label>IVA<select value={v.ivaPct ?? 21} onChange={(e) => set({ ...v, ivaPct: Number(e.target.value) })}>{[21, 10, 4].map((p) => <option key={p} value={p}>{p} %</option>)}</select></label>
      <label>Retención<select value={v.retencionPct} onChange={(e) => set({ ...v, retencionPct: Number(e.target.value) })}>{RETENCIONES.map(([p, t]) => <option key={p} value={p}>{t}</option>)}</select></label>
      <label>Avisar si falta<select value={v.avisoCadaMeses ?? ''} onChange={(e) => set({ ...v, avisoCadaMeses: e.target.value })}><option value="">No</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{AVISO[n]}</option>)}</select></label>
    </>
  )
  return (
    <div className="adm-caja">
      <div className="adm-scroll">
        <table className="adm-tabla">
          <thead><tr><th>Nombre</th><th>Grupo</th><th>Factura habitual</th><th>IVA</th><th>Retención</th><th>Avisar si falta</th><th /></tr></thead>
          <tbody>
            {categorias.map((c) => (editando?.id === c.id ? (
              <tr key={c.id}><td colSpan={7}><div className="adm-form">{campos(editando, setEditando)}</div>
                <p className="adm-nota">Si cambias el grupo, sus gastos de antes también cambian de grupo.</p>
                <div className="adm-acciones">
                  <button type="button" className="adm-boton adm-mini" disabled={estado.enviando} onClick={async () => { if (await ejecutar('/api/admin/finanzas/categorias', { accion: 'editar', ...editando })) setEditando(null) }}>Guardar</button>
                  <button type="button" className="adm-boton adm-boton--claro adm-mini" onClick={() => setEditando(null)}>Cancelar</button>
                </div></td></tr>
            ) : (
              <tr key={c.id} className={c.activa ? '' : 'is-apagado'}>
                <td>{c.nombre}</td><td>{GRUPOS.find((g) => g[0] === c.grupo)[1]}</td><td>{TIPOS_FACTURA_CORTO[c.tipoFactura]}</td>
                <td>{c.ivaPct ? `${c.ivaPct} %` : '—'}</td><td>{c.retencionPct ? `${c.retencionPct} %` : 'No'}</td><td>{AVISO[c.avisoCadaMeses] || 'No'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="adm-enlace" onClick={() => setEditando({ ...c, avisoCadaMeses: c.avisoCadaMeses ?? '' })}>Cambiar</button>{' · '}
                  <button type="button" className="adm-enlace" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/categorias', { accion: c.activa ? 'ocultar' : 'mostrar', id: c.id })}>{c.activa ? 'Ocultar' : 'Mostrar'}</button>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="adm-nota">Las ocultas no salen al apuntar, pero sí en los informes.</p>
      <h3 className="adm-fig__h3">Añadir categoría</h3>
      <div className="adm-form">{campos(nueva, setNueva)}</div>
      <Mensaje estado={estado} />
      <p style={{ marginTop: 10 }}><button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando} onClick={async () => { if (await ejecutar('/api/admin/finanzas/categorias', { accion: 'crear', ...nueva })) setNueva(vacia) }}>Añadir categoría</button></p>
    </div>
  )
}

export default function PaginaCategorias({ categorias }) {
  return (
    <Panel titulo="Categorías de gastos" sub="Cómo se agrupan los gastos en Movimientos y en Mes a mes." acciones={<Boton variante="secundario" href="/admin/movimientos" icono="izq">Movimientos</Boton>}>
      <Categorias categorias={categorias} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  return { props: JSON.parse(JSON.stringify({ categorias: await listarCategorias({ todas: true }) })) }
}
