// Finanzas: cálculos puros (sin base de datos). Los usan el servidor y las páginas del panel.
//
// Criterio de caja: un cobro cuenta el día que entra el dinero y una devolución el día que
// sale; un gasto, el día de su factura o cargo (los fijos, en su mes). Importes en céntimos.

import { desglose } from '../facturas/iva.js'
import { fechaMadrid, sumarDias, diasEntre } from '../reservas/tiempo.js'
import {
  ANIO_MINIMO, MAX_CENT, MESES_CORTOS, MESES_LARGOS, FUENTES, GRUPOS, FIANZA_RETENIDA_IVA_PCT,
} from './config.js'

const dos = (n) => String(n).padStart(2, '0')

// ---------- Meses y periodos ----------

export const mesDe = (fecha) => String(fecha).slice(0, 7)
export const primerDia = (mes) => `${mes}-01`

export function sumarMesesMes(mes, n) {
  const [y, m] = mes.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${dos((t % 12) + 1)}`
}

export function ultimoDiaMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${dos(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

// 'noviembre 2026' · corto: 'nov' (en enero, 'ene 27') · soloNombre: 'noviembre'
export function textoMes(mes, { corto = false, soloNombre = false } = {}) {
  const [y, m] = mes.split('-').map(Number)
  if (corto) return m === 1 ? `${MESES_CORTOS[0]} ${String(y).slice(2)}` : MESES_CORTOS[m - 1]
  if (soloNombre) return MESES_LARGOS[m - 1]
  return `${MESES_LARGOS[m - 1]} ${y}`
}

// 'octubre', 'octubre y noviembre', 'septiembre, octubre y noviembre' (con el año si no es el de hoy)
export function listaMeses(meses, hoy) {
  const anioHoy = String(hoy).slice(0, 4)
  const nombres = meses.map((m) => (m.slice(0, 4) === anioHoy ? textoMes(m, { soloNombre: true }) : textoMes(m)))
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

export function trimestreDe(fecha) {
  const [y, m] = String(fecha).split('-').map(Number)
  return `${y}-T${Math.floor((m - 1) / 3) + 1}`
}

export function rangoTrimestre(t) {
  const [y, n] = t.split('-T').map(Number)
  const desde = `${y}-${dos(3 * (n - 1) + 1)}-01`
  return { desde, hasta: primerDia(sumarMesesMes(mesDe(desde), 3)) }
}

const TEXTO_TRIMESTRE = ['1.º', '2.º', '3.º', '4.º']
const RANGO_TRIMESTRE = ['ene – mar', 'abr – jun', 'jul – sep', 'oct – dic']

export function textoTrimestre(t, { conRango = true } = {}) {
  const [y, n] = t.split('-T').map(Number)
  return `${TEXTO_TRIMESTRE[n - 1]} trimestre ${y}${conRango ? ` (${RANGO_TRIMESTRE[n - 1]})` : ''}`
}

// Plazo del modelo 303 de cada trimestre
export function plazoTrimestre(t) {
  const [y, n] = t.split('-T').map(Number)
  if (n === 4) return `del 1 al 30 de enero de ${y + 1}`
  return `del 1 al 20 de ${['abril', 'julio', 'octubre'][n - 1]} de ${y}`
}

function mesesEntre(desde, hasta) {
  const r = []
  for (let m = mesDe(desde); primerDia(m) < hasta; m = sumarMesesMes(m, 1)) r.push(m)
  return r
}

// p: 'AAAA-MM', 'AAAA-Tn' o 'AAAA'. null si no vale, es anterior a 2020 o empieza después de hoy.
export function leerPeriodo(p, hoy) {
  const v = String(p ?? '').trim()
  let tipo
  let desde
  let hasta
  let m
  if ((m = /^(\d{4})-(\d{2})$/.exec(v))) {
    const mes = Number(m[2])
    if (mes < 1 || mes > 12) return null
    tipo = 'mes'
    desde = `${m[1]}-${m[2]}-01`
    hasta = primerDia(sumarMesesMes(v, 1))
  } else if ((m = /^(\d{4})-T([1-4])$/.exec(v))) {
    tipo = 'trimestre'
    ;({ desde, hasta } = rangoTrimestre(v))
  } else if ((m = /^(\d{4})$/.exec(v))) {
    tipo = 'anio'
    desde = `${v}-01-01`
    hasta = `${Number(v) + 1}-01-01`
  } else {
    return null
  }
  if (Number(desde.slice(0, 4)) < ANIO_MINIMO || desde > hoy) return null
  const clave = tipo === 'mes' ? mesDe(desde) : tipo === 'trimestre' ? trimestreDe(desde) : desde.slice(0, 4)
  const meses = mesesEntre(desde, hasta)
  const paso = (n) => {
    if (tipo === 'mes') return sumarMesesMes(clave, n)
    if (tipo === 'anio') return String(Number(clave) + n)
    return trimestreDe(primerDia(sumarMesesMes(mesDe(desde), 3 * n)))
  }
  const anterior = paso(-1)
  const siguiente = paso(1)
  const texto = tipo === 'mes' ? textoMes(clave) : tipo === 'trimestre' ? textoTrimestre(clave) : clave
  const contieneHoy = desde <= hoy && hoy < hasta
  return {
    tipo,
    clave,
    desde,
    hasta,
    meses,
    texto,
    textoSelector: `${texto}${contieneHoy ? ' · hasta hoy' : ''}`,
    contieneHoy,
    anterior: Number(String(anterior).slice(0, 4)) >= ANIO_MINIMO ? anterior : null,
    siguiente: leerPeriodo(siguiente, hoy) ? siguiente : null,
    trimestres: [...new Set(meses.map((x) => trimestreDe(x)))],
  }
}

export function periodoActual(tipo, hoy) {
  if (tipo === 'trimestre') return leerPeriodo(trimestreDe(hoy), hoy)
  if (tipo === 'anio') return leerPeriodo(hoy.slice(0, 4), hoy)
  return leerPeriodo(mesDe(hoy), hoy)
}

// Clave del periodo al cambiar de mes / trimestre / año (§1.2)
export function cambiarTipoPeriodo(periodo, tipo, hoy) {
  if (periodo.tipo === tipo) return periodo.clave
  const mesHoy = mesDe(hoy)
  const anio = periodo.desde.slice(0, 4)
  const esteAnio = anio === hoy.slice(0, 4)
  if (tipo === 'anio') return anio
  if (tipo === 'trimestre') {
    if (periodo.tipo === 'mes') return trimestreDe(periodo.desde)
    return esteAnio ? trimestreDe(hoy) : `${anio}-T4`
  }
  // a mes
  if (periodo.tipo === 'trimestre') {
    const ultimo = sumarMesesMes(mesDe(periodo.desde), 2)
    return ultimo > mesHoy ? mesHoy : ultimo
  }
  return esteAnio ? mesHoy : `${anio}-12`
}

// Los 12 meses del gráfico
export function ventanaGrafico(periodo, hoy) {
  if (periodo.tipo === 'anio') return Array.from({ length: 12 }, (_, i) => `${periodo.clave}-${dos(i + 1)}`)
  let fin = periodo.meses.at(-1)
  if (fin > mesDe(hoy)) fin = mesDe(hoy)
  return Array.from({ length: 12 }, (_, i) => sumarMesesMes(fin, i - 11))
}

// Recorte por «desde» ('AAAA-MM')
export function recortar(periodo, desde) {
  const d = primerDia(desde)
  return {
    desdeEfectivo: d > periodo.desde ? d : periodo.desde,
    recortado: d > periodo.desde && d < periodo.hasta,
    sinDatos: d >= periodo.hasta,
  }
}

// ---------- Importes ----------

// '84,2' -> 8420; '1.234,56' -> 123456; '1.210' -> 121000; '12 €' -> 1200; vacío -> null; mal -> NaN
export function leerImporte(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : NaN
  let t = String(v).replace(/[\s €]/g, '')
  if (t === '') return null
  const comas = (t.match(/,/g) || []).length
  if (comas > 1) return NaN
  if (comas === 1) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN
  const c = Math.round(Number(t) * 100)
  return c > MAX_CENT ? NaN : c
}

// 123456 -> '1.234,56 €'; 120000 -> '1.200 €'; -4000 con decimales -> '−40,00 €'
export function euros(cent, { decimales = false } = {}) {
  if (cent === null || cent === undefined || Number.isNaN(cent)) return '—'
  const neg = cent < 0
  const abs = Math.abs(Math.round(cent))
  const entero = Math.floor(abs / 100)
  const resto = abs % 100
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const txt = decimales || resto ? `${miles},${dos(resto)}` : miles
  return `${neg ? '−' : ''}${txt} €`
}

// Desglose de un gasto: base + IVA − retención = total (lo que se paga al proveedor).
// ivaPct: 21 | 10 | 4, o 'mano' (con ivaCent). Con 'sin_iva' o 'extranjero' no hay IVA.
export function desgloseGasto({ importeCent, importeEs = 'pagado', tipoFactura = 'nif', ivaPct = 21, ivaCent = null, retencionPct = 0 }) {
  const mal = (campo, texto) => ({ ok: false, campo, texto })
  const imp = Number(importeCent)
  if (!Number.isInteger(imp) || imp < 1 || imp > MAX_CENT) return mal('importe', 'Pon el importe (por ejemplo 84,20).')
  const conIva = tipoFactura === 'nif' || tipoFactura === 'ticket'
  const aMano = conIva && (ivaPct === 'mano' || ivaPct === null || ivaPct === undefined)
  const p = conIva && !aMano ? Number(ivaPct) : 0
  const r = Number(retencionPct) || 0
  let ivaMano = null
  if (aMano) {
    ivaMano = Number(ivaCent)
    if (ivaCent === null || ivaCent === undefined || ivaCent === '' || !Number.isInteger(ivaMano) || ivaMano < 0) return mal('iva', 'Escribe el IVA que pone la factura.')
  }
  let base
  let iva
  let ret
  let total
  if (importeEs === 'base') {
    base = imp
    iva = !conIva ? 0 : aMano ? ivaMano : Math.round((base * p) / 100)
    ret = Math.round((base * r) / 100)
    total = base + iva - ret
  } else if (!aMano && r === 0) {
    total = imp
    base = Math.round((total * 100) / (100 + p))
    iva = total - base
    ret = 0
  } else if (!aMano) {
    total = imp
    base = Math.round((total * 100) / (100 + p - r))
    iva = Math.round((base * p) / 100)
    ret = base + iva - total
  } else {
    total = imp
    iva = ivaMano
    base = Math.round(((total - iva) * 100) / (100 - r))
    ret = base + iva - total
  }
  if (!(base > 0) || ret < 0 || (r > 0 && ret === 0) || !(total > 0) || total > MAX_CENT) return mal('importe', 'Importe demasiado pequeño.')
  if (aMano && iva > Math.round((base * 21) / 100) + 1) return mal('iva', 'El IVA no puede ser más del 21 % de la base.')
  return { ok: true, baseCent: base, ivaCent: iva, retencionCent: ret, totalCent: total, ivaPct: conIva && !aMano ? p : null }
}

const apuntado = (g) => (g.estado || 'apuntado') === 'apuntado'
export const costeGasto = (g) => g.baseCent + (g.tipoFactura === 'ticket' ? g.ivaCent : 0)
export const conIvaGasto = (g) => g.baseCent + g.ivaCent
export const ivaDeducible = (g) => (g.tipoFactura === 'nif' ? g.ivaCent : 0)

export function deCada100(beneficioCent, baseCent) {
  return baseCent > 0 && beneficioCent >= 0 ? Math.round((beneficioCent * 100) / baseCent) : null
}

// ---------- Movimientos de ingreso ----------

const enRango = (f, { desde, hasta }) => f >= desde && f < hasta
const iniciales = (nombre, apellidos) => `${nombre || ''}${apellidos ? ` ${String(apellidos).trim().charAt(0)}.` : ''}`.trim()
const fechaDe = (x) => (x ? fechaMadrid(new Date(x)) : null)

function movimiento(datos) {
  const { totalCent, ivaPct } = datos
  const d = datos.ivaCent !== undefined && datos.ivaCent !== null
    ? { baseCent: totalCent - datos.ivaCent, ivaCent: datos.ivaCent }
    : desglose(totalCent, ivaPct)
  return {
    fechaServicio: null, cliente: '', nif: '', facturaId: null, factura: null, rectificar: false, metodo: null, enlace: null, ref: '', chip: null,
    ...datos,
    mes: mesDe(datos.fecha),
    baseCent: d.baseCent,
    ivaCent: d.ivaCent,
  }
}

// Reserva por horas o sesión de suscripción con horas aparte. Las de Calendly no cuentan nunca.
export function partidasDeReserva(r, rango) {
  if (r.origen === 'calendly' || !(r.precioCent > 0)) return []
  const fuente = r.origen === 'plan' ? 'horas_aparte' : 'horas'
  const comun = {
    fuente,
    ivaPct: 21,
    fechaServicio: fechaDe(r.inicio),
    texto: `${fuente === 'horas' ? 'Reserva' : 'Horas aparte'} ${r.codigo} · ${iniciales(r.nombre, r.apellidos)}`,
    ref: r.codigo,
    cliente: r.factura?.nombre || `${r.nombre || ''} ${r.apellidos || ''}`.trim(),
    nif: r.factura?.nif || '',
    facturaId: r.facturaId || null,
    factura: r.facturaCodigo || null,
    metodo: r.metodoPago || null,
    enlace: `/admin/reserva/${r.id}`,
    chip: r.origen === 'plan' ? 'Suscripción' : r.origen === 'web' ? 'Web' : 'A mano',
  }
  const r2 = []
  const cobrada = ['pagado', 'reembolsado', 'reembolsado_parcial'].includes(r.pagoEstado)
  const fc = fechaDe(r.pagadoEn)
  if (cobrada && fc && enRango(fc, rango)) {
    r2.push(movimiento({ ...comun, clave: `r${r.id}c`, fecha: fc, sentido: 'cobro', totalCent: r.precioCent }))
  }
  const fd = fechaDe(r.canceladaEn)
  if (['reembolsado', 'reembolsado_parcial'].includes(r.pagoEstado) && r.reembolsoCent > 0 && fd && enRango(fd, rango)) {
    r2.push(movimiento({ ...comun, clave: `r${r.id}d`, fecha: fd, sentido: 'devolucion', totalCent: r.reembolsoCent, rectificar: Boolean(r.facturaCodigo) }))
  }
  return r2
}

export function partidasDeCuota(c, rango) {
  if (!(c.importeCent > 0) || !['pagada', 'devuelta'].includes(c.estado)) return []
  const comun = {
    fuente: 'cuota',
    ivaPct: 21,
    fechaServicio: c.desde,
    texto: `Cuota ${c.susCodigo} · periodo ${c.periodo}`,
    ref: `${c.susCodigo} periodo ${c.periodo}`,
    cliente: c.factura?.nombre || `${c.nombre || ''} ${c.apellidos || ''}`.trim(),
    nif: c.factura?.nif || '',
    facturaId: c.facturaId || null,
    factura: c.facturaCodigo || null,
    metodo: c.metodoPago || null,
    enlace: `/admin/suscripciones/${c.suscripcionId}`,
    chip: 'Suscripción',
    servicioHasta: c.hasta ? sumarDias(c.hasta, -1) : null,
  }
  const r = []
  if (c.pagadaEn && enRango(c.pagadaEn, rango)) r.push(movimiento({ ...comun, clave: `c${c.id}c`, fecha: c.pagadaEn, sentido: 'cobro', totalCent: c.importeCent }))
  if (c.estado === 'devuelta' && c.devueltaEn && enRango(c.devueltaEn, rango)) {
    r.push(movimiento({ ...comun, clave: `c${c.id}d`, fecha: c.devueltaEn, sentido: 'devolucion', totalCent: c.importeCent, rectificar: Boolean(c.facturaCodigo) }))
  }
  return r
}

// Fianza: solo la parte que el estudio se queda, el día en que se resuelve
export function partidaDeFianza(s, rango) {
  let cent = 0
  if (s.fianzaEstado === 'retenida') cent = s.fianzaCent
  else if (s.fianzaEstado === 'devuelta') cent = s.fianzaCent - (s.fianzaDevueltaCent ?? s.fianzaCent)
  if (!(cent > 0) || !s.resueltaEn || !enRango(s.resueltaEn, rango)) return []
  return [movimiento({
    clave: `f${s.id}`, fecha: s.resueltaEn, fuente: 'fianza', sentido: 'cobro', totalCent: cent, ivaPct: FIANZA_RETENIDA_IVA_PCT,
    texto: `Fianza que os quedáis · ${s.codigo}`, ref: s.codigo, cliente: `${s.nombre || ''} ${s.apellidos || ''}`.trim(),
    enlace: `/admin/suscripciones/${s.id}`, chip: 'Fianza',
  })]
}

export function partidasDeCalendly(fila, rango) {
  const fecha = fila.mes
  if (!enRango(fecha, rango)) return []
  const comun = {
    fuente: 'calendly', fecha, ivaPct: 21, texto: `Calendly · ${textoMes(mesDe(fecha))}`,
    ref: `Calendly ${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`, metodo: 'stripe',
    enlace: `/admin/finanzas/calendly?mes=${mesDe(fecha)}`, chip: 'Calendly',
  }
  const r = []
  if (fila.cobradoCent > 0) r.push(movimiento({ ...comun, clave: `k${mesDe(fecha)}c`, sentido: 'cobro', totalCent: fila.cobradoCent }))
  if (fila.devueltoCent > 0) r.push(movimiento({ ...comun, clave: `k${mesDe(fecha)}d`, sentido: 'devolucion', totalCent: fila.devueltoCent }))
  return r
}

export function partidaDeIngreso(i, rango) {
  if (!enRango(i.fecha, rango)) return []
  const texto = i.tipo === 'factura_manual'
    ? `Factura ${i.facturaRef}${i.clienteNombre ? ` · ${i.clienteNombre}` : ''}`
    : `${i.concepto}${i.tipo === 'extras' && i.reservaCodigo ? ` · reserva ${i.reservaCodigo}` : ''}`
  return [movimiento({
    clave: `i${i.id}`, fecha: i.fecha, fuente: i.tipo, sentido: i.sentido, totalCent: i.totalCent, ivaCent: i.ivaCent, ivaPct: i.ivaPct,
    texto, ref: i.facturaRef || '', cliente: i.clienteNombre || '', nif: i.clienteNif || '',
    factura: i.tipo === 'factura_manual' ? i.facturaRef : null, metodo: i.metodoPago || null,
    enlace: `/admin/finanzas/ingresos/${i.id}`,
    chip: i.tipo === 'extras' ? 'Del día' : i.tipo === 'factura_manual' ? 'AR-M' : 'Otro',
    concepto: i.concepto,
  })]
}

// ---------- Resumen ----------

export function resumir({ movimientos = [], gastos = [] }) {
  const s = (m) => (m.sentido === 'cobro' ? 1 : -1)
  const fact = { baseCent: 0, totalCent: 0, ivaCent: 0 }
  const iva = { repercutidoCent: 0, cobrado: { baseCent: 0, ivaCent: 0 }, devuelto: { baseCent: 0, ivaCent: 0 }, soportadoCent: 0, gastos: { baseCent: 0, ivaCent: 0 }, netoCent: 0 }
  let sinIvaCent = 0
  const porFuenteM = new Map()
  const devoluciones = { n: 0, baseCent: 0, ivaCent: 0, totalCent: 0 }
  for (const m of movimientos) {
    const k = s(m)
    fact.baseCent += k * m.baseCent
    fact.totalCent += k * m.totalCent
    fact.ivaCent += k * m.ivaCent
    iva.repercutidoCent += k * m.ivaCent
    if (m.ivaCent === 0) sinIvaCent += k * m.baseCent
    if (m.sentido === 'cobro') {
      if (m.ivaCent > 0) {
        iva.cobrado.baseCent += m.baseCent
        iva.cobrado.ivaCent += m.ivaCent
      }
      const f = porFuenteM.get(m.fuente) || { n: 0, baseCent: 0, ivaCent: 0, totalCent: 0 }
      f.n++
      f.baseCent += m.baseCent
      f.ivaCent += m.ivaCent
      f.totalCent += m.totalCent
      porFuenteM.set(m.fuente, f)
    } else {
      if (m.ivaCent > 0) {
        iva.devuelto.baseCent += m.baseCent
        iva.devuelto.ivaCent += m.ivaCent
      }
      devoluciones.n++
      devoluciones.baseCent += m.baseCent
      devoluciones.ivaCent += m.ivaCent
      devoluciones.totalCent += m.totalCent
    }
  }
  const gs = { costeCent: 0, conIvaCent: 0, n: 0 }
  let retencionAlquilerCent = 0
  let retencionProfesionalCent = 0
  let extranjeroBaseCent = 0
  const grupos = new Map(GRUPOS.map(([g, t]) => [g, { grupo: g, texto: t, costeCent: 0, conIvaCent: 0, n: 0, cats: new Map() }]))
  for (const g of gastos) {
    if (!apuntado(g)) continue
    const coste = costeGasto(g)
    gs.costeCent += coste
    gs.conIvaCent += conIvaGasto(g)
    gs.n++
    const ded = ivaDeducible(g)
    iva.soportadoCent += ded
    if (g.tipoFactura === 'nif') {
      iva.gastos.baseCent += g.baseCent
      iva.gastos.ivaCent += g.ivaCent
    }
    if (g.retencionPct === 19) retencionAlquilerCent += g.retencionCent
    if (g.retencionPct === 7 || g.retencionPct === 15) retencionProfesionalCent += g.retencionCent
    if (g.tipoFactura === 'extranjero') extranjeroBaseCent += g.baseCent
    const gr = grupos.get(g.grupo)
    if (gr) {
      gr.costeCent += coste
      gr.conIvaCent += conIvaGasto(g)
      gr.n++
      const c = gr.cats.get(g.categoriaId) || { id: g.categoriaId, nombre: g.categoria, n: 0, costeCent: 0, conIvaCent: 0 }
      c.n++
      c.costeCent += coste
      c.conIvaCent += conIvaGasto(g)
      gr.cats.set(g.categoriaId, c)
    }
  }
  iva.netoCent = iva.repercutidoCent - iva.soportadoCent
  const beneficioCent = fact.baseCent - gs.costeCent
  return {
    facturacion: fact,
    gastos: gs,
    iva,
    sinIvaCent,
    beneficioCent,
    diferenciaConIvaCent: fact.totalCent - gs.conIvaCent,
    deCada100: deCada100(beneficioCent, fact.baseCent),
    retencionAlquilerCent,
    retencionProfesionalCent,
    extranjeroBaseCent,
    porFuente: FUENTES.filter(([f]) => porFuenteM.has(f)).map(([f, texto]) => ({ fuente: f, texto, ...porFuenteM.get(f) })),
    devoluciones,
    porGrupo: [...grupos.values()].map(({ cats, ...g }) => ({ ...g, categorias: [...cats.values()].sort((a, b) => b.costeCent - a.costeCent) })),
  }
}

// Los 12 meses del gráfico y de la tabla «mes a mes»
export function porMeses({ movimientos = [], gastos = [], meses, hoy, desde, mesesSinCalendly = [] }) {
  const mesHoy = mesDe(hoy)
  return meses.map((mes) => {
    const estado = mes < desde ? 'sin_datos' : mes > mesHoy ? 'futuro' : mes === mesHoy ? 'en_curso' : 'cerrado'
    const base = { mes, texto: textoMes(mes), corto: textoMes(mes, { corto: true }), estado, faltaCalendly: mesesSinCalendly.includes(mes) }
    if (estado === 'sin_datos' || estado === 'futuro') {
      return { ...base, facturacionCent: null, gastosCent: null, beneficioCent: null, ivaNetoCent: null, facturacionConIvaCent: null, gastosConIvaCent: null }
    }
    const r = resumir({ movimientos: movimientos.filter((m) => m.mes === mes), gastos: gastos.filter((g) => mesDe(g.fecha) === mes) })
    return {
      ...base,
      facturacionCent: r.facturacion.baseCent,
      facturacionConIvaCent: r.facturacion.totalCent,
      gastosCent: r.gastos.costeCent,
      gastosConIvaCent: r.gastos.conIvaCent,
      beneficioCent: r.beneficioCent,
      ivaNetoCent: r.iva.netoCent,
    }
  })
}

// IVA orientativo de un trimestre (modelo 303) y sus avisos
export function ivaDelTrimestre({ movimientos = [], gastos = [], trimestre, sinCobrar = { reservas: [], cuotas: [] }, mesesSinCalendly = [], desde, hoy }) {
  const rango = rangoTrimestre(trimestre)
  const d = primerDia(desde) > rango.desde ? primerDia(desde) : rango.desde
  const dentro = (f) => f >= d && f < rango.hasta
  const movs = movimientos.filter((m) => dentro(m.fecha))
  const gs = gastos.filter((g) => dentro(g.fecha))
  const r = resumir({ movimientos: movs, gastos: gs })
  const antes = movs.filter((m) => m.sentido === 'cobro' && ['horas', 'horas_aparte', 'cuota'].includes(m.fuente) && m.fechaServicio && m.fechaServicio < rango.desde)
  const sinCobrarEnT = [
    ...(sinCobrar.reservas || []).filter((x) => x.fecha >= d && x.fecha < rango.hasta),
    ...(sinCobrar.cuotas || []).filter((x) => x.fecha >= d && x.fecha < rango.hasta && x.fecha <= hoy),
  ]
  return {
    trimestre,
    texto: textoTrimestre(trimestre),
    plazo: plazoTrimestre(trimestre),
    enCurso: hoy >= rango.desde && hoy < rango.hasta,
    futuro: rango.desde > hoy,
    cobrado: r.iva.cobrado,
    devuelto: r.iva.devuelto,
    gastos: r.iva.gastos,
    netoCent: r.iva.netoCent,
    retencionAlquilerCent: r.retencionAlquilerCent,
    retencionProfesionalCent: r.retencionProfesionalCent,
    extranjeroBaseCent: r.extranjeroBaseCent,
    sinIvaCent: r.sinIvaCent,
    avisos: {
      cobrosDeAntes: { n: antes.length, ivaCent: antes.reduce((a, m) => a + m.ivaCent, 0) },
      sinCobrarEnT: { n: sinCobrarEnT.length, totalCent: sinCobrarEnT.reduce((a, x) => a + x.totalCent, 0) },
      faltaCalendly: mesesSinCalendly.filter((m) => primerDia(m) >= rango.desde && primerDia(m) < rango.hasta),
      incompleto: primerDia(desde) > rango.desde && primerDia(desde) < rango.hasta,
    },
  }
}

// Tope «bonito» del eje: el primer 1, 2 o 5 × 10ⁿ ≥ máximo (100 € si todo es 0)
export function escalaBonita(maxCent) {
  if (!(maxCent > 0)) return { topeCent: 10000 }
  let p = 1
  while (p * 10 <= maxCent) p *= 10
  for (const k of [1, 2, 5, 10]) if (k * p >= maxCent) return { topeCent: k * p }
  return { topeCent: 10 * p }
}

// ---------- Gastos fijos ----------

export function importeDelMes(tramos, mes) {
  let mejor = null
  for (const t of tramos) if (t.desdeMes <= mes && (!mejor || t.desdeMes > mejor.desdeMes)) mejor = t
  return mejor ? mejor.importeCent : null
}

// Meses (día 1) que tocan de un fijo hasta 'AAAA-MM' (incluido)
export function mesesQueTocan(fijo, hastaMes) {
  const tope = fijo.hastaMes && fijo.hastaMes < primerDia(hastaMes) ? fijo.hastaMes : primerDia(hastaMes)
  const r = []
  const cada = Number(fijo.cadaMeses) || 1
  for (let m = mesDe(fijo.desdeMes); primerDia(m) <= tope; m = sumarMesesMes(m, cada)) r.push(primerDia(m))
  return r
}

export function fechaDelFijo(mes, dia) {
  const ultimo = ultimoDiaMes(mesDe(mes))
  return `${mesDe(mes)}-${dos(Math.min(Number(dia), Number(ultimo.slice(8, 10))))}`
}

// La fila de "gastos" de un fijo en un mes (día 1)
export function filaDelFijo(fijo, tramos, mes) {
  const importeCent = importeDelMes(tramos, mes)
  if (!importeCent) return null
  const d = desgloseGasto({ importeCent, importeEs: fijo.importeEs, tipoFactura: fijo.tipoFactura, ivaPct: fijo.ivaPct, retencionPct: fijo.retencionPct })
  if (!d.ok) return null
  return {
    fecha: fechaDelFijo(mes, fijo.dia),
    mes,
    categoriaId: fijo.categoriaId,
    concepto: fijo.concepto,
    proveedor: fijo.proveedor || '',
    tipoFactura: fijo.tipoFactura,
    ivaPct: d.ivaPct,
    retencionPct: fijo.retencionPct || 0,
    metodoPago: fijo.metodoPago || null,
    baseCent: d.baseCent,
    ivaCent: d.ivaCent,
    retencionCent: d.retencionCent,
    totalCent: d.totalCent,
  }
}

// Lo que pesa un fijo al mes (los de cada 2, 3, 6 o 12 meses, repartidos)
export function fijoAlMes(fijo, importeCent) {
  const d = desgloseGasto({ importeCent, importeEs: fijo.importeEs, tipoFactura: fijo.tipoFactura, ivaPct: fijo.ivaPct, retencionPct: fijo.retencionPct })
  if (!d.ok) return { conIvaCent: 0, costeCent: 0, totalCent: 0 }
  const cada = Number(fijo.cadaMeses) || 1
  const g = { ...d, tipoFactura: fijo.tipoFactura }
  return { conIvaCent: Math.round(conIvaGasto(g) / cada), costeCent: Math.round(costeGasto(g) / cada), totalCent: Math.round(d.totalCent / cada), desglose: d }
}

// ---------- Para revisar ----------

const fechaTxt = (f) => {
  const [, m, d] = f.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

export function avisosParaRevisar(datos) {
  const {
    hoy, desde, calendlyHasta = 'sigue', mesesSinCalendly = [], reservasAbiertas = false, conflictos = [], eventosPago = [], bajaExtra = [],
    categorias = [], mesesConGasto = {}, gastosRecientes = [], ingresosRecientes = [], vistos = [],
  } = datos
  const visto = new Set(vistos)
  const r = []
  const add = (a) => {
    if (!a.boton || !visto.has(a.clave)) r.push({ urgente: false, boton: null, ...a })
  }
  if (mesesSinCalendly.length) {
    const urgente = mesesSinCalendly.some((m) => rangoTrimestre(trimestreDe(m)).hasta <= hoy)
    add({ clave: 'calendly', tipo: 'calendly', urgente, texto: `Falta apuntar lo cobrado por Calendly (Stripe) de ${listaMeses(mesesSinCalendly, hoy)}.`, enlace: `/admin/finanzas/calendly?mes=${mesesSinCalendly[0]}`, textoEnlace: 'Apuntar' })
  }
  if (reservasAbiertas && calendlyHasta === 'sigue') {
    add({ clave: 'calendly_ajuste', tipo: 'calendly_ajuste', texto: 'Ya se reserva en la web: decid hasta qué mes se cobró por Calendly.', enlace: '/admin/finanzas#ajustes', textoEnlace: 'Ajustes' })
  }
  for (const c of conflictos) {
    add({ clave: `conflicto:${c.id}`, tipo: 'conflicto', urgente: true, texto: `La reserva ${c.codigo} está pagada pero en revisión: resuélvela en su ficha.`, enlace: `/admin/reserva/${c.id}`, textoEnlace: 'Ver ficha' })
  }
  for (const e of eventosPago) {
    if (e.aviso === 'duplicado') {
      add({ clave: `duplicado:${e.id}`, tipo: 'duplicado', urgente: true, texto: `En ${e.codigo} llegaron dos pagos. Aquí cuenta uno: devuelve el otro desde el portal del TPV.`, enlace: `/admin/reserva/${e.reservaId}`, textoEnlace: 'Ver ficha', boton: 'Ya está devuelto' })
    } else if (e.aviso === 'tras_cancelar') {
      add({ clave: `tras_cancelar:${e.id}`, tipo: 'tras_cancelar', texto: `${e.codigo} se pagó después de cancelarla y cuenta como cobrada. Si se lo devolvéis, apuntadlo como devolución.`, enlace: `/admin/finanzas/ingresos/nuevo?reserva=${e.reservaId}&sentido=devolucion`, textoEnlace: 'Apuntar devolución', boton: 'No se devuelve' })
    }
  }
  for (const b of bajaExtra) {
    add({ clave: `baja_extra:${b.reservaId}`, tipo: 'baja_extra', texto: `${b.codigo}: horas aparte pagadas (${euros(b.precioCent, { decimales: true })}) de una sesión cancelada por la baja. Si se las devolvéis, apuntadlo como devolución.`, enlace: `/admin/finanzas/ingresos/nuevo?reserva=${b.reservaId}&sentido=devolucion`, textoEnlace: 'Apuntar devolución', boton: 'No se devuelve' })
  }
  // Facturas que suelen llegar y no se han apuntado
  const M = sumarMesesMes(mesDe(hoy), -1)
  for (const c of categorias) {
    const N = c.avisoCadaMeses
    if (!N || c.activa === false) continue
    let inicio = sumarMesesMes(M, -(N - 1))
    if (inicio < desde) inicio = desde
    if (inicio > M) continue
    const meses = mesesConGasto[c.id] || []
    const antes = meses.filter((m) => m < inicio)
    const enVentana = meses.some((m) => m >= inicio && m <= M)
    if (!antes.length || enVentana) continue
    const ultimo = antes.sort().at(-1)
    add({
      clave: `factura_falta:${c.id}:${M}`, tipo: 'factura_falta',
      texto: `No hay nada de ${c.nombre} apuntado ${inicio === M ? `en ${listaMeses([M], hoy)}` : `desde ${listaMeses([inicio], hoy)}`} (lo último es de ${listaMeses([ultimo], hoy)}). Si ya llegó la factura, apúntala.`,
      enlace: `/admin/finanzas/gastos/nuevo?categoria=${c.id}`, textoEnlace: 'Apuntar', boton: 'Este mes no hay',
    })
  }
  // ¿Repetidos?
  const sueltos = gastosRecientes.filter((g) => !g.fijoId && !g.calendlyMes && apuntado(g)).sort((a, b) => a.id - b.id)
  for (let i = 0; i < sueltos.length; i++) {
    for (let j = i + 1; j < sueltos.length; j++) {
      const a = sueltos[i]
      const b = sueltos[j]
      if (a.categoriaId === b.categoriaId && a.totalCent === b.totalCent && Math.abs(diasEntre(a.fecha, b.fecha)) <= 3) {
        const [x, y] = a.fecha <= b.fecha ? [a, b] : [b, a]
        add({ clave: `repetido:${a.id}-${b.id}`, tipo: 'repetido', texto: `¿Repetido? ${a.categoria}, ${euros(a.totalCent, { decimales: true })}, el ${fechaTxt(x.fecha)} y el ${fechaTxt(y.fecha)}.`, enlace: `/admin/finanzas/gastos/${b.id}`, textoEnlace: 'Ver', boton: 'No es repetido' })
      }
    }
  }
  const ing = [...ingresosRecientes].sort((a, b) => a.id - b.id)
  for (let i = 0; i < ing.length; i++) {
    for (let j = i + 1; j < ing.length; j++) {
      const a = ing[i]
      const b = ing[j]
      if (a.tipo === b.tipo && a.sentido === b.sentido && a.totalCent === b.totalCent && Math.abs(diasEntre(a.fecha, b.fecha)) <= 3) {
        const [x, y] = a.fecha <= b.fecha ? [a, b] : [b, a]
        add({ clave: `repetido:i${a.id}-i${b.id}`, tipo: 'repetido', texto: `¿Repetido? ${a.concepto}, ${euros(a.totalCent, { decimales: true })}, el ${fechaTxt(x.fecha)} y el ${fechaTxt(y.fecha)}.`, enlace: `/admin/finanzas/ingresos/${b.id}`, textoEnlace: 'Ver', boton: 'No es repetido' })
      }
    }
  }
  return r.sort((a, b) => Number(b.urgente) - Number(a.urgente))
}
