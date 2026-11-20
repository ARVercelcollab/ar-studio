// Finanzas · Resumen: facturación, gastos y beneficio del periodo, IVA para Hacienda y gestoría
import Link from 'next/link'
import { useState } from 'react'
import Panel, { Chip } from '../../../components/admin/Panel'
import SelectorPeriodo from '../../../components/admin/Periodo'
import { SubmenuFinanzas, ParaRevisar, MensajeOk, SelectorMes, useAccion, Mensaje } from '../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { resumenFinanzas } from '../../../lib/finanzas/servicio'
import { leerPeriodo, periodoActual, euros, textoMes, listaMeses, textoTrimestre } from '../../../lib/finanzas/calculos'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

function Ajustes({ ajustes, hoy }) {
  const mesHoy = hoy.slice(0, 7)
  const [desde, setDesde] = useState(ajustes.desde)
  const [calendly, setCalendly] = useState(ajustes.calendlyHasta)
  const [estado, ejecutar] = useAccion()
  return (
    <details className="adm-caja" id="ajustes">
      <summary>Ajustes de Finanzas</summary>
      <div className="adm-form" style={{ marginTop: 10 }}>
        <label>Llevamos aquí las cuentas desde
          <SelectorMes valor={desde} onCambio={setDesde} desde="2020-01" hasta={mesHoy} />
          {!ajustes.desdeGuardado && <small>(sin guardar: es el primer mes con datos)</small>}
        </label>
        <label>¿Hasta qué mes se cobraron reservas por Calendly?
          <SelectorMes valor={calendly} onCambio={setCalendly} desde={desde} hasta={mesHoy} extra={[['sigue', 'Todavía se cobran así'], ['nunca', 'Nunca (no hace falta apuntar nada)']]} />
        </label>
      </div>
      <Mensaje estado={estado} />
      <p style={{ marginTop: 10 }}><button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/ajustes', { desde, calendlyHasta: calendly })}>Guardar ajustes</button></p>
    </details>
  )
}

export default function ResumenFinanzas({ periodo, hoy, r, ok }) {
  const c = r.cifras
  const p = periodo.clave
  const neg = c.beneficioCent < 0
  const ivaNeto = c.iva.netoCent
  const benefPie = c.facturacion.baseCent > 0 && !neg ? `os quedan ${c.deCada100} de cada 100 € que entran` : neg ? `los gastos superan a lo cobrado en ${euros(-c.beneficioCent)}` : '—'
  const t = r.hacienda[0]
  const okTexto = ok === 'borrado' ? 'Borrado.' : ok ? 'Guardado.' : null
  return (
    <Panel titulo="Finanzas" acciones={<Link href={`/admin/movimientos/gastos/nuevo?volver=/admin/movimientos`} className="adm-boton">+ Apuntar gasto</Link>}>
      <SubmenuFinanzas p={p} />
      <SelectorPeriodo periodo={periodo} hoy={hoy} ruta="/admin/movimientos" />
      <MensajeOk texto={okTexto} />
      <ParaRevisar avisos={r.revisar} />
      {r.faltaCalendly.length > 0 && <div className="adm-banner">Faltan los cobros de Calendly de {listaMeses(r.faltaCalendly, hoy)}: la facturación se queda corta.<Link href={`/admin/ajustes/calendly?mes=${r.faltaCalendly[0]}`}>Apuntar</Link></div>}
      {r.calendlyEnCurso && <div className="adm-banner">Lo cobrado por Calendly en {textoMes(hoy.slice(0, 7), { soloNombre: true })} se apunta al acabar el mes: hasta entonces, la facturación de este mes se queda corta.</div>}
      {r.recorte.recortado && <div className="adm-banner">Solo cuenta desde {textoMes(r.ajustes.desde)}: antes no se llevaban aquí las cuentas.</div>}

      {r.recorte.sinDatos ? (
        <div className="adm-caja"><p>Sin datos: lleváis aquí las cuentas desde {textoMes(r.ajustes.desde)}. Si queréis ver antes, cambiadlo en <a href="#ajustes" className="adm-enlace">Ajustes de Finanzas</a>.</p></div>
      ) : (
        <>
          <div className="adm-fin-cifras">
            <div className="is-facturacion"><span>Facturación</span><strong>{euros(c.facturacion.baseCent)}</strong><small>{c.facturacion.baseCent < 0 ? 'este periodo hay más devoluciones que cobros' : `con IVA: ${euros(c.facturacion.totalCent)}`}</small></div>
            <div className="is-gastos"><span>Gastos</span><strong>{euros(c.gastos.costeCent)}</strong><small>con IVA: {euros(c.gastos.conIvaCent)}</small></div>
            <div className={neg ? 'is-negativo' : 'is-beneficio'}><span>Beneficio</span><strong>{euros(c.beneficioCent)}</strong><small>{benefPie}</small></div>
            <div className="is-iva"><span>{ivaNeto >= 0 ? 'IVA para Hacienda (aprox.)' : 'IVA a vuestro favor (aprox.)'}</span><strong>{euros(Math.abs(ivaNeto))}</strong><small>cobrado {euros(c.iva.repercutidoCent)} − de gastos {euros(c.iva.soportadoCent)}</small></div>
          </div>
          {c.diferenciaConIvaCent > 0 && c.beneficioCent >= 0 && ivaNeto >= 0 && (
            <p className="adm-nota">Con IVA, han entrado {euros(c.diferenciaConIvaCent)} más de los que han salido: {euros(c.beneficioCent)} son beneficio y {euros(ivaNeto)} son IVA para Hacienda.</p>
          )}
          <p className="adm-nota">
            {r.fianzasGuardadas.cent > 0 && `Fianzas guardadas: ${euros(r.fianzasGuardadas.cent)} (${r.fianzasGuardadas.n} ${r.fianzasGuardadas.n === 1 ? 'miembro' : 'miembros'}). No son vuestras hasta que se resuelven.`}
            {(r.sinCobrar.cuotas.n > 0 || r.sinCobrar.reservas.n > 0) && <> · Sin cobrar: {[r.sinCobrar.cuotas.n && `${euros(r.sinCobrar.cuotas.totalCent)} (${r.sinCobrar.cuotas.n} ${r.sinCobrar.cuotas.n === 1 ? 'cuota' : 'cuotas'})`, r.sinCobrar.reservas.n && `${euros(r.sinCobrar.reservas.totalCent)} (${r.sinCobrar.reservas.n} ${r.sinCobrar.reservas.n === 1 ? 'reserva ya hecha' : 'reservas ya hechas'})`].filter(Boolean).join(' y ')} <Link href="/admin/movimientos/ingresos#sin-cobrar" className="adm-enlace">Ver</Link></>}
          </p>
          {r.vacio && (
            <div className="adm-caja">
              <p>Aún no hay nada apuntado en {periodo.texto}.</p>
              <div className="adm-acciones"><Link href="/admin/movimientos/gastos/nuevo?volver=/admin/movimientos" className="adm-boton">+ Apuntar gasto</Link><Link href="/admin/ajustes/fijos" className="adm-boton adm-boton--claro">Ver gastos fijos</Link></div>
            </div>
          )}
          <p className="adm-nota">Las gráficas de la evolución están en el <Link href={`/admin?p=${p}`} className="adm-enlace">Inicio</Link>.</p>

          <div className="adm-dos">
            <div className="adm-caja">
              <h2>De dónde viene la facturación</h2>
              {r.porFuente.length === 0 ? <p className="adm-nota">No hay cobros en este periodo.</p> : (
                <ul className="adm-fin-barras">
                  {r.porFuente.map((f) => {
                    const max = Math.max(...r.porFuente.map((x) => x.baseCent))
                    return (
                      <li key={f.fuente}>
                        <Link href={`/admin/movimientos/ingresos?p=${p}`}>{f.texto}<small>{f.n} {f.n === 1 ? 'cobro' : 'cobros'}</small></Link>
                        <span className="adm-fin-barras__barra"><i style={{ width: `${(100 * f.baseCent) / max}%` }} /></span>
                        <b className="num">{euros(f.baseCent)}</b>
                      </li>
                    )
                  })}
                  {r.devoluciones.n > 0 && <li><span>Devoluciones<small>{r.devoluciones.n} {r.devoluciones.n === 1 ? 'devolución' : 'devoluciones'}</small></span><span /><b className="num adm-importe-negativo">−{euros(r.devoluciones.baseCent)}</b></li>}
                </ul>
              )}
              <p className="adm-nota">Total: {euros(c.facturacion.baseCent)} sin IVA ({euros(c.facturacion.totalCent)} con IVA)</p>
            </div>
            <div className="adm-caja">
              <h2>En qué se va</h2>
              {r.porGrupo.map((g) => {
                const max = Math.max(1, ...r.porGrupo.map((x) => x.costeCent))
                return (
                  <details key={g.grupo} className="adm-fin-grupo-gasto">
                    <summary><span>{g.texto}</span><span className="adm-fin-barras__barra is-gasto"><i style={{ width: `${(100 * g.costeCent) / max}%` }} /></span><b className="num">{euros(g.costeCent)}</b></summary>
                    {g.categorias.length === 0 ? <p className="adm-nota">Nada en este periodo.</p> : (
                      <ul>{g.categorias.map((ct) => <li key={ct.id}><Link href={`/admin/movimientos/gastos?p=${p}&categoria=${ct.id}`}>{ct.nombre}</Link><b className="num">{euros(ct.costeCent)}</b></li>)}</ul>
                    )}
                  </details>
                )
              })}
              <p className="adm-nota">Sin IVA cuando el IVA se descuenta; los tickets sin vuestro NIF cuentan enteros. Los gastos fijos cuentan en su mes aunque se carguen más tarde.</p>
            </div>
          </div>

          <div className="adm-caja">
            {periodo.tipo === 'mes' ? (
              <details>
                <summary>Ver los últimos 12 meses en tabla</summary>
                <TablaMeses meses={r.grafico} />
              </details>
            ) : (<><h2>Mes a mes</h2><TablaMeses meses={r.mesAMes} total={c} /></>)}
          </div>

          <div className="adm-caja" id="hacienda">
            {periodo.tipo !== 'anio' ? (
              <>
                <h2>Para Hacienda · {t.texto} (aprox.) {t.enCurso && <Chip tipo="gris">En curso</Chip>}</h2>
                <div className="adm-scroll">
                  <table className="adm-tabla adm-tabla--num">
                    <thead><tr><th>Concepto</th><th>Sin IVA</th><th>IVA</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">IVA de lo cobrado</th><td className="num">{euros(t.cobrado.baseCent, { decimales: true })}</td><td className="num">{euros(t.cobrado.ivaCent, { decimales: true })}</td></tr>
                      <tr><th scope="row">IVA de lo devuelto</th><td className="num">{euros(-t.devuelto.baseCent, { decimales: true })}</td><td className="num">{euros(-t.devuelto.ivaCent, { decimales: true })}</td></tr>
                      <tr><th scope="row">IVA de los gastos con factura</th><td className="num">{euros(t.gastos.baseCent, { decimales: true })}</td><td className="num">{euros(-t.gastos.ivaCent, { decimales: true })}</td></tr>
                      <tr className="is-total"><th scope="row">{t.netoCent >= 0 ? 'IVA a pagar (modelo 303)' : 'IVA a vuestro favor'}</th><td /><td className="num">{euros(Math.abs(t.netoCent), { decimales: true })}</td></tr>
                    </tbody>
                  </table>
                </div>
                {t.netoCent < 0 && <p className="adm-nota">La gestoría lo compensa o pide la devolución.</p>}
                <p className="adm-nota">Se presenta {t.plazo} (lo hace la gestoría).</p>
                {(t.retencionAlquilerCent > 0 || t.retencionProfesionalCent > 0) && (
                  <p className="adm-nota">Retenciones a ingresar (mismos plazos): {[t.retencionAlquilerCent > 0 && `alquiler (modelo 115) ${euros(t.retencionAlquilerCent, { decimales: true })}`, t.retencionProfesionalCent > 0 && `profesionales (modelo 111) ${euros(t.retencionProfesionalCent, { decimales: true })}`].filter(Boolean).join(' · ')}.</p>
                )}
                {t.extranjeroBaseCent > 0 && <p className="adm-nota">Compras a empresas de fuera de España: {euros(t.extranjeroBaseCent, { decimales: true })} sin IVA (la gestoría declara su IVA).</p>}
                {t.sinIvaCent > 0 && <p className="adm-nota">Cobros sin IVA (fianzas que os quedáis…): {euros(t.sinIvaCent, { decimales: true })}.</p>}
                <AvisosIva t={t} hoy={hoy} />
              </>
            ) : (
              <>
                <h2>Para Hacienda · {periodo.clave} (aprox.)</h2>
                <div className="adm-scroll">
                  <table className="adm-tabla adm-tabla--num">
                    <thead><tr><th>Trimestre</th><th>IVA cobrado</th><th>IVA de gastos</th><th>IVA a pagar</th><th>Ret. alquiler</th><th>Ret. profesionales</th><th>Plazo</th></tr></thead>
                    <tbody>{r.hacienda.map((x) => (
                      <tr key={x.trimestre}><th scope="row">{textoTrimestre(x.trimestre, { conRango: false })}</th><td className="num">{euros(x.cobrado.ivaCent - x.devuelto.ivaCent)}</td><td className="num">{euros(x.gastos.ivaCent)}</td><td className="num">{x.futuro ? '—' : euros(x.netoCent)}</td><td className="num">{euros(x.retencionAlquilerCent)}</td><td className="num">{euros(x.retencionProfesionalCent)}</td><td>{x.plazo}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                {r.hacienda.map((x) => <AvisosIva key={x.trimestre} t={x} hoy={hoy} prefijo={`${textoTrimestre(x.trimestre, { conRango: false })}: `} />)}
              </>
            )}
            <p className="adm-nota">Estimación con lo apuntado aquí; lo que vale es lo que presente la gestoría. Este dinero no es beneficio: guardadlo. El IRPF de la titular no está calculado.</p>
          </div>

          <div className="adm-caja" id="gestoria">
            <h2>Para la gestoría · {periodo.texto}</h2>
            <div className="adm-acciones">
              {['ingresos', 'gastos', 'facturas'].map((tp) => <a key={tp} href={`/api/admin/finanzas/exportar?p=${p}&tipo=${tp}`} className="adm-boton adm-boton--claro">{tp === 'ingresos' ? 'Ingresos (CSV)' : tp === 'gastos' ? 'Gastos (CSV)' : 'Facturas emitidas (CSV)'}</a>)}
            </div>
            <p className="adm-nota" style={{ marginTop: 8 }}>Para abrir en Excel o Google Sheets. Las facturas de las reservas de Calendly están en Stripe, y los justificantes, en Drive.</p>
            {periodo.tipo === 'mes' && <p className="adm-nota">Normalmente se manda por trimestres: <Link href={`/admin/movimientos?p=${t.trimestre}#gestoria`} className="adm-enlace">ver el {textoTrimestre(t.trimestre, { conRango: false })}</Link>.</p>}
            {r.rectificativas.length > 0 && <p className="adm-notas">Hacen falta facturas rectificativas (a mano) de: {r.rectificativas.map((x) => `${x.factura} (${x.de})`).join(', ')}.</p>}
            <ul className="adm-fin-lista">
              <li>Apuntad lo de Calendly de cada mes.</li>
              <li>Apuntad los cobros del día (fondos, equipo) y las facturas hechas a mano (AR-M).</li>
              <li>Revisad que los gastos variables del trimestre están todos (luz, agua, garrafas…).</li>
              <li>Pegad el enlace de Drive de cada factura de gasto.</li>
            </ul>
          </div>
        </>
      )}

      <details className="adm-caja">
        <summary>Cómo se calcula</summary>
        <div className="adm-fin-explica">
          <p>Facturación: todo lo cobrado en el periodo (reservas por horas, horas aparte de los planes, cuotas, lo de Calendly y lo apuntado a mano), menos lo devuelto, sin el IVA. Cuenta el día en que entra el dinero, no el día de la sesión.</p>
          <p>Las sesiones incluidas en un plan no suman: ya se cobran en la cuota.</p>
          <p>Las cuotas, horas aparte y fianzas que cobra Stripe cuentan solas desde el panel. Lo de Calendly no llega solo: se apunta una vez al mes. Las reservas de Calendly pasadas a la agenda no suman, para no contarlas dos veces.</p>
          <p>Las fianzas no son vuestras hasta que se resuelven: solo cuenta la parte que os quedáis, sin IVA (confirmadlo con la gestoría).</p>
          <p>Las facturas no suman aparte: cada factura es de un cobro que ya cuenta.</p>
          <p>Gastos: lo pagado sin el IVA que se puede descontar. Un ticket sin vuestro NIF cuenta entero. La retención del alquiler también es gasto: se paga a Hacienda en vez de al casero.</p>
          <p>Los gastos fijos cuentan en su mes desde el día 1, aunque se carguen más tarde.</p>
          <p>Beneficio = facturación − gastos. Es antes del IRPF. Lo que os llevéis vosotros no es un gasto del estudio; lo que os facture un colaborador, sí.</p>
          <p>Equipo caro: apuntadlo entero el mes en que se paga; la gestoría decide si lo reparte en varios años.</p>
          <p>IVA para Hacienda = IVA cobrado − IVA de las facturas de gastos con vuestro NIF. Es orientativo: el modelo 303 lo hace la gestoría.</p>
          <p>La cifra «Pagado de las sesiones del mes» de la Agenda cuenta por el día de la sesión; aquí, por el día del cobro. Por eso pueden no coincidir.</p>
        </div>
      </details>
      <Ajustes ajustes={r.ajustes} hoy={hoy} />
    </Panel>
  )
}

function AvisosIva({ t, hoy, prefijo = '' }) {
  const a = t.avisos
  const lineas = [
    a.cobrosDeAntes.n > 0 && `${a.cobrosDeAntes.n} ${a.cobrosDeAntes.n === 1 ? 'cobro de este trimestre es' : 'cobros de este trimestre son'} de sesiones o cuotas de un trimestre anterior (${euros(a.cobrosDeAntes.ivaCent)} de IVA). Comentadlo con la gestoría.`,
    a.sinCobrarEnT.n > 0 && `Hay ${a.sinCobrarEnT.n} ${a.sinCobrarEnT.n === 1 ? 'sesión ya hecha o cuota ya empezada' : 'sesiones ya hechas o cuotas ya empezadas'} de este trimestre sin cobrar (${euros(a.sinCobrarEnT.totalCent)}). Su IVA se debe aunque no se haya cobrado: comentadlo con la gestoría.`,
    a.faltaCalendly.length > 0 && `Faltan los cobros de Calendly de ${listaMeses(a.faltaCalendly, hoy)}: el IVA se queda corto.`,
    a.incompleto && 'El trimestre está incompleto: solo cuenta desde que lleváis aquí las cuentas.',
  ].filter(Boolean)
  if (!lineas.length) return null
  return <div className="adm-avisos">{lineas.map((l) => <div key={l}>{prefijo}{l}</div>)}</div>
}

function TablaMeses({ meses, total }) {
  return (
    <div className="adm-scroll">
      <table className="adm-tabla adm-tabla--num">
        <thead><tr><th>Mes</th><th>Facturación</th><th>Gastos</th><th>Beneficio</th><th>IVA para Hacienda</th></tr></thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{m.estado === 'futuro' || m.estado === 'sin_datos' ? m.texto : <Link href={`/admin/movimientos?p=${m.mes}`}>{m.texto}</Link>}</th>
              {m.estado === 'sin_datos' ? <td colSpan={4} className="adm-nota">sin datos</td> : m.estado === 'futuro' ? <td colSpan={4}>—</td> : (
                <>
                  <td className="num">{euros(m.facturacionCent)}</td>
                  <td className="num">{euros(m.gastosCent)}</td>
                  <td className={`num${m.beneficioCent < 0 ? ' adm-importe-negativo' : ''}`}>{euros(m.beneficioCent)}</td>
                  <td className="num">{euros(m.ivaNetoCent)}</td>
                </>
              )}
            </tr>
          ))}
          {total && <tr className="is-total"><th scope="row">Total</th><td className="num">{euros(total.facturacion.baseCent)}</td><td className="num">{euros(total.gastos.costeCent)}</td><td className="num">{euros(total.beneficioCent)}</td><td className="num">{euros(total.iva.netoCent)}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const periodo = leerPeriodo(ctx.query.p, hoy) || periodoActual('mes', hoy)
  const r = await resumenFinanzas(periodo)
  return { props: JSON.parse(JSON.stringify({ periodo, hoy, r, ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null })) }
}
