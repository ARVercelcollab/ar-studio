// Finanzas · Gastos: lo que se ha gastado en el periodo (fijos, variables y material)
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel, { Chip } from '../../../../components/admin/Panel'
import SelectorPeriodo from '../../../../components/admin/Periodo'
import { SubmenuFinanzas, MensajeOk, useAccion, Mensaje } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { listarGastos } from '../../../../lib/finanzas/servicio'
import { leerPeriodo, periodoActual, euros } from '../../../../lib/finanzas/calculos'
import { GRUPOS, TIPOS_FACTURA, TIPOS_FACTURA_CORTO, RETENCIONES } from '../../../../lib/finanzas/config'
import { fechaMadrid, textoFechaCorta } from '../../../../lib/reservas/tiempo'

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
    <details className="adm-caja">
      <summary>Categorías</summary>
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
    </details>
  )
}

export default function Gastos({ periodo, hoy, d, grupo, categoriaId, ok }) {
  const router = useRouter()
  const p = periodo.clave
  const cat = categoriaId ? d.categorias.find((c) => c.id === categoriaId) : null
  const filtro = (g) => ({ pathname: '/admin/finanzas/gastos', query: { p, ...(g ? { grupo: g } : {}) } })
  // ok=gasto:ID (nuevo) u ok=cambiado:ID (cambiado)
  const okCambiado = Boolean(ok && ok.startsWith('cambiado:'))
  const okId = ok && /^(gasto|cambiado):\d+$/.test(ok) ? Number(ok.split(':')[1]) : null
  const okFila = okId ? d.grupos.flatMap((g) => g.filas).find((f) => f.id === okId) : null
  return (
    <Panel titulo="Gastos" acciones={<Link href={`/admin/finanzas/gastos/nuevo?volver=${encodeURIComponent(router.asPath.split('?ok=')[0].split('&ok=')[0])}`} className="adm-boton">+ Apuntar gasto</Link>}>
      <SubmenuFinanzas p={p} />
      <SelectorPeriodo periodo={periodo} hoy={hoy} ruta="/admin/finanzas/gastos" extra={grupo ? { grupo } : {}} />
      <MensajeOk texto={okFila ? `${okCambiado ? 'Gasto cambiado' : 'Gasto apuntado'}: ${okFila.concepto} · ${euros(okFila.totalCent, { decimales: true })}.` : ok === 'borrado' ? 'Borrado.' : ok ? 'Guardado.' : null} />
      <div className="adm-filtros">
        {[[null, 'Todos'], ...GRUPOS].map(([g, t]) => <Link key={t} href={filtro(g)} className={(grupo || null) === g && !cat ? 'is-activo' : ''}>{t}</Link>)}
        {cat && <Link href={filtro(null)} className="is-activo">{cat.nombre} ×</Link>}
      </div>
      {d.recorte.sinDatos ? <div className="adm-caja"><p>Sin datos: lleváis aquí las cuentas desde {d.ajustes.desde}.</p></div> : (
        <>
          <p className="adm-grande">Gastos de {periodo.texto}: {euros(d.totales.costeCent)} <small className="adm-nota">sin IVA ({euros(d.totales.conIvaCent)} con IVA)</small></p>
          {d.grupos.every((g) => !g.filas.length) && (
            <div className="adm-caja">
              <p>No hay gastos en {periodo.texto}. Los fijos salen solos cada mes: añádelos en <Link href="/admin/finanzas/fijos" className="adm-enlace">Gastos fijos</Link>.</p>
              <p style={{ marginTop: 10 }}><Link href="/admin/finanzas/gastos/nuevo" className="adm-boton">+ Apuntar gasto</Link></p>
            </div>
          )}
          {d.grupos.filter((g) => g.filas.length).map((g) => (
            <section key={g.grupo} className="adm-dia">
              <h3>{g.texto} · {euros(g.costeCent)} sin IVA ({euros(g.conIvaCent)} con IVA)</h3>
              {g.filas.map((f) => (
                <Link key={f.id} href={`/admin/finanzas/gastos/${f.id}`} className={`adm-fila adm-fila--gasto${f.estado === 'anulado' ? ' is-anulado' : ''}`}>
                  <span className="adm-fila__hora">{textoFechaCorta(f.fecha)}</span>
                  <span className="adm-fila__quien">{f.concepto}<small>{[f.categoria, f.proveedor, f.numFactura].filter(Boolean).join(' · ')}</small></span>
                  <span className="num" style={{ textAlign: 'right' }}>{euros(f.totalCent, { decimales: true })}<small style={{ display: 'block' }} className="adm-nota">base {euros(f.baseCent, { decimales: true })}{f.retencionCent ? ` · retención ${euros(f.retencionCent, { decimales: true })}` : ''}</small></span>
                  <span className="adm-fila__chips">{f.chips.map((c) => <Chip key={c} tipo={c === 'Fijo' ? 'plan' : c === 'Ticket sin NIF' ? 'aviso' : 'gris'}>{c}</Chip>)}{f.enlace && <span className="adm-chip adm-chip--gris">factura</span>}</span>
                </Link>
              ))}
            </section>
          ))}
        </>
      )}
      <Categorias categorias={d.categorias} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const periodo = leerPeriodo(ctx.query.p, hoy) || periodoActual('mes', hoy)
  const grupo = GRUPOS.some(([g]) => g === ctx.query.grupo) ? ctx.query.grupo : null
  const categoriaId = /^\d+$/.test(String(ctx.query.categoria || '')) ? Number(ctx.query.categoria) : null
  const d = await listarGastos(periodo, { grupo, categoriaId })
  return { props: JSON.parse(JSON.stringify({ periodo, hoy, d, grupo, categoriaId, ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null })) }
}
