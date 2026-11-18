import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../lib/suscripciones/reglas.js'
import { madridAInstante } from '../lib/reservas/tiempo.js'
import { bloqueoHasta } from '../lib/reservas/disponibilidad.js'

// Condiciones como las de Anastasia (Starter especial), sin datos personales
const ANA = {
  id: 1, codigo: 'SUS-PRUEBA', plan: 'starter', nombre: 'Ana', fechaInicio: '2026-11-20', ultimoDia: null,
  horasPeriodo: 8, duracionesH: [4], sesionMinH: 4, sesionMaxH: 4, maxSesiones: 2, franjaDesde: '14:00', franjaHasta: '20:00',
  antelacionH: 72, avisoCancelacionH: 48, permanenciaMeses: 3, renovacionMeses: 3, preavisoDias: 30, mesPrueba: true,
  fianzaEstado: 'cobrada', fianzaCent: 10000, cobroExterno: 'stripe',
}
const STD = { ...ANA, renovacionMeses: 1, preavisoDias: 0, mesPrueba: false, cobroExterno: null }
const PRO = { ...STD, plan: 'pro', horasPeriodo: 16, duracionesH: null, sesionMinH: 4, sesionMaxH: 8, maxSesiones: null, franjaDesde: '09:00', franjaHasta: '20:00' }
const AHORA = madridAInstante('2026-11-18', '12:00')
const s = (fecha, desde, hasta) => ({ inicio: madridAInstante(fecha, desde), fin: madridAInstante(fecha, hasta) })
const codigos = (lista) => lista.map((x) => x.codigo).sort()

test('periodos del mes de cobro', () => {
  assert.equal(R.periodoDe(ANA, '2026-12-19').numero, 1)
  assert.equal(R.periodoDe(ANA, '2026-12-20').numero, 2)
  assert.equal(R.periodoDe(ANA, '2026-11-19'), null)
  assert.equal(R.periodoDe(STD, '2027-11-20').numero, 13)
  const e31 = { fechaInicio: '2027-01-31' }
  assert.deepEqual([2, 3, 4].map((n) => R.periodoNumero(e31, n).desde), ['2027-02-28', '2027-03-31', '2027-04-30'])
  assert.equal(R.periodoDe(e31, '2027-03-30').numero, 2)
  assert.equal(R.periodoNumero({ fechaInicio: '2028-02-29' }, 13).desde, '2029-02-28')
  assert.equal(R.ultimoDiaPermanencia(ANA), '2027-02-19')
})

test('propuesta de baja según el contrato', () => {
  assert.equal(R.propuestaBaja(ANA, '2026-12-10').ultimoDia, '2026-12-19')
  assert.equal(R.propuestaBaja(ANA, '2026-12-10').motivo, 'prueba')
  assert.equal(R.propuestaBaja(ANA, '2026-12-25').ultimoDia, '2027-02-19')
  assert.equal(R.propuestaBaja(ANA, '2027-02-01').ultimoDia, '2027-05-19')
  assert.equal(R.propuestaBaja(ANA, '2027-04-25').ultimoDia, '2027-08-19')
  assert.equal(R.propuestaBaja(STD, '2026-12-25').ultimoDia, '2027-02-19')
  assert.equal(R.propuestaBaja(STD, '2027-04-25').ultimoDia, '2027-05-19')
})

test('consecuencias de la baja', () => {
  assert.equal(R.consecuenciasBaja(ANA, '2026-12-19').fianza, 'devolver')
  assert.ok(R.consecuenciasBaja(ANA, '2026-12-19').enPrueba)
  assert.equal(R.consecuenciasBaja(STD, '2027-01-19').fianza, 'retener')
  assert.equal(R.consecuenciasBaja(STD, '2027-02-19').fianza, 'devolver')
  assert.ok(R.consecuenciasBaja(STD, '2027-02-10').textos.some((t) => t.includes('mitad de periodo')))
  assert.ok(R.consecuenciasBaja(ANA, '2027-02-19', '2027-02-01').antesDeContrato)
})

test('sesiones de Ana: limpia, antelación, fuera de horario y reparto', () => {
  const limpia = R.validarSesion({ sus: ANA, ...s('2026-11-24', '14:00', '18:00'), ahora: AHORA })
  assert.deepEqual([limpia.errores, limpia.avisos], [[], []])
  assert.equal(limpia.horasPlan, 4)
  assert.equal(limpia.restantesDespues, 4)

  const pronto = R.validarSesion({ sus: ANA, ...s('2026-11-20', '14:00', '18:00'), ahora: AHORA })
  assert.deepEqual(codigos(pronto.avisos), ['antelacion'])

  const fuera = R.validarSesion({ sus: ANA, ...s('2026-11-23', '13:00', '17:00'), ahora: AHORA })
  assert.deepEqual(codigos(fuera.avisos), ['duracion', 'franja'])
  assert.equal(fuera.horasPlan, 3)
  assert.equal(fuera.horasExtra, 1)
  assert.equal(fuera.precioExtraSugeridoCent, 6050)
  const fuera4 = R.validarSesion({ sus: ANA, ...s('2026-11-23', '13:00', '17:00'), horasPlan: 4, ahora: AHORA })
  assert.deepEqual(codigos(fuera4.avisos), ['franja'])
  assert.equal(fuera4.horasExtra, 0)
})

test('sesiones de Ana: finde, festivo, sin horas, otros periodos', () => {
  const sab = R.validarSesion({ sus: ANA, ...s('2026-11-21', '14:00', '18:00'), ahora: AHORA })
  assert.equal(sab.horasPlan, 0)
  assert.equal(sab.horasExtra, 4)
  assert.ok(codigos(sab.notas).includes('finde'))
  assert.equal(sab.avisos.length, 0)
  assert.equal(sab.precioExtraSugeridoCent, 29040)

  const fest = R.validarSesion({ sus: ANA, ...s('2026-11-25', '14:00', '18:00'), festivos: new Set(['2026-11-25']), ahora: AHORA })
  assert.ok(codigos(fest.notas).includes('festivo'))
  assert.equal(fest.horasPlan, 0)
  const festPlan = R.validarSesion({ sus: ANA, ...s('2026-11-25', '14:00', '18:00'), horasPlan: 4, festivos: new Set(['2026-11-25']), ahora: AHORA })
  assert.ok(codigos(festPlan.avisos).includes('festivo'))

  const usadas = [
    { id: 10, estado: 'confirmada', horasPlan: 4, ...s('2026-11-24', '14:00', '18:00') },
    { id: 11, estado: 'cancelada', cuentaComoUsada: true, horasPlan: 4, ...s('2026-11-26', '14:00', '18:00') },
  ]
  const tercera = R.validarSesion({ sus: ANA, sesionesPeriodo: usadas, ...s('2026-12-01', '14:00', '18:00'), ahora: AHORA })
  assert.equal(tercera.horasPlan, 0)
  assert.equal(tercera.horasExtra, 4)
  const forzada = R.validarSesion({ sus: ANA, sesionesPeriodo: usadas, ...s('2026-12-01', '14:00', '18:00'), horasPlan: 4, ahora: AHORA })
  assert.deepEqual(codigos(forzada.errores), ['horas_plan'])

  assert.ok(codigos(R.validarSesion({ sus: ANA, ...s('2026-12-22', '14:00', '18:00'), ahora: AHORA }).notas).includes('prueba'))
  assert.ok(codigos(R.validarSesion({ sus: ANA, ...s('2027-01-21', '14:00', '18:00'), ahora: AHORA }).notas).includes('periodo_lejano'))
  assert.deepEqual(codigos(R.validarSesion({ sus: ANA, ...s('2026-11-19', '14:00', '18:00'), ahora: AHORA }).errores), ['antes_de_empezar'])
  assert.ok(codigos(R.validarSesion({ sus: ANA, ...s('2026-11-20', '14:00', '18:00'), ahora: AHORA, modo: 'cliente' }).errores).includes('antelacion'))
  assert.ok(codigos(R.validarSesion({ sus: ANA, ...s('2026-11-20', '14:00', '18:00'), ahora: madridAInstante('2026-11-25', '12:00') }).notas).includes('pasada'))
  assert.deepEqual(codigos(R.validarSesion({ sus: ANA, ...s('2026-11-24', '14:00', '18:00'), ahora: AHORA, ...{ fin: madridAInstante('2026-11-25', '02:00') } }).errores), ['dos_dias'])
})

test('sesiones del plan Pro', () => {
  const v = (desde, hasta, otras = []) => R.validarSesion({ sus: PRO, sesionesPeriodo: otras, ...s('2026-11-24', desde, hasta), ahora: AHORA })
  assert.equal(v('09:00', '14:00').avisos.length, 0)
  assert.deepEqual(codigos(v('09:00', '18:00').avisos), ['duracion'])
  assert.equal(v('09:00', '13:30').avisos.length, 0)
  const trece = [{ id: 5, estado: 'confirmada', horasPlan: 13, ...s('2026-11-30', '09:00', '22:00') }]
  assert.equal(v('09:00', '12:00', trece).avisos.length, 0)
  const nueve = [{ id: 5, estado: 'confirmada', horasPlan: 9, ...s('2026-11-30', '09:00', '18:00') }]
  assert.ok(codigos(v('09:00', '14:00', nueve).notas).includes('sobrante'))
})

test('tiempos límite: 72 h, cambio de hora y mover con poca antelación', () => {
  const ini = madridAInstante('2026-11-24', '14:00')
  const justo = R.validarSesion({ sus: ANA, inicio: ini, fin: madridAInstante('2026-11-24', '18:00'), ahora: new Date(ini.getTime() - 72 * 3600000) })
  assert.equal(justo.avisos.length, 0)
  const casi = R.validarSesion({ sus: ANA, inicio: ini, fin: madridAInstante('2026-11-24', '18:00'), ahora: new Date(ini.getTime() - 71.75 * 3600000) })
  assert.deepEqual(codigos(casi.avisos), ['antelacion'])
  const SUS_MAR = { ...STD, fechaInicio: '2027-03-01' }
  const dst = R.validarSesion({ sus: SUS_MAR, ...s('2027-03-29', '14:00', '18:00'), ahora: madridAInstante('2027-03-26', '14:00') })
  assert.deepEqual(codigos(dst.avisos), ['antelacion'])
  const mover = R.validarSesion({ sus: ANA, ...s('2026-12-01', '14:00', '18:00'), ahora: AHORA, moviendo: { inicio: madridAInstante('2026-11-19', '14:00') } })
  assert.ok(codigos(mover.avisos).includes('mover_tarde'))
  assert.equal(R.cancelacionCuenta(ANA, { inicio: new Date(AHORA.getTime() + 47 * 3600000) }, AHORA), true)
  assert.equal(R.cancelacionCuenta(ANA, { inicio: new Date(AHORA.getTime() + 48 * 3600000) }, AHORA), false)
  assert.equal(R.cancelacionCuenta(ANA, { inicio: new Date(AHORA.getTime() - 3600000) }, AHORA), true)
})

test('resumen del periodo y horas que se pierden', () => {
  const periodo = R.periodoNumero(ANA, 1)
  const sesiones = [
    { estado: 'confirmada', horasPlan: 4, ...s('2026-11-24', '14:00', '18:00') },
    { estado: 'cancelada', cuentaComoUsada: false, horasPlan: 4, ...s('2026-11-26', '14:00', '18:00') },
    { estado: 'cancelada', cuentaComoUsada: true, horasPlan: 2, ...s('2026-12-01', '14:00', '16:00') },
  ]
  const r = R.resumenPeriodo({ periodo, horas: 8, sesiones, ahora: madridAInstante('2026-11-25', '12:00') })
  assert.deepEqual([r.usadas, r.hechas, r.reservadas, r.canceladasTarde, r.restantes, r.seHanPerdido], [6, 4, 0, 2, 2, 0])
  const despues = R.resumenPeriodo({ periodo, horas: 8, sesiones, ahora: madridAInstante('2026-12-21', '12:00') })
  assert.equal(despues.seHanPerdido, 2)
})

test('huecos libres en su horario', () => {
  const b = { inicio: madridAInstante('2026-11-24', '19:00'), bloqueoHasta: bloqueoHasta(madridAInstante('2026-11-24', '19:30')) }
  assert.deepEqual(R.iniciosPosibles({ fecha: '2026-11-24', horas: 4, sus: ANA, ocupado: { reservas: [b] } }), ['14:00', '14:30'])
  assert.deepEqual(R.iniciosPosibles({ fecha: '2026-11-21', horas: 4, sus: ANA }), [])
})

test('cuotas, tareas, recordatorio y condiciones', () => {
  const c = (desde, extra = {}) => ({ desde, hasta: '2026-12-20', estado: 'pendiente', importeCent: 14900, ...extra })
  assert.equal(R.chipCuota(c('2026-11-20'), '2026-11-22'), 'sin_pagar')
  assert.equal(R.chipCuota(c('2026-11-20'), '2026-11-26'), 'atrasada')
  assert.equal(R.chipCuota(c('2026-12-20'), '2026-11-26'), 'proxima')
  assert.equal(R.chipCuota(c('2026-11-20', { importeCent: 0 }), '2026-11-26'), 'sin_cargo')
  assert.equal(R.chipCuota(c('2026-11-20', { estado: 'pagada' }), '2026-11-26'), 'pagada')

  const tareas = R.tareasPendientes({ fichas: [{ sus: { ...ANA, fianzaEstado: 'pendiente' }, cuotas: [c('2026-11-20')], resumen: null }], hoy: '2026-12-15' })
  assert.deepEqual(tareas.map((t) => t.tipo).sort(), ['cuota', 'fianza_cobrar', 'prueba'])
  assert.ok(tareas.find((t) => t.tipo === 'prueba').texto.includes('Stripe'))
  const baja = R.tareasPendientes({ fichas: [{ sus: { ...ANA, ultimoDia: '2026-12-19' }, cuotas: [] }], hoy: '2026-12-10' })
  assert.ok(baja.some((t) => t.tipo === 'cobro_externo'))

  const texto = R.textoRecordatorioCuota(ANA, c('2026-11-20'))
  assert.ok(texto.includes('149 €') && texto.includes('20 nov') && !texto.includes('IBAN'))
  assert.ok(R.textoRecordatorioCuota(ANA, c('2026-11-20'), { iban: 'ES00 0000' }).includes('IBAN ES00 0000'))

  assert.deepEqual(R.validarCondiciones(R.condicionesDePlan('pro')), {})
  const mal = R.validarCondiciones({ ...R.condicionesDePlan('starter'), horasPeriodo: 0, franjaDesde: '20:00', franjaHasta: '14:00', maxSesiones: 0 })
  assert.deepEqual(Object.keys(mal).sort(), ['franja', 'horasPeriodo', 'maxSesiones'])
  assert.ok(R.textoCondiciones(ANA).includes('L–V de 14:00 a 20:00'))
})
