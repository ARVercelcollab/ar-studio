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
//   REDSYS_COBRO_RECURRENTE  '1' = guardar la tarjeta en el alta de miembros (COF, «pago por
//                     referencia») y cobrar sola cada cuota mensual por la API REST (MIT).
//                     Comercia tiene que tenerlo activado en el TPV.
//
// Cobro recurrente (COF): el primer pago lo hace la persona en la página del banco con
// DS_MERCHANT_IDENTIFIER=REQUIRED, COF_INI=S y COF_TYPE=R. Redsys devuelve una referencia
// de la tarjeta (Ds_Merchant_Identifier) y el id de la operación inicial (Ds_Merchant_Cof_Txnid).
// Nunca vemos ni guardamos el número de la tarjeta. Cada mes, el servidor cobra con esa
// referencia por trataPeticionREST como operación iniciada por el comercio (EXCEP_SCA=MIT).

import crypto from 'node:crypto'

const URLS = {
  pruebas: 'https://sis-t.redsys.es:25443/sis/realizarPago',
  real: 'https://sis.redsys.es/sis/realizarPago',
}
const URLS_REST = {
  pruebas: 'https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST',
  real: 'https://sis.redsys.es/sis/rest/trataPeticionREST',
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

// Lo que Redsys devuelve de la tarjeta guardada (COF). Solo los 4 últimos dígitos: el
// número viene enmascarado (454881******0003) y no se guarda entero nunca.
function tarjetaDe(datos) {
  const ref = campo(datos, 'Ds_Merchant_Identifier')
  if (!ref || String(ref).toUpperCase() === 'REQUIRED') return null
  const numero = String(campo(datos, 'Ds_Card_Number') || campo(datos, 'Ds_CardNumber') || '')
  const digitos = numero.replace(/\D/g, '')
  const caduca = String(campo(datos, 'Ds_ExpiryDate') || campo(datos, 'Ds_Card_ExpiryDate') || '').replace(/\D/g, '')
  return {
    ref: String(ref),
    cofTxnid: campo(datos, 'Ds_Merchant_Cof_Txnid') ? String(campo(datos, 'Ds_Merchant_Cof_Txnid')) : null,
    ultimos: digitos.length >= 4 ? digitos.slice(-4) : null,
    caduca: /^\d{4}$/.test(caduca) ? caduca : null, // AAMM
  }
}

// Error de un cobro MIT. desconocido = no sabemos si se ha cobrado (sin respuesta del banco)
export class ErrorCobro extends Error {
  constructor(mensaje, { desconocido = false, codigo = null } = {}) {
    super(mensaje)
    this.desconocido = desconocido
    this.codigo = codigo
  }
}

function parametrosFirmados(parametros, pedido, clave) {
  const base64 = Buffer.from(JSON.stringify(parametros), 'utf8').toString('base64')
  return { Ds_SignatureVersion: 'HMAC_SHA256_V1', Ds_MerchantParameters: base64, Ds_Signature: firmar(base64, pedido, clave) }
}

export const redsys = {
  id: 'redsys',
  nombre: 'Redsys',

  esDePrueba() {
    return config().entorno !== 'real'
  },

  // pedido: 4 a 12 caracteres, los 4 primeros números. importeCent: entero.
  // guardarTarjeta: primer pago de una suscripción con cobro recurrente (solo tarjeta)
  crearPago({ pedido, importeCent, descripcion, titular, urlOk, urlKo, urlNotificacion, guardarTarjeta = false }) {
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
    if (guardarTarjeta) {
      // Bizum no admite cobros recurrentes: este pago va solo con tarjeta
      parametros.DS_MERCHANT_PAYMETHODS = 'C'
      parametros.DS_MERCHANT_IDENTIFIER = 'REQUIRED'
      parametros.DS_MERCHANT_COF_INI = 'S'
      parametros.DS_MERCHANT_COF_TYPE = 'R'
    }
    return { metodo: 'POST', accion: URLS[c.entorno], campos: parametrosFirmados(parametros, pedido, c.clave) }
  },

  // Cobro de una cuota con la tarjeta guardada, sin que la persona esté delante (MIT).
  // Devuelve lo mismo que verificar() o lanza ErrorCobro.
  async cobrarMit({ pedido, importeCent, tarjetaRef, cofTxnid, descripcion, fetchImpl = globalThis.fetch, timeoutMs = 25000 }) {
    const c = config()
    if (!tarjetaRef) throw new ErrorCobro('No hay tarjeta guardada.')
    const parametros = {
      DS_MERCHANT_AMOUNT: String(importeCent),
      DS_MERCHANT_ORDER: pedido,
      DS_MERCHANT_MERCHANTCODE: c.comercio,
      DS_MERCHANT_CURRENCY: '978',
      DS_MERCHANT_TRANSACTIONTYPE: '0',
      DS_MERCHANT_TERMINAL: c.terminal,
      DS_MERCHANT_IDENTIFIER: tarjetaRef,
      DS_MERCHANT_COF_INI: 'N',
      DS_MERCHANT_COF_TYPE: 'R',
      DS_MERCHANT_EXCEP_SCA: 'MIT',
      DS_MERCHANT_DIRECTPAYMENT: 'true',
      DS_MERCHANT_PRODUCTDESCRIPTION: String(descripcion || '').slice(0, 125),
    }
    if (cofTxnid) parametros.DS_MERCHANT_COF_TXNID = cofTxnid
    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), timeoutMs)
    let respuesta
    try {
      const r = await fetchImpl(URLS_REST[c.entorno], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parametrosFirmados(parametros, pedido, c.clave)),
        signal: control.signal,
      })
      respuesta = await r.json()
    } catch (e) {
      // Sin respuesta: puede que el banco lo haya cobrado. No se reintenta solo.
      throw new ErrorCobro(`Sin respuesta de Redsys (${e.name === 'AbortError' ? 'tiempo agotado' : e.message})`, { desconocido: true })
    } finally {
      clearTimeout(reloj)
    }
    const error = campo(respuesta || {}, 'errorCode')
    // SIS0xxx: Redsys rechaza la petición (datos, tarjeta no válida…): no se ha cobrado
    if (error) throw new ErrorCobro(`Redsys rechaza el cobro (${error})`, { codigo: String(error) })
    try {
      return this.verificar(respuesta)
    } catch (e) {
      throw new ErrorCobro(`Respuesta de Redsys no válida (${e.message})`, { desconocido: true })
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
      tarjeta: tarjetaDe(datos),
      datos,
    }
  },
}
