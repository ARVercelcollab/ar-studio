// Finanzas con una base de datos Postgres real en memoria (PGlite)
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-F'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as F from '../lib/facturas/servicio.js'
import * as FIN from '../lib/finanzas/servicio.js'
import * as C from '../lib/finanzas/calculos.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

const HOY = fechaMadrid(new Date())
let n = 0
const email = () => `fin${++n}@example.com`
const cat = async (clave) => (await query('SELECT id FROM gasto_categorias WHERE clave = $1', [clave])).rows[0].id
const clave = () => `prueba-${Date.now()}-${++n}-abcdefgh`

const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}

test('migración 7: categorías y restricciones', async () => {
  const { rows } = await query('SELECT grupo, count(*)::int AS n FROM gasto_categorias GROUP BY grupo ORDER BY grupo')
  assert.deepEqual(rows.map((r) => [r.grupo, r.n]), [['fijo', 7], ['material', 3], ['variable', 8]])
  const luz = await cat('luz')
  const mal = (sql, p) => assert.rejects(query(sql, p), (e) => e.code === '23514', sql)
  await mal(`INSERT INTO gastos (fecha, categoria_id, concepto, tipo_factura, base_cent, iva_cent, total_cent) VALUES ('2026-01-05', $1, 'x', 'nif', 100, 21, 120)`, [luz])
  await mal(`INSERT INTO gastos (fecha, categoria_id, concepto, tipo_factura, base_cent, iva_cent, total_cent) VALUES ('2026-01-05', $1, 'x', 'sin_iva', 100, 21, 121)`, [luz])
  await mal(`INSERT INTO gastos (fecha, categoria_id, concepto, tipo_factura, base_cent, iva_cent, total_cent, estado) VALUES ('2026-01-05', $1, 'x', 'nif', 100, 21, 121, 'anulado')`, [luz])
  await mal(`INSERT INTO gastos (fecha, categoria_id, concepto, tipo_factura, base_cent, iva_cent, total_cent, enlace) VALUES ('2026-01-05', $1, 'x', 'nif', 100, 21, 121, 'http://x')`, [luz])
  await mal(`INSERT INTO calendly_meses (mes, cobrado_cent) VALUES ('2026-01-05', 100)`)
  await mal(`INSERT INTO ingresos_manuales (tipo, fecha, concepto, total_cent, iva_pct, iva_cent) VALUES ('factura_manual', '2026-01-05', 'x', 100, 21, 17)`)
  await mal(`INSERT INTO ingresos_manuales (tipo, fecha, concepto, total_cent, iva_pct, iva_cent) VALUES ('otro', '2026-01-05', 'x', 100, 0, 10)`)
})

test('cuotas devueltas con fecha, reservas cobradas en otro día y Calendly sin duplicar', async () => {
  const { suscripcion: sus } = await SUS.crearSuscripcion({ plan: 'starter', nombre: 'Fin', email: email(), fechaInicio: sumarDias(HOY, -3), fianza: { estado: 'sin_fianza' }, primeraPagada: { metodo: 'stripe', fecha: sumarDias(HOY, -3) } })
  const ficha = await SUS.fichaSuscripcion(sus.id)
  const c = ficha.cuotas[0]
  await assert.rejects(SUS.devolverCuota(c.id, { fecha: sumarDias(HOY, 1) }), { codigo: 'fecha' })
  await assert.rejects(SUS.devolverCuota(c.id, { fecha: sumarDias(HOY, -10) }), { codigo: 'fecha' })
  await SUS.devolverCuota(c.id, { fecha: HOY })
  assert.equal((await SUS.fichaSuscripcion(sus.id)).cuotas[0].devueltaEn, HOY)
  // Reserva manual cobrada hace unos días
  const fecha = await laborable(20)
  const r = await S.crearReservaManual({ fecha, desde: '10:00', hasta: '12:00', nombre: 'Lu', apellidos: 'P', email: email(), telefono: '600000000', actividad: 'Fotos', fondos: 'no', equipo: [] })
  await assert.rejects(S.marcarPagada(r.id, { metodo: 'bizum', fecha: sumarDias(HOY, 2) }), { codigo: 'fecha' })
  const ayer = sumarDias(HOY, -1)
  const pagada = await S.marcarPagada(r.id, { metodo: 'bizum', fecha: ayer })
  assert.equal(fechaMadrid(pagada.pagadoEn), ayer)
  // Calendly: no suma y no se factura
  const fk = await laborable(21)
  const k = await S.crearReservaManual({ fecha: fk, desde: '10:00', hasta: '12:00', nombre: 'Ka', email: email(), telefono: '600000000', actividad: 'Fotos', fondos: 'no', equipo: [], origen: 'calendly', pagoEstado: 'pagado', metodoPago: 'stripe' })
  assert.equal(k.origen, 'calendly')
  await assert.rejects(F.emitirFactura(k.id, { nombre: 'X', nif: 'B12345678', direccion: 'C 1' }), { codigo: 'calendly' })
  await assert.rejects(S.crearReservaManual({ fecha: fk, desde: '14:00', hasta: '16:00', nombre: 'Ka', email: email(), telefono: '600000000', actividad: 'Fotos', fondos: 'no', equipo: [], origen: 'calendly' }), { codigo: 'calendly' })
  await assert.rejects(S.crearReservaManual({ fecha: fk, desde: '14:00', hasta: '16:00', nombre: 'Ka', email: email(), telefono: '600000000', actividad: 'Fotos', fondos: 'no', equipo: [], pagoEstado: 'pagado', metodoPago: 'cheque' }), { codigo: 'metodo' })
  const p = C.leerPeriodo(C.mesDe(HOY), HOY)
  const d = await FIN.datosDelPeriodo(p, { hoy: HOY, conRevisar: false })
  const claves = d.todos.movimientos.map((m) => m.clave)
  assert.ok(claves.includes(`c${c.id}c`) && claves.includes(`c${c.id}d`))
  assert.ok(!claves.some((x) => x.startsWith(`r${k.id}`)))
  if (C.mesDe(ayer) === C.mesDe(HOY)) assert.ok(claves.includes(`r${r.id}c`))
})

test('gastos fijos: meses que tocan, idempotencia, tramos, anular, terminar y borrar', async () => {
  const hoy = '2025-11-18'
  const alq = await cat('alquiler')
  const { id } = await FIN.crearGastoFijo({ concepto: 'Alquiler del local', categoriaId: alq, importe: '1.020', importeEs: 'pagado', tipoFactura: 'nif', ivaPct: 21, retencionPct: 19, metodoPago: 'domiciliacion', cadaMeses: 1, dia: 31, desdeMes: '2025-09' }, { hoy })
  const filas = async () => (await query('SELECT mes::text AS m, fecha::text AS f, base_cent, iva_cent, retencion_cent, total_cent, editado, estado FROM gastos WHERE fijo_id = $1 ORDER BY mes', [id])).rows
  let fs = await filas()
  assert.deepEqual(fs.map((x) => x.f), ['2025-09-30', '2025-10-31', '2025-11-30'])
  assert.deepEqual([fs[0].base_cent, fs[0].iva_cent, fs[0].retencion_cent, fs[0].total_cent], [100000, 21000, 19000, 102000])
  await Promise.all([1, 2, 3, 4, 5].map(() => FIN.asegurarGastosFijos(null, { hoy })))
  assert.equal((await filas()).length, 3)
  // Una vez al año: una sola fila; empezando en el futuro: ninguna
  const seg = await cat('seguro')
  const anual = await FIN.crearGastoFijo({ concepto: 'Seguro', categoriaId: seg, importe: '600', tipoFactura: 'sin_iva', cadaMeses: 12, dia: 10, desdeMes: '2025-03' }, { hoy })
  assert.equal(anual.mesesApuntados, 1)
  const fut = await FIN.crearGastoFijo({ concepto: 'Alarma', categoriaId: await cat('alarma'), importe: '40', tipoFactura: 'nif', ivaPct: 21, dia: 5, desdeMes: '2026-01' }, { hoy })
  assert.equal(fut.mesesApuntados, 0)
  // Cambiar a mano octubre y luego el importe desde octubre: octubre no se toca
  const oct = (await query(`SELECT id, version FROM gastos WHERE fijo_id = $1 AND mes = '2025-10-01'`, [id])).rows[0]
  await FIN.editarGasto(oct.id, { categoriaId: alq, importe: '1000', importeEs: 'base', fecha: '2025-10-15', tipoFactura: 'nif', ivaPct: 21, retencionPct: 19 }, { version: oct.version, hoy })
  await assert.rejects(FIN.editarGasto(oct.id, { categoriaId: alq, importe: '1000', importeEs: 'base', fecha: '2025-11-15', tipoFactura: 'nif', ivaPct: 21, retencionPct: 19 }, { version: oct.version + 1, hoy }), { codigo: 'fecha' })
  const v = (await query('SELECT version FROM gastos_fijos WHERE id = $1', [id])).rows[0].version
  const cambio = await FIN.cambiarImporteFijo(id, { importe: '1.071', desdeMes: '2025-10', version: v }, { hoy })
  assert.equal(cambio.cambiados, 1)
  assert.deepEqual(cambio.sinTocar, ['2025-10'])
  fs = await filas()
  assert.equal(fs[0].total_cent, 102000)
  assert.equal(fs[1].editado, true)
  assert.equal(fs[2].total_cent, 107100)
  // Tramo futuro y el mes en que llega
  const v2 = (await query('SELECT version FROM gastos_fijos WHERE id = $1', [id])).rows[0].version
  await FIN.cambiarImporteFijo(id, { importe: '1.122', desdeMes: '2026-01', version: v2 }, { hoy })
  await FIN.asegurarGastosFijos(null, { hoy: '2026-01-02' })
  fs = await filas()
  assert.equal(fs.find((x) => x.m === '2025-12-01').total_cent, 107100)
  assert.equal(fs.find((x) => x.m === '2026-01-01').total_cent, 112200)
  const v3 = (await query('SELECT version FROM gastos_fijos WHERE id = $1', [id])).rows[0].version
  await assert.rejects(FIN.quitarCambioImporte(id, { desdeMes: '2025-10', version: v3 }, { hoy }), { codigo: 'mes' })
  // Un mes que no se paga sigue así al volver a asegurar
  const nov = (await query(`SELECT id, version FROM gastos WHERE fijo_id = $1 AND mes = '2025-11-01'`, [id])).rows[0]
  await FIN.anularMesFijo(nov.id, { version: nov.version })
  await FIN.asegurarGastosFijos(null, { hoy })
  assert.equal((await filas()).find((x) => x.m === '2025-11-01').estado, 'anulado')
  await assert.rejects(FIN.borrarGasto(nov.id, { version: nov.version + 1 }), { codigo: 'fijo' })
  // Terminar: se quitan los meses de después menos los cambiados a mano
  const t = await FIN.terminarGastoFijo(id, { ultimoMes: '2025-09', version: v3 })
  assert.deepEqual(t.seQuedan, ['2025-10'])
  await assert.rejects(FIN.borrarGastoFijo(id, { version: v3 + 1 }), { codigo: 'meses' })
  const v4 = (await query('SELECT version FROM gastos_fijos WHERE id = $1', [id])).rows[0].version
  // Vuelve a apuntar los que faltan hasta hoy (noviembre; octubre se quedó porque se cambió a mano)
  const vuelta = await FIN.quitarFinalGastoFijo(id, { version: v4 }, { hoy })
  assert.equal(vuelta.apuntados, 1)
  // Borrar uno sin meses cambiados se lleva sus meses
  const vf = (await query('SELECT version FROM gastos_fijos WHERE id = $1', [anual.id])).rows[0].version
  assert.equal((await FIN.borrarGastoFijo(anual.id, { version: vf })).borrados, 1)
  assert.equal((await query('SELECT count(*)::int AS n FROM gastos WHERE fijo_id = $1', [anual.id])).rows[0].n, 0)
})

test('gastos sueltos: validación, clave, versión y borrado', async () => {
  const luz = await cat('luz')
  const fecha = sumarDias(HOY, -2)
  await assert.rejects(FIN.crearGasto({ categoriaId: luz, importe: '84,20', fecha: sumarDias(HOY, 1), tipoFactura: 'nif', ivaPct: 21 }), { codigo: 'fecha' })
  await assert.rejects(FIN.crearGasto({ categoriaId: 999999, importe: '84,20', fecha, tipoFactura: 'nif', ivaPct: 21 }), { codigo: 'categoria' })
  await assert.rejects(FIN.crearGasto({ categoriaId: luz, importe: 'abc', fecha, tipoFactura: 'nif', ivaPct: 21 }), { codigo: 'importe' })
  await assert.rejects(FIN.crearGasto({ categoriaId: luz, importe: '84,20', fecha, tipoFactura: 'raro', ivaPct: 21 }), { codigo: 'tipoFactura' })
  await assert.rejects(FIN.crearGasto({ categoriaId: luz, importe: '84,20', fecha, tipoFactura: 'nif', ivaPct: 21, enlace: 'http://x' }), { codigo: 'enlace' })
  const k = clave()
  const a = await FIN.crearGasto({ categoriaId: luz, importe: '84,20', fecha, tipoFactura: 'nif', ivaPct: 21 }, { clave: k })
  const b = await FIN.crearGasto({ categoriaId: luz, importe: '84,20', fecha, tipoFactura: 'nif', ivaPct: 21 }, { clave: k })
  assert.equal(a.id, b.id)
  assert.equal(b.repetido, true)
  const g = (await FIN.fichaGasto(a.id)).gasto
  assert.equal(g.concepto, 'Luz')
  assert.deepEqual([g.baseCent, g.ivaCent], [6959, 1461])
  await assert.rejects(FIN.editarGasto(a.id, { categoriaId: luz, importe: '90', fecha, tipoFactura: 'nif', ivaPct: 21 }, { version: g.version + 5 }), { codigo: 'cambiado' })
  await FIN.borrarGasto(a.id, { version: g.version })
  const { rows } = await query(`SELECT detalle FROM eventos WHERE tipo = 'gasto_borrado' ORDER BY id DESC LIMIT 1`)
  assert.equal(rows[0].detalle.totalCent, 8420)
})

test('Calendly del mes: una fila, comisión enlazada y versión', async () => {
  const mes = C.sumarMesesMes(C.mesDe(HOY), -1)
  await FIN.guardarCalendlyMes({ mes, cobradoCent: 121000, devueltoCent: 0, comisionCent: 1840 })
  await assert.rejects(FIN.guardarCalendlyMes({ mes, cobradoCent: 1, devueltoCent: 0, comisionCent: 0, version: 99 }), { codigo: 'cambiado' })
  await FIN.guardarCalendlyMes({ mes, cobradoCent: 125000, devueltoCent: 4840, comisionCent: 1900, version: 1 })
  const k = await FIN.calendlyDelMes(mes)
  assert.equal(k.fila.cobradoCent, 125000)
  assert.equal(k.comisionCent, 1900)
  const { rows } = await query(`SELECT g.id, g.version, g.tipo_factura, c.clave FROM gastos g JOIN gasto_categorias c ON c.id = g.categoria_id WHERE calendly_mes = $1`, [C.primerDia(mes)])
  assert.equal(rows[0].clave, 'comisiones')
  assert.equal(rows[0].tipo_factura, 'extranjero')
  await assert.rejects(FIN.borrarGasto(rows[0].id, { version: rows[0].version }), { codigo: 'calendly' })
  await FIN.guardarCalendlyMes({ mes, cobradoCent: 125000, devueltoCent: 4840, comisionCent: 0, version: 2 })
  assert.equal((await FIN.calendlyDelMes(mes)).comisionCent, 0)
  await FIN.borrarCalendlyMes(mes)
  assert.equal((await FIN.calendlyDelMes(mes)).fila, null)
})

test('otros ingresos: IVA, devoluciones, AR-M y reservas', async () => {
  const fecha = sumarDias(HOY, -1)
  const a = await FIN.crearIngresoManual({ tipo: 'extras', sentido: 'cobro', fecha, concepto: 'Fondo blanco', importe: '72,60', ivaPct: 21 })
  assert.equal((await FIN.fichaIngreso(a.id)).ivaCent, 1260)
  const b = await FIN.crearIngresoManual({ tipo: 'otro', sentido: 'cobro', fecha, concepto: 'Colaboración', importe: '100', ivaPct: 0 })
  assert.equal((await FIN.fichaIngreso(b.id)).ivaCent, 0)
  await assert.rejects(FIN.crearIngresoManual({ tipo: 'factura_manual', sentido: 'cobro', fecha, concepto: 'x', importe: '10', ivaPct: 21 }), { codigo: 'factura' })
  await FIN.crearIngresoManual({ tipo: 'factura_manual', sentido: 'cobro', fecha, concepto: 'Sesión', importe: '121', ivaPct: 21, facturaRef: 'AR-M-2026-002', clienteNombre: 'Empresa X', clienteNif: 'b1' })
  await assert.rejects(FIN.crearIngresoManual({ tipo: 'factura_manual', sentido: 'cobro', fecha, concepto: 'Sesión', importe: '121', ivaPct: 21, facturaRef: ' ar-m-2026-002 ' }), { codigo: 'factura' })
  await assert.rejects(FIN.crearIngresoManual({ tipo: 'otro', sentido: 'cobro', fecha, concepto: 'x', importe: '10', reservaId: 999999 }), { codigo: 'reserva' })
  await assert.rejects(FIN.crearIngresoManual({ tipo: 'otro', sentido: 'cobro', fecha: sumarDias(HOY, 3), concepto: 'x', importe: '10' }), { codigo: 'fecha' })
  const k = clave()
  const x1 = await FIN.crearIngresoManual({ tipo: 'otro', sentido: 'devolucion', fecha, concepto: 'Devolución', importe: '10' }, { clave: k })
  const x2 = await FIN.crearIngresoManual({ tipo: 'otro', sentido: 'devolucion', fecha, concepto: 'Devolución', importe: '10' }, { clave: k })
  assert.equal(x1.id, x2.id)
})

test('resumen, ajustes y avisos', async () => {
  await FIN.guardarAjustesFinanzas({ desde: C.sumarMesesMes(C.mesDe(HOY), -2), calendlyHasta: 'sigue' })
  const p = C.leerPeriodo(C.mesDe(HOY), HOY)
  const r = await FIN.resumenFinanzas(p)
  assert.equal(r.grafico.length, 12)
  assert.equal(r.cifras.diferenciaConIvaCent, r.cifras.beneficioCent + r.cifras.iva.netoCent)
  // Sin Calendly en los dos meses cerrados: un aviso
  assert.ok(r.revisar.some((a) => a.tipo === 'calendly'))
  await FIN.guardarAjustesFinanzas({ desde: C.sumarMesesMes(C.mesDe(HOY), -2), calendlyHasta: 'nunca' })
  assert.ok(!(await FIN.resumenFinanzas(p)).revisar.some((a) => a.tipo === 'calendly'))
  // Antes de «desde»: sin datos
  const antes = C.leerPeriodo(C.sumarMesesMes(C.mesDe(HOY), -5), HOY)
  assert.equal((await FIN.resumenFinanzas(antes)).recorte.sinDatos, true)
  await assert.rejects(FIN.guardarAjustesFinanzas({ desde: '2019-01', calendlyHasta: 'sigue' }), { codigo: 'desde' })
  await assert.rejects(FIN.marcarAvisoVisto('nada'), { codigo: 'clave' })
  // Dos gastos iguales seguidos: ¿repetido?
  const luz = await cat('luz')
  await FIN.crearGasto({ categoriaId: luz, importe: '55,55', fecha: sumarDias(HOY, -3), tipoFactura: 'nif', ivaPct: 21 })
  await FIN.crearGasto({ categoriaId: luz, importe: '55,55', fecha: sumarDias(HOY, -1), tipoFactura: 'nif', ivaPct: 21 })
  const rep = (await FIN.resumenFinanzas(p)).revisar.find((a) => a.tipo === 'repetido')
  assert.ok(rep)
  await FIN.marcarAvisoVisto(rep.clave)
  assert.ok(!(await FIN.resumenFinanzas(p)).revisar.some((a) => a.clave === rep.clave))
})

test('exportar: cabeceras exactas y devoluciones en negativo', async () => {
  const p = C.leerPeriodo(C.mesDe(HOY), HOY)
  const ing = await FIN.exportarCsv(p, { tipo: 'ingresos' })
  assert.ok(ing.contenido.startsWith('Fecha;Tipo;Origen;Concepto;Referencia;Cliente;NIF;Factura;Fecha del servicio;Cobrado por;Base;IVA %;IVA;Total;Nota\r\n'))
  assert.match(ing.contenido, /Devolución;.*;-/)
  const gas = await FIN.exportarCsv(p, { tipo: 'gastos' })
  assert.ok(gas.contenido.startsWith('Fecha;Grupo;Categoría;Concepto;Proveedor;Nº factura;Tipo de factura;Base;IVA %;IVA;IVA deducible;Retención %;Retención;Modelo;Pagado al proveedor;Cuenta como gasto;Fijo;Cómo se pagó;Enlace;Nota\r\n'))
  const fac = await FIN.exportarCsv(p, { tipo: 'facturas' })
  assert.ok(fac.contenido.startsWith('Número;Serie;Fecha de emisión;Fecha de la operación;Cliente;NIF;Concepto;Base;IVA %;IVA;Total;De;Enviada;Importe devuelto;Necesita rectificativa\r\n'))
  assert.match(fac.contenido, /AR-M-2026-002;AR-M/)
  assert.equal(fac.nombre, `finanzas-facturas-${p.clave}.csv`)
  await assert.rejects(FIN.exportarCsv(p, { tipo: 'otra' }), { codigo: 'tipo' })
})
