// TPV simulado para probar en local y en las vistas previas, sin cobrar de verdad.
// Nunca funciona en la web de producción (VERCEL_ENV=production).

import crypto from 'node:crypto'

function secreto() {
  return process.env.SESSION_SECRET || 'solo-para-desarrollo-local'
}

export function firmaSimulada(pedido, importeCent, resultado = '') {
  return crypto.createHmac('sha256', secreto()).update(`${pedido}|${importeCent}|${resultado}`).digest('hex')
}

export function simuladoPermitido() {
  return process.env.VERCEL_ENV !== 'production'
}

export const simulado = {
  id: 'simulado',
  nombre: 'TPV de pruebas',

  crearPago({ pedido, importeCent, descripcion, urlOk, urlKo }) {
    if (!simuladoPermitido()) throw new Error('El TPV simulado no se puede usar en producción')
    return {
      metodo: 'GET',
      accion: '/pago-simulado',
      campos: { pedido, importe: String(importeCent), concepto: String(descripcion || ''), ok: urlOk, ko: urlKo, firma: firmaSimulada(pedido, importeCent) },
    }
  },

  verificar(entrada) {
    if (!simuladoPermitido()) throw new Error('El TPV simulado no se puede usar en producción')
    const { pedido, importe, resultado, firma } = entrada
    const esperada = firmaSimulada(pedido, importe, resultado)
    const a = Buffer.from(esperada)
    const b = Buffer.from(String(firma || ''))
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Firma simulada no válida')
    return { pedido, pagado: resultado === 'ok', importeCent: Number(importe), codigo: resultado === 'ok' ? '0000' : '0190', autorizacion: resultado === 'ok' ? 'SIM001' : null, datos: { simulado: true } }
  },
}
