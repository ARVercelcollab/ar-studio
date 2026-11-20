// Movimientos, Mes a mes e Impuestos del panel (como las pantallas de Gartalia).
// No copia nada: junta lo que ya calculan servicio.js y calculos.js (cobros de reservas y cuotas,
// lo de Calendly, otros ingresos, fianzas, devoluciones y gastos) en una sola lista, apunte a apunte.
//
// Cada movimiento:
//   { id, fecha, tipo: 'cobro' | 'devolucion' | 'gasto', entra, concepto, quien, categoria: { clave, nombre, color, lado },
//     metodo, factura: { clase, codigo, id, texto }, totalCent (con IVA, siempre positivo), baseCent, ivaCent, ivaPct,
//     fijo, anulado, enlace, origen, … }
// Los importes van con IVA (como en Gartalia), salvo en Mes a mes, que va sin IVA para que cuadre con el Inicio.

import { query } from '../db/index.js'
import { fechaMadrid } from '../reservas/tiempo.js'
import * as C from './calculos.js'
import { datosDelPeriodo, movimientosYGastos, ajustesFinanzas } from './servicio.js'
import { FUENTES, GRUPOS } from './config.js'
import { deCobro, deGasto, totalesDe, ordenar, COLOR_FUENTE, COLOR_DEVOLUCION, COLOR_GRUPO } from './movimientos-calculos.js'

// Lo puro se puede importar desde aquí o, en las páginas, directamente de movimientos-calculos.js
export * from './movimientos-calculos.js'

const hoyMadrid = (ahora = new Date()) => fechaMadrid(ahora)

// ---------- Movimientos de un periodo ----------

export async function listarMovimientos(periodo, { ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const d = await datosDelPeriodo(periodo, { hoy, conRevisar: true })
  const lista = [
    ...d.movimientos.map(deCobro),
    ...d.gastos.map((g) => deGasto(g, hoy)),
  ].sort(ordenar)
  const categorias = new Map()
  for (const m of lista) if (!categorias.has(m.categoria.clave)) categorias.set(m.categoria.clave, m.categoria)
  const lado = (c) => (c.lado === 'entra' ? (c.clave === 'devolucion' ? 1 : 0) : 2)
  const metodos = new Map()
  for (const m of lista) if (!metodos.has(m.metodoClave)) metodos.set(m.metodoClave, m.metodo)
  return {
    hoy,
    recorte: d.recorte,
    ajustes: d.aj,
    faltaCalendly: d.faltan.filter((m) => C.primerDia(m) >= periodo.desde && C.primerDia(m) < periodo.hasta),
    calendlyEnCurso: periodo.meses.includes(C.mesDe(hoy)) && d.aj.calendlyHasta === 'sigue' && C.mesDe(hoy) >= d.aj.desde,
    movimientos: lista,
    totales: totalesDe(lista),
    categorias: [...categorias.values()].sort((a, b) => lado(a) - lado(b) || a.nombre.localeCompare(b.nombre, 'es')),
    metodos: [...metodos.entries()].map(([clave, texto]) => ({ clave, texto })).sort((a, b) => a.texto.localeCompare(b.texto, 'es')),
    revisar: d.revisar,
  }
}

// ---------- Mes a mes ----------

// Tabla del año: ingresos por tipo (sin IVA, menos las devoluciones), gastos por grupo y categoría
// (lo que cuesta: sin el IVA que se descuenta) y el beneficio de cada mes. Las cifras cuadran con
// las del Inicio y del gráfico (C.resumir por mes).
export async function mesAMes(anio, { ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const aj = await ajustesFinanzas(query, { hoy })
  const a = Number(anio)
  const meses = Array.from({ length: 12 }, (_, i) => `${a}-${String(i + 1).padStart(2, '0')}`)
  const mesHoy = C.mesDe(hoy)
  const estadoDe = (m) => (m < aj.desde ? 'sin_datos' : m > mesHoy ? 'futuro' : m === mesHoy ? 'en_curso' : 'cerrado')
  const datos = await movimientosYGastos(`${a}-01-01`, `${a + 1}-01-01`, { hoy })
  const movs = datos.movimientos
  const gastos = datos.gastos.filter((g) => (g.estado || 'apuntado') === 'apuntado')

  const vacio = () => Object.fromEntries(meses.map((m) => [m, 0]))
  // Ingresos por fuente
  const filasIngreso = []
  for (const [fuente, texto] of FUENTES) {
    const v = vacio()
    let hay = false
    for (const x of movs) {
      if (x.fuente !== fuente || x.sentido !== 'cobro') continue
      v[x.mes] += x.baseCent
      hay = true
    }
    if (hay) filasIngreso.push({ clave: `f:${fuente}`, nombre: texto, color: COLOR_FUENTE[fuente], valores: v })
  }
  const devo = vacio()
  let hayDevo = false
  for (const x of movs) {
    if (x.sentido !== 'devolucion') continue
    devo[x.mes] -= x.baseCent
    hayDevo = true
  }
  if (hayDevo) filasIngreso.push({ clave: 'devolucion', nombre: 'Devoluciones', color: COLOR_DEVOLUCION, valores: devo, negativo: true })

  // Gastos por grupo y categoría
  const gruposGasto = GRUPOS.map(([g, texto]) => {
    const cats = new Map()
    for (const x of gastos) {
      if (x.grupo !== g) continue
      const c = cats.get(x.categoriaId) || { clave: `c:${x.categoriaId}`, nombre: x.categoria, valores: vacio() }
      c.valores[C.mesDe(x.fecha)] += C.costeGasto(x)
      cats.set(x.categoriaId, c)
    }
    const valores = vacio()
    for (const c of cats.values()) for (const m of meses) valores[m] += c.valores[m]
    return { grupo: g, nombre: texto, color: COLOR_GRUPO[g], valores, categorias: [...cats.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')) }
  }).filter((g) => g.categorias.length)

  // Totales por mes con el mismo cálculo que el Inicio
  const totales = meses.map((m) => {
    const r = C.resumir({ movimientos: movs.filter((x) => x.mes === m), gastos: gastos.filter((x) => C.mesDe(x.fecha) === m) })
    return { mes: m, estado: estadoDe(m), ingresosCent: r.facturacion.baseCent, gastosCent: r.gastos.costeCent, beneficioCent: r.beneficioCent, conApuntes: movs.some((x) => x.mes === m) || gastos.some((x) => C.mesDe(x.fecha) === m) }
  })
  const suma = (k) => totales.reduce((s, t) => s + (t.estado === 'sin_datos' || t.estado === 'futuro' ? 0 : t[k]), 0)
  const anioHoy = Number(hoy.slice(0, 4))
  return {
    anio: a,
    hoy,
    desde: aj.desde,
    meses: totales,
    ingresos: filasIngreso,
    gastos: gruposGasto,
    total: { ingresosCent: suma('ingresosCent'), gastosCent: suma('gastosCent'), beneficioCent: suma('beneficioCent') },
    anterior: a - 1 >= Number(aj.desde.slice(0, 4)) ? a - 1 : null,
    siguiente: a + 1 <= anioHoy ? a + 1 : null,
  }
}

// ---------- Impuestos (IVA del trimestre) ----------

export async function impuestosDelTrimestre(periodo, { ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const d = await datosDelPeriodo(periodo, { hoy, conRevisar: false })
  const t = C.trimestreDe(periodo.desde)
  const iva = C.ivaDelTrimestre({
    movimientos: d.todos.movimientos, gastos: d.todos.gastos, trimestre: t, sinCobrar: d.sinCobrar, mesesSinCalendly: d.faltan, desde: d.aj.desde, hoy,
  })
  const cobros = d.movimientos.map(deCobro).sort(ordenar)
  const gastos = d.gastos.filter((g) => (g.estado || 'apuntado') === 'apuntado').map((g) => deGasto(g, hoy)).sort(ordenar)
  const conIva = cobros.filter((m) => m.ivaCent !== 0)

  // Ingresos (sin IVA) por tipo de factura
  const TIPOS = [
    ['completa', 'Factura completa (AR-W)', '#4b3828'],
    ['simplificada', 'Ticket (AR-S)', '#B8895F'],
    ['manual', 'Factura hecha a mano (AR-M)', '#8A6A4F'],
    ['stripe', 'Factura de Stripe (Calendly y cuotas de Stripe)', '#5B7FB8'],
    ['sin', 'Reservas o cuotas sin factura todavía', '#B42318'],
    ['sin_mano', 'Apuntado a mano sin factura', '#A39A91'],
    ['no_lleva', 'No lleva factura (fianzas)', '#D9CCBD'],
  ]
  const claseDe = (m) => (m.factura.clase === 'sin' && !m.factura.falta ? 'sin_mano' : m.factura.clase)
  const porTipo = TIPOS.map(([clase, nombre, color]) => {
    const ms = cobros.filter((m) => m.tipo === 'cobro' && claseDe(m) === clase)
    return { clase, nombre, color, n: ms.length, baseCent: ms.reduce((s, m) => s + m.baseCent, 0) }
  }).filter((x) => x.n)
  const devoluciones = cobros.filter((m) => m.tipo === 'devolucion')
  if (devoluciones.length) {
    porTipo.push({
      clase: 'devolucion', nombre: devoluciones.some((m) => m.factura.clase === 'rectificativa') ? 'Devoluciones (alguna con rectificativa por hacer)' : 'Devoluciones',
      color: COLOR_DEVOLUCION, n: devoluciones.length, baseCent: -devoluciones.reduce((s, m) => s + m.baseCent, 0),
    })
  }
  const sinFactura = gastos.filter((g) => g.factura.clase === 'ticket')
  return {
    hoy,
    trimestre: t,
    texto: C.textoTrimestre(t, { conRango: false }),
    rango: C.textoTrimestre(t),
    recorte: d.recorte,
    ajustes: d.aj,
    anterior: periodo.anterior,
    siguiente: periodo.siguiente,
    iva: {
      cobradoCent: iva.cobrado.ivaCent - iva.devuelto.ivaCent,
      pagadoCent: iva.gastos.ivaCent,
      netoCent: iva.netoCent,
      plazo: iva.plazo,
      enCurso: iva.enCurso,
      retencionAlquilerCent: iva.retencionAlquilerCent,
      retencionProfesionalCent: iva.retencionProfesionalCent,
      extranjeroBaseCent: iva.extranjeroBaseCent,
      sinIvaCent: iva.sinIvaCent,
      avisos: iva.avisos,
    },
    nCobrosConIva: conIva.length,
    nGastosConFactura: gastos.filter((g) => g.factura.clase === 'con').length,
    ingresosBaseCent: porTipo.reduce((s, x) => s + x.baseCent, 0),
    porTipo,
    sinFactura,
    cobros,
    gastos: gastos.filter((g) => g.factura.clase !== 'ticket'),
  }
}

