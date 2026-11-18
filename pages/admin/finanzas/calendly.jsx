// Lo cobrado por Calendly (Stripe) en un mes, copiado del informe de Stripe
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import { SubmenuFinanzas, useAccion, Mensaje } from '../../../components/admin/Finanzas'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { calendlyDelMes, ajustesFinanzas } from '../../../lib/finanzas/servicio'
import { euros, leerImporte, textoMes, sumarMesesMes, mesDe } from '../../../lib/finanzas/calculos'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

const aTexto = (cent) => (cent ? (cent / 100).toFixed(2).replace('.', ',') : '')

function FormularioCalendly({ k }) {
  const router = useRouter()
  const [f, setF] = useState({
    cobrado: aTexto(k.fila?.cobradoCent), devuelto: aTexto(k.fila?.devueltoCent), comision: aTexto(k.comisionCent),
    enlace: k.fila?.enlace || '', nota: k.fila?.nota || '', nada: Boolean(k.fila && !k.fila.cobradoCent && !k.fila.devueltoCent),
  })
  const [total, setTotal] = useState('')
  const [estado, ejecutar] = useAccion()
  const poner = (c, v) => setF((x) => ({ ...x, [c]: v }))
  const pistas = k.pistas
  const t = leerImporte(total)
  const resto = t ? t - pistas.totalPanelCent : null
  const nombre = textoMes(k.mes, { soloNombre: true })
  return (
    <Panel titulo={`Calendly (Stripe) · ${textoMes(k.mes)}`} acciones={<Link href={`/admin/finanzas/ingresos?p=${k.mes}`} className="adm-boton adm-boton--claro">← Facturación</Link>}>
      <SubmenuFinanzas />
      <div className="adm-caja adm-fin-form">
        <label className="adm-fin-mes">Mes
          <select value={k.mes} onChange={(e) => router.push(`/admin/finanzas/calendly?mes=${e.target.value}`)}>{k.meses.map((m) => <option key={m} value={m}>{textoMes(m)}</option>)}</select>
        </label>
        <label className="adm-check" style={{ margin: '12px 0' }}>
          <input type="checkbox" checked={f.nada} onChange={(e) => setF((x) => ({ ...x, nada: e.target.checked, ...(e.target.checked ? { cobrado: '', devuelto: '' } : {}) }))} /> Ese mes no hubo cobros de Calendly (las comisiones de Stripe se apuntan igual)
        </label>
        <div className="adm-form">
          <label className="adm-ancho">Reservas de Calendly cobradas ese mes (con IVA)
            <input className="adm-fin-importe" inputMode="decimal" disabled={f.nada} value={f.cobrado} onChange={(e) => poner('cobrado', e.target.value)} placeholder="0,00" />
            <small>Del informe del mes en la cuenta de Stripe del estudio, solo los cobros de reservas de Calendly (lo bruto, no lo que llegó al banco).</small>
          </label>
          <div className="adm-avisos adm-ancho">
            <strong>Lo que el panel ya sabe de Stripe en {nombre} (no lo sumes)</strong>
            <div>Cuotas de suscripción cobradas por Stripe: {pistas.cuotas.n} · {euros(pistas.cuotas.cent, { decimales: true })}</div>
            <div>Horas aparte cobradas por Stripe: {pistas.horasAparte.n}{pistas.horasAparte.n ? ` · ${euros(pistas.horasAparte.cent, { decimales: true })}` : ''}</div>
            <div>Fianzas cobradas por Stripe: {pistas.fianzas.n}{pistas.fianzas.n ? ` · ${euros(pistas.fianzas.cent, { decimales: true })}` : ''}</div>
            <div><b>Total que ya está en el panel: {euros(pistas.totalPanelCent, { decimales: true })}</b></div>
            {pistas.reservasAgenda > 0 && <div>Reservas de Calendly pasadas a la agenda con cobro en {nombre}: {pistas.reservasAgenda}</div>}
          </div>
          <details className="adm-ancho">
            <summary>¿Solo tienes el total del informe? (opcional)</summary>
            <label>Total cobrado en Stripe ese mes
              <input inputMode="decimal" value={total} disabled={f.nada} onChange={(e) => {
                setTotal(e.target.value)
                const tt = leerImporte(e.target.value)
                if (tt && tt - pistas.totalPanelCent >= 0) poner('cobrado', aTexto(tt - pistas.totalPanelCent) || '0')
              }} />
            </label>
            {resto !== null && resto < 0 && <p className="adm-notas">El total es menor que lo que ya está en el panel: revisa el mes del informe.</p>}
          </details>
          <label>Devuelto ese mes (de reservas de Calendly)
            <input inputMode="decimal" disabled={f.nada} value={f.devuelto} onChange={(e) => poner('devuelto', e.target.value)} placeholder="0,00" />
            <small>Sin las devoluciones de cuotas o de fianzas, que ya se apuntan en su ficha. Cuotas devueltas por Stripe este mes: {pistas.cuotasDevueltas.n}.</small>
          </label>
          <label>Comisiones de Stripe ese mes (todas)
            <input inputMode="decimal" value={f.comision} onChange={(e) => poner('comision', e.target.value)} placeholder="0,00" />
            <small>Van solas a Gastos, en «Comisiones del banco y de cobro».</small>
          </label>
          <label className="adm-ancho">Enlace al informe (opcional)<input value={f.enlace} placeholder="https://dashboard.stripe.com/…" onChange={(e) => poner('enlace', e.target.value)} /></label>
          <label className="adm-ancho">Nota<input value={f.nota} onChange={(e) => poner('nota', e.target.value)} /></label>
        </div>
        <Mensaje estado={estado} />
        <div className="adm-acciones adm-fin-botones">
          <button type="button" className="adm-boton" disabled={estado.enviando} onClick={() => ejecutar('/api/admin/finanzas/calendly', { mes: k.mes, cobrado: f.nada ? '0' : f.cobrado, devuelto: f.nada ? '0' : f.devuelto, comision: f.comision, enlace: f.enlace, nota: f.nota, version: k.fila?.version })}>Guardar</button>
          {k.fila && <button type="button" className="adm-boton adm-boton--peligro" disabled={estado.enviando} onClick={() => { if (window.confirm(`¿Borrar lo apuntado de Calendly en ${nombre}? También se borra su comisión.`)) ejecutar('/api/admin/finanzas/calendly', { accion: 'borrar', mes: k.mes }) }}>Borrar este mes</button>}
        </div>
      </div>
    </Panel>
  )
}

// Un formulario por mes: al cambiar de mes empieza de cero (no arrastra las cifras del anterior)
export default function CalendlyMes({ k }) {
  return <FormularioCalendly key={k.mes} k={k} />
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const aj = await ajustesFinanzas(undefined, { hoy })
  const mesHoy = mesDe(hoy)
  let mes = typeof ctx.query.mes === 'string' && /^\d{4}-\d{2}$/.test(ctx.query.mes) ? ctx.query.mes : sumarMesesMes(mesHoy, -1)
  if (mes > mesHoy) mes = mesHoy
  if (mes < aj.desde) mes = aj.desde
  const k = await calendlyDelMes(mes, { hoy })
  return { props: JSON.parse(JSON.stringify({ k })) }
}
