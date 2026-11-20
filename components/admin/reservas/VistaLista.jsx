// Reservas · Lista: todas las reservas con buscador, filtros (mes, estado, tipo) y totales.
// Los filtros van en la dirección (?q=&mes=&estado=&tipo=) para poder volver y compartir la vista.
// Los datos los prepara cargarLista (components/admin/reservas/datos.js).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import Panel from '../Panel'
import { Buscador, BarraFiltros, Campo, Chips, Chip, Totales, Tabla, Celda, Vacio, Tarjeta } from '../ui'
import { AccionesReservas, EtiquetaEstado, EtiquetaFactura, fechaCorta, horasTexto } from './comun'

export const ESTADOS_LISTA = [
  ['proximas', 'Próximas'],
  ['sin_pagar', 'Sin pagar'],
  ['revisar', 'En revisión'],
  ['pasadas', 'Ya pasadas'],
  ['canceladas', 'Canceladas'],
  ['todas', 'Todas'],
]
export const TIPOS_LISTA = [
  ['todas', 'Todas'],
  ['horas', 'Por horas'],
  ['plan', 'De miembros'],
  ['calendly', 'De Calendly'],
]

const etiquetaDe = (lista, v) => (lista.find(([k]) => k === v) || [])[1]

function useFiltros(inicial) {
  const router = useRouter()
  const [q, setQ] = useState(inicial.q)
  const primera = useRef(true)
  const ir = (cambios) => {
    const nuevo = { ...inicial, q, ...cambios }
    const consulta = {}
    if (nuevo.q) consulta.q = nuevo.q
    if (nuevo.mes && nuevo.mes !== 'todos') consulta.mes = nuevo.mes
    if (nuevo.estado && nuevo.estado !== 'proximas') consulta.estado = nuevo.estado
    if (nuevo.tipo && nuevo.tipo !== 'todas') consulta.tipo = nuevo.tipo
    router.push({ pathname: '/admin/reservas/lista', query: consulta }, undefined, { scroll: false })
  }
  // Buscar mientras se escribe (con una pausa, para no pedir en cada letra)
  useEffect(() => {
    if (primera.current) { primera.current = false; return undefined }
    const t = setTimeout(() => ir({ q }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  return { q, setQ, ir }
}

export default function VistaLista({ filtros, meses, filas, totales, calendario }) {
  const router = useRouter()
  const { q, setQ, ir } = useFiltros(filtros)
  const chips = [
    filtros.mes !== 'todos' && { clave: 'mes', texto: (meses.find((m) => m.valor === filtros.mes) || {}).texto, quitar: () => ir({ mes: 'todos' }) },
    filtros.estado !== 'proximas' && { clave: 'estado', texto: filtros.estado === 'todas' ? 'Todos los estados' : etiquetaDe(ESTADOS_LISTA, filtros.estado), quitar: () => ir({ estado: 'proximas' }) },
    filtros.tipo !== 'todas' && { clave: 'tipo', texto: etiquetaDe(TIPOS_LISTA, filtros.tipo), quitar: () => ir({ tipo: 'todas' }) },
    filtros.q && { clave: 'q', texto: `«${filtros.q}»`, quitar: () => { setQ(''); ir({ q: '' }) } },
  ].filter(Boolean)

  return (
    <Panel titulo="Reservas" sub="Todas las reservas, con lo que se ha cobrado y su factura." acciones={<AccionesReservas />} clase="adm-reservas">
      <Buscador valor={q} onCambio={setQ} placeholder="Buscar por nombre, correo, teléfono o código" etiqueta="Buscar reservas" />
      <BarraFiltros columnas={3}>
        <Campo etiqueta="Mes">
          <select className="ui-control" value={filtros.mes} onChange={(e) => ir({ mes: e.target.value })}>
            <option value="todos">Todos</option>
            {meses.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Estado">
          <select className="ui-control" value={filtros.estado} onChange={(e) => ir({ estado: e.target.value })}>
            {ESTADOS_LISTA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo">
          <select className="ui-control" value={filtros.tipo} onChange={(e) => ir({ tipo: e.target.value })}>
            {TIPOS_LISTA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
      </BarraFiltros>
      {chips.length > 0 && (
        <Chips>{chips.map((c) => <Chip key={c.clave} onQuitar={c.quitar}>{c.texto}</Chip>)}</Chips>
      )}

      <Totales items={[
        { nombre: 'Reservas', valor: String(totales.reservas) },
        { nombre: 'Horas', valor: horasTexto(totales.horas) },
        { nombre: 'Cobrado (con IVA)', valor: totales.cobrado, tono: 'bien', importe: true },
        { nombre: 'Sin pagar', valor: String(totales.sinPagar), tono: totales.sinPagar ? 'mal' : undefined },
      ]} />

      {filas.length === 0 ? (
        <Tarjeta><Vacio icono="cal" texto="Ninguna reserva con estos filtros." /></Tarjeta>
      ) : (
        <Tabla lista titulo="Reservas" columnas={[{ texto: 'Día y hora' }, { texto: 'Quién' }, { texto: 'Qué' }, { texto: 'Estado' }, { texto: 'Factura' }, { texto: 'Importe', der: true }]}>
          {filas.map((r) => (
            <tr key={r.id} className="ui-fila" onClick={(e) => { if (!e.target.closest('a')) router.push(`/admin/reserva/${r.id}`) }}>
              <td className="m-fecha">{fechaCorta(r.fecha)}{r.anioDistinto ? ` ${r.fecha.slice(0, 4)}` : ''} · {r.horaInicio}–{r.horaFin}</td>
              <td className="m-principal">
                <Celda
                  principal={<Link href={`/admin/reserva/${r.id}`} className="rsv-enlace-fila">{r.nombre} {r.apellidos}</Link>}
                  sub={<>{r.codigo}{r.vez ? ` · ${r.vez}` : ''}</>}
                />
              </td>
              <td className="m-oculto">{r.esPlan ? `Sesión del plan${r.planTexto ? ` (${r.planTexto.replace('Suscripción ', '')})` : ''}` : r.actividad || 'Reserva'} · {r.duracionTexto}</td>
              <td className="m-fila"><EtiquetaEstado r={r} /></td>
              <td className="m-fila"><EtiquetaFactura factura={r.facturaInfo} origen={r.origen} /></td>
              <td className="der m-derecha">
                <span className="ui-imp ui-num">{r.esPlan && !r.precioCent ? <span className="ui-t3">Incluida</span> : r.importe}</span>
              </td>
            </tr>
          ))}
        </Tabla>
      )}
      {filas.length >= 300 && <p className="rsv-nota">Se enseñan las 300 primeras. Usa los filtros o el buscador para afinar.</p>}

      {calendario && (
        <details className="rsv-ics">
          <summary>Ver las reservas en otro calendario (enlace para suscribirse)</summary>
          <p>Google Calendar ya recibe cada reserva al momento si está conectado en Ajustes. Este enlace es para Apple Calendar u Outlook: Otros calendarios → + → Desde URL. No lo compartas: da acceso a los nombres y teléfonos de los clientes.</p>
          <input className="ui-control" readOnly value={calendario} onFocus={(e) => e.target.select()} aria-label="Enlace del calendario" />
        </details>
      )}
    </Panel>
  )
}

