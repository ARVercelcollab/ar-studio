// Movimientos: todo lo que entra y sale, apunte a apunte (como Movimientos de Gartalia).
// Cobros de reservas y cuotas, lo de Calendly, otros ingresos, fianzas, devoluciones y gastos
// (los fijos, marcados). Importes con IVA. El mes se elige en el servidor; el resto de filtros,
// en el navegador (se guardan en la dirección para poder volver).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import Panel from '../../../components/admin/Panel'
import { Boton, Buscador, BarraFiltros, Campo, Chips, Chip, Totales, Tabla, Celda, Vacio, Aviso, Icono } from '../../../components/admin/ui'
import { useAccion, Mensaje, SelectorMes } from '../../../components/admin/Finanzas'
import {
  EtiquetaFactura, Categoria, Importe, MarcasMovimiento, FichaMovimiento, AvisosRevisar, ExportarCsv, AvisosCuentas,
  fechaCorta, eur, eurSigno, may,
} from '../../../components/admin/movimientos/comun'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { ocultoEnCookie } from '../../../components/admin/ui/Importes'
import { listarMovimientos } from '../../../lib/finanzas/movimientos'
import { filtrar, totalesDe, mesesElegibles } from '../../../lib/finanzas/movimientos-calculos'
import { leerPeriodo, periodoActual, textoMes } from '../../../lib/finanzas/calculos'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

const TIPOS = [['todos', 'Todo'], ['entra', 'Lo que entra'], ['sale', 'Lo que sale'], ['fijos', 'Solo gastos fijos']]
const FACTURAS = [['todas', 'Con y sin factura'], ['completa', 'Factura completa (AR-W)'], ['simplificada', 'Ticket (AR-S)'], ['con', 'Con factura'], ['sin', 'Sin factura'], ['rectificativa', 'Rectificativa pendiente']]
const POR_DEFECTO = { q: '', tipo: 'todos', cat: 'todas', metodo: 'todos', factura: 'todas', anulados: false }
const CLAVES = Object.keys(POR_DEFECTO)

function leerFiltros(query) {
  const f = { ...POR_DEFECTO }
  for (const k of CLAVES) {
    const v = query[k]
    if (typeof v !== 'string' || !v) continue
    f[k] = k === 'anulados' ? v === '1' : v.slice(0, 80)
  }
  // ?categoria=ID (enlaces del Inicio y de antes) es lo mismo que ?cat=c:ID
  if (f.cat === 'todas' && /^\d+$/.test(String(query.categoria || ''))) f.cat = `c:${query.categoria}`
  if (!TIPOS.some(([v]) => v === f.tipo)) f.tipo = 'todos'
  if (!FACTURAS.some(([v]) => v === f.factura)) f.factura = 'todas'
  return f
}

// Ajustes de las cuentas: desde qué mes se llevan aquí y hasta cuándo se cobró por Calendly
function AjustesCuentas({ ajustes, hoy }) {
  const mesHoy = hoy.slice(0, 7)
  const [desde, setDesde] = useState(ajustes.desde)
  const [calendly, setCalendly] = useState(ajustes.calendlyHasta)
  const [estado, ejecutar] = useAccion()
  return (
    <details className="ui-tarjeta mov-plegable" id="ajustes">
      <summary><span>Ajustes de las cuentas</span><Icono nombre="der" /></summary>
      <div className="mov-plegable__cuerpo">
        <div className="mov-ajustes">
          <label className="ui-campo"><span>Lleváis aquí las cuentas desde</span>
            <span className="mov-ajustes__control"><SelectorMes valor={desde} onCambio={setDesde} desde="2020-01" hasta={mesHoy} /></span>
            {!ajustes.desdeGuardado && <small className="ui-t3">Sin guardar: es el primer mes con datos.</small>}
          </label>
          <label className="ui-campo"><span>¿Hasta qué mes se cobraron reservas por Calendly?</span>
            <span className="mov-ajustes__control"><SelectorMes valor={calendly} onCambio={setCalendly} desde={desde} hasta={mesHoy} extra={[['sigue', 'Todavía se cobran así'], ['nunca', 'Nunca (no hace falta apuntar nada)']]} /></span>
          </label>
        </div>
        <Mensaje estado={estado} />
        <Boton variante="secundario" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/ajustes', { desde, calendlyHasta: calendly })}>Guardar ajustes</Boton>
      </div>
    </details>
  )
}

function ComoSeCalcula() {
  return (
    <details className="ui-tarjeta mov-plegable">
      <summary><span>Cómo se calcula</span><Icono nombre="der" /></summary>
      <div className="mov-plegable__cuerpo mov-explica">
        <p>Aquí está todo el dinero, apunte a apunte y con el IVA: lo que entra (reservas, horas aparte, cuotas, lo de Calendly, lo apuntado a mano y las fianzas que os quedáis) y lo que sale (gastos y devoluciones). Cuenta el día en que entra o sale el dinero, no el de la sesión.</p>
        <p>Las sesiones incluidas en un plan no salen: ya se cobran en la cuota. Las reservas de Calendly pasadas a la agenda tampoco: lo de Calendly se apunta una vez al mes.</p>
        <p>Los gastos fijos salen solos cada mes y cuentan en su mes aunque se carguen más tarde. «Este mes no se paga» no cuenta.</p>
        <p>En Mes a mes y en el Inicio las cifras van sin IVA (lo que de verdad es vuestro); el IVA a apartar está en Impuestos.</p>
      </div>
    </details>
  )
}

export default function Movimientos({ periodo, hoy, d, meses, inicial, ok, oculto }) {
  const router = useRouter()
  const [f, setF] = useState(inicial)
  const [sel, setSel] = useState(null)
  const [masFiltros, setMasFiltros] = useState(false)
  const p = periodo.clave

  // Los filtros se guardan en la dirección (sin volver a pedir los datos)
  useEffect(() => {
    const query = { p }
    for (const k of CLAVES) {
      if (f[k] === POR_DEFECTO[k]) continue
      query[k] = k === 'anulados' ? '1' : f[k]
    }
    const actual = new URLSearchParams(router.asPath.split('?')[1] || '')
    const nueva = new URLSearchParams(query)
    if (actual.toString() !== nueva.toString()) router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, p])

  const lista = useMemo(() => filtrar(d.movimientos, f), [d.movimientos, f])
  const tot = totalesDe(lista)
  const cambiar = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const irAPeriodo = (nuevo) => {
    const query = { p: nuevo }
    for (const k of CLAVES) if (f[k] !== POR_DEFECTO[k]) query[k] = k === 'anulados' ? '1' : f[k]
    router.push({ pathname: router.pathname, query }, undefined, { scroll: false })
  }

  const textoCat = (clave) => d.categorias.find((c) => c.clave === clave)?.nombre || 'Categoría'
  const textoMet = (clave) => d.metodos.find((m) => m.clave === clave)?.texto || clave
  const activos = [
    f.q ? ['q', `«${f.q}»`] : null,
    f.tipo !== 'todos' ? ['tipo', TIPOS.find(([v]) => v === f.tipo)[1]] : null,
    f.cat !== 'todas' ? ['cat', textoCat(f.cat)] : null,
    f.metodo !== 'todos' ? ['metodo', textoMet(f.metodo)] : null,
    f.factura !== 'todas' ? ['factura', FACTURAS.find(([v]) => v === f.factura)[1]] : null,
  ].filter(Boolean)

  // Mensaje de lo que se acaba de guardar (ok=gasto:ID, cambiado:ID, ingreso:ID o borrado)
  const okId = ok && /^(gasto|cambiado|ingreso):\d+$/.test(ok) ? ok.split(':') : null
  const okMov = okId ? d.movimientos.find((m) => (okId[0] === 'ingreso' ? m.origen?.tipo === 'ingreso' && m.origen.id === Number(okId[1]) : m.id === `g${okId[1]}`)) : null
  const okTexto = okMov
    ? `${okId[0] === 'cambiado' ? 'Cambiado' : okId[0] === 'ingreso' ? 'Ingreso apuntado' : 'Gasto apuntado'}: ${okMov.concepto} · ${eurSigno(okMov.entra ? okMov.totalCent : -okMov.totalCent)}.`
    : ok === 'borrado' ? 'Borrado.' : ok ? 'Guardado.' : null

  const anioActual = periodo.desde.slice(0, 4)
  const opcionesMes = [
    ...[...new Set(meses.map((m) => m.slice(0, 4)))].map((a) => [a, `Todo el año ${a}`]),
    ...meses.map((m) => [m, may(textoMes(m))]),
  ]
  if (!opcionesMes.some(([v]) => v === p)) opcionesMes.unshift([p, may(periodo.texto)])

  return (
    <Panel
      titulo="Movimientos"
      sub="Todo lo que entra y sale, apunte a apunte. Importes con IVA."
      ocultoInicial={oculto}
      clase="mov"
      acciones={<><ExportarCsv p={p} textoPeriodo={periodo.texto} /><Boton href="/admin/anadir" icono="mas">Añadir</Boton></>}
    >
      {okTexto && <Aviso tono="marron">{okTexto}</Aviso>}
      <AvisosRevisar avisos={d.revisar} />
      <AvisosCuentas faltaCalendly={d.faltaCalendly} calendlyEnCurso={d.calendlyEnCurso} recorte={d.recorte} desde={d.ajustes.desde} textoMes={textoMes} />

      <Buscador valor={f.q} onCambio={(v) => cambiar('q', v)} placeholder="Buscar: Aquaservice, Laura, AR-W-2026-004, 96,80…" etiqueta="Buscar movimientos" />
      <BarraFiltros columnas={5} className={`mov-filtros${masFiltros ? ' is-abiertos' : ''}`}>
        <Campo etiqueta="Mes">
          <select className="ui-control" value={p} onChange={(e) => irAPeriodo(e.target.value)}>
            {opcionesMes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo">
          <select className="ui-control" value={f.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
            {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Categoría" className="mov-filtros__extra">
          <select className="ui-control" value={f.cat} onChange={(e) => cambiar('cat', e.target.value)}>
            <option value="todas">Todas</option>
            {d.categorias.some((c) => c.lado === 'entra') && (
              <optgroup label="Lo que entra">{d.categorias.filter((c) => c.lado === 'entra').map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</optgroup>
            )}
            {d.categorias.some((c) => c.lado === 'sale') && (
              <optgroup label="Lo que sale">{d.categorias.filter((c) => c.lado === 'sale').map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</optgroup>
            )}
            {f.cat !== 'todas' && !d.categorias.some((c) => c.clave === f.cat) && <option value={f.cat}>Otra categoría</option>}
          </select>
        </Campo>
        <Campo etiqueta="Forma de pago" className="mov-filtros__extra">
          <select className="ui-control" value={f.metodo} onChange={(e) => cambiar('metodo', e.target.value)}>
            <option value="todos">Todas</option>
            {d.metodos.map((m) => <option key={m.clave} value={m.clave}>{m.texto}</option>)}
            {f.metodo !== 'todos' && !d.metodos.some((m) => m.clave === f.metodo) && <option value={f.metodo}>{f.metodo}</option>}
          </select>
        </Campo>
        <Campo etiqueta="Factura" className="mov-filtros__extra">
          <select className="ui-control" value={f.factura} onChange={(e) => cambiar('factura', e.target.value)}>
            {FACTURAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
      </BarraFiltros>
      <div className="mov-chips">
        <Chips>
          <button type="button" className="ui-boton ui-boton--secundario ui-boton--peq mov-solo-movil" aria-expanded={masFiltros} onClick={() => setMasFiltros(!masFiltros)}>
            <Icono nombre="ajustes" />{masFiltros ? 'Menos filtros' : 'Más filtros'}
          </button>
          {activos.map(([k, t]) => <Chip key={k} onQuitar={() => cambiar(k, POR_DEFECTO[k])}>{t}</Chip>)}
          {activos.length > 1 && <button type="button" className="ui-boton ui-boton--texto ui-boton--peq" onClick={() => setF({ ...POR_DEFECTO, anulados: f.anulados })}>Quitar todos</button>}
        </Chips>
        <label className="mov-check"><input type="checkbox" checked={f.anulados} onChange={(e) => cambiar('anulados', e.target.checked)} />Ver también los que este mes no se pagan</label>
      </div>

      {d.recorte.sinDatos ? (
        <Vacio texto={`Sin datos: lleváis aquí las cuentas desde ${textoMes(d.ajustes.desde)}.`}>
          <p className="ui-t3">Si queréis ver antes, cambiadlo en <a href="#ajustes" className="mov-enlace">Ajustes de las cuentas</a>.</p>
        </Vacio>
      ) : (
        <>
          <Totales items={[
            { nombre: 'Movimientos', valor: String(tot.n) },
            { nombre: 'Entra', valor: eur(tot.entraCent), tono: 'bien', importe: true },
            { nombre: 'Sale', valor: eur(tot.saleCent), importe: true },
            { nombre: 'Diferencia', valor: eurSigno(tot.diferenciaCent), tono: tot.diferenciaCent >= 0 ? 'bien' : 'mal', importe: true },
          ]} />
          {lista.length === 0 ? (
            <Vacio
              texto={d.movimientos.length ? 'Ningún movimiento con estos filtros.' : `Aún no hay nada apuntado en ${periodo.texto}.`}
              accion={d.movimientos.length
                ? <Boton variante="secundario" onClick={() => setF({ ...POR_DEFECTO })}>Quitar los filtros</Boton>
                : <Boton href="/admin/anadir" icono="mas">Añadir</Boton>}
            />
          ) : (
            <Tabla lista titulo={`Movimientos de ${periodo.texto}`} className="mov-tabla" columnas={[
              { texto: 'Fecha' }, { texto: 'Concepto' }, { texto: 'Categoría' }, { texto: 'Pago' }, { texto: 'Factura' }, { texto: 'Importe', der: true },
            ]}>
              {lista.map((m) => (
                <tr key={m.id} className={`ui-fila${m.anulado ? ' mov-fila--anulada' : ''}`} onClick={() => setSel(m)}>
                  <td className="m-fecha mov-tabla__fecha">{fechaCorta(m.fecha)}</td>
                  <td className="m-principal">
                    <button type="button" className="mov-abrir" onClick={(e) => { e.stopPropagation(); setSel(m) }}>
                      <Celda principal={m.concepto} sub={<>{m.quien && <span>{m.quien}</span>}<MarcasMovimiento m={m} /></>} />
                    </button>
                  </td>
                  <td className="m-oculto"><Categoria categoria={m.categoria} /></td>
                  <td className="m-oculto ui-t2">{m.metodo}</td>
                  <td className="m-fila"><EtiquetaFactura factura={m.factura} /></td>
                  <td className="der m-derecha"><Importe m={m} /></td>
                </tr>
              ))}
            </Tabla>
          )}
        </>
      )}

      <div className="mov-pie">
        <Link href="/admin/movimientos/categorias" className="ui-enlace-flecha">Categorías de gastos<Icono nombre="der" /></Link>
        <Link href="/admin/ajustes/fijos" className="ui-enlace-flecha">Gastos fijos<Icono nombre="der" /></Link>
        <Link href={`/admin/mes-a-mes?anio=${anioActual}`} className="ui-enlace-flecha">Mes a mes<Icono nombre="der" /></Link>
      </div>
      <ComoSeCalcula />
      <AjustesCuentas ajustes={d.ajustes} hoy={hoy} />

      <FichaMovimiento m={sel} onCerrar={() => setSel(null)} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const pedido = leerPeriodo(ctx.query.p, hoy)
  // Movimientos va por mes o por año (un trimestre se ve en Impuestos)
  const periodo = pedido && pedido.tipo !== 'trimestre' ? pedido : pedido ? leerPeriodo(pedido.meses.filter((m) => m <= hoy.slice(0, 7)).at(-1), hoy) : periodoActual('mes', hoy)
  const d = await listarMovimientos(periodo)
  return {
    props: JSON.parse(JSON.stringify({
      periodo, hoy, d,
      meses: mesesElegibles(d.ajustes.desde, hoy),
      inicial: leerFiltros(ctx.query),
      ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null,
      oculto: ocultoEnCookie(ctx.req),
    })),
  }
}
