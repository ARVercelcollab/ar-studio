// TPV virtual Redsys (el que usan CaixaBank y la mayoría de bancos españoles).
// Integración por redirección con firma HMAC_SHA256_V1:
// - El cliente sale de la web a la página de pago de Redsys con un formulario firmado.
// - Redsys avisa del resultado a DS_MERCHANT_MERCHANTURL (servidor a servidor) y
//   devuelve al cliente a URLOK/URLKO con los mismos datos firmados.
//
// Variables de entorno:
//   REDSYS_COMERCIO   número de comercio (FUC), p. ej. 999008881
//   REDSYS_TERMINAL   terminal, normalmente 1
//   REDSYS_CLAVE      clave secreta SHA-256 del comercio (en base64)
//   REDSYS_ENTORNO    'pruebas' o 'real'
//   REDSYS_METODOS    opcional: 'C' solo tarjeta, 'z' solo Bizum, vacío = lo que tenga el TPV

import crypto from 'node:crypto'

const URLS = {
  pruebas: 'https://sis-t.redsys.es:25443/sis/realizarPago',
  real: 'https://sis.redsys.es/sis/realizarPago',
}

function config() {
  const comercio = process.env.REDSYS_COMERCIO
  const clave = process.env.REDSYS_CLAVE
  if (!comercio || !clave) throw new Error('Faltan REDSYS_COMERCIO o REDSYS_CLAVE')
  return {
    comercio,
    clave,
    terminal: process.env.REDSYS_TERMINAL || '1',
    entorno: process.env.REDSYS_ENTORNO === 'real' ? 'real' : 'pruebas',
    metodos: process.env.REDSYS_METODOS || '',
  }
}

// Clave de cada operación: 3DES (CBC, IV a ceros, relleno con ceros) del número de pedido
export function claveOperacion(claveBase64, pedido) {
  const clave = Buffer.from(claveBase64, 'base64')
  const datos = Buffer.from(pedido, 'utf8')
  const relleno = Buffer.alloc((8 - (datos.length % 8)) % 8, 0)
  const cifrador = crypto.createCipheriv('des-ede3-cbc', clave, Buffer.alloc(8, 0))
  cifrador.setAutoPadding(false)
  return Buffer.concat([cifrador.update(Buffer.concat([datos, relleno])), cifrador.final()])
}

export function firmar(parametrosBase64, pedido, claveBase64) {
  return crypto.createHmac('sha256', claveOperacion(claveBase64, pedido)).update(parametrosBase64).digest('base64')
}

// Redsys a veces usa base64 "URL safe" (- y _ en vez de + y /)
const normal = (b64) => String(b64 || '').replace(/-/g, '+').replace(/_/g, '/')
const urlSafe = (b64) => String(b64 || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function campo(obj, nombre) {
  const clave = Object.keys(obj).find((k) => k.toLowerCase() === nombre.toLowerCase())
  return clave ? obj[clave] : undefined
}

export const redsys = {
  id: 'redsys',
  nombre: 'Redsys',

  esDePrueba() {
    return config().entorno !== 'real'
  },

  // pedido: 4 a 12 caracteres, los 4 primeros números. importeCent: entero.
  crearPago({ pedido, importeCent, descripcion, titular, urlOk, urlKo, urlNotificacion }) {
    const c = config()
    const parametros = {
      DS_MERCHANT_AMOUNT: String(importeCent),
      DS_MERCHANT_ORDER: pedido,
      DS_MERCHANT_MERCHANTCODE: c.comercio,
      DS_MERCHANT_CURRENCY: '978',
      DS_MERCHANT_TRANSACTIONTYPE: '0',
      DS_MERCHANT_TERMINAL: c.terminal,
      DS_MERCHANT_MERCHANTURL: urlNotificacion,
      DS_MERCHANT_URLOK: urlOk,
      DS_MERCHANT_URLKO: urlKo,
      DS_MERCHANT_PRODUCTDESCRIPTION: String(descripcion || '').slice(0, 125),
      DS_MERCHANT_TITULAR: String(titular || '').slice(0, 60),
      DS_MERCHANT_MERCHANTNAME: 'AR Studio',
      DS_MERCHANT_CONSUMERLANGUAGE: '001',
    }
    if (c.metodos) parametros.DS_MERCHANT_PAYMETHODS = c.metodos
    const base64 = Buffer.from(JSON.stringify(parametros), 'utf8').toString('base64')
    return {
      metodo: 'POST',
      accion: URLS[c.entorno],
      campos: {
        Ds_SignatureVersion: 'HMAC_SHA256_V1',
        Ds_MerchantParameters: base64,
        Ds_Signature: firmar(base64, pedido, c.clave),
      },
    }
  },

  // Comprueba la firma de lo que manda Redsys (notificación POST o vuelta GET).
  // Devuelve { pedido, pagado, importeCent, codigo, autorizacion, datos } o lanza un error.
  verificar(entrada) {
    const c = config()
    const parametros = campo(entrada, 'Ds_MerchantParameters')
    const firma = campo(entrada, 'Ds_Signature')
    if (!parametros || !firma) throw new Error('Faltan los datos de Redsys')
    const datos = JSON.parse(Buffer.from(normal(parametros), 'base64').toString('utf8'))
    const pedido = String(campo(datos, 'Ds_Order') || '')
    if (!pedido) throw new Error('Redsys no manda el número de pedido')
    const esperada = firmar(parametros, pedido, c.clave)
    const a = Buffer.from(urlSafe(esperada))
    const b = Buffer.from(urlSafe(firma))
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Firma de Redsys no válida')
    if (String(campo(datos, 'Ds_MerchantCode') || c.comercio) !== c.comercio) throw new Error('El pago es de otro comercio')
    const respuesta = parseInt(String(campo(datos, 'Ds_Response') ?? '9999'), 10)
    return {
      pedido,
      pagado: Number.isFinite(respuesta) && respuesta >= 0 && respuesta <= 99,
      importeCent: campo(datos, 'Ds_Amount') != null ? Number(campo(datos, 'Ds_Amount')) : null,
      codigo: String(campo(datos, 'Ds_Response') ?? ''),
      autorizacion: campo(datos, 'Ds_AuthorisationCode') ? String(campo(datos, 'Ds_AuthorisationCode')).trim() : null,
      datos,
    }
  },
}
