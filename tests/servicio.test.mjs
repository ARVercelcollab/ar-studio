// Pruebas con una base de datos Postgres real en memoria (PGlite)
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import { validarReserva } from '../lib/reservas/validacion.js'
import { fechaMadrid, horaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'
import { simulado, firmaSimulada } from '../lib/pagos/simulado.js'
import { recibirResultado, empezarReserva } from '../lib/reservas/flujo.js'

after(() => cerrarDb())

// Días distintos para cada prueba (laborables y no festivos), a unas semanas vista,
// para que las pruebas no se pisen ni caduquen con el tiempo
const usados = new Set()
async function diaLibre(desdeHoy, quiere = 'laborable') {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const festivos = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(fechaMadrid(new Date()), desdeHoy)
  for (;;) {
    const finde = [0, 6].includes(diaSemana(f))
    const vale = quiere === 'sabado' ? diaSemana(f) === 6 : !finde && !festivos.has(f)
    if (vale && !usados.has(f)) break
    f = sumarDias(f, 1)
  }
  usados.add(f)
  return f
}
const laborable = (d) => diaLibre(d)
const sabado = (d) => diaLibre(d, 'sabado')

const CLIENTE = {
  nombre: 'Lucía',
  apellidos: 'Prueba Gómez',
  email: 'lucia@example.com',
  telefono: '+34 600 000 000',
  actividad: 'Fotos',
  fondos: 'no',
  equipo: ['proyector'],
  aceptaCondiciones: true,
}

function datos(extra) {
  const v = validarReserva({ ...CLIENTE, ...extra })
  assert.ok(v.ok, JSON.stringify(v.errores))
  return v.datos
}

test('la validación pide lo necesario', () => {
  const v = validarReserva({ fecha: '2026-13-01', hora: '9:00', horas: 5 })
  assert.equal(v.ok, false)
  for (const k of ['fecha', 'hora', 'horas', 'aceptaCondiciones', 'nombre', 'email', 'telefono', 'actividad']) assert.ok(v.errores[k], k)
  const f = validarReserva({ ...CLIENTE, fecha: '2026-12-02', hora: '10:00', horas: 2, quiereFactura: true, factura: { nombre: 'X SL' } })
  assert.ok(f.errores.facturaNif && f.errores.facturaDireccion)
})

test('reserva, pago y confirmación; la misma hora no se puede volver a coger', async () => {
  const fecha = await laborable(20)
  const { reserva, pago } = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2 }), { proveedor: 'simulado' })
  assert.equal(reserva.estado, 'pendiente')
  assert.equal(reserva.precioCent, 9680)
  assert.match(pago.pedido, /^\d{12}$/)

  // Mientras paga, la hora está guardada para ella
  await assert.rejects(S.crearReservaWeb(datos({ fecha, hora: '11:00', horas: 2 }), { proveedor: 'simulado' }), { codigo: 'ocupada' })
  const horas = await S.consultarHoras({ fecha, horas: 2 })
  assert.ok(!horas.horas.includes('10:00'))
  assert.ok(horas.horas.includes('12:30'))

  const r1 = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: pago.pedido, pagado: true, importeCent: 9680, codigo: '0000' })
  assert.equal(r1.aviso, 'confirmada')
  assert.equal(r1.reserva.estado, 'confirmada')
  assert.equal(r1.reserva.pagoEstado, 'pagado')
  // El TPV avisa dos veces (notificación y vuelta): la segunda no cambia nada
  const r2 = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: pago.pedido, pagado: true, importeCent: 9680 })
  assert.equal(r2.aviso, null)
  // Un aviso falso de otro TPV se rechaza
  await assert.rejects(S.registrarResultadoPago({ proveedor: 'redsys', pedido: pago.pedido, pagado: true }), { codigo: 'proveedor' })
})

test('si no paga a tiempo, la hora se libera; si paga tarde y sigue libre, se confirma', async () => {
  const fecha = await laborable(22)
  const { reserva, pago } = await S.crearReservaWeb(datos({ fecha, hora: '16:00', horas: 3 }), { proveedor: 'simulado' })
  await query(`UPDATE reservas SET expira_en = now() - interval '1 minute' WHERE id = $1`, [reserva.id])
  const horas = await S.consultarHoras({ fecha, horas: 3 })
  assert.ok(horas.horas.includes('16:00'))
  const r = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: pago.pedido, pagado: true, importeCent: 14520 })
  assert.equal(r.aviso, 'confirmada')
})

test('si paga tarde y otra persona ya cogió la hora, queda en conflicto', async () => {
  const fecha = await laborable(24)
  const a = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2 }), { proveedor: 'simulado' })
  await query(`UPDATE reservas SET expira_en = now() - interval '1 minute' WHERE id = $1`, [a.reserva.id])
  const b = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2, email: 'otra@example.com' }), { proveedor: 'simulado' })
  assert.equal(b.reserva.estado, 'pendiente')
  const r = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: a.pago.pedido, pagado: true, importeCent: 9680 })
  assert.equal(r.aviso, 'conflicto')
  assert.equal(r.reserva.estado, 'conflicto')
  // El reintento de la primera ya no puede coger la hora
  await assert.rejects(S.reintentarPago(a.reserva.token, { proveedor: 'simulado' }), { codigo: 'pagada' })
})

test('un pago fallido deja reintentar con un pedido nuevo', async () => {
  const fecha = await laborable(26)
  const { reserva, pago } = await S.crearReservaWeb(datos({ fecha, hora: '09:00', horas: 4 }), { proveedor: 'simulado' })
  const f = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: pago.pedido, pagado: false, codigo: '0190' })
  assert.equal(f.aviso, 'fallido')
  const otra = await S.reintentarPago(reserva.token, { proveedor: 'simulado' })
  assert.notEqual(otra.pago.pedido, pago.pedido)
  const ok = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: otra.pago.pedido, pagado: true, importeCent: 18392 })
  assert.equal(ok.aviso, 'confirmada')
  // Un cobro de más (el primer pedido llega pagado después) se marca como duplicado
  const dup = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: pago.pedido, pagado: true, importeCent: 18392 })
  assert.equal(dup.aviso, 'duplicado')
})

test('los fines de semana se cobran como tales y no admiten 2 h', async () => {
  const fecha = await sabado(30)
  await assert.rejects(S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2 }), { proveedor: 'simulado' }), { codigo: 'duracion' })
  const { reserva } = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 4 }), { proveedor: 'simulado' })
  assert.equal(reserva.tipoDia, 'finde')
  assert.equal(reserva.precioCent, 22748)
})

test('los festivos se tratan como fin de semana', async () => {
  const fecha = await laborable(40)
  await S.guardarFestivo({ fecha, nombre: 'Festivo de prueba' })
  const h = await S.consultarHoras({ fecha, horas: 2 })
  assert.equal(h.tipoDia, 'finde')
  assert.deepEqual(h.horas, [])
  await S.borrarFestivo(fecha)
  assert.equal((await S.consultarHoras({ fecha, horas: 2 })).tipoDia, 'laborable')
})

test('panel: reserva manual, bloqueo, mover, cobrar a mano y cancelar', async () => {
  const fecha = await laborable(45)
  const manual = await S.crearReservaManual({ ...CLIENTE, fecha, hora: '10:00', horas: 2, pagoEstado: 'pendiente', notasInternas: 'Pagará por Bizum' })
  assert.equal(manual.estado, 'confirmada')
  assert.equal(manual.pagoEstado, 'pendiente')
  assert.equal(manual.precioCent, 9680)

  await assert.rejects(S.crearBloqueo({ fecha, desde: '11:00', hasta: '13:00', motivo: 'Grabación' }), { codigo: 'ocupada' })
  await S.crearBloqueo({ fecha, desde: '15:00', hasta: '18:00', motivo: 'Grabación propia' })
  const h = await S.consultarHoras({ fecha, horas: 2 })
  assert.ok(!h.horas.includes('15:00') && !h.horas.includes('14:00'))
  assert.ok(h.horas.includes('18:00'))

  await assert.rejects(S.reprogramar(manual.id, { fecha, hora: '16:00' }), { codigo: 'ocupada' })
  const movida = await S.reprogramar(manual.id, { fecha, hora: '19:00' })
  assert.equal(horaMadrid(movida.inicio), '19:00')

  const pagada = await S.marcarPagada(manual.id, { metodo: 'bizum' })
  assert.equal(pagada.pagoEstado, 'pagado')
  assert.equal(pagada.metodoPago, 'bizum')

  const cancelada = await S.cancelar(manual.id, { motivo: 'Lo pide la clienta', reembolsoCent: 4840 })
  assert.equal(cancelada.estado, 'cancelada')
  assert.equal(cancelada.pagoEstado, 'reembolsado_parcial')
  // La hora queda libre otra vez
  assert.ok((await S.consultarHoras({ fecha, horas: 2 })).horas.includes('19:00'))
  const ev = await S.eventosDeReserva(manual.id)
  assert.deepEqual(ev.map((e) => e.tipo), ['creada', 'movida', 'pagada_a_mano', 'cancelada'])
})

test('la base de datos impide solapes aunque se salten las comprobaciones', async () => {
  const fecha = await laborable(50)
  await S.crearReservaManual({ ...CLIENTE, fecha, hora: '10:00', horas: 2 })
  await assert.rejects(
    query(`INSERT INTO reservas (codigo, token, estado, inicio, fin, bloqueo_hasta, duracion_horas, tipo_dia, precio_cent, nombre, email)
           SELECT 'AR-X', 'tok-x', 'confirmada', inicio + interval '1 hour', fin + interval '1 hour', bloqueo_hasta + interval '1 hour', 2, 'laborable', 0, 'x', 'x@x.es'
             FROM reservas WHERE estado = 'confirmada' AND inicio::date = $1::date LIMIT 1`, [fecha]),
    (e) => e.code === '23P01'
  )
})

test('flujo completo con el TPV simulado y correos guardados', async () => {
  const fecha = await laborable(55)
  const inicio = await empezarReserva(datos({ fecha, hora: '12:00', horas: 6 }), 'http://localhost:3000')
  assert.equal(inicio.pago.accion, '/pago-simulado')
  const { pedido, importe } = inicio.pago.campos
  // Una firma inventada no vale
  await assert.rejects(recibirResultado('simulado', { pedido, importe, resultado: 'ok', firma: 'falsa' }, 'http://localhost:3000'))
  const ok = await recibirResultado('simulado', { pedido, importe, resultado: 'ok', firma: firmaSimulada(pedido, importe, 'ok') }, 'http://localhost:3000')
  assert.equal(ok.aviso, 'confirmada')
  assert.equal(ok.reserva.precioCent, 27588)
  assert.ok(simulado)
})
