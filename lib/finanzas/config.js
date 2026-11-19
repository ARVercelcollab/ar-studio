// Finanzas: listas y textos que se usan en el servidor y en las páginas del panel

export const GRUPOS = [['fijo', 'Fijos'], ['variable', 'Variables'], ['material', 'Herramientas y materiales']]

export const TIPOS_FACTURA = [
  ['nif', 'Factura a nombre del estudio, con el NIF de la titular (el IVA se descuenta)'],
  ['ticket', 'Ticket o factura sin vuestro NIF (el IVA no se descuenta)'],
  ['sin_iva', 'No lleva IVA (seguro, banco…)'],
  ['extranjero', 'Empresa de fuera de España (la factura no trae IVA español)'],
]
export const TIPOS_FACTURA_CORTO = { nif: 'Factura con NIF', ticket: 'Ticket sin NIF', sin_iva: 'Sin IVA', extranjero: 'Empresa de fuera' }
export const TIPOS_FACTURA_CSV = { nif: 'Con NIF del estudio', ticket: 'Ticket sin NIF', sin_iva: 'Sin IVA', extranjero: 'Empresa extranjera (inversión del sujeto pasivo)' }

export const IVAS_GASTO = [21, 10, 4] // + 'mano'
export const IVAS_INGRESO = [21, 10, 4, 0] // + 'mano'
export const RETENCIONES = [[0, 'No'], [19, '19 % alquiler'], [15, '15 % profesional'], [7, '7 % profesional que empieza']]
export const CADA_MESES = [[1, 'Cada mes'], [2, 'Cada 2 meses'], [3, 'Cada 3 meses'], [6, 'Cada 6 meses'], [12, 'Una vez al año']]
export const METODOS_GASTO = [['domiciliacion', 'Recibo domiciliado'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['bizum', 'Bizum'], ['efectivo', 'Efectivo'], ['otro', 'Otro']]
export const METODOS_INGRESO = [['transferencia', 'Transferencia'], ['bizum', 'Bizum'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['stripe', 'Stripe'], ['otro', 'Otro']]
export const TIPOS_INGRESO = [['extras', 'Fondos o equipo del día'], ['factura_manual', 'Factura hecha a mano (AR-M)'], ['otro', 'Otro']]

export const FUENTES = [
  ['horas', 'Reservas por horas'],
  ['horas_aparte', 'Horas aparte de suscripciones'],
  ['cuota', 'Cuotas de suscripción'],
  ['calendly', 'Reservas de Calendly (Stripe)'],
  ['extras', 'Fondos y equipo del día'],
  ['factura_manual', 'Facturas hechas a mano (AR-M)'],
  ['fianza', 'Fianzas que os quedáis'],
  ['otro', 'Otros ingresos'],
]
export const TEXTO_FUENTE = Object.fromEntries(FUENTES)

export const FILTROS_INGRESO = {
  todo: null,
  reservas: ['horas'],
  suscripciones: ['cuota', 'horas_aparte', 'fianza'],
  calendly: ['calendly'],
  a_mano: ['extras', 'factura_manual', 'otro'],
  devoluciones: 'devolucion',
}
export const TEXTOS_FILTRO_INGRESO = [
  ['todo', 'Todo'], ['reservas', 'Reservas por horas'], ['suscripciones', 'Suscripciones'],
  ['calendly', 'Calendly'], ['a_mano', 'Apuntado a mano'], ['devoluciones', 'Devoluciones'],
]

// Pendiente de confirmar con la gestoría (ver RESERVAS.md): se cambia aquí, sin migración
export const FIANZA_RETENIDA_IVA_PCT = 0
// Stripe factura sus comisiones desde Irlanda; confirmar con la gestoría
export const COMISION_STRIPE_TIPO_FACTURA = 'extranjero'

export const ANIO_MINIMO = 2020
export const MAX_CENT = 100000000 // 1.000.000 €
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
