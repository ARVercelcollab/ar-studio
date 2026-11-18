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

test('revisión: un pago tardío nunca se pierde aunque otra retención caducada pise la hora', async () => {
  const fecha = await laborable(60)
  const a = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2 }), { proveedor: 'simulado' })
  await query(`UPDATE reservas SET expira_en = now() - interval '1 minute' WHERE id = $1`, [a.reserva.id])
  const b = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2, email: 'b@example.com' }), { proveedor: 'simulado' })
  // La de B también caduca, pero nadie la ha marcado aún como caducada
  await query(`UPDATE reservas SET expira_en = now() - interval '1 minute' WHERE id = $1`, [b.reserva.id])
  const r = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: a.pago.pedido, pagado: true, importeCent: 9680 })
  assert.equal(r.aviso, 'confirmada')
  assert.equal(r.reserva.pagoEstado, 'pagado')
  // Y si B paga ahora, queda apuntado como conflicto (no se pierde)
  const rb = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: b.pago.pedido, pagado: true, importeCent: 9680 })
  assert.equal(rb.aviso, 'conflicto')
  assert.equal(rb.reserva.pagoEstado, 'pagado')
})

test('revisión: no se puede alargar una retención sin fin ni acaparar horas', async () => {
  const fecha = await laborable(62)
  const { reserva } = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2 }), { proveedor: 'simulado', huella: 'h1' })
  for (let i = 0; i < 3; i++) await S.reintentarPago(reserva.token, { proveedor: 'simulado' })
  await assert.rejects(S.reintentarPago(reserva.token, { proveedor: 'simulado' }), { codigo: 'intentos' })
  // Desde la misma conexión, con correos inventados, no se pueden guardar más de 2 horas
  await S.crearReservaWeb(datos({ fecha, hora: '15:00', horas: 2, email: 'otro1@example.com' }), { proveedor: 'simulado', huella: 'h1' })
  await assert.rejects(S.crearReservaWeb(datos({ fecha, hora: '18:00', horas: 2, email: 'otro2@example.com' }), { proveedor: 'simulado', huella: 'h1' }), { codigo: 'limite' })
  // Otra persona sí puede
  await S.crearReservaWeb(datos({ fecha, hora: '18:00', horas: 2 }), { proveedor: 'simulado', huella: 'h2' })
})

test('revisión: si el cliente vuelve atrás desde el banco y reserva de nuevo, su hora anterior se suelta', async () => {
  const fecha = await laborable(63)
  const primera = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2, email: 'vuelve@example.com' }), { proveedor: 'simulado', huella: 'h3' })
  // Misma persona, misma hora: antes salía ocupada durante 20 minutos
  const segunda = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2, email: 'vuelve@example.com' }), { proveedor: 'simulado', huella: 'h3' })
  assert.notEqual(segunda.reserva.id, primera.reserva.id)
  assert.equal((await S.reservaPorToken(primera.reserva.token)).estado, 'caducada')
})

test('revisión: una reserva en conflicto ocupa su hora y se resuelve moviéndola; una cancelada pagada se reactiva', async () => {
  const fecha = await laborable(64)
  const a = await S.crearReservaWeb(datos({ fecha, hora: '10:00', horas: 2 }), { proveedor: 'simulado' })
  // Importe que no cuadra -> conflicto, pero la hora sigue siendo suya
  const r = await S.registrarResultadoPago({ proveedor: 'simulado', pedido: a.pago.pedido, pagado: true, importeCent: 1 })
  assert.equal(r.aviso, 'conflicto')
  assert.ok(!(await S.consultarHoras({ fecha, horas: 2 })).horas.includes('10:00'))
  await assert.rejects(S.crearBloqueo({ fecha, desde: '10:00', hasta: '11:00' }), { codigo: 'ocupada' })
  const ok = await S.reprogramar(a.reserva.id, { fecha, hora: '10:00' })
  assert.equal(ok.estado, 'confirmada')

  const c = await S.cancelar(a.reserva.id, { motivo: 'prueba' })
  assert.equal(c.estado, 'cancelada')
  const re = await S.reactivar(a.reserva.id)
  assert.equal(re.estado, 'confirmada')
})

test('revisión: con la base marcada como de producción, un TPV de pruebas no confirma nada', async () => {
  const { comprobarProveedor, proveedorPorId } = await import('../lib/pagos/index.js')
  await query(`INSERT INTO ajustes (clave, valor) VALUES ('entorno', 'produccion')`)
  try {
    await assert.rejects(comprobarProveedor(proveedorPorId('simulado')), /producción/)
  } finally {
    await query(`DELETE FROM ajustes WHERE clave = 'entorno'`)
  }
  await comprobarProveedor(proveedorPorId('simulado'))
  // Una rama de Neon copia la marca, pero con el servidor de producción: en la rama no cuenta
  await query(`INSERT INTO ajustes (clave, valor) VALUES ('entorno', 'produccion:ep-produccion.neon.tech')`)
  try {
    await comprobarProveedor(proveedorPorId('simulado'))
  } finally {
    await query(`DELETE FROM ajustes WHERE clave = 'entorno'`)
  }
})

test('facturas: numeración correlativa, una por reserva, desglose de IVA y PDF', async () => {
  process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
  process.env.FACTURA_EMISOR_NIF = 'X0000000T'
  process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
  process.env.FACTURA_SERIE = 'AR-T'
  const F = await import('../lib/facturas/servicio.js')
  const { pdfFactura } = await import('../lib/facturas/pdf.js')
  assert.deepEqual(F.desglose(9680), { baseCent: 8000, ivaCent: 1680, totalCent: 9680 })
  assert.deepEqual(F.desglose(48400), { baseCent: 40000, ivaCent: 8400, totalCent: 48400 })

  const fecha = await laborable(66)
  const sinPagar = await S.crearReservaManual({ ...CLIENTE, fecha, hora: '10:00', horas: 2 })
  await assert.rejects(F.emitirFactura(sinPagar.id, { nombre: 'X', nif: 'B12345678', direccion: 'Y' }), { codigo: 'sin_pagar' })

  const pagada = await S.crearReservaManual({ ...CLIENTE, fecha, hora: '15:00', horas: 3, pagoEstado: 'pagado', metodoPago: 'bizum' })
  await assert.rejects(F.emitirFactura(pagada.id), { codigo: 'datos' })
  const a = await F.emitirFactura(pagada.id, { nombre: 'Estudio Cliente SL', nif: 'b12345678', direccion: 'Avenida del Puerto 1, 46021 València' })
  assert.equal(a.nueva, true)
  assert.match(a.factura.codigo, /^AR-T-\d{4}-001$/)
  assert.equal(a.factura.baseCent, 12000)
  assert.equal(a.factura.ivaCent, 2520)
  assert.equal(a.factura.cliente.nif, 'B12345678')
  assert.equal(a.factura.lineas[0].cantidad, '3 h')
  assert.equal(a.factura.lineas[0].precioUnitarioCent, 4000)
  // Pedirla otra vez devuelve la misma
  const otra = await F.emitirFactura(pagada.id)
  assert.equal(otra.nueva, false)
  assert.equal(otra.factura.codigo, a.factura.codigo)

  const segunda = await S.crearReservaManual({ ...CLIENTE, nombre: 'Сергей', fecha, hora: '19:00', horas: 2, pagoEstado: 'pagado' })
  const b = await F.emitirFactura(segunda.id, { nombre: 'Сергей Ñoño', nif: 'Y1234567X', direccion: 'Calle 2' })
  assert.match(b.factura.codigo, /-002$/)

  // Nunca de una reserva devuelta
  const devuelta = await S.crearReservaManual({ ...CLIENTE, fecha, hora: '12:30', horas: 1, precioCent: 5000, pagoEstado: 'pagado' })
  await S.cancelar(devuelta.id, { motivo: 'prueba', reembolsoCent: 5000 })
  await assert.rejects(F.emitirFactura(devuelta.id, { nombre: 'X SL', nif: 'B12345678', direccion: 'Y' }), { codigo: 'devuelta' })

  const pdf = await pdfFactura(b.factura)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.length > 5000)
})

test('panel: reservas a mano con desde-hasta y medias horas', async () => {
  const fecha = await laborable(70)
  await assert.rejects(S.crearReservaManual({ ...CLIENTE, fecha, desde: '10:00', hasta: '12:30' }), { codigo: 'precio' })
  const r = await S.crearReservaManual({ ...CLIENTE, fecha, desde: '10:00', hasta: '12:30', precioCent: 12100 })
  assert.equal(r.duracionHoras, 2.5)
  assert.equal(horaMadrid(r.fin), '12:30')
  // Con duración de tarifa, el precio sale solo
  const t = await S.crearReservaManual({ ...CLIENTE, fecha, desde: '16:00', hasta: '19:00' })
  assert.equal(t.precioCent, 14520)
  await assert.rejects(S.crearReservaManual({ ...CLIENTE, fecha, desde: '20:00', hasta: '19:00' }), { codigo: 'horas' })
  await assert.rejects(S.crearReservaManual({ ...CLIENTE, fecha, desde: '20:00', hasta: '20:10' }), { codigo: 'horas' })
  const movida = await S.reprogramar(r.id, { fecha, desde: '09:00', hasta: '10:30' })
  assert.equal(movida.duracionHoras, 1.5)
  const { textoDuracion } = await import('../lib/reservas/config.js')
  assert.equal(textoDuracion(2.5), '2 h 30 min')
  assert.equal(textoDuracion(2), '2 horas')
})
