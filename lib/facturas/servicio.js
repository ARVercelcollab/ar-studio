// Facturas de las reservas: numeración correlativa, datos guardados y PDF.
//
// Los datos de quien factura NO van en el código (el repositorio es público): se ponen
// en las variables de entorno FACTURA_EMISOR_NOMBRE, FACTURA_EMISOR_NIF y
// FACTURA_EMISOR_DIRECCION (líneas separadas por |).
//
// Todo lo cobrado lleva factura:
// - completa (serie FACTURA_SERIE, AR-W) si el cliente ha dado nombre, NIF y dirección;
// - simplificada (serie FACTURA_SERIE_SIMPLIFICADA, AR-S) si no: sin datos del cliente
//   (art. 7 del RD 1619/2012). Si después pide la completa, se emite una AR-W que dice a
//   qué simplificada sustituye, y la simplificada queda marcada como sustituida (art. 15).
//
// IMPORTANTE: antes del 1-7-2027 (autónomos; 1-1-2027 si factura una sociedad) el programa
// de facturación tiene que cumplir Veri*factu. Esto no lo cumple: habrá que cambiarlo por
// un programa homologado o adaptarlo. Confirmar fechas y serie con el gestor.

import { query, transaction } from '../db/index.js'
import { ErrorReserva, aReserva } from '../reservas/servicio.js'
import { fechaMadrid, horaMadrid, sumarDias } from '../reservas/tiempo.js'
import { textoDuracion } from '../reservas/config.js'
import { IVA_PCT, desglose } from './iva.js'

const CANDADO_FACTURAS = 7271003
export { IVA_PCT, desglose }

export function emisor() {
  const nombre = process.env.FACTURA_EMISOR_NOMBRE
  const nif = process.env.FACTURA_EMISOR_NIF
  const direccion = process.env.FACTURA_EMISOR_DIRECCION
  if (!nombre || !nif || !direccion) return null
  return { nombre, nif, direccion: direccion.split('|').map((l) => l.trim()).filter(Boolean) }
}

export const TIPOS = { completa: 'completa', simplificada: 'simplificada' }

export function serie(tipo = TIPOS.completa) {
  const completa = (process.env.FACTURA_SERIE || 'AR-W').trim()
  if (tipo !== TIPOS.simplificada) return completa
  const simple = (process.env.FACTURA_SERIE_SIMPLIFICADA || 'AR-S').trim()
  // Las dos series no pueden ser la misma: cada una lleva su propia numeración
  if (simple.toUpperCase() === completa.toUpperCase()) throw new ErrorReserva('serie', 'La serie de las facturas simplificadas tiene que ser distinta de la de las completas.', 503)
  return simple
}

// Se emiten y envían solas al confirmarse el pago (o al marcar pagada una cuota)
export function facturasAutomaticas() {
  return Boolean(emisor()) && process.env.FACTURAS_AUTOMATICAS !== '0'
}

// Lo que se cobra lleva factura; las sesiones incluidas en un plan (0 €) van en la de la
// cuota, y lo cobrado por Calendly lo factura Stripe
export function seFactura(reserva) {
  return Boolean(reserva) && reserva.precioCent > 0 && reserva.origen !== 'calendly'
}

// Con nombre, NIF y dirección se puede hacer la factura completa
export function datosCompletos(c) {
  return Boolean(c && String(c.nombre || '').trim() && String(c.nif || '').trim().length >= 5 && String(c.direccion || '').trim())
}

const fechaCorta = (d) => {
  const [y, m, dia] = fechaMadrid(d).split('-')
  return `${dia}/${m}/${y}`
}

const METODOS = { tarjeta: 'tarjeta', transferencia: 'transferencia', bizum: 'Bizum', efectivo: 'efectivo', otro: 'otro medio', stripe: 'tarjeta (Stripe)' }

function lineasDeReserva(r, baseCent) {
  if (r.origen === 'plan') {
    // Sesión de suscripción con horas aparte: se facturan solo esas horas
    const extra = Math.max(0, r.duracionHoras - (r.horasPlan || 0))
    const porHora = extra > 0 && Number.isInteger(baseCent / extra)
    return [
      {
        descripcion: `Horas aparte de la suscripción · ${fechaCorta(r.inicio)}, de ${horaMadrid(r.inicio)} a ${horaMadrid(r.fin)}`,
        detalle: `Reserva ${r.codigo} · ${textoDuracion(r.horasPlan || 0, { corto: true })} incluidas en la suscripción (no se facturan aquí)${r.metodoPago && r.metodoPago !== 'plan' ? ` · pagadas por ${METODOS[r.metodoPago] || r.metodoPago}` : ''}`,
        cantidad: porHora ? textoDuracion(extra, { corto: true }) : '1',
        precioUnitarioCent: porHora ? baseCent / extra : baseCent,
        importeCent: baseCent,
      },
    ]
  }
  const porHora = Number.isInteger(baseCent / r.duracionHoras)
  return [
    {
      descripcion: `Alquiler del estudio · ${fechaCorta(r.inicio)}, de ${horaMadrid(r.inicio)} a ${horaMadrid(r.fin)}`,
      detalle: `Reserva ${r.codigo}${r.metodoPago ? ` · pagada por ${METODOS[r.metodoPago] || r.metodoPago}` : ''}`,
      cantidad: porHora ? textoDuracion(r.duracionHoras, { corto: true }) : '1',
      precioUnitarioCent: porHora ? baseCent / r.duracionHoras : baseCent,
      importeCent: baseCent,
    },
  ]
}

function aFactura(f) {
  if (!f) return null
  return {
    id: f.id,
    reservaId: f.reserva_id,
    cuotaId: f.cuota_id ?? null,
    codigo: f.codigo,
    serie: f.serie,
    anio: f.anio,
    numero: f.numero,
    fechaEmision: String(f.fecha_emision_txt || f.fecha_emision),
    fechaServicio: String(f.fecha_servicio_txt || f.fecha_servicio),
    emisor: f.emisor,
    cliente: f.cliente,
    lineas: f.lineas,
    baseCent: f.base_cent,
    ivaPct: f.iva_pct,
    ivaCent: f.iva_cent,
    totalCent: f.total_cent,
    enviadaEn: f.enviada_en ? new Date(f.enviada_en).toISOString() : null,
    enviadaA: f.enviada_a,
    tipo: f.tipo || TIPOS.completa,
    simplificada: f.tipo === TIPOS.simplificada,
    sustituye: f.sustituye || null,                 // { id, codigo, fecha } de la simplificada
    sustituidaEn: f.sustituida_en ? new Date(f.sustituida_en).toISOString() : null,
    sustituidaPor: f.sustituida_por || null,        // código de la completa que la sustituye
  }
}

const SELECT_FACTURA = `SELECT *, fecha_emision::text AS fecha_emision_txt, fecha_servicio::text AS fecha_servicio_txt FROM facturas`

// La factura vigente (la simplificada sustituida ya no cuenta)
export async function facturaDeReserva(reservaId) {
  const { rows } = await query(`${SELECT_FACTURA} WHERE reserva_id = $1 AND sustituida_en IS NULL`, [reservaId])
  return aFactura(rows[0])
}

export async function facturaPorId(id) {
  const { rows } = await query(`${SELECT_FACTURA} WHERE id = $1`, [Number(id)])
  return aFactura(rows[0])
}

function limpiarCliente(c = {}) {
  const t = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max)
  return { nombre: t(c.nombre, 120), nif: t(c.nif, 20).toUpperCase(), direccion: t(c.direccion, 200), email: t(c.email, 120) }
}

// Decide el tipo de factura y, si ya hay una vigente, si hay que sustituirla.
// Devuelve { ya } si no hay que emitir nada, o { tipo, cliente, sustituye }.
function planFactura({ vigente, datosCliente, guardados, email }) {
  if (datosCliente && !datosCompletos(datosCliente)) {
    throw new ErrorReserva('datos', 'Faltan el nombre, el NIF o la dirección para la factura.', 400)
  }
  if (vigente) {
    // Ya tiene factura: solo se sustituye la simplificada cuando se piden los datos a propósito
    // (el cliente o el estudio). Los datos guardados no la cambian: «Reenviar» manda la que hay.
    if (vigente.tipo !== TIPOS.simplificada || !datosCliente) return { ya: vigente }
    return { tipo: TIPOS.completa, cliente: limpiarCliente({ ...datosCliente, email }), sustituye: vigente }
  }
  // Primera factura: con los datos que se pasan o los que dejó guardados
  const datos = datosCliente || (datosCompletos(guardados) ? guardados : null)
  if (datos) return { tipo: TIPOS.completa, cliente: limpiarCliente({ ...datos, email }), sustituye: null }
  // Simplificada: sin datos del cliente (el correo solo sirve para enviarla, no se imprime)
  return { tipo: TIPOS.simplificada, cliente: { nombre: '', nif: '', direccion: '', email: limpiarCliente({ email }).email }, sustituye: null }
}

// Marca la simplificada como sustituida (antes de insertar la completa: así nunca hay dos vigentes)
async function marcarSustituida(q, vieja, codigoNueva) {
  await q('UPDATE facturas SET sustituida_en = now(), sustituida_por = $2 WHERE id = $1 AND sustituida_en IS NULL', [vieja.id, codigoNueva])
}

const datosSustituye = (v) => (v ? JSON.stringify({ id: v.id, codigo: v.codigo, fecha: String(v.fecha_emision_txt || v.fecha_emision) }) : null)

const INSERTAR_FACTURA = `INSERT INTO facturas (reserva_id, cuota_id, tipo, serie, anio, numero, codigo, fecha_emision, fecha_servicio, emisor, cliente, lineas,
    base_cent, iva_pct, iva_cent, total_cent, sustituye_id, sustituye)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
  RETURNING *, fecha_emision::text AS fecha_emision_txt, fecha_servicio::text AS fecha_servicio_txt`

// Emite la factura de una reserva pagada: completa si hay nombre, NIF y dirección (los que
// se pasan o los que dejó el cliente al reservar) y simplificada si no. Nunca dos vigentes:
// si ya tiene la simplificada y llegan los datos, se emite la completa que la sustituye.
// datosCliente: { nombre, nif, direccion } (si se pasan, tienen que estar los tres)
export async function emitirFactura(reservaId, datosCliente = null) {
  const em = emisor()
  if (!em) throw new ErrorReserva('emisor', 'Faltan los datos de quien factura (variables FACTURA_EMISOR_*).', 503)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FACTURAS])
    const { rows: ya } = await q(`${SELECT_FACTURA} WHERE reserva_id = $1 AND sustituida_en IS NULL`, [reservaId])
    // Ya tiene la completa y no se pide nada nuevo: se devuelve sin comprobar nada más
    if (ya[0] && ya[0].tipo !== TIPOS.simplificada && !datosCliente) return { factura: aFactura(ya[0]), nueva: false }

    const { rows } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [reservaId])
    const f = rows[0]
    if (!f) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
    const r = aReserva(f)
    const plan = planFactura({ vigente: ya[0], datosCliente, guardados: r.factura, email: r.email })
    if (plan.ya) return { factura: aFactura(plan.ya), nueva: false }

    if (f.pago_estado === 'pendiente') throw new ErrorReserva('sin_pagar', 'La reserva aún no está pagada.')
    if (f.pago_estado !== 'pagado') throw new ErrorReserva('devuelta', 'Esta reserva tiene una devolución apuntada: la factura habría que hacerla a mano por lo que se ha cobrado de verdad.')
    if (!['confirmada', 'cancelada'].includes(f.estado)) throw new ErrorReserva('estado', 'Resuelve antes la reserva (está en revisión o sin confirmar).')
    if (f.origen === 'plan' && f.precio_cent === 0) throw new ErrorReserva('plan', 'Las horas del plan van en la factura de la cuota (en su ficha de suscripción).')
    if (f.origen === 'calendly') throw new ErrorReserva('calendly', 'Se cobró por Calendly: su factura la hace Stripe.')
    if (!(Number(f.precio_cent) > 0)) throw new ErrorReserva('importe', 'Una reserva de 0 € no se factura.')

    if (datosCliente) {
      await q('UPDATE reservas SET factura = $2, actualizado_en = now() WHERE id = $1', [r.id, JSON.stringify({ nombre: plan.cliente.nombre, nif: plan.cliente.nif, direccion: plan.cliente.direccion })])
    }

    const hoy = fechaMadrid(new Date())
    const { serie: s, anio, numero, codigo } = await siguienteCodigo(q, hoy, plan.tipo)
    const { baseCent, ivaCent, totalCent } = desglose(r.precioCent)
    if (plan.sustituye) await marcarSustituida(q, plan.sustituye, codigo)
    const { rows: nueva } = await q(INSERTAR_FACTURA, [
      r.id, null, plan.tipo, s, anio, numero, codigo, hoy, fechaMadrid(r.inicio), JSON.stringify(em), JSON.stringify(plan.cliente),
      JSON.stringify(lineasDeReserva(r, baseCent)), baseCent, IVA_PCT, ivaCent, totalCent,
      plan.sustituye?.id ?? null, datosSustituye(plan.sustituye),
    ])
    await q('INSERT INTO eventos (reserva_id, tipo, detalle) VALUES ($1, $2, $3)', [r.id, 'factura_emitida', JSON.stringify({ codigo, tipo: plan.tipo, sustituye: plan.sustituye?.codigo || undefined })])
    return { factura: aFactura(nueva[0]), nueva: true }
  })
}

// Siguiente número de la serie en el año (siempre bajo CANDADO_FACTURAS)
async function siguienteCodigo(q, hoy, tipo = TIPOS.completa) {
  const anio = Number(hoy.slice(0, 4))
  const s = serie(tipo)
  const { rows } = await q('SELECT coalesce(max(numero), 0) AS n FROM facturas WHERE serie = $1 AND anio = $2', [s, anio])
  const numero = Number(rows[0].n) + 1
  return { serie: s, anio, numero, codigo: `${s}-${anio}-${String(numero).padStart(3, '0')}` }
}

export async function facturaDeCuota(cuotaId) {
  const { rows } = await query(`${SELECT_FACTURA} WHERE cuota_id = $1 AND sustituida_en IS NULL`, [Number(cuotaId)])
  return aFactura(rows[0])
}

// Factura de la cuota de un periodo de suscripción (mismas series y numeración que las
// reservas; completa o simplificada con la misma regla)
export async function emitirFacturaCuota(cuotaId, datosCliente = null) {
  const em = emisor()
  if (!em) throw new ErrorReserva('emisor', 'Faltan los datos de quien factura (variables FACTURA_EMISOR_*).', 503)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FACTURAS])
    const { rows: ya } = await q(`${SELECT_FACTURA} WHERE cuota_id = $1 AND sustituida_en IS NULL`, [Number(cuotaId)])
    if (ya[0] && ya[0].tipo !== TIPOS.simplificada && !datosCliente) return { factura: aFactura(ya[0]), nueva: false }
    const { rows: cs } = await q(
      `SELECT c.*, c.desde::text AS desde_txt, c.hasta::text AS hasta_txt FROM cuotas c WHERE c.id = $1 FOR UPDATE`,
      [Number(cuotaId)]
    )
    const c = cs[0]
    if (!c) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
    const { rows: ss } = await q('SELECT * FROM suscripciones WHERE id = $1 FOR UPDATE', [c.suscripcion_id])
    const sus = ss[0]
    const plan = planFactura({ vigente: ya[0], datosCliente, guardados: sus.factura, email: sus.email })
    if (plan.ya) return { factura: aFactura(plan.ya), nueva: false }
    if (c.estado === 'devuelta') throw new ErrorReserva('devuelta', 'Esta cuota está devuelta: la factura habría que hacerla a mano.')
    if (c.estado !== 'pagada') throw new ErrorReserva('sin_pagar', 'La cuota aún no está pagada.')
    if (c.importe_cent === 0) throw new ErrorReserva('importe', 'Una cuota de 0 € no se factura.')
    if (datosCliente) {
      await q('UPDATE suscripciones SET factura = $2, actualizado_en = now() WHERE id = $1', [sus.id, JSON.stringify({ nombre: plan.cliente.nombre, nif: plan.cliente.nif, direccion: plan.cliente.direccion })])
    }
    const hoy = fechaMadrid(new Date())
    const { serie: s, anio, numero, codigo } = await siguienteCodigo(q, hoy, plan.tipo)
    const { baseCent, ivaCent, totalCent } = desglose(c.importe_cent)
    const planCuota = c.plan || sus.plan
    const planNombre = { starter: 'Starter', creator: 'Creator', pro: 'Pro' }[planCuota] || planCuota
    const [y1, m1, d1] = c.desde_txt.split('-')
    const fin = sumarDias(c.hasta_txt, -1).split('-')
    const lineas = [{
      descripcion: `Suscripción mensual AR Studio · plan ${planNombre} · del ${d1}/${m1}/${y1} al ${fin[2]}/${fin[1]}/${fin[0]}`,
      detalle: `${sus.codigo} · periodo ${c.periodo} · ${textoDuracion(Number(c.horas), { corto: true })} de estudio${c.metodo_pago ? ` · pagada por ${METODOS[c.metodo_pago] || c.metodo_pago}` : ''}`,
      cantidad: '1',
      precioUnitarioCent: baseCent,
      importeCent: baseCent,
    }]
    if (plan.sustituye) await marcarSustituida(q, plan.sustituye, codigo)
    const { rows: nueva } = await q(INSERTAR_FACTURA, [
      null, c.id, plan.tipo, s, anio, numero, codigo, hoy, c.desde_txt, JSON.stringify(em), JSON.stringify(plan.cliente), JSON.stringify(lineas),
      baseCent, IVA_PCT, ivaCent, totalCent, plan.sustituye?.id ?? null, datosSustituye(plan.sustituye),
    ])
    await q('INSERT INTO eventos (reserva_id, tipo, detalle, suscripcion_id, autor) VALUES (NULL, $1, $2, $3, $4)',
      ['factura_emitida', JSON.stringify({ codigo, periodo: c.periodo, tipo: plan.tipo, sustituye: plan.sustituye?.codigo || undefined }), sus.id, 'panel'])
    return { factura: aFactura(nueva[0]), nueva: true, suscripcion: { id: sus.id, nombre: sus.nombre, email: sus.email, plan: planNombre, codigo: sus.codigo }, cuota: { periodo: c.periodo, desde: c.desde_txt, hasta: c.hasta_txt } }
  })
}

export async function marcarFacturaEnviada(id, a) {
  await query('UPDATE facturas SET enviada_en = now(), enviada_a = $2 WHERE id = $1', [id, a])
}

// Lo cobrado que aún no tiene factura (con las facturas automáticas encendidas todo lo
// cobrado la lleva): un pago que llegó con la reserva en revisión o cancelada, una factura
// que falló… Sale en «Para hacer» del Inicio. Deja 15 minutos por si se está emitiendo.
export async function cobrosSinFactura({ ahora = new Date() } = {}) {
  if (!facturasAutomaticas()) return { reservas: [], cuotas: [] }
  const antes = new Date(ahora.getTime() - 15 * 60000)
  const { rows: reservas } = await query(
    `SELECT r.id, r.codigo FROM reservas r
      WHERE r.pago_estado = 'pagado' AND r.precio_cent > 0 AND r.origen <> 'calendly'
        AND r.estado IN ('confirmada', 'cancelada') AND coalesce(r.pagado_en, r.actualizado_en) < $1
        AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.reserva_id = r.id AND f.sustituida_en IS NULL)
      ORDER BY r.id LIMIT 50`,
    [antes]
  )
  const { rows: cuotas } = await query(
    `SELECT c.id, c.suscripcion_id, c.periodo FROM cuotas c
      WHERE c.estado = 'pagada' AND c.importe_cent > 0 AND c.actualizado_en < $1
        AND coalesce(c.metodo_pago, '') <> 'stripe'   -- las de Stripe las factura Stripe
        AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.cuota_id = c.id AND f.sustituida_en IS NULL)
      ORDER BY c.id LIMIT 50`,
    [antes]
  )
  return {
    reservas: reservas.map((r) => ({ id: r.id, codigo: r.codigo })),
    cuotas: cuotas.map((c) => ({ id: c.id, suscripcionId: c.suscripcion_id, periodo: c.periodo })),
  }
}
