// Mes a mes: cada categoría, mes por mes, y cómo va el año (como Mes a mes de Gartalia).
// Sin IVA, para que cuadre con el Inicio. Cada cifra lleva a sus movimientos.
import Link from 'next/link'
import { useState } from 'react'
import Panel from '../../components/admin/Panel'
import { SelectorFlechas, Punto, Vacio } from '../../components/admin/ui'
import { eurRedondo, eurSigno, may } from '../../components/admin/movimientos/comun'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { ocultoEnCookie } from '../../components/admin/ui/Importes'
import { mesAMes } from '../../lib/finanzas/movimientos'
import { textoMes } from '../../lib/finanzas/calculos'
import { fechaMadrid } from '../../lib/reservas/tiempo'

const conCifras = (m) => m.estado === 'cerrado' || m.estado === 'en_curso'

function Celda({ cent, mes, cat, negativo = false }) {
  if (!conCifras(mes)) return <td className="num mam-vacia" aria-label="Sin datos">·</td>
  if (!cent) return <td className="num mam-vacia">·</td>
  return (
    <td className="num">
      <Link href={`/admin/movimientos?p=${mes.mes}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`} className="mam-celda ui-imp" title={`Ver los movimientos de ${textoMes(mes.mes)}`}>
        {negativo ? eurSigno(Math.round(cent / 100) * 100, false) : eurRedondo(cent)}
      </Link>
    </td>
  )
}

export default function MesAMes({ t, oculto }) {
  const [soloConApuntes, setSoloConApuntes] = useState(true)
  const meses = t.meses.filter((m) => !soloConApuntes || (conCifras(m) && m.conApuntes))
  const total = (valores) => meses.reduce((s, m) => s + (conCifras(m) ? valores[m.mes] || 0 : 0), 0)
  const enCurso = t.meses.find((m) => m.estado === 'en_curso')
  const nada = !t.ingresos.length && !t.gastos.length
  return (
    <Panel
      titulo="Mes a mes"
      sub="Cada categoría, mes por mes, y cómo va el año."
      ocultoInicial={oculto}
      clase="mov"
      acciones={<SelectorFlechas texto={`Año ${t.anio}`} etiqueta="Año" anterior={t.anterior ? `/admin/mes-a-mes?anio=${t.anterior}` : null} siguiente={t.siguiente ? `/admin/mes-a-mes?anio=${t.siguiente}` : null} />}
    >
      <div className="mam-barra">
        <label className="mov-check"><input type="checkbox" checked={soloConApuntes} onChange={(e) => setSoloConApuntes(e.target.checked)} />Solo los meses con apuntes</label>
        <span className="ui-t3">Importes sin IVA. Toca una cifra para ver sus movimientos.</span>
      </div>

      {nada || !meses.length ? (
        <Vacio texto={`No hay nada apuntado en ${t.anio}.`} />
      ) : (
        <div className="ui-tabla-caja mam-caja">
          <table className="ui-tabla mam-tabla">
            <caption className="ui-solo-lector">Ingresos, gastos y beneficio por mes de {t.anio}, sin IVA</caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                {meses.map((m) => <th key={m.mes} scope="col" className="num">{may(textoMes(m.mes, { corto: true }).split(' ')[0])}{m.estado === 'en_curso' ? '*' : ''}</th>)}
                <th scope="col" className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="mam-grupo">
                <th scope="row"><span className="mov-cat"><Punto color="var(--g-ingresos)" />Ingresos</span></th>
                {meses.map((m) => <td key={m.mes} className="num"><span className="ui-imp">{conCifras(m) ? eurRedondo(m.ingresosCent) : '·'}</span></td>)}
                <td className="num"><span className="ui-imp">{eurRedondo(total(Object.fromEntries(t.meses.map((m) => [m.mes, m.ingresosCent]))))}</span></td>
              </tr>
              {t.ingresos.map((f) => (
                <tr key={f.clave}>
                  <th scope="row" className="mam-cat">{f.nombre}</th>
                  {meses.map((m) => <Celda key={m.mes} cent={f.valores[m.mes]} mes={m} cat={f.clave} negativo={f.negativo} />)}
                  <td className="num mam-total"><span className="ui-imp">{f.negativo ? eurSigno(Math.round(total(f.valores) / 100) * 100, false) : eurRedondo(total(f.valores))}</span></td>
                </tr>
              ))}
              {t.gastos.map((g) => (
                <GrupoGasto key={g.grupo} g={g} meses={meses} total={total} />
              ))}
              <tr className="mam-resultado">
                <th scope="row">Beneficio</th>
                {meses.map((m) => <td key={m.mes} className={`num${conCifras(m) && m.beneficioCent < 0 ? ' ui-mal' : ''}`}><span className="ui-imp">{conCifras(m) ? eurSigno(Math.round(m.beneficioCent / 100) * 100, false) : '·'}</span></td>)}
                <td className="num"><span className="ui-imp">{eurSigno(Math.round(total(Object.fromEntries(t.meses.map((m) => [m.mes, m.beneficioCent]))) / 100) * 100, false)}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="ui-t3 mam-nota">
        {enCurso && `* ${may(textoMes(enCurso.mes, { soloNombre: true }))}, en curso. `}
        Los gastos cuentan sin el IVA que se descuenta (los tickets sin vuestro NIF, enteros). Beneficio = ingresos − gastos, antes del IRPF. El IVA a apartar está en <Link href="/admin/impuestos" className="mov-enlace">Impuestos</Link>.
      </p>
    </Panel>
  )
}

function GrupoGasto({ g, meses, total }) {
  return (
    <>
      <tr className="mam-grupo">
        <th scope="row"><span className="mov-cat"><Punto color={g.color} />{g.nombre}</span></th>
        {meses.map((m) => <td key={m.mes} className="num"><span className="ui-imp">{conCifras(m) ? (g.valores[m.mes] ? eurRedondo(g.valores[m.mes]) : '·') : '·'}</span></td>)}
        <td className="num"><span className="ui-imp">{eurRedondo(total(g.valores))}</span></td>
      </tr>
      {g.categorias.map((c) => (
        <tr key={c.clave}>
          <th scope="row" className="mam-cat">{c.nombre}</th>
          {meses.map((m) => <Celda key={m.mes} cent={c.valores[m.mes]} mes={m} cat={c.clave} />)}
          <td className="num mam-total"><span className="ui-imp">{eurRedondo(total(c.valores))}</span></td>
        </tr>
      ))}
    </>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const anioHoy = Number(hoy.slice(0, 4))
  const pedido = /^\d{4}$/.test(String(ctx.query.anio || '')) ? Number(ctx.query.anio) : anioHoy
  const anio = pedido > anioHoy || pedido < 2020 ? anioHoy : pedido
  const t = await mesAMes(anio)
  return { props: JSON.parse(JSON.stringify({ t, oculto: ocultoEnCookie(ctx.req) })) }
}
