// Facturas completas y simplificadas, con una base de datos Postgres real en memoria (PGlite)
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-Q'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-QS'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as F from '../lib/facturas/servicio.js'
import * as FIN from '../lib/finanzas/servicio.js'
import * as C from '../lib/finanzas/calculos.js'
import { pdfFactura } from '../lib/facturas/pdf.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'
import { validarReserva } from '../lib/reservas/validacion.js'
import { firmaSimulada } from '../lib/pagos/simulado.js'
import { recibirResultado, empezarReserva } from '../lib/reservas/flujo.js'

after(() => cerrarDb())

const HOY = fechaMadrid(new Date())
const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}
let n = 0
const CLIENTE = () => ({ nombre: 'Marta', apellidos: 'Prueba', email: `cliente${++n}@example.com`, telefono: '+34 600 000 000', actividad: 'Fotos' })
const DATOS = { nombre: 'Estudio Cliente SL', nif: 'b12345678', direccion: 'Avenida del Puerto 1, 46021 València' }
const vigentes = async (campo, id) => (await query(`SELECT count(*)::int AS n FROM facturas WHERE ${campo} = $1 AND sustituida_en IS NULL`, [id])).rows[0].n

test('sin datos sale la simplificada (serie aparte, sin datos del cliente) y con datos la completa', async () => {
  const fecha = await laborable(30)
  const sin = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum' })
  const a = await F.emitirFactura(sin.id)
  assert.equal(a.nueva, true)
  assert.equal(a.factura.tipo, 'simplificada')
  assert.match(a.factura.codigo, /^AR-QS-\d{4}-001$/)
  assert.equal(a.factura.cliente.nombre, '')
  assert.equal(a.factura.cliente.nif, '')
  assert.equal(a.factura.cliente.email, sin.email) // solo para enviarla
  assert.equal(a.factura.totalCent, 9680)
  // Pedirla otra vez sin datos devuelve la misma
  assert.equal((await F.emitirFactura(sin.id)).factura.codigo, a.factura.codigo)

  const con = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '15:00', hasta: '17:00', pagoEstado: 'pagado', factura: DATOS })
  const b = await F.emitirFactura(con.id)
  assert.equal(b.factura.tipo, 'completa')
  assert.match(b.factura.codigo, /^AR-Q-\d{4}-001$/) // su propia numeración
  assert.equal(b.factura.cliente.nif, 'B12345678')

  // Otra simplificada sigue su serie
  const otra = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '18:00', hasta: '20:00', pagoEstado: 'pagado' })
  assert.match((await F.emitirFactura(otra.id)).factura.codigo, /^AR-QS-\d{4}-002$/)

  // PDF de la simplificada
  const pdf = await pdfFactura(a.factura)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
})

test('la completa sustituye a la simplificada: nunca dos vigentes', async () => {
  const fecha = await laborable(32)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '13:00', pagoEstado: 'pagado' })
  const simple = (await F.emitirFactura(r.id)).factura
  assert.equal(simple.simplificada, true)
  await assert.rejects(F.emitirFactura(r.id, { nombre: 'Falta el NIF', direccion: 'Calle 1' }), { codigo: 'datos' })

  const { factura: completa, nueva } = await F.emitirFactura(r.id, DATOS)
  assert.equal(nueva, true)
  assert.equal(completa.tipo, 'completa')
  assert.equal(completa.sustituye.codigo, simple.codigo)
  assert.equal(completa.sustituye.fecha, simple.fechaEmision)
  assert.equal(completa.totalCent, simple.totalCent)
  assert.equal(await vigentes('reserva_id', r.id), 1)
  assert.equal((await F.facturaDeReserva(r.id)).codigo, completa.codigo)
  // La simplificada no se borra: queda marcada
  const vieja = await F.facturaPorId(simple.id)
  assert.ok(vieja.sustituidaEn)
  assert.equal(vieja.sustituidaPor, completa.codigo)
  // Guarda los datos en la reserva
  assert.equal((await S.reservaPorId(r.id)).factura.nif, 'B12345678')
  // Una vez hecha la completa, no se hace otra
  const otraVez = await F.emitirFactura(r.id, { ...DATOS, nombre: 'Otro nombre SL' })
  assert.equal(otraVez.nueva, false)
  assert.equal(otraVez.factura.codigo, completa.codigo)
  // La base de datos tampoco deja dos vigentes
  await assert.rejects(query(`UPDATE facturas SET sustituida_en = NULL, sustituida_por = NULL WHERE id = $1`, [simple.id]), (e) => e.code === '23505')
  // Ni sustituir una completa
  await assert.rejects(query(`UPDATE facturas SET sustituida_en = now(), sustituida_por = 'X' WHERE id = $1`, [completa.id]), (e) => e.code === '23514')

  // PDF de la completa que sustituye
  const pdf = await pdfFactura(completa)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')

  // CSV para la gestoría: las dos, con su tipo y la sustitución
  const csv = await FIN.exportarCsv(C.leerPeriodo(C.mesDe(HOY), HOY), { tipo: 'facturas' })
  const fila = (codigo) => csv.contenido.split('\r\n').find((l) => l.startsWith(`${codigo};`)) || ''
  assert.match(fila(simple.codigo), /;AR-QS;Simplificada;/)
  // La sustituida sale con los importes a 0 (sumar las columnas no cuenta dos veces) y el original aparte
  assert.ok(fila(simple.codigo).endsWith(`;;Sustituida por ${completa.codigo};145,20`), fila(simple.codigo))
  assert.match(fila(simple.codigo), /;0,00;21;0,00;0,00;/)
  assert.match(fila(completa.codigo), /;120,00;21;25,20;145,20;/)
  assert.ok(fila(completa.codigo).endsWith(`;${simple.codigo};;`))
})

test('con datos guardados después, «Reenviar» manda la simplificada que hay; solo se sustituye pidiéndolo', async () => {
  const fecha = await laborable(34)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado' })
  const simple = (await F.emitirFactura(r.id)).factura
  const guardados = { nombre: 'Persona Prueba', nif: '00000000T', direccion: 'Calle 3' }
  await query('UPDATE reservas SET factura = $2 WHERE id = $1', [r.id, JSON.stringify(guardados)])
  const otra = await F.emitirFactura(r.id)
  assert.equal(otra.nueva, false)
  assert.equal(otra.factura.codigo, simple.codigo)
  // Pidiéndolo con los datos, sí
  const { factura, nueva } = await F.emitirFactura(r.id, guardados)
  assert.equal(nueva, true)
  assert.equal(factura.sustituye.codigo, simple.codigo)
})

test('no se factura lo devuelto, lo incluido en un plan ni lo de Calendly', async () => {
  const fecha = await laborable(36)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado' })
  await F.emitirFactura(r.id)
  await S.cancelar(r.id, { motivo: 'prueba', reembolsoCent: 9680 })
  // Tras una devolución, la simplificada no se cambia por la completa (va con rectificativa)
  await assert.rejects(F.emitirFactura(r.id, DATOS), { codigo: 'devuelta' })
  assert.equal(F.seFactura({ precioCent: 0, origen: 'plan' }), false)
  assert.equal(F.seFactura({ precioCent: 9680, origen: 'calendly' }), false)
  assert.equal(F.seFactura({ precioCent: 9680, origen: 'web' }), true)
})

test('cuotas: simplificada sin datos y completa que la sustituye', async () => {
  const { suscripcion: sus } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Ana', apellidos: 'Prueba', email: 'miembro-f@example.com', telefono: '600000000',
    fechaInicio: HOY, mesPrueba: false, metodoHabitual: 'transferencia',
    fianza: { estado: 'cobrada', metodo: 'transferencia', fecha: HOY },
  })
  const c1 = (await SUS.fichaSuscripcion(sus.id)).cuotas[0]
  await SUS.marcarCuotaPagada(c1.id, { metodo: 'transferencia' })
  const simple = (await F.emitirFacturaCuota(c1.id)).factura
  assert.equal(simple.tipo, 'simplificada')
  assert.match(simple.codigo, /^AR-QS-/)
  assert.equal((await SUS.fichaSuscripcion(sus.id)).cuotas[0].factura.simplificada, true)
  const { factura: completa } = await F.emitirFacturaCuota(c1.id, DATOS)
  assert.equal(completa.sustituye.codigo, simple.codigo)
  assert.equal(await vigentes('cuota_id', c1.id), 1)
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.equal(ficha.cuotas[0].factura.codigo, completa.codigo)
  assert.equal((await query('SELECT factura FROM suscripciones WHERE id = $1', [sus.id])).rows[0].factura.nif, 'B12345678')
})

test('las dos series no pueden ser la misma', async () => {
  const antes = process.env.FACTURA_SERIE_SIMPLIFICADA
  process.env.FACTURA_SERIE_SIMPLIFICADA = 'ar-q'
  try {
    assert.throws(() => F.serie('simplificada'), { codigo: 'serie' })
  } finally {
    process.env.FACTURA_SERIE_SIMPLIFICADA = antes
  }
})

test('al confirmarse el pago en la web sale sola: simplificada sin datos, completa con datos', async () => {
  const pagar = async (extra) => {
    const v = validarReserva({ ...CLIENTE(), fondos: 'no', equipo: [], aceptaCondiciones: true, ...extra })
    assert.ok(v.ok, JSON.stringify(v.errores))
    const inicio = await empezarReserva(v.datos, 'http://localhost:3000')
    const { pedido, importe } = inicio.pago.campos
    const r = await recibirResultado('simulado', { pedido, importe, resultado: 'ok', firma: firmaSimulada(pedido, importe, 'ok') }, 'http://localhost:3000')
    assert.equal(r.aviso, 'confirmada')
    return F.facturaDeReserva(r.reserva.id)
  }
  const fecha = await laborable(40)
  const sin = await pagar({ fecha, hora: '10:00', horas: 2 })
  assert.equal(sin.tipo, 'simplificada')
  assert.ok(sin.enviadaEn)
  const con = await pagar({ fecha, hora: '15:00', horas: 2, quiereFactura: true, factura: DATOS })
  assert.equal(con.tipo, 'completa')
  assert.equal(con.cliente.nif, 'B12345678')
  assert.ok(con.enviadaEn)

  // Con FACTURAS_AUTOMATICAS=0 no sale sola
  process.env.FACTURAS_AUTOMATICAS = '0'
  try {
    assert.equal(await pagar({ fecha, hora: '18:00', horas: 2 }), null)
  } finally {
    delete process.env.FACTURAS_AUTOMATICAS
  }
})
