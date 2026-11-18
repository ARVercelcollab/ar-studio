// Ayudas para las rutas de la API

import crypto from 'node:crypto'
import { ErrorReserva } from './reservas/servicio.js'
import { dentroDelLimite } from './db/index.js'

export function soloMetodos(req, res, metodos) {
  if (metodos.includes(req.method)) return true
  res.setHeader('Allow', metodos.join(', '))
  res.status(405).json({ error: 'metodo', mensaje: 'Método no permitido.' })
  return false
}

// Las peticiones que cambian datos tienen que venir de la propia web
export function mismoOrigen(req) {
  const origen = req.headers.origin
  if (!origen) return true
  try {
    return new URL(origen).host === (req.headers['x-forwarded-host'] || req.headers.host)
  } catch {
    return false
  }
}

export function ipDe(req) {
  const xff = req.headers['x-forwarded-for']
  return (Array.isArray(xff) ? xff[0] : xff || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconocida'
}

// URL pública de la web (para los enlaces de los correos y las vueltas del TPV)
// Huella de quien hace la petición: un resumen cifrado de su IP (la IP no se guarda)
export function huellaDe(req) {
  const secreto = process.env.SESSION_SECRET || 'solo-para-desarrollo-local'
  return crypto.createHmac('sha256', secreto).update(ipDe(req)).digest('base64url').slice(0, 22)
}

// Límite de intentos por persona, compartido entre todas las instancias (en la base de datos)
export async function limitar(req, res, accion, max, minutos, mensaje) {
  const ok = await dentroDelLimite(`${accion}:${huellaDe(req)}`, max, minutos)
  if (!ok) res.status(429).json({ error: 'limite', mensaje })
  return ok
}

export function urlBase(req) {
  if (process.env.SITIO_URL) return process.env.SITIO_URL.replace(/\/$/, '')
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  if (host) {
    const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
    return `${proto}://${host}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function responderError(res, e) {
  if (e instanceof ErrorReserva) {
    return res.status(e.estadoHttp).json({ error: e.codigo, mensaje: e.message })
  }
  console.error('[reservas]', e)
  return res.status(500).json({ error: 'interno', mensaje: 'Algo ha fallado. Inténtalo de nuevo o escríbenos por WhatsApp.' })
}

// ¿Están abiertas las reservas propias? En producción hace falta
// NEXT_PUBLIC_RESERVAS_PROPIAS=1 (la misma variable que cambia el botón RESERVAR);
// mientras tanto la web sigue mandando a Calendly. En local y en las vistas previas
// están abiertas salvo que se ponga a 0.
export function reservasAbiertas() {
  const v = process.env.NEXT_PUBLIC_RESERVAS_PROPIAS
  if (process.env.VERCEL_ENV === 'production') return v === '1'
  return v !== '0'
}

export function sinCache(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
}
