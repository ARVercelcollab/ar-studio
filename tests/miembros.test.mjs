// Área de miembros (studioar.es/miembros): entrada con enlace al correo, reglas del plan en
// modo 'cliente', reservar (con y sin horas aparte), cambiar, cancelar y documentos.
// Con una base de datos Postgres real en memoria (PGlite) y el TPV simulado. Sin datos reales.
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-M1'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-M1S'
process.env.ESTUDIO_IBAN = 'ES00 0000 0000 0000 0000 0000'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as R from '../lib/suscripciones/reglas.js'
import * as ACC from '../lib/miembros/acceso.js'
import * as AREA from '../lib/miembros/area.js'
import * as M from '../lib/miembros/acciones.js'
import { crearReservaManual, reservaPorToken } from '../lib/reservas/servicio.js'
import { recibirResultado } from '../lib/reservas/flujo.js'
import { facturaDeReserva } from '../lib/facturas/servicio.js'
import { firmaSimulada } from '../lib/pagos/simulado.js'
import { fechaMadrid, sumarDias, diaSemana, madridAInstante, textoFechaCorta } from '../lib/reservas/tiempo.js'
import { vueltaMiembro } from '../lib/miembros/api.js'

after(() => cerrarDb())

const BASE = 'http://localhost:3000'
const HOY = fechaMadrid(new Date())
const H = 3600000
let n = 0
const correo = () => `socia${++n}@example.com`

// Día laborable, no festivo y sin usar por otra prueba en ese turno (el estudio es uno: no
// pueden coincidir). Las tardes (14:00–20:00) y las mañanas (09:00–13:00) no chocan.
const usados = { tarde: new Set(), manana: new Set() }
async function laborable(dias, turno = 'tarde') {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados[turno].has(f)) f = sumarDias(f, 1)
  usados[turno].add(f)
  return f
}

// Miembro de ejemplo: 8 h al mes en 2 sesiones de 4 h, de 14:00 a 20:00, con 72 h de antelación
async function miembro(extra = {}, condiciones = {}) {
  const { suscripcion } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Marta', apellidos: 'Ejemplo', email: correo(), telefono: '600000000',
    fechaInicio: HOY, metodoHabitual: 'transferencia', primeraPagada: { metodo: 'transferencia', fecha: HOY },
    condiciones: { cuotaCent: 14900, horasPeriodo: 8, duracionesH: [4], maxSesiones: 2, ...condiciones },
    fianza: { estado: 'cobrada', metodo: 'transferencia', fecha: HOY },
    ...extra,
  }, { confirmado: true })
  return suscripcion
}

// Para las pruebas que cuentan horas de un periodo: cada miembro empieza más adelante, en su
// propia ventana de días, y dia() da tardes libres dentro de su primer periodo
let proximoInicio = 45
let ventana = null
async function miembroAparte(extra = {}, condiciones = {}) {
  const fechaInicio = sumarDias(HOY, proximoInicio)
  proximoInicio += 35
  const sus = await miembro({ fechaInicio, ...extra }, condiciones)
  ventana = { desde: fechaInicio, hasta: R.periodoNumero(sus, 1).hasta }
  return sus
}
async function dia() {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  for (let f = ventana.desde; f < ventana.hasta; f = sumarDias(f, 1)) {
    if ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.tarde.has(f)) continue
    usados.tarde.add(f)
    return f
  }
  throw new Error('No quedan tardes libres en el periodo de prueba')
}

async function pagar(campos, resultado = 'ok', importe = campos.importe) {
  return recibirResultado('simulado', { pedido: campos.pedido, importe, resultado, firma: firmaSimulada(campos.pedido, importe, resultado) }, BASE)
}

const codigos = (lista) => lista.map((x) => x.codigo).sort()
const tokenDe = (url) => new URL(url).searchParams.get('t')

// ---------- Entrar ----------

test('enlace para entrar: de un solo uso, caduca y con un correo desconocido no pasa nada', async () => {
  const sus = await miembro()
  const r = await ACC.pedirEnlace(sus.email.toUpperCase(), BASE)
  assert.equal(r.enviado, true)
  assert.match(r.url, /^http:\/\/localhost:3000\/miembros\/entrar\?t=/)
  // En la base de datos no está el enlace, solo su resumen
  const { rows } = await query('SELECT token_hash FROM accesos_miembros WHERE lower(email) = $1', [sus.email])
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].token_hash, tokenDe(r.url))

  const dentro = await ACC.entrar(tokenDe(r.url))
  assert.equal(dentro.email, sus.email)
  assert.equal(dentro.suscripcion.id, sus.id)
  await assert.rejects(ACC.entrar(tokenDe(r.url)), (e) => e.codigo === 'enlace')
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.ok(ficha.acceso.ultimoEn)
  assert.ok(ficha.eventos.some((e) => e.tipo === 'acceso_miembro' && e.autor === 'cliente'))

  // Caducado (a los 30 minutos)
  const r2 = await ACC.pedirEnlace(sus.email, BASE)
  await assert.rejects(ACC.entrar(tokenDe(r2.url), { ahora: new Date(Date.now() + 31 * 60000) }), (e) => e.codigo === 'enlace')
  await assert.rejects(ACC.entrar('corto'), (e) => e.codigo === 'enlace')
  await assert.rejects(ACC.entrar('x'.repeat(43)), (e) => e.codigo === 'enlace')

  // Correo que no es de nadie: no se manda nada (la API contesta lo mismo)
  const nadie = await ACC.pedirEnlace('nadie@example.com', BASE)
  assert.equal(nadie.enviado, false)
  assert.equal(nadie.motivo, 'desconocido')
  assert.equal((await query(`SELECT count(*)::int AS n FROM accesos_miembros WHERE email = 'nadie@example.com'`)).rows[0].n, 0)
  assert.equal((await ACC.pedirEnlace('no-es-un-correo', BASE)).motivo, 'correo')

  // Como mucho 3 cada 15 minutos por correo
  assert.equal((await ACC.pedirEnlace(sus.email, BASE)).enviado, true)
  const cuarto = await ACC.pedirEnlace(sus.email, BASE)
  assert.equal(cuarto.enviado, false)
  assert.equal(cuarto.motivo, 'limite')
})

test('la cookie del miembro: firmada, con caducidad y distinta de la del panel', async () => {
  const v = ACC.valorCookie('Socia@Example.com')
  assert.equal(ACC.leerCookie(v).email, 'socia@example.com')
  assert.ok(Math.abs(ACC.leerCookie(v).abiertaMs - Date.now()) < 5000)
  const [e, abierta, caduca, f] = v.split('.')
  const otro = Buffer.from('otra@example.com').toString('base64url')
  assert.equal(ACC.leerCookie(`${otro}.${abierta}.${caduca}.${f}`), null)
  assert.equal(ACC.leerCookie(`${e}.${abierta}.${Number(caduca) + 1}.${f}`), null)
  assert.equal(ACC.leerCookie(`${e}.${Number(abierta) + 1}.${caduca}.${f}`), null)
  assert.equal(ACC.leerCookie(v, Date.now() + 31 * 24 * H), null)
  assert.equal(ACC.leerCookie(`${caduca}.${f}`), null) // la del panel tiene otra forma
  assert.equal(ACC.leerCookie(`${e}.${caduca}.${f}`), null) // la de antes (sin hora de apertura)
  assert.equal(ACC.leerCookie(''), null)
  assert.equal(ACC.cookieDeLaPeticion({ cookies: { ar_miembro: v } }).email, 'socia@example.com')
  assert.equal(await ACC.miembroDeLaPeticion({ cookies: {} }), null)
  // Con la cookie buena pero sin suscripción con ese correo: no entra
  assert.equal(await ACC.miembroDeLaPeticion({ cookies: { ar_miembro: v } }), null)
  const sus = await miembro()
  assert.equal((await ACC.miembroDeLaPeticion({ cookies: { ar_miembro: ACC.valorCookie(sus.email) } })).email, sus.email)
})

test('cerrar sesiones desde el panel (y al cambiar el correo): la cookie y los enlaces dejan de valer', async () => {
  const sus = await miembro()
  const antes = { cookies: { ar_miembro: ACC.valorCookie(sus.email, Date.now() - 1000) } }
  const enlace = await ACC.pedirEnlace(sus.email, BASE)
  assert.ok(await ACC.sesionDelMiembro(antes))
  const r = await ACC.cerrarSesiones(sus.id)
  assert.deepEqual(r, { ok: true, mensaje: 'Sesiones cerradas: tendrá que pedir otro enlace.' })
  assert.equal(await ACC.sesionDelMiembro(antes), null)
  assert.equal(await ACC.miembroDeLaPeticion(antes), null)
  await assert.rejects(ACC.entrar(tokenDe(enlace.url)), (e) => e.codigo === 'enlace')
  assert.equal((await ACC.redirigirSiNoMiembro({ req: antes })).redirect.destination, '/miembros')
  // Una sesión nueva (después de cerrar) sí vale
  await new Promise((r) => setTimeout(r, 5))
  const despues = { cookies: { ar_miembro: ACC.valorCookie(sus.email) } }
  assert.equal((await ACC.sesionDelMiembro(despues)).sus.id, sus.id)
  assert.equal(await ACC.redirigirSiNoMiembro({ req: despues }), null)
  assert.ok((await SUS.fichaSuscripcion(sus.id)).eventos.some((e) => e.tipo === 'sesiones_cerradas' && e.autor === 'panel'))

  // Cambiar el correo cierra las sesiones (también las de un correo nuevo abiertas antes)
  const nuevo = correo()
  const delNuevo = { cookies: { ar_miembro: ACC.valorCookie(nuevo, Date.now() - 1000) } }
  await SUS.editarSuscripcion(sus.id, { email: nuevo })
  assert.equal(await ACC.sesionDelMiembro(despues), null)
  assert.equal(await ACC.sesionDelMiembro(delNuevo), null)
  await new Promise((r) => setTimeout(r, 5))
  assert.equal((await ACC.sesionDelMiembro({ cookies: { ar_miembro: ACC.valorCookie(nuevo) } })).sus.id, sus.id)
})

test('pedir el enlace tarda lo mismo exista o no el correo', async () => {
  const sus = await miembro()
  for (const email of [sus.email, 'nadie-de-nada@example.com']) {
    const inicio = Date.now()
    await ACC.pedirEnlace(email, BASE)
    await ACC.esperarMinimo(inicio, 300, 50)
    assert.ok(Date.now() - inicio >= 300)
  }
  assert.ok(ACC.MINIMO_RESPUESTA_MS >= 1000)
})

test('los límites no se pasan aunque lleguen varias peticiones a la vez', async () => {
  const { dentroDelLimite } = await import('../lib/db/index.js')
  const r = await Promise.all(Array.from({ length: 6 }, () => dentroDelLimite('prueba:paralelo', 3, 15)))
  assert.equal(r.filter(Boolean).length, 3)
})

test('qué suscripción ve: la viva; una terminada solo 90 días y sin reservar', async () => {
  const vieja = await miembro()
  await query(`UPDATE suscripciones SET fecha_inicio = $2::date - 300, ultimo_dia = $2::date - 100 WHERE id = $1`, [vieja.id, HOY])
  assert.equal(await ACC.suscripcionVisible(vieja.email), null)
  assert.equal((await ACC.pedirEnlace(vieja.email, BASE)).enviado, false)
  await assert.rejects(ACC.enviarAcceso(vieja.id, BASE), (e) => e.codigo === 'acceso')

  // Una que va a empezar no tapa a la que está en marcha
  const enMarcha = await miembro()
  await SUS.crearSuscripcion({
    plan: 'creator', nombre: 'Marta', apellidos: 'Ejemplo', email: enMarcha.email, fechaInicio: sumarDias(HOY, 40),
    metodoHabitual: 'transferencia', fianza: { estado: 'sin_fianza' },
  }, { confirmado: true })
  assert.equal((await ACC.suscripcionVisible(enMarcha.email)).id, enMarcha.id)
  // Solo con la que va a empezar, se ve esa
  const futura = await miembro({ fechaInicio: sumarDias(HOY, 10) })
  assert.equal((await ACC.suscripcionVisible(futura.email)).id, futura.id)

  const reciente = await miembro()
  await query(`UPDATE suscripciones SET fecha_inicio = $2::date - 100, ultimo_dia = $2::date - 10 WHERE id = $1`, [reciente.id, HOY])
  const visible = await ACC.suscripcionVisible(reciente.email)
  assert.equal(visible.id, reciente.id)
  const area = await AREA.datosArea(reciente.email)
  assert.equal(area.suscripcion.estado, 'finalizada')
  assert.equal(area.suscripcion.puedeReservar, false)
  assert.equal(area.periodo, null)
  await assert.rejects(M.reservarMiembro(visible, { fecha: await laborable(6), desde: '14:00', horas: 4 }, BASE), (e) => e.codigo === 'bloqueo')
})

test('desde el panel: «Enviar acceso» manda el enlace y lo apunta', async () => {
  const sus = await miembro()
  const r = await ACC.enviarAcceso(sus.id, BASE)
  assert.equal(r.ok, true)
  assert.match(r.mensaje, /Enlace enviado a socia\d+@example\.com/)
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.ok(ficha.acceso.enviadoEn)
  assert.ok(ficha.eventos.some((e) => e.tipo === 'acceso_enviado' && e.autor === 'panel'))
})

// ---------- Reglas en modo cliente (sin base de datos) ----------

const SOCIA = {
  id: 1, codigo: 'SUS-PRUEBA', plan: 'starter', nombre: 'Marta', fechaInicio: '2026-11-20', ultimoDia: null,
  horasPeriodo: 8, duracionesH: [4], sesionMinH: 4, sesionMaxH: 4, maxSesiones: 2, franjaDesde: '14:00', franjaHasta: '20:00',
  antelacionH: 72, avisoCancelacionH: 48, permanenciaMeses: 3, renovacionMeses: 1, preavisoDias: 0, mesPrueba: false,
  fianzaEstado: 'cobrada', fianzaCent: 10000, cobroExterno: null, cobroAuto: false,
}
const AHORA = madridAInstante('2026-11-18', '12:00')
const franja = (fecha, desde, hasta) => ({ inicio: madridAInstante(fecha, desde), fin: madridAInstante(fecha, hasta) })
const cliente = (x) => R.validarSesion({ sus: SOCIA, ahora: AHORA, modo: 'cliente', ...x })
const usadas = (n, horas = 4) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, estado: 'confirmada', horasPlan: horas, ...franja(`2026-11-2${4 + i}`, '14:00', `${14 + horas}:00`) }))

test('reglas del área: sin «reservar igualmente» y con textos para el miembro', () => {
  assert.deepEqual(codigos(cliente(franja('2026-11-24', '14:00', '18:00')).errores), [])
  const finde = cliente(franja('2026-11-28', '14:00', '18:00'))
  assert.ok(codigos(finde.errores).includes('finde'))
  assert.match(finde.errores.find((e) => e.codigo === 'finde').texto, /^Tu plan no incluye fines de semana/)
  assert.ok(codigos(cliente(franja('2026-11-24', '10:00', '14:00')).errores).includes('franja'))
  const pronto = cliente(franja('2026-11-20', '14:00', '18:00'))
  assert.ok(codigos(pronto.errores).includes('antelacion'))
  assert.match(pronto.errores.find((e) => e.codigo === 'antelacion').texto, /al menos 72 h/)
  const tres = cliente(franja('2026-11-24', '14:00', '17:00'))
  assert.ok(codigos(tres.errores).includes('duracion'))
  assert.match(tres.errores.find((e) => e.codigo === 'duracion').texto, /son de 4 h/)
  // Con lo que le queda (2 h) sí puede hacer una sesión más corta
  const queda2 = R.validarSesion({ sus: { ...SOCIA, horasPeriodo: 6 }, sesionesPeriodo: usadas(1), ...franja('2026-11-30', '14:00', '16:00'), ahora: AHORA, modo: 'cliente' })
  assert.deepEqual(codigos(queda2.errores), [])
  // Máximo de sesiones con horas aún del plan
  const max = R.validarSesion({ sus: { ...SOCIA, horasPeriodo: 12 }, sesionesPeriodo: usadas(2), ...franja('2026-12-01', '14:00', '18:00'), ahora: AHORA, modo: 'cliente' })
  assert.ok(codigos(max.errores).includes('sesiones'))
  assert.match(max.errores.find((e) => e.codigo === 'sesiones').texto, /^Ya tienes 2 sesiones/)
  // Cuota sin pagar
  const impagadas = [{ id: 9, estado: 'pendiente', importeCent: 14900, desde: '2026-11-20', hasta: '2026-12-20', cobroEstado: null }]
  const impago = R.validarSesion({ sus: SOCIA, ...franja('2026-11-26', '14:00', '18:00'), ahora: madridAInstante('2026-11-21', '12:00'), modo: 'cliente', impagadas })
  assert.ok(codigos(impago.errores).includes('impago'))
  assert.match(impago.errores.find((e) => e.codigo === 'impago').texto, /^Tienes sin pagar la cuota/)
  // En el panel, lo mismo son avisos que se pueden saltar
  assert.deepEqual(codigos(R.validarSesion({ sus: SOCIA, ...franja('2026-11-28', '14:00', '18:00'), ahora: AHORA }).errores), [])
})

test('reglas del área: «lo que te queda» no vale para pasarse de la sesión más larga del plan', () => {
  const PRO = { ...SOCIA, plan: 'pro', horasPeriodo: 16, duracionesH: null, sesionMinH: 4, sesionMaxH: 8, maxSesiones: null, franjaDesde: '09:00', franjaHasta: '20:00' }
  const seis = [{ id: 1, estado: 'confirmada', horasPlan: 6, ...franja('2026-11-24', '09:00', '15:00') }]
  const diez = R.validarSesion({ sus: PRO, sesionesPeriodo: seis, ...franja('2026-11-25', '09:00', '19:00'), ahora: AHORA, modo: 'cliente' })
  assert.ok(codigos(diez.errores).includes('duracion'))
  const ocho = R.validarSesion({ sus: PRO, sesionesPeriodo: seis, ...franja('2026-11-25', '09:00', '17:00'), ahora: AHORA, modo: 'cliente' })
  assert.deepEqual(codigos(ocho.errores), [])
  // 2 h que le quedan (menos que la sesión mínima): sí
  const catorce = [{ id: 1, estado: 'confirmada', horasPlan: 8, ...franja('2026-11-24', '09:00', '17:00') }, { id: 2, estado: 'confirmada', horasPlan: 6, ...franja('2026-11-26', '09:00', '15:00') }]
  assert.deepEqual(codigos(R.validarSesion({ sus: PRO, sesionesPeriodo: catorce, ...franja('2026-11-25', '09:00', '11:00'), ahora: AHORA, modo: 'cliente' }).errores), [])
  assert.deepEqual(AREA.duracionesDe(PRO, 10).map((x) => x.horas), [4, 5, 6, 7, 8])
  assert.deepEqual(AREA.duracionesDe(PRO, 2).map((x) => x.horas), [2, 4, 5, 6, 7, 8])
})

test('textos de las sesiones: horas aparte sin cargo', () => {
  const r = { codigo: 'AR-X', estado: 'confirmada', inicio: madridAInstante('2026-12-01', '14:00'), fin: madridAInstante('2026-12-01', '18:00'), duracionHoras: 4, horasPlan: 0, precioCent: 0, pagoEstado: 'pagado' }
  assert.equal(AREA.aSesion(r, SOCIA, AHORA).extraTexto, '4 h aparte · sin cargo')
  assert.equal(AREA.aSesion({ ...r, precioCent: 18392 }, SOCIA, AHORA).extraTexto, '4 h aparte · 183,92 € · pagadas')
  assert.equal(AREA.aSesion(r, SOCIA, AHORA).fechaTexto, 'martes 1 de diciembre')
})

test('reglas del área: horas aparte solo si se pagan al reservar', () => {
  const sin = cliente({ sesionesPeriodo: usadas(2), ...franja('2026-12-01', '14:00', '18:00') })
  assert.ok(codigos(sin.errores).includes('extra'))
  assert.equal(sin.notas.some((x) => x.codigo === 'extra'), false)
  const con = cliente({ sesionesPeriodo: usadas(2), ...franja('2026-12-01', '14:00', '18:00'), permitirExtra: true })
  assert.deepEqual(codigos(con.errores), [])
  assert.equal(con.horasExtra, 4)
  assert.equal(con.precioExtraSugeridoCent, 18392) // la tarifa de la web (con antelación)
  assert.match(con.notas.find((x) => x.codigo === 'extra').texto, /4 h van aparte .*183,92 €/)
  // Fuera de su horario no hay horas aparte que valgan
  assert.ok(codigos(cliente({ sesionesPeriodo: usadas(2), ...franja('2026-12-01', '10:00', '14:00'), permitirExtra: true }).errores).includes('franja'))
})

// ---------- Reservar, cambiar y cancelar ----------

test('reservar una sesión del plan: confirmada, en su área y con autor «cliente»', async () => {
  const sus = await miembro()
  const fecha = await laborable(5)
  const c = await M.comprobarMiembro(sus, { fecha, desde: '14:00', horas: 4 })
  assert.equal(c.ok, true, JSON.stringify(c.errores))
  assert.equal(c.horasPlan, 4)
  assert.equal(c.horasExtra, 0)
  assert.match(c.resumen, /4 h de tu plan · te quedarán 4 h/)

  const huecos = await M.huecosMiembro(sus, { fecha, horas: 4 })
  assert.ok(huecos.huecos.includes('14:00'))
  assert.ok(!huecos.huecos.includes('17:00'))
  const dias = await M.diasConHuecosMiembro(sus, { desde: HOY, hasta: sumarDias(HOY, 40), horas: 4 })
  assert.ok(dias.dias[fecha] > 0)
  assert.equal(Object.keys(dias.dias).some((d) => [0, 6].includes(diaSemana(d))), false)
  assert.equal(Object.keys(dias.dias).some((d) => d < sumarDias(HOY, 3)), false)

  const r = await M.reservarMiembro(sus, { fecha, desde: '14:00', horas: 4 }, BASE)
  assert.equal(r.estado, 'confirmada')
  const area = await AREA.datosArea(sus.email)
  assert.equal(area.proximas.length, 1)
  assert.equal(area.proximas[0].codigo, r.codigo)
  assert.equal(area.proximas[0].puedeCambiar, true)
  assert.equal(area.proximas[0].puedeCancelar, true)
  assert.equal(area.periodo.restantes, 4)
  assert.equal(area.periodo.sesionesUsadas, 1)
  assert.equal(area.suscripcion.puedeReservar, true)
  assert.ok(area.cuotas[0].factura === null || area.cuotas[0].factura.url.startsWith('/api/miembros/factura/'))
  const ficha = await SUS.fichaSuscripcion(sus.id)
  assert.ok(ficha.eventos.some((e) => e.tipo === 'creada' && e.autor === 'cliente'))
  // Ya no está libre esa hora
  assert.equal((await M.huecosMiembro(sus, { fecha, horas: 4 })).huecos.includes('14:00'), false)
})

test('sin horas del plan: las horas aparte se pagan por el TPV y llevan su factura', async () => {
  const sus = await miembroAparte()
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const fecha = await dia()
  const c = await M.comprobarMiembro(sus, { fecha, desde: '15:00', horas: 4 })
  assert.equal(c.ok, true, JSON.stringify(c.errores))
  assert.equal(c.horasExtra, 4)
  assert.equal(c.precioExtraCent, 18392)
  await assert.rejects(M.reservarMiembro(sus, { fecha, desde: '15:00', horas: 4 }, BASE), (e) => e.codigo === 'pago_extra')

  const r = await M.reservarMiembro(sus, { fecha, desde: '15:00', horas: 4, aceptoPagoExtra: true }, BASE)
  assert.equal(r.estado, 'pago')
  assert.equal(r.pago.accion, '/pago-simulado')
  assert.equal(r.pago.campos.importe, '18392')
  assert.match(r.pago.campos.concepto, /^Horas aparte AR Studio 4 h/)
  // Mientras paga, la hora está guardada y la sesión sale en su área (sin poder cambiarla)
  let area = await AREA.datosArea(sus.email)
  const pendiente = area.proximas.find((s) => s.codigo === r.codigo)
  assert.equal(pendiente.estado, 'pendiente')
  assert.equal(pendiente.puedeCambiar, false)
  // A ella le sale libre (para volver a pagarla); a otra persona, no
  assert.ok((await M.huecosMiembro(sus, { fecha, horas: 4 })).huecos.includes('15:00'))
  const vecina = await miembro({ fechaInicio: sus.fechaInicio })
  assert.equal((await M.huecosMiembro(vecina, { fecha, horas: 4 })).huecos.includes('15:00'), false)

  const res = await pagar(r.pago.campos)
  assert.equal(res.aviso, 'confirmada')
  assert.equal(res.reserva.estado, 'confirmada')
  assert.equal(res.reserva.pagoEstado, 'pagado')
  const factura = await facturaDeReserva(res.reserva.id)
  assert.ok(factura)
  assert.equal(factura.tipo, 'simplificada')
  assert.equal(factura.totalCent, 18392)
  assert.match(factura.lineas[0].descripcion, /^Horas aparte/)
  area = await AREA.datosArea(sus.email)
  assert.equal(area.facturasSesiones.length, 1)
  assert.match(area.facturasSesiones[0].fechaTexto, /^sesión del \d+ \S+$/)
  assert.equal(area.facturasSesiones[0].fechaTexto, `sesión del ${textoFechaCorta(fecha)}`)
  const pagada = area.proximas.find((s) => s.codigo === r.codigo)
  assert.equal(pagada.puedeCancelar, false)
  assert.match(pagada.textoCancelar, /horas aparte pagadas/)
  // Con horas aparte pagadas no se cancela desde el área
  await assert.rejects(M.cancelarMiembro(sus, { codigo: r.codigo }, BASE), (e) => e.codigo === 'extra_pagado')
  // Su factura sí la puede bajar; la de otro miembro no
  const pdf = await M.facturaDelMiembro(sus.email, factura.id)
  assert.ok(pdf.pdf.length > 1000)
  await assert.rejects(M.facturaDelMiembro('otra@example.com', factura.id), (e) => e.estadoHttp === 404)
  await assert.rejects(M.facturaDelMiembro(sus.email, 999999), (e) => e.estadoHttp === 404)
})

test('pago de las horas aparte que llega tarde: si ya no cabe, queda en revisión (nunca se pierde)', async () => {
  // Sin hueco: mientras tanto el estudio ha dado esa hora a otra persona
  const sus = await miembroAparte()
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const fecha = await dia()
  const r = await M.reservarMiembro(sus, { fecha, desde: '14:00', horas: 4, aceptoPagoExtra: true }, BASE)
  await query(`UPDATE reservas SET expira_en = now() - interval '1 minute' WHERE codigo = $1`, [r.codigo])
  await crearReservaManual({ fecha, desde: '14:00', hasta: '18:00', nombre: 'Otra', apellidos: 'Persona', email: 'otra@example.com', pagoEstado: 'pendiente' })
  const res = await pagar(r.pago.campos)
  assert.equal(res.aviso, 'conflicto')
  assert.equal(res.reserva.estado, 'conflicto')
  assert.equal(res.reserva.pagoEstado, 'pagado')

  // Sin horas del plan: mientras tanto se han gastado en otra sesión
  const otra = await miembroAparte({}, { horasPeriodo: 6, maxSesiones: null })
  await M.reservarMiembro(otra, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const f2 = await dia()
  const mixta = await M.comprobarMiembro(otra, { fecha: f2, desde: '14:00', horas: 4 })
  assert.equal(mixta.horasPlan, 2)
  assert.equal(mixta.horasExtra, 2)
  const r2 = await M.reservarMiembro(otra, { fecha: f2, desde: '14:00', horas: 4, aceptoPagoExtra: true }, BASE)
  await query(`UPDATE reservas SET expira_en = now() - interval '1 minute' WHERE codigo = $1`, [r2.codigo])
  await M.reservarMiembro(otra, { fecha: await dia(), desde: '14:00', horas: 2 }, BASE) // las 2 h que le quedaban
  const res2 = await pagar(r2.pago.campos)
  assert.equal(res2.aviso, 'conflicto')
})

test('sesión retenida: en otro hueco no se suelta sola; en el mismo, doble clic o volver a pagar la reutilizan', async () => {
  const sus = await miembroAparte({}, { horasPeriodo: 4, maxSesiones: 1 })
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const fecha = await dia()
  const datos = { fecha, desde: '14:00', horas: 4, aceptoPagoExtra: true }
  const a = await M.reservarMiembro(sus, datos, BASE)
  // Doble clic: la misma sesión con otro pago
  const b = await M.reservarMiembro(sus, datos, BASE)
  assert.equal(b.estado, 'pago')
  assert.equal(b.codigo, a.codigo)
  assert.notEqual(b.pago.campos.pedido, a.pago.campos.pedido)
  // Otro hueco: no, y la retenida sigue como estaba
  const otro = await dia()
  await assert.rejects(M.reservarMiembro(sus, { fecha: otro, desde: '14:00', horas: 4, aceptoPagoExtra: true }, BASE), (e) => e.codigo === 'retenida' && e.datos.codigo === a.codigo)
  const c = await M.comprobarMiembro(sus, { fecha: otro, desde: '14:00', horas: 4 })
  assert.equal(c.ok, false)
  assert.equal(c.errores[0].codigo, 'retenida')
  assert.equal(c.errores[0].sesion, a.codigo)
  const d = await AREA.datosReservar(sus.email)
  assert.equal(d.retenida.codigo, a.codigo)
  // Su propio hueco le sale libre (para volver a pagarlo); para otra persona, no
  assert.ok((await M.huecosMiembro(sus, { fecha, horas: 4 })).huecos.includes('14:00'))
  const otra = await miembro({ fechaInicio: sus.fechaInicio })
  assert.equal((await M.huecosMiembro(otra, { fecha, horas: 4 })).huecos.includes('14:00'), false)
  // Pagar el primer formulario (el que se abrió en el banco) la confirma, sin conflicto
  const res = await pagar(a.pago.campos)
  assert.equal(res.aviso, 'confirmada')
  assert.equal(res.reserva.codigo, a.codigo)
  // Si luego llegara también el segundo pago, se avisa al estudio para devolverlo
  assert.equal((await pagar(b.pago.campos)).aviso, 'duplicado')
})

test('dos clics a la vez en «Pagar»: una sola sesión', async () => {
  const sus = await miembroAparte({}, { horasPeriodo: 4, maxSesiones: 1 })
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const datos = { fecha: await dia(), desde: '14:00', horas: 4, aceptoPagoExtra: true }
  const [x, y] = await Promise.all([M.reservarMiembro(sus, datos, BASE), M.reservarMiembro(sus, datos, BASE)])
  assert.equal(x.codigo, y.codigo)
  assert.equal((await pagar(x.pago.campos)).aviso, 'confirmada')
})

test('pago fallido: volver a pagar la misma sesión, y sus horas del plan no estorban a otra reserva', async () => {
  const sus = await miembroAparte({}, { horasPeriodo: 8, duracionesH: [4, 6], sesionMinH: 4, sesionMaxH: 6, maxSesiones: null })
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE) // le quedan 4 h
  const fecha = await dia()
  const a = await M.reservarMiembro(sus, { fecha, desde: '14:00', horas: 6, aceptoPagoExtra: true }, BASE) // 4 del plan + 2 aparte
  assert.equal(a.estado, 'pago')
  const ko = await pagar(a.pago.campos, 'ko')
  assert.equal(ko.aviso, 'fallido')
  // Volver a pagar la misma: misma sesión, pago nuevo, mismas horas aparte
  const c = await M.comprobarMiembro(sus, { fecha, desde: '14:00', horas: 6 })
  assert.equal(c.ok, true, JSON.stringify(c.errores))
  assert.equal(c.horasPlan, 4)
  assert.equal(c.horasExtra, 2)
  const otraVez = await M.reservarMiembro(sus, { fecha, desde: '14:00', horas: 6, aceptoPagoExtra: true }, BASE)
  assert.equal(otraVez.codigo, a.codigo)
  // Otra sesión de 4 h (que cabe en el plan sin contar la retenida): primero, pagar o soltar la retenida
  const f = await dia()
  const c2 = await M.comprobarMiembro(sus, { fecha: f, desde: '14:00', horas: 4 })
  assert.equal(c2.horasPlan, 4)
  assert.equal(c2.horasExtra, 0)
  assert.deepEqual(c2.errores.map((e) => e.codigo), ['retenida'])
  await assert.rejects(M.reservarMiembro(sus, { fecha: f, desde: '14:00', horas: 4 }, BASE), (e) => e.codigo === 'retenida')
  assert.equal((await M.cancelarMiembro(sus, { codigo: a.codigo }, BASE)).cuentaComoUsada, false)
  const ok = await M.reservarMiembro(sus, { fecha: f, desde: '14:00', horas: 4 }, BASE)
  assert.equal(ok.estado, 'confirmada')
  // El pago de la soltada, si llegara ahora, avisa al estudio (cobro tras cancelar)
  assert.equal((await pagar(otraVez.pago.campos)).aviso, 'tras_cancelar')
})

test('volver a pagar una retenida tiene un máximo de intentos', async () => {
  const sus = await miembroAparte({}, { horasPeriodo: 4, maxSesiones: 1 })
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const datos = { fecha: await dia(), desde: '14:00', horas: 4, aceptoPagoExtra: true }
  for (let i = 0; i < 4; i++) await M.reservarMiembro(sus, datos, BASE)
  await assert.rejects(M.reservarMiembro(sus, datos, BASE), (e) => e.codigo === 'intentos')
})

test('retenida del mismo hueco que ya no lleva horas aparte: se confirma sin pago', async () => {
  const sus = await miembroAparte({}, { horasPeriodo: 8, maxSesiones: null })
  const primera = await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const datos = { fecha: await dia(), desde: '14:00', horas: 4, aceptoPagoExtra: true }
  const r = await M.reservarMiembro(sus, datos, BASE)
  assert.equal(r.estado, 'pago')
  // Mientras paga, el estudio le cancela otra sesión: vuelven 4 h y ya no hace falta pagar
  await SUS.cancelarSesionPlan((await query('SELECT id FROM reservas WHERE codigo = $1', [primera.codigo])).rows[0].id, { motivo: 'prueba' })
  const fin = await M.reservarMiembro(sus, datos, BASE)
  assert.equal(fin.estado, 'confirmada')
  assert.equal(fin.codigo, r.codigo)
  const { rows } = await query('SELECT estado, precio_cent, horas_plan FROM reservas WHERE codigo = $1', [r.codigo])
  assert.deepEqual([rows[0].estado, rows[0].precio_cent, Number(rows[0].horas_plan)], ['confirmada', 0, 4])
  // Si aun así llega el pago del banco, se avisa para devolverlo
  assert.equal((await pagar(r.pago.campos)).aviso, 'duplicado')
})

test('cancelar y pago a la vez: nunca queda cancelada una sesión con las horas aparte pagadas sin avisar', async () => {
  // El pago llega antes: cancelar comprueba con la fila bloqueada y no deja
  const sus = await miembroAparte({}, { horasPeriodo: 4, maxSesiones: 1 })
  await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const r = await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4, aceptoPagoExtra: true }, BASE)
  const { rows } = await query('SELECT id FROM reservas WHERE codigo = $1', [r.codigo])
  await pagar(r.pago.campos)
  const comprobar = (x) => { if (x.pagoEstado === 'pagado' && x.precioCent > 0) throw new Error('pagada') }
  await assert.rejects(SUS.cancelarSesionPlan(rows[0].id, { motivo: 'x', cuentaComoUsada: false }, { comprobar }), /pagada/)
  await assert.rejects(M.cancelarMiembro(sus, { codigo: r.codigo }, BASE), (e) => e.codigo === 'extra_pagado')

  // A la vez: o se cancela y el pago avisa (tras_cancelar), o se paga y no se cancela
  const otra = await miembroAparte({}, { horasPeriodo: 4, maxSesiones: 1 })
  await M.reservarMiembro(otra, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const s2 = await M.reservarMiembro(otra, { fecha: await dia(), desde: '14:00', horas: 4, aceptoPagoExtra: true }, BASE)
  const [can, pago] = await Promise.allSettled([M.cancelarMiembro(otra, { codigo: s2.codigo }, BASE), pagar(s2.pago.campos)])
  const { rows: fin } = await query('SELECT estado, pago_estado FROM reservas WHERE codigo = $1', [s2.codigo])
  if (fin[0].estado === 'cancelada') {
    assert.equal(can.status, 'fulfilled')
    assert.equal(pago.value.aviso, 'tras_cancelar')
  } else {
    assert.equal(fin[0].estado, 'confirmada')
    assert.equal(can.status, 'rejected')
  }
})

test('vuelta del banco: a su área según cómo ha quedado la sesión', () => {
  assert.equal(vueltaMiembro({ codigo: 'AR-1', estado: 'confirmada' }, 'ok'), '/miembros?reservada=AR-1')
  assert.equal(vueltaMiembro({ codigo: 'AR-1', estado: 'confirmada' }, 'ko'), '/miembros?reservada=AR-1')
  assert.equal(vueltaMiembro({ codigo: 'AR-1', estado: 'conflicto' }, 'ok'), '/miembros?pago=revision&codigo=AR-1')
  assert.equal(vueltaMiembro({ codigo: 'AR-1', estado: 'cancelada' }, 'ok'), '/miembros?pago=revision&codigo=AR-1')
  assert.equal(vueltaMiembro({ codigo: 'AR-1', estado: 'pendiente' }, 'ok'), '/miembros?pago=espera&codigo=AR-1')
  assert.equal(vueltaMiembro({ codigo: 'AR-1', estado: 'pendiente' }, 'ko'), '/miembros?pago=ko&codigo=AR-1')
})

test('cambiar y cancelar: con su aviso de 48 h y solo sus sesiones', async () => {
  const sus = await miembroAparte()
  const fecha = await dia()
  const { codigo } = await M.reservarMiembro(sus, { fecha, desde: '14:00', horas: 4 }, BASE)
  const nueva = await dia()
  const c = await M.comprobarMiembro(sus, { codigo, fecha: nueva, desde: '16:00', horas: 4 })
  assert.equal(c.ok, true, JSON.stringify(c.errores))
  const cambio = await M.cambiarMiembro(sus, { codigo, fecha: nueva, desde: '16:00', horas: 4 }, BASE)
  assert.equal(cambio.estado, 'confirmada')
  const r = await reservaPorToken((await query('SELECT token FROM reservas WHERE codigo = $1', [codigo])).rows[0].token)
  assert.equal(fechaMadrid(r.inicio), nueva)
  assert.ok((await SUS.fichaSuscripcion(sus.id)).eventos.some((e) => e.tipo === 'movida' && e.autor === 'cliente'))

  // Con menos de 48 h: ya no se cambia, y cancelar cuenta como usada
  const tarde = new Date(r.inicio.getTime() - 24 * H)
  const vista = AREA.aSesion(r, sus, tarde)
  assert.equal(vista.puedeCambiar, false)
  assert.equal(vista.cancelarCuentaComoUsada, true)
  await assert.rejects(M.cambiarMiembro(sus, { codigo, fecha: await dia(), desde: '14:00', horas: 4 }, BASE, { ahora: tarde }), (e) => e.codigo === 'cambiar')

  // La sesión de otro miembro: como si no existiera
  const otra = await miembro()
  await assert.rejects(M.cancelarMiembro(otra, { codigo }, BASE), (e) => e.estadoHttp === 404)
  await assert.rejects(M.cambiarMiembro(otra, { codigo, fecha: await dia(), desde: '14:00', horas: 4 }, BASE), (e) => e.estadoHttp === 404)
  await assert.rejects(M.comprobarMiembro(otra, { codigo, fecha: nueva, desde: '14:00', horas: 4 }), (e) => e.estadoHttp === 404)

  const can = await M.cancelarMiembro(sus, { codigo }, BASE, { ahora: tarde })
  assert.equal(can.cuentaComoUsada, true)
  const area = await AREA.datosArea(sus.email)
  assert.equal(area.proximas.length, 0)
  assert.equal(area.periodo.usadas, 4) // cuenta como usada
  await assert.rejects(M.cancelarMiembro(sus, { codigo }, BASE), (e) => e.codigo === 'estado')

  // Cancelar a tiempo: las horas vuelven
  const otraSesion = await M.reservarMiembro(sus, { fecha: await dia(), desde: '14:00', horas: 4 }, BASE)
  const ok = await M.cancelarMiembro(sus, { codigo: otraSesion.codigo }, BASE)
  assert.equal(ok.cuentaComoUsada, false)
})

test('contrato sin firmar, cuota sin pagar y fianza: avisos en su área', async () => {
  const sus = await miembro({ fianza: { estado: 'pendiente' } })
  await query(`INSERT INTO contratos (suscripcion_id, token, version) VALUES ($1, $2, 'prueba')`, [sus.id, `tok-contrato-${sus.id}-xxxxxxxxxxxxxxxx`])
  await query(`UPDATE suscripciones SET contrato_estado = 'pendiente' WHERE id = $1`, [sus.id])
  let area = await AREA.datosArea(sus.email)
  assert.equal(area.suscripcion.puedeReservar, false)
  assert.match(area.suscripcion.motivoNoReservar, /Firma tu contrato/)
  assert.equal(area.contrato.estado, 'pendiente')
  assert.match(area.contrato.enlaceFirmar, /^\/contrato\/tok-contrato-/)
  const fianza = area.avisos.find((a) => a.tipo === 'fianza')
  assert.equal(fianza.transferencia.iban, 'ES00 0000 0000 0000 0000 0000')
  assert.equal(fianza.transferencia.concepto, `Fianza ${sus.codigo}`)
  assert.ok(area.avisos.some((a) => a.tipo === 'contrato'))
  await assert.rejects(M.reservarMiembro(sus, { fecha: await laborable(5), desde: '14:00', horas: 4 }, BASE), (e) => e.codigo === 'bloqueo')
  const comp = await M.comprobarMiembro(sus, { fecha: await laborable(6), desde: '14:00', horas: 4 })
  assert.equal(comp.ok, false)
  await assert.rejects(M.contratoDelMiembro(sus), (e) => e.estadoHttp === 404)

  // Cuota sin pagar desde ayer: no reserva y puede pagarla con el enlace
  const deuda = await miembro({ primeraPagada: null })
  await query(`UPDATE suscripciones SET fecha_inicio = $2::date - 2 WHERE id = $1`, [deuda.id, HOY])
  await query(`UPDATE cuotas SET desde = $2::date - 2, hasta = ($2::date - 2) + interval '1 month' WHERE suscripcion_id = $1 AND periodo = 1`, [deuda.id, HOY])
  area = await AREA.datosArea(deuda.email)
  assert.equal(area.suscripcion.puedeReservar, false)
  const aviso = area.avisos.find((a) => a.tipo === 'impago')
  assert.ok(aviso)
  assert.match(aviso.enlace, /^\/cuota\//)
  assert.equal(area.cuotas[0].estado, 'pendiente')
  assert.ok(area.cuotas[0].enlacePago)
  const suya = await ACC.suscripcionVisible(deuda.email)
  await assert.rejects(M.reservarMiembro(suya, { fecha: await laborable(5), desde: '14:00', horas: 4 }, BASE), (e) => e.codigo === 'bloqueo')
})

test('datos para reservar: duraciones, días y periodos', async () => {
  const sus = await miembro({}, { horasPeriodo: 6, maxSesiones: null, franjaDesde: '09:00', franjaHasta: '13:00' })
  let d = await AREA.datosReservar(sus.email)
  assert.deepEqual(d.duraciones.map((x) => x.horas), [4])
  assert.equal(d.duracionPorDefecto, 4)
  assert.equal(d.franjaDesde, '09:00')
  assert.ok(d.desde >= sumarDias(HOY, 3))
  assert.equal(d.periodos[0].restantes, 6)
  assert.equal(d.pagoExtraDisponible, true)
  assert.equal(d.puedeReservar, true)
  const { codigo } = await M.reservarMiembro(sus, { fecha: await laborable(5, 'manana'), desde: '09:00', horas: 4 }, BASE)
  d = await AREA.datosReservar(sus.email)
  assert.deepEqual(d.duraciones.map((x) => x.horas), [2, 4])
  assert.match(d.duraciones[0].texto, /lo que te queda/)
  d = await AREA.datosReservar(sus.email, { codigo })
  assert.equal(d.cambiando.codigo, codigo)
  assert.equal(d.pagoExtraDisponible, false)
  assert.equal(d.duracionPorDefecto, 4)
})

test('mensajes al estudio: con límite al día', async () => {
  const sus = await miembro()
  await assert.rejects(M.mensajeMiembro(sus, { tipo: 'consulta', texto: '' }, BASE), (e) => e.codigo === 'texto')
  assert.deepEqual(await M.mensajeMiembro(sus, { tipo: 'baja', texto: '' }, BASE), { ok: true })
  for (let i = 0; i < 4; i++) await M.mensajeMiembro(sus, { tipo: 'consulta', texto: `Hola ${i}` }, BASE)
  await assert.rejects(M.mensajeMiembro(sus, { tipo: 'consulta', texto: 'Otra vez' }, BASE), (e) => e.codigo === 'limite')
  assert.ok((await SUS.fichaSuscripcion(sus.id)).eventos.some((e) => e.tipo === 'mensaje_miembro' && e.autor === 'cliente'))
})
