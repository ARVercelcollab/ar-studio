// Piezas comunes de Movimientos, Mes a mes e Impuestos: importes, etiqueta de factura, ficha
// lateral de un movimiento, avisos «Para revisar» y el botón de exportar para la gestoría.
import { useState } from 'react'
import { Boton, Ficha, FichaBloque, FichaAcciones, Datos, Etiqueta, Punto, Aviso, Icono } from '../ui'
import { useAccion } from '../Finanzas'
import { pedirJson } from '../../../lib/reservas/navegador'
import { euros } from '../../../lib/finanzas/calculos'
import { MESES_LARGOS, MESES_CORTOS } from '../../../lib/finanzas/config'

export const MENOS = '−'
// 1.052,70 € (con céntimos) o 1.053 € (sin)
export const eur = (cent, decimales = true) => (cent === null || cent === undefined ? '—' : euros(cent, { decimales }))
export const eurAbs = (cent, decimales = true) => eur(Math.abs(cent), decimales)
export const eurSigno = (cent, decimales = true) => `${cent > 0 ? '+' : cent < 0 ? MENOS : ''}${eurAbs(cent, decimales)}`
// Euros enteros, sin céntimos (Mes a mes, cifras grandes): 1.550 €
export const eurRedondo = (cent) => (cent === null || cent === undefined ? '—' : euros(Math.round(cent / 100) * 100))
// Importe con signo de un movimiento: + lo que entra, − lo que sale
export const importeDe = (m) => (m.entra ? m.totalCent : -m.totalCent)

export function fechaCorta(f) {
  if (!f) return ''
  const [, m, d] = f.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}
export function fechaLarga(f) {
  if (!f) return ''
  const [y, m, d] = f.split('-').map(Number)
  return `${d} de ${MESES_LARGOS[m - 1]} de ${y}`
}
export const may = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)

// Etiqueta de la columna «Factura»
export function EtiquetaFactura({ factura }) {
  const { clase, codigo, texto } = factura
  if (clase === 'completa') return <Etiqueta tono="marron" title="Factura completa">{codigo}</Etiqueta>
  if (clase === 'simplificada') return <Etiqueta tono="borde" title="Factura simplificada (ticket)">{codigo}</Etiqueta>
  if (clase === 'manual') return <Etiqueta tono="borde" title="Factura hecha a mano">{codigo || 'AR-M'}</Etiqueta>
  if (clase === 'rectificativa') return <Etiqueta tono="aviso" title={codigo ? `Hay que hacer la rectificativa de ${codigo}` : undefined}>Rectificativa pendiente</Etiqueta>
  if (clase === 'sin') return factura.falta ? <Etiqueta tono="aviso">Sin factura</Etiqueta> : <span className="ui-t3">Sin factura</span>
  if (clase === 'ticket') return <Etiqueta tono="aviso">Ticket sin NIF</Etiqueta>
  if (clase === 'stripe') return <span className="ui-t2">Stripe</span>
  return <span className="ui-t3">{texto}</span>
}

export function Categoria({ categoria }) {
  return <span className="mov-cat"><Punto color={categoria.color} />{categoria.nombre}</span>
}

// Importe en la tabla: verde lo que entra, negro lo que sale
export function Importe({ m, className = '' }) {
  const v = importeDe(m)
  return <span className={`mov-importe ui-imp ui-num${m.entra && v > 0 ? ' ui-bien' : ''}${m.anulado ? ' mov-importe--anulado' : ''} ${className}`}>{eurSigno(v)}</span>
}

// Etiquetas pequeñas bajo el concepto
export function MarcasMovimiento({ m }) {
  return (
    <>
      {m.fijo && <Etiqueta tono="borde">fijo</Etiqueta>}
      {m.porPagar && <Etiqueta tono="gris">se paga el {Number(m.fecha.slice(8, 10))}</Etiqueta>}
      {m.anulado && <Etiqueta tono="gris">este mes no se paga</Etiqueta>}
      {m.calendly && <Etiqueta tono="gris">Calendly</Etiqueta>}
    </>
  )
}

// ---------- Ficha lateral de un movimiento ----------

function enlaceOrigen(m) {
  const o = m.origen || {}
  if (o.tipo === 'reserva') return { href: `/admin/reserva/${o.id}`, texto: 'Ver la reserva' }
  if (o.tipo === 'cuota') return { href: `/admin/miembros/${o.suscripcionId}`, texto: 'Ver la ficha del miembro' }
  if (o.tipo === 'fianza') return { href: `/admin/miembros/${o.id}`, texto: 'Ver la ficha del miembro' }
  if (o.tipo === 'ingreso') return { href: m.enlace, texto: 'Cambiar o borrar' }
  if (o.tipo === 'gasto') return { href: m.enlace, texto: 'Cambiar o borrar' }
  if (o.tipo === 'calendly') return { href: m.enlace, texto: 'Ver lo de Calendly de ese mes' }
  return m.enlace ? { href: m.enlace, texto: 'Ver' } : null
}

function ReenviarFactura({ m }) {
  const [estado, setEstado] = useState({ enviando: false, mensaje: null, error: false })
  const o = m.origen || {}
  const url = o.tipo === 'reserva' ? `/api/admin/reservas/${o.id}` : o.tipo === 'cuota' ? `/api/admin/cuotas/${o.id}` : null
  if (!url || !m.factura.id || m.tipo !== 'cobro') return null
  async function reenviar() {
    if (!window.confirm(`¿Volver a mandar la factura ${m.factura.codigo} al cliente?`)) return
    setEstado({ enviando: true, mensaje: null, error: false })
    try {
      const r = await pedirJson(url, { method: 'POST', body: { accion: 'factura' } })
      setEstado({ enviando: false, mensaje: r?.mensaje || 'Enviada.', error: r?.ok === false })
    } catch (e) {
      setEstado({ enviando: false, mensaje: e.message, error: true })
    }
  }
  return (
    <>
      <Boton variante="secundario" tam="peq" icono="correo" disabled={estado.enviando} onClick={reenviar}>{estado.enviando ? 'Enviando…' : 'Reenviar'}</Boton>
      {estado.mensaje && <p className={`mov-ficha__mensaje${estado.error ? ' ui-mal' : ''}`} role="status">{estado.mensaje}</p>}
    </>
  )
}

const TIPO_FACTURA_GASTO = { con: 'Factura con el NIF del estudio', ticket: 'Ticket sin el NIF del estudio (no se descuenta el IVA)', sin_iva: 'No lleva IVA (seguro, banco…)', extranjero: 'Empresa de fuera de España' }

export function FichaMovimiento({ m, onCerrar }) {
  if (!m) return <Ficha abierta={false} />
  const destino = enlaceOrigen(m)
  const v = importeDe(m)
  const filas = m.tipo === 'gasto'
    ? [
        ['Fecha', fechaLarga(m.fecha)],
        ['Proveedor', m.quien],
        ['Categoría', <Categoria key="c" categoria={m.categoria} />],
        ['Forma de pago', m.metodo],
        ['Sin IVA', <span key="b" className="ui-imp ui-num">{eur(m.baseCent)}</span>],
        ['IVA', <span key="i" className="ui-imp ui-num">{eur(m.ivaCent)}{m.ivaPct !== null ? ` (${m.ivaPct} %)` : ''}</span>],
        m.retencionCent > 0 ? ['Retención', <span key="r" className="ui-imp ui-num">{eur(m.retencionCent)} ({m.retencionPct} %)</span>] : null,
        ['Cuenta como gasto', <span key="g" className="ui-imp ui-num">{eur(m.costeCent)}</span>],
        m.nota ? ['Nota', m.nota] : null,
      ]
    : [
        ['Fecha', fechaLarga(m.fecha)],
        ['Quién', m.quien],
        m.nif ? ['NIF', m.nif] : null,
        ['Categoría', <Categoria key="c" categoria={m.categoria} />],
        ['Forma de pago', m.metodo],
        m.fechaServicio && m.fechaServicio !== m.fecha ? [m.fuente === 'cuota' ? 'Empieza el mes' : 'Día de la sesión', fechaLarga(m.fechaServicio)] : null,
        m.ref ? ['Referencia', m.ref] : null,
        ['Sin IVA', <span key="b" className="ui-imp ui-num">{eur(m.baseCent)}</span>],
        ['IVA', <span key="i" className="ui-imp ui-num">{eur(m.ivaCent)}{m.ivaPct !== null ? ` (${m.ivaPct} %)` : ''}</span>],
      ]
  return (
    <Ficha abierta titulo={m.concepto} sub={`${may(m.tipo === 'gasto' ? 'gasto' : m.tipo === 'devolucion' ? 'devolución' : 'cobro')} · ${fechaLarga(m.fecha)}`} onCerrar={onCerrar}>
      <FichaBloque>
        <p className={`mov-ficha__importe ui-imp ui-num${m.entra ? ' ui-bien' : ''}`}>{eurSigno(v)}</p>
        <p className="ui-t3 mov-ficha__nota">Con IVA{m.anulado ? ' · este mes no se paga: no cuenta' : ''}</p>
        <div className="mov-ficha__marcas"><MarcasMovimiento m={m} /></div>
      </FichaBloque>
      <FichaBloque titulo="Datos">
        <Datos filas={filas.filter(Boolean)} />
      </FichaBloque>
      <FichaBloque titulo="Factura">
        <div className="mov-ficha__factura">
          <EtiquetaFactura factura={m.factura} />
          {m.tipo === 'gasto' && <span className="ui-t2">{TIPO_FACTURA_GASTO[m.factura.clase] || m.factura.texto}{m.numFactura ? ` · nº ${m.numFactura}` : ''}</span>}
          {m.factura.clase === 'sin' && m.factura.falta && m.tipo === 'cobro' && <span className="ui-t2">Todavía no tiene factura: se hace desde {m.origen?.tipo === 'cuota' ? 'la cuota, en la ficha del miembro' : 'su ficha'}.</span>}
          {m.factura.clase === 'stripe' && <span className="ui-t2">La factura la hace Stripe.</span>}
          {m.factura.clase === 'rectificativa' && <span className="ui-t2">Se devolvió dinero de algo ya facturado ({m.factura.codigo}): la rectificativa se hace a mano.</span>}
        </div>
        <FichaAcciones>
          {m.factura.id && <Boton variante="secundario" tam="peq" icono="doc" href={`/api/admin/facturas/${m.factura.id}`} externo>Descargar PDF</Boton>}
          {m.enlaceFactura && <Boton variante="secundario" tam="peq" icono="doc" href={m.enlaceFactura} externo>Ver la factura</Boton>}
          <ReenviarFactura m={m} />
        </FichaAcciones>
      </FichaBloque>
      {destino && (
        <FichaBloque>
          <FichaAcciones>
            <Boton href={destino.href} iconoDerecha="der">{destino.texto}</Boton>
          </FichaAcciones>
        </FichaBloque>
      )}
    </Ficha>
  )
}

// ---------- «Para revisar» ----------

export function AvisosRevisar({ avisos }) {
  const [estado, ejecutar] = useAccion()
  const [todos, setTodos] = useState(false)
  if (!avisos || !avisos.length) return null
  const lista = todos ? avisos : avisos.slice(0, 4)
  return (
    <section className="ui-tarjeta ui-tarjeta--aviso mov-revisar" aria-labelledby="mov-revisar-t">
      <div className="ui-tarjeta__cab">
        <div><h2 id="mov-revisar-t">Para revisar</h2><p className="ui-tarjeta__nota">{avisos.length === 1 ? 'Una cosa' : `${avisos.length} cosas`} que pueden dejar las cuentas cortas</p></div>
      </div>
      <ul className="mov-revisar__lista">
        {lista.map((a) => (
          <li key={a.clave} className={a.urgente ? 'is-urgente' : ''}>
            <Icono nombre={a.urgente ? 'aviso' : 'info'} />
            <span>{a.texto}</span>
            <span className="mov-revisar__acciones">
              {a.boton && <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/avisos', { clave: a.clave })}>{a.boton}</Boton>}
              {a.enlace && <Boton variante="texto" tam="peq" href={a.enlace} iconoDerecha="der">{a.textoEnlace}</Boton>}
            </span>
          </li>
        ))}
      </ul>
      {avisos.length > 4 && <button type="button" className="ui-enlace-flecha mov-revisar__mas" onClick={() => setTodos(!todos)}>{todos ? 'Ver menos' : `Ver los ${avisos.length}`}<Icono nombre={todos ? 'izq' : 'der'} /></button>}
      {estado.mensaje && <p className={`mov-ficha__mensaje${estado.error ? ' ui-mal' : ''}`} role="status">{estado.mensaje}</p>}
    </section>
  )
}

// ---------- Exportar para la gestoría ----------

// Desplegable con los tres CSV de la gestoría del periodo p (AAAA-MM, AAAA-Tn o AAAA)
export function ExportarCsv({ p, textoPeriodo }) {
  return (
    <details className="mov-exportar">
      <summary className="ui-boton ui-boton--secundario"><Icono nombre="bajar" />Exportar CSV</summary>
      <div className="mov-exportar__menu" role="menu">
        <p className="ui-t3">Para la gestoría · {textoPeriodo}</p>
        <a role="menuitem" href={`/api/admin/finanzas/exportar?p=${p}&tipo=ingresos`}>Ingresos</a>
        <a role="menuitem" href={`/api/admin/finanzas/exportar?p=${p}&tipo=gastos`}>Gastos</a>
        <a role="menuitem" href={`/api/admin/finanzas/exportar?p=${p}&tipo=facturas`}>Facturas emitidas</a>
        <p className="ui-t3">Se abren en Excel o Google Sheets.</p>
      </div>
    </details>
  )
}

// Aviso de los meses de Calendly sin apuntar y de los datos recortados
export function AvisosCuentas({ faltaCalendly = [], calendlyEnCurso = false, recorte, desde, textoMes }) {
  return (
    <>
      {faltaCalendly.length > 0 && <Aviso tono="aviso" titulo="Falta lo de Calendly.">De {faltaCalendly.map((m) => textoMes(m)).join(', ')}: las cifras se quedan cortas. <a href={`/admin/ajustes/calendly?mes=${faltaCalendly[0]}`} className="mov-enlace">Apuntarlo</a></Aviso>}
      {calendlyEnCurso && <Aviso tono="info">Lo cobrado por Calendly este mes se apunta al acabarlo: hasta entonces, lo que entra se queda corto.</Aviso>}
      {recorte?.recortado && <Aviso tono="info">Solo cuenta desde {textoMes(desde)}: antes no se llevaban aquí las cuentas.</Aviso>}
    </>
  )
}
