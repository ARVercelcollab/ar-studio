// Reservas · Clientes: cada persona que ha reservado en el estudio, con todas sus reservas.
// Se juntan las reservas por correo (o por teléfono si no hay correo); ver lib/reservas/clientes.js.
// La ficha de un cliente se abre en un panel lateral (?c=<clave>).
// Los datos los prepara cargarClientes (components/admin/reservas/datos.js).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import Panel from '../Panel'
import { Buscador, BarraFiltros, Campo, Totales, Tabla, Celda, Vacio, Tarjeta, Contacto } from '../ui'
import { AccionesReservas, EtiquetasCliente, fechaCorta, euros, plural, horasTexto, diaDe } from './comun'
import FichaCliente from './FichaCliente'
import { filtrarClientes, cifrasDeClientes } from '../../../lib/reservas/clientes-vista'

export const PERIODOS = [['todo', 'Todo el tiempo'], ['anio', 'Este año']]
export const TIPOS = [['todos', 'Todos'], ['repiten', 'Repiten'], ['nuevos', 'Nuevos este mes'], ['miembros', 'Miembros']]
export const ORDENES = [['reservas', 'Más reservas'], ['ultima', 'Última vez'], ['pagado', 'Lo que han pagado'], ['nombre', 'Nombre']]

function UltimaVez({ c, hoy }) {
  const proxima = diaDe(c.proxima)
  const ultima = diaDe(c.ultima)
  if (proxima) {
    return (
      <Celda
        principal={<span className="rsv-peq">Próxima: {proxima === hoy ? 'hoy' : fechaCorta(proxima)}</span>}
        sub={ultima ? `Última: ${fechaCorta(ultima, { anio: true })}` : null}
      />
    )
  }
  return <span className="rsv-peq">{ultima ? fechaCorta(ultima, { anio: true }) : '—'}</span>
}

export default function VistaClientes({ clientes, ficha, hoy, anio, inicial }) {
  const router = useRouter()
  const [f, setF] = useState(inicial)
  const cambiar = (cambios) => {
    const nuevo = { ...f, ...cambios }
    setF(nuevo)
    // La dirección guarda los filtros (sin volver a pedir la página)
    const consulta = {}
    if (nuevo.q) consulta.q = nuevo.q
    if (nuevo.periodo !== 'todo') consulta.periodo = nuevo.periodo
    if (nuevo.tipo !== 'todos') consulta.tipo = nuevo.tipo
    if (nuevo.orden !== 'reservas') consulta.orden = nuevo.orden
    if (router.query.c) consulta.c = router.query.c
    router.replace({ pathname: '/admin/reservas/clientes', query: consulta }, undefined, { shallow: true, scroll: false })
  }
  const lista = useMemo(() => filtrarClientes(clientes, f), [clientes, f])
  const cifras = useMemo(() => cifrasDeClientes(clientes, { periodo: f.periodo }), [clientes, f.periodo])

  const abrir = (clave) => {
    router.push({ pathname: '/admin/reservas/clientes', query: { ...router.query, c: clave } }, undefined, { scroll: false })
  }
  const cerrar = () => {
    const { c, ...resto } = router.query
    router.push({ pathname: '/admin/reservas/clientes', query: resto }, undefined, { scroll: false })
  }

  return (
    <Panel titulo="Reservas" sub="Cada persona que ha reservado en el estudio, con todas sus reservas." acciones={<AccionesReservas />} clase="adm-reservas">
      <Totales items={[
        { nombre: 'Clientes', valor: String(cifras.clientes) },
        { nombre: 'Nuevos este mes', valor: String(cifras.nuevosMes) },
        { nombre: 'Repiten', valor: `${cifras.repitenPct} %` },
        { nombre: 'Reservas por cliente', valor: String(cifras.reservasPorCliente).replace('.', ',') },
      ]} />

      <Buscador valor={f.q} onCambio={(q) => cambiar({ q })} placeholder="Buscar por nombre, correo o teléfono" etiqueta="Buscar clientes" />
      <BarraFiltros columnas={3}>
        <Campo etiqueta="Periodo">
          <select className="ui-control" value={f.periodo} onChange={(e) => cambiar({ periodo: e.target.value })}>
            {PERIODOS.map(([v, t]) => <option key={v} value={v}>{v === 'anio' ? `${t} (${anio})` : t}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo">
          <select className="ui-control" value={f.tipo} onChange={(e) => cambiar({ tipo: e.target.value })}>
            {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Ordenar por">
          <select className="ui-control" value={f.orden} onChange={(e) => cambiar({ orden: e.target.value })}>
            {ORDENES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </Campo>
      </BarraFiltros>

      {clientes.length === 0 ? (
        <Tarjeta><Vacio icono="persona" texto="Todavía no hay clientes: saldrán aquí en cuanto haya reservas." /></Tarjeta>
      ) : lista.length === 0 ? (
        <Tarjeta><Vacio icono="buscar" texto="Nadie con estos filtros." /></Tarjeta>
      ) : (
        <Tabla lista titulo="Clientes" className="rsv-tabla-clientes" columnas={[
          { texto: 'Cliente' }, { texto: 'Reservas', der: true }, { texto: 'Horas', der: true }, { texto: 'Pagado', der: true },
          { texto: 'Última vez' }, { texto: 'Suele hacer' }, { texto: <span className="ui-solo-lector">Contacto</span>, clave: 'contacto' },
        ]}>
          {lista.map((c) => {
            const cuenta = f.periodo === 'anio' ? c.anio : c.total
            return (
              <tr key={c.clave} className="ui-fila" onClick={(e) => { if (!e.target.closest('a, button')) abrir(c.clave) }}>
                <td className="m-principal">
                  <Celda
                    principal={<>
                      <button type="button" className="rsv-enlace-fila" onClick={() => abrir(c.clave)}>{c.nombre} {c.apellidos}</button>
                      {' '}<EtiquetasCliente c={c} />
                    </>}
                    sub={<>{c.email && <span className="rsv-solo-ancho">{c.email} ·</span>}{c.telefono || (!c.email ? '—' : '')}</>}
                  />
                </td>
                <td className="der m-fila rsv-c-reservas">
                  <Celda
                    principal={cuenta ? plural(cuenta, 'reserva', 'reservas') : c.canceladas ? plural(c.canceladas, 'cancelada', 'canceladas') : 'Sin reservas aún'}
                    sub={f.periodo === 'anio' ? `${c.total} en total` : cuenta ? `${c.anio} este año` : c.miembro ? 'acaba de empezar' : ''}
                  />
                </td>
                <td className="der m-oculto ui-num">{horasTexto(c.horas)}</td>
                <td className="der m-derecha"><span className="ui-imp ui-num">{euros(c.pagadoCent, { decimales: false })}</span></td>
                <td className="m-fila"><UltimaVez c={c} hoy={hoy} /></td>
                <td className="m-oculto"><span className="rsv-peq ui-t2">{c.actividad || '—'}</span></td>
                <td className="m-fila rsv-celda-contacto"><Contacto telefono={c.telefono} nombre={c.nombre} /></td>
              </tr>
            )
          })}
        </Tabla>
      )}
      <p className="rsv-nota">Se juntan las reservas de cada persona por su correo (o por su teléfono si no dejó correo).{clientes.some((c) => c.deCalendly) ? ' Las de antes de las reservas propias vienen de Calendly.' : ''}</p>

      <FichaCliente c={ficha} hoy={hoy} onCerrar={cerrar} />
      {router.query.c && !ficha && (
        <p className="rsv-nota" role="status">No hemos encontrado ese cliente. <Link href="/admin/reservas/clientes">Ver todos</Link></p>
      )}
    </Panel>
  )
}

