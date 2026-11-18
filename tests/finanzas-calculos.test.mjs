// Finanzas: cálculos puros (sin base de datos)
import test from 'node:test'
import assert from 'node:assert/strict'
import * as C from '../lib/finanzas/calculos.js'
import { textoCsv, numeroCsv, fechaCsv, aCsv } from '../lib/finanzas/csv.js'
import { desglose } from '../lib/facturas/iva.js'

const HOY = '2026-11-18'

test('periodos: mes, trimestre, año, anterior y siguiente', () => {
  const m = C.leerPeriodo('2026-11', HOY)
  assert.equal(m.desde, '2026-11-01')
  assert.equal(m.hasta, '2026-12-01')
  assert.equal(m.texto, 'noviembre 2026')
  assert.equal(m.textoSelector, 'noviembre 2026 · hasta hoy')
  assert.equal(m.siguiente, null)
  assert.equal(m.anterior, '2026-10')
  const t = C.leerPeriodo('2026-T4', HOY)
  assert.equal(t.desde, '2026-10-01')
  assert.equal(t.hasta, '2027-01-01')
  assert.equal(t.texto, '4.º trimestre 2026 (oct – dic)')
  assert.deepEqual(t.meses, ['2026-10', '2026-11', '2026-12'])
  const a = C.leerPeriodo('2026', HOY)
  assert.equal(a.desde, '2026-01-01')
  assert.equal(a.hasta, '2027-01-01')
  assert.equal(a.meses.length, 12)
  assert.deepEqual(a.trimestres, ['2026-T1', '2026-T2', '2026-T3', '2026-T4'])
  assert.equal(C.leerPeriodo('2028-02', '2028-05-01').hasta, '2028-03-01')
  assert.equal(C.leerPeriodo('2027-01', '2027-06-01').anterior, '2026-12')
  assert.equal(C.leerPeriodo('2027-T1', '2027-06-01').anterior, '2026-T4')
  assert.equal(C.leerPeriodo('2026-T3', HOY).siguiente, '2026-T4')
  for (const mal of ['2019-12', '2026-13', '2026-T5', 'abc', '2026-12', '2027']) assert.equal(C.leerPeriodo(mal, HOY), null, mal)
  assert.equal(C.leerPeriodo('2020-01', HOY).anterior, null)
})

test('periodos: cambiar de tipo, ventana del gráfico y recorte', () => {
  const p = (x) => C.leerPeriodo(x, HOY)
  assert.equal(C.cambiarTipoPeriodo(p('2026-08'), 'trimestre', HOY), '2026-T3')
  assert.equal(C.cambiarTipoPeriodo(p('2026-08'), 'anio', HOY), '2026')
  assert.equal(C.cambiarTipoPeriodo(p('2026-T2'), 'mes', HOY), '2026-06')
  assert.equal(C.cambiarTipoPeriodo(p('2026-T4'), 'mes', HOY), '2026-11')
  assert.equal(C.cambiarTipoPeriodo(p('2025'), 'mes', HOY), '2025-12')
  assert.equal(C.cambiarTipoPeriodo(p('2026'), 'mes', HOY), '2026-11')
  assert.equal(C.cambiarTipoPeriodo(p('2025'), 'trimestre', HOY), '2025-T4')
  assert.equal(C.cambiarTipoPeriodo(p('2026'), 'trimestre', HOY), '2026-T4')
  assert.deepEqual(C.ventanaGrafico(p('2026-11'), HOY).slice(0, 2), ['2025-12', '2026-01'])
  assert.equal(C.ventanaGrafico(p('2026-T4'), HOY).at(-1), '2026-11')
  assert.deepEqual(C.ventanaGrafico(p('2026'), HOY)[0], '2026-01')
  assert.deepEqual(C.recortar(p('2026-T4'), '2026-11'), { desdeEfectivo: '2026-11-01', recortado: true, sinDatos: false })
  assert.equal(C.recortar(p('2026-09'), '2026-10').sinDatos, true)
  assert.equal(C.plazoTrimestre('2026-T4'), 'del 1 al 30 de enero de 2027')
  assert.equal(C.plazoTrimestre('2027-T1'), 'del 1 al 20 de abril de 2027')
  assert.equal(C.textoMes('2027-01', { corto: true }), 'ene 27')
  assert.equal(C.textoMes('2026-09', { corto: true }), 'sep')
})

test('importes: leer y escribir euros', () => {
  assert.equal(C.leerImporte('84,2'), 8420)
  assert.equal(C.leerImporte('84.20'), 8420)
  assert.equal(C.leerImporte('1.234,56'), 123456)
  assert.equal(C.leerImporte('1.210'), 121000)
  assert.equal(C.leerImporte('12 €'), 1200)
  assert.equal(C.leerImporte(''), null)
  for (const mal of ['-5', 'abc', '1,234,5', '2000000']) assert.ok(Number.isNaN(C.leerImporte(mal)), mal)
  assert.equal(C.euros(123456), '1.234,56 €')
  assert.equal(C.euros(120000), '1.200 €')
  assert.equal(C.euros(-4000, { decimales: true }), '−40,00 €')
  assert.deepEqual(desglose(9680), { baseCent: 8000, ivaCent: 1680, totalCent: 9680 })
  assert.deepEqual(desglose(48400), { baseCent: 40000, ivaCent: 8400, totalCent: 48400 })
})

test('desglose de gastos: IVA, retención, tickets y errores', () => {
  const g = (x) => C.desgloseGasto(x)
  assert.deepEqual(g({ importeCent: 8420, tipoFactura: 'nif', ivaPct: 21 }), { ok: true, baseCent: 6959, ivaCent: 1461, retencionCent: 0, totalCent: 8420, ivaPct: 21 })
  const alq = g({ importeCent: 102000, tipoFactura: 'nif', ivaPct: 21, retencionPct: 19 })
  assert.deepEqual([alq.baseCent, alq.ivaCent, alq.retencionCent, alq.totalCent], [100000, 21000, 19000, 102000])
  const alqBase = g({ importeCent: 100000, importeEs: 'base', tipoFactura: 'nif', ivaPct: 21, retencionPct: 19 })
  assert.deepEqual([alqBase.baseCent, alqBase.ivaCent, alqBase.retencionCent, alqBase.totalCent], [100000, 21000, 19000, 102000])
  const mano = g({ importeCent: 2000, tipoFactura: 'nif', ivaPct: 'mano', ivaCent: 240 })
  assert.equal(mano.baseCent, 1760)
  const ticket = g({ importeCent: 1210, tipoFactura: 'ticket', ivaPct: 21 })
  assert.equal(C.costeGasto({ ...ticket, tipoFactura: 'ticket' }), 1210)
  assert.equal(g({ importeCent: 3000, tipoFactura: 'extranjero', ivaPct: 21 }).ivaCent, 0)
  assert.equal(g({ importeCent: 2000, tipoFactura: 'nif', ivaPct: 'mano', ivaCent: 900 }).campo, 'iva')
  assert.equal(g({ importeCent: 0 }).campo, 'importe')
  assert.equal(g({ importeCent: NaN }).campo, 'importe')
  assert.equal(g({ importeCent: 1, tipoFactura: 'nif', ivaPct: 21, retencionPct: 19 }).campo, 'importe')
  // Siempre cuadra: base + IVA − retención = total
  for (let total = 1; total <= 300000; total += 13) {
    for (const iva of [4, 10, 21, 'mano']) {
      for (const r of [0, 7, 15, 19]) {
        for (const modo of ['pagado', 'base']) {
          const ivaCent = iva === 'mano' ? Math.floor(total * 0.1) : null
          const d = g({ importeCent: total, importeEs: modo, tipoFactura: 'nif', ivaPct: iva, ivaCent, retencionPct: r })
          if (!d.ok) continue
          assert.equal(d.baseCent + d.ivaCent - d.retencionCent, d.totalCent)
          assert.ok(d.baseCent > 0 && d.ivaCent >= 0)
          assert.ok(Math.abs(d.retencionCent - Math.round((d.baseCent * r) / 100)) <= 1, `${total} ${iva} ${r} ${modo}`)
        }
      }
    }
  }
})

const R = { desde: '2026-10-01', hasta: '2026-12-01' }
const reserva = (x = {}) => ({ id: 1, codigo: 'AR-AAAA', origen: 'manual', nombre: 'Lucía', apellidos: 'Prueba', inicio: '2026-10-20T10:00:00Z', precioCent: 9680, pagoEstado: 'pagado', metodoPago: 'bizum', pagadoEn: '2026-10-10T10:00:00Z', reembolsoCent: null, canceladaEn: null, ...x })

test('movimientos: reservas, cuotas, fianzas, Calendly y a mano', () => {
  const dos = C.partidasDeReserva(reserva({ pagoEstado: 'reembolsado_parcial', reembolsoCent: 4840, canceladaEn: '2026-11-02T10:00:00Z', facturaCodigo: 'AR-W-1' }), R)
  assert.deepEqual(dos.map((m) => [m.fecha, m.sentido, m.totalCent, m.baseCent]), [['2026-10-10', 'cobro', 9680, 8000], ['2026-11-02', 'devolucion', 4840, 4000]])
  assert.equal(dos[1].rectificar, true)
  // Medianoche en Madrid: 22:30 UTC del 31-10 es aún 31-10 (invierno, +1)
  assert.equal(C.partidasDeReserva(reserva({ pagadoEn: '2026-10-31T22:30:00Z' }), R)[0].fecha, '2026-10-31')
  assert.equal(C.partidasDeReserva(reserva({ pagadoEn: '2026-10-31T23:30:00Z' }), R)[0].fecha, '2026-11-01')
  assert.equal(C.partidasDeReserva(reserva({ origen: 'calendly' }), R).length, 0)
  assert.equal(C.partidasDeReserva(reserva({ pagoEstado: 'pendiente', pagadoEn: null, reembolsoCent: 100, canceladaEn: '2026-11-02T10:00:00Z' }), R).length, 0)
  assert.equal(C.partidasDeReserva(reserva({ origen: 'plan', precioCent: 0 }), R).length, 0)
  assert.equal(C.partidasDeReserva(reserva({ origen: 'plan', precioCent: 6050, metodoPago: 'stripe' }), R)[0].fuente, 'horas_aparte')
  const cuota = { id: 5, suscripcionId: 2, periodo: 1, importeCent: 12900, estado: 'devuelta', metodoPago: 'stripe', desde: '2026-10-05', hasta: '2026-11-05', pagadaEn: '2026-10-05', devueltaEn: '2026-11-03', susCodigo: 'SUS-X' }
  assert.deepEqual(C.partidasDeCuota(cuota, R).map((m) => m.sentido), ['cobro', 'devolucion'])
  const fianza = (estado, devuelto) => C.partidaDeFianza({ id: 2, codigo: 'SUS-X', fianzaCent: 10000, fianzaEstado: estado, fianzaDevueltaCent: devuelto, resueltaEn: '2026-11-10' }, R)
  assert.deepEqual(fianza('retenida', null).map((m) => [m.totalCent, m.ivaCent]), [[10000, 0]])
  assert.equal(fianza('devuelta', 6000)[0].totalCent, 4000)
  assert.equal(fianza('devuelta', 10000).length, 0)
  assert.deepEqual(C.partidasDeCalendly({ mes: '2026-10-01', cobradoCent: 121000, devueltoCent: 9680 }, R).map((m) => m.sentido), ['cobro', 'devolucion'])
  const ing = C.partidaDeIngreso({ id: 3, tipo: 'extras', sentido: 'devolucion', fecha: '2026-11-04', concepto: 'Fondo', totalCent: 7260, ivaPct: 21, ivaCent: 1260 }, R)[0]
  assert.equal(ing.baseCent, 6000)
  assert.equal(ing.sentido, 'devolucion')
})

test('resumen: facturación, gastos, IVA, beneficio y grupos', () => {
  const movs = [
    ...C.partidasDeReserva(reserva(), R),
    ...C.partidasDeCuota({ id: 1, suscripcionId: 1, periodo: 1, importeCent: 12900, estado: 'pagada', desde: '2026-10-01', hasta: '2026-11-01', pagadaEn: '2026-10-01', susCodigo: 'SUS-A' }, R),
    ...C.partidasDeCalendly({ mes: '2026-10-01', cobradoCent: 121000, devueltoCent: 4840 }, R),
    ...C.partidaDeFianza({ id: 1, codigo: 'SUS-A', fianzaCent: 10000, fianzaEstado: 'retenida', resueltaEn: '2026-10-20' }, R),
  ]
  const gasto = (x) => ({ estado: 'apuntado', retencionPct: 0, retencionCent: 0, ...x })
  const gastos = [
    gasto({ fecha: '2026-10-01', categoriaId: 1, categoria: 'Alquiler', grupo: 'fijo', tipoFactura: 'nif', baseCent: 100000, ivaCent: 21000, retencionPct: 19, retencionCent: 19000, totalCent: 102000 }),
    gasto({ fecha: '2026-10-05', categoriaId: 2, categoria: 'Luz', grupo: 'variable', tipoFactura: 'nif', baseCent: 10000, ivaCent: 2100, totalCent: 12100 }),
    gasto({ fecha: '2026-10-06', categoriaId: 3, categoria: 'Seguro', grupo: 'fijo', tipoFactura: 'sin_iva', baseCent: 30000, ivaCent: 0, totalCent: 30000 }),
    gasto({ fecha: '2026-10-07', categoriaId: 4, categoria: 'Material', grupo: 'material', tipoFactura: 'ticket', baseCent: 1000, ivaCent: 210, totalCent: 1210 }),
    gasto({ fecha: '2026-10-08', categoriaId: 5, categoria: 'Programas', grupo: 'fijo', tipoFactura: 'extranjero', baseCent: 6000, ivaCent: 0, totalCent: 6000 }),
    gasto({ fecha: '2026-10-09', categoriaId: 6, categoria: 'Alarma', grupo: 'fijo', tipoFactura: 'nif', baseCent: 82562, ivaCent: 17338, totalCent: 99900, estado: 'anulado' }),
  ]
  const r = C.resumir({ movimientos: movs, gastos })
  // 9680 + 12900 + 121000 − 4840 + 10000 (fianza sin IVA)
  assert.equal(r.facturacion.totalCent, 148740)
  assert.equal(r.facturacion.baseCent, 8000 + 10661 + 100000 - 4000 + 10000)
  assert.equal(r.iva.devuelto.ivaCent, 840)
  assert.equal(r.gastos.costeCent, 100000 + 10000 + 30000 + 1210 + 6000)
  assert.equal(r.iva.soportadoCent, 21000 + 2100)
  assert.equal(r.beneficioCent, r.facturacion.baseCent - r.gastos.costeCent)
  assert.equal(r.diferenciaConIvaCent, r.beneficioCent + r.iva.netoCent)
  assert.equal(r.retencionAlquilerCent, 19000)
  assert.equal(r.extranjeroBaseCent, 6000)
  assert.equal(r.sinIvaCent, 10000)
  assert.deepEqual(r.porGrupo.map((g) => g.grupo), ['fijo', 'variable', 'material'])
  assert.equal(r.porGrupo[0].categorias[0].nombre, 'Alquiler')
  const vacio = C.resumir({ movimientos: [], gastos: [] })
  assert.equal(vacio.beneficioCent, 0)
  assert.equal(vacio.deCada100, null)
  const negativo = C.resumir({ movimientos: C.partidasDeCalendly({ mes: '2026-10-01', cobradoCent: 0, devueltoCent: 4840 }, R), gastos: [] })
  assert.equal(negativo.facturacion.totalCent, -4840)
})

test('mes a mes, IVA del trimestre y escala', () => {
  const movs = C.partidasDeCuota({ id: 1, suscripcionId: 1, periodo: 3, importeCent: 12100, estado: 'pagada', desde: '2026-09-20', hasta: '2026-10-20', pagadaEn: '2026-10-02', susCodigo: 'SUS-A' }, { desde: '2026-01-01', hasta: '2027-01-01' })
  const meses = C.ventanaGrafico(C.leerPeriodo('2026-11', HOY), HOY)
  const pm = C.porMeses({ movimientos: movs, gastos: [], meses, hoy: HOY, desde: '2026-10', mesesSinCalendly: ['2026-10'] })
  assert.equal(pm.length, 12)
  assert.equal(pm.at(-3).estado, 'sin_datos')
  assert.equal(pm.at(-3).facturacionCent, null)
  assert.equal(pm.at(-2).estado, 'cerrado')
  assert.equal(pm.at(-2).facturacionCent, 10000)
  assert.equal(pm.at(-2).faltaCalendly, true)
  assert.equal(pm.at(-1).estado, 'en_curso')
  const fut = C.porMeses({ movimientos: [], gastos: [], meses: C.ventanaGrafico(C.leerPeriodo('2026', HOY), HOY), hoy: HOY, desde: '2026-01' })
  assert.equal(fut.at(-1).estado, 'futuro')
  const t = C.ivaDelTrimestre({ movimientos: movs, gastos: [], trimestre: '2026-T4', desde: '2026-10', hoy: HOY, sinCobrar: { reservas: [{ fecha: '2026-11-02', totalCent: 9680 }], cuotas: [] } })
  assert.equal(t.netoCent, 2100)
  assert.deepEqual(t.avisos.cobrosDeAntes, { n: 1, ivaCent: 2100 })
  assert.deepEqual(t.avisos.sinCobrarEnT, { n: 1, totalCent: 9680 })
  assert.equal(t.enCurso, true)
  assert.equal(C.ivaDelTrimestre({ trimestre: '2026-T4', desde: '2026-11', hoy: HOY }).avisos.incompleto, true)
  assert.equal(C.escalaBonita(248000).topeCent, 500000)
  assert.equal(C.escalaBonita(0).topeCent, 10000)
  assert.equal(C.escalaBonita(100000).topeCent, 100000)
})

test('gastos fijos: meses que tocan, día del cargo y tramos', () => {
  const fijo = { desdeMes: '2026-09-01', hastaMes: null, cadaMeses: 1 }
  assert.deepEqual(C.mesesQueTocan(fijo, '2026-11'), ['2026-09-01', '2026-10-01', '2026-11-01'])
  assert.deepEqual(C.mesesQueTocan({ ...fijo, cadaMeses: 2 }, '2026-11'), ['2026-09-01', '2026-11-01'])
  assert.deepEqual(C.mesesQueTocan({ ...fijo, cadaMeses: 12 }, '2026-11'), ['2026-09-01'])
  assert.deepEqual(C.mesesQueTocan({ ...fijo, hastaMes: '2026-10-01' }, '2026-11'), ['2026-09-01', '2026-10-01'])
  assert.deepEqual(C.mesesQueTocan({ ...fijo, desdeMes: '2027-01-01' }, '2026-11'), [])
  assert.equal(C.fechaDelFijo('2027-02-01', 31), '2027-02-28')
  assert.equal(C.fechaDelFijo('2028-02-01', 31), '2028-02-29')
  assert.equal(C.fechaDelFijo('2026-04-01', 31), '2026-04-30')
  assert.equal(C.fechaDelFijo('2026-12-01', 31), '2026-12-31')
  const tramos = [{ desdeMes: '2026-01-01', importeCent: 100000 }, { desdeMes: '2027-01-01', importeCent: 95000 }]
  assert.equal(C.importeDelMes(tramos, '2026-12-01'), 100000)
  assert.equal(C.importeDelMes(tramos, '2027-01-01'), 95000)
  assert.equal(C.importeDelMes(tramos, '2025-12-01'), null)
})

test('para revisar: Calendly, facturas que faltan, repetidos y vistos', () => {
  const base = { hoy: '2027-01-10', desde: '2026-10', categorias: [], vistos: [] }
  const a = C.avisosParaRevisar({ ...base, mesesSinCalendly: ['2026-11', '2026-12'] })
  assert.equal(a.length, 1)
  assert.equal(a[0].urgente, true)
  assert.match(a[0].texto, /noviembre 2026 y diciembre 2026/)
  const luz = { id: 7, nombre: 'Luz', avisoCadaMeses: 1, activa: true }
  const falta = C.avisosParaRevisar({ ...base, categorias: [luz], mesesConGasto: { 7: ['2026-11'] } })
  assert.equal(falta[0].clave, 'factura_falta:7:2026-12')
  assert.equal(C.avisosParaRevisar({ ...base, categorias: [luz], mesesConGasto: {} }).length, 0)
  assert.equal(C.avisosParaRevisar({ ...base, categorias: [luz], mesesConGasto: { 7: ['2026-11'] }, vistos: ['factura_falta:7:2026-12'] }).length, 0)
  const g = (id, fecha) => ({ id, fecha, categoriaId: 7, categoria: 'Luz', totalCent: 8420, estado: 'apuntado' })
  const rep = C.avisosParaRevisar({ ...base, gastosRecientes: [g(1, '2026-12-03'), g(2, '2026-12-05')], conflictos: [{ id: 9, codigo: 'AR-X' }] })
  assert.equal(rep[0].tipo, 'conflicto')
  assert.match(rep[1].texto, /¿Repetido\? Luz, 84,20 €, el 3 dic y el 5 dic\./)
})

test('CSV para la gestoría', () => {
  assert.equal(textoCsv('a;b'), '"a;b"')
  assert.equal(textoCsv('di "hola"'), '"di ""hola"""')
  assert.equal(textoCsv('=SUMA(A1)'), "'=SUMA(A1)")
  assert.equal(numeroCsv(-4000), '-40,00')
  assert.equal(numeroCsv(123456), '1234,56')
  assert.equal(fechaCsv('2026-11-05'), '05/11/2026')
  const csv = aCsv([['A', (f) => f.a], ['B', (f) => f.b, 'numero']], [{ a: 'x', b: 100 }])
  assert.equal(csv, 'A;B\r\nx;1,00\r\n')
})
