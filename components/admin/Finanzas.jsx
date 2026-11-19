// Piezas de las páginas de Finanzas: submenú, selector de mes, avisos y formularios
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { Chip, Segmento } from './Panel'
import { pedirJson } from '../../lib/reservas/navegador'
import { euros, leerImporte, desgloseGasto, textoMes, sumarMesesMes, costeGasto } from '../../lib/finanzas/calculos'
import { GRUPOS, TIPOS_FACTURA, TIPOS_FACTURA_CORTO, RETENCIONES, METODOS_GASTO, METODOS_INGRESO, TIPOS_INGRESO, CADA_MESES } from '../../lib/finanzas/config'
import { desglose } from '../../lib/facturas/iva'

const PESTANAS = [
  ['/admin/finanzas', 'Resumen'],
  ['/admin/finanzas/ingresos', 'Facturación'],
  ['/admin/finanzas/gastos', 'Gastos'],
  ['/admin/finanzas/fijos', 'Gastos fijos'],
]

export function SubmenuFinanzas({ p }) {
  const { pathname } = useRouter()
  return (
    <nav className="adm-filtros adm-fin-submenu" aria-label="Finanzas">
      {PESTANAS.map(([href, t]) => {
        const activo = href === '/admin/finanzas' ? pathname === href : pathname.startsWith(href)
        const conP = p && href !== '/admin/finanzas/fijos' ? `${href}?p=${p}` : href
        return <Link key={href} href={conP} className={activo ? 'is-activo' : ''}>{t}</Link>
      })}
    </nav>
  )
}

export function SelectorMes({ valor, onCambio, desde, hasta, extra = [] }) {
  const meses = []
  for (let m = hasta; m >= desde; m = sumarMesesMes(m, -1)) meses.push(m)
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)}>
      {extra.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      {meses.map((m) => <option key={m} value={m}>{textoMes(m)}</option>)}
    </select>
  )
}

export function MensajeOk({ texto }) {
  if (!texto) return null
  return <p className="adm-mensaje">{texto}</p>
}

export function useAccion() {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: false, mensaje: null, error: false })
  async function ejecutar(url, datos, { despues, recargar = true } = {}) {
    setEstado({ enviando: true, mensaje: null, error: false })
    try {
      const r = await pedirJson(url, { method: 'POST', body: datos })
      if (despues) {
        await despues(r)
        setEstado({ enviando: false, mensaje: null, error: false })
        return r
      }
      setEstado({ enviando: false, mensaje: r?.mensaje || 'Hecho.', error: false })
      if (recargar) router.replace(router.asPath, undefined, { scroll: false })
      return r
    } catch (e) {
      setEstado({ enviando: false, mensaje: e.message, error: true })
      return null
    }
  }
  return [estado, ejecutar]
}

export function Mensaje({ estado }) {
  if (!estado.mensaje) return null
  return <p className={`adm-mensaje${estado.error ? ' is-error' : ''}`}>{estado.mensaje}</p>
}

// Recuadro «Para revisar»
export function ParaRevisar({ avisos }) {
  const [estado, ejecutar] = useAccion()
  if (!avisos.length) return null
  const fila = (a) => (
    <li key={a.clave} className={a.urgente ? 'is-urgente' : ''}>
      <span>{a.texto}</span>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {a.boton && <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/avisos', { clave: a.clave })}>{a.boton}</button>}
        {a.enlace && <Link href={a.enlace}>{a.textoEnlace}</Link>}
      </span>
    </li>
  )
  return (
    <div className="adm-caja">
      <h2>Para revisar</h2>
      <ul className="adm-tareas">{avisos.slice(0, 8).map(fila)}</ul>
      {avisos.length > 8 && <details><summary>y {avisos.length - 8} más</summary><ul className="adm-tareas">{avisos.slice(8).map(fila)}</ul></details>}
      <Mensaje estado={estado} />
    </div>
  )
}

const ivaTexto = (v) => (v === 'mano' ? 'IVA a mano' : `IVA ${v} %`)

// ---------- Formulario de gasto (alta y edición) ----------

export function FormularioGasto({ datos, hoy, inicial = null, gasto = null, fijo = null, volver = '/admin/finanzas/gastos', categoriaInicial = null }) {
  const router = useRouter()
  const { categorias, ultimos, proveedores } = datos
  const porId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias])
  const vacio = (catId) => {
    const c = porId[catId]
    return {
      categoriaId: catId || '',
      importeEs: c && c.retencionPct > 0 ? 'base' : 'pagado',
      importe: '',
      fecha: hoy,
      concepto: '',
      proveedor: '',
      numFactura: '',
      tipoFactura: c?.tipoFactura || 'nif',
      ivaPct: c?.ivaPct ?? 21,
      iva: '',
      retencionPct: c?.retencionPct ?? 0,
      metodoPago: '',
      enlace: '',
      nota: '',
    }
  }
  const [f, setF] = useState(() => inicial || vacio(categoriaInicial))
  const [clave] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-gasto`))
  const [claveActual, setClaveActual] = useState(clave)
  const [estado, setEstado] = useState({ enviando: false, error: null, ok: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const elegirCategoria = (id) => {
    const c = porId[id]
    setF((x) => ({ ...x, categoriaId: id, tipoFactura: c.tipoFactura, ivaPct: c.ivaPct ?? 21, retencionPct: c.retencionPct, importeEs: c.retencionPct > 0 ? 'base' : x.importeEs }))
  }
  const cat = porId[f.categoriaId]
  const ultimo = !gasto && f.categoriaId ? ultimos[f.categoriaId] : null
  const conIva = ['nif', 'ticket'].includes(f.tipoFactura)
  const imp = leerImporte(f.importe)
  const des = imp ? desgloseGasto({ importeCent: imp, importeEs: f.importeEs, tipoFactura: f.tipoFactura, ivaPct: conIva ? f.ivaPct : null, ivaCent: f.ivaPct === 'mano' ? leerImporte(f.iva) : null, retencionPct: Number(f.retencionPct) }) : null
  const linea = des?.ok
    ? `Base ${euros(des.baseCent, { decimales: true })} + IVA ${euros(des.ivaCent, { decimales: true })}${des.retencionCent ? ` − retención ${euros(des.retencionCent, { decimales: true })} = pagas al proveedor ${euros(des.totalCent, { decimales: true })}` : ` = ${euros(des.totalCent, { decimales: true })}`}${f.tipoFactura === 'ticket' ? ` · cuenta como gasto ${euros(costeGasto({ ...des, tipoFactura: 'ticket' }), { decimales: true })} (el IVA no se descuenta)` : ''}`
    : des ? des.texto : ''
  const resumenFactura = `${TIPOS_FACTURA_CORTO[f.tipoFactura]}${conIva ? ` · ${ivaTexto(f.ivaPct)}` : ''} · ${Number(f.retencionPct) ? `retención ${f.retencionPct} %` : 'sin retención'}`
  const comoLaUltima = () => {
    const u = ultimo
    setF((x) => ({
      ...x,
      importe: euros(x.importeEs === 'base' ? u.baseCent : u.totalCent, { decimales: true }).replace(' €', '').replace(/\./g, ''),
      concepto: u.concepto, proveedor: u.proveedor, tipoFactura: u.tipoFactura, ivaPct: u.ivaPct === 'mano' ? x.ivaPct : u.ivaPct,
      retencionPct: u.retencionPct, metodoPago: u.metodoPago || '',
    }))
  }

  async function guardar(otro = false) {
    setEstado({ enviando: true, error: null, ok: null })
    try {
      const cuerpo = { ...f, clave: claveActual, ivaPct: conIva ? f.ivaPct : null }
      const r = gasto
        ? await pedirJson(`/api/admin/finanzas/gastos/${gasto.id}`, { method: 'POST', body: { ...cuerpo, accion: 'editar', version: gasto.version } })
        : await pedirJson('/api/admin/finanzas/gastos/nuevo', { method: 'POST', body: cuerpo })
      if (otro) {
        setF({ ...vacio(null), fecha: f.fecha })
        setClaveActual(`${clave}-${Date.now()}`)
        setEstado({ enviando: false, error: null, ok: `Apuntado: ${r.concepto} · ${euros(r.totalCent, { decimales: true })}` })
        return
      }
      const destino = volver.startsWith('/admin') ? volver : '/admin/finanzas/gastos'
      router.push(`${destino}${destino.includes('?') ? '&' : '?'}ok=${gasto ? 'cambiado' : 'gasto'}:${r.id}`)
    } catch (e) {
      setEstado({ enviando: false, error: e.message, ok: null })
    }
  }

  return (
    <form className="adm-caja adm-fin-form" onSubmit={(e) => { e.preventDefault(); guardar(false) }}>
      {!fijo && <p className="adm-nota">No apuntes aquí el IVA ni el IRPF que pagáis a Hacienda, ni la cuota de autónomos: no son gastos del estudio.</p>}
      {fijo && <p className="adm-nota">Este cambio es solo para {textoMes(gasto.mes.slice(0, 7))}. Para cambiarlo todos los meses, ve a <Link href="/admin/finanzas/fijos" className="adm-enlace">Gastos fijos</Link>.</p>}
      <h2>¿Qué es?</h2>
      {fijo ? (
        <p><Chip tipo="plan">{cat?.nombre}</Chip></p>
      ) : (
        ['variable', 'material', 'fijo'].map((g) => {
          const cs = categorias.filter((c) => c.grupo === g && (c.activa || c.id === Number(f.categoriaId)))
          if (!cs.length) return null
          return (
            <div key={g} className="adm-fin-grupo">
              <h3>{GRUPOS.find((x) => x[0] === g)[1]}</h3>
              <div className="adm-fin-chips">
                {cs.map((c) => (
                  <button key={c.id} type="button" className={Number(f.categoriaId) === c.id ? 'is-activo' : ''} aria-pressed={Number(f.categoriaId) === c.id} onClick={() => elegirCategoria(c.id)}>{c.nombre}</button>
                ))}
              </div>
            </div>
          )
        })
      )}
      {cat?.ayuda && <p className="adm-nota">{cat.ayuda}</p>}

      <h2 style={{ marginTop: 18 }}>¿Cuánto?</h2>
      <Segmento opciones={[['pagado', 'Lo que has pagado'], ['base', 'Sin IVA (base)']]} valor={f.importeEs} onCambio={(v) => poner('importeEs', v)} />
      <div className="adm-form">
        <label className="adm-ancho">{f.importeEs === 'base' ? 'Importe sin IVA (€)' : 'Importe pagado (€)'}
          <input className="adm-fin-importe" inputMode="decimal" placeholder="0,00" value={f.importe} onChange={(e) => poner('importe', e.target.value)} required />
        </label>
        {ultimo && <p className="adm-ancho"><button type="button" className="adm-chip adm-chip--gris adm-chip--boton" onClick={comoLaUltima}>Como la última vez: {euros(ultimo.totalCent, { decimales: true })}</button></p>}
        <p className={`adm-ancho ${des && !des.ok ? 'adm-notas' : 'adm-nota'}`} aria-live="polite">{linea}</p>
        <label>Fecha de la factura (o del cargo)
          <input type="date" value={f.fecha} max={fijo ? undefined : hoy} onChange={(e) => poner('fecha', e.target.value)} required />
        </label>
        {!fijo && (
          <p style={{ alignSelf: 'end', display: 'flex', gap: 6 }}>
            <button type="button" className="adm-chip adm-chip--gris adm-chip--boton" onClick={() => poner('fecha', hoy)}>Hoy</button>
            <button type="button" className="adm-chip adm-chip--gris adm-chip--boton" onClick={() => {
              const d = new Date(`${hoy}T12:00:00Z`)
              d.setUTCDate(d.getUTCDate() - 1)
              poner('fecha', d.toISOString().slice(0, 10))
            }}>Ayer</button>
          </p>
        )}
        <label className="adm-ancho">Concepto (opcional)<input value={f.concepto} placeholder={cat?.nombre || ''} onChange={(e) => poner('concepto', e.target.value)} /></label>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary>Factura, IVA y proveedor: {resumenFactura} · cambiar</summary>
        <div className="adm-form">
          <fieldset className="adm-ancho adm-fin-radios">
            <legend>¿Cómo es la factura?</legend>
            {TIPOS_FACTURA.map(([id, t]) => (
              <label key={id} className="adm-check"><input type="radio" name="tipoFactura" checked={f.tipoFactura === id} onChange={() => poner('tipoFactura', id)} /> {t}</label>
            ))}
            <p className="adm-nota">Los recibos de la luz, el agua o internet son facturas: si llevan el NIF de la titular, elige la primera.</p>
          </fieldset>
          {conIva && (
            <div className="adm-ancho">
              <span className="adm-fin-etq">IVA de la factura</span>
              <Segmento opciones={[[21, '21 %'], [10, '10 %'], [4, '4 %'], ['mano', 'A mano']]} valor={f.ivaPct} onCambio={(v) => poner('ivaPct', v)} />
              {f.ivaPct === 'mano' && <label>IVA en euros (el total que pone la factura)<input inputMode="decimal" value={f.iva} onChange={(e) => poner('iva', e.target.value)} /></label>}
            </div>
          )}
          <div className="adm-ancho">
            <span className="adm-fin-etq">Retención de IRPF</span>
            <Segmento opciones={RETENCIONES.map(([p, t]) => [p, t])} valor={Number(f.retencionPct)} onCambio={(v) => poner('retencionPct', v)} />
            <p className="adm-nota">Solo si la factura pone «Retención IRPF». Lo retenido no se paga al proveedor: lo ingresa la gestoría a Hacienda (alquiler: modelo 115; profesionales: modelo 111).</p>
          </div>
          <label>Proveedor
            <input list="proveedores" value={f.proveedor} onChange={(e) => poner('proveedor', e.target.value)} />
            <datalist id="proveedores">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label>N.º de factura<input value={f.numFactura} onChange={(e) => poner('numFactura', e.target.value)} /></label>
          <label>Cómo se pagó
            <select value={f.metodoPago} onChange={(e) => poner('metodoPago', e.target.value)}>
              <option value="">Sin indicar</option>
              {METODOS_GASTO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
            </select>
          </label>
          <label>Enlace a la factura (Drive)<input value={f.enlace} placeholder="https://drive.google.com/…" onChange={(e) => poner('enlace', e.target.value)} /></label>
          <label className="adm-ancho">Nota<textarea value={f.nota} onChange={(e) => poner('nota', e.target.value)} /></label>
        </div>
      </details>

      {estado.ok && <p className="adm-mensaje">{estado.ok}</p>}
      {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
      <div className="adm-acciones adm-fin-botones">
        <button type="submit" className="adm-boton" disabled={estado.enviando || !f.categoriaId}>{estado.enviando ? 'Guardando…' : 'Guardar gasto'}</button>
        {!gasto && <button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando || !f.categoriaId} onClick={() => guardar(true)}>Guardar y apuntar otro</button>}
      </div>
    </form>
  )
}

// ---------- Formulario de otro ingreso ----------

export function FormularioIngreso({ hoy, reservas, inicial = null, ingreso = null, reservaInicial = null, sentidoInicial = 'cobro' }) {
  const router = useRouter()
  const [f, setF] = useState(() => inicial || {
    tipo: 'extras', sentido: sentidoInicial, fecha: hoy, concepto: '', importe: '', ivaPct: 21, iva: '', reservaId: reservaInicial ? String(reservaInicial) : '',
    facturaRef: '', clienteNombre: '', clienteNif: '', metodoPago: '', enlace: '', nota: '',
  })
  const [clave] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-ingreso`))
  const [estado, setEstado] = useState({ enviando: false, error: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const imp = leerImporte(f.importe)
  const d = imp ? (f.ivaPct === 'mano' ? { baseCent: imp - (leerImporte(f.iva) || 0), ivaCent: leerImporte(f.iva) || 0 } : desglose(imp, Number(f.ivaPct))) : null
  const ejemplo = { extras: 'Fondo blanco 3 m', factura_manual: 'Horas extra · empresa X', otro: 'Colaboración con…' }[f.tipo]
  async function guardar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: null })
    try {
      const r = ingreso
        ? await pedirJson(`/api/admin/finanzas/ingresos/${ingreso.id}`, { method: 'POST', body: { ...f, accion: 'editar', version: ingreso.version } })
        : await pedirJson('/api/admin/finanzas/ingresos/nuevo', { method: 'POST', body: { ...f, clave } })
      router.push(`/admin/finanzas/ingresos?ok=ingreso:${r.id}`)
    } catch (err) {
      setEstado({ enviando: false, error: err.message })
    }
  }
  return (
    <form className="adm-caja adm-fin-form" onSubmit={guardar}>
      <h2>¿Qué es?</h2>
      <div className="adm-fin-chips adm-fin-chips--3">
        {TIPOS_INGRESO.map(([id, t]) => <button key={id} type="button" className={f.tipo === id ? 'is-activo' : ''} aria-pressed={f.tipo === id} onClick={() => poner('tipo', id)}>{t}</button>)}
      </div>
      <p className="adm-nota">
        {f.sentido === 'devolucion'
          ? 'Para dinero devuelto que no se puede apuntar en el panel, por ejemplo unas horas aparte pagadas de una sesión cancelada por la baja, o un pago que llegó después de cancelar. Elige la reserva.'
          : f.tipo === 'extras' ? 'Lo que se cobra el día de la reserva aparte del alquiler: fondos (20 € + IVA por metro), kit de podcast, teleprompter…'
            : f.tipo === 'factura_manual' ? 'Facturas hechas fuera del panel. Si es de una reserva o de unas horas aparte que ya están en el panel como pagadas, no la apuntes: ya cuenta.' : 'Cualquier otro ingreso que no pase por el panel.'}
      </p>
      <div style={{ margin: '12px 0' }}><Segmento opciones={[['cobro', 'Cobro'], ['devolucion', 'Devolución']]} valor={f.sentido} onCambio={(v) => poner('sentido', v)} /></div>
      <div className="adm-form">
        <label className="adm-ancho">Concepto<input required value={f.concepto} placeholder={ejemplo} onChange={(e) => poner('concepto', e.target.value)} /></label>
        <label>Importe (con IVA, €)<input className="adm-fin-importe" inputMode="decimal" required placeholder="0,00" value={f.importe} onChange={(e) => poner('importe', e.target.value)} /></label>
        <label>{f.sentido === 'devolucion' ? 'Fecha de la devolución' : 'Fecha'}<input type="date" max={hoy} required value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
        <div className="adm-ancho">
          <span className="adm-fin-etq">IVA</span>
          <Segmento opciones={[[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Sin IVA'], ['mano', 'A mano']]} valor={f.ivaPct} onCambio={(v) => poner('ivaPct', v)} />
          {f.ivaPct === 'mano' && <label>IVA en euros<input inputMode="decimal" value={f.iva} onChange={(e) => poner('iva', e.target.value)} /></label>}
          {d && <p className="adm-nota" aria-live="polite">Base {euros(d.baseCent, { decimales: true })} · IVA {euros(d.ivaCent, { decimales: true })}</p>}
        </div>
        <label className="adm-ancho">¿De qué reserva? (opcional)
          <select value={f.reservaId} onChange={(e) => poner('reservaId', e.target.value)}>
            <option value="">Ninguna</option>
            {reservas.map((r) => <option key={r.id} value={r.id}>{r.texto}</option>)}
          </select>
        </label>
        <label>N.º de factura{f.tipo === 'factura_manual' && f.sentido === 'cobro' ? '' : ' (opcional)'}<input value={f.facturaRef} placeholder="AR-M-2026-002" onChange={(e) => poner('facturaRef', e.target.value)} /></label>
        <label>Cómo se cobró
          <select value={f.metodoPago} onChange={(e) => poner('metodoPago', e.target.value)}>
            <option value="">Sin indicar</option>
            {METODOS_INGRESO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select>
        </label>
        {f.tipo === 'factura_manual' && (
          <>
            <label>Cliente<input value={f.clienteNombre} onChange={(e) => poner('clienteNombre', e.target.value)} /></label>
            <label>NIF<input value={f.clienteNif} onChange={(e) => poner('clienteNif', e.target.value)} /></label>
          </>
        )}
        <label>Enlace (opcional)<input value={f.enlace} placeholder="https://…" onChange={(e) => poner('enlace', e.target.value)} /></label>
        <label className="adm-ancho">Nota<textarea value={f.nota} onChange={(e) => poner('nota', e.target.value)} /></label>
      </div>
      {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
      <div className="adm-acciones adm-fin-botones">
        <button type="submit" className="adm-boton" disabled={estado.enviando}>{estado.enviando ? 'Guardando…' : ingreso ? 'Guardar cambios' : 'Apuntar'}</button>
      </div>
    </form>
  )
}

// ---------- Formulario de gasto fijo ----------

export function FormularioFijo({ categorias, hoy, onHecho }) {
  const mesHoy = hoy.slice(0, 7)
  const [f, setF] = useState(() => {
    const c = categorias.find((x) => x.grupo === 'fijo' && x.activa) || categorias[0]
    return {
      concepto: '', categoriaId: c?.id || '', importeEs: c?.retencionPct > 0 ? 'base' : 'pagado', importe: '', cadaMeses: 1, dia: 1, desdeMes: mesHoy,
      tipoFactura: c?.tipoFactura || 'nif', ivaPct: c?.ivaPct ?? 21, retencionPct: c?.retencionPct ?? 0, metodoPago: 'domiciliacion', proveedor: '', nota: '',
    }
  })
  const [estado, ejecutar] = useAccion()
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const porId = Object.fromEntries(categorias.map((c) => [c.id, c]))
  const elegirCategoria = (id) => {
    const c = porId[id]
    setF((x) => ({ ...x, categoriaId: id, tipoFactura: c.tipoFactura, ivaPct: c.ivaPct ?? 21, retencionPct: c.retencionPct, importeEs: c.retencionPct > 0 ? 'base' : x.importeEs, concepto: x.concepto || c.nombre }))
  }
  const conIva = ['nif', 'ticket'].includes(f.tipoFactura)
  const imp = leerImporte(f.importe)
  const des = imp ? desgloseGasto({ importeCent: imp, importeEs: f.importeEs, tipoFactura: f.tipoFactura, ivaPct: conIva ? f.ivaPct : null, retencionPct: Number(f.retencionPct) }) : null
  return (
    <div className="adm-form">
      <label>Qué es<input value={f.concepto} placeholder="Alquiler del local" onChange={(e) => poner('concepto', e.target.value)} /></label>
      <label>Categoría
        <select value={f.categoriaId} onChange={(e) => elegirCategoria(Number(e.target.value))}>
          {['fijo', 'variable', 'material'].map((g) => (
            <optgroup key={g} label={GRUPOS.find((x) => x[0] === g)[1]}>
              {categorias.filter((c) => c.grupo === g && c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="adm-ancho">
        <span className="adm-fin-etq">¿Cuánto?</span>
        <Segmento opciones={[['pagado', 'Lo que has pagado'], ['base', 'Sin IVA (base)']]} valor={f.importeEs} onCambio={(v) => poner('importeEs', v)} />
      </div>
      <label>Importe (€)<input className="adm-fin-importe" inputMode="decimal" placeholder="0,00" value={f.importe} onChange={(e) => poner('importe', e.target.value)} /></label>
      <p className="adm-nota" style={{ alignSelf: 'end' }}>{des?.ok ? `Base ${euros(des.baseCent, { decimales: true })} + IVA ${euros(des.ivaCent, { decimales: true })}${des.retencionCent ? ` − retención ${euros(des.retencionCent, { decimales: true })}` : ''} = ${euros(des.totalCent, { decimales: true })}` : des?.texto || ''}</p>
      <label>Se paga
        <select value={f.cadaMeses} onChange={(e) => poner('cadaMeses', Number(e.target.value))}>{CADA_MESES.map(([n, t]) => <option key={n} value={n}>{t}</option>)}</select>
      </label>
      <label>Día del cargo<input type="number" min="1" max="31" value={f.dia} onChange={(e) => poner('dia', e.target.value)} /></label>
      <label>Desde
        <SelectorMes valor={f.desdeMes} onCambio={(v) => poner('desdeMes', v)} desde={sumarMesesMes(mesHoy, -24)} hasta={sumarMesesMes(mesHoy, 12)} />
      </label>
      <p className="adm-nota" style={{ alignSelf: 'end' }}>Si eliges un mes pasado, se apuntan también los meses de atrás. Si el mes tiene menos días, el último.</p>
      <label>Cómo es la factura
        <select value={f.tipoFactura} onChange={(e) => poner('tipoFactura', e.target.value)}>{TIPOS_FACTURA.map(([id]) => <option key={id} value={id}>{TIPOS_FACTURA_CORTO[id]}</option>)}</select>
      </label>
      {conIva ? (
        <label>IVA
          <select value={f.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>{[21, 10, 4].map((p) => <option key={p} value={p}>{p} %</option>)}</select>
        </label>
      ) : <div />}
      <label>Retención
        <select value={f.retencionPct} onChange={(e) => poner('retencionPct', Number(e.target.value))}>{RETENCIONES.map(([p, t]) => <option key={p} value={p}>{t}</option>)}</select>
      </label>
      <label>Cómo se paga
        <select value={f.metodoPago} onChange={(e) => poner('metodoPago', e.target.value)}>{METODOS_GASTO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select>
      </label>
      <label>Proveedor<input value={f.proveedor} onChange={(e) => poner('proveedor', e.target.value)} /></label>
      <label>Nota<input value={f.nota} onChange={(e) => poner('nota', e.target.value)} /></label>
      <p className="adm-ancho adm-nota">Si el IVA cambia cada mes (por ejemplo la luz), apúntalo como gasto variable cuando llegue la factura.</p>
      <div className="adm-ancho">
        <Mensaje estado={estado} />
        <button type="button" className="adm-boton" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/fijos/nuevo', f, { despues: onHecho })}>Guardar gasto fijo</button>
      </div>
    </div>
  )
}

export { euros }
