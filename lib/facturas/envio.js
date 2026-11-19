// Emitir facturas y mandarlas por correo (al cliente, con copia al estudio)
import { emitirFactura, emitirFacturaCuota, facturaDeReserva, marcarFacturaEnviada, facturasAutomaticas, seFactura } from './servicio.js'
import { pdfFactura } from './pdf.js'
import { correoFactura, avisoFacturaFallida } from '../reservas/correos.js'
import { registrarEvento } from '../reservas/servicio.js'
import { query } from '../db/index.js'
import { textoFranja, fechaDdMmAaaa, sumarDias } from '../reservas/tiempo.js'

const PLAN_NOMBRE = { starter: 'Starter', creator: 'Creator', pro: 'Pro' }

// Factura de una reserva (alquiler por horas, o las horas aparte de una sesión de suscripción).
// Completa o simplificada según los datos (ver emitirFactura). enviar: false solo la emite.
// urlReserva: la página de su reserva, para pedir la completa si le llega la simplificada.
// soloSiNueva: solo se manda si esta llamada la ha emitido (dos clics a la vez = un correo)
export async function emitirYEnviar(reserva, { datosCliente = null, reenviar = false, enviar = true, urlReserva = null, soloSiNueva = false } = {}) {
  const { factura, nueva } = await emitirFactura(reserva.id, datosCliente)
  if (!enviar || (soloSiNueva && !nueva)) return { factura, enviada: false, nueva }
  if (!nueva && factura.enviadaEn && !reenviar) return { factura, enviada: false, nueva }
  if (!reserva.email) return { factura, enviada: false, nueva }
  // La factura ya existe: si falla el correo no se deshace, se apunta y se dice (errorEnvio)
  const errorEnvio = await mandar(factura, { nombre: reserva.nombre, email: reserva.email }, {
    concepto: `de tu reserva ${reserva.codigo} del ${textoFranja(reserva.inicio, reserva.fin)}`,
    pedirCompleta: urlReserva,
  })
  if (errorEnvio) {
    await registrarEvento(reserva.id, 'factura_fallida', { codigo: factura.codigo, error: errorEnvio }, { suscripcionId: reserva.suscripcionId ?? null }).catch(() => {})
    return { factura, enviada: false, nueva, errorEnvio }
  }
  await registrarEvento(reserva.id, 'factura_enviada', { codigo: factura.codigo, a: reserva.email }, { suscripcionId: reserva.suscripcionId ?? null })
  return { factura, enviada: true, nueva }
}

// Manda el PDF y la marca como enviada. Devuelve null si ha salido, o el motivo si no.
async function mandar(factura, destinatario, opciones) {
  try {
    const pdf = await pdfFactura(factura)
    const r = await correoFactura(destinatario, factura, pdf, opciones)
    if (r?.noEnviado) return r.motivo || 'No se ha enviado el correo.'
    await marcarFacturaEnviada(factura.id, destinatario.email)
    return null
  } catch (e) {
    console.error('[facturas] envío fallido', factura.codigo, e.message)
    return String(e.message || e)
  }
}

// Factura de la cuota de un periodo de suscripción
export async function emitirYEnviarCuota(cuotaId, { datosCliente = null, reenviar = false } = {}) {
  const { factura, nueva } = await emitirFacturaCuota(cuotaId, datosCliente)
  if (!nueva && factura.enviadaEn && !reenviar) return { factura, enviada: false, nueva }
  const { rows } = await query(
    `SELECT s.id, s.nombre, s.email, coalesce(c.plan, s.plan) AS plan, c.desde::text AS desde, c.hasta::text AS hasta
       FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id WHERE c.id = $1`,
    [Number(cuotaId)]
  )
  const s = rows[0]
  const errorEnvio = await mandar(factura, { nombre: s.nombre, email: s.email }, {
    concepto: `de tu suscripción ${PLAN_NOMBRE[s.plan] || s.plan} (del ${fechaDdMmAaaa(s.desde)} al ${fechaDdMmAaaa(sumarDias(s.hasta, -1))})`,
  })
  if (errorEnvio) {
    await registrarEvento(null, 'factura_fallida', { codigo: factura.codigo, error: errorEnvio }, { suscripcionId: s.id, autor: 'sistema' }).catch(() => {})
    return { factura, enviada: false, nueva, errorEnvio }
  }
  await registrarEvento(null, 'factura_enviada', { codigo: factura.codigo, a: s.email }, { suscripcionId: s.id, autor: 'panel' })
  return { factura, enviada: true, nueva }
}

// Para los procesos automáticos: si falla, avisa al estudio en vez de romper el pago.
// enviar: false la emite sin mandarla (cuando en el panel se elige no avisar al cliente)
export async function facturaAutomatica(reserva, { urlPanel, urlReserva = null, enviar = true }) {
  try {
    const r = await emitirYEnviar(reserva, { urlReserva, enviar })
    if (r.errorEnvio) await avisoFacturaFallida(reserva, `emitida (${r.factura.codigo}) pero no enviada: ${r.errorEnvio}`, { urlPanel }).catch(() => {})
    return r
  } catch (e) {
    console.error('[facturas] no se pudo emitir/enviar', reserva.codigo, e.message)
    await registrarEvento(reserva.id, 'factura_fallida', { error: String(e.message || e) }).catch(() => {})
    await avisoFacturaFallida(reserva, String(e.message || e), { urlPanel }).catch(() => {})
    return null
  }
}

// Si la reserva ya está cobrada y lleva factura, la emite (y la envía si enviar). Para las
// reservas que el estudio apunta ya pagadas o marca como pagadas en el panel.
export async function facturarAlCobrar(reserva, { urlPanel, urlReserva = null, enviar = true }) {
  if (!reserva || reserva.pagoEstado !== 'pagado' || !seFactura(reserva) || !facturasAutomaticas()) return null
  return facturaAutomatica(reserva, { urlPanel, urlReserva, enviar: enviar && Boolean(reserva.email) })
}

export { facturaDeReserva }
