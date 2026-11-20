// «Añadir» con tus palabras: el intérprete de palabras clave (sin IA)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretar, leerFecha, leerHoras, leerImporte, leerMetodo, normalizar, categoriaDeGasto } from '../lib/admin/interprete.js'

// Viernes 20 de noviembre de 2026
const CTX = {
  hoy: '2026-11-20',
  categorias: [
    { id: 1, clave: 'aquaservice', nombre: 'Aquaservice (agua en garrafas)', grupo: 'variable', activa: true },
    { id: 2, clave: 'otros', nombre: 'Otros gastos', grupo: 'variable', activa: true },
    { id: 3, clave: 'material', nombre: 'Material del estudio', grupo: 'material', activa: true },
    { id: 4, clave: 'luz', nombre: 'Luz', grupo: 'variable', activa: true },
    { id: 5, clave: 'agua', nombre: 'Agua', grupo: 'variable', activa: true },
  ],
  miembros: [{ id: 7, nombre: 'Irene Campos Mora' }, { id: 8, nombre: 'Marta Soler Ruiz' }, { id: 9, nombre: 'Laura Gil Pons' }],
  clientes: [
    { nombre: 'Laura', apellidos: 'Ribera Vidal', email: 'laura@ejemplo.es', telefono: '600111222' },
    { nombre: 'Irene', apellidos: 'Campos Mora', email: 'irene@ejemplo.es', telefono: '600111204' },
    { nombre: 'Sara', apellidos: 'Torres Navarro', email: 'sara@ejemplo.es', telefono: '687410520' },
    { nombre: 'Sara', apellidos: 'Escrivá Sanchis', email: 'sara.e@ejemplo.es', telefono: '' },
  ],
  cuotas: [
    { id: 31, susId: 7, nombre: 'Irene Campos Mora', periodo: 2, desde: '2026-11-18', importeCent: 19900, cobroEstado: 'rechazado' },
    { id: 40, susId: 8, nombre: 'Marta Soler Ruiz', periodo: 4, desde: '2026-12-12', importeCent: 12900, cobroEstado: null },
  ],
  festivos: ['2026-12-08'],
}

test('fechas: hoy, mañana, días de la semana, con mes, sin mes, pasado', () => {
  const h = CTX.hoy
  assert.equal(leerFecha('hoy', h).fecha, '2026-11-20')
  assert.equal(leerFecha('manana', h).fecha, '2026-11-21')
  assert.equal(leerFecha('pasado manana', h).fecha, '2026-11-22')
  // «por la mañana» es una franja, no el día siguiente
  assert.equal(leerFecha('el sabado por la manana', h).fecha, '2026-11-21')
  assert.equal(leerFecha('manana por la manana', h).fecha, '2026-11-21')
  assert.equal(leerFecha('el lunes', h).fecha, '2026-11-23')
  assert.equal(leerFecha('el viernes', h).fecha, '2026-11-27', 'hoy es viernes: «el viernes» es el que viene')
  assert.equal(leerFecha('este viernes', h).fecha, '2026-11-20')
  assert.equal(leerFecha('el lunes', h, 'pasado').fecha, '2026-11-16')
  assert.equal(leerFecha('25 de noviembre', h).fecha, '2026-11-25')
  assert.equal(leerFecha('3 de enero', h).fecha, '2027-01-03', 'si ya pasó este año, el que viene')
  assert.equal(leerFecha('25/11', h).fecha, '2026-11-25')
  assert.equal(leerFecha('el 25', h).fecha, '2026-11-25')
  assert.equal(leerFecha('el 5', h).fecha, '2026-12-05', 'sin mes y ya pasado: el mes que viene')
  assert.equal(leerFecha('el 5', h, 'pasado').fecha, '2026-11-05')
  assert.equal(leerFecha('ayer', h).fecha, '2026-11-19')
  assert.deepEqual(leerFecha('del 24 al 28 de diciembre', h), { fecha: '2026-12-24', fechaFin: '2026-12-28' })
  assert.equal(leerFecha('31 de noviembre', h), null, 'no existe')
  assert.equal(leerFecha('cuando puedas', h), null)
})

test('horas: rangos, de tarde, con duración y franjas', () => {
  assert.deepEqual(leerHoras('de 17 a 19'), { desde: '17:00', hasta: '19:00' })
  assert.deepEqual(leerHoras('de 17:30 a 19:00'), { desde: '17:30', hasta: '19:00' })
  assert.deepEqual(leerHoras('de 5 a 7'), { desde: '17:00', hasta: '19:00' }, 'el estudio abre a las 9: es por la tarde')
  assert.deepEqual(leerHoras('de 10 a 2'), { desde: '10:00', hasta: '14:00' })
  assert.deepEqual(leerHoras('entre las 10 y las 13'), { desde: '10:00', hasta: '13:00' })
  assert.deepEqual(leerHoras('17-19h'), { desde: '17:00', hasta: '19:00' })
  assert.deepEqual(leerHoras('a las 10 durante 4 horas'), { desde: '10:00', hasta: '14:00' })
  assert.equal(leerHoras('por la manana').franja, 'manana')
  assert.equal(leerHoras('por la tarde').franja, 'tarde')
  assert.equal(leerHoras('todo el dia').franja, 'dia')
})

test('importe y forma de pago', () => {
  assert.equal(leerImporte('32 €'), 3200)
  assert.equal(leerImporte('32,50 € con tarjeta'), 3250)
  assert.equal(leerImporte('1.200 euros'), 120000)
  assert.equal(leerImporte('199€'), 19900)
  assert.equal(leerImporte('€ 18'), 1800)
  assert.equal(leerImporte('de 17 a 19'), null, 'las horas no son importes')
  assert.equal(leerMetodo(normalizar('con tarjeta')), 'tarjeta')
  assert.equal(leerMetodo(normalizar('por Bizum')), 'bizum')
  assert.equal(leerMetodo(normalizar('en efectivo')), 'efectivo')
  assert.equal(leerMetodo(normalizar('recibo domiciliado')), 'domiciliacion')
  assert.equal(leerMetodo('nada'), null)
})

test('reserva de alguien que ya ha venido: toma su contacto y la tarifa', () => {
  const r = interpretar('Reserva de Laura el lunes de 17 a 19', CTX)
  assert.equal(r.tipo, 'reserva')
  assert.equal(r.listo, false, 'hay una Laura miembro y una Laura clienta: pregunta')
  assert.equal(r.opciones.length, 2)
  const elegida = interpretar('Reserva de Laura el lunes de 17 a 19', CTX, r.opciones.find((o) => o.persona.cliente).persona)
  assert.equal(elegida.listo, true)
  assert.deepEqual(
    { ...elegida.campos },
    { modo: 'horas', fecha: '2026-11-23', desde: '17:00', hasta: '19:00', nombre: 'Laura', apellidos: 'Ribera Vidal', email: 'laura@ejemplo.es', telefono: '600111222', actividad: 'Fotos', precioCent: 9680 }
  )
  const miembro = interpretar('Reserva de Laura el lunes de 17 a 19', CTX, { miembroId: 9 })
  assert.equal(miembro.campos.modo, 'suscripcion')
  assert.equal(miembro.campos.susId, 9)
  // Con el apellido no hay duda
  assert.equal(interpretar('Reserva de Laura Ribera el lunes de 17 a 19', CTX).campos.email, 'laura@ejemplo.es')
})

test('reserva de alguien nuevo: pide teléfono o correo; con él, está lista', () => {
  const sin = interpretar('Reserva de Pepe Gómez mañana a las 10 durante 4 horas', CTX)
  assert.equal(sin.listo, false)
  assert.ok(sin.faltan.some((f) => /teléfono o su correo/.test(f)))
  const con = interpretar('Reserva de Pepe Gómez mañana a las 10 durante 4 horas, podcast, 611 222 333', CTX)
  assert.equal(con.listo, true)
  assert.equal(con.campos.nombre, 'Pepe')
  assert.equal(con.campos.apellidos, 'Gómez')
  assert.equal(con.campos.telefono, '611222333')
  assert.equal(con.campos.actividad, 'Podcast')
  assert.equal(con.campos.precioCent, 22748, 'sábado: precio de fin de semana')
})

test('reserva: varias personas con el mismo nombre, festivo sin tarifa y datos que faltan', () => {
  const dos = interpretar('Reserva de Sara el martes de 10 a 12', CTX)
  assert.equal(dos.listo, false)
  assert.equal(dos.opciones.length, 2)
  const festivo = interpretar('Reserva de Sara Torres el 8 de diciembre de 10 a 12', CTX)
  assert.equal(festivo.listo, false)
  assert.ok(festivo.faltan.some((f) => /precio/.test(f)), 'un festivo no se vende por 2 horas')
  const sinHora = interpretar('Reserva de Sara Torres el martes', CTX)
  assert.ok(sinHora.faltan.some((f) => /hora/.test(f)))
})

test('sesión de un miembro: va al formulario de su plan', () => {
  const r = interpretar('Sesión de Irene el martes de 10 a 14', CTX)
  assert.equal(r.tipo, 'reserva')
  assert.equal(r.campos.modo, 'suscripcion')
  assert.equal(r.campos.susId, 7)
  assert.ok(r.revisar)
})

test('gasto: categoría, concepto, pago y fecha', () => {
  const r = interpretar('Aquaservice 32 € con tarjeta', CTX)
  assert.equal(r.tipo, 'gasto')
  assert.equal(r.listo, true)
  assert.deepEqual(r.campos, { categoriaId: 1, importeCent: 3200, metodoPago: 'tarjeta', fecha: '2026-11-20', concepto: 'Aquaservice' })
  const m = interpretar('He pagado 18,90 € de cinta y pinzas ayer', CTX)
  assert.equal(m.campos.categoriaId, 3)
  assert.equal(m.campos.concepto, 'Cinta y pinzas')
  assert.equal(m.campos.fecha, '2026-11-19')
  const raro = interpretar('Gasto de 12 € en unas cosas', CTX)
  assert.equal(raro.campos.categoriaId, 2, 'si no sabe la categoría, «Otros gastos»')
  assert.ok(raro.avisos.length)
  assert.equal(interpretar('Gasto de la luz', CTX).listo, false, 'sin importe no está listo')
  assert.equal(categoriaDeGasto('aquaservice garrafas', CTX.categorias).categoria.clave, 'aquaservice', 'Aquaservice no es «agua»')
})

test('cobro de cuota: busca la cuota pendiente del miembro', () => {
  const r = interpretar('Cobrado 199 € de cuota de Irene por Bizum', CTX)
  assert.equal(r.tipo, 'cuota')
  assert.equal(r.listo, true)
  assert.deepEqual(r.campos, { cuotaId: 31, susId: 7, metodo: 'bizum', fecha: '2026-11-20', importeCent: 19900 })
  const otro = interpretar('Irene ha pagado 150 € por transferencia', CTX)
  assert.equal(otro.tipo, 'cuota')
  assert.ok(otro.avisos.some((a) => /cuota es de 199,00/.test(a)))
  const nadie = interpretar('Cobrada la cuota de Pedro', CTX)
  assert.equal(nadie.listo, false)
  // Marta tiene una cuota que aún no ha empezado: se puede marcar igual (la siguiente)
  assert.equal(interpretar('Cuota de Marta en efectivo', CTX).campos.cuotaId, 40)
})

test('otro ingreso, bloqueo y pregunta', () => {
  const i = interpretar('Cobrado 24,20 € de fondo blanco en efectivo', CTX)
  assert.equal(i.tipo, 'ingreso')
  assert.deepEqual(i.campos, { tipo: 'extras', importeCent: 2420, metodoPago: 'efectivo', fecha: '2026-11-20', concepto: 'Fondo blanco' })
  const b = interpretar('Bloquear el sábado por la mañana', CTX)
  assert.equal(b.tipo, 'bloqueo')
  assert.deepEqual(b.campos, { fecha: '2026-11-21', fechaFin: '', desde: '09:00', hasta: '14:00', motivo: '' })
  const v = interpretar('Bloquear del 24 al 28 de diciembre para vacaciones', CTX)
  assert.equal(v.campos.fechaFin, '2026-12-28')
  assert.equal(v.campos.motivo, 'Vacaciones')
  assert.equal(interpretar('Cerrar el lunes de 10 a 13 para la grabación de Ari', CTX).campos.motivo, 'La grabación de Ari')
  assert.equal(interpretar('¿Cómo va el mes?', CTX).tipo, 'pregunta')
  const nada = interpretar('hola qué tal', CTX)
  assert.equal(nada.tipo, 'nada')
  assert.ok(nada.mensaje)
})
