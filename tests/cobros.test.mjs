// Cobro mensual automático con la tarjeta guardada (Redsys COF / MIT), con una base de datos
// Postgres real en memoria (PGlite) y el TPV simulado. Las respuestas de Redsys se simulan
// firmadas con una clave inventada (no es la de ningún comercio).
import crypto from 'node:crypto'

process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.REDSYS_COBRO_RECURRENTE = '1'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-C'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-CS'
process.env.ESTUDIO_IBAN = 'ES00 0000 0000 0000 0000 0000'
process.env.REDSYS_COMERCIO = '999999999'
process.env.REDSYS_TERMINAL = '1'
process.env.REDSYS_CLAVE = crypto.randomBytes(24).toString('base64')
process.env.REDSYS_ENTORNO = 'pruebas'

import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as A from '../lib/suscripciones/alta.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import { tareasPendientes, proximoCobro, finCaducidad } from '../lib/suscripciones/reglas.js'
import { contratoSecciones, condicionesModelo } from '../lib/suscripciones/contrato.js'
import { recibirResultado } from '../lib/reservas/flujo.js'
import { firmaSimulada } from '../lib/pagos/simulado.js'
import { redsys, firmar, ErrorCobro } from '../lib/pagos/redsys.js'
import { fechaMadrid, sumarDias, madridAInstante } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())
beforeEach(() => { process.env.SIMULADO_MIT = 'ok' })

const BASE = 'http://localhost:3000'
const HOY = fechaMadrid(new Date())
const enDia = (fecha) => madridAInstante(fecha, '10:00')
let n = 0

async function pagar(campos, resultado = 'ok') {
  return recibirResultado('simulado', { pedido: campos.pedido, importe: campos.importe, resultado, firma: firmaSimulada(campos.pedido, campos.importe, resultado) }, BASE)
}

// Miembro con la tarjeta guardada y el periodo 2 ya empezado (hace 10 días)
async function miembroConTarjeta({ diasAtras = 40 } = {}) {
  const inicio = sumarDias(HOY, -diasAtras)
  const { suscripcion } = await SUS.crearSuscripcion({
    plan: 'creator', nombre: 'Cobro', apellidos: `Auto ${++n}`, email: `cobro${n}@example.com`, telefono: '600000000',
    fechaInicio: inicio, primeraPagada: { metodo: 'tarjeta', fecha: inicio },
  })
  await query(
    `UPDATE suscripciones SET origen = 'web', cobro_auto = true, cobro_enlace = false, tarjeta_ref = $2, tarjeta_cof_txnid = 'TX1',
        tarjeta_ultimos = '0003', tarjeta_caduca = '4912', tarjeta_proveedor = 'simulado', tarjeta_guardada_en = now() WHERE id = $1`,
    [suscripcion.id, `SIMREF${n}`]
  )
  await SUS.asegurarCuotasDeTodas()
  const { rows } = await query('SELECT * FROM cuotas WHERE suscripcion_id = $1 AND periodo = 2', [suscripcion.id])
  return { sus: suscripcion, cuota2: rows[0] }
}

const cuota = async (id) => (await query('SELECT *, cobro_proximo::text AS proximo FROM cuotas WHERE id = $1', [id])).rows[0]
const pagosMit = async (cuotaId) => (await query(`SELECT * FROM pagos_suscripcion WHERE cuota_id = $1 AND tipo = 'mit' ORDER BY id`, [cuotaId])).rows

test('alta con cobro recurrente: solo tarjeta, la tarjeta queda guardada y no se ve la referencia', async () => {
  const v = A.validarAlta({ plan: 'pro', nombre: 'Tarjeta', apellidos: 'Guardada', email: `alta${++n}@example.com`, telefono: '600000000' })
  assert.ok(v.ok)
  const alta = await A.crearAlta(v.datos, BASE)
  assert.equal(alta.pago.campos.guardar, '1')
  const r = await pagar(alta.pago.campos)
  assert.equal(r.aviso, 'alta')
  const sus = r.suscripcion
  assert.equal(sus.cobroAuto, true)
  assert.equal(sus.cobroEnlace, false)
  assert.deepEqual({ ultimos: sus.tarjeta.ultimos, caduca: sus.tarjeta.caduca }, { ultimos: '0003', caduca: '4912' })
  assert.doesNotMatch(JSON.stringify(sus), /SIM\d/) // la referencia de la tarjeta no sale de la base de datos
  const { rows } = await query('SELECT tarjeta_ref, tarjeta_cof_txnid FROM suscripciones WHERE id = $1', [sus.id])
  assert.equal(rows[0].tarjeta_ref, `SIM${alta.pago.campos.pedido}`)
  assert.ok(rows[0].tarjeta_cof_txnid)
  // El contrato dice que se cobra solo cada mes en la tarjeta
  const t = JSON.stringify(contratoSecciones({ c: { ...condicionesModelo('pro'), cobroAuto: sus.cobroAuto }, estudio: { nombre: null, nif: null }, iban: null }))
  assert.match(t, /se cobran automáticamente en esa misma tarjeta/)
  assert.match(t, /deja de cobrar en la tarjeta/)
})

test('cobro automático de la cuota que empieza: pagada, con factura y sin enlace de pago', async () => {
  const { sus, cuota2 } = await miembroConTarjeta()
  assert.equal(cuota2.estado, 'pendiente')
  const r = await A.tareasDiariasSuscripciones(BASE)
  assert.ok(r.cobros.cobradas >= 1)
  assert.equal(r.enlaces, 0)
  const c = await cuota(cuota2.id)
  assert.equal(c.estado, 'pagada')
  assert.equal(c.cobro_estado, null)
  assert.match(c.referencia, /^Cobro automático /)
  const pagos = await pagosMit(cuota2.id)
  assert.equal(pagos.length, 1)
  assert.equal(pagos[0].estado, 'pagado')
  const { rows: fs } = await query('SELECT * FROM facturas WHERE cuota_id = $1 AND sustituida_en IS NULL', [cuota2.id])
  assert.equal(fs.length, 1)
  // Volver a pasar el cron no cobra otra vez
  await A.cobrosAutomaticosDelDia(BASE)
  assert.equal((await pagosMit(cuota2.id)).length, 1)
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })).resultado, 'saltada')
  const { rows: ev } = await query(`SELECT tipo FROM eventos WHERE suscripcion_id = $1 AND tipo LIKE 'cobro_%'`, [sus.id])
  assert.deepEqual(ev.map((e) => e.tipo), ['cobro_intento'])
})

test('dos crons a la vez nunca cobran dos veces la misma cuota', async () => {
  const { cuota2 } = await miembroConTarjeta()
  await Promise.all([A.cobrosAutomaticosDelDia(BASE), A.cobrosAutomaticosDelDia(BASE), A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })])
  const pagos = await pagosMit(cuota2.id)
  assert.equal(pagos.length, 1)
  assert.equal(pagos[0].estado, 'pagado')
  assert.equal((await cuota(cuota2.id)).estado, 'pagada')
  // Y la base de datos tampoco deja un segundo cobro automático de esa cuota
  await assert.rejects(query(`INSERT INTO pagos_suscripcion (cuota_id, proveedor, pedido, importe_cent, tipo) VALUES ($1, 'simulado', 'X0001', 100, 'mit')`, [cuota2.id]))
})

test('tarjeta rechazada: reintentos al día siguiente y a los 3 días, enlace de pago y aviso', async () => {
  process.env.SIMULADO_MIT = 'ko'
  const { sus, cuota2 } = await miembroConTarjeta()
  const r1 = await A.cobrarCuotaAutomatica(cuota2.id, BASE)
  assert.equal(r1.resultado, 'rechazada')
  let c = await cuota(cuota2.id)
  assert.equal(c.estado, 'pendiente')
  assert.equal(c.cobro_estado, 'rechazado')
  assert.equal(c.cobro_intentos, 1)
  assert.equal(c.proximo, sumarDias(HOY, 1))
  assert.ok(c.pago_token, 'le llega el enlace para pagarla')
  assert.ok(c.aviso_pago_en)
  // El mismo día no se reintenta
  await A.cobrosAutomaticosDelDia(BASE)
  assert.equal((await cuota(cuota2.id)).cobro_intentos, 1)
  // Al día siguiente, segundo intento; a los 3 días, el tercero y último
  await A.cobrosAutomaticosDelDia(BASE, { ahora: enDia(sumarDias(HOY, 1)) })
  c = await cuota(cuota2.id)
  assert.equal(c.cobro_intentos, 2)
  assert.equal(c.proximo, sumarDias(HOY, 3))
  await A.cobrosAutomaticosDelDia(BASE, { ahora: enDia(sumarDias(HOY, 2)) })
  assert.equal((await cuota(cuota2.id)).cobro_intentos, 2)
  await A.cobrosAutomaticosDelDia(BASE, { ahora: enDia(sumarDias(HOY, 3)) })
  c = await cuota(cuota2.id)
  assert.equal(c.cobro_intentos, 3)
  assert.equal(c.cobro_estado, 'agotado')
  await A.cobrosAutomaticosDelDia(BASE, { ahora: enDia(sumarDias(HOY, 6)) })
  assert.equal((await cuota(cuota2.id)).cobro_intentos, 3)
  assert.deepEqual((await pagosMit(cuota2.id)).map((p) => p.estado), ['fallido', 'fallido', 'fallido'])

  // En el «Para hacer» del panel
  const ficha = await SUS.fichaSuscripcion(sus.id)
  const tareas = tareasPendientes({ fichas: [{ sus: ficha.sus, cuotas: ficha.cuotas }], hoy: HOY })
  assert.ok(tareas.some((t) => t.tipo === 'cobro_rechazado' && t.urgente))

  // Paga con el enlace (otra tarjeta): queda guardada la nueva y la cuota pagada
  const pagina = await A.paginaCuota(c.pago_token)
  assert.equal(pagina.pagable, true)
  const { pago } = await A.pagarCuota(c.pago_token, BASE)
  assert.equal(pago.campos.guardar, '1')
  const r = await pagar(pago.campos)
  assert.equal(r.aviso, 'cuota')
  c = await cuota(cuota2.id)
  assert.equal(c.estado, 'pagada')
  assert.equal(c.cobro_estado, null)
  const { rows } = await query('SELECT tarjeta_ref, cobro_auto FROM suscripciones WHERE id = $1', [sus.id])
  assert.equal(rows[0].tarjeta_ref, `SIM${pago.campos.pedido}`)
  assert.equal(rows[0].cobro_auto, true)
})

test('desde el panel, «Cobrar ahora» vuelve a intentar una cuota rechazada', async () => {
  process.env.SIMULADO_MIT = 'ko'
  const { cuota2 } = await miembroConTarjeta()
  await A.cobrarCuotaAutomatica(cuota2.id, BASE)
  process.env.SIMULADO_MIT = 'ok'
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE)).resultado, 'saltada') // el cron espera a mañana
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true, autor: 'panel' })).resultado, 'cobrada')
  assert.equal((await cuota(cuota2.id)).estado, 'pagada')
})

test('sin respuesta del banco: «revisar», no se reintenta solo ni se puede pagar con el enlace', async () => {
  process.env.SIMULADO_MIT = 'error'
  const { cuota2 } = await miembroConTarjeta()
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE)).resultado, 'revisar')
  let c = await cuota(cuota2.id)
  assert.equal(c.cobro_estado, 'revisar')
  process.env.SIMULADO_MIT = 'ok'
  await A.cobrosAutomaticosDelDia(BASE, { ahora: enDia(sumarDias(HOY, 1)) })
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })).resultado, 'saltada')
  assert.equal((await pagosMit(cuota2.id)).length, 1)
  await query('UPDATE cuotas SET pago_token = $2 WHERE id = $1', [cuota2.id, 'r'.repeat(32)])
  assert.equal((await A.paginaCuota('r'.repeat(32))).pagable, false)
  await assert.rejects(A.pagarCuota('r'.repeat(32), BASE), /Estamos cobrando/)
  // El estudio comprueba en el portal que no se cobró: se puede volver a cobrar
  await A.resolverCobroRevisar(cuota2.id)
  c = await cuota(cuota2.id)
  assert.equal(c.cobro_estado, 'rechazado')
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })).resultado, 'cobrada')
  assert.deepEqual((await pagosMit(cuota2.id)).map((p) => p.estado), ['fallido', 'pagado'])
})

test('un cobro cortado a medias pasa a «revisar» y se avisa, sin cobrarse otra vez', async () => {
  const { cuota2 } = await miembroConTarjeta()
  await query(`UPDATE cuotas SET cobro_estado = 'cobrando', cobro_iniciado_en = now() - interval '2 hours' WHERE id = $1`, [cuota2.id])
  const r = await A.cobrosAutomaticosDelDia(BASE)
  assert.ok(r.colgados >= 1)
  assert.equal((await cuota(cuota2.id)).cobro_estado, 'revisar')
  assert.equal((await pagosMit(cuota2.id)).length, 0)
})

test('con la baja apuntada, no se cobran las cuotas de después del último día', async () => {
  const { sus, cuota2 } = await miembroConTarjeta()
  const ultimo = sumarDias(cuota2.desde.toISOString ? fechaMadrid(cuota2.desde) : String(cuota2.desde), -1)
  await SUS.darDeBaja(sus.id, { avisoEn: sumarDias(HOY, -20), ultimoDia: ultimo })
  await A.cobrosAutomaticosDelDia(BASE)
  assert.equal((await query('SELECT 1 FROM cuotas WHERE id = $1', [cuota2.id])).rows.length, 0)
  const { rows } = await query(`SELECT 1 FROM pagos_suscripcion p JOIN cuotas c ON c.id = p.cuota_id WHERE c.suscripcion_id = $1 AND p.tipo = 'mit'`, [sus.id])
  assert.equal(rows.length, 0)
})

test('dejar de cobrar desde el panel para los cobros; volver a activarlo los reanuda', async () => {
  const { sus, cuota2 } = await miembroConTarjeta()
  await A.cambiarCobroAutomatico(sus.id, false)
  await A.cobrosAutomaticosDelDia(BASE)
  assert.equal((await cuota(cuota2.id)).estado, 'pendiente')
  await A.cambiarCobroAutomatico(sus.id, true)
  await A.cobrosAutomaticosDelDia(BASE)
  assert.equal((await cuota(cuota2.id)).estado, 'pagada')
})

test('sin REDSYS_COBRO_RECURRENTE no se cobra nada solo', async () => {
  const { cuota2 } = await miembroConTarjeta()
  process.env.REDSYS_COBRO_RECURRENTE = ''
  try {
    assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })).resultado, 'saltada')
    await A.cobrosAutomaticosDelDia(BASE)
    assert.equal((await cuota(cuota2.id)).estado, 'pendiente')
  } finally {
    process.env.REDSYS_COBRO_RECURRENTE = '1'
  }
})

test('aviso si la tarjeta caduca antes del próximo cobro', async () => {
  const { sus } = await miembroConTarjeta({ diasAtras: 5 })
  assert.equal(finCaducidad('2802'), '2028-02-29')
  assert.equal(finCaducidad('2612'), '2026-12-31')
  const sinAviso = await SUS.fichaSuscripcion(sus.id)
  assert.ok(!tareasPendientes({ fichas: [{ sus: sinAviso.sus, cuotas: sinAviso.cuotas }], hoy: HOY }).some((t) => t.tipo === 'tarjeta'))
  await query(`UPDATE suscripciones SET tarjeta_caduca = '2001' WHERE id = $1`, [sus.id])
  const ficha = await SUS.fichaSuscripcion(sus.id)
  const prox = proximoCobro(ficha.sus, ficha.cuotas, HOY)
  assert.ok(prox > HOY)
  assert.ok(tareasPendientes({ fichas: [{ sus: ficha.sus, cuotas: ficha.cuotas }], hoy: HOY }).some((t) => t.tipo === 'tarjeta'))
})

// ---------- Redsys: mensajes firmados ----------

const decodificar = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
function respuestaFirmada(datos) {
  const b64 = Buffer.from(JSON.stringify(datos), 'utf8').toString('base64')
  return { Ds_SignatureVersion: 'HMAC_SHA256_V1', Ds_MerchantParameters: b64, Ds_Signature: firmar(b64, datos.Ds_Order, process.env.REDSYS_CLAVE) }
}

test('Redsys: el primer pago pide guardar la tarjeta (COF) y solo con tarjeta', () => {
  const f = redsys.crearPago({ pedido: '2611000001', importeCent: 19900, descripcion: 'x', titular: 'y', urlOk: 'a', urlKo: 'b', urlNotificacion: 'c', guardarTarjeta: true })
  const p = decodificar(f.campos.Ds_MerchantParameters)
  assert.equal(p.DS_MERCHANT_IDENTIFIER, 'REQUIRED')
  assert.equal(p.DS_MERCHANT_COF_INI, 'S')
  assert.equal(p.DS_MERCHANT_COF_TYPE, 'R')
  assert.equal(p.DS_MERCHANT_PAYMETHODS, 'C')
  const normal = decodificar(redsys.crearPago({ pedido: '2611000002', importeCent: 100, urlOk: 'a', urlKo: 'b', urlNotificacion: 'c' }).campos.Ds_MerchantParameters)
  assert.equal(normal.DS_MERCHANT_IDENTIFIER, undefined)
})

test('Redsys: del aviso del banco se guarda la referencia, nunca el número de la tarjeta', () => {
  const r = redsys.verificar(respuestaFirmada({
    Ds_Order: '2611000003', Ds_MerchantCode: '999999999', Ds_Amount: '19900', Ds_Response: '0000', Ds_AuthorisationCode: '123456',
    Ds_Merchant_Identifier: 'abc123ref', Ds_Merchant_Cof_Txnid: '2611TXN', Ds_Card_Number: '454881******0003', Ds_ExpiryDate: '4912',
  }))
  assert.equal(r.pagado, true)
  assert.deepEqual(r.tarjeta, { ref: 'abc123ref', cofTxnid: '2611TXN', ultimos: '0003', caduca: '4912' })
  const sin = redsys.verificar(respuestaFirmada({ Ds_Order: '2611000004', Ds_MerchantCode: '999999999', Ds_Response: '0000' }))
  assert.equal(sin.tarjeta, null)
})

test('Redsys: cobro MIT por REST con la referencia; rechazos y sin respuesta', async () => {
  let enviado = null
  const fetchOk = async (url, opciones) => {
    enviado = { url, cuerpo: JSON.parse(opciones.body) }
    const p = decodificar(enviado.cuerpo.Ds_MerchantParameters)
    return { json: async () => respuestaFirmada({ Ds_Order: p.DS_MERCHANT_ORDER, Ds_MerchantCode: '999999999', Ds_Amount: p.DS_MERCHANT_AMOUNT, Ds_Response: '0000', Ds_AuthorisationCode: '654321' }) }
  }
  const r = await redsys.cobrarMit({ pedido: '2611000005', importeCent: 19900, tarjetaRef: 'abc123ref', cofTxnid: '2611TXN', descripcion: 'Cuota', fetchImpl: fetchOk })
  assert.equal(r.pagado, true)
  assert.match(enviado.url, /\/sis\/rest\/trataPeticionREST$/)
  const p = decodificar(enviado.cuerpo.Ds_MerchantParameters)
  assert.equal(p.DS_MERCHANT_IDENTIFIER, 'abc123ref')
  assert.equal(p.DS_MERCHANT_COF_TXNID, '2611TXN')
  assert.equal(p.DS_MERCHANT_COF_INI, 'N')
  assert.equal(p.DS_MERCHANT_COF_TYPE, 'R')
  assert.equal(p.DS_MERCHANT_EXCEP_SCA, 'MIT')
  assert.equal(p.DS_MERCHANT_DIRECTPAYMENT, 'true')
  assert.equal(enviado.cuerpo.Ds_Signature, firmar(enviado.cuerpo.Ds_MerchantParameters, '2611000005', process.env.REDSYS_CLAVE))

  // Denegada por el banco (Ds_Response 0190): no pagado
  const fetchDenegada = async (url, opciones) => {
    const q = decodificar(JSON.parse(opciones.body).Ds_MerchantParameters)
    return { json: async () => respuestaFirmada({ Ds_Order: q.DS_MERCHANT_ORDER, Ds_MerchantCode: '999999999', Ds_Response: '0190' }) }
  }
  assert.equal((await redsys.cobrarMit({ pedido: '2611000006', importeCent: 100, tarjetaRef: 'x', fetchImpl: fetchDenegada })).pagado, false)
  // Error de Redsys (SIS0xxx): no se ha cobrado
  const e1 = await redsys.cobrarMit({ pedido: '2611000007', importeCent: 100, tarjetaRef: 'x', fetchImpl: async () => ({ json: async () => ({ errorCode: 'SIS0256' }) }) }).catch((e) => e)
  assert.ok(e1 instanceof ErrorCobro)
  assert.equal(e1.desconocido, false)
  assert.equal(e1.codigo, 'SIS0256')
  // Sin respuesta o con la firma mal: no sabemos si se cobró
  const e2 = await redsys.cobrarMit({ pedido: '2611000008', importeCent: 100, tarjetaRef: 'x', fetchImpl: async () => { throw new Error('ECONNRESET') } }).catch((e) => e)
  assert.equal(e2.desconocido, true)
  const e3 = await redsys.cobrarMit({ pedido: '2611000009', importeCent: 100, tarjetaRef: 'x', fetchImpl: async () => ({ json: async () => ({ ...respuestaFirmada({ Ds_Order: '2611000009', Ds_Response: '0000' }), Ds_Signature: 'mal' }) }) }).catch((e) => e)
  assert.equal(e3.desconocido, true)
})
