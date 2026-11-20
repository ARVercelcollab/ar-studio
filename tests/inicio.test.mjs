// Inicio nuevo del panel: «n.ª vez», «Pendiente ahora», últimos movimientos y datos del mes,
// con una base de datos Postgres real en memoria (PGlite)
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as FIN from '../lib/finanzas/servicio.js'
import * as C from '../lib/finanzas/calculos.js'
import * as I from '../lib/admin/inicio.js'
import { vistaAdmin } from '../lib/admin/vista.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

const HOY = fechaMadrid(new Date())
let n = 0
const email = () => `ini${++n}@example.com`
const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  const paso = dias < 0 ? -1 : 1
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, paso)
  usados.add(f)
  return f
}

const base = { actividad: 'Fotos', fondos: 'no', equipo: [] }

test('n.ª vez: junta las reservas por correo o por teléfono, también las de Calendly', async () => {
  const correo = email()
  await S.crearReservaManual({ ...base, fecha: await laborable(-40), desde: '10:00', hasta: '12:00', nombre: 'Vera', apellidos: 'Sol', email: correo, telefono: '611222333', origen: 'calendly', pagoEstado: 'pagado', metodoPago: 'stripe' })
  await S.crearReservaManual({ ...base, fecha: await laborable(-20), desde: '10:00', hasta: '12:00', nombre: 'Vera', apellidos: 'Sol', email: correo.toUpperCase(), telefono: '', origen: 'calendly', pagoEstado: 'pagado', metodoPago: 'stripe' })
  // El mismo correo y el teléfono escrito de otra forma: cuenta las tres
  const tercera = await S.crearReservaManual({ ...base, fecha: await laborable(5), desde: '16:00', hasta: '18:00', nombre: 'Vera', apellidos: 'Sol', email: correo, telefono: '+34 611 222 333' })
  // Otro correo, pero el mismo teléfono: cuenta las que tienen ese teléfono (la 2.ª no lo tiene)
  const cuarta = await S.crearReservaManual({ ...base, fecha: await laborable(7), desde: '16:00', hasta: '18:00', nombre: 'Vera', apellidos: 'Sol', email: email(), telefono: '+34611222333' })
  const nueva = await S.crearReservaManual({ ...base, fecha: await laborable(6), desde: '16:00', hasta: '18:00', nombre: 'Otra', apellidos: 'Persona', email: email(), telefono: '699000111' })
  const veces = await I.vecesDeReservas([vistaAdmin(tercera), vistaAdmin(cuarta), vistaAdmin(nueva)])
  assert.equal(veces.get(tercera.id), 3)
  assert.equal(veces.get(cuarta.id), 3)
  assert.equal(veces.get(nueva.id), 1)
})

test('Pendiente ahora: por cobrar (cuotas sin pagar con impago y reservas sin pagar) y miembros por resolver', async () => {
  // Reserva hecha a mano, sin pagar, de dentro de unos días
  const r = await S.crearReservaManual({ ...base, fecha: await laborable(3), desde: '10:00', hasta: '14:00', nombre: 'Lidia', apellidos: 'Mas Climent', email: email(), telefono: '600123123' })
  // Miembro sin cobro automático con la cuota del periodo sin pagar desde hace días
  const { suscripcion: sus } = await SUS.crearSuscripcion({ plan: 'creator', nombre: 'Irene', apellidos: 'Campos Mora', email: email(), telefono: '600999888', fechaInicio: sumarDias(HOY, -6), fianza: { estado: 'sin_fianza' } })
  await query('UPDATE suscripciones SET fianza_limite = $2::date WHERE id = $1', [sus.id, sumarDias(HOY, -3)])
  const p = await I.pendienteAhora({ hoy: HOY, tareas: [{ tipo: 'fianza_cobrar', urgente: true, suscripcionId: sus.id, texto: 'x' }, { tipo: 'cuota', suscripcionId: sus.id, texto: 'y' }] })
  const reserva = p.porCobrar.items.find((x) => x.clave === `r${r.id}`)
  assert.ok(reserva, 'la reserva sin pagar sale en Por cobrar')
  assert.equal(reserva.titulo, 'Lidia Mas')
  assert.match(reserva.detalle, /sin pagar$/)
  assert.equal(reserva.telefono, '600123123')
  const cuota = p.porCobrar.items.find((x) => x.tipo === 'cuota' && x.enlace === `/admin/miembros/${sus.id}`)
  assert.ok(cuota, 'la cuota sin pagar sale en Por cobrar')
  assert.equal(cuota.impago, true)
  assert.equal(cuota.titulo, 'Irene Campos')
  // Las cuotas con impago van primero
  assert.equal(p.porCobrar.items[0].impago, true)
  assert.equal(p.porCobrar.totalCent, p.porCobrar.items.reduce((a, x) => a + x.importeCent, 0))
  // Por resolver: solo lo que no es dinero (la tarea «cuota» no sale)
  assert.equal(p.porResolver.items.length, 1)
  assert.match(p.porResolver.items[0].detalle, /^Fianza fuera de plazo · acabó el /)
  assert.equal(p.porResolver.items[0].telefono, '600999888')
  assert.equal(p.porResolver.urgentes, 1)
})

test('Por cobrar: con cobro automático, la cuota del día que se está cobrando no sale', async () => {
  const { suscripcion: sus } = await SUS.crearSuscripcion({ plan: 'starter', nombre: 'Auto', email: email(), fechaInicio: HOY, fianza: { estado: 'sin_fianza' } })
  await query(`UPDATE suscripciones SET cobro_auto = true, tarjeta_ref = 'ref-prueba' WHERE id = $1`, [sus.id])
  let p = await I.pendienteAhora({ hoy: HOY })
  assert.equal(p.porCobrar.items.some((x) => x.enlace === `/admin/miembros/${sus.id}`), false)
  // Si el banco la rechaza, sí sale (y no puede usar el estudio)
  await query(`UPDATE cuotas SET cobro_estado = 'rechazado', cobro_proximo = $2::date WHERE suscripcion_id = $1`, [sus.id, sumarDias(HOY, 1)])
  p = await I.pendienteAhora({ hoy: HOY })
  const c = p.porCobrar.items.find((x) => x.enlace === `/admin/miembros/${sus.id}`)
  assert.ok(c)
  assert.equal(c.impago, true)
  assert.match(c.detalle, /^Cuota Starter rechazada · reintento el /)
})

test('últimos movimientos: cobros y gastos hasta hoy, del más nuevo al más viejo, con IVA', async () => {
  const cat = (await query(`SELECT id FROM gasto_categorias WHERE clave = 'aquaservice'`)).rows[0].id
  await FIN.crearGasto({ fecha: HOY, categoriaId: cat, concepto: 'Aquaservice de prueba', tipoFactura: 'nif', ivaPct: 21, importe: '32,00', metodoPago: 'tarjeta' }, { hoy: HOY })
  const ult = await I.ultimosMovimientos({ hoy: HOY, n: 50 })
  assert.ok(ult.length > 0)
  assert.ok(ult.every((m) => m.fecha <= HOY))
  for (let i = 1; i < ult.length; i++) assert.ok(ult[i - 1].fecha >= ult[i].fecha)
  const g = ult.find((m) => m.concepto === 'Aquaservice de prueba')
  assert.ok(g)
  assert.equal(g.importeCent, -3200)
  assert.equal(g.entra, false)
  assert.equal(g.categoria.length > 0, true)
})

test('datos del Inicio: campos nuevos del mes de hoy', async () => {
  const periodo = C.periodoActual('mes', HOY)
  const d = await I.datosInicio({ periodo, comparar: 'anterior' })
  assert.ok(Array.isArray(d.porCobrar.items))
  assert.ok(Array.isArray(d.porResolver.items))
  assert.equal(d.graficoAnio.length, 12)
  assert.ok(d.graficoAnio.every((m) => m.mes.startsWith(HOY.slice(0, 4))))
  assert.ok(d.ivaHoy && d.ivaHoy.trimestre === C.trimestreDe(HOY))
  assert.ok('compHoras' in d.kpis.ocupacion)
  assert.ok(Array.isArray(d.categorias))
  for (let i = 1; i < d.categorias.length; i++) assert.ok(d.categorias[i - 1].costeCent >= d.categorias[i].costeCent)
  assert.ok(Array.isArray(d.ultimos) && d.ultimos.length <= 6)
  assert.ok(Array.isArray(d.otrosAvisos))
  // De un mes pasado, el IVA a apartar sigue siendo el del trimestre de hoy
  const pasado = C.leerPeriodo(C.sumarMesesMes(C.mesDe(HOY), -5), HOY)
  const dp = await I.datosInicio({ periodo: pasado, comparar: 'anterior' })
  assert.equal(dp.ivaHoy.trimestre, C.trimestreDe(HOY))
})
