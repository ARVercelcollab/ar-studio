// Reservas convertidas a datos simples para las páginas del panel (sin objetos Date)

import { formatoEuros, porcentajeReembolso, FONDOS, EQUIPO, textoDuracion } from '../reservas/config.js'
import { fechaMadrid, horaMadrid, textoFecha } from '../reservas/tiempo.js'

export const ESTADOS = {
  confirmada: 'Confirmada',
  pendiente: 'Esperando pago',
  caducada: 'Sin pagar (caducada)',
  conflicto: 'Revisar',
  cancelada: 'Cancelada',
}

export const PAGOS = {
  pendiente: 'Sin pagar',
  pagado: 'Pagada',
  reembolsado: 'Devuelta',
  reembolsado_parcial: 'Devuelta en parte',
}

export function vistaAdmin(r) {
  return {
    id: r.id,
    codigo: r.codigo,
    token: r.token,
    origen: r.origen,
    estado: r.estado,
    estadoTexto: ESTADOS[r.estado] || r.estado,
    pagoEstado: r.pagoEstado,
    pagoTexto: PAGOS[r.pagoEstado] || r.pagoEstado,
    metodoPago: r.metodoPago,
    fecha: fechaMadrid(r.inicio),
    fechaTexto: textoFecha(fechaMadrid(r.inicio)),
    horaInicio: horaMadrid(r.inicio),
    horaFin: horaMadrid(r.fin),
    duracionHoras: r.duracionHoras,
    duracionTexto: textoDuracion(r.duracionHoras, { corto: true }),
    tipoDia: r.tipoDia,
    precioCent: r.precioCent,
    importe: formatoEuros(r.precioCent),
    nombre: r.nombre,
    apellidos: r.apellidos,
    email: r.email,
    telefono: r.telefono,
    actividad: r.actividad,
    fondos: FONDOS.find((f) => f.id === r.fondos)?.texto || 'No',
    equipo: (r.equipo || []).map((id) => EQUIPO.find((e) => e.id === id)?.texto || id),
    factura: r.factura,
    comentarios: r.comentarios,
    notasInternas: r.notasInternas || '',
    pagadoEn: r.pagadoEn ? r.pagadoEn.toISOString() : null,
    reembolso: r.reembolsoCent ? formatoEuros(r.reembolsoCent) : null,
    motivoCancelacion: r.motivoCancelacion,
    creadoEn: r.creadoEn.toISOString(),
    expiraEn: r.expiraEn ? r.expiraEn.toISOString() : null,
    reembolsoHoyPct: porcentajeReembolso(r.inicio),
    pasada: r.fin.getTime() < Date.now(),
    // Sesiones de suscripción
    esPlan: r.origen === 'plan',
    suscripcionId: r.suscripcionId ?? null,
    planTexto: r.planSuscripcion ? `Suscripción ${{ starter: 'Starter', creator: 'Creator', pro: 'Pro' }[r.planSuscripcion] || ''}`.trim() : r.origen === 'plan' ? 'Suscripción' : null,
    horasPlan: r.horasPlan ?? null,
    horasExtra: r.origen === 'plan' ? Math.max(0, r.duracionHoras - (r.horasPlan || 0)) : 0,
    horasPlanTexto: r.origen === 'plan'
      ? `${textoDuracion(r.horasPlan || 0, { corto: true })} del plan${r.duracionHoras - (r.horasPlan || 0) > 0 ? ` (+${textoDuracion(r.duracionHoras - (r.horasPlan || 0), { corto: true })} aparte)` : ''}`
      : null,
    cuentaComoUsada: Boolean(r.cuentaComoUsada),
    horasHastaInicio: Math.round((r.inicio.getTime() - Date.now()) / 3600000),
    importePlan: r.origen === 'plan' ? (r.precioCent ? formatoEuros(r.precioCent) : 'Incluida') : null,
  }
}

// Enlace de WhatsApp (a los números de 9 cifras se les pone el 34 delante)
export function enlaceWhatsApp(telefono, texto = '') {
  let n = String(telefono || '').replace(/[^0-9]/g, '')
  if (n.length === 9) n = `34${n}`
  if (!n) return null
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

export function fechaHoraTexto(iso) {
  const d = new Date(iso)
  return `${fechaMadrid(d)} ${horaMadrid(d)}`
}
