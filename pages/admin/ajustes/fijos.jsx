// Ajustes › Gastos fijos: lo que se paga cada mes (o cada 2, 3, 6 o 12 meses) y se apunta solo en Movimientos
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Panel from '../../../components/admin/Panel'
import SubmenuAjustes from '../../../components/admin/ajustes/SubmenuAjustes'
import { Tarjeta, Boton, Etiqueta, Vacio } from '../../../components/admin/ui'
import { SelectorMes, FormularioFijo, useAccion, Mensaje } from '../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarGastosFijos, listarCategorias } from '../../../lib/finanzas/servicio'
import { euros, textoMes, sumarMesesMes } from '../../../lib/finanzas/calculos'
import { CADA_MESES, TIPOS_FACTURA, TIPOS_FACTURA_CORTO, RETENCIONES, METODOS_GASTO } from '../../../lib/finanzas/config'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

// 'nov 2026'
const corto = (m) => `${textoMes(m.slice(0, 7), { corto: true }).split(' ')[0]} ${m.slice(0, 4)}`

function textoImporte(f) {
  const d = f.desglose
  if (!d) return '—'
  const cada = CADA_MESES.find(([n]) => n === f.cadaMeses)?.[1].toLowerCase() || ''
  const cuanto = f.importeEs === 'base' ? `${euros(f.importeActualCent, { decimales: true })} + IVA${d.retencionCent ? ` (pagas ${euros(d.totalCent, { decimales: true })})` : ''}` : euros(f.importeActualCent, { decimales: true })
  return f.cadaMeses === 1 ? `${cuanto} al mes · día ${f.dia}` : `${cuanto} ${cada === 'una vez al año' ? 'una vez al año' : cada} · día ${f.dia}`
}

function Fijo({ f, hoy, categorias, onAviso }) {
  const mesHoy = hoy.slice(0, 7)
  const [abierto, setAbierto] = useState(null)
  const [importe, setImporte] = useState('')
  const [desdeMes, setDesdeMes] = useState(mesHoy < f.desdeMes.slice(0, 7) ? f.desdeMes.slice(0, 7) : mesHoy)
  const [ultimo, setUltimo] = useState(mesHoy)
  const [ed, setEd] = useState({ concepto: f.concepto, proveedor: f.proveedor, categoriaId: f.categoriaId, dia: f.dia, tipoFactura: f.tipoFactura, ivaPct: f.ivaPct ?? 21, retencionPct: f.retencionPct, metodoPago: f.metodoPago || '', nota: f.nota })
  const [estado, ejecutar] = useAccion()
  // Tras cada cambio (versión nueva), los formularios vuelven a los datos de ahora; el mensaje se queda
  useEffect(() => {
    setAbierto(null)
    setImporte('')
    setEd({ concepto: f.concepto, proveedor: f.proveedor, categoriaId: f.categoriaId, dia: f.dia, tipoFactura: f.tipoFactura, ivaPct: f.ivaPct ?? 21, retencionPct: f.retencionPct, metodoPago: f.metodoPago || '', nota: f.nota })
  }, [f.version]) // eslint-disable-line react-hooks/exhaustive-deps
  const url = `/api/admin/finanzas/fijos/${f.id}`
  // Al hacer algo en esta tarjeta, el aviso de arriba (de otra acción) se quita
  const hacer = (datos, opciones) => { onAviso(null, { recargar: false }); return ejecutar(url, datos, opciones) }
  const base = { version: f.version }
  const tope = [sumarMesesMes(mesHoy, 12), f.hastaMes ? f.hastaMes.slice(0, 7) : null].filter(Boolean).sort()[0]
  const alternar = (q) => setAbierto((a) => (a === q ? null : q))
  return (
    <div className={`adm-ajustes__fijo${f.activo ? '' : ' is-terminado'}`}>
      <div className="adm-ajustes__fijo-quien">
        <strong>{f.concepto}</strong> <Etiqueta>{f.categoria}</Etiqueta>
        <small>{textoImporte(f)} · desde {corto(f.desdeMes)}{f.hastaMes ? ` · último mes: ${corto(f.hastaMes)}` : ''}</small>
        {f.tramosFuturos.map((t) => (
          <small key={t.desdeMes}>Desde {corto(t.desdeMes)}: {euros(t.importeCent, { decimales: true })} · <button type="button" className="adm-ajustes__enlace-texto" disabled={estado.enviando} onClick={() => hacer({ ...base, accion: 'quitar_cambio', desdeMes: t.desdeMes.slice(0, 7) })}>Quitar este cambio</button></small>
        ))}
      </div>
      <div className="adm-ajustes__fijo-botones">
        {f.activo ? (
          <>
            <Boton variante="secundario" tam="peq" aria-expanded={abierto === 'importe'} onClick={() => alternar('importe')}>Cambiar importe</Boton>
            <Boton variante="secundario" tam="peq" aria-expanded={abierto === 'editar'} onClick={() => alternar('editar')}>Editar</Boton>
            <Boton variante="secundario" tam="peq" aria-expanded={abierto === 'terminar'} onClick={() => alternar('terminar')}>Ya no se paga</Boton>
          </>
        ) : (
          <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => hacer({ ...base, accion: 'quitar_final' })}>Quitar el final</Boton>
        )}
      </div>
      {abierto && (
        <div className="adm-ajustes__fijo-form">
          {abierto === 'importe' && (
            <div className="adm-form">
              <label>{f.importeEs === 'base' ? 'Nuevo importe (sin IVA)' : 'Nuevo importe (lo que pagas)'}<input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} /></label>
              <label>A partir de<SelectorMes valor={desdeMes} onCambio={setDesdeMes} desde={f.desdeMes.slice(0, 7)} hasta={tope} /></label>
              <p className="adm-ancho adm-nota">Se cambiarán también los meses ya apuntados desde ese mes, menos los que cambiasteis a mano.</p>
              <p className="adm-ancho"><Boton tam="peq" disabled={estado.enviando} onClick={() => hacer({ ...base, accion: 'importe', importe, desdeMes })}>Cambiar importe</Boton></p>
            </div>
          )}
          {abierto === 'editar' && (
            <div className="adm-form">
              <label>Qué es<input value={ed.concepto} onChange={(e) => setEd({ ...ed, concepto: e.target.value })} /></label>
              <label>Categoría<select value={ed.categoriaId} onChange={(e) => setEd({ ...ed, categoriaId: Number(e.target.value) })}>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
              <label>Día del cargo<input type="number" min="1" max="31" value={ed.dia} onChange={(e) => setEd({ ...ed, dia: e.target.value })} /></label>
              <label>Proveedor<input value={ed.proveedor} onChange={(e) => setEd({ ...ed, proveedor: e.target.value })} /></label>
              <label>Cómo es la factura<select value={ed.tipoFactura} onChange={(e) => setEd({ ...ed, tipoFactura: e.target.value })}>{TIPOS_FACTURA.map(([id]) => <option key={id} value={id}>{TIPOS_FACTURA_CORTO[id]}</option>)}</select></label>
              {['nif', 'ticket'].includes(ed.tipoFactura) ? <label>IVA<select value={ed.ivaPct} onChange={(e) => setEd({ ...ed, ivaPct: Number(e.target.value) })}>{[21, 10, 4].map((p) => <option key={p} value={p}>{p} %</option>)}</select></label> : <div />}
              <label>Retención<select value={ed.retencionPct} onChange={(e) => setEd({ ...ed, retencionPct: Number(e.target.value) })}>{RETENCIONES.map(([p, t]) => <option key={p} value={p}>{t}</option>)}</select></label>
              <label>Cómo se paga<select value={ed.metodoPago} onChange={(e) => setEd({ ...ed, metodoPago: e.target.value })}><option value="">Sin indicar</option>{METODOS_GASTO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></label>
              <label className="adm-ancho">Nota<input value={ed.nota} onChange={(e) => setEd({ ...ed, nota: e.target.value })} /></label>
              <p className="adm-ancho adm-nota">Los cambios valen desde este mes; los meses pasados no se tocan.</p>
              <div className="adm-ancho adm-acciones">
                <Boton tam="peq" disabled={estado.enviando} onClick={() => hacer({ ...base, ...ed, accion: 'editar' })}>Guardar</Boton>
                <button type="button" className="adm-ajustes__enlace-texto adm-ajustes__peligro" disabled={estado.enviando} onClick={() => { if (window.confirm(f.mesesApuntados === 1 ? 'Se borrará con su mes apuntado.' : f.mesesApuntados ? `Se borrará con sus ${f.mesesApuntados} meses apuntados.` : 'Se borrará este gasto fijo.')) hacer({ ...base, accion: 'borrar' }, { despues: (r) => onAviso(r?.mensaje || 'Gasto fijo borrado.') }) }}>Borrar (creado por error)</button>
              </div>
            </div>
          )}
          {abierto === 'terminar' && (
            <div className="adm-form">
              <label>Último mes que se paga<SelectorMes valor={ultimo} onCambio={setUltimo} desde={f.desdeMes.slice(0, 7)} hasta={sumarMesesMes(mesHoy, 12)} /></label>
              <p className="adm-nota" style={{ alignSelf: 'end' }}>Los meses de después se quitan, salvo los que cambiasteis a mano.</p>
              <p className="adm-ancho"><Boton tam="peq" disabled={estado.enviando} onClick={() => hacer({ ...base, accion: 'terminar', ultimoMes: ultimo })}>Terminar</Boton></p>
            </div>
          )}
        </div>
      )}
      {estado.mensaje && <div className="adm-ajustes__fijo-form"><Mensaje estado={estado} /></div>}
    </div>
  )
}

export default function GastosFijos({ d, categorias, hoy }) {
  const router = useRouter()
  const [nuevo, setNuevo] = useState(d.activos.length === 0)
  // Aviso arriba de la página: al crear uno nuevo o al borrar uno (su tarjeta desaparece)
  const [aviso, setAviso] = useState(null)
  const avisar = (m, { recargar = true } = {}) => { setAviso(m); if (recargar) router.replace(router.asPath, undefined, { scroll: false }) }
  return (
    <Panel titulo="Gastos fijos" sub="Se apuntan solos en Movimientos cada mes que toca." clase="adm-ajustes"
      acciones={<Boton icono={nuevo ? 'x' : 'mas'} variante={nuevo ? 'secundario' : 'primario'} aria-expanded={nuevo} onClick={() => setNuevo((v) => !v)}>{nuevo ? 'Cerrar' : 'Nuevo gasto fijo'}</Boton>}>
      <SubmenuAjustes />
      <div className="adm-ajustes__pila">
        <Tarjeta>
          <p className="adm-ajustes__cifra">Fijos al mes: <b className="ui-num ui-imp">{euros(d.alMes.conIvaCent)}</b> con IVA <span className="ui-t3">({euros(d.alMes.costeCent)} sin IVA)</span></p>
          <p className="adm-ajustes__texto">Aquí decidís cuáles hay y cuánto son. Si un mes cambia (la luz, el agua), cambiadlo en ese mes desde Movimientos. Los que se pagan cada 2, 3, 6 o 12 meses van repartidos por mes.</p>
        </Tarjeta>
        {aviso && <p className="adm-mensaje" role="status">{aviso}</p>}
        {nuevo && (
          <Tarjeta titulo="Nuevo gasto fijo">
            <FormularioFijo categorias={categorias} hoy={hoy} onHecho={(r) => { setNuevo(false); avisar(r?.mensaje || null) }} />
          </Tarjeta>
        )}
        <Tarjeta titulo="Los que se pagan ahora" className="adm-ajustes__fijos">
          {d.activos.length === 0 && !nuevo && <Vacio compacto texto="Aún no hay gastos fijos. Añade el alquiler, la alarma, internet, el seguro o la gestoría." />}
          {d.activos.map((f) => <Fijo key={f.id} f={f} hoy={hoy} categorias={categorias} onAviso={avisar} />)}
        </Tarjeta>
        {d.terminados.length > 0 && (
          <details className="ui-tarjeta adm-ajustes__fijos">
            <summary>Terminados ({d.terminados.length})</summary>
            <p className="adm-ajustes__texto">Si quitas el final, se apuntarán también los meses que faltan desde el final: si alguno no se pagó, marcadlo «Este mes no se paga».</p>
            {d.terminados.map((f) => <Fijo key={f.id} f={f} hoy={hoy} categorias={categorias} onAviso={avisar} />)}
          </details>
        )}
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const d = await listarGastosFijos({ hoy })
  return { props: JSON.parse(JSON.stringify({ d, categorias: await listarCategorias(), hoy })) }
}
