// Movimientos, Mes a mes e Impuestos (lib/finanzas/movimientos.js) con una base Postgres en memoria
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-F'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-T'

import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as F from '../lib/facturas/servicio.js'
import * as FIN from '../lib/finanzas/servicio.js'
import * as C from '../lib/finanzas/calculos.js'
import * as M from '../lib/finanzas/movimientos.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

const HOY = fechaMadrid(new Date())
// Todo en el mes de hoy: si hoy es día 1, «ayer» sería del mes anterior
const DIA = Number(HOY.slice(8, 10)) > 1 ? sumarDias(HOY, -1) : HOY
let n = 0
const email = () => `mov${++n}@example.com`
const cat = async (clave) => (await query('SELECT id FROM gasto_categorias WHERE clave = $1', [clave])).rows[0].id
const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}

const ids = {}
before(async () => {
  await FIN.guardarAjustesFinanzas({ desde: C.sumarMesesMes(C.mesDe(HOY), -2), calendlyHasta: 'nunca' })
  // Reserva cobrada por Bizum, con su ticket (AR-T)
  const r1 = await S.crearReservaManual({ fecha: await laborable(10), desde: '10:00', hasta: '12:00', nombre: 'Laura', apellidos: 'Prueba', email: email(), telefono: '600000001', actividad: 'Fotos', fondos: 'no', equipo: [] })
  await S.marcarPagada(r1.id, { metodo: 'bizum', fecha: DIA })
  ids.r1 = r1.id
  ids.f1 = (await F.emitirFactura(r1.id)).factura
  // Reserva cobrada con los datos del cliente: factura completa (AR-F)
  const r2 = await S.crearReservaManual({ fecha: await laborable(11), desde: '10:00', hasta: '14:00', nombre: 'Marca', apellidos: 'SL', email: email(), telefono: '600000002', actividad: 'Vídeo', fondos: 'no', equipo: [] })
  await S.marcarPagada(r2.id, { metodo: 'tarjeta', fecha: DIA })
  ids.r2 = r2.id
  ids.f2 = (await F.emitirFactura(r2.id, { nombre: 'Marca Ejemplo SL', nif: 'B00000000', direccion: 'Calle 2, València' })).factura
  // Reserva cobrada sin factura todavía
  const r3 = await S.crearReservaManual({ fecha: await laborable(12), desde: '16:00', hasta: '18:00', nombre: 'Sin', apellidos: 'Factura', email: email(), telefono: '600000003', actividad: 'Fotos', fondos: 'no', equipo: [] })
  await S.marcarPagada(r3.id, { metodo: 'efectivo', fecha: DIA })
  ids.r3 = r3.id
  // Cuota cobrada por Stripe (sin factura nuestra)
  const { suscripcion } = await SUS.crearSuscripcion({ plan: 'creator', nombre: 'Miembro', apellidos: 'Prueba', email: email(), fechaInicio: DIA, fianza: { estado: 'sin_fianza' }, primeraPagada: { metodo: 'stripe', fecha: DIA } })
  ids.sus = suscripcion.id
  // Gastos: uno con factura y uno con ticket sin NIF
  ids.g1 = (await FIN.crearGasto({ categoriaId: await cat('luz'), importe: '121', fecha: DIA, tipoFactura: 'nif', ivaPct: 21, concepto: 'Luz de prueba', proveedor: 'Eléctrica' })).id
  ids.g2 = (await FIN.crearGasto({ categoriaId: await cat('limpieza'), importe: '24,20', fecha: DIA, tipoFactura: 'ticket', ivaPct: 21, concepto: 'Productos de limpieza', metodoPago: 'tarjeta' })).id
  // Otro ingreso (fondos del día) y una devolución apuntada a mano
  await FIN.crearIngresoManual({ tipo: 'extras', sentido: 'cobro', fecha: DIA, concepto: 'Fondo blanco', importe: '24,20', ivaPct: 21 })
  await FIN.crearIngresoManual({ tipo: 'otro', sentido: 'devolucion', fecha: DIA, concepto: 'Devolución de prueba', importe: '12,10', ivaPct: 21 })
})

const mes = () => C.leerPeriodo(C.mesDe(HOY), HOY)

test('movimientos: cobros, cuotas, gastos y devoluciones en una lista, con su factura', async () => {
  const d = await M.listarMovimientos(mes())
  const porId = Object.fromEntries(d.movimientos.map((m) => [m.id, m]))
  const r1 = porId[`r${ids.r1}c`]
  assert.equal(r1.tipo, 'cobro')
  assert.equal(r1.entra, true)
  assert.equal(r1.factura.clase, 'simplificada')
  assert.equal(r1.factura.codigo, ids.f1.codigo)
  assert.match(ids.f1.codigo, /^AR-T-/)
  assert.equal(r1.metodo, 'Bizum')
  assert.equal(r1.categoria.clave, 'f:horas')
  assert.equal(r1.origen.tipo, 'reserva')
  assert.equal(porId[`r${ids.r2}c`].factura.clase, 'completa')
  assert.equal(porId[`r${ids.r3}c`].factura.clase, 'sin')
  const cuota = d.movimientos.find((m) => m.fuente === 'cuota')
  assert.equal(cuota.factura.clase, 'stripe')
  assert.match(cuota.concepto, /^Cuota Creator · mes 1$/)
  assert.equal(cuota.origen.suscripcionId, ids.sus)
  const luz = porId[`g${ids.g1}`]
  assert.equal(luz.tipo, 'gasto')
  assert.equal(luz.entra, false)
  assert.equal(luz.factura.clase, 'con')
  assert.equal(luz.totalCent, 12100)
  assert.equal(porId[`g${ids.g2}`].factura.clase, 'ticket')
  const devo = d.movimientos.find((m) => m.tipo === 'devolucion')
  assert.equal(devo.categoria.clave, 'devolucion')
  assert.match(devo.concepto, /^Devolución · /)
  // Totales con IVA: entra − sale
  const entra = d.movimientos.filter((m) => m.entra).reduce((s, m) => s + m.totalCent, 0)
  const sale = d.movimientos.filter((m) => !m.entra && !m.anulado).reduce((s, m) => s + m.totalCent, 0)
  assert.deepEqual([d.totales.entraCent, d.totales.saleCent, d.totales.diferenciaCent], [entra, sale, entra - sale])
  // Ordenados del más reciente al más antiguo
  const fechas = d.movimientos.map((m) => m.fecha)
  assert.deepEqual(fechas, [...fechas].sort().reverse())
  assert.ok(d.categorias.some((c) => c.clave === 'f:horas') && d.categorias.some((c) => c.clave === `c:${luz.categoria.clave.slice(2)}`))
})

test('movimientos: filtros de tipo, factura, forma de pago y búsqueda', async () => {
  const { movimientos: l } = await M.listarMovimientos(mes())
  assert.ok(M.filtrar(l, { tipo: 'entra' }).every((m) => m.entra))
  assert.ok(M.filtrar(l, { tipo: 'sale' }).every((m) => !m.entra))
  assert.deepEqual(M.filtrar(l, { factura: 'simplificada' }).map((m) => m.id), [`r${ids.r1}c`])
  assert.ok(M.filtrar(l, { factura: 'sin' }).some((m) => m.id === `r${ids.r3}c`))
  assert.ok(!M.filtrar(l, { factura: 'sin' }).some((m) => m.id === `g${ids.g1}`))
  assert.ok(M.filtrar(l, { factura: 'con' }).some((m) => m.id === `g${ids.g1}`))
  assert.deepEqual(M.filtrar(l, { metodo: 'bizum' }).map((m) => m.id), [`r${ids.r1}c`])
  assert.deepEqual(M.filtrar(l, { q: 'luz de prueba' }).map((m) => m.id), [`g${ids.g1}`])
  assert.deepEqual(M.filtrar(l, { q: ids.f2.codigo.toLowerCase() }).map((m) => m.id), [`r${ids.r2}c`])
  assert.ok(M.filtrar(l, { q: '121' }).some((m) => m.id === `g${ids.g1}`))
  assert.ok(M.filtrar(l, { q: '24,20 €' }).some((m) => m.id === `g${ids.g2}`))
  assert.deepEqual(M.filtrar(l, { cat: 'devolucion' }).map((m) => m.tipo), ['devolucion'])
})

test('mes a mes: las filas suman lo mismo que el Inicio (sin IVA)', async () => {
  const anio = Number(HOY.slice(0, 4))
  const t = await M.mesAMes(anio)
  assert.equal(t.meses.length, 12)
  const m = t.meses.find((x) => x.mes === C.mesDe(HOY))
  assert.equal(m.estado, 'en_curso')
  const r = await FIN.resumenFinanzas(mes())
  assert.equal(m.ingresosCent, r.cifras.facturacion.baseCent)
  assert.equal(m.gastosCent, r.cifras.gastos.costeCent)
  assert.equal(m.beneficioCent, r.cifras.beneficioCent)
  const sumaIngresos = t.ingresos.reduce((s, f) => s + f.valores[m.mes], 0)
  const sumaGastos = t.gastos.reduce((s, g) => s + g.valores[m.mes], 0)
  assert.equal(sumaIngresos, m.ingresosCent)
  assert.equal(sumaGastos, m.gastosCent)
  assert.ok(t.ingresos.find((f) => f.clave === 'devolucion').valores[m.mes] < 0)
  // El ticket sin NIF cuenta entero (con su IVA); la luz con factura, sin IVA
  const limpieza = t.gastos.flatMap((g) => g.categorias).find((c) => c.nombre.toLowerCase().includes('limpieza'))
  assert.equal(limpieza.valores[m.mes], 2420)
  // Los meses de antes de «desde» y los que no han llegado no tienen cifras
  assert.ok(t.meses.filter((x) => x.mes > C.mesDe(HOY)).every((x) => x.estado === 'futuro'))
  assert.equal(t.total.beneficioCent, t.meses.filter((x) => ['cerrado', 'en_curso'].includes(x.estado)).reduce((s, x) => s + x.beneficioCent, 0))
})

test('impuestos: IVA cobrado − IVA pagado = para apartar, y el ticket va aparte', async () => {
  const p = C.leerPeriodo(C.trimestreDe(HOY), HOY)
  const i = await M.impuestosDelTrimestre(p)
  const r = await FIN.resumenFinanzas(p)
  assert.equal(i.iva.netoCent, r.hacienda[0].netoCent)
  assert.equal(i.iva.cobradoCent - i.iva.pagadoCent, i.iva.netoCent)
  assert.ok(i.sinFactura.some((g) => g.id === `g${ids.g2}`))
  assert.ok(!i.gastos.some((g) => g.id === `g${ids.g2}`))
  assert.ok(i.gastos.some((g) => g.id === `g${ids.g1}`))
  const clases = i.porTipo.map((x) => x.clase)
  assert.ok(['completa', 'simplificada', 'stripe', 'sin', 'devolucion'].every((c) => clases.includes(c)))
  assert.equal(i.ingresosBaseCent, r.cifras.facturacion.baseCent)
  assert.equal(i.trimestre, C.trimestreDe(HOY))
})
