// Impuestos: el IVA del trimestre, para saber cuánto apartar (como Impuestos de Gartalia).
// IVA que habéis cobrado − IVA que habéis pagado = para apartar. Es orientativo: lo que vale es lo
// que presente la gestoría.
import { useState } from 'react'
import Panel from '../../components/admin/Panel'
import { SelectorFlechas, Tarjeta, Aviso, Conmutador, Tabla, Celda, Vacio, Punto } from '../../components/admin/ui'
import { EtiquetaFactura, FichaMovimiento, ExportarCsv, Importe, fechaCorta, eur, eurRedondo } from '../../components/admin/movimientos/comun'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { ocultoEnCookie } from '../../components/admin/ui/Importes'
import { impuestosDelTrimestre } from '../../lib/finanzas/movimientos'
import { leerPeriodo, trimestreDe, listaMeses } from '../../lib/finanzas/calculos'
import { fechaMadrid } from '../../lib/reservas/tiempo'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

function AvisosIva({ iva, hoy }) {
  const a = iva.avisos
  const lineas = [
    a.cobrosDeAntes.n > 0 && `${plural(a.cobrosDeAntes.n, 'cobro de este trimestre es', 'cobros de este trimestre son')} de sesiones o cuotas de un trimestre anterior (${eur(a.cobrosDeAntes.ivaCent)} de IVA). Comentadlo con la gestoría.`,
    a.sinCobrarEnT.n > 0 && `Hay ${plural(a.sinCobrarEnT.n, 'sesión ya hecha o cuota ya empezada', 'sesiones ya hechas o cuotas ya empezadas')} de este trimestre sin cobrar (${eur(a.sinCobrarEnT.totalCent)}). Su IVA se debe aunque no se haya cobrado: comentadlo con la gestoría.`,
    a.faltaCalendly.length > 0 && `Falta apuntar lo de Calendly de ${listaMeses(a.faltaCalendly, hoy)}: el IVA se queda corto.`,
    a.incompleto && 'El trimestre está incompleto: solo cuenta desde que lleváis aquí las cuentas.',
  ].filter(Boolean)
  const otros = [
    iva.retencionAlquilerCent > 0 && `Retención del alquiler (modelo 115): ${eur(iva.retencionAlquilerCent)}.`,
    iva.retencionProfesionalCent > 0 && `Retenciones de profesionales (modelo 111): ${eur(iva.retencionProfesionalCent)}.`,
    iva.extranjeroBaseCent > 0 && `Compras a empresas de fuera de España: ${eur(iva.extranjeroBaseCent)} sin IVA (la gestoría declara su IVA).`,
    iva.sinIvaCent > 0 && `Cobros sin IVA (fianzas que os quedáis…): ${eur(iva.sinIvaCent)}.`,
  ].filter(Boolean)
  if (!lineas.length && !otros.length) return null
  return (
    <Tarjeta titulo="Para tener en cuenta" className="imp-avisos">
      <ul className="imp-avisos__lista">
        {lineas.map((l) => <li key={l} className="is-aviso">{l}</li>)}
        {otros.map((l) => <li key={l}><span className="ui-imp">{l}</span></li>)}
      </ul>
      {otros.some((l) => l.includes('modelo')) && <p className="ui-t3">Las retenciones se ingresan en los mismos plazos que el IVA (lo hace la gestoría).</p>}
    </Tarjeta>
  )
}

export default function Impuestos({ i, oculto }) {
  const [pestana, setPestana] = useState('cobros')
  const [sel, setSel] = useState(null)
  const [, num] = i.trimestre.split('-T')
  const rango = (i.rango.match(/\((.*)\)/) || [])[1]
  const lista = pestana === 'cobros' ? i.cobros : i.gastos
  const total = i.ingresosBaseCent
  const conBarra = i.porTipo.filter((x) => x.baseCent > 0)
  const totalBarra = conBarra.reduce((s, x) => s + x.baseCent, 0)
  return (
    <Panel
      titulo="Impuestos"
      sub="El IVA del trimestre, para saber cuánto apartar."
      ocultoInicial={oculto}
      clase="mov"
      acciones={<>
        <SelectorFlechas texto={`${num}.º trimestre ${i.trimestre.slice(0, 4)}`} sub={rango} etiqueta="Trimestre"
          anterior={i.anterior ? `/admin/impuestos?t=${i.anterior}` : null} siguiente={i.siguiente ? `/admin/impuestos?t=${i.siguiente}` : null} />
        <ExportarCsv p={i.trimestre} textoPeriodo={i.texto} />
      </>}
    >
      <Aviso tono="aviso" titulo="Es una cuenta orientativa.">Sirve para saber cuánto dinero conviene apartar. La cifra buena la calcula y la confirma la gestoría.</Aviso>

      {i.recorte.sinDatos ? (
        <Vacio texto="Sin datos en este trimestre: todavía no se llevaban aquí las cuentas." />
      ) : (
        <>
          <div className="imp-cuenta">
            <div className="ui-tarjeta imp-cuenta__parte">
              <p className="imp-cuenta__nombre">IVA que habéis cobrado</p>
              <p className="imp-cuenta__valor ui-imp ui-num">{eur(i.iva.cobradoCent)}</p>
              <p className="ui-t3">En {plural(i.nCobrosConIva, 'cobro', 'cobros')}</p>
            </div>
            <span className="imp-cuenta__signo" aria-hidden="true">−</span>
            <div className="ui-tarjeta imp-cuenta__parte">
              <p className="imp-cuenta__nombre">IVA que habéis pagado</p>
              <p className="imp-cuenta__valor ui-imp ui-num">{eur(i.iva.pagadoCent)}</p>
              <p className="ui-t3">En {plural(i.nGastosConFactura, 'gasto con factura', 'gastos con factura')}</p>
            </div>
            <span className="imp-cuenta__signo" aria-hidden="true">=</span>
            <div className="ui-tarjeta imp-cuenta__parte imp-cuenta__parte--final">
              <p className="imp-cuenta__nombre">{i.iva.netoCent >= 0 ? 'Para apartar (estimación)' : 'A vuestro favor (estimación)'}</p>
              <p className="imp-cuenta__valor ui-imp ui-num">{eur(Math.abs(i.iva.netoCent))}</p>
              <p className="imp-cuenta__pie">{i.iva.enCurso ? `Con lo apuntado hasta hoy. Se presenta ${i.iva.plazo}.` : `Se presenta ${i.iva.plazo}.`}{i.iva.netoCent < 0 ? ' La gestoría lo compensa o pide la devolución.' : ''}</p>
            </div>
          </div>

          <div className="imp-dos">
            <Tarjeta titulo="Ingresos por tipo de factura" nota={<>{num}.º trimestre · ingresos sin IVA: <span className="ui-imp">{eurRedondo(total)}</span></>}>
              {i.porTipo.length ? (
                <>
                  {totalBarra > 0 && (
                    <div className="imp-medidor" aria-hidden="true">
                      {conBarra.map((x) => <i key={x.clase} style={{ width: `${(100 * x.baseCent) / totalBarra}%`, background: x.color }} />)}
                    </div>
                  )}
                  <ul className="imp-leyenda">
                    {i.porTipo.map((x) => (
                      <li key={x.clase}>
                        <Punto color={x.color} />
                        <span className="imp-leyenda__nombre">{x.nombre} <span className="ui-t3">({x.n})</span></span>
                        <b className="ui-imp ui-num">{x.baseCent < 0 ? '−' : ''}{eurRedondo(Math.abs(x.baseCent))}</b>
                        <span className="imp-leyenda__pct ui-t3">{total ? `${Math.round((100 * x.baseCent) / total)} %` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <Vacio compacto texto="No hay cobros en este trimestre." />}
            </Tarjeta>
            <Tarjeta titulo="Gastos sin factura" nota="Sin factura con vuestro NIF no se puede descontar su IVA.">
              {i.sinFactura.length ? (
                <>
                  <p className="imp-sin__resumen"><b>{plural(i.sinFactura.length, 'gasto', 'gastos')} por <span className="ui-imp">{eur(i.sinFactura.reduce((s, g) => s + g.totalCent, 0))}</span>.</b> Si se consigue la factura, baja lo que hay que apartar.</p>
                  <ul className="imp-sin__lista">
                    {i.sinFactura.map((g) => (
                      <li key={g.id}>
                        <button type="button" className="imp-sin__fila" onClick={() => setSel(g)}>
                          <span className="ui-t3 imp-sin__fecha">{fechaCorta(g.fecha)}</span>
                          <span className="imp-sin__concepto"><b>{g.concepto}</b><small className="ui-t3">{[g.categoria.nombre, g.quien].filter(Boolean).join(' · ')}</small></span>
                          <Importe m={g} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <Vacio compacto icono="ok" tono="bien" texto="Todos los gastos del trimestre tienen factura." />}
            </Tarjeta>
          </div>

          <AvisosIva iva={i.iva} hoy={i.hoy} />

          <Tarjeta tabla titulo="Facturas del trimestre" acciones={
            <Conmutador etiqueta="Facturas" valor={pestana} onCambio={setPestana} opciones={[
              { valor: 'cobros', texto: `Cobros ${i.cobros.length}` },
              { valor: 'gastos', texto: `Gastos ${i.gastos.length}` },
            ]} />
          }>
            {lista.length ? (
              <Tabla lista titulo={`Facturas del ${i.texto}: ${pestana}`} className="imp-tabla" columnas={[
                { texto: 'Fecha' }, { texto: 'Concepto' }, { texto: 'Factura' }, { texto: 'Sin IVA', der: true }, { texto: 'IVA', der: true }, { texto: 'Cuota de IVA', der: true }, { texto: 'Total', der: true },
              ]}>
                {lista.map((m) => {
                  const signo = m.tipo === 'devolucion' ? -1 : 1
                  return (
                    <tr key={m.id} className="ui-fila" onClick={() => setSel(m)}>
                      <td className="m-fecha">{fechaCorta(m.fecha)}</td>
                      <td className="m-principal">
                        <button type="button" className="mov-abrir" onClick={(e) => { e.stopPropagation(); setSel(m) }}>
                          <Celda principal={m.concepto} sub={m.quien} />
                        </button>
                      </td>
                      <td className="m-fila"><EtiquetaFactura factura={m.factura} /></td>
                      <td className="der m-oculto"><span className="ui-imp ui-num">{eur(signo * m.baseCent)}</span></td>
                      <td className="der m-oculto ui-num">{m.ivaPct !== null ? `${m.ivaPct} %` : '—'}</td>
                      <td className="der m-oculto"><span className="ui-imp ui-num">{eur(signo * m.ivaCent)}</span></td>
                      <td className="der m-derecha"><span className="ui-imp ui-num mov-importe">{eur(signo * m.totalCent)}</span></td>
                    </tr>
                  )
                })}
              </Tabla>
            ) : <Vacio compacto texto={pestana === 'cobros' ? 'No hay cobros en este trimestre.' : 'No hay gastos con factura en este trimestre.'} />}
          </Tarjeta>
          <p className="ui-t3 mam-nota">Este dinero no es beneficio: guardadlo. El IRPF de la titular no está calculado. Las facturas de Calendly y de las cuotas de Stripe están en Stripe; los justificantes de los gastos, en Drive.</p>
        </>
      )}
      <FichaMovimiento m={sel} onCerrar={() => setSel(null)} />
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const pedido = /^\d{4}-T[1-4]$/.test(String(ctx.query.t || '')) ? leerPeriodo(ctx.query.t, hoy) : null
  const periodo = pedido || leerPeriodo(trimestreDe(hoy), hoy)
  const i = await impuestosDelTrimestre(periodo)
  return { props: JSON.parse(JSON.stringify({ i, oculto: ocultoEnCookie(ctx.req) })) }
}
