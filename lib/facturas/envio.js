// Emitir facturas y mandarlas por correo (al cliente, con copia al estudio)
import { emitirFactura, emitirFacturaCuota, facturaDeReserva, marcarFacturaEnviada } from './servicio.js'
import { pdfFactura } from './pdf.js'
import { correoFactura, avisoFacturaFallida } from '../reservas/correos.js'
import { registrarEvento } from '../reservas/servicio.js'
import { query } from '../db/index.js'
import { textoFranja, fechaDdMmAaaa, sumarDias } from '../reservas/tiempo.js'

const PLAN_NOMBRE = { starter: 'Starter', creator: 'Creator', pro: 'Pro' }

// Factura de una reserva (alquiler por horas, o las horas aparte de una sesión de suscripción)
export async function emitirYEnviar(reserva, { datosCliente = null, reenviar = false } = {}) {
  const { factura, nueva } = await emitirFactura(reserva.id, datosCliente)
  if (!nueva && factura.enviadaEn && !reenviar) return { factura, enviada: false }
  if (!reserva.email) return { factura, enviada: false }
  const pdf = await pdfFactura(factura)
  await correoFactura({ nombre: reserva.nombre, email: reserva.email }, factura, pdf, {
    concepto: `de tu reserva ${reserva.codigo} del ${textoFranja(reserva.inicio, reserva.fin)}`,
  })
  await marcarFacturaEnviada(factura.id, reserva.email)
  await registrarEvento(reserva.id, 'factura_enviada', { codigo: factura.codigo, a: reserva.email }, { suscripcionId: reserva.suscripcionId ?? null })
  return { factura, enviada: true }
}

// Factura de la cuota de un periodo de suscripción
export async function emitirYEnviarCuota(cuotaId, { datosCliente = null, reenviar = false } = {}) {
  const { factura, nueva } = await emitirFacturaCuota(cuotaId, datosCliente)
  if (!nueva && factura.enviadaEn && !reenviar) return { factura, enviada: false }
  const { rows } = await query(
    `SELECT s.id, s.nombre, s.email, s.plan, c.desde::text AS desde, c.hasta::text AS hasta
       FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id WHERE c.id = $1`,
    [Number(cuotaId)]
  )
  const s = rows[0]
  const pdf = await pdfFactura(factura)
  await correoFactura({ nombre: s.nombre, email: s.email }, factura, pdf, {
    concepto: `de tu suscripción ${PLAN_NOMBRE[s.plan] || s.plan} (del ${fechaDdMmAaaa(s.desde)} al ${fechaDdMmAaaa(sumarDias(s.hasta, -1))})`,
  })
  await marcarFacturaEnviada(factura.id, s.email)
  await registrarEvento(null, 'factura_enviada', { codigo: factura.codigo, a: s.email }, { suscripcionId: s.id, autor: 'panel' })
  return { factura, enviada: true }
}

// Para los procesos automáticos: si falla, avisa al estudio en vez de romper el pago
export async function facturaAutomatica(reserva, { urlPanel }) {
  try {
    return await emitirYEnviar(reserva)
  } catch (e) {
    console.error('[facturas] no se pudo emitir/enviar', reserva.codigo, e.message)
    await registrarEvento(reserva.id, 'factura_fallida', { error: String(e.message || e) }).catch(() => {})
    await avisoFacturaFallida(reserva, String(e.message || e), { urlPanel }).catch(() => {})
    return null
  }
}

export { facturaDeReserva }
