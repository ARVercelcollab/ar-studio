// Ficha del miembro · piezas comunes: acciones contra la API, mensajes y textos.
import { useRouter } from 'next/router'
import { useState } from 'react'
import { METODOS_CUOTA, formatoEuros, textoDuracion } from '../../../../lib/reservas/config'
import { fechaMadrid, horaMadrid, textoFechaCorta } from '../../../../lib/reservas/tiempo'
import { pedirJson } from '../../../../lib/reservas/navegador'

export const h = (x) => textoDuracion(x, { corto: true })
export const METODOS = Object.fromEntries(METODOS_CUOTA)
export const METODOS_A_MANO = METODOS_CUOTA.filter(([id]) => id !== 'stripe')
export const fecha = (f, anio = true) => (f ? textoFechaCorta(f, { anio }) : '—')
export const fechaHoraCorta = (iso) => `${textoFechaCorta(fechaMadrid(iso), { anio: false })}, ${horaMadrid(iso)}`
export const caducidad = (aamm) => (aamm ? `${aamm.slice(2)}/${aamm.slice(0, 2)}` : '—')
export const euros = formatoEuros

// Llama a la API (POST) y, si va bien, vuelve a cargar la página sin moverse de sitio
export function useAccion() {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: false, mensaje: null, error: false })
  async function ejecutar(url, datos, { despues } = {}) {
    setEstado({ enviando: true, mensaje: null, error: false })
    try {
      const r = await pedirJson(url, { method: 'POST', body: datos })
      if (despues) return despues(r)
      setEstado({ enviando: false, mensaje: r?.mensaje || 'Hecho.', error: false })
      router.replace(router.asPath, undefined, { scroll: false })
      return r
    } catch (e) {
      setEstado({ enviando: false, mensaje: e.message, error: true })
      return null
    }
  }
  return [estado, ejecutar]
}

export function Mensaje({ estado }) {
  if (!estado.mensaje) return null
  return <p className={`mb-mensaje${estado.error ? ' is-error' : ''}`} role={estado.error ? 'alert' : 'status'}>{estado.mensaje}</p>
}

// Desplegable («Marcar como cobrada», «Cambiar condiciones»…)
export function Desplegable({ titulo, children, abierto }) {
  return (
    <details className="mb-desplegable" open={abierto}>
      <summary>{titulo}</summary>
      <div className="mb-desplegable__cuerpo">{children}</div>
    </details>
  )
}

export const EVENTOS = {
  alta: 'Alta', editada: 'Datos cambiados', condiciones: 'Condiciones cambiadas', cuota_pagada: 'Cuota pagada',
  cuota_desmarcada: 'Pago de cuota deshecho', cuota_editada: 'Cuota cambiada', cuota_anulada: 'Cuota anulada',
  cuota_devuelta: 'Cuota devuelta', cobro_enlazado: 'Cobro enlazado', cobro_sin_cuota: 'Cobro sin cuota (revisar)',
  baja: 'Baja apuntada', baja_deshecha: 'Baja deshecha', cobro_externo_cancelado: 'Cobro automático cancelado', fianza: 'Fianza',
  creada: 'Sesión reservada', movida: 'Sesión movida', cancelada: 'Sesión cancelada', pagada_a_mano: 'Horas aparte pagadas',
  factura_emitida: 'Factura emitida', factura_enviada: 'Factura enviada', factura_fallida: 'Fallo con la factura',
  correos_confirmacion: 'Correo de confirmación', correo_fallido: 'Fallo al enviar un correo', recordatorio: 'Recordatorio enviado',
  solicitud_cliente: 'Pide un cambio', alta_web: 'Alta por la web (primer mes pagado)', contrato_firmado: 'Contrato firmado',
  contrato_enviado: 'Enlace del contrato enviado', contrato_recordado: 'Recordatorio del contrato', enlace_cuota: 'Enlace de pago enviado',
  pago_revisar: 'Pago que revisar', tarjeta_guardada: 'Tarjeta guardada para los cobros', tarjeta_no_guardada: 'El banco no guardó la tarjeta',
  cobro_intento: 'Cobro automático', cobro_rechazado: 'Cobro rechazado por el banco', cobro_agotado: 'Cobro rechazado (sin más intentos)',
  cobro_revisar: 'Cobro sin confirmar (revisar)', cobro_no_cobrado: 'Cobro comprobado: no se cobró', cobro_activado: 'Cobro automático activado',
  cobro_desactivado: 'Cobro automático parado',
}

const FIANZA_ACCION = { cobrada: 'cobrada', devolver: 'devuelta', retener: 'retenida', sin_fianza: 'sin fianza' }

// Texto de un evento del historial (se calcula en el servidor y llega ya escrito)
export function textoEvento(e) {
  const d = e.detalle || {}
  const partes = []
  if (e.codigo) partes.push(e.codigo)
  if (d.periodo) partes.push(`periodo ${d.periodo}`)
  if (e.tipo === 'cuota_pagada' && d.metodo) partes.push(METODOS[d.metodo] || d.metodo)
  if (e.tipo === 'cuota_pagada' && d.proveedor) partes.push(d.proveedor)
  if (e.tipo === 'cuota_anulada' && d.pausa) partes.push('sin horas (pausa)')
  if (e.tipo === 'creada' && d.horasPlan != null) partes.push(`${h(d.horasPlan)} del plan${d.horasExtra ? ` + ${h(d.horasExtra)} aparte` : ''}`)
  if (e.tipo === 'cancelada') partes.push(d.cuentaComoUsada ? 'cuenta como usada' : 'no cuenta', d.motivo)
  if (e.tipo === 'baja') partes.push(`último día ${fecha(d.ultimoDia)}`, d.motivo)
  if (e.tipo === 'condiciones' && d.desdePeriodo) partes.push(`desde el periodo ${d.desdePeriodo}`)
  if (e.tipo === 'fianza') partes.push(FIANZA_ACCION[d.accion] || d.accion, d.importeCent ? formatoEuros(d.importeCent) : null, d.nota)
  if (e.tipo === 'factura_enviada') partes.push(`${d.codigo} a ${d.a}`)
  if (e.tipo === 'factura_emitida') partes.push(d.codigo)
  if (e.tipo === 'pago_revisar') partes.push(d.motivo === 'duplicado' ? 'pago repetido' : d.motivo === 'sin_cuota' ? 'la cuota ya no estaba pendiente' : 'importe distinto', d.pedido ? `pedido ${d.pedido}` : null)
  if (e.tipo === 'alta_web' && d.pedido) partes.push(`pedido ${d.pedido}`)
  if (e.tipo === 'tarjeta_guardada' && d.ultimos) partes.push(`···· ${d.ultimos}`)
  if (e.tipo === 'cobro_intento') partes.push(`intento ${d.intento}`, d.pedido ? `pedido ${d.pedido}` : null)
  if (['cobro_rechazado', 'cobro_agotado'].includes(e.tipo)) partes.push(d.codigo ? `código ${d.codigo}` : null, d.proximo ? `reintento el ${fecha(d.proximo, false)}` : null)
  if (e.tipo === 'cobro_revisar') partes.push(d.error === 'cortado' ? 'se cortó a medias' : d.error)
  if (e.tipo === 'cuota_pagada' && d.automatico) partes.push('cobro automático')
  if (e.tipo === 'correo_fallido' || e.tipo === 'factura_fallida') partes.push(d.error)
  if (d.nota && e.tipo !== 'fianza') partes.push(d.nota)
  return partes.filter(Boolean).join(' · ')
}
