// Gráficos del Inicio: «Ingresos y gastos por mes» (barras de 6 meses o del año; tocar un mes
// cambia todo el Inicio a ese mes) y «En qué se va el dinero» (barra apilada y lista por categorías).
// Sin librerías: alturas y anchos en porcentaje. Importes sin IVA y sin céntimos.
import Link from 'next/link'
import { useContext, useState } from 'react'
import { Tarjeta, Conmutador, EnlaceFlecha } from '../ui'
import { useEuros, aEuros, ImportesOcultos } from '../graficas'
import { escalaBonita, textoMes } from '../../../lib/finanzas/calculos'

const may = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
// Colores de las categorías, por orden (distinguibles también con daltonismo)
export const COLORES = ['var(--g-ingresos)', 'var(--g-teal)', 'var(--g-azul)', 'var(--g-arcilla)', 'var(--g-gris)', 'var(--g-gastos)']

// Eje: «6 mil €», «3 mil €», «500 €»
function eurosEje(cent) {
  const e = Math.round(cent / 100)
  if (e >= 1000) return `${String(Math.round(e / 100) / 10).replace('.', ',')} mil €`
  return `${e} €`
}

const conDatos = (m) => m.estado === 'cerrado' || m.estado === 'en_curso'

export function GraficoMeses({ grafico, graficoAnio, mesElegido, hrefMes, hoy, nota }) {
  const e = useEuros()
  const oculto = useContext(ImportesOcultos)
  const [rango, setRango] = useState('6m')
  const anio = (graficoAnio[0]?.mes || hoy).slice(0, 4)
  const lista = rango === '6m' ? grafico.filter(conDatos).slice(-6) : graficoAnio
  const conCifras = lista.filter(conDatos)
  const sel = conCifras.find((m) => m.mes === mesElegido) || conCifras.at(-1) || null
  const tope = escalaBonita(Math.max(0, ...conCifras.flatMap((m) => [m.facturacionCent || 0, m.gastosCent || 0]))).topeCent
  const beneficio = (m) => aEuros(m.facturacionCent) - aEuros(m.gastosCent)
  const alto = (v) => `${Math.max(0, Math.min(100, ((v || 0) * 100) / tope))}%`
  const nombre = (m) => may(textoMes(m.mes, { soloNombre: true }))
  return (
    <Tarjeta
      titulo="Ingresos y gastos por mes"
      nota="Sin IVA. Toca un mes para verlo."
      acciones={(
        <Conmutador
          etiqueta="Periodo del gráfico" valor={rango} onCambio={setRango}
          opciones={[{ valor: '6m', texto: '6 meses' }, { valor: 'anio', texto: `Año ${anio}` }]}
        />
      )}
      className="ini-grafico-tarjeta"
    >
      {!sel ? (
        <p className="ini-vacio">Aún no hay cobros ni gastos apuntados.</p>
      ) : (
        <>
          <div className="ini-lectura-mes" aria-live="polite">
            <span className="ini-lectura-mes__mes">{nombre(sel)} {sel.mes.slice(0, 4)}{sel.estado === 'en_curso' ? ' · en curso' : ''}</span>
            <span><i className="ini-muestra" style={{ background: 'var(--g-ingresos)' }} />Ingresos <strong>{e(sel.facturacionCent)}</strong></span>
            <span><i className="ini-muestra" style={{ background: 'var(--g-gastos)' }} />Gastos <strong>{e(sel.gastosCent)}</strong></span>
            <span>Beneficio <strong className={oculto ? '' : beneficio(sel) < 0 ? 'ui-mal' : 'ui-bien'}>{e(beneficio(sel), { signo: true })}</strong></span>
          </div>
          <div className="ini-grafico">
            <div className="ini-grafico__eje" aria-hidden="true">
              {[1, 0.5, 0].map((f) => <span key={f} style={{ bottom: `${f * 100}%` }}>{f === 0 ? '0' : oculto ? '' : eurosEje(tope * f)}</span>)}
            </div>
            <div className="ini-grafico__lienzo" role="group" aria-label="Meses">
              {[1, 0.5].map((f) => <i key={f} className="ini-grafico__rej" style={{ bottom: `${f * 100}%` }} />)}
              {lista.map((m) => {
                const activo = conDatos(m)
                const barras = (
                  <span className="ini-grafico__barras">
                    <i style={{ height: alto(m.facturacionCent), background: 'var(--g-ingresos)' }} />
                    <i style={{ height: alto(m.gastosCent), background: 'var(--g-gastos)' }} />
                  </span>
                )
                if (!activo) return <span key={m.mes} className="ini-grafico__mes es-vacio" aria-hidden="true">{barras}</span>
                return (
                  <Link
                    key={m.mes} href={hrefMes(m.mes)} scroll={false}
                    className={`ini-grafico__mes${sel && m.mes === sel.mes ? ' is-sel' : ''}`}
                    aria-current={sel && m.mes === sel.mes ? 'true' : undefined}
                    aria-label={`${nombre(m)} ${m.mes.slice(0, 4)}: ingresos ${e(m.facturacionCent)}, gastos ${e(m.gastosCent)}`}
                  >
                    {barras}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="ini-grafico__etiquetas" aria-hidden="true">
            {lista.map((m) => <span key={m.mes} className={sel && m.mes === sel.mes ? 'is-sel' : ''}>{may(textoMes(m.mes, { corto: true }).split(' ')[0])}</span>)}
          </div>
        </>
      )}
      {nota && <p className="ini-nota">{nota}</p>}
    </Tarjeta>
  )
}

export function EnQueSeVa({ categorias, totalCent, textoMesElegido, hrefCategoria, hrefGastos }) {
  const e = useEuros()
  const top = categorias.slice(0, 5)
  const resto = categorias.slice(5)
  const filas = [
    ...top.map((c, i) => ({ ...c, color: COLORES[i] })),
    ...(resto.length === 1 ? [{ ...resto[0], color: COLORES[5] }] : resto.length ? [{ id: null, nombre: `Otras (${resto.length})`, costeCent: resto.reduce((a, c) => a + c.costeCent, 0), color: COLORES[5] }] : []),
  ]
  const total = filas.reduce((a, c) => a + c.costeCent, 0) || totalCent || 0
  const pct = (v) => (total > 0 ? Math.round((v * 100) / total) : 0)
  return (
    <Tarjeta
      titulo="En qué se va el dinero"
      nota={`${may(textoMesElegido)} · gastos: ${e(totalCent)}`}
      pie={<EnlaceFlecha href={hrefGastos}>Ver los gastos</EnlaceFlecha>}
    >
      {filas.length === 0 ? (
        <p className="ini-vacio">Sin gastos este mes.</p>
      ) : (
        <>
          <div className="ini-medidor" role="img" aria-label={`Reparto de los gastos: ${filas.map((c) => `${c.nombre} ${pct(c.costeCent)} %`).join(', ')}`}>
            {filas.map((c) => <i key={c.nombre} style={{ width: `${(c.costeCent * 100) / total}%`, background: c.color }} />)}
          </div>
          <ul className="ini-leyenda">
            {filas.map((c) => (
              <li key={c.nombre}>
                <Link href={c.id ? hrefCategoria(c.id) : hrefGastos}>
                  <i className="ini-muestra" style={{ background: c.color }} />
                  <span className="ini-leyenda__nombre">{c.nombre}</span>
                  <strong>{e(c.costeCent)}</strong>
                  <span className="ini-leyenda__pct">{pct(c.costeCent)} %</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  )
}
