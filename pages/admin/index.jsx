// Inicio del panel: cómo va el estudio de un vistazo (reservas, dinero, ocupación y avisos)
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext, useEffect, useState } from 'react'
import Panel, { Chip, chipEstado, ChipCuota, BarraHoras } from '../../components/admin/Panel'
import SelectorPeriodo from '../../components/admin/Periodo'
import {
  ImportesOcultos, useEuros, Variacion, BarrasMeses, LineasAcumuladas, BarrasH, Cascada, MapaCalor, BarraCapacidad, COLOR,
} from '../../components/admin/graficas'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { datosInicio } from '../../lib/admin/inicio'
import { leerPeriodo, periodoActual, textoMes, listaMeses } from '../../lib/finanzas/calculos'
import { fechaMadrid, textoFechaCorta } from '../../lib/reservas/tiempo'
import { textoDuracion } from '../../lib/reservas/config'

const h = (x) => textoDuracion(x, { corto: true })
const NIVEL_CHIP = { error: 'error', aviso: 'aviso', info: 'gris' }
const COMPARAR = [['anterior', 'Periodo anterior'], ['anio', 'Mismo periodo del año pasado'], ['no', 'Sin comparar']]

function Info({ texto }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <span className="adm-info">
      <button type="button" aria-label="Qué es" aria-expanded={abierto} onClick={(e) => { e.preventDefault(); setAbierto((a) => !a) }}>i</button>
      {abierto && <span className="adm-info__texto" role="note">{texto}</span>}
    </span>
  )
}

function Kpi({ etiqueta, info, cifra, negativo, variacion, comp, pie, enlace, children }) {
  return (
    <div className={`adm-kpi${negativo ? ' is-negativo' : ''}`}>
      <span className="adm-kpi__etq">{etiqueta}<Info texto={info} /></span>
      <strong className="adm-kpi__cifra">{cifra}</strong>
      {children}
      <span className="adm-kpi__var">{variacion}</span>
      {comp && <span className="adm-kpi__comp">{comp}</span>}
      {pie && <span className="adm-kpi__pie">{pie}</span>}
      <a href={enlace} className="adm-kpi__flecha" aria-label={`Ver el detalle de ${etiqueta.toLowerCase()}`}>›</a>
    </div>
  )
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
// 'del 1 al 18 de noviembre' · 'del 1 de octubre al 18 de noviembre'
// conAnio: escribe el año aunque el tramo no cambie de año (p. ej. al comparar con el año pasado)
function rangoLargo(desde, hastaExcl, conAnio = false) {
  const ult = new Date(`${hastaExcl}T12:00:00Z`)
  ult.setUTCDate(ult.getUTCDate() - 1)
  const h2 = ult.toISOString().slice(0, 10)
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = h2.split('-').map(Number)
  if (y1 === y2 && m1 === m2) return `del ${d1} al ${d2} de ${MESES[m2 - 1]}${conAnio ? ` de ${y2}` : ''}`
  if (y1 === y2) return `del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]}${conAnio ? ` de ${y2}` : ''}`
  return `del ${d1} de ${MESES[m1 - 1]} de ${y1} al ${d2} de ${MESES[m2 - 1]} de ${y2}`
}

function Caja({ id, titulo, subtitulo, resumen, children, acciones, className = '' }) {
  return (
    <figure className={`adm-caja adm-fig ${className}`} id={id}>
      <figcaption>
        <div className="adm-fig__cab">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p className="adm-fig__sub">{subtitulo}</p>}
          </div>
          {acciones}
        </div>
        {resumen && <p className="adm-fig__resumen">{resumen}</p>}
      </figcaption>
      {children}
    </figure>
  )
}

function Contenido(d) {
  const router = useRouter()
  const e = useEuros()
  const { kpis, comparado, tramo, periodo } = d
  const [mapaElegido, setMapa] = useState(periodo.tipo === 'mes' && d.ocupacion.pocas ? 'tresMeses' : 'tramo')
  useEffect(() => {
    setMapa(periodo.tipo === 'mes' && d.ocupacion.pocas ? 'tresMeses' : 'tramo')
  }, [periodo.clave]) // eslint-disable-line react-hooks/exhaustive-deps
  const mapa = periodo.tipo === 'mes' ? mapaElegido : 'tramo'
  const oculto = useContext(ImportesOcultos)
  const tapar = (t) => (oculto ? String(t).replace(/−?\d{1,3}(\.\d{3})*(,\d{1,2})? €/g, '••• €') : t)
  const textoComp = comparado?.texto || ''
  const estadoComp = comparado ? comparado.estado : 'no'
  const mesNombre = periodo.tipo === 'mes' ? textoMes(periodo.clave, { soloNombre: true }) : periodo.texto
  const ir = (p) => router.push({ pathname: '/admin', query: { ...router.query, p } }, undefined, { scroll: false })
  const enCurso = tramo.enCurso
  const conComp = (v, f = (x) => e(x)) => (comparado && comparado.estado !== 'sin_datos' && v !== null && v !== undefined ? `${textoComp}: ${f(v)}` : null)
  const varProps = { textoComp: textoComp ? `el ${textoComp}` : '', estado: estadoComp }

  // G3
  const ca = d.cascada.actual
  const cc = d.cascada.comp
  const sinGastos = !ca.gastosN
  const filasCascada = [
    { nombre: 'Cobrado (sin IVA)', tipo: 'inicio', valor: ca.cobradoCent, texto: e(ca.cobradoCent), comp: cc ? e(cc.cobradoCent) : undefined },
    { nombre: 'Devoluciones', tipo: 'resta', valor: ca.devolucionesCent, texto: e(ca.devolucionesCent), comp: cc ? e(cc.devolucionesCent) : undefined },
    { nombre: 'Ingresos', tipo: 'total', valor: ca.ingresosCent, texto: e(ca.ingresosCent), negativo: ca.ingresosCent < 0, comp: cc ? e(cc.ingresosCent) : undefined },
    { nombre: 'Gastos fijos', tipo: 'resta', valor: ca.fijosCent, texto: sinGastos ? '—' : e(ca.fijosCent), enlace: `/admin/finanzas/gastos?p=${periodo.clave}&grupo=fijo`, comp: cc ? e(cc.fijosCent) : undefined },
    { nombre: 'Gastos variables', tipo: 'resta', valor: ca.variablesCent, texto: sinGastos ? '—' : e(ca.variablesCent), enlace: `/admin/finanzas/gastos?p=${periodo.clave}&grupo=variable`, comp: cc ? e(cc.variablesCent) : undefined },
    { nombre: 'Material y herramientas', tipo: 'resta', valor: ca.materialCent, texto: sinGastos ? '—' : e(ca.materialCent), enlace: `/admin/finanzas/gastos?p=${periodo.clave}&grupo=material`, comp: cc ? e(cc.materialCent) : undefined },
    { nombre: 'Beneficio', tipo: 'total', valor: ca.beneficioCent, texto: e(ca.beneficioCent), negativo: ca.beneficioCent < 0, comp: cc ? e(cc.beneficioCent) : undefined },
  ]

  // G2
  const ev = d.evolucion
  const etiquetaPunto = (p, largo) => {
    if (ev.porMes) return largo ? textoMes(p.clave) : textoMes(p.clave, { corto: true }).split(' ')[0]
    const dia = Number(p.clave.slice(8, 10))
    return largo ? textoFechaCorta(p.clave) : periodo.tipo === 'mes' ? String(dia) : textoFechaCorta(p.clave)
  }
  let resumenG2
  if (ev.ingresosCent === 0 && ev.gastosCent === 0) resumenG2 = `Aún no hay cobros ni gastos en ${mesNombre}.`
  else if (ev.gastosCent > ev.ingresosCent) resumenG2 = enCurso ? `Faltan ${e(ev.gastosCent - ev.ingresosCent)} para cubrir los gastos${periodo.tipo === 'mes' ? ` de ${mesNombre}` : ''}.` : `${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)} cerró con ${e(ev.gastosCent - ev.ingresosCent)} de pérdida.`
  else if (ev.cruce) resumenG2 = ev.porMes ? `Los ingresos cubren los gastos desde ${textoMes(ev.cruce, { soloNombre: true })}.` : `Los ingresos cubren los gastos desde el ${textoFechaCorta(ev.cruce)}.`

  // G4 / G5
  const totalFuentes = d.fuentes.reduce((a, f) => a + f.baseCent, 0)
  const fuenteMax = [...d.fuentes].sort((a, b) => b.baseCent - a.baseCent)[0]
  const maxGasto = Math.max(1, ...d.grupos.flatMap((g) => g.categorias.map((c) => c.costeCent)))

  // G6
  const o = d.ocupacion
  const celdas = o.mapa[mapa]
  const fraseOcup = o.frase[mapa]

  // G7
  const r = d.reservas
  const durMax = [...r.porDuracion].sort((a, b) => b.n - a.n)[0]
  const llegadaTotal = r.llegada.reduce((a, x) => a + x.n, 0)
  const web = r.llegada.find((x) => x.id === 'web')

  const iva = d.iva[0]

  return (
    <>
      <div className="adm-dash__fila adm-dash__fila--hoy">
        <section className="adm-caja adm-hoy">
          <h2>Hoy · {d.hoyBloque.texto}</h2>
          {d.hoyBloque.n > 0 ? (
            <>
              <p className="adm-nota">{d.hoyBloque.n === 1 ? '1 reserva' : `${d.hoyBloque.n} reservas`} · {h(d.hoyBloque.horas)} · el estudio está ocupado el {d.hoyBloque.ocupacionPct ?? 0} % del día</p>
              {d.hoyBloque.reservas.map((x) => (
                <Link key={x.id} href={`/admin/reserva/${x.id}`} className={`adm-fila${x.esPlan ? ' adm-fila--plan' : ''}${x.hecha ? ' is-hecha' : ''}`}>
                  <span className="adm-fila__hora">{x.horaInicio} – {x.horaFin}</span>
                  <span className="adm-fila__quien">{x.nombre}<small>{x.duracionTexto}{x.hecha ? ' · hecha' : ''}</small></span>
                  <span />
                  {chipEstado(x)}
                </Link>
              ))}
              {d.hoyBloque.n > 3 && <p className="adm-nota">y {d.hoyBloque.n - 3} más</p>}
            </>
          ) : (
            <p className="adm-nota">
              Hoy no hay reservas.{' '}
              {d.hoyBloque.proxima ? `La próxima: ${d.hoyBloque.proxima.fechaTexto} a las ${d.hoyBloque.proxima.hora} (${d.hoyBloque.proxima.nombre}, ${d.hoyBloque.proxima.duracionTexto}).` : 'No hay reservas próximas.'}
            </p>
          )}
          <p className="adm-nota" style={{ marginTop: 8 }}>
            {d.hoyBloque.manana ? `Mañana: ${d.hoyBloque.manana.n === 1 ? '1 reserva' : `${d.hoyBloque.manana.n} reservas`}, la primera a las ${d.hoyBloque.manana.primera} · ` : ''}
            <Link href="/admin/agenda" className="adm-enlace">Ver agenda ›</Link>
          </p>
        </section>
        <section className="adm-caja adm-parahacer">
          <h2>Para hacer</h2>
          {d.paraHacer.length === 0 ? <p className="adm-nota">Todo al día.</p> : (
            <ul className="adm-parahacer__lista">
              {d.paraHacer.slice(0, 5).map((t, i) => (
                <li key={i}>
                  <Chip tipo={NIVEL_CHIP[t.nivel]}>{t.chip}</Chip>
                  {t.enlace ? <Link href={t.enlace}>{tapar(t.texto)} ›</Link> : <span>{tapar(t.texto)}</span>}
                </li>
              ))}
            </ul>
          )}
          {d.paraHacer.length > 5 && (
            <details>
              <summary>y {d.paraHacer.length - 5} más</summary>
              <ul className="adm-parahacer__lista">
                {d.paraHacer.slice(5).map((t, i) => (
                  <li key={i}><Chip tipo={NIVEL_CHIP[t.nivel]}>{t.chip}</Chip>{t.enlace ? <Link href={t.enlace}>{tapar(t.texto)} ›</Link> : <span>{tapar(t.texto)}</span>}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <SelectorPeriodo periodo={periodo} hoy={d.hoy} ruta="/admin" extra={d.comparar !== 'anterior' ? { comparar: d.comparar } : {}}>
        <label className="adm-periodo__comparar">Comparar con
          <select value={d.comparar} onChange={(ev2) => router.push({ pathname: '/admin', query: { ...router.query, comparar: ev2.target.value === 'anterior' ? undefined : ev2.target.value } }, undefined, { scroll: false })}>
            {COMPARAR.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </SelectorPeriodo>
      <p className="adm-nota adm-dash__contexto">
        {enCurso ? `Del ${rangoLargo(tramo.desde, tramo.hasta).slice(4)}` : `${periodo.texto.charAt(0).toUpperCase() + periodo.texto.slice(1)} completo`}
        {comparado ? `, comparado con ${enCurso ? `el periodo ${rangoLargo(comparado.desde, comparado.hasta, comparado.desde.slice(0, 4) !== tramo.desde.slice(0, 4))}` : `${comparado.texto} completo`}.` : '.'}
        {periodo.antesDeDatos && ` El panel lleva las cuentas desde ${textoMes(d.desdeDatos)}: antes no hay datos de dinero.`}
      </p>

      <div className="adm-kpis">
        <Kpi
          etiqueta="Ingresos" enlace="#de-donde"
          info="Lo que ha entrado en el periodo, sin IVA y descontando devoluciones. Cuenta el día en que se cobró, no el de la sesión. Las fianzas no cuentan."
          cifra={e(kpis.ingresos.actual)}
          variacion={<Variacion actual={kpis.ingresos.actual} comp={kpis.ingresos.comp} {...varProps} />}
          comp={conComp(kpis.ingresos.comp)}
          pie={`Con IVA han entrado ${e(kpis.ingresos.conIvaCent)}`}
        />
        <Kpi
          etiqueta="Gastos" enlace="#en-que-se-va"
          info="Gastos apuntados del periodo, sin IVA. Los fijos del mes cuentan desde el día 1."
          cifra={e(kpis.gastos.actual)}
          variacion={<Variacion actual={kpis.gastos.actual} comp={kpis.gastos.comp} subeEsBueno={false} {...varProps} />}
          comp={conComp(kpis.gastos.comp)}
          pie={kpis.gastos.n ? `De ellos, ${e(kpis.gastos.fijosCent)} fijos` : 'Aún no hay gastos apuntados'}
        />
        <Kpi
          etiqueta="Beneficio" enlace="#lo-que-queda" negativo={kpis.beneficio.actual < 0}
          info="Ingresos menos gastos, los dos sin IVA. No descuenta impuestos sobre el beneficio."
          cifra={e(kpis.beneficio.actual)}
          variacion={<Variacion actual={kpis.beneficio.actual} comp={kpis.beneficio.comp} conPorcentaje={false} {...varProps} />}
          comp={conComp(kpis.beneficio.comp)}
          pie={kpis.beneficio.actual < 0 ? 'Los gastos superan a los ingresos' : kpis.beneficio.ingresos >= 30000 && kpis.beneficio.deCada100 !== null ? `De cada 100 € que entran, os quedan ${kpis.beneficio.deCada100} €` : null}
        />
        <Kpi
          etiqueta="Ocupación" enlace="#ocupacion"
          info="Horas reservadas entre horas posibles (13 h al día, de 9 a 22, menos los bloqueos). Cuenta el día de la sesión. Los 30 minutos entre reservas no cuentan, así que el 100 % no se alcanza."
          cifra={kpis.ocupacion.actual === null ? '—' : `${kpis.ocupacion.actual} %`}
          variacion={<Variacion actual={kpis.ocupacion.actual} comp={kpis.ocupacion.comp} tipo="puntos" textoComp={varProps.textoComp} estado={comparado ? comparado.estadoSesiones : 'no'} />}
          comp={`${h(kpis.ocupacion.horas)} de ${h(kpis.ocupacion.posibles)} posibles`}
          pie={kpis.ocupacion.futurasPeriodo ? `Ya reservadas hasta fin de periodo: ${h(kpis.ocupacion.futurasPeriodo)}` : null}
        >
          <BarraHoras usadas={kpis.ocupacion.horas} total={kpis.ocupacion.posibles} conTexto={false} />
        </Kpi>
      </div>

      <Caja
        titulo="Ingresos y gastos por mes"
        subtitulo="Últimos 12 meses · sin IVA · por fecha de cobro"
        resumen={(() => {
          const m = d.grafico.find((x) => x.mes === (periodo.tipo === 'mes' ? periodo.clave : null)) || d.grafico.filter((x) => x.facturacionCent !== null).at(-1)
          if (!m || m.facturacionCent === null) return 'Aún no hay cobros ni gastos apuntados.'
          return `${m.texto.charAt(0).toUpperCase() + m.texto.slice(1)}${m.estado === 'en_curso' ? ', hasta hoy' : ''}: ${e(m.facturacionCent)} de ingresos y ${e(m.gastosCent)} de gastos. ${m.beneficioCent >= 0 ? `Os quedan ${e(m.beneficioCent)}.` : `Faltan ${e(-m.beneficioCent)}.`}`
        })()}
      >
        <BarrasMeses meses={d.grafico} onElegir={ir} hoyTexto={textoFechaCorta(d.hoy)} />
        {d.grafico.filter((m) => m.facturacionCent !== null).length < 2 && (
          <p className="adm-nota">El panel guarda datos desde {textoMes(d.desdeDatos)}. Cada mes nuevo aparecerá aquí.</p>
        )}
        {d.calendlyEnCurso && <p className="adm-notas">Lo cobrado por Calendly en {textoMes(d.hoy.slice(0, 7), { soloNombre: true })} se apunta al acabar el mes: hasta entonces, los ingresos de este mes se quedan cortos (en la comparación tampoco se cuenta el Calendly del mes anterior).</p>}
        {d.grafico.some((m) => m.faltaCalendly) && <p className="adm-notas">El punto naranja marca los meses en los que falta apuntar lo cobrado por Calendly. <Link href="/admin/finanzas/ingresos" className="adm-enlace">Apuntarlo</Link></p>}
      </Caja>

      <div className="adm-caja adm-apoyo">
        <div><span>Reservas por horas</span><strong>{d.apoyo.porHoras.n} · {h(d.apoyo.porHoras.horas)}</strong><Variacion actual={d.apoyo.porHoras.n} comp={d.apoyo.porHoras.comp} tipo="unidades" {...varProps} estado={comparado ? comparado.estadoSesiones : 'no'} /></div>
        <div><span>Sesiones de suscripción</span><strong>{d.apoyo.plan.n} · {h(d.apoyo.plan.horas)}</strong><Variacion actual={d.apoyo.plan.n} comp={d.apoyo.plan.comp} tipo="unidades" {...varProps} estado={comparado ? comparado.estadoSesiones : 'no'} /></div>
        <div><span>Miembros activos</span><strong>{d.apoyo.miembros.n}</strong><small>+{d.apoyo.miembros.altas} {d.apoyo.miembros.altas === 1 ? 'alta' : 'altas'} · {d.apoyo.miembros.bajas} {d.apoyo.miembros.bajas === 1 ? 'baja' : 'bajas'}</small></div>
        <div><span>Cuotas sin pagar</span>{d.apoyo.cuotasSinPagar.n ? <strong className="is-malo">{d.apoyo.cuotasSinPagar.n} · {e(d.apoyo.cuotasSinPagar.totalCent)}</strong> : <strong className="is-bueno">Ninguna</strong>}<small>A día de hoy</small></div>
      </div>

      <div className="adm-dash__fila adm-dash__fila--7-5">
        <Caja
          titulo={`${enCurso ? 'Cómo va' : 'Cómo fue'} ${periodo.tipo === 'anio' ? periodo.texto : periodo.tipo === 'trimestre' ? 'el trimestre' : mesNombre}`}
          subtitulo="Ingresos y gastos acumulados · sin IVA"
          resumen={resumenG2}
        >
          <LineasAcumuladas puntos={ev.puntos} comparacion={ev.comparacion} porMes={ev.porMes} cruce={ev.cruce} textoComp={ev.textoComparacion ? ev.textoComparacion.charAt(0).toUpperCase() + ev.textoComparacion.slice(1) : ''} etiquetaPunto={etiquetaPunto} />
        </Caja>
        <Caja id="lo-que-queda" titulo="De lo que entra a lo que queda" subtitulo={`${tramo.texto} · sin IVA`}>
          <Cascada filas={filasCascada} />
          {sinGastos && <p className="adm-nota">Aún no hay gastos apuntados · <Link href="/admin/finanzas/gastos/nuevo?volver=/admin" className="adm-enlace">Apuntar gasto</Link></p>}
          <p className="adm-nota">Sin IVA. El IVA va aparte, en «IVA del trimestre». Las fianzas no cuentan como ingreso.</p>
        </Caja>
      </div>

      <div className="adm-dash__fila adm-dash__fila--6-6">
        <Caja id="de-donde" titulo="De dónde vienen los ingresos" subtitulo={`${tramo.texto} · sin IVA`}
          resumen={fuenteMax && totalFuentes > 0 ? `La mayor parte viene de ${fuenteMax.texto.toLowerCase()} (${Math.round((fuenteMax.baseCent * 100) / totalFuentes)} %).` : 'Aún no hay cobros en este periodo.'}>
          <BarrasH color={COLOR.ingresos} filas={d.fuentes.map((f) => ({
            clave: f.fuente, nombre: f.texto, valor: f.baseCent, texto: e(f.baseCent),
            extra: `${totalFuentes > 0 ? Math.round((f.baseCent * 100) / totalFuentes) : 0} %`,
            enlace: `/admin/finanzas/ingresos?p=${periodo.clave}`,
          }))} />
          {d.devoluciones.n > 0 && <p className="adm-nota">Devoluciones: −{e(d.devoluciones.baseCent)} (no están en las barras).</p>}
          <p className="adm-nota"><Link href={`/admin/finanzas/ingresos?p=${periodo.clave}`} className="adm-enlace">Ver todos los cobros ›</Link></p>
        </Caja>
        <Caja id="en-que-se-va" titulo="En qué se va el dinero" subtitulo={`${tramo.texto} · sin IVA`}
          acciones={<Link href={`/admin/finanzas/gastos/nuevo?volver=/admin`} className="adm-boton adm-boton--claro adm-mini">+ Apuntar gasto</Link>}>
          {d.grupos.every((g) => !g.costeCent) ? (
            <p className="adm-nota">Aún no hay gastos apuntados en {mesNombre}.</p>
          ) : d.grupos.map((g) => (
            <div key={g.grupo} className="adm-gastogrupo">
              <div className="adm-gastogrupo__cab">
                <strong>{g.texto}</strong>
                <span className="num">{e(g.costeCent)}</span>
                {comparado && <Variacion actual={g.costeCent} comp={g.comp} subeEsBueno={false} {...varProps} />}
              </div>
              {g.categorias.length > 0 && <BarrasH color={COLOR.gastos} max={maxGasto} filas={g.categorias.map((c) => ({ clave: c.id || c.nombre, nombre: c.nombre, valor: c.costeCent, texto: e(c.costeCent), enlace: c.id ? `/admin/finanzas/gastos?p=${periodo.clave}&categoria=${c.id}` : null }))} />}
            </div>
          ))}
          <p className="adm-nota"><Link href={`/admin/finanzas/gastos?p=${periodo.clave}`} className="adm-enlace">Ver todos los gastos ›</Link></p>
        </Caja>
      </div>

      <Caja id="ocupacion" titulo="Ocupación" subtitulo="Por fecha de la sesión · de 9 a 22 h"
        acciones={periodo.tipo === 'mes' ? (
          <div className="adm-segmento adm-segmento--mini" role="radiogroup">
            <button type="button" role="radio" aria-checked={mapa === 'tramo'} className={mapa === 'tramo' ? 'is-activo' : ''} onClick={() => setMapa('tramo')}>Este mes</button>
            <button type="button" role="radio" aria-checked={mapa === 'tresMeses'} className={mapa === 'tresMeses' ? 'is-activo' : ''} onClick={() => setMapa('tresMeses')}>Últimos 3 meses</button>
          </div>
        ) : null}>
        <div className="adm-ocup">
          <div className="adm-ocup__a">
            <p className="adm-grande">{o.tramo.pct === null ? '—' : `${o.tramo.pct} %`}</p>
            <p className="adm-nota">{h(o.tramo.horas)} de {h(o.tramo.posibles)} posibles ({tramo.texto})</p>
            <BarraCapacidad celebradas={o.periodo.celebradas} futuras={o.periodo.futuras} posibles={o.periodo.posibles} />
            <p className="adm-leyenda adm-leyenda--texto">
              <span><i style={{ '--c': COLOR.ingresos }} />{h(o.periodo.celebradas)} hechas</span>
              <span><i className="is-rayado" style={{ '--c': COLOR.ingresos }} />{h(o.periodo.futuras)} reservadas por venir</span>
              <span><i style={{ '--c': COLOR.banda }} />{h(Math.max(0, o.periodo.posibles - o.periodo.celebradas - o.periodo.futuras))} libres</span>
            </p>
            <p className="adm-ocup__meses">{o.meses.map((m) => <span key={m.mes} className={m.actual ? 'is-actual' : ''}>{m.corto.split(' ')[0]} {m.pct === null ? '—' : `${m.pct} %`}</span>)}</p>
          </div>
          <div className="adm-ocup__b">
            <h3>Cuándo se usa el estudio{mapa === 'tresMeses' ? ' · últimos 3 meses' : ''}</h3>
            {fraseOcup ? <p className="adm-fig__resumen">{fraseOcup}</p> : <p className="adm-nota">Aún no hay sesiones en este periodo.</p>}
            {mapa === 'tresMeses' && o.pocas && periodo.tipo === 'mes' && <p className="adm-nota">Con pocas reservas, un solo mes todavía puede engañar.</p>}
            <MapaCalor celdas={celdas} porDia={o.porDia[mapa]} porHora={o.porHora[mapa]} />
          </div>
        </div>
      </Caja>

      <div className="adm-dash__fila adm-dash__fila--6-6">
        <Caja titulo="Reservas" subtitulo={tramo.texto}
          resumen={r.total ? `${durMax?.n ? `La duración más pedida: ${durMax.etiqueta} (${durMax.n} ${durMax.n === 1 ? 'reserva' : 'reservas'}). ` : ''}${llegadaTotal ? `El ${Math.round((web.n * 100) / llegadaTotal)} % llega por la web.` : ''}` : 'Aún no hay reservas en este periodo.'}>
          <h3 className="adm-fig__h3">Por duración (reservas por horas)</h3>
          <BarrasH color={COLOR.ingresos} filas={r.porDuracion.map((x) => ({ clave: x.etiqueta, nombre: x.etiqueta, valor: x.n, texto: `${x.n} · ${h(x.horas)}`, extra: x.finde ? `${x.finde} finde` : '' }))} />
          {r.plan.n > 0 && <p className="adm-nota">Además, {r.plan.n} {r.plan.n === 1 ? 'sesión' : 'sesiones'} de suscripción ({h(r.plan.horas)}).</p>}
          <h3 className="adm-fig__h3">Cómo llegan</h3>
          <BarrasH color={COLOR.ingresos} filas={r.llegada.map((x) => ({ clave: x.id, nombre: x.texto, valor: x.n, texto: `${x.n} · ${h(x.horas)}`, extra: llegadaTotal ? `${Math.round((x.n * 100) / llegadaTotal)} %` : '' }))} />
        </Caja>
        <Caja titulo="Suscripciones" acciones={<Link href="/admin/suscripciones" className="adm-enlace">Ver suscripciones ›</Link>}>
          {d.suscripciones.n === 0 ? (
            <>
              <p className="adm-nota">Aún no hay miembros con plan. Aquí veréis sus horas y si han pagado la cuota.</p>
              <p style={{ marginTop: 10 }}><Link href="/admin/suscripciones/nueva" className="adm-boton adm-mini">+ Nueva suscripción</Link></p>
            </>
          ) : (
            <>
              <p className="adm-grande">{d.suscripciones.n} {d.suscripciones.n === 1 ? 'miembro activo' : 'miembros activos'}</p>
              <p className="adm-nota">+{d.suscripciones.altas} {d.suscripciones.altas === 1 ? 'alta' : 'altas'} · {d.suscripciones.bajas} {d.suscripciones.bajas === 1 ? 'baja' : 'bajas'} en {tramo.texto} · Cuotas al mes: {e(d.suscripciones.cuotasMesCent)} sin IVA</p>
              <p className="adm-nota">En su periodo actual han usado {h(d.suscripciones.usadas)} de {h(d.suscripciones.incluidas)} incluidas.</p>
              <div className="adm-miembros">
                {d.suscripciones.lista.map((m) => (
                  <Link key={m.id} href={`/admin/suscripciones/${m.id}`} className="adm-miembros__fila">
                    <span>{m.nombre}<small>{m.planNombre}</small></span>
                    <BarraHoras usadas={m.usadas} total={m.horas} />
                    {m.cuota ? <ChipCuota chip={m.cuota.chip} /> : <span />}
                  </Link>
                ))}
              </div>
            </>
          )}
        </Caja>
      </div>

      <div className="adm-dash__fila adm-dash__fila--6-6">
        <Caja titulo={periodo.tipo === 'anio' ? `IVA de ${periodo.clave}` : `IVA del ${iva.texto}`} acciones={<Chip tipo="gris">estimación</Chip>}>
          {periodo.tipo === 'anio' ? (
            <div className="adm-scroll">
              <table className="adm-tabla adm-tabla--num">
                <thead><tr><th>Trimestre</th><th>IVA cobrado</th><th>IVA de gastos</th><th>A pagar</th></tr></thead>
                <tbody>{d.iva.map((t) => <tr key={t.trimestre}><th scope="row">{t.texto.split(' (')[0]}</th><td className="num">{t.futuro ? '—' : e(t.cobrado.ivaCent - t.devuelto.ivaCent)}</td><td className="num">{t.futuro ? '—' : e(t.gastos.ivaCent)}</td><td className="num">{t.futuro ? '—' : e(t.netoCent)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div className="adm-iva">
              <div><span>IVA que habéis cobrado a clientes</span><b className="num">{e(iva.cobrado.ivaCent - iva.devuelto.ivaCent)}</b></div>
              <div><span>− IVA que habéis pagado en gastos con factura</span><b className="num">{e(iva.gastos.ivaCent)}</b></div>
              <div className="is-total"><span>= {iva.netoCent >= 0 ? 'A pagar a Hacienda (aprox.)' : 'A compensar (aprox.)'}</span><b className="num">{e(Math.abs(iva.netoCent))}</b></div>
            </div>
          )}
          <p className="adm-nota">Se declara con el modelo 303{periodo.tipo !== 'anio' ? `; el de este trimestre, ${iva.plazo}` : ''}. Este dinero no es del estudio: conviene apartarlo.</p>
          {(() => {
            const faltan = (periodo.tipo === 'anio' ? d.iva : [iva]).flatMap((t) => t.avisos.faltaCalendly)
            return faltan.length > 0 ? <p className="adm-notas">Falta apuntar lo de Calendly de {listaMeses(faltan, d.hoy)}: el IVA se queda corto.</p> : null
          })()}
          <p className="adm-nota"><Link href={`/admin/finanzas?p=${periodo.clave}#hacienda`} className="adm-enlace">Ver el detalle para la gestoría ›</Link></p>
        </Caja>
        <Caja titulo="Próximos gastos fijos" subtitulo="Próximos 30 días">
          {d.proximosFijos.length === 0 ? (
            <p className="adm-nota">No hay gastos fijos en los próximos 30 días. <Link href="/admin/finanzas/fijos" className="adm-enlace">Añadir gastos fijos</Link></p>
          ) : (
            <>
              <ul className="adm-proximos">
                {d.proximosFijos.slice(0, 4).map((f) => <li key={`${f.fijoId}-${f.fecha}`}><span>{textoFechaCorta(f.fecha)}</span><span>{f.concepto}</span><b className="num">{e(f.totalCent)}</b></li>)}
              </ul>
              <p className="adm-nota">Próximos 30 días: {e(d.proximosFijos.reduce((a, f) => a + f.totalCent, 0))} <Link href="/admin/finanzas/fijos" className="adm-enlace">Ver gastos fijos ›</Link></p>
            </>
          )}
        </Caja>
      </div>
    </>
  )
}

export default function Inicio(d) {
  const router = useRouter()
  const [oculto, setOculto] = useState(Boolean(d.oculto))
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
  // Se recuerda en este navegador (cookie), también al recargar o volver otro día
  const alternar = () => {
    const nuevo = !oculto
    document.cookie = `adm_ocultar=${nuevo ? '1' : '0'}; path=/admin; max-age=31536000; samesite=lax`
    setOculto(nuevo)
  }
  return (
    <Panel
      titulo="Inicio"
      acciones={(
        <div className="adm-dash__acciones">
          <span className="adm-nota">Actualizado a las {d.actualizado} · <button type="button" className="adm-enlace" onClick={() => router.replace(router.asPath, undefined, { scroll: false })}>Recargar</button></span>
          <button type="button" className="adm-boton adm-boton--claro adm-mini" aria-pressed={oculto} onClick={alternar}>{oculto ? 'Ver importes' : 'Ocultar importes'}</button>
        </div>
      )}
    >
      <ImportesOcultos.Provider value={oculto}>
        <div className={`adm-dash${cargando ? ' is-cargando' : ''}`}>
          <Contenido {...d} />
        </div>
      </ImportesOcultos.Provider>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const periodo = leerPeriodo(ctx.query.p, hoy) || periodoActual('mes', hoy)
  const comparar = ['anterior', 'anio', 'no'].includes(ctx.query.comparar) ? ctx.query.comparar : 'anterior'
  const d = await datosInicio({ periodo, comparar })
  const oculto = /(?:^|;\s*)adm_ocultar=1(?:;|$)/.test(ctx.req.headers.cookie || '')
  return { props: JSON.parse(JSON.stringify({ ...d, oculto })) }
}
