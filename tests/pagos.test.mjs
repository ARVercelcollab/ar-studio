import test from 'node:test'
import assert from 'node:assert/strict'

// Comercio de pruebas público de Redsys (no es del estudio y no cobra nada)
process.env.REDSYS_COMERCIO = '999008881'
process.env.REDSYS_TERMINAL = '1'
process.env.REDSYS_CLAVE = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7'
process.env.REDSYS_ENTORNO = 'pruebas'
process.env.ADDON_COMERCIO = 'arstudiotest'
process.env.ADDON_SECRETO = 'secreto-de-prueba'

const { redsys, firmar } = await import('../lib/pagos/redsys.js')
const { addon, hashAddon } = await import('../lib/pagos/addon.js')

// Respuesta real del entorno de pruebas de Redsys (18-11-2026, pedido 261100000034,
// tarjeta de pruebas, autorización 474804), tal como llegó a la URL de vuelta.
const VUELTA_REAL = {
  Ds_SignatureVersion: 'HMAC_SHA256_V1',
  Ds_MerchantParameters: 'eyJEc19EYXRlIjoiMTglMkYxMSUyRjIwMjYiLCJEc19Ib3VyIjoiMTUlM0ExMiIsIkRzX1NlY3VyZVBheW1lbnQiOiIxIiwiRHNfQW1vdW50IjoiMTQ1MjAiLCJEc19DdXJyZW5jeSI6Ijk3OCIsIkRzX09yZGVyIjoiMjYxMTAwMDAwMDM0IiwiRHNfTWVyY2hhbnRDb2RlIjoiOTk5MDA4ODgxIiwiRHNfVGVybWluYWwiOiIwMDEiLCJEc19SZXNwb25zZSI6IjAwMDAiLCJEc19UcmFuc2FjdGlvblR5cGUiOiIwIiwiRHNfTWVyY2hhbnREYXRhIjoiIiwiRHNfQXV0aG9yaXNhdGlvbkNvZGUiOiI0NzQ4MDQiLCJEc19DYXJkX051bWJlciI6IjQ1NDg4MSoqKioqKjAwMDMiLCJEc19Db25zdW1lckxhbmd1YWdlIjoiMSIsIkRzX0NhcmRfQ291bnRyeSI6IjcyNCIsIkRzX0NhcmRfVHlwb2xvZ3kiOiJDT05TVU1PIiwiRHNfQ2FyZF9UeXBlIjoiWCIsIkRzX0NhcmRfQnJhbmQiOiIxIiwiRHNfUHJvY2Vzc2VkUGF5TWV0aG9kIjoiNzgiLCJEc19FQ0kiOiIwNSIsIkRzX1Jlc3BvbnNlX0Rlc2NyaXB0aW9uIjoiT1BFUkFDSU9OK0FVVE9SSVpBREEiLCJEc19Db250cm9sXzE3OTUwMTExNTgwMzgiOiIxNzk1MDExMTU4MDM4In0=',
  Ds_Signature: 'fKQ9Z_6WHchTognaYIfoYyjl4OM3lN9R18WJXnM5ZWI=',
}

test('Redsys: acepta una respuesta real firmada por Redsys', () => {
  const r = redsys.verificar(VUELTA_REAL)
  assert.equal(r.pedido, '261100000034')
  assert.equal(r.pagado, true)
  assert.equal(r.importeCent, 14520)
  assert.equal(r.codigo, '0000')
  assert.equal(r.autorizacion, '474804')
})

test('Redsys: rechaza respuestas manipuladas', () => {
  const datos = JSON.parse(Buffer.from(VUELTA_REAL.Ds_MerchantParameters, 'base64').toString())
  datos.Ds_Amount = '100'
  const manipulada = { ...VUELTA_REAL, Ds_MerchantParameters: Buffer.from(JSON.stringify(datos)).toString('base64') }
  assert.throws(() => redsys.verificar(manipulada), /Firma/)
  assert.throws(() => redsys.verificar({ ...VUELTA_REAL, Ds_Signature: 'AAAA' }), /Firma/)
  assert.throws(() => redsys.verificar({}), /Faltan/)
})

test('Redsys: un pago denegado no cuenta como pagado', () => {
  const datos = { Ds_Order: '261100000099', Ds_Response: '0190', Ds_Amount: '9680', Ds_MerchantCode: '999008881' }
  const b64 = Buffer.from(JSON.stringify(datos)).toString('base64')
  const r = redsys.verificar({ Ds_MerchantParameters: b64, Ds_Signature: firmar(b64, '261100000099', process.env.REDSYS_CLAVE) })
  assert.equal(r.pagado, false)
  assert.equal(r.codigo, '0190')
})

test('Redsys: el formulario de pago lleva importe, pedido y URLs', () => {
  const f = redsys.crearPago({ pedido: '261100000100', importeCent: 9680, descripcion: 'x', titular: 'y', urlOk: 'https://a/ok', urlKo: 'https://a/ko', urlNotificacion: 'https://a/n' })
  assert.equal(f.accion, 'https://sis-t.redsys.es:25443/sis/realizarPago')
  const p = JSON.parse(Buffer.from(f.campos.Ds_MerchantParameters, 'base64').toString())
  assert.equal(p.DS_MERCHANT_AMOUNT, '9680')
  assert.equal(p.DS_MERCHANT_ORDER, '261100000100')
  assert.equal(p.DS_MERCHANT_CURRENCY, '978')
  assert.equal(p.DS_MERCHANT_MERCHANTURL, 'https://a/n')
  assert.equal(f.campos.Ds_Signature, firmar(f.campos.Ds_MerchantParameters, '261100000100', process.env.REDSYS_CLAVE))
})

test('Addon Payments: firma del pago y comprobación de la respuesta', () => {
  const f = addon.crearPago({ pedido: '261100000200', importeCent: 18392, email: 'a@b.es', urlNotificacion: 'https://a/r', ahora: new Date('2026-11-18T10:00:00Z') })
  assert.equal(f.campos.TIMESTAMP, '20261118100000')
  assert.equal(f.campos.SHA256HASH, hashAddon(['20261118100000', 'arstudiotest', '261100000200', '18392', 'EUR'], 'secreto-de-prueba'))
  const resp = { TIMESTAMP: '20261118100105', MERCHANT_ID: 'arstudiotest', ORDER_ID: '261100000200', RESULT: '00', MESSAGE: 'AUTHORISED', PASREF: 'abc', AUTHCODE: '12345', AMOUNT: '18392' }
  resp.SHA256HASH = hashAddon([resp.TIMESTAMP, resp.MERCHANT_ID, resp.ORDER_ID, resp.RESULT, resp.MESSAGE, resp.PASREF, resp.AUTHCODE], 'secreto-de-prueba')
  const ok = addon.verificar(resp)
  assert.equal(ok.pagado, true)
  assert.equal(ok.pedido, '261100000200')
  assert.throws(() => addon.verificar({ ...resp, RESULT: '101' }), /Firma/)
})
