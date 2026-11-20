// Suscripciones con una base de datos Postgres real en memoria (PGlite)
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-P'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-PS'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as F from '../lib/facturas/servicio.js'
import { validarReserva } from '../lib/reservas/validacion.js'
import { fechaMadrid, sumarDias, diaSemana, madridAInstante } from '../lib/reservas/tiempo.js'
import { periodoNumero } from '../lib/suscripciones/reglas.js'

after(() => cerrarDb())

const HOY = fechaMadrid(new Date())
let n = 0
const email = () => `miembro${++n}@example.com`

// Día laborable, no festivo y sin usar por otra prueba (el estudio es uno: no pueden coincidir)
const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}

async function alta(extra = {}) {
  const { suscripcion } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Ana', apellidos: 'Prueba', email: email(), telefono: '600000000',
    fechaInicio: HOY, mesPrueba: true, metodoHabitual: 'transferencia',
    condiciones: { cuotaCent: 14900, horasPeriodo: 8, duracionesH: [4], maxSesiones: 2 },
    fianza: { estado: 'cobrada', metodo: 'transferencia', fecha: HOY },
    ...extra,
  })
  return suscripcion
}

test('restricciones de la base de datos', async () => {
  await assert.rejects(
    query(`INSERT INTO reservas (codigo, token, origen, estado, inicio, fin, bloqueo_hasta, duracion_horas, tipo_dia, precio_cent, nombre, email)
           VALUES ('AR-Z1', 'tok-z1', 'plan', 'confirmada', now() + interval '100 days', now() + interval '100 days 4 hours',
                   now() + interval '100 days 4 hours 30 minutes', 4, 'laborable', 0, 'x', 'x@x.es')`),
    (e) => e.code === '23514'
  )
  const sus = await alta()
  const fecha = await laborable(5)
  const { reserva } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '18:00' })
  await assert.rejects(query('UPDATE reservas SET cuenta_como_usada = true WHERE id = $1', [reserva.id]), (e) => e.code === '23514')
  // La agenda y la búsqueda funcionan con el cruce de tablas
  assert.ok((await S.buscarReservas('Ana')).length >= 1)
  const lista = await S.listarReservas({ desde: new Date(), hasta: new Date(Date.now() + 40 * 86400000) })
  assert.equal(lista.find((r) => r.id === reserva.id).planSuscripcion, 'starter')
})

test('alta: copia el plan con sus cambios, crea la primera cuota y avisa del mismo correo', async () => {
  const correo = email()
  const { suscripcion: s } = await SUS.crearSuscripcion({
    plan: 'creator', nombre: 'Bea', email: correo, fechaInicio: HOY,
    primeraPagada: { metodo: 'bizum', fecha: HOY }, fianza: { estado: 'pendiente' },
    condiciones: { cuotaCent: 18000 },
  })
  assert.equal(s.cuotaCent, 18000)
  assert.equal(s.horasPeriodo, 8)
  assert.deepEqual(s.duracionesH, [4, 8])
  assert.equal(s.franjaDesde, '09:00')
  const ficha = await SUS.fichaSuscripcion(s.id)
  assert.equal(ficha.cuotas[0].estado, 'pagada')
  assert.equal(ficha.cuotas[0].importeCent, 18000)
  await assert.rejects(SUS.crearSuscripcion({ plan: 'pro', nombre: 'Bea', email: correo, fechaInicio: HOY }), { codigo: 'avisos' })
  const otra = await SUS.crearSuscripcion({ plan: 'pro', nombre: 'Bea', email: correo, fechaInicio: HOY }, { confirmado: true })
  assert.ok(otra.suscripcion.id)
  await assert.rejects(SUS.crearSuscripcion({ plan: 'pro', nombre: 'X', email: email(), fechaInicio: HOY, condiciones: { horasPeriodo: 0 } }), { codigo: 'condiciones' })
})

test('las cuotas se crean solas una vez y no después de la baja', async () => {
  const sus = await alta({ fechaInicio: sumarDias(HOY, -70), mesPrueba: false })
  await SUS.asegurarCuotas(query, sus, HOY)
  await SUS.asegurarCuotas(query, sus, HOY)
  const { rows } = await query('SELECT count(*)::int AS n FROM cuotas WHERE suscripcion_id = $1', [sus.id])
  assert.ok(rows[0].n >= 3)
  const futura = await SUS.fichaSuscripcion(sus.id)
  assert.equal(new Set(futura.cuotas.map((c) => c.periodo)).size, futura.cuotas.length)
})

test('sesión del plan: ocupa la agenda, gasta horas y bloquea la web', async () => {
  const sus = await alta()
  const fecha = await laborable(6)
  const { reserva, resumen } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '18:00' })
  assert.equal(reserva.origen, 'plan')
  assert.equal(reserva.horasPlan, 4)
  assert.equal(reserva.precioCent, 0)
  assert.equal(reserva.pagoEstado, 'pagado')
  assert.equal(resumen.restantes, 4)
  const libres = (await S.consultarHoras({ fecha, horas: 2 })).horas
  assert.ok(!libres.includes('14:00') && !libres.includes('18:00'))
  assert.ok(libres.includes('18:30'))
  const v = validarReserva({ nombre: 'W', apellidos: 'W', email: 'w@example.com', telefono: '600000000', actividad: 'Fotos', fondos: 'no', aceptaCondiciones: true, fecha, hora: '17:00', horas: 2 })
  await assert.rejects(S.crearReservaWeb(v.datos, { proveedor: 'simulado' }), { codigo: 'ocupada' })
})

test('avisos: hay que aceptarlos y quedan apuntados', async () => {
  const sus = await alta()
  const fecha = await laborable(7)
  // 13:00 a 17:00: fuera de su horario (14-20) y duración distinta
  await assert.rejects(SUS.crearSesionPlan(sus.id, { fecha, desde: '13:00', hasta: '17:00', horasPlan: 4, precioExtraCent: 0 }), (e) => {
    assert.equal(e.codigo, 'avisos')
    assert.deepEqual(e.datos.avisos.map((a) => a.codigo), ['franja'])
    return true
  })
  await assert.rejects(SUS.crearSesionPlan(sus.id, { fecha, desde: '13:00', hasta: '17:00', horasPlan: 4, avisosAceptados: ['otro'] }), { codigo: 'avisos' })
  const { reserva } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '13:00', hasta: '17:00', horasPlan: 4, avisosAceptados: ['franja'] })
  const ev = await S.eventosDeReserva(reserva.id)
  assert.deepEqual(ev[0].detalle.avisosAceptados, ['franja'])
})

test('horas aparte: precio obligatorio, 0 de regalo, pago y factura', async () => {
  const sus = await alta({ factura: { nombre: 'Ana Prueba SL', nif: 'B12345678', direccion: 'Calle 1, València' } })
  const fecha = await laborable(8)
  // 14:00 a 22:00 = 8 h: 6 h en su horario (14-20), 2 aparte (y duración distinta: aviso)
  await assert.rejects(SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '22:00', avisosAceptados: ['franja', 'duracion'] }), { codigo: 'precio' })
  const regalo = await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '16:00', horasPlan: 0, precioExtraCent: 0 })
  assert.equal(regalo.reserva.pagoEstado, 'pagado')
  assert.equal(regalo.reserva.metodoPago, 'plan')
  await assert.rejects(F.emitirFactura(regalo.reserva.id), { codigo: 'plan' })

  const fecha2 = await laborable(9)
  const conExtra = await SUS.crearSesionPlan(sus.id, { fecha: fecha2, desde: '14:00', hasta: '20:00', horasPlan: 4, precioExtraCent: 12100, avisosAceptados: ['duracion'] })
  assert.equal(conExtra.reserva.pagoEstado, 'pendiente')
  assert.equal(conExtra.reserva.horasPlan, 4)
  await S.marcarPagada(conExtra.reserva.id, { metodo: 'bizum' })
  const { factura } = await F.emitirFactura(conExtra.reserva.id)
  assert.match(factura.lineas[0].descripcion, /Horas aparte/)
  assert.equal(factura.lineas[0].cantidad, '2 h')
  assert.equal(factura.totalCent, 12100)
})

test('carrera: dos personas no gastan a la vez las últimas horas', async () => {
  const sus = await alta({ condiciones: { cuotaCent: 12900, horasPeriodo: 4, duracionesH: [4], maxSesiones: 1 } })
  const a = await laborable(10)
  const b = await laborable(12)
  const res = await Promise.allSettled([
    SUS.crearSesionPlan(sus.id, { fecha: a, desde: '14:00', hasta: '18:00' }),
    SUS.crearSesionPlan(sus.id, { fecha: b, desde: '14:00', hasta: '18:00' }),
  ])
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(res.find((r) => r.status === 'rejected').reason.codigo, 'precio')
})

test('cancelar: con menos de 48 h cuenta como usada; reactivar no vale', async () => {
  const sus = await alta()
  const fecha = await laborable(5)
  const { reserva } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '18:00' })
  // Con tiempo: no cuenta
  const c1 = await SUS.cancelarSesionPlan(reserva.id, { motivo: 'prueba' })
  assert.equal(c1.cuentaComoUsada, false)
  await assert.rejects(S.reactivar(reserva.id), { codigo: 'plan' })
  // Con menos de 48 h (simulado con "ahora"): cuenta
  const { reserva: r2 } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '18:00' })
  const tarde = new Date(madridAInstante(fecha, '14:00').getTime() - 20 * 3600000)
  const c2 = await SUS.cancelarSesionPlan(r2.id, { motivo: 'tarde' }, { ahora: tarde })
  assert.equal(c2.cuentaComoUsada, true)
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.equal(ficha.resumenActual.usadas, 4)
  assert.equal(ficha.resumenActual.canceladasTarde, 4)
  // El estudio puede perdonarla
  const { reserva: r3 } = await SUS.crearSesionPlan(sus.id, { fecha: await laborable(8), desde: '14:00', hasta: '18:00' })
  const c3 = await SUS.cancelarSesionPlan(r3.id, { motivo: 'culpa nuestra', cuentaComoUsada: false }, { ahora: new Date(r3.inicio.getTime() - 3600000) })
  assert.equal(c3.cuentaComoUsada, false)
  const ev = await S.eventosDeReserva(r3.id)
  assert.equal(ev.at(-1).detalle.excepcion, true)
})

test('mover: cambia de periodo, acorta en una sola vez y protege extras pagados', async () => {
  const sus = await alta({ mesPrueba: false })
  const fecha = await laborable(6)
  const { reserva } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '18:00' })
  await assert.rejects(S.reprogramar(reserva.id, { fecha, desde: '15:00', hasta: '19:00' }), { codigo: 'plan' })
  const corta = await SUS.moverSesionPlan(reserva.id, { fecha, desde: '14:00', hasta: '17:00', avisosAceptados: ['duracion'] })
  assert.equal(corta.duracionHoras, 3)
  assert.equal(corta.horasPlan, 3)
  // Al periodo siguiente
  const otroPeriodo = await laborable(34)
  const movida = await SUS.moverSesionPlan(reserva.id, { fecha: otroPeriodo, desde: '14:00', hasta: '18:00' })
  assert.equal(movida.horasPlan, 4)
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.equal(ficha.resumenActual.usadas, 0)

  const f2 = await laborable(9)
  const conExtra = await SUS.crearSesionPlan(sus.id, { fecha: f2, desde: '14:00', hasta: '20:00', horasPlan: 4, precioExtraCent: 12100, extraPagado: true, extraMetodo: 'bizum', avisosAceptados: ['duracion'] })
  await assert.rejects(SUS.moverSesionPlan(conExtra.reserva.id, { fecha: f2, desde: '14:00', hasta: '18:00' }), { codigo: 'pagada' })
  const misma = await SUS.moverSesionPlan(conExtra.reserva.id, { fecha: f2, desde: '13:30', hasta: '19:30', horasPlan: 4, avisosAceptados: ['duracion', 'franja'] })
  assert.equal(misma.precioCent, 12100)
  assert.equal(misma.pagoEstado, 'pagado')
})

test('baja: cancela lo de después, borra cuotas pendientes futuras y se puede deshacer', async () => {
  const sus = await alta({ mesPrueba: false, metodoHabitual: 'stripe', cobroExternoRef: 'sub_prueba' })
  assert.equal(sus.cobroExterno, 'stripe')
  const dentro = await laborable(5)
  const despues = await laborable(40)
  await SUS.crearSesionPlan(sus.id, { fecha: dentro, desde: '14:00', hasta: '18:00' })
  const { reserva: luego } = await SUS.crearSesionPlan(sus.id, { fecha: despues, desde: '14:00', hasta: '18:00', avisosAceptados: ['periodo_lejano'] })
  const ultimoDia = sumarDias(HOY, 29)
  await assert.rejects(SUS.darDeBaja(sus.id, { avisoEn: HOY, ultimoDia, cancelarSesiones: false }), { codigo: 'sesiones' })
  const r = await SUS.darDeBaja(sus.id, { avisoEn: HOY, ultimoDia, motivo: 'se muda' })
  assert.deepEqual(r.sesionesCanceladas, [luego.codigo])
  assert.equal(r.consecuencias.fianza, 'retener')
  const { rows } = await query(`SELECT count(*)::int AS n FROM cuotas WHERE suscripcion_id = $1 AND desde > $2::date`, [sus.id, ultimoDia])
  assert.equal(rows[0].n, 0)
  await assert.rejects(SUS.crearSesionPlan(sus.id, { fecha: despues, desde: '14:00', hasta: '18:00' }), { codigo: 'reglas' })
  const lista = await SUS.listarSuscripciones()
  assert.ok(lista.tareas.some((t) => t.tipo === 'cobro_externo' && t.suscripcionId === sus.id))
  await SUS.marcarCobroExternoCancelado(sus.id)
  await SUS.deshacerBaja(sus.id)
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.equal(ficha.sus.ultimoDia, null)
  assert.equal(ficha.sus.cobroExterno, null)
})

test('fianza: devolver hace falta la baja, retener pide nota, devolución parcial', async () => {
  const sus = await alta({ mesPrueba: false })
  await assert.rejects(SUS.resolverFianza(sus.id, { accion: 'devolver' }), { codigo: 'estado' })
  await SUS.darDeBaja(sus.id, { avisoEn: HOY, ultimoDia: sumarDias(HOY, 29) })
  await assert.rejects(SUS.resolverFianza(sus.id, { accion: 'retener' }), { codigo: 'nota' })
  await assert.rejects(SUS.resolverFianza(sus.id, { accion: 'devolver', importeCent: 5000 }), { codigo: 'nota' })
  const s = await SUS.resolverFianza(sus.id, { accion: 'devolver', importeCent: 5000, nota: 'mancha en el suelo' })
  assert.equal(s.fianzaEstado, 'devuelta')
  assert.equal(s.fianzaDevueltaCent, 5000)
})

test('cuotas: pagar una vez, no deshacer con factura, horas y pausa', async () => {
  const sus = await alta({ factura: { nombre: 'Ana Prueba SL', nif: 'B12345678', direccion: 'Calle 1, València' } })
  const ficha = await SUS.fichaSuscripcion(sus.id)
  const c1 = ficha.cuotas[0]
  await assert.rejects(F.emitirFacturaCuota(c1.id), { codigo: 'sin_pagar' })
  await SUS.marcarCuotaPagada(c1.id, { metodo: 'transferencia', referencia: 'TR-1' })
  await assert.rejects(SUS.marcarCuotaPagada(c1.id, { metodo: 'transferencia' }), { codigo: 'estado' })
  await assert.rejects(SUS.marcarCuotaPagada(c1.id, { metodo: 'transferencia', enlace: 'javascript:alert(1)' }), { codigo: 'enlace' })
  const reserva = await S.crearReservaManual({ nombre: 'X', email: 'x@example.com', fecha: await laborable(20), desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', factura: { nombre: 'X SL', nif: 'B87654321', direccion: 'Y' } })
  const fr = await F.emitirFactura(reserva.id)
  const fc = await F.emitirFacturaCuota(c1.id)
  assert.equal(Number(fc.factura.codigo.slice(-3)), Number(fr.factura.codigo.slice(-3)) + 1)
  assert.match(fc.factura.lineas[0].descripcion, /Suscripción mensual AR Studio · plan Starter/)
  assert.equal(fc.factura.totalCent, 14900)
  assert.equal((await F.emitirFacturaCuota(c1.id)).nueva, false)
  await assert.rejects(SUS.desmarcarCuota(c1.id), { codigo: 'factura' })

  const fecha = await laborable(5)
  await SUS.crearSesionPlan(sus.id, { fecha, desde: '14:00', hasta: '18:00' })
  await assert.rejects(SUS.editarCuota(c1.id, { horas: 2 }), { codigo: 'horas' })
  await SUS.editarCuota(c1.id, { horas: 10, nota: 'cortesía' })
  assert.equal((await SUS.fichaSuscripcion(sus.id)).resumenActual.horas, 10)

  const sinPagar = await alta({ fechaInicio: sumarDias(HOY, 3), mesPrueba: false })
  const cuota = (await SUS.fichaSuscripcion(sinPagar.id)).cuotas[0]
  await SUS.anularCuota(cuota.id, { pausa: true, nota: 'vacaciones' })
  const tras = await SUS.fichaSuscripcion(sinPagar.id)
  assert.equal(tras.cuotas[0].estado, 'anulada')
  assert.equal(tras.cuotas[0].horas, 0)
  await assert.rejects(F.emitirFacturaCuota(tras.cuotas[0].id), { codigo: 'sin_pagar' })
})

test('cobros automáticos (para el futuro webhook): idempotentes y por fecha', async () => {
  const sus = await alta({ mesPrueba: false, metodoHabitual: 'stripe', cobroExternoRef: 'sub_auto' })
  const r1 = await SUS.registrarCobroCuota({ proveedor: 'stripe', suscripcionRef: 'sub_auto', cobroRef: 'in_1', fecha: HOY, importeCent: 14900, enlace: 'https://pay.stripe.com/x' })
  assert.equal(r1.nuevo, true)
  assert.equal(r1.cuota.estado, 'pagada')
  assert.equal(r1.cuota.metodoPago, 'stripe')
  const r2 = await SUS.registrarCobroCuota({ proveedor: 'stripe', suscripcionRef: 'sub_auto', cobroRef: 'in_1', fecha: HOY })
  assert.equal(r2.nuevo, false)
  const r3 = await SUS.registrarCobroCuota({ proveedor: 'stripe', suscripcionRef: 'sub_auto', cobroRef: 'in_2', fecha: HOY, importeCent: 999 })
  assert.equal(r3.aviso, 'revisar')
})

test('borrar solo una suscripción sin movimientos; listado y opciones', async () => {
  const vacia = await alta()
  await SUS.borrarSuscripcion(vacia.id)
  await assert.rejects(SUS.fichaSuscripcion(vacia.id), { codigo: 'no_existe' })
  const usada = await alta()
  await SUS.crearSesionPlan(usada.id, { fecha: await laborable(5), desde: '14:00', hasta: '18:00' })
  await assert.rejects(SUS.borrarSuscripcion(usada.id), { codigo: 'movimientos' })
  const { filas, cifras } = await SUS.listarSuscripciones()
  assert.ok(filas.some((f) => f.id === usada.id && f.restantes === 4))
  assert.ok(cifras.activas >= 1)
  // Lo que enseña la lista y el tablero del panel
  const fila = filas.find((f) => f.id === usada.id)
  assert.equal(typeof fila.alMesCent, 'number')
  assert.ok(fila.alMesCent > 0)
  assert.equal(fila.impago, false)
  assert.equal(fila.proximoCobro, null) // sin cobro automático
  assert.ok('fianzaEstado' in fila && 'contratoEstado' in fila && 'tarjeta' in fila)
  assert.ok(cifras.cuotasAlMesCent >= fila.alMesCent)
  assert.equal(typeof cifras.fianzasPendientes, 'number')
  const ops = await SUS.opcionesParaReservar()
  assert.ok(ops.some((o) => o.id === usada.id && o.duracionPorDefecto === 4))
  const previa = await SUS.comprobarSesion(usada.id, { fecha: await laborable(6), desde: '14:00', hasta: '18:00' })
  assert.equal(previa.errores.length, 0)
  assert.ok(previa.linea.includes('del plan'))
  assert.ok(previa.huecos.includes('14:00'))
  const mal = await SUS.comprobarSesion(usada.id, { fecha: await laborable(6), desde: '18:00', hasta: '17:00' })
  assert.equal(mal.errores[0].codigo, 'horas')
})

// ---------- Arreglos de la revisión ----------


test('mover sin tocar el precio conserva el regalo y el precio pactado ya pagado', async () => {
  const sus = await alta({ mesPrueba: false })
  const f1 = await laborable(10)
  // 5 h con 4 del plan y 1 aparte de regalo
  const regalo = await SUS.crearSesionPlan(sus.id, { fecha: f1, desde: '14:00', hasta: '19:00', horasPlan: 4, precioExtraCent: 0, avisosAceptados: ['duracion'] })
  const movida = await SUS.moverSesionPlan(regalo.reserva.id, { fecha: f1, desde: '14:30', hasta: '19:30', horasPlan: 4, precioExtraCent: null, avisosAceptados: ['duracion'] })
  assert.equal(movida.precioCent, 0)
  assert.equal(movida.pagoEstado, 'pagado')
  assert.equal(movida.metodoPago, 'plan')
  assert.equal(movida.horasPlan, 4)

  const f2 = await laborable(11)
  const pactada = await SUS.crearSesionPlan(sus.id, { fecha: f2, desde: '14:00', hasta: '19:00', horasPlan: 4, precioExtraCent: 5000, extraPagado: true, extraMetodo: 'bizum', avisosAceptados: ['duracion'] })
  const otra = await SUS.moverSesionPlan(pactada.reserva.id, { fecha: f2, desde: '15:00', hasta: '20:00', horasPlan: 4, precioExtraCent: null, avisosAceptados: ['duracion'] })
  assert.equal(otra.precioCent, 5000)
  assert.equal(otra.pagoEstado, 'pagado')
  assert.equal(otra.metodoPago, 'bizum')
  // Si cambian las horas aparte hay que poner precio
  await assert.rejects(SUS.moverSesionPlan(regalo.reserva.id, { fecha: f1, desde: '14:30', hasta: '19:30', horasPlan: 3, precioExtraCent: null, avisosAceptados: ['duracion'] }), { codigo: 'precio' })
})

test('cambiar condiciones desde un periodo posterior no toca los de antes, y cada cuota guarda su plan', async () => {
  const sus = await alta({ mesPrueba: false, factura: { nombre: 'Ana Prueba SL', nif: 'B12345678', direccion: 'Calle 1, València' } })
  const c1 = (await SUS.fichaSuscripcion(sus.id)).cuotas[0]
  assert.equal(c1.plan, 'starter')
  await SUS.cambiarCondiciones(sus.id, { plan: 'pro', cuotaCent: 25000, horasPeriodo: 12, duracionesH: '4,5; 8', sesionMinH: 4, sesionMaxH: 8, maxSesiones: '' }, { desdePeriodo: 3 })
  await SUS.asegurarCuotasDeTodas(periodoNumero(sus, 3).desde)
  const { rows } = await query('SELECT periodo, importe_cent, horas::float AS horas, plan FROM cuotas WHERE suscripcion_id = $1 ORDER BY periodo', [sus.id])
  assert.deepEqual(rows.map((r) => [r.periodo, r.importe_cent, r.horas, r.plan]), [
    [1, 14900, 8, 'starter'],
    [2, 14900, 8, 'starter'],
    [3, 25000, 12, 'pro'],
  ])
  const despues = await SUS._cargarSuscripcion(query, sus.id)
  assert.deepEqual(despues.duracionesH, [4.5, 8])
  // La factura de la cuota 1 dice el plan que se pagó
  await SUS.marcarCuotaPagada(c1.id, { metodo: 'transferencia' })
  const { factura } = await F.emitirFacturaCuota(c1.id)
  assert.match(factura.lineas[0].descripcion, /plan Starter/)
})

test('duraciones con coma decimal', () => {
  assert.deepEqual(SUS.leerDuraciones('4,5; 8'), [4.5, 8])
  assert.deepEqual(SUS.leerDuraciones('4,5, 8'), [4.5, 8])
  assert.deepEqual(SUS.leerDuraciones('4,8'), [4, 8])
  assert.deepEqual(SUS.leerDuraciones('4 8'), [4, 8])
  assert.deepEqual(SUS.leerDuraciones('4,5,8'), [4, 5, 8])
  assert.deepEqual(SUS.leerDuraciones('4,25;6,75'), [4.25, 6.75])
})

test('Stripe: editar datos no reactiva un cobro ya cancelado y la misma sub_ no va en dos fichas', async () => {
  const a = await alta({ mesPrueba: false, metodoHabitual: 'stripe', cobroExternoRef: 'sub_repetida' })
  await assert.rejects(alta({ metodoHabitual: 'stripe', cobroExternoRef: 'sub_repetida' }), { codigo: 'cobroExternoRef', estadoHttp: 409 })
  const b = await alta({ metodoHabitual: 'stripe', cobroExternoRef: 'sub_otra' })
  await assert.rejects(SUS.editarSuscripcion(b.id, { metodoHabitual: 'stripe', cobroExternoRef: 'sub_repetida' }), { codigo: 'cobroExternoRef' })
  await SUS.marcarCobroExternoCancelado(a.id)
  const editada = await SUS.editarSuscripcion(a.id, { telefono: '611111111', metodoHabitual: 'stripe', cobroExternoRef: '' })
  assert.equal(editada.cobroExterno, null)
  assert.equal(editada.telefono, '611111111')
})

test('deshacer la baja recupera las cuotas que quitó (también una pausa)', async () => {
  const sus = await alta({ mesPrueba: false })
  await SUS.asegurarCuotasDeTodas(periodoNumero(sus, 3).desde)
  const { rows: c3 } = await query('SELECT id FROM cuotas WHERE suscripcion_id = $1 AND periodo = 3', [sus.id])
  await SUS.anularCuota(c3[0].id, { pausa: true, nota: 'pausa en verano' })
  await SUS.darDeBaja(sus.id, { avisoEn: HOY, ultimoDia: sumarDias(periodoNumero(sus, 2).desde, -1) })
  const { rows: tras } = await query('SELECT count(*)::int AS n FROM cuotas WHERE suscripcion_id = $1', [sus.id])
  assert.equal(tras[0].n, 1)
  await SUS.deshacerBaja(sus.id)
  const { rows } = await query('SELECT periodo, estado, horas::float AS horas, nota FROM cuotas WHERE suscripcion_id = $1 ORDER BY periodo', [sus.id])
  assert.deepEqual(rows.map((r) => [r.periodo, r.estado, r.horas, r.nota]), [
    [1, 'pendiente', 8, null],
    [2, 'pendiente', 8, null],
    [3, 'anulada', 0, 'pausa en verano'],
  ])
})

test('lista: en «Sin pagar» sale la cuota que se debe, no la del mes', async () => {
  const inicio = sumarDias(HOY, -40)
  const { suscripcion: sus } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Deudora', email: email(), fechaInicio: inicio, fianza: { estado: 'sin_fianza' },
  })
  await SUS.asegurarCuotasDeTodas(HOY)
  const ficha = await SUS.fichaSuscripcion(sus.id)
  const actual = ficha.cuotas.find((c) => c.periodo === ficha.periodoActual.numero)
  await SUS.marcarCuotaPagada(actual.id, { metodo: 'bizum' })
  const { filas } = await SUS.listarSuscripciones({ vista: 'sin_pagar' })
  const f = filas.find((x) => x.id === sus.id)
  assert.equal(f.cuota.chip, 'pagada')
  assert.equal(f.debe.chip, 'atrasada')
  assert.equal(f.debe.desde, inicio)
})

test('las reglas de reserva de cada periodo se quedan aunque se cambien desde el siguiente', async () => {
  const { suscripcion: sus } = await SUS.crearSuscripcion({ plan: 'creator', nombre: 'Cris', email: email(), fechaInicio: HOY, fianza: { estado: 'sin_fianza' } })
  await SUS.cambiarCondiciones(sus.id, { plan: 'starter', cuotaCent: 12900, horasPeriodo: 4, duracionesH: [4], sesionMinH: 4, sesionMaxH: 4, maxSesiones: 1, franjaDesde: '14:00', franjaHasta: '20:00' }, { desdePeriodo: 2 })
  // En el periodo 1 sigue con las de Creator: de 10 a 14 entra en su horario (9-20)
  // Solo se comprueba (no se reserva): vale cualquier día laborable de cada periodo
  const fest = new Set((await query('SELECT fecha::text AS fecha FROM festivos')).rows.map((r) => r.fecha))
  const entreSemana = (f) => { while ([0, 6].includes(diaSemana(f)) || fest.has(f)) f = sumarDias(f, 1); return f }
  const fecha = entreSemana(sumarDias(HOY, 7))
  const v = await SUS.comprobarSesion(sus.id, { fecha, desde: '10:00', hasta: '14:00' })
  assert.equal(v.periodo.numero, 1)
  assert.equal(v.horasPlan, 4)
  assert.equal(v.horasExtra, 0)
  assert.ok(!v.notas.some((n) => n.codigo === 'franja'))
  // En el periodo 2 ya van las de Starter
  const fecha2 = entreSemana(periodoNumero(sus, 2).desde)
  await SUS.asegurarCuotasDeTodas(fecha2)
  const v2 = await SUS.comprobarSesion(sus.id, { fecha: fecha2, desde: '10:00', hasta: '14:00' })
  assert.equal(v2.periodo.numero, 2)
  assert.equal(v2.horasPlan, 0)
})

test('Stripe: con el cobro cancelado, una sub_ nueva desde Datos lo vuelve a enlazar', async () => {
  const a = await alta({ mesPrueba: false, metodoHabitual: 'stripe', cobroExternoRef: 'sub_vieja_x' })
  await SUS.marcarCobroExternoCancelado(a.id)
  const e = await SUS.editarSuscripcion(a.id, { metodoHabitual: 'stripe', cobroExternoRef: 'sub_nueva_x' })
  assert.equal(e.cobroExterno, 'stripe')
  assert.equal(e.cobroExternoRef, 'sub_nueva_x')
})

test('deshacer la baja tras cambiar condiciones: las cuotas pendientes van con las de ahora', async () => {
  const sus = await alta({ mesPrueba: false })
  await SUS.asegurarCuotasDeTodas(periodoNumero(sus, 2).desde)
  await SUS.darDeBaja(sus.id, { avisoEn: HOY, ultimoDia: sumarDias(periodoNumero(sus, 2).desde, -1) })
  await SUS.cambiarCondiciones(sus.id, { cuotaCent: 9900 }, { desdePeriodo: 1 })
  await SUS.deshacerBaja(sus.id)
  const { rows } = await query('SELECT periodo, importe_cent FROM cuotas WHERE suscripcion_id = $1 ORDER BY periodo', [sus.id])
  assert.deepEqual(rows.map((r) => [r.periodo, r.importe_cent]), [[1, 9900], [2, 9900]])
})
