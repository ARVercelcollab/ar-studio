// Inicio del panel: cómo va el estudio de un vistazo. A la izquierda, el dinero del periodo;
// a la derecha, el día a día (avisos, hoy, ocupación y próximos pagos).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext, useEffect, useState } from 'react'
import Panel, { chipEstado, ChipCuota } from '../../components/admin/Panel'
import SelectorPeriodo from '../../components/admin/Periodo'
import { ImportesOcultos, useEuros, aEuros, GraficoMeses, EN_MOVIL, Medidor, Icono } from '../../components/admin/graficas'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { datosInicio } from '../../lib/admin/inicio'
import { leerPeriodo, periodoActual, textoMes, textoTrimestre, mesDe } from '../../lib/finanzas/calculos'
import { FILTROS_INGRESO } from '../../lib/finanzas/config'
import { fechaMadrid, textoFechaCorta, textoDiaCorto } from '../../lib/reservas/tiempo'
import { textoDuracion } from '../../lib/reservas/config'

const h = (x) => textoDuracion(x, { corto: true })
// Horas como cifra sola («2,5»), para «2,5 de 4 h»
const cifra = (x) => String(Math.round(x * 100) / 100).replace('.', ',')
// Cifras dentro de un texto («3 cuotas sin pagar · 597 €»), para «Ocultar importes»
const IMPORTE = /−?\d{1,3}(\.\d{3})*(,\d{1,2})? €/g

// «4.º trimestre» (sin el año)
const trimestreCorto = (t) => textoTrimestre(t, { conRango: false }).replace(/ \d{4}$/, '')

// Cómo se nombra el periodo en los títulos: «de noviembre», «del 4.º trimestre», «de 2026»
// (con el año si no es el actual)
function nombrePeriodo(periodo, hoy) {
  const anio = periodo.desde.slice(0, 4)
  const deOtroAnio = anio !== hoy.slice(0, 4) ? ` de ${anio}` : ''
  if (periodo.tipo === 'anio') return { de: `de ${anio}`, en: `en ${anio}`, del: 'del año' }
  if (periodo.tipo === 'trimestre') {
    const t = `${trimestreCorto(periodo.clave)}${deOtroAnio}`
    return { de: `del ${t}`, en: `en el ${t}`, del: 'del trimestre' }
  }
  const m = `${textoMes(periodo.clave, { soloNombre: true })}${deOtroAnio}`
  return { de: `de ${m}`, en: `en ${m}`, del: 'del mes' }
}

// «de octubre» · «del 1–18 oct»
const deTramo = (texto) => `${/^\d/.test(texto) ? 'del' : 'de'} ${texto}`

// Desde cuándo lleva el panel las cuentas: «agosto de 2026»
const textoDesde = (desde) => `${textoMes(desde, { soloNombre: true })} de ${desde.slice(0, 4)}`

// Redondea a euros sin que cambie la suma: el euro que sobre o falte se lo lleva la fila
// que más se desvió al redondear. Así las filas suman lo mismo que el total que se enseña.
function redondearSumando(valores, totalCent) {
  const r = valores.map((v) => Math.round(v / 100) * 100)
  let falta = Math.round(totalCent / 100) * 100 - r.reduce((a, v) => a + v, 0)
  const paso = Math.sign(falta) * 100
  const orden = valores.map((_, i) => i).sort((a, b) => Math.sign(falta) * ((valores[b] - r[b]) - (valores[a] - r[a])))
  for (const i of orden) {
    if (!falta) break
    r[i] += paso
    falta -= paso
  }
  return r
}

// Página de cobros del periodo, con el filtro de esa fuente de ingreso (o 'devolucion')
function cobrosDe(p, fuente) {
  const filtro = Object.entries(FILTROS_INGRESO).find(([, fs]) => fs === fuente || (Array.isArray(fs) && fs.includes(fuente)))?.[0]
  return `/admin/movimientos/ingresos?p=${p}${filtro ? `&filtro=${filtro}` : ''}`
}

// Marcas: van con mayúscula aunque estén en medio de la frase
const NOMBRES_PROPIOS = /^(Aquaservice|Stripe|Calendly)$/

// Nombre de categoría para ir en una frase: sin la aclaración del final y en minúscula
// («Equipo (focos…)» → «equipo»), salvo siglas y marcas («IBI», «Aquaservice»)
function nombreEnFrase(nombre) {
  const corto = nombre.replace(/\s*\([^)]*\)\s*$/, '').trim() || nombre
  const primera = corto.split(' ')[0]
  const comun = /^\p{Lu}\P{Lu}*$/u.test(primera) && !NOMBRES_PROPIOS.test(primera)
  return comun ? corto.charAt(0).toLowerCase() + corto.slice(1) : corto
}

// «alquiler del local, alarma y 2 más» (el «Otros (n)» que junta las últimas cuenta como n)
function resumenCategorias(categorias) {
  const nombres = categorias.filter((c) => c.id !== null).map((c) => nombreEnFrase(c.nombre))
  const otros = categorias.find((c) => c.id === null)
  const mas = Math.max(0, nombres.length - 2) + (otros ? Number(/\d+/.exec(otros.nombre)?.[0] || 1) : 0)
  if (mas) return `${nombres.slice(0, 2).join(', ')} y ${mas} más`
  return nombres.join(' y ')
}

// Último día para presentar el modelo 303 (el texto largo es plazoTrimestre)
function fin303(trimestre) {
  const [y, n] = trimestre.split('-T').map(Number)
  return n === 4 ? `${y + 1}-01-30` : `${y}-${String(3 * n + 1).padStart(2, '0')}-20`
}

// ---------- Piezas ----------

// junto: algo pequeño al lado del título (un contador, la fecha)
function Tarjeta({ titulo, junto, enlace, ayuda, children }) {
  return (
    <section className="adm-inicio__tarjeta">
      <div className="adm-inicio__cab">
        <div>
          <h2>{titulo}{junto}</h2>
          {ayuda && <p className="adm-inicio__ayuda">{ayuda}</p>}
        </div>
        {enlace && <Link href={enlace[0]} className="adm-inicio__enlace">{enlace[1]}<Icono nombre="flecha" /></Link>}
      </div>
      {children}
    </section>
  )
}

// Fila tipo app: a la izquierda un icono o una fecha, el texto con su línea de debajo y, al
// final, un chip o un importe. Con enlace, toda la fila se puede tocar.
function Fila({ inicio, titulo, sub, tonoSub, fin, href, apagada, separada }) {
  const dentro = (
    <>
      {inicio}
      <span className="adm-inicio__fila-texto">
        <span className="adm-inicio__fila-titulo">{titulo}</span>
        {sub && <span className={`adm-inicio__fila-sub${tonoSub ? ` es-${tonoSub}` : ''}`}>{sub}</span>}
      </span>
      <span className="adm-inicio__fila-fin">{fin}{href && <Icono nombre="flecha" />}</span>
    </>
  )
  const clase = `adm-inicio__fila${apagada ? ' es-apagada' : ''}`
  return (
    <li className={separada ? 'es-separada' : undefined}>
      {href ? <Link href={href} className={clase}>{dentro}</Link> : <div className={clase}>{dentro}</div>}
    </li>
  )
}

const Ico = ({ nombre, tono = 'neutro' }) => <span className={`adm-inicio__fila-ico es-${tono}`}><Icono nombre={nombre} /></span>

function Dia({ fecha }) {
  const [dia, mes] = textoFechaCorta(fecha).split(' ')
  return <span className="adm-inicio__dia"><b>{dia}</b><i>{mes}</i></span>
}

// Pastilla con la diferencia: verde si es buena, roja si es mala. Con «Ocultar importes», solo la flecha.
function Delta({ dif, subeEsBueno }) {
  const e = useEuros()
  const oculto = useContext(ImportesOcultos)
  if (Math.round(dif / 100) === 0) return <span className="adm-inicio__var">= igual</span>
  const sube = dif > 0
  return (
    <span className={`adm-inicio__var ${sube === subeEsBueno ? 'es-bien' : 'es-mal'}`}>
      <Icono nombre={sube ? 'sube' : 'baja'} />
      {oculto ? <span className="adm-solo-lector">{sube ? 'Sube' : 'Baja'}</span> : e(dif, { signo: true })}
    </span>
  )
}

// ---------- Izquierda: el dinero ----------

function Par({ etiqueta, tipo, valor, comp, subeEsBueno, comparado }) {
  const e = useEuros()
  return (
    <div className="adm-inicio__par">
      <span className="adm-inicio__etq"><i className={`adm-inicio__muestra es-${tipo}`} />{etiqueta}</span>
      <strong className="adm-inicio__par-v">{e(valor)}</strong>
      {comparado && comparado.estado !== 'sin_datos' && comp !== null && (
        <span className="adm-inicio__delta"><Delta dif={valor - comp} subeEsBueno={subeEsBueno} />vs {comparado.texto}</span>
      )}
    </div>
  )
}

// antes: el periodo es de antes de que el panel llevara las cuentas («agosto de 2026»)
function Beneficio({ kpis, comparado, tramo, nombre, desdeDatos, antes }) {
  const e = useEuros()
  const oculto = useContext(ImportesOcultos)
  const { beneficio: b, ingresos, gastos } = kpis
  if (antes) {
    return (
      <section className="adm-inicio__tarjeta adm-inicio__heroe">
        <div className="adm-inicio__heroe-cab"><h2>Beneficio {nombre.de}</h2></div>
        <strong className="adm-inicio__cifra">—</strong>
        <p className="adm-inicio__nota">Sin datos: el panel lleva las cuentas desde {antes}.</p>
      </section>
    )
  }
  // Con los dos importes ya redondeados, para que cuadre con lo que se lee debajo
  const bv = aEuros(ingresos.actual) - aEuros(gastos.actual)
  // Una sola barra con su frase: cuánto cubren los ingresos o cuánto queda de cada 100 €
  let medida = null
  if (bv < 0 && gastos.actual > 0) {
    // Con pérdidas, nunca «el 100 %»
    const pct = Math.min(99, Math.max(0, Math.round((ingresos.actual * 100) / gastos.actual)))
    medida = [pct, `Los ingresos cubren el ${pct} % de los gastos ${nombre.del}.`]
  } else if (bv >= 0 && ingresos.actual >= 30000 && b.deCada100 !== null) {
    medida = [b.deCada100, `De cada 100 € que entran, os quedan ${b.deCada100} €.`]
  }
  return (
    <section className="adm-inicio__tarjeta adm-inicio__heroe">
      <div className="adm-inicio__heroe-cab">
        <h2>Beneficio {nombre.de}</h2>
        {tramo.enCurso && <span className="adm-inicio__pastilla">En curso · {tramo.texto}</span>}
      </div>
      <strong className={`adm-inicio__cifra${bv < 0 && !oculto ? ' es-neg' : ''}`}>{e(bv)}</strong>
      {/* Con «Ocultar importes» no sale: la frase enseña el margen */}
      {medida && !oculto && (
        <>
          <Medidor partes={[[medida[0], 'lleno']]} />
          <p className="adm-inicio__ayuda">{medida[1]}</p>
        </>
      )}
      <div className="adm-inicio__pares">
        <Par etiqueta="Ingresos" tipo="ing" valor={ingresos.actual} comp={ingresos.comp} subeEsBueno comparado={comparado} />
        <Par etiqueta="Gastos" tipo="gas" valor={gastos.actual} comp={gastos.comp} subeEsBueno={false} comparado={comparado} />
      </div>
      {comparado?.estado === 'sin_datos' && <p className="adm-inicio__nota">Sin datos {deTramo(comparado.texto)} para comparar.</p>}
      {/* Incompleta: el tramo comparado empieza antes de que el panel llevara las cuentas */}
      {comparado?.estado === 'incompleta' && <p className="adm-inicio__nota">Comparación incompleta: no hay datos de antes de {textoDesde(desdeDatos)}.</p>}
    </section>
  )
}

function Meses({ d, extra }) {
  const e = useEuros()
  const { periodo } = d
  const meses = d.grafico.filter((m) => m.estado === 'cerrado' || m.estado === 'en_curso')
  const vacio = meses.every((m) => !m.facturacionCent && !m.gastosCent)
  const nombreMes = (m) => (m.mes.slice(0, 4) === d.hoy.slice(0, 4) ? textoMes(m.mes, { soloNombre: true }) : m.texto)
  const ben = (m) => aEuros(m.facturacionCent) - aEuros(m.gastosCent)
  // El mejor de los meses ya cerrados que tienen cuentas (hacen falta dos para comparar)
  const mejorDe = (ms) => {
    const cerrados = ms.filter((m) => m.estado === 'cerrado' && (m.facturacionCent || m.gastosCent))
    return cerrados.length >= 2 ? cerrados.reduce((a, m) => (ben(m) > ben(a) ? m : a)) : null
  }
  const frase = (m) => {
    if (!m) return null
    return ben(m) >= 0
      ? `El mejor mes: ${nombreMes(m)}, con ${e(ben(m), { signo: true })} de beneficio.`
      : `El mes con menos pérdida: ${nombreMes(m)} (${e(ben(m))}).`
  }
  // En el móvil la gráfica solo enseña los últimos meses: la frase habla de esos (el CSS elige)
  const fAncho = frase(mejorDe(meses))
  const fMovil = frase(mejorDe(meses.slice(-EN_MOVIL)))
  const ayuda = fAncho === fMovil ? fAncho : (
    <>{fAncho && <span className="es-ancho">{fAncho}</span>}{fMovil && <span className="es-movil">{fMovil}</span>}</>
  )
  return (
    <Tarjeta titulo="Ingresos y gastos por mes" ayuda={ayuda}>
      {vacio ? (
        <p className="adm-inicio__vacio">
          {periodo.antesDeDatos ? `El panel lleva las cuentas desde ${textoDesde(d.desdeDatos)}: antes no hay datos.` : 'Aún no hay cobros ni gastos apuntados.'}
        </p>
      ) : (
        <>
          <GraficoMeses
            key={periodo.clave}
            meses={meses}
            mesPeriodo={periodo.tipo === 'mes' ? periodo.clave : null}
            hrefMes={(mes) => ({ pathname: '/admin', query: { ...extra, p: mes } })}
            hoy={d.hoy}
          />
          {d.calendlyEnCurso && <p className="adm-inicio__nota">Lo de Calendly de {textoMes(mesDe(d.hoy), { soloNombre: true })} se apunta al acabar el mes.</p>}
          {meses.length < 2 && <p className="adm-inicio__nota">Cada mes nuevo aparecerá aquí.</p>}
        </>
      )}
    </Tarjeta>
  )
}

function Bloque({ titulo, total, filas, max, tipo, vacio, pie }) {
  const e = useEuros()
  return (
    <div className="adm-inicio__bloque">
      <p className="adm-inicio__bloque-cab"><span>{titulo}</span><strong>{e(total)}</strong></p>
      {filas.length === 0 ? <p className="adm-inicio__vacio">{vacio}</p> : (
        <ul className="adm-inicio__barras-h">
          {filas.map((f) => (
            <li key={f.clave}>
              <Link href={f.href} className="adm-inicio__barra-fila">
                <span className="adm-inicio__barra-nombre">{f.nombre}{f.detalle && <em> · {f.detalle}</em>}</span>
                <span className="adm-inicio__barra-v">{e(f.cent)}</span>
              </Link>
              <Medidor partes={[[(Math.abs(f.cent) * 100) / max, f.cent < 0 ? 'resta' : tipo]]} />
            </li>
          ))}
        </ul>
      )}
      {pie}
    </div>
  )
}

function Detalle({ d, nombre, antes }) {
  const { kpis, periodo } = d
  const p = periodo.clave
  const enlace = [`/admin/movimientos?p=${p}`, 'Finanzas']
  if (antes) {
    return <Tarjeta titulo={`Detalle ${nombre.de}`} enlace={enlace}><p className="adm-inicio__vacio">Sin datos {nombre.de}.</p></Tarjeta>
  }
  const entra = [
    ...d.fuentes.filter((f) => f.baseCent).sort((a, b) => b.baseCent - a.baseCent).map((f) => ({
      clave: f.fuente, nombre: f.texto, cent: f.baseCent, href: cobrosDe(p, f.fuente),
    })),
    // Las fuentes son lo cobrado; con las devoluciones restadas, las filas suman los ingresos
    ...(d.devoluciones.n > 0 ? [{ clave: 'devoluciones', nombre: 'Devoluciones', cent: -d.devoluciones.baseCent, href: cobrosDe(p, 'devolucion') }] : []),
  ]
  const sale = d.grupos.filter((g) => g.costeCent).map((g) => ({
    clave: g.grupo, nombre: g.texto, detalle: resumenCategorias(g.categorias), cent: g.costeCent,
    href: `/admin/movimientos/gastos?p=${p}&grupo=${g.grupo}`,
  }))
  const redondeadas = (filas, total) => {
    const r = redondearSumando(filas.map((f) => f.cent), total)
    return filas.map((f, i) => ({ ...f, cent: r[i] }))
  }
  // Una sola escala para las dos mitades, así se comparan a simple vista
  const max = Math.max(1, ...[...entra, ...sale].map((f) => Math.abs(f.cent)))
  return (
    <Tarjeta titulo={`Detalle ${nombre.de}`} enlace={enlace}>
      <div className="adm-inicio__bloques">
        <Bloque titulo="Entra" total={kpis.ingresos.actual} filas={redondeadas(entra, kpis.ingresos.actual)} max={max} tipo="ing" vacio={`Aún no hay cobros ${nombre.en}.`} />
        <Bloque
          titulo="Sale" total={kpis.gastos.actual} filas={redondeadas(sale, kpis.gastos.actual)} max={max} tipo="gas" vacio={`Aún no hay gastos apuntados ${nombre.en}.`}
          pie={<Link href="/admin/movimientos/gastos/nuevo?volver=/admin" className="adm-inicio__mas">+ Apuntar gasto</Link>}
        />
      </div>
    </Tarjeta>
  )
}

// ---------- Derecha: el día a día ----------

function ParaHacer({ tareas }) {
  const oculto = useContext(ImportesOcultos)
  const tapar = (t) => (oculto ? String(t).replace(IMPORTE, '••• €') : t)
  const fila = (t, i) => <Fila key={i} inicio={<Ico nombre={t.nivel} tono={t.nivel} />} titulo={tapar(t.texto)} sub={t.chip} tonoSub={t.nivel} href={t.enlace} />
  return (
    <Tarjeta titulo="Para hacer" junto={<span className={`adm-inicio__contador es-${tareas[0].nivel}`}>{tareas.length}</span>}>
      <ul className="adm-inicio__filas">{tareas.slice(0, 5).map(fila)}</ul>
      {tareas.length > 5 && (
        <details className="adm-inicio__mas-tareas">
          <summary>y {tareas.length - 5} más</summary>
          <ul className="adm-inicio__filas">{tareas.slice(5).map(fila)}</ul>
        </details>
      )}
    </Tarjeta>
  )
}

// «Ana · 0 de 4 h usadas» · con varios: «Ana: 0 de 4 h · Luis: 3 de 8 h y 1 más»
function usoMiembros(s) {
  const uso = (m) => `${cifra(m.usadas)} de ${cifra(m.horas)} h`
  if (s.n === 1) return `${s.lista[0].nombre} · ${uso(s.lista[0])} usadas`
  const dos = s.lista.slice(0, 2).map((m) => `${m.nombre}: ${uso(m)}`).join(' · ')
  return s.n > 2 ? `${dos} y ${s.n - 2} más` : dos
}

function Hoy({ d }) {
  const hb = d.hoyBloque
  const s = d.suscripciones
  const manana = hb.manana ? `Mañana hay ${hb.manana.n === 1 ? '1 reserva' : `${hb.manana.n} reservas`}` : null
  return (
    <Tarjeta titulo="Hoy" junto={<small>{textoDiaCorto(d.hoy)}</small>} enlace={['/admin/reservas', 'Agenda']}>
      <ul className="adm-inicio__filas">
        {hb.n > 0 ? hb.reservas.map((r) => (
          <Fila
            key={r.id} inicio={<Ico nombre="reloj" />} href={`/admin/reserva/${r.id}`} apagada={r.hecha}
            titulo={<span className="adm-inicio__franja">{`${r.horaInicio} – ${r.horaFin}`}</span>} sub={`${r.nombre} · ${r.duracionTexto}${r.hecha ? ' · hecha' : ''}`} fin={chipEstado(r)}
          />
        )) : (
          <Fila inicio={<Ico nombre="calendario" />} titulo="Hoy no hay reservas" sub={manana || (hb.proxima ? null : 'No hay reservas próximas')} />
        )}
        {hb.n > 3 && <li className="adm-inicio__fila-mas"><Link href="/admin/reservas">y {hb.n - 3} más</Link></li>}
        {hb.n === 0 && hb.proxima && (
          <Fila inicio={<Ico nombre="reloj" />} href="/admin/reservas" titulo={`Próxima: ${textoDiaCorto(hb.proxima.fecha)}, ${hb.proxima.hora}`} sub={`${hb.proxima.nombre} · ${hb.proxima.duracionTexto}`} />
        )}
        {s.n > 0 && (
          <Fila
            separada inicio={<Ico nombre="persona" />} href="/admin/miembros"
            titulo={s.n === 1 ? '1 miembro activo' : `${s.n} miembros activos`} sub={usoMiembros(s)}
            fin={s.n === 1 && s.lista[0].cuota ? <ChipCuota chip={s.lista[0].cuota.chip} /> : null}
          />
        )}
      </ul>
      {s.n === 0 && <Link href="/admin/miembros/nueva" className="adm-inicio__mas">+ Nueva suscripción</Link>}
    </Tarjeta>
  )
}

function Ocupacion({ d, nombre }) {
  const o = d.kpis.ocupacion
  return (
    <section className="adm-inicio__tarjeta">
      <div className="adm-inicio__ocup-cab">
        <h2>Ocupación {nombre.de}</h2>
        <strong>{o.actual === null ? '—' : `${o.actual} %`}</strong>
      </div>
      {/* El %, la barra y la frase salen de las mismas horas: hasta hoy (incluido) o el periodo
          entero si ya acabó. Lo reservado de mañana en adelante va solo en la frase. */}
      <Medidor partes={[[o.actual ?? 0, 'lleno']]} />
      {o.actual !== null && (
        <p className="adm-inicio__ayuda">
          {h(o.horas)} de {h(o.posibles)} {d.tramo.enCurso ? 'hasta hoy' : 'posibles'}
          {o.futurasPeriodo > 0 && ` · ${h(o.futurasPeriodo)} más ya reservadas`}
        </p>
      )}
    </section>
  )
}

function ProximosPagos({ d }) {
  const e = useEuros()
  const fijos = d.proximosFijos
  const vistos = fijos.slice(0, 5)
  const resto = fijos.slice(5)
  const suma = (fs) => fs.reduce((a, f) => a + f.totalCent, 0)
  const totalCent = suma(fijos)
  // Las filas (con la de «y N más») suman lo mismo que el total de arriba
  const cifras = redondearSumando([...vistos.map((f) => f.totalCent), ...(resto.length ? [suma(resto)] : [])], totalCent)
  // El IVA se calcula para el periodo elegido: solo el trimestre de hoy es un pago que viene
  const iva = d.iva.find((t) => t.enCurso)
  return (
    <Tarjeta titulo="Próximos pagos" ayuda={fijos.length ? `${e(totalCent)} en los próximos 30 días, IVA incluido` : null}>
      {fijos.length === 0 && <p className="adm-inicio__vacio">No hay gastos fijos en los próximos 30 días.</p>}
      {(fijos.length > 0 || iva) && (
        <ul className="adm-inicio__filas">
          {vistos.map((f, i) => (
            <Fila key={`${f.fijoId}-${f.fecha}`} inicio={<Dia fecha={f.fecha} />} titulo={f.concepto} fin={<span className="adm-inicio__importe">{e(cifras[i])}</span>} />
          ))}
          {resto.length > 0 && (
            <Fila
              inicio={<Ico nombre="calendario" />} href="/admin/ajustes/fijos" titulo={`y ${resto.length} más`}
              fin={<span className="adm-inicio__importe">{e(cifras[vistos.length])}</span>}
            />
          )}
          {iva && (
            <Fila
              separada={fijos.length > 0} inicio={<Dia fecha={fin303(iva.trimestre)} />} href={`/admin/movimientos?p=${iva.trimestre}#hacienda`}
              titulo={`IVA del ${trimestreCorto(iva.trimestre)}`}
              sub={`Estimado${iva.netoCent < 0 ? ': sale a compensar' : ''} · modelo 303, del 1 al ${textoFechaCorta(fin303(iva.trimestre))}`}
              fin={<span className="adm-inicio__importe">≈ {e(Math.max(0, iva.netoCent))}</span>}
            />
          )}
        </ul>
      )}
      <Link href="/admin/ajustes/fijos" className="adm-inicio__mas">Ver gastos fijos<Icono nombre="flecha" /></Link>
    </Tarjeta>
  )
}

// ---------- Página ----------

function Contenido({ d, extra }) {
  const nombre = nombrePeriodo(d.periodo, d.hoy)
  // Un periodo de antes de que el panel llevara las cuentas: sin cifras (no son ceros de verdad)
  const antes = d.periodo.antesDeDatos ? textoDesde(d.desdeDatos) : null
  return (
    <div className="adm-inicio__rejilla">
      <div className="adm-inicio__col">
        <Beneficio kpis={d.kpis} comparado={d.comparado} tramo={d.tramo} nombre={nombre} desdeDatos={d.desdeDatos} antes={antes} />
        <Meses d={d} extra={extra} />
        <Detalle d={d} nombre={nombre} antes={antes} />
      </div>
      <div className="adm-inicio__col">
        {d.paraHacer.length > 0 && <ParaHacer tareas={d.paraHacer} />}
        <Hoy d={d} />
        <Ocupacion d={d} nombre={nombre} />
        <ProximosPagos d={d} />
      </div>
    </div>
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
  // Si llega ?comparar= en la URL, se mantiene al cambiar de periodo
  const extra = d.comparar !== 'anterior' ? { comparar: d.comparar } : {}
  return (
    <Panel
      titulo="Inicio"
      clase="adm-inicio"
      ocultoInicial={Boolean(d.oculto)}
      acciones={(
        <>
          <p className="adm-inicio__sub">
            Importes sin IVA
            <span className="adm-inicio__hora"> · Actualizado a las {d.actualizado} · <button type="button" onClick={() => router.replace(router.asPath, undefined, { scroll: false })}>Recargar</button></span>
          </p>
          <SelectorPeriodo periodo={d.periodo} hoy={d.hoy} ruta="/admin" extra={extra} tipos={['mes', 'anio']} />
        </>
      )}
    >
      {/* «Ocultar importes» lo lleva el armazón (Panel) para todo el panel */}
      <div className={`adm-inicio__contenido${cargando ? ' is-cargando' : ''}`}>
        <Contenido d={d} extra={extra} />
      </div>
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
