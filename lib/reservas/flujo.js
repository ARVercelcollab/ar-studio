// Une las piezas: reserva + TPV + correos. Las rutas de la API solo llaman aquí.

import { proveedorActivo, proveedorPorId, comprobarProveedor } from '../pagos/index.js'
import { crearReservaWeb, reintentarPago, registrarResultadoPago, registrarEvento } from './servicio.js'
import { correoConfirmacion, avisoNuevaReserva, alertaPago } from './correos.js'
import { formatoEuros, textoDuracion } from './config.js'
import { textoFranja } from './tiempo.js'
import { facturasAutomaticas } from '../facturas/servicio.js'
import { facturaAutomatica } from '../facturas/envio.js'

export const urlReserva = (base, reserva) => `${base}/reserva/${reserva.token}`
export const urlPanel = (base) => `${base}/admin`

// Formulario que el navegador envía al TPV
function formularioPago(proveedor, { reserva, pago }, base) {
  const vuelta = `${base}/api/pagos/vuelta/${reserva.token}`
  return proveedor.crearPago({
    pedido: pago.pedido,
    importeCent: pago.importeCent,
    descripcion: `Alquiler AR Studio ${textoDuracion(reserva.duracionHoras, { corto: true })} · ${textoFranja(reserva.inicio, reserva.fin)} · ${reserva.codigo}`,
    titular: `${reserva.nombre} ${reserva.apellidos}`.trim(),
    email: reserva.email,
    urlOk: `${vuelta}/ok`,
    urlKo: `${vuelta}/ko`,
    urlNotificacion: proveedor.id === 'addon' ? `${base}/api/pagos/addon/respuesta` : `${base}/api/pagos/${proveedor.id}/notificacion`,
  })
}

export async function empezarReserva(datos, base, { huella = null } = {}) {
  const proveedor = await comprobarProveedor(proveedorActivo())
  const creada = await crearReservaWeb(datos, { proveedor: proveedor.id, huella })
  return {
    token: creada.reserva.token,
    codigo: creada.reserva.codigo,
    importe: formatoEuros(creada.pago.importeCent),
    expiraEn: creada.reserva.expiraEn,
    pago: formularioPago(proveedor, creada, base),
  }
}

export async function volverAPagar(token, base) {
  const proveedor = await comprobarProveedor(proveedorActivo())
  const r = await reintentarPago(token, { proveedor: proveedor.id })
  return { token, pago: formularioPago(proveedor, r, base), expiraEn: r.reserva.expiraEn }
}

// Llega el resultado del TPV (aviso del servidor o vuelta del cliente).
// Comprueba la firma, apunta el pago y manda los correos la primera vez.
export async function recibirResultado(proveedorId, entrada, base) {
  const proveedor = await comprobarProveedor(proveedorPorId(proveedorId))
  const resultado = proveedor.verificar(entrada)
  const { reserva, aviso } = await registrarResultadoPago({ proveedor: proveedor.id, ...resultado })
  try {
    if (aviso === 'confirmada') {
      const auto = Boolean(reserva.factura) && facturasAutomaticas()
      await correoConfirmacion(reserva, { urlReserva: urlReserva(base, reserva), facturaAutomatica: auto })
      await avisoNuevaReserva(reserva, { urlPanel: urlPanel(base) })
      await registrarEvento(reserva.id, 'correos_confirmacion', null)
    } else if (['conflicto', 'duplicado', 'tras_cancelar'].includes(aviso)) {
      await alertaPago(reserva, aviso, { urlPanel: urlPanel(base) })
    }
  } catch (e) {
    console.error('[reservas] fallo al enviar correos', e)
    await registrarEvento(reserva.id, 'correo_fallido', { error: String(e.message || e) }).catch(() => {})
  }
  // La factura va aparte: si fallan los correos de arriba, se intenta igual (y avisa si falla)
  if (aviso === 'confirmada' && reserva.factura && facturasAutomaticas()) {
    await facturaAutomatica(reserva, { urlPanel: urlPanel(base) })
  }
  return { reserva, aviso, resultado }
}
