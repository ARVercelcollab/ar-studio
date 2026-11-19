// TPV simulado para probar en local y en las vistas previas, sin cobrar de verdad.
// Nunca funciona en la web de producción (VERCEL_ENV=production).

import crypto from 'node:crypto'
import { ErrorCobro } from './redsys.js'

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

  esDePrueba() {
    return true
  },

  crearPago({ pedido, importeCent, descripcion, urlOk, urlKo, guardarTarjeta = false }) {
    if (!simuladoPermitido()) throw new Error('El TPV simulado no se puede usar en producción')
    const campos = { pedido, importe: String(importeCent), concepto: String(descripcion || ''), ok: urlOk, ko: urlKo, firma: firmaSimulada(pedido, importeCent) }
    if (guardarTarjeta) campos.guardar = '1'
    return { metodo: 'GET', accion: '/pago-simulado', campos }
  },

  // Cobro con la tarjeta guardada (simulado). SIMULADO_MIT: 'ok' (por defecto), 'ko'
  // (tarjeta rechazada) o 'error' (sin respuesta del banco), para probar cada caso.
  async cobrarMit({ pedido, importeCent, tarjetaRef }) {
    if (!simuladoPermitido()) throw new Error('El TPV simulado no se puede usar en producción')
    const modo = process.env.SIMULADO_MIT || 'ok'
    if (!tarjetaRef) throw new ErrorCobro('No hay tarjeta guardada.')
    if (modo === 'error') throw new ErrorCobro('Sin respuesta del TPV simulado', { desconocido: true })
    const pagado = modo === 'ok'
    return { pedido, pagado, importeCent: Number(importeCent), codigo: pagado ? '0000' : '0190', autorizacion: pagado ? 'SIMMIT' : null, tarjeta: null, datos: { simulado: true, mit: true } }
  },

  verificar(entrada) {
    if (!simuladoPermitido()) throw new Error('El TPV simulado no se puede usar en producción')
    const { pedido, importe, resultado, firma } = entrada
    const esperada = firmaSimulada(pedido, importe, resultado)
    const a = Buffer.from(esperada)
    const b = Buffer.from(String(firma || ''))
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Firma simulada no válida')
    const pagado = resultado === 'ok'
    // Tarjeta de pruebas «guardada» (como haría Redsys con COF); solo se usa si se pidió
    const tarjeta = pagado ? { ref: `SIM${pedido}`, cofTxnid: `SIMTX${pedido}`, ultimos: '0003', caduca: '4912' } : null
    return { pedido, pagado, importeCent: Number(importe), codigo: pagado ? '0000' : '0190', autorizacion: pagado ? 'SIM001' : null, tarjeta, datos: { simulado: true } }
  },
}
