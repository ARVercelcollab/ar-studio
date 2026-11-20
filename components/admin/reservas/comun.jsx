// Piezas de la sección Reservas (Calendario, Lista, Clientes y la ficha de una reserva)
import Link from 'next/link'
import { Boton, Etiqueta } from '../ui'
import VistasReservas from './VistasReservas'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const FORMATO_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

// '2026-11-20T09:00:00Z' -> '2026-11-20' (día en Madrid)
export const diaDe = (iso) => (iso ? FORMATO_MADRID.format(new Date(iso)) : null)
// '2026-11-20' -> '20 nov' · con año: '20 nov 2026'
export function fechaCorta(fecha, { anio = false } = {}) {
  if (!fecha) return '—'
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}${anio ? ` ${y}` : ''}`
}
// '2025-08-25' -> 'agosto 2025'
export function mesAnio(fecha) {
  if (!fecha) return ''
  const [y, m] = fecha.slice(0, 10).split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
export const euros = (cent, { conSigno = false, decimales = true } = {}) => {
  if (cent === null || cent === undefined) return '—'
  const n = cent / 100
  const t = n.toLocaleString('es-ES', { minimumFractionDigits: decimales ? 2 : 0, maximumFractionDigits: decimales ? 2 : 0, useGrouping: 'always' })
  return `${conSigno && n > 0 ? '+' : ''}${t} €`
}
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
export const horasTexto = (h) => `${String(Math.round(Number(h) * 100) / 100).replace('.', ',')} h`

// Estado de una reserva para el panel: [texto, tono de la etiqueta]
export function estadoReserva(r) {
  if (r.estado === 'cancelada') return ['Cancelada', 'borde']
  if (r.estado === 'conflicto') return ['Revisar pago', 'mal']
  if (r.estado === 'pendiente') return ['Esperando pago', 'aviso']
  if (r.estado === 'caducada') return ['Sin pagar (caducada)', 'borde']
  if (r.esPlan && !r.precioCent) return ['Incluida', 'marron']
  if (r.pagoEstado === 'pendiente') return ['Sin pagar', 'aviso']
  if (r.pagoEstado === 'reembolsado') return ['Devuelta', 'borde']
  if (r.pagoEstado === 'reembolsado_parcial') return ['Devuelta en parte', 'borde']
  return ['Pagada', 'bien']
}

export function EtiquetaEstado({ r }) {
  const [texto, tono] = estadoReserva(r)
  return <Etiqueta tono={tono} punto={tono !== 'borde'}>{texto}</Etiqueta>
}

// Factura de una reserva: AR-W (completa), AR-S (ticket), «Calendly» o nada
export function EtiquetaFactura({ factura, origen }) {
  if (factura) return <Etiqueta tono={factura.tipo === 'simplificada' ? 'borde' : 'marron'} title={factura.tipo === 'simplificada' ? 'Factura simplificada (ticket)' : 'Factura completa'}>{factura.codigo}</Etiqueta>
  if (origen === 'calendly') return <Etiqueta tono="borde">Calendly</Etiqueta>
  return <span className="ui-t3 rsv-sin-factura">—</span>
}

// Etiquetas de un cliente: Miembro (enlace a su ficha), Nuevo o Repite
export function EtiquetasCliente({ c, enlazar = false }) {
  return (
    <span className="rsv-etiquetas">
      {c.miembro && (enlazar
        ? <Link href={`/admin/miembros/${c.miembro.id}`} className="ui-etiqueta ui-etiqueta--marron"><i aria-hidden="true" />Miembro · {c.miembro.planNombre}</Link>
        : <Etiqueta tono="marron" punto>Miembro</Etiqueta>)}
      {c.nuevo ? <Etiqueta tono="aviso" punto>Nuevo</Etiqueta> : c.repite ? <Etiqueta tono="bien" punto>Repite</Etiqueta> : null}
    </span>
  )
}

// Acciones de la cabecera: el conmutador de vistas y «Añadir reserva»
export function AccionesReservas({ antes = null }) {
  return (
    <>
      {antes}
      <VistasReservas />
      <Boton href="/admin/anadir?tipo=reserva" icono="mas">Añadir reserva</Boton>
    </>
  )
}

// Enlace a «Añadir» con los datos de un cliente ya puestos
export function hrefNuevaReserva(c) {
  const p = new URLSearchParams({ tipo: 'reserva' })
  if (c.nombre) p.set('nombre', c.nombre)
  if (c.apellidos) p.set('apellidos', c.apellidos)
  if (c.email) p.set('email', c.email)
  if (c.telefono) p.set('telefono', c.telefono)
  return `/admin/anadir?${p.toString()}`
}
