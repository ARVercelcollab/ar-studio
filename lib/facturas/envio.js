// Emitir la factura de una reserva y mandarla por correo (al cliente, con copia al estudio)
import { emitirFactura, facturaDeReserva, marcarFacturaEnviada } from './servicio.js'
import { pdfFactura } from './pdf.js'
import { correoFactura, avisoFacturaFallida } from '../reservas/correos.js'
import { registrarEvento } from '../reservas/servicio.js'

export async function emitirYEnviar(reserva, { datosCliente = null, reenviar = false } = {}) {
  const { factura, nueva } = await emitirFactura(reserva.id, datosCliente)
  if (!nueva && factura.enviadaEn && !reenviar) return { factura, enviada: false }
  if (!reserva.email) return { factura, enviada: false }
  const pdf = await pdfFactura(factura)
  await correoFactura(reserva, factura, pdf)
  await marcarFacturaEnviada(factura.id, reserva.email)
  await registrarEvento(reserva.id, 'factura_enviada', { codigo: factura.codigo, a: reserva.email })
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
