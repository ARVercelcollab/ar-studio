// Qué falta por configurar antes de abrir las reservas (se enseña arriba en el panel)
import { emisor } from '../facturas/servicio.js'
import { proveedorActivo } from '../pagos/index.js'

export function avisosDeConfiguracion() {
  const avisos = []
  const enVercel = Boolean(process.env.VERCEL)
  const produccion = process.env.VERCEL_ENV === 'production'
  let tpv = null
  try {
    tpv = proveedorActivo()
    if (tpv.id === 'simulado') avisos.push('El TPV es el simulado: solo vale para pruebas.')
    else if (tpv.esDePrueba()) avisos.push(`El TPV (${tpv.nombre}) está en modo pruebas: no cobra de verdad.`)
  } catch (e) {
    avisos.push(`TPV sin configurar: ${e.message}.`)
  }
  if (!emisor()) avisos.push('Faltan los datos de quien factura (FACTURA_EMISOR_NOMBRE, FACTURA_EMISOR_NIF y FACTURA_EMISOR_DIRECCION): no se pueden emitir facturas.')
  if (enVercel) {
    if (!process.env.SITIO_URL) avisos.push('Falta SITIO_URL (https://www.studioar.es).')
    if (!process.env.CRON_SECRET) avisos.push('Falta CRON_SECRET: no se mandan los recordatorios del día antes.')
    if (!process.env.RESEND_API_KEY) avisos.push('Falta RESEND_API_KEY: no salen los correos.')
  }
  if (produccion && process.env.NEXT_PUBLIC_RESERVAS_PROPIAS !== '1') avisos.push('Las reservas propias están apagadas: el botón RESERVAR de la web sigue llevando a Calendly.')
  return avisos
}
