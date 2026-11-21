// Inicio del panel: cómo va el mes de un vistazo (como el Inicio de AR Academy). Arriba, el saludo,
// «Por revisar» (lo pendiente, en una lista que se abre) y el mes; luego las cuatro cifras, la frase
// del mes, el gráfico por meses con «En qué se va el dinero» y los últimos movimientos. Dinero sin IVA (salvo los últimos
// movimientos, que van con IVA como en Movimientos).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Panel from '../../components/admin/Panel'
import { Cifra, Rejilla, Tarjeta, SelectorFlechas, EnlaceFlecha, Vacio, ocultoEnCookie, useImportesOcultos } from '../../components/admin/ui'
import { useEuros, aEuros } from '../../components/admin/graficas'
import PorRevisar from '../../components/admin/inicio/PorRevisar'
import { GraficoMeses, EnQueSeVa } from '../../components/admin/inicio/Graficos'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { datosInicio } from '../../lib/admin/inicio'
import { leerPeriodo, periodoActual, textoMes, mesDe, euros } from '../../lib/finanzas/calculos'
import { fechaMadrid, horaMadrid, textoFecha, textoFechaCorta } from '../../lib/reservas/tiempo'

const may = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
const cifraHoras = (x) => String(Math.round((x || 0) * 10) / 10).replace('.', ',')
const plural = (n, uno, varios) => `${cifraHoras(n)} ${n === 1 ? uno : varios}`

// «Viernes 20 de noviembre de 2026»
const fechaLarga = (f) => may(textoFecha(f).replace(',', ''))

function saludo(hora) {
  const h = Number(String(hora).slice(0, 2))
  if (h >= 6 && h < 14) return 'Buenos días'
  if (h >= 14 && h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

// Comparación de una cifra: «2.643 € más que a estas alturas de octubre»
function useDelta(d) {
  const e = useEuros()
  const comp = d.comparado
  const mesAnt = comp ? textoMes(mesDe(comp.desde), { soloNombre: true }) : null
  const cuando = d.tramo.enCurso ? `a estas alturas de ${mesAnt}` : `en ${mesAnt}`
  const incompleto = (estado) => (estado === 'incompleta' ? ' (incompleto)' : '')
  return {
    dinero(actual, anterior, modo) {
      if (!comp || comp.estado === 'sin_datos' || anterior === null || anterior === undefined) {
        return comp ? { texto: `Sin datos de ${mesAnt} para comparar`, tono: 'neutro' } : null
      }
      const dif = aEuros(actual) - aEuros(anterior)
      if (Math.abs(dif) < 100) return { texto: `Igual que ${cuando}${incompleto(comp.estado)}`, tono: 'neutro' }
      const sube = dif > 0
      const palabra = modo === 'resultado' ? (sube ? 'mejor' : 'peor') : sube ? 'más' : 'menos'
      const bueno = modo === 'gasto' ? !sube : sube
      return { texto: `${e(Math.abs(dif))} ${palabra} que ${cuando}${incompleto(comp.estado)}`, tono: bueno ? 'bien' : 'mal', direccion: sube ? 'sube' : 'baja' }
    },
    horas(actual, anterior) {
      if (!comp || comp.estadoSesiones === 'sin_datos' || anterior === null || anterior === undefined) {
        return comp ? { texto: `Sin reservas de ${mesAnt} para comparar`, tono: 'neutro' } : null
      }
      const dif = Math.round((actual - anterior) * 10) / 10
      if (Math.abs(dif) < 1) return { texto: `Igual que ${cuando}`, tono: 'neutro' }
      const sube = dif > 0
      return { texto: `${cifraHoras(Math.abs(dif))} h ${sube ? 'más' : 'menos'} que ${cuando}${incompleto(comp.estadoSesiones)}`, tono: sube ? 'bien' : 'mal', direccion: sube ? 'sube' : 'baja' }
    },
  }
}

function Cifras({ d }) {
  const e = useEuros()
  const delta = useDelta(d)
  const { ingresos, gastos, beneficio, ocupacion } = d.kpis
  const p = d.periodo.clave
  const bv = aEuros(ingresos.actual) - aEuros(gastos.actual)
  return (
    <Rejilla columnas="cifras" className="ini-cifras">
      <Cifra nombre="Ingresos" valor={e(ingresos.actual)} delta={delta.dinero(ingresos.actual, ingresos.comp)} href={`/admin/movimientos?p=${p}&tipo=entra`} />
      <Cifra nombre="Gastos" valor={e(gastos.actual)} delta={delta.dinero(gastos.actual, gastos.comp, 'gasto')} href={`/admin/movimientos?p=${p}&tipo=sale`} />
      <Cifra
        nombre="Beneficio" valor={<span className={bv < 0 ? 'ui-mal' : ''}>{e(bv, { signo: true })}</span>}
        delta={delta.dinero(beneficio.actual, beneficio.comp, 'resultado')} href="/admin/mes-a-mes"
      />
      <Cifra
        nombre="Horas reservadas" valor={`${cifraHoras(ocupacion.horas)} h`} sufijo={ocupacion.futurasPeriodo > 0 ? `· ${cifraHoras(ocupacion.futurasPeriodo)} h por venir` : ocupacion.actual !== null ? `· ${ocupacion.actual} % ocupado` : null}
        delta={delta.horas(ocupacion.horas, ocupacion.compHoras)} href="/admin/reservas"
      />
    </Rejilla>
  )
}

// La frase del mes, en lenguaje llano
function Frase({ d }) {
  const e = useEuros()
  const oculto = useImportesOcultos()
  const { ingresos, gastos, ocupacion } = d.kpis
  const mes = textoMes(d.periodo.clave, { soloNombre: true })
  const enCurso = d.tramo.enCurso
  const ing = aEuros(ingresos.actual)
  const bv = ing - aEuros(gastos.actual)
  const margen = ing > 0 && bv >= 0 ? Math.round((bv * 100) / ing) : null
  return (
    <p className="ini-lectura">
      En {mes}{enCurso ? ', de momento,' : ''} han entrado <strong>{e(ingresos.actual)}</strong> y han salido <strong>{e(gastos.actual)}</strong> en gastos.{' '}
      {bv >= 0 ? (
        <>Quedan <strong className={oculto ? '' : 'ui-bien'}>{e(bv)}</strong> de beneficio{margen !== null && !oculto ? ` (de cada 100 € que entran, se quedan ${margen} €)` : ''}.</>
      ) : (
        <>Se ha gastado <strong className={oculto ? '' : 'ui-mal'}>{e(-bv)} más</strong> de lo que ha entrado.</>
      )}
      {' '}El estudio ha estado ocupado {plural(ocupacion.horas, 'hora', 'horas')}.{' '}
      <span className="ini-lectura__nota">Sin IVA, con lo apuntado hasta {enCurso ? `hoy, ${textoFechaCorta(d.hoy)}` : 'fin de mes'}.</span>
    </p>
  )
}

const PUNTO = {
  horas: 'var(--g-ingresos)', horas_aparte: 'var(--g-teal)', cuota: 'var(--g-teal)', calendly: 'var(--g-azul)',
  devolucion: 'var(--g-arcilla)', gasto: 'var(--g-gastos)',
}

function Ultimos({ lista }) {
  const oculto = useImportesOcultos()
  const imp = (c) => (oculto ? '••• €' : `${c > 0 ? '+' : ''}${euros(c, { decimales: true })}`)
  return (
    <Tarjeta tabla titulo="Últimos movimientos" acciones={<EnlaceFlecha href="/admin/movimientos">Ver todos</EnlaceFlecha>} className="ini-ultimos">
      {lista.length === 0 ? (
        <Vacio texto="Todavía no hay movimientos." compacto />
      ) : (
        <ul className="ini-filas">
          {lista.map((m) => {
            const cuerpo = (
              <>
                <b>{m.concepto}</b>
                <span><i className="ui-punto" style={{ background: PUNTO[m.fuente] || 'var(--g-gris)' }} aria-hidden="true" />{m.categoria}{m.quien ? ` · ${m.quien}` : ''}{m.fijo ? ' · fijo' : ''}</span>
              </>
            )
            return (
              <li key={m.clave}>
                <span className="ini-filas__fecha">{textoFechaCorta(m.fecha)}</span>
                {m.enlace ? <Link href={m.enlace} className="ini-filas__principal">{cuerpo}</Link> : <span className="ini-filas__principal">{cuerpo}</span>}
                <span className={`ini-filas__importe${m.importeCent > 0 && !oculto ? ' ui-bien' : ''}`}>{imp(m.importeCent)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Tarjeta>
  )
}

function Contenido({ d }) {
  const p = d.periodo
  const mesTexto = textoMes(p.clave)
  if (p.antesDeDatos) {
    return <Vacio texto={`Sin datos de ${mesTexto}: el panel lleva las cuentas desde ${textoMes(d.desdeDatos)}.`} accion={<EnlaceFlecha href="/admin">Ir al mes de hoy</EnlaceFlecha>} />
  }
  return (
    <>
      <Cifras d={d} />
      <Frase d={d} />

      <div className="ini-dos">
        <GraficoMeses
          grafico={d.grafico} graficoAnio={d.graficoAnio} mesElegido={p.clave} hoy={d.hoy}
          hrefMes={(mes) => (mes === mesDe(d.hoy) ? '/admin' : `/admin?p=${mes}`)}
          nota={d.calendlyEnCurso ? `Lo cobrado por Calendly en ${textoMes(mesDe(d.hoy), { soloNombre: true })} se apunta al acabar el mes.` : null}
        />
        <EnQueSeVa
          categorias={d.categorias} totalCent={d.kpis.gastos.actual} textoMesElegido={mesTexto}
          hrefCategoria={(id) => `/admin/movimientos?p=${p.clave}&tipo=sale&categoria=${id}`}
          hrefGastos={`/admin/movimientos?p=${p.clave}&tipo=sale`}
        />
      </div>

      <Ultimos lista={d.ultimos} />
    </>
  )
}

export default function Inicio(d) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  useEffect(() => {
    let t
    const ini = () => { t = setTimeout(() => setCargando(true), 150) }
    const fin = () => { clearTimeout(t); setCargando(false) }
    router.events.on('routeChangeStart', ini)
    router.events.on('routeChangeComplete', fin)
    router.events.on('routeChangeError', fin)
    return () => {
      router.events.off('routeChangeStart', ini)
      router.events.off('routeChangeComplete', fin)
      router.events.off('routeChangeError', fin)
    }
  }, [router.events])
  const p = d.periodo
  return (
    <Panel
      titulo={d.saludo}
      sub={fechaLarga(d.hoy)}
      clase="ini"
      ocultoInicial={Boolean(d.oculto)}
      acciones={(
        <>
          <PorRevisar porCobrar={d.porCobrar} porResolver={d.porResolver} avisos={d.otrosAvisos} />
          <SelectorFlechas
          etiqueta="Mes" texto={may(textoMes(p.clave))}
          anterior={p.anterior ? `/admin?p=${p.anterior}` : null}
          siguiente={p.siguiente ? (p.siguiente === mesDe(d.hoy) ? '/admin' : `/admin?p=${p.siguiente}`) : null}
          />
        </>
      )}
    >
      <div className={`ini-contenido${cargando ? ' is-cargando' : ''}`}>
        <Contenido d={d} />
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const ahora = new Date()
  const hoy = fechaMadrid(ahora)
  const leido = leerPeriodo(ctx.query.p, hoy)
  // El Inicio mira siempre un mes (un ?p= de trimestre o de año vuelve al mes de hoy)
  const periodo = leido && leido.tipo === 'mes' ? leido : periodoActual('mes', hoy)
  const d = await datosInicio({ periodo, comparar: 'anterior' }, { ahora })
  return { props: JSON.parse(JSON.stringify({ ...d, oculto: ocultoEnCookie(ctx.req), saludo: saludo(horaMadrid(ahora)) })) }
}
