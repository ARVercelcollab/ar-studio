import test from 'node:test'
import assert from 'node:assert/strict'
import { madridAInstante, fechaMadrid, horaMadrid, esFecha, esHora, textoFecha } from '../lib/reservas/tiempo.js'
import { horasLibres, tipoDeDia, choca, bloqueoHasta, diasConHuecos } from '../lib/reservas/disponibilidad.js'
import { precioCent, porcentajeReembolso, formatoEuros } from '../lib/reservas/config.js'

const AHORA = new Date('2026-11-18T10:00:00Z') // miércoles 18-11-2026, 11:00 en Madrid

test('hora de Madrid en invierno, verano y en los cambios de hora', () => {
  assert.equal(madridAInstante('2026-11-20', '09:00').toISOString(), '2026-11-20T08:00:00.000Z')
  assert.equal(madridAInstante('2026-07-01', '09:00').toISOString(), '2026-07-01T07:00:00.000Z')
  // 29-03-2026: a las 02:00 se pasa a las 03:00
  assert.equal(madridAInstante('2026-03-29', '09:00').toISOString(), '2026-03-29T07:00:00.000Z')
  assert.equal(madridAInstante('2026-03-28', '21:00').toISOString(), '2026-03-28T20:00:00.000Z')
  // 25-10-2026: a las 03:00 se vuelve a las 02:00
  assert.equal(madridAInstante('2026-10-25', '09:00').toISOString(), '2026-10-25T08:00:00.000Z')
  const i = madridAInstante('2026-10-25', '21:30')
  assert.equal(fechaMadrid(i), '2026-10-25')
  assert.equal(horaMadrid(i), '21:30')
})

test('valida fechas y horas', () => {
  assert.ok(esFecha('2026-02-28'))
  assert.ok(!esFecha('2026-02-30'))
  assert.ok(!esFecha('2026-2-3'))
  assert.ok(esHora('09:30'))
  assert.ok(!esHora('9:30'))
  assert.ok(!esHora('25:00'))
  assert.equal(textoFecha('2026-11-10'), 'martes, 10 de noviembre de 2026')
})

test('fines de semana y festivos', () => {
  assert.equal(tipoDeDia('2026-11-21'), 'finde') // sábado
  assert.equal(tipoDeDia('2026-11-22'), 'finde') // domingo
  assert.equal(tipoDeDia('2026-11-23'), 'laborable')
  assert.equal(tipoDeDia('2026-12-08', new Set(['2026-12-08'])), 'finde')
})

test('precios iguales a los de Calendly', () => {
  assert.equal(precioCent(2, 'laborable'), 9680)
  assert.equal(precioCent(2, 'finde'), null)
  assert.equal(precioCent(4, 'finde'), 22748)
  assert.equal(precioCent(10, 'finde'), 48400)
  assert.equal(precioCent(5, 'laborable'), null)
  assert.equal(formatoEuros(9680), '96,80 €')
  assert.equal(formatoEuros(48400), '484 €')
})

test('un día laborable vacío: 2 h de 09:00 a 20:00 cada media hora', () => {
  const h = horasLibres({ fecha: '2026-11-23', horas: 2, ahora: AHORA })
  assert.equal(h[0], '09:00')
  assert.equal(h.at(-1), '20:00')
  assert.equal(h.length, 23)
  const h10 = horasLibres({ fecha: '2026-11-23', horas: 10, ahora: AHORA })
  assert.deepEqual(h10, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'])
})

test('fin de semana: no hay 2 ni 3 horas, sí 4', () => {
  assert.deepEqual(horasLibres({ fecha: '2026-11-21', horas: 2, ahora: AHORA }), [])
  assert.deepEqual(horasLibres({ fecha: '2026-11-21', horas: 3, ahora: AHORA }), [])
  const h = horasLibres({ fecha: '2026-11-21', horas: 4, ahora: AHORA })
  assert.equal(h[0], '09:00')
  assert.equal(h.at(-1), '18:00')
})

test('deja 30 minutos entre reservas', () => {
  // Reserva de 10:00 a 12:00 el 12-11 (como la de Paola): la siguiente de 2 h empieza a las 12:30
  const inicio = madridAInstante('2026-11-25', '10:00')
  const fin = madridAInstante('2026-11-25', '12:00')
  const ocupado = { reservas: [{ inicio, bloqueoHasta: bloqueoHasta(fin) }] }
  const h = horasLibres({ fecha: '2026-11-25', horas: 2, ocupado, ahora: AHORA })
  assert.ok(!h.includes('12:00'))
  assert.ok(h.includes('12:30'))
  // Y la anterior tiene que acabar 30 min antes de las 10:00: la de 07:30 no existe, 09:00 choca
  assert.ok(!h.includes('09:00'))
  assert.ok(!h.includes('07:30'))
})

test('los bloqueos del estudio cierran esas horas, sin margen extra', () => {
  const ocupado = { bloqueos: [{ inicio: madridAInstante('2026-11-26', '09:00'), fin: madridAInstante('2026-11-26', '14:00') }] }
  const h = horasLibres({ fecha: '2026-11-26', horas: 2, ocupado, ahora: AHORA })
  assert.equal(h[0], '14:00')
})

test('respeta la antelación mínima de 10 horas', () => {
  // Ahora son las 11:00 del 18-11; hasta las 21:00 no se puede empezar: hoy ya no queda nada de 2 h
  assert.deepEqual(horasLibres({ fecha: '2026-11-18', horas: 2, ahora: AHORA }), [])
  // Mañana a las 09:00 sí (faltan 22 h)
  assert.equal(horasLibres({ fecha: '2026-11-19', horas: 2, ahora: AHORA })[0], '09:00')
  // A las 23:30, el día siguiente empieza a las 09:30
  const tarde = new Date('2026-11-18T22:30:00Z')
  assert.equal(horasLibres({ fecha: '2026-11-19', horas: 2, ahora: tarde })[0], '09:30')
})

test('no enseña más allá del horizonte', () => {
  assert.deepEqual(horasLibres({ fecha: '2027-12-01', horas: 2, ahora: AHORA }), [])
})

test('choca detecta solapes y deja pasar reservas seguidas con margen', () => {
  const r = { inicio: madridAInstante('2026-11-30', '10:00'), bloqueoHasta: madridAInstante('2026-11-30', '12:30') }
  assert.ok(choca({ inicio: madridAInstante('2026-11-30', '11:00'), fin: madridAInstante('2026-11-30', '13:00') }, { reservas: [r] }))
  assert.ok(!choca({ inicio: madridAInstante('2026-11-30', '12:30'), fin: madridAInstante('2026-11-30', '14:30') }, { reservas: [r] }))
  // Una reserva que termina a las 09:30 deja libre las 10:00 (margen 30 min)
  assert.ok(!choca({ inicio: madridAInstante('2026-11-30', '07:30'), fin: madridAInstante('2026-11-30', '09:30') }, { reservas: [r] }))
  assert.ok(choca({ inicio: madridAInstante('2026-11-30', '08:00'), fin: madridAInstante('2026-11-30', '10:00') }, { reservas: [r] }))
})

test('calendario del mes cuenta huecos por día', () => {
  const dias = diasConHuecos({ desde: '2026-11-21', hasta: '2026-11-23', horas: 2, ahora: AHORA })
  assert.deepEqual(dias, { '2026-11-21': 0, '2026-11-22': 0, '2026-11-23': 23 })
})

test('política de cancelación de /condiciones', () => {
  const sesion = new Date('2026-12-31T10:00:00Z')
  assert.equal(porcentajeReembolso(sesion, new Date('2026-11-25T10:00:00Z')), 100)
  assert.equal(porcentajeReembolso(sesion, new Date('2026-12-10T10:00:00Z')), 70)
  assert.equal(porcentajeReembolso(sesion, new Date('2026-12-20T10:00:00Z')), 50)
  assert.equal(porcentajeReembolso(sesion, new Date('2026-12-28T10:00:00Z')), 0)
})
