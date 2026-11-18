// Gráficas del panel, sin librerías. Colores comprobados (daltonismo y contraste) con el
// validador: ingresos #8a4a1e, gastos #b9822f; ocupación en una escala de un solo tono.
// Cada gráfica tiene su tabla con los mismos datos («Ver tabla»).

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { euros, escalaBonita } from '../../lib/finanzas/calculos'

export const COLOR = {
  ingresos: '#8a4a1e',
  gastos: '#b9822f',
  comparacion: '#b5a597',
  texto: '#4b3828',
  textoSuave: '#76675a',
  rejilla: '#ece5dc',
  base: '#8a7a6c',
  bueno: '#4f6b3a',
  malo: '#a33b2b',
  banda: '#f6f3ef',
}
export const RAMPA_OCUPACION = ['#f6f3ef', '#c9a684', '#a97d55', '#83552f', '#5a3418'] // 0 %, 1–24, 25–49, 50–74, 75+

// ---------- Importes (con «Ocultar importes») ----------

export const ImportesOcultos = createContext(false)

// En el Inicio, euros sin céntimos (las cifras de detalle con céntimos están en Finanzas)
export function useEuros() {
  const oculto = useContext(ImportesOcultos)
  return (cent) => {
    if (cent === null || cent === undefined) return euros(cent)
    return oculto ? '••• €' : euros(Math.round(cent / 100) * 100)
  }
}

// Eje: '5.000 €', '12 mil €'
function eurosEje(cent, oculto) {
  if (oculto) return '•••'
  const e = Math.round(cent / 100)
  if (Math.abs(e) >= 10000) return `${Math.round(e / 1000).toLocaleString('es-ES')} mil €`
  return euros(e * 100)
}

// ---------- Ancho real del contenedor ----------

export function useAncho(inicial = 720) {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

const idSeguro = (id) => id.replace(/[^a-zA-Z0-9_-]/g, '')

// ---------- Variación frente al periodo comparado ----------

// tipo: euros | unidades | horas | puntos; subeEsBueno: true/false
export function Variacion({ actual, comp, tipo = 'euros', subeEsBueno = true, textoComp, estado = 'ok', conPorcentaje = true }) {
  const e = useEuros()
  if (estado === 'no') return null
  if (estado === 'sin_datos' || comp === null || comp === undefined || actual === null || actual === undefined) {
    return <span className="adm-var is-neutro">Sin datos de {textoComp}</span>
  }
  const d = actual - comp
  const igual = d === 0 || (comp !== 0 && Math.abs(d / comp) < 0.01)
  const chipIncompleta = estado === 'incompleta' ? <span className="adm-chip adm-chip--aviso" title="El panel no tiene datos de todo ese periodo">comparación incompleta</span> : null
  if (igual) return <span className="adm-var is-neutro">= igual que {textoComp} {chipIncompleta}</span>
  const sube = d > 0
  const bueno = sube === subeEsBueno
  const abs = Math.abs(d)
  let txt
  if (tipo === 'euros') {
    txt = `${e(abs)} ${sube ? 'más' : 'menos'}`
    if (conPorcentaje && comp >= 30000) txt += ` (${sube ? '+' : '−'}${Math.round((abs * 100) / comp)} %)`
  } else if (tipo === 'horas') txt = `${String(abs).replace('.', ',')} h ${sube ? 'más' : 'menos'}`
  else if (tipo === 'puntos') txt = `${abs} ${abs === 1 ? 'punto' : 'puntos'}`
  else txt = `${abs} ${sube ? 'más' : 'menos'}`
  return (
    <span className={`adm-var ${bueno ? 'is-bueno' : 'is-malo'}`}>
      <span aria-hidden="true">{sube ? '▲' : '▼'}</span> {txt} <span className="adm-var__comp">que {textoComp}</span> {chipIncompleta}
    </span>
  )
}

// ---------- Tabla con los datos de cada gráfica ----------

export function VerTabla({ titulo, columnas, filas }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <div className="adm-vertabla">
      <button type="button" className="adm-enlace" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>{abierta ? 'Ocultar tabla' : 'Ver tabla'}</button>
      <div className={abierta ? 'adm-scroll' : 'adm-solo-lector'}>
        <table className="adm-tabla adm-tabla--num">
          <caption className="adm-solo-lector">{titulo}</caption>
          <thead><tr>{columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => <tr key={i}>{f.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j} className="num">{v}</td>))}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

function Leyenda({ series }) {
  return (
    <div className="adm-leyenda">
      {series.map(([texto, color, tipo]) => (
        <span key={texto}>
          <i className={tipo === 'linea' ? 'is-linea' : tipo === 'rayado' ? 'is-rayado' : ''} style={{ '--c': color }} aria-hidden="true" />
          {texto}
        </span>
      ))}
    </div>
  )
}

// Tooltip: valor primero, nombre después; en el móvil se queda como «línea de lectura»
function Tooltip({ x, y, ancho, titulo, filas }) {
  if (x === null || x === undefined) return null
  const izq = x > ancho - 190
  return (
    <div className="adm-tooltip" style={{ left: izq ? undefined : x + 12, right: izq ? ancho - x + 12 : undefined, top: y }} role="presentation">
      <strong>{titulo}</strong>
      {filas.map(([nombre, valor, color]) => (
        <div key={nombre}>{color && <i style={{ background: color }} aria-hidden="true" />}<b>{valor}</b><span>{nombre}</span></div>
      ))}
    </div>
  )
}

// Barra con el extremo de datos redondeado (4 px) y recta en la base
function barra(x, y0, ancho, alto) {
  if (alto === 0) return ''
  const r = Math.min(4, ancho / 2, Math.abs(alto))
  if (alto > 0) {
    const y = y0 - alto
    return `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${y0}Z`
  }
  const y = y0 - alto
  return `M${x},${y0}V${y - r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y - r}V${y0}Z`
}

// ---------- G1: ingresos y gastos por mes ----------

export function BarrasMeses({ meses, onElegir, hoyTexto }) {
  const oculto = useContext(ImportesOcultos)
  const e = useEuros()
  const [ref, ancho] = useAncho()
  const uid = idSeguro(useId())
  const [activo, setActivo] = useState(null)
  const movil = ancho < 560
  const vista = movil ? meses.slice(-6) : meses
  const valores = vista.flatMap((m) => [m.facturacionCent, m.gastosCent]).filter((v) => v !== null)
  const max = Math.max(0, ...valores)
  const min = Math.min(0, ...valores)
  const { topeCent } = escalaBonita(max)
  const fondo = min < 0 ? escalaBonita(-min).topeCent : 0
  const ejeAncho = movil ? 44 : 56
  const alto = movil ? 160 : 200
  const plotW = ancho - ejeAncho
  const slot = plotW / vista.length
  const yCero = 10 + (alto * topeCent) / (topeCent + fondo)
  const escala = alto / (topeCent + fondo)
  const grupo = Math.min(slot * (movil ? 0.7 : 0.64), 52)
  const bw = Math.min(24, (grupo - 2) / 2)
  const ticks = [0, topeCent / 2, topeCent, ...(fondo ? [-fondo] : [])]
  const alturaTotal = alto + 20 + 38 + 26
  const actual = activo !== null ? vista[activo] : null
  return (
    <div className="adm-graf" ref={ref}>
      <Leyenda series={[['Ingresos', COLOR.ingresos], ['Gastos', COLOR.gastos], ['Mes en curso', COLOR.ingresos, 'rayado']]} />
      <div className="adm-graf__lienzo" style={{ height: alturaTotal }} onMouseLeave={() => setActivo(null)}>
        <svg width={ancho} height={alturaTotal} aria-hidden="true" focusable="false">
          <defs>
            {[['i', COLOR.ingresos], ['g', COLOR.gastos]].map(([k, c]) => (
              <pattern key={k} id={`${uid}${k}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="4" fill="#fff" /><line x1="0" y1="0" x2="0" y2="4" stroke={c} strokeWidth="1.5" />
              </pattern>
            ))}
          </defs>
          {ticks.map((t) => {
            const y = Math.round(yCero - t * escala) + 0.5
            return (
              <g key={t}>
                <line x1={ejeAncho} x2={ancho} y1={y} y2={y} stroke={t === 0 ? COLOR.base : COLOR.rejilla} strokeWidth="1" />
                <text x={ejeAncho - 6} y={y + 4} textAnchor="end" className="adm-graf__eje">{eurosEje(t, oculto)}</text>
              </g>
            )
          })}
          {vista.map((m, i) => {
            const x0 = ejeAncho + i * slot
            const cx = x0 + slot / 2
            const enCurso = m.estado === 'en_curso'
            const vacio = m.estado === 'sin_datos' || m.estado === 'futuro'
            const hI = vacio ? 0 : m.facturacionCent * escala
            const hG = vacio ? 0 : m.gastosCent * escala
            const xi = cx - bw - 1
            const xg = cx + 1
            return (
              <g key={m.mes}>
                {activo === i && <rect x={x0} y={8} width={slot} height={alto + 4} fill={COLOR.banda} />}
                {!vacio && hI !== 0 && <path d={barra(xi, yCero, bw, hI)} fill={enCurso ? `url(#${uid}i)` : COLOR.ingresos} stroke={enCurso ? COLOR.ingresos : 'none'} strokeWidth="1" />}
                {!vacio && hG !== 0 && <path d={barra(xg, yCero, bw, hG)} fill={enCurso ? `url(#${uid}g)` : COLOR.gastos} stroke={enCurso ? COLOR.gastos : 'none'} strokeWidth="1" />}
                {vacio && <text x={cx} y={yCero - 6} textAnchor="middle" className="adm-graf__eje">—</text>}
                {m.faltaCalendly && <circle cx={cx} cy={14} r={3.5} fill="#9a5b13"><title>Falta apuntar lo de Calendly</title></circle>}
                <text x={cx} y={alto + 28} textAnchor="middle" className={`adm-graf__mes${m.elegido ? ' is-elegido' : ''}${m.estado === 'futuro' ? ' is-futuro' : ''}`}>
                  {m.corto.split(' ')[0]}{enCurso ? '*' : ''}
                </text>
                {(m.corto.includes(' ') || i === 0) && <text x={cx} y={alto + 41} textAnchor="middle" className="adm-graf__anio">{m.mes.slice(0, 4)}</text>}
                {m.elegido && <line x1={x0 + 2} x2={x0 + slot - 2} y1={alto + 46.5} y2={alto + 46.5} stroke={COLOR.texto} strokeWidth="2" />}
                <text x={cx} y={alto + 70} textAnchor="middle" className={`adm-graf__benef${m.beneficioCent < 0 ? ' is-negativo' : ''}`}>
                  {m.beneficioCent === null ? '—' : oculto ? '•••' : eurosEje(m.beneficioCent, false).replace(' €', '')}
                </text>
              </g>
            )
          })}
          <text x={ejeAncho - 6} y={alto + 70} textAnchor="end" className="adm-graf__eje adm-graf__benefetq">BENEF.</text>
        </svg>
        {vista.map((m, i) => (
          <button
            key={m.mes}
            type="button"
            className="adm-graf__hit"
            style={{ left: ejeAncho + i * slot, width: slot, height: alto + 50 }}
            aria-label={`${m.texto}: ${m.facturacionCent === null ? 'sin datos' : `ingresos ${e(m.facturacionCent)}, gastos ${e(m.gastosCent)}, beneficio ${e(m.beneficioCent)}`}`}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
            onClick={() => (m.estado === 'futuro' ? null : onElegir?.(m.mes))}
            disabled={m.estado === 'futuro'}
          />
        ))}
        {actual && !movil && (
          <Tooltip
            x={ejeAncho + activo * slot + slot / 2}
            y={12}
            ancho={ancho}
            titulo={`${actual.texto.charAt(0).toUpperCase()}${actual.texto.slice(1)}${actual.estado === 'en_curso' ? ` · hasta ${hoyTexto}` : ''}`}
            filas={actual.facturacionCent === null ? [['', actual.estado === 'futuro' ? 'Aún no ha llegado' : 'Sin datos', null]] : [
              ['Ingresos', e(actual.facturacionCent), COLOR.ingresos],
              ['Gastos', e(actual.gastosCent), COLOR.gastos],
              ['Beneficio', e(actual.beneficioCent), null],
              ...(actual.ocupacionPct !== null && actual.ocupacionPct !== undefined ? [['Ocupación', `${actual.ocupacionPct} %`, null]] : []),
            ]}
          />
        )}
      </div>
      {movil && (
        <p className="adm-graf__lectura" aria-live="polite">
          {actual ? (actual.facturacionCent === null ? `${actual.texto}: sin datos` : `${actual.texto}: ingresos ${e(actual.facturacionCent)} · gastos ${e(actual.gastosCent)} · beneficio ${e(actual.beneficioCent)}`) : 'Toca un mes para ver sus cifras.'}
        </p>
      )}
      <VerTabla
        titulo="Ingresos y gastos por mes"
        columnas={['Mes', 'Ingresos', 'Gastos', 'Beneficio', 'Ocupación']}
        filas={meses.map((m) => [m.texto, m.facturacionCent === null ? '—' : e(m.facturacionCent), m.gastosCent === null ? '—' : e(m.gastosCent), m.beneficioCent === null ? '—' : e(m.beneficioCent), m.ocupacionPct === null || m.ocupacionPct === undefined ? '—' : `${m.ocupacionPct} %`])}
      />
    </div>
  )
}

// ---------- G2: cómo va el periodo (acumulado) ----------

export function LineasAcumuladas({ puntos, comparacion, porMes, cruce, textoComp, etiquetaPunto }) {
  const oculto = useContext(ImportesOcultos)
  const e = useEuros()
  const [ref, ancho] = useAncho(560)
  const [activo, setActivo] = useState(null)
  const movil = ancho < 480
  const alto = movil ? 150 : 180
  const ejeAncho = movil ? 44 : 56
  const n = Math.max(puntos.length, comparacion?.length || 0)
  const vals = [...puntos.flatMap((p) => [p.ingresosCent, p.gastosCent]), ...(comparacion || [])].filter((v) => v !== null && v !== undefined)
  const { topeCent } = escalaBonita(Math.max(0, ...vals))
  const min = Math.min(0, ...vals)
  const fondo = min < 0 ? escalaBonita(-min).topeCent : 0
  const plotW = ancho - ejeAncho - (movil ? 8 : 92)
  const x = (i) => ejeAncho + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1))
  const esc = alto / (topeCent + fondo)
  const yCero = 8 + topeCent * esc
  const y = (v) => yCero - v * esc
  const linea = (vals2, escalon = false) => {
    let d = ''
    vals2.forEach((v, i) => {
      if (v === null || v === undefined) return
      if (!d) d = `M${x(i)},${y(v)}`
      else if (escalon) d += `H${x(i)}V${y(v)}`
      else d += `L${x(i)},${y(v)}`
    })
    return d
  }
  const ing = puntos.map((p) => p.ingresosCent)
  const gas = puntos.map((p) => p.gastosCent)
  const ult = ing.reduce((a, v, i) => (v !== null ? i : a), -1)
  const ultComp = comparacion ? comparacion.length - 1 : -1
  const etiquetas = []
  if (ult >= 0) {
    etiquetas.push({ y: y(ing[ult]), texto: `Ingresos ${e(ing[ult])}`, color: COLOR.texto })
    etiquetas.push({ y: y(gas[ult]), texto: `Gastos ${e(gas[ult])}`, color: COLOR.texto })
  }
  if (ultComp >= 0) etiquetas.push({ y: y(comparacion[ultComp]), texto: `${textoComp} ${e(comparacion[ultComp])}`, color: COLOR.textoSuave })
  etiquetas.sort((a, b) => a.y - b.y)
  for (let i = 1; i < etiquetas.length; i++) if (etiquetas[i].y - etiquetas[i - 1].y < 14) etiquetas[i].y = etiquetas[i - 1].y + 14
  const ticksX = porMes ? puntos.map((_, i) => i) : puntos.map((p, i) => i).filter((i) => n <= 31 ? [0, 7, 14, 21, 28].includes(i) : puntos[i].clave.endsWith('-01'))
  const iCruce = cruce ? puntos.findIndex((p) => p.clave === cruce) : -1
  const altoTotal = alto + 30
  const sel = activo !== null ? puntos[activo] : null
  return (
    <div className="adm-graf" ref={ref}>
      {movil && <Leyenda series={[['Ingresos', COLOR.ingresos, 'linea'], ['Gastos', COLOR.gastos, 'linea'], ...(comparacion ? [[textoComp, COLOR.comparacion, 'linea']] : [])]} />}
      <div className="adm-graf__lienzo" style={{ height: altoTotal }} onMouseLeave={() => setActivo(null)}
        onMouseMove={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect()
          const px = ev.clientX - r.left
          const i = Math.round(((px - ejeAncho) / plotW) * (n - 1))
          setActivo(i >= 0 && i < puntos.length ? i : null)
        }}>
        <svg width={ancho} height={altoTotal} aria-hidden="true" focusable="false">
          {[0, topeCent / 2, topeCent].map((t) => (
            <g key={t}>
              <line x1={ejeAncho} x2={ejeAncho + plotW} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} stroke={t === 0 ? COLOR.base : COLOR.rejilla} />
              <text x={ejeAncho - 6} y={y(t) + 4} textAnchor="end" className="adm-graf__eje">{eurosEje(t, oculto)}</text>
            </g>
          ))}
          {ticksX.map((i) => <text key={i} x={x(i)} y={alto + 26} textAnchor="middle" className="adm-graf__eje">{etiquetaPunto(puntos[i])}</text>)}
          {iCruce >= 0 && (
            <g>
              <line x1={Math.round(x(iCruce)) + 0.5} x2={Math.round(x(iCruce)) + 0.5} y1={8} y2={yCero} stroke={COLOR.base} strokeWidth="1" strokeDasharray="1 3" />
              <text x={x(iCruce) + 4} y={16} className="adm-graf__eje">Gastos cubiertos</text>
            </g>
          )}
          {comparacion && <path d={linea(comparacion)} fill="none" stroke={COLOR.comparacion} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          <path d={linea(gas, true)} fill="none" stroke={COLOR.gastos} strokeWidth="2" strokeLinejoin="round" />
          <path d={linea(ing)} fill="none" stroke={COLOR.ingresos} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {ult >= 0 && <circle cx={x(ult)} cy={y(ing[ult])} r="4" fill={COLOR.ingresos} stroke="#fff" strokeWidth="2" />}
          {activo !== null && <line x1={Math.round(x(activo)) + 0.5} x2={Math.round(x(activo)) + 0.5} y1={8} y2={yCero} stroke={COLOR.base} />}
          {!movil && etiquetas.map((l) => <text key={l.texto} x={ejeAncho + plotW + 8} y={l.y + 4} className="adm-graf__fin" fill={l.color}>{l.texto}</text>)}
        </svg>
        {sel && !movil && (
          <Tooltip x={x(activo)} y={10} ancho={ancho} titulo={etiquetaPunto(sel, true)} filas={[
            ...(sel.ingresosCent === null ? [['', 'Aún no ha llegado', null]] : [['Ingresos', e(sel.ingresosCent), COLOR.ingresos], ['Gastos', e(sel.gastosCent), COLOR.gastos]]),
            ...(comparacion && comparacion[activo] !== undefined ? [[textoComp, e(comparacion[activo]), COLOR.comparacion]] : []),
          ]} />
        )}
      </div>
      {movil && <p className="adm-graf__lectura" aria-live="polite">{sel && sel.ingresosCent !== null ? `${etiquetaPunto(sel, true)}: ingresos ${e(sel.ingresosCent)} · gastos ${e(sel.gastosCent)}` : 'Toca la gráfica para ver un día.'}</p>}
      <VerTabla
        titulo="Ingresos y gastos acumulados"
        columnas={['Fecha', 'Ingresos', 'Gastos', ...(comparacion ? [textoComp] : [])]}
        filas={puntos.filter((p, i) => porMes || i % 7 === 0 || i === ult).filter((p) => p.ingresosCent !== null).map((p) => {
          const i = puntos.indexOf(p)
          return [etiquetaPunto(p, true), e(p.ingresosCent), e(p.gastosCent), ...(comparacion ? [comparacion[i] === undefined ? '—' : e(comparacion[i])] : [])]
        })}
      />
    </div>
  )
}

// ---------- Barras horizontales (fuentes, gastos, duraciones) ----------

export function BarrasH({ filas, color = COLOR.ingresos, max: maxDado }) {
  const max = maxDado ?? Math.max(1, ...filas.map((f) => f.valor || 0))
  return (
    <div className="adm-barrash">
      {filas.map((f) => (
        <div key={f.clave || f.nombre} className={`adm-barrash__fila${f.valor ? '' : ' is-cero'}`}>
          <span className="adm-barrash__nombre" title={f.nombre}>{f.enlace ? <a href={f.enlace}>{f.nombre}</a> : f.nombre}</span>
          <span className="adm-barrash__pista"><span style={{ width: `${Math.max(f.valor > 0 ? 2 : 0, (100 * (f.valor || 0)) / max)}%`, background: color }} /></span>
          <span className="adm-barrash__valor num">{f.texto}</span>
          {f.extra !== undefined && <span className="adm-barrash__extra">{f.extra}</span>}
        </div>
      ))}
    </div>
  )
}

// ---------- G3: de lo que entra a lo que queda ----------

export function Cascada({ filas }) {
  const vals = filas.map((f) => f.valor ?? 0)
  const max = Math.max(1, ...filas.filter((f) => f.tipo !== 'resta').map((f) => f.valor ?? 0))
  const min = Math.min(0, ...vals.filter((v, i) => filas[i].tipo === 'total'))
  const rango = max - min
  const pos = (v) => ((v - min) * 100) / rango
  let acumulado = 0
  return (
    <div className="adm-cascada" role="table">
      {filas.map((f) => {
        let izq
        let anc
        if (f.tipo === 'resta') {
          const a = acumulado - (f.valor || 0)
          izq = pos(a)
          anc = pos(acumulado) - pos(a)
          acumulado = a
        } else {
          acumulado = f.valor || 0
          izq = pos(Math.min(0, acumulado))
          anc = Math.abs(pos(acumulado) - pos(0))
        }
        return (
          <div key={f.nombre} role="row" className={`adm-cascada__fila is-${f.tipo}`}>
            <span role="cell" className="adm-cascada__signo">{f.tipo === 'resta' ? '−' : f.tipo === 'total' ? '=' : ''}</span>
            <span role="cell" className="adm-cascada__nombre">{f.enlace ? <a href={f.enlace}>{f.nombre}</a> : f.nombre}</span>
            <span role="cell" className="adm-cascada__pista" aria-hidden="true">
              {min < 0 && <i className="adm-cascada__cero" style={{ left: `${pos(0)}%` }} />}
              <span style={{ left: `${izq}%`, width: `${Math.max(0, anc)}%`, background: f.tipo === 'resta' ? COLOR.gastos : f.negativo ? COLOR.malo : COLOR.ingresos }} />
            </span>
            <span role="cell" className={`adm-cascada__valor num${f.negativo ? ' is-negativo' : ''}`}>{f.texto}</span>
            {f.comp !== undefined && <span role="cell" className="adm-cascada__comp num">{f.comp}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------- G6: mapa de calor de la ocupación ----------

const tramoOcupacion = (pct) => (pct === null ? null : pct === 0 ? 0 : pct < 25 ? 1 : pct < 50 ? 2 : pct < 75 ? 3 : 4)

export function MapaCalor({ celdas, porDia, porHora }) {
  const [activo, setActivo] = useState(null)
  const nombres = { lun: 'Lunes', mar: 'Martes', mié: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sáb: 'Sábado', dom: 'Domingo' }
  const maxHora = Math.max(...porHora.map((h) => h.pct || 0))
  const frase = (c) => (c.bloqueada ? `${nombres[c.dia]} de ${c.hora} a ${c.hora + 1} h: bloqueado` : `${nombres[c.dia]} de ${c.hora} a ${c.hora + 1} h: ocupado el ${c.pct ?? 0} %`)
  return (
    <div className="adm-calor">
      <div className="adm-calor__rejilla" role="grid" aria-label="Ocupación por día de la semana y hora">
        <span />
        {porHora.map((h) => <span key={h.hora} className="adm-calor__hora" aria-hidden="true">{h.hora}</span>)}
        <span className="adm-calor__hora" aria-hidden="true" />
        {celdas.map((fila, d) => (
          <div key={d} role="row" className="adm-calor__fila">
            <span className="adm-calor__dia">{fila[0].dia}</span>
            {fila.map((c) => {
              const t = tramoOcupacion(c.pct)
              return (
                <button
                  key={c.hora}
                  type="button"
                  role="gridcell"
                  className={`adm-calor__celda${c.bloqueada ? ' is-bloqueada' : ''}${activo === c ? ' is-activa' : ''}`}
                  style={{ background: c.bloqueada ? undefined : RAMPA_OCUPACION[t ?? 0] }}
                  aria-label={frase(c)}
                  onMouseEnter={() => setActivo(c)}
                  onFocus={() => setActivo(c)}
                  onClick={() => setActivo(c)}
                />
              )
            })}
            <span className="adm-calor__total">
              <i style={{ width: `${Math.round(((porDia[d].pct || 0) * 60) / 100)}px` }} aria-hidden="true" />
              {porDia[d].pct === null ? '—' : `${porDia[d].pct} %`}
            </span>
          </div>
        ))}
        <span />
        {porHora.map((h) => <span key={h.hora} className={`adm-calor__pie${h.pct && h.pct === maxHora ? ' is-max' : ''}`}>{h.pct === null ? '' : h.pct}</span>)}
        <span />
      </div>
      <p className="adm-graf__lectura" aria-live="polite">{activo ? frase(activo) : 'Pasa por una casilla (o tócala) para ver su ocupación.'}</p>
      <div className="adm-leyenda adm-leyenda--calor">
        {['0 %', '1–24 %', '25–49 %', '50–74 %', '75 % o más'].map((t, i) => <span key={t}><i style={{ '--c': RAMPA_OCUPACION[i] }} aria-hidden="true" />{t}</span>)}
      </div>
      <VerTabla
        titulo="Ocupación por día y hora (%)"
        columnas={['Día', ...porHora.map((h) => `${h.hora} h`), 'Total']}
        filas={celdas.map((fila, d) => [nombres[fila[0].dia], ...fila.map((c) => (c.bloqueada ? 'bloq.' : c.pct ?? '—')), porDia[d].pct === null ? '—' : `${porDia[d].pct} %`])}
      />
    </div>
  )
}

// Barra de capacidad: horas hechas, reservadas por venir y libres
export function BarraCapacidad({ celebradas, futuras, posibles }) {
  const uid = idSeguro(useId())
  const p = (v) => (posibles > 0 ? (v * 100) / posibles : 0)
  return (
    <div className="adm-capacidad" aria-hidden="true">
      <svg width="100%" height="12" preserveAspectRatio="none">
        <defs>
          <pattern id={`${uid}r`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#fff" /><line x1="0" y1="0" x2="0" y2="4" stroke={COLOR.ingresos} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="100%" height="12" fill={COLOR.banda} />
        <rect x="0" y="0" width={`${p(celebradas)}%`} height="12" fill={COLOR.ingresos} />
        <rect x={`${p(celebradas)}%`} y="0" width={`${p(futuras)}%`} height="12" fill={`url(#${uid}r)`} />
      </svg>
    </div>
  )
}
