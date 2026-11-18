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
import { fechaMadrid, horaMadrid } from '../reservas/tiempo.js'

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

const METODOS = { tarjeta: 'tarjeta', transferencia: 'transferencia', bizum: 'Bizum', efectivo: 'efectivo', otro: 'otro medio' }

function lineasDeReserva(r, baseCent) {
  const porHora = baseCent % r.duracionHoras === 0
  return [
    {
      descripcion: `Alquiler del estudio · ${fechaCorta(r.inicio)}, de ${horaMadrid(r.inicio)} a ${horaMadrid(r.fin)}`,
      detalle: `Reserva ${r.codigo}${r.metodoPago ? ` · pagada por ${METODOS[r.metodoPago] || r.metodoPago}` : ''}`,
      cantidad: porHora ? `${r.duracionHoras} h` : '1',
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
    const r = aReserva(f)

    const cliente = limpiarCliente({ ...(datosCliente || r.factura || {}), email: r.email })
    if (!cliente.nombre || cliente.nif.length < 5 || !cliente.direccion) {
      throw new ErrorReserva('datos', 'Faltan el nombre, el NIF o la dirección para la factura.', 400)
    }
    if (datosCliente) {
      await q('UPDATE reservas SET factura = $2, actualizado_en = now() WHERE id = $1', [r.id, JSON.stringify({ nombre: cliente.nombre, nif: cliente.nif, direccion: cliente.direccion })])
    }

    const hoy = fechaMadrid(new Date())
    const anio = Number(hoy.slice(0, 4))
    const s = serie()
    const { rows: ult } = await q('SELECT coalesce(max(numero), 0) AS n FROM facturas WHERE serie = $1 AND anio = $2', [s, anio])
    const numero = Number(ult[0].n) + 1
    const codigo = `${s}-${anio}-${String(numero).padStart(3, '0')}`
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

export async function marcarFacturaEnviada(id, a) {
  await query('UPDATE facturas SET enviada_en = now(), enviada_a = $2 WHERE id = $1', [id, a])
}
