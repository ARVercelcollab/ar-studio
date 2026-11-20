// Miembros · cómo se enseña el estado de cada miembro (lista, tablero y ficha).
// Funciones puras: reciben una fila de listarSuscripciones() o la suscripción de la ficha.
import { formatoEuros } from '../../../lib/reservas/config'
import { textoFechaCorta } from '../../../lib/reservas/tiempo'

export const fechaCorta = (f) => (f ? textoFechaCorta(f, { anio: false }) : '—')
export const caducidad = (aamm) => (aamm && /^\d{4}$/.test(aamm) ? `${aamm.slice(2)}/${aamm.slice(0, 2)}` : '—')

// Cuota: lo que se debe (si hay) o la de este periodo. Devuelve { tono, texto }
export function estadoCuota(f) {
  const chip = f.debe ? f.debe.chip : f.cuota?.chip
  if (f.debe && ['rechazado', 'agotado'].includes(f.cobroEstado)) return { tono: 'mal', texto: 'Rechazada' }
  if (f.debe && f.cobroEstado === 'revisar') return { tono: 'aviso', texto: 'Por revisar' }
  if (f.debe && f.cobroEstado === 'cobrando') return { tono: 'info', texto: 'Cobrando…' }
  switch (chip) {
    case 'pagada': return { tono: 'bien', texto: 'Pagada' }
    case 'sin_pagar': return { tono: 'aviso', texto: 'Sin pagar' }
    case 'atrasada': return { tono: 'mal', texto: 'Atrasada' }
    case 'proxima': return { tono: 'gris', texto: 'Próxima' }
    case 'sin_cargo': return { tono: 'gris', texto: 'Sin cargo' }
    case 'anulada': return { tono: 'gris', texto: 'Anulada' }
    case 'devuelta': return { tono: 'gris', texto: 'Devuelta' }
    default: return null
  }
}

// Cómo se cobra cada mes. Devuelve { tarjeta, texto, sub }
export function estadoCobro(f) {
  if (f.tarjeta) {
    return {
      tarjeta: f.tarjeta.ultimos ? `···· ${f.tarjeta.ultimos}` : 'Tarjeta guardada',
      texto: f.cobroAuto ? 'Se cobra sola' : 'Cobro parado',
      sub: f.cobroAuto && f.proximoCobro ? `Próximo cobro ${fechaCorta(f.proximoCobro)}` : null,
    }
  }
  if (f.cobroExterno === 'stripe') return { tarjeta: null, texto: 'Stripe', sub: 'Cobro automático en Stripe' }
  if (f.cobroExterno) return { tarjeta: null, texto: 'Pasarela', sub: 'Cobro automático' }
  if (f.cobroEnlace) return { tarjeta: null, texto: 'Enlace de pago', sub: 'Le llega por correo cada mes' }
  return { tarjeta: null, texto: 'A mano', sub: 'Se marca cuando paga' }
}

// Contrato. null = sin contrato de la web (por ejemplo, firmado en papel)
export function estadoContrato(f) {
  if (f.contratoEstado === 'firmado') return { tono: 'bien', texto: 'Firmado' }
  if (f.contratoEstado === 'pendiente') return { tono: 'aviso', texto: 'Sin firmar' }
  return { tono: 'gris', texto: 'Aparte', title: 'Sin contrato en la web (firmado aparte)' }
}

// Fianza, con el plazo de 7 días para la transferencia
export function estadoFianza(f, hoy) {
  switch (f.fianzaEstado) {
    case 'cobrada': return { tono: 'bien', texto: 'Recibida' }
    case 'devuelta': return { tono: 'gris', texto: 'Devuelta' }
    case 'retenida': return { tono: 'gris', texto: 'Os la quedasteis' }
    case 'sin_fianza': return { tono: 'gris', texto: 'Sin fianza' }
    case 'pendiente':
      if (f.contratoEstado === 'pendiente') return { tono: 'borde', texto: 'Tras firmar' }
      if (f.fianzaLimite && f.fianzaLimite < hoy) return { tono: 'mal', texto: 'Fuera de plazo', title: `El plazo acabó el ${fechaCorta(f.fianzaLimite)}` }
      if (f.fianzaLimite) return { tono: 'aviso', texto: `Hasta el ${fechaCorta(f.fianzaLimite)}` }
      return { tono: 'aviso', texto: 'Pendiente' }
    default: return null
  }
}

// Columna del tablero (el estado sale de los datos, no se arrastra)
export const COLUMNAS = [
  ['contrato', 'Contrato por firmar'],
  ['fianza', 'Fianza pendiente'],
  ['al_dia', 'Al día'],
  ['impago', 'Cuota sin pagar'],
  ['baja', 'Baja'],
]

export function columnaDe(f) {
  if (f.estado === 'baja_avisada' || f.estado === 'finalizada') return 'baja'
  if (f.impago) return 'impago' // la que no le deja usar el estudio (ver cuotaImpagada)
  if (f.contratoEstado === 'pendiente') return 'contrato'
  if (f.fianzaEstado === 'pendiente') return 'fianza'
  return 'al_dia'
}

// Lo que se lee en la tarjeta del tablero, según su columna
export function detalleTablero(f, columna, hoy) {
  switch (columna) {
    case 'contrato': return 'Tiene que firmar el contrato'
    case 'fianza':
      if (f.fianzaLimite && f.fianzaLimite < hoy) return `Plazo acabado el ${fechaCorta(f.fianzaLimite)}`
      return f.fianzaLimite ? `Plazo hasta el ${fechaCorta(f.fianzaLimite)}` : 'Falta la transferencia'
    case 'impago':
      if (['rechazado', 'agotado'].includes(f.cobroEstado)) {
        return f.cobroEstado === 'rechazado' && f.cobroProximo ? `Rechazada · reintento el ${fechaCorta(f.cobroProximo)}` : 'Rechazada en todos los intentos'
      }
      return f.debe ? `${f.debe.importe} sin pagar desde el ${fechaCorta(f.debe.desde)}` : 'Cuota sin pagar'
    case 'baja': return f.ultimoDia ? `Último día ${fechaCorta(f.ultimoDia)}` : 'Se da de baja'
    default:
      if (f.proximoCobro) return `Próximo cobro ${fechaCorta(f.proximoCobro)}`
      return f.proximaSesion ? `Próxima sesión ${f.proximaSesion}` : 'Todo en orden'
  }
}

export const alMes = (f) => (f.alMesCent === null || f.alMesCent === undefined ? '—' : formatoEuros(f.alMesCent))
