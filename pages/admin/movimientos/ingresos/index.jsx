// Finanzas · Facturación: cobros y devoluciones del periodo, Calendly, lo que falta por cobrar
import Link from 'next/link'
import Panel, { Chip } from '../../../../components/admin/Panel'
import SelectorPeriodo from '../../../../components/admin/Periodo'
import { SubmenuFinanzas, MensajeOk } from '../../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../../lib/admin/auth'
import { listarIngresos } from '../../../../lib/finanzas/servicio'
import { leerPeriodo, periodoActual, euros } from '../../../../lib/finanzas/calculos'
import { TEXTOS_FILTRO_INGRESO } from '../../../../lib/finanzas/config'
import { fechaMadrid, textoFechaCorta } from '../../../../lib/reservas/tiempo'

export default function Facturacion({ periodo, hoy, d, filtro, ok }) {
  const p = periodo.clave
  const fil = (f) => ({ pathname: '/admin/movimientos/ingresos', query: { p, ...(f !== 'todo' ? { filtro: f } : {}) } })
  return (
    <Panel titulo="Facturación" acciones={(
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/admin/movimientos/ingresos/nuevo" className="adm-boton adm-boton--claro">+ Apuntar otro ingreso</Link>
        <Link href="/admin/movimientos/gastos/nuevo?volver=/admin/movimientos/ingresos" className="adm-boton">+ Apuntar gasto</Link>
      </div>
    )}>
      <SubmenuFinanzas p={p} />
      <SelectorPeriodo periodo={periodo} hoy={hoy} ruta="/admin/movimientos/ingresos" extra={filtro !== 'todo' ? { filtro } : {}} />
      <MensajeOk texto={ok && ok.startsWith('ingreso:') ? 'Ingreso apuntado.' : ok ? 'Guardado.' : null} />
      <div className="adm-filtros">
        {TEXTOS_FILTRO_INGRESO.map(([f, t]) => <Link key={f} href={fil(f)} className={filtro === f ? 'is-activo' : ''}>{t}</Link>)}
      </div>
      <p className="adm-grande">Facturación de {periodo.texto}: {euros(d.totales.baseCent)} <small className="adm-nota">sin IVA ({euros(d.totales.totalCent)} con IVA)</small></p>

      {d.calendly.length > 0 && (
        <div className="adm-caja">
          <h2>Calendly (Stripe)</h2>
          <ul className="adm-tareas">
            {d.calendly.map((k) => (
              <li key={k.mes} className={k.estado === 'falta' ? 'is-urgente' : ''}>
                <span>{k.texto}: {k.estado === 'guardado' ? `${euros(k.fila.cobradoCent, { decimales: true })} cobrado · ${euros(k.fila.devueltoCent, { decimales: true })} devuelto · ${euros(k.fila.comisionCent || 0, { decimales: true })} de comisiones` : k.estado === 'falta' ? 'sin apuntar' : 'se apunta al acabar el mes'}</span>
                <Link href={`/admin/ajustes/calendly?mes=${k.mes}`}>{k.estado === 'guardado' ? 'Cambiar' : k.estado === 'falta' ? 'Apuntar' : 'Apuntar ya'}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="adm-caja">
        <h2>Cobros y devoluciones</h2>
        {d.movimientos.length === 0 ? <p className="adm-nota">No hay cobros en este periodo.</p> : (
          <div className="adm-scroll">
            <table className="adm-tabla adm-tabla--mov">
              <thead><tr><th>Fecha</th><th>Qué</th><th>Factura</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {d.movimientos.map((m) => (
                  <tr key={m.clave}>
                    <td>{textoFechaCorta(m.fecha)}</td>
                    <td>
                      <Link href={m.enlace}>{m.texto}</Link>{' '}
                      <Chip tipo={m.sentido === 'devolucion' ? 'gris' : m.chip === 'Suscripción' ? 'plan' : ['Web', 'A mano'].includes(m.chip) ? 'ok' : 'gris'}>{m.sentido === 'devolucion' ? 'Devolución' : m.chip}</Chip>
                      {m.sentido === 'devolucion' && m.rectificar && <> <Chip tipo="aviso">Rectificar a mano</Chip></>}
                    </td>
                    <td>{m.facturaId ? <a href={`/api/admin/facturas/${m.facturaId}`} target="_blank" rel="noopener noreferrer">{m.factura}</a> : m.factura || '—'}</td>
                    <td className={`num${m.sentido === 'devolucion' ? ' adm-importe-negativo' : ''}`}>{m.sentido === 'devolucion' ? '−' : ''}{euros(m.totalCent, { decimales: true })}<small className="adm-nota" style={{ display: 'block' }}>base {euros(m.baseCent, { decimales: true })}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="adm-caja" id="sin-cobrar">
        <h2>Sin cobrar</h2>
        {d.sinCobrar.reservas.length + d.sinCobrar.cuotas.length === 0 ? <p className="adm-nota">Nada pendiente de cobrar.</p> : (
          <>
            <div className="adm-scroll">
              <table className="adm-tabla adm-tabla--mov">
                <thead><tr><th>Fecha</th><th>Qué</th><th className="num">Importe</th><th /></tr></thead>
                <tbody>
                  {[...d.sinCobrar.reservas, ...d.sinCobrar.cuotas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map((x) => (
                    <tr key={x.enlace + x.id}><td>{textoFechaCorta(x.fecha)}</td><td>{x.texto}</td><td className="num">{euros(x.totalCent, { decimales: true })}</td><td><Link href={x.enlace} className="adm-enlace">Ver ficha</Link></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="adm-nota">Si no va a pagar, cancela la reserva (o anula la cuota) para que deje de salir aquí.</p>
          </>
        )}
      </div>

      <div className="adm-caja">
        <h2>No cuentan como facturación</h2>
        <p className="adm-nota">Sesiones incluidas en una suscripción: {d.noCuentan.incluidas} (lo que se cobra es la cuota).</p>
        <p className="adm-nota">Fianzas cobradas en el periodo: {euros(d.noCuentan.fianzas.cobradasCent)} · devueltas: {euros(d.noCuentan.fianzas.devueltasCent)}. No son facturación: son dinero de los miembros.</p>
        {d.noCuentan.calendlyAgenda.n > 0 && <p className="adm-nota">Reservas de Calendly pasadas a la agenda: {d.noCuentan.calendlyAgenda.n} ({euros(d.noCuentan.calendlyAgenda.cent)}). Van en la línea de Calendly de su mes.</p>}
      </div>

      <details className="adm-caja">
        <summary>Facturas emitidas en {periodo.texto} ({d.facturas.length})</summary>
        {d.facturas.length === 0 ? <p className="adm-nota">Ninguna.</p> : (
          <div className="adm-scroll">
            <table className="adm-tabla">
              <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th className="num">Total</th><th>De</th><th>PDF</th></tr></thead>
              <tbody>{d.facturas.map((f) => <tr key={`${f.codigo}-${f.fecha}`}><td>{f.codigo}</td><td>{textoFechaCorta(f.fecha)}</td><td>{f.cliente}</td><td className="num">{euros(f.totalCent, { decimales: true })}</td><td>{f.de}</td><td>{f.pdf ? <a href={f.pdf} target="_blank" rel="noopener noreferrer">Ver</a> : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </details>
      <p className="adm-nota">Las reservas, las horas aparte y las cuotas cobradas se cuentan solas el día que se cobran. A mano solo se apunta lo que no pasa por el panel. Si un cobro ya está en la agenda como reserva pagada, no lo apuntes otra vez.</p>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const periodo = leerPeriodo(ctx.query.p, hoy) || periodoActual('mes', hoy)
  const filtro = TEXTOS_FILTRO_INGRESO.some(([f]) => f === ctx.query.filtro) ? ctx.query.filtro : 'todo'
  const d = await listarIngresos(periodo, { filtro })
  return { props: JSON.parse(JSON.stringify({ periodo, hoy, d, filtro, ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null })) }
}
