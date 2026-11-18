// TPV virtual Addon Payments (Comercia Global Payments, la empresa de CaixaBank y
// Global Payments). Página de pago alojada (HPP) con firma SHA-256.
//
// ATENCIÓN: escrito siguiendo la especificación de la HPP de Global Payments, pero
// sin probar todavía con credenciales de pruebas de Comercia. Antes de usarlo en real,
// hay que hacer un pago de prueba en su entorno sandbox.
//
// Variables de entorno:
//   ADDON_COMERCIO   MERCHANT_ID que da Comercia
//   ADDON_CUENTA     ACCOUNT (subcuenta), normalmente 'internet'
//   ADDON_SECRETO    shared secret
//   ADDON_ENTORNO    'pruebas' o 'real'

import crypto from 'node:crypto'

const URLS = {
  pruebas: 'https://hpp.sandbox.addonpayments.com/pay',
  real: 'https://hpp.addonpayments.com/pay',
}

function config() {
  const comercio = process.env.ADDON_COMERCIO
  const secreto = process.env.ADDON_SECRETO
  if (!comercio || !secreto) throw new Error('Faltan ADDON_COMERCIO o ADDON_SECRETO')
  return {
    comercio,
    secreto,
    cuenta: process.env.ADDON_CUENTA || 'internet',
    entorno: process.env.ADDON_ENTORNO === 'real' ? 'real' : 'pruebas',
  }
}

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')

export function hashAddon(partes, secreto) {
  return sha256(`${sha256(partes.join('.'))}.${secreto}`)
}

function marcaDeTiempo(fecha = new Date()) {
  const d = (n) => String(n).padStart(2, '0')
  return `${fecha.getUTCFullYear()}${d(fecha.getUTCMonth() + 1)}${d(fecha.getUTCDate())}${d(fecha.getUTCHours())}${d(fecha.getUTCMinutes())}${d(fecha.getUTCSeconds())}`
}

export const addon = {
  id: 'addon',
  nombre: 'Addon Payments',

  crearPago({ pedido, importeCent, descripcion, email, urlNotificacion, ahora = new Date() }) {
    const c = config()
    const timestamp = marcaDeTiempo(ahora)
    const campos = {
      TIMESTAMP: timestamp,
      MERCHANT_ID: c.comercio,
      ACCOUNT: c.cuenta,
      ORDER_ID: pedido,
      AMOUNT: String(importeCent),
      CURRENCY: 'EUR',
      AUTO_SETTLE_FLAG: '1',
      HPP_VERSION: '2',
      HPP_LANG: 'es',
      MERCHANT_RESPONSE_URL: urlNotificacion,
      HPP_CUSTOMER_EMAIL: email || '',
      COMMENT1: String(descripcion || '').slice(0, 255),
    }
    campos.SHA256HASH = hashAddon([timestamp, c.comercio, pedido, campos.AMOUNT, 'EUR'], c.secreto)
    return { metodo: 'POST', accion: URLS[c.entorno], campos }
  },

  // Respuesta que la HPP manda (POST) a MERCHANT_RESPONSE_URL
  verificar(entrada) {
    const c = config()
    const v = (k) => (entrada[k] == null ? '' : String(entrada[k]))
    const recibido = v('SHA256HASH') || v('SHA1HASH')
    const esperado = hashAddon([v('TIMESTAMP'), v('MERCHANT_ID'), v('ORDER_ID'), v('RESULT'), v('MESSAGE'), v('PASREF'), v('AUTHCODE')], c.secreto)
    const a = Buffer.from(esperado)
    const b = Buffer.from(recibido.toLowerCase())
    if (!v('SHA256HASH') || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Firma de Addon Payments no válida')
    if (v('MERCHANT_ID') !== c.comercio) throw new Error('El pago es de otro comercio')
    return {
      pedido: v('ORDER_ID'),
      pagado: v('RESULT') === '00',
      importeCent: entrada.AMOUNT != null ? Number(entrada.AMOUNT) : null,
      codigo: v('RESULT'),
      autorizacion: v('AUTHCODE') || null,
      datos: { RESULT: v('RESULT'), MESSAGE: v('MESSAGE'), PASREF: v('PASREF'), AUTHCODE: v('AUTHCODE') },
    }
  },
}
