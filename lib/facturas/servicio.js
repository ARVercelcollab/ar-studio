// Facturas de las reservas: numeración correlativa, datos guardados y PDF.
//
// Los datos de quien factura NO van en el código (el repositorio es público): se ponen
// en las variables de entorno FACTURA_EMISOR_NOMBRE, FACTURA_EMISOR_NIF y
// FACTURA_EMISOR_DIRECCION (líneas separadas por |). La serie es FACTURA_SERIE (AR-W).
//
// IMPORTANTE: antes del 1-7-2027 (autónomos; 1-1-2027 si factura una sociedad) el programa
// de facturación tiene que cumplir Veri*factu. Esto no lo cumple: habrá que cambiarlo por
// un programa homologado o adaptarlo. Confirmar fechas y serie con el gestor.

import { query, transaction } from '../db/index.js'
import { ErrorReserva, aReserva } from '../reservas/servicio.js'
import { fechaMadrid, horaMadrid, sumarDias } from '../reservas/tiempo.js'
import { textoDuracion } from '../reservas/config.js'

const CANDADO_FACTURAS = 7271003
export const IVA_PCT = 21

export function emisor() {
  const nombre = process.env.FACTURA_EMISOR_NOMBRE
  const nif = process.env.FACTURA_EMISOR_NIF
  const direccion = process.env.FACTURA_EMISOR_DIRECCION
  if (!nombre || !nif || !direccion) return null
  return { nombre, nif, direccion: direccion.split('|').map((l) => l.trim()).filter(Boolean) }
}

export function serie() {
  return (process.env.FACTURA_SERIE || 'AR-W').trim()
}

// Se emiten y envían solas al confirmarse el pago si el cliente pidió factura
export function facturasAutomaticas() {
  return Boolean(emisor()) && process.env.FACTURAS_AUTOMATICAS !== '0'
}

// Precio con IVA incluido -> base e IVA (en céntimos)
export function desglose(totalCent, ivaPct = IVA_PCT) {
  const base = Math.round((totalCent * 100) / (100 + ivaPct))
  return { baseCent: base, ivaCent: totalCent - base, totalCent }
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
  }
}

const SELECT_FACTURA = `SELECT *, fecha_emision::text AS fecha_emision_txt, fecha_servicio::text AS fecha_servicio_txt FROM facturas`

export async function facturaDeReserva(reservaId) {
  const { rows } = await query(`${SELECT_FACTURA} WHERE reserva_id = $1`, [reservaId])
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

// Emite la factura de una reserva pagada. Si ya tiene, devuelve la que hay (nunca dos).
// datosCliente: { nombre, nif, direccion } (si no, los que dejó el cliente al reservar)
export async function emitirFactura(reservaId, datosCliente = null) {
  const em = emisor()
  if (!em) throw new ErrorReserva('emisor', 'Faltan los datos de quien factura (variables FACTURA_EMISOR_*).', 503)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FACTURAS])
    const { rows: ya } = await q(`${SELECT_FACTURA} WHERE reserva_id = $1`, [reservaId])
    if (ya[0]) return { factura: aFactura(ya[0]), nueva: false }

    const { rows } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [reservaId])
    const f = rows[0]
    if (!f) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
    if (f.pago_estado === 'pendiente') throw new ErrorReserva('sin_pagar', 'La reserva aún no está pagada.')
    if (f.pago_estado !== 'pagado') throw new ErrorReserva('devuelta', 'Esta reserva tiene una devolución apuntada: la factura habría que hacerla a mano por lo que se ha cobrado de verdad.')
    if (!['confirmada', 'cancelada'].includes(f.estado)) throw new ErrorReserva('estado', 'Resuelve antes la reserva (está en revisión o sin confirmar).')
    if (f.origen === 'plan' && f.precio_cent === 0) throw new ErrorReserva('plan', 'Las horas del plan van en la factura de la cuota (en su ficha de suscripción).')
    const r = aReserva(f)

    const cliente = limpiarCliente({ ...(datosCliente || r.factura || {}), email: r.email })
    if (!cliente.nombre || cliente.nif.length < 5 || !cliente.direccion) {
      throw new ErrorReserva('datos', 'Faltan el nombre, el NIF o la dirección para la factura.', 400)
    }
    if (datosCliente) {
      await q('UPDATE reservas SET factura = $2, actualizado_en = now() WHERE id = $1', [r.id, JSON.stringify({ nombre: cliente.nombre, nif: cliente.nif, direccion: cliente.direccion })])
    }

    const hoy = fechaMadrid(new Date())
    const { serie: s, anio, numero, codigo } = await siguienteCodigo(q, hoy)
    const { baseCent, ivaCent, totalCent } = desglose(r.precioCent)

    const { rows: nueva } = await q(
      `INSERT INTO facturas (reserva_id, serie, anio, numero, codigo, fecha_emision, fecha_servicio, emisor, cliente, lineas,
          base_cent, iva_pct, iva_cent, total_cent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *, fecha_emision::text AS fecha_emision_txt, fecha_servicio::text AS fecha_servicio_txt`,
      [r.id, s, anio, numero, codigo, hoy, fechaMadrid(r.inicio), JSON.stringify(em), JSON.stringify(cliente),
        JSON.stringify(lineasDeReserva(r, baseCent)), baseCent, IVA_PCT, ivaCent, totalCent]
    )
    await q('INSERT INTO eventos (reserva_id, tipo, detalle) VALUES ($1, $2, $3)', [r.id, 'factura_emitida', JSON.stringify({ codigo })])
    return { factura: aFactura(nueva[0]), nueva: true }
  })
}

// Siguiente número de la serie en el año (siempre bajo CANDADO_FACTURAS)
async function siguienteCodigo(q, hoy) {
  const anio = Number(hoy.slice(0, 4))
  const s = serie()
  const { rows } = await q('SELECT coalesce(max(numero), 0) AS n FROM facturas WHERE serie = $1 AND anio = $2', [s, anio])
  const numero = Number(rows[0].n) + 1
  return { serie: s, anio, numero, codigo: `${s}-${anio}-${String(numero).padStart(3, '0')}` }
}

export async function facturaDeCuota(cuotaId) {
  const { rows } = await query(`${SELECT_FACTURA} WHERE cuota_id = $1`, [Number(cuotaId)])
  return aFactura(rows[0])
}

// Factura de la cuota de un periodo de suscripción (misma serie y numeración)
export async function emitirFacturaCuota(cuotaId, datosCliente = null) {
  const em = emisor()
  if (!em) throw new ErrorReserva('emisor', 'Faltan los datos de quien factura (variables FACTURA_EMISOR_*).', 503)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FACTURAS])
    const { rows: ya } = await q(`${SELECT_FACTURA} WHERE cuota_id = $1`, [Number(cuotaId)])
    if (ya[0]) return { factura: aFactura(ya[0]), nueva: false }
    const { rows: cs } = await q(
      `SELECT c.*, c.desde::text AS desde_txt, c.hasta::text AS hasta_txt FROM cuotas c WHERE c.id = $1 FOR UPDATE`,
      [Number(cuotaId)]
    )
    const c = cs[0]
    if (!c) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
    if (c.estado === 'devuelta') throw new ErrorReserva('devuelta', 'Esta cuota está devuelta: la factura habría que hacerla a mano.')
    if (c.estado !== 'pagada') throw new ErrorReserva('sin_pagar', 'La cuota aún no está pagada.')
    if (c.importe_cent === 0) throw new ErrorReserva('importe', 'Una cuota de 0 € no se factura.')
    const { rows: ss } = await q('SELECT * FROM suscripciones WHERE id = $1 FOR UPDATE', [c.suscripcion_id])
    const sus = ss[0]
    const cliente = limpiarCliente({ ...(datosCliente || sus.factura || {}), email: sus.email })
    if (!cliente.nombre || cliente.nif.length < 5 || !cliente.direccion) {
      throw new ErrorReserva('datos', 'Faltan el nombre, el NIF o la dirección para la factura.', 400)
    }
    if (datosCliente) {
      await q('UPDATE suscripciones SET factura = $2, actualizado_en = now() WHERE id = $1', [sus.id, JSON.stringify({ nombre: cliente.nombre, nif: cliente.nif, direccion: cliente.direccion })])
    }
    const hoy = fechaMadrid(new Date())
    const { serie: s, anio, numero, codigo } = await siguienteCodigo(q, hoy)
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
    const { rows: nueva } = await q(
      `INSERT INTO facturas (cuota_id, serie, anio, numero, codigo, fecha_emision, fecha_servicio, emisor, cliente, lineas,
          base_cent, iva_pct, iva_cent, total_cent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *, fecha_emision::text AS fecha_emision_txt, fecha_servicio::text AS fecha_servicio_txt`,
      [c.id, s, anio, numero, codigo, hoy, c.desde_txt, JSON.stringify(em), JSON.stringify(cliente), JSON.stringify(lineas),
        baseCent, IVA_PCT, ivaCent, totalCent]
    )
    await q('INSERT INTO eventos (reserva_id, tipo, detalle, suscripcion_id, autor) VALUES (NULL, $1, $2, $3, $4)',
      ['factura_emitida', JSON.stringify({ codigo, periodo: c.periodo }), sus.id, 'panel'])
    return { factura: aFactura(nueva[0]), nueva: true, suscripcion: { id: sus.id, nombre: sus.nombre, email: sus.email, plan: planNombre, codigo: sus.codigo }, cuota: { periodo: c.periodo, desde: c.desde_txt, hasta: c.hasta_txt } }
  })
}

export async function marcarFacturaEnviada(id, a) {
  await query('UPDATE facturas SET enviada_en = now(), enviada_a = $2 WHERE id = $1', [id, a])
}
