// Operaciones con las reservas en la base de datos: consultar huecos, reservar,
// cobrar, cancelar, mover y bloquear horas. Todo lo que cambia la agenda pasa por
// una transacción con un candado, así dos personas no pueden coger la misma hora.

import crypto from 'node:crypto'
import { query, transaction } from '../db/index.js'
import { REGLAS, precioCent } from './config.js'
import { horasLibres, tipoDeDia, bloqueoHasta, choca, diasConHuecos } from './disponibilidad.js'
import { madridAInstante, sumarDias, fechaMadrid, esFecha, esHora } from './tiempo.js'
import { periodoDe } from '../suscripciones/reglas.js'

export const CANDADO_AGENDA = 7271002
const DIA_MS = 86400000

export class ErrorReserva extends Error {
  // datos: información extra para la página (p. ej. los avisos de una sesión de suscripción)
  constructor(codigo, mensaje, estadoHttp = 409, datos = null) {
    super(mensaje)
    this.codigo = codigo
    this.estadoHttp = estadoHttp
    this.datos = datos
  }
}

// Fila de la base de datos -> objeto
export function aReserva(f) {
  if (!f) return null
  return {
    id: f.id,
    codigo: f.codigo,
    token: f.token,
    origen: f.origen,
    estado: f.estado,
    pagoEstado: f.pago_estado,
    metodoPago: f.metodo_pago,
    inicio: new Date(f.inicio),
    fin: new Date(f.fin),
    bloqueoHasta: new Date(f.bloqueo_hasta),
    duracionHoras: Number(f.duracion_horas),
    tipoDia: f.tipo_dia,
    precioCent: f.precio_cent,
    nombre: f.nombre,
    apellidos: f.apellidos,
    email: f.email,
    telefono: f.telefono,
    actividad: f.actividad,
    fondos: f.fondos,
    equipo: f.equipo || [],
    factura: f.factura,
    comentarios: f.comentarios,
    notasInternas: f.notas_internas,
    expiraEn: f.expira_en ? new Date(f.expira_en) : null,
    pagadoEn: f.pagado_en ? new Date(f.pagado_en) : null,
    reembolsoCent: f.reembolso_cent,
    canceladaEn: f.cancelada_en ? new Date(f.cancelada_en) : null,
    motivoCancelacion: f.motivo_cancelacion,
    recordatorioEnviadoEn: f.recordatorio_enviado_en ? new Date(f.recordatorio_enviado_en) : null,
    creadoEn: new Date(f.creado_en),
    // Sesiones de suscripción (origen 'plan')
    suscripcionId: f.suscripcion_id ?? null,
    horasPlan: f.horas_plan == null ? null : Number(f.horas_plan),
    cuentaComoUsada: Boolean(f.cuenta_como_usada),
    planSuscripcion: f.plan_suscripcion ?? null,
  }
}

function aPago(f) {
  if (!f) return null
  return {
    id: f.id,
    reservaId: f.reserva_id,
    proveedor: f.proveedor,
    pedido: f.pedido,
    importeCent: f.importe_cent,
    estado: f.estado,
    codigoRespuesta: f.codigo_respuesta,
    autorizacion: f.autorizacion,
    creadoEn: new Date(f.creado_en),
  }
}

const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function codigoNuevo(prefijo = 'AR-') {
  const bytes = crypto.randomBytes(6)
  let c = prefijo
  for (const b of bytes) c += ALFABETO[b % ALFABETO.length]
  return c
}

export function tokenNuevo() {
  return crypto.randomBytes(24).toString('base64url')
}

export async function festivos(q = query) {
  const { rows } = await q('SELECT fecha::text AS fecha FROM festivos')
  return new Set(rows.map((r) => r.fecha))
}

// Reservas activas y bloqueos que tocan el intervalo [desde, hasta). excluirId y excluirOtro:
// reservas que no cuentan (la que se mueve; la retenida del propio miembro que vuelve a pagar)
export async function ocupacion(q, desde, hasta, { excluirId = null, excluirOtro = null } = {}) {
  const r = await q(
    `SELECT id, inicio, bloqueo_hasta FROM reservas
      WHERE (estado IN ('confirmada', 'conflicto') OR (estado = 'pendiente' AND expira_en > now()))
        AND inicio < $2 AND bloqueo_hasta > $1 AND id <> coalesce($3, -1) AND id <> coalesce($4, -1)`,
    [desde, hasta, excluirId, excluirOtro]
  )
  const b = await q('SELECT inicio, fin FROM bloqueos WHERE inicio < $2 AND fin > $1', [desde, hasta])
  return {
    reservas: r.rows.map((x) => ({ inicio: new Date(x.inicio), bloqueoHasta: new Date(x.bloqueo_hasta) })),
    bloqueos: b.rows.map((x) => ({ inicio: new Date(x.inicio), fin: new Date(x.fin) })),
  }
}

function rangoDeDias(desde, hasta) {
  return [madridAInstante(sumarDias(desde, -1), '00:00'), madridAInstante(sumarDias(hasta, 2), '00:00')]
}

export async function registrar(q, reservaId, tipo, detalle = null, { suscripcionId = null, autor = null } = {}) {
  await q(
    'INSERT INTO eventos (reserva_id, tipo, detalle, suscripcion_id, autor) VALUES ($1, $2, $3, $4, $5)',
    [reservaId, tipo, detalle ? JSON.stringify(detalle) : null, suscripcionId, autor]
  )
}

// Transacción con el candado de la agenda (lo usan las suscripciones)
export async function conAgenda(fn) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    return fn(q)
  })
}

async function caducarRetenciones(q) {
  await q(`UPDATE reservas SET estado = 'caducada', actualizado_en = now()
            WHERE estado = 'pendiente' AND expira_en IS NOT NULL AND expira_en <= now()`)
}

export async function nuevoPago(q, reservaId, proveedor, importeCent) {
  const { rows } = await q(
    `INSERT INTO pagos (reserva_id, proveedor, importe_cent, pedido)
     VALUES ($1, $2, $3, to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYMM') || lpad(nextval('pedido_seq')::text, 8, '0'))
     RETURNING *`,
    [reservaId, proveedor, importeCent]
  )
  return aPago(rows[0])
}

// ---------- Consultas públicas ----------

export async function consultarDias({ desde, hasta, horas, ahora = new Date() }) {
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) throw new ErrorReserva('rango', 'Rango de fechas no válido.', 400)
  if (sumarDias(desde, 62) < hasta) throw new ErrorReserva('rango', 'Como mucho dos meses de una vez.', 400)
  const [ini, fin] = rangoDeDias(desde, hasta)
  const [fest, ocupado] = await Promise.all([festivos(), ocupacion(query, ini, fin)])
  return diasConHuecos({ desde, hasta, horas, ocupado, festivos: fest, ahora })
}

export async function consultarHoras({ fecha, horas, ahora = new Date() }) {
  if (!esFecha(fecha)) throw new ErrorReserva('fecha', 'Fecha no válida.', 400)
  const [ini, fin] = rangoDeDias(fecha, fecha)
  const [fest, ocupado] = await Promise.all([festivos(), ocupacion(query, ini, fin)])
  const tipoDia = tipoDeDia(fecha, fest)
  return {
    fecha,
    tipoDia,
    precioCent: precioCent(horas, tipoDia),
    horas: horasLibres({ fecha, horas, ocupado, festivos: fest, ahora }),
  }
}

export async function listarFestivos() {
  const { rows } = await query('SELECT fecha::text AS fecha, nombre FROM festivos ORDER BY fecha')
  return rows
}

// ---------- Reserva desde la web (con pago) ----------

const COLUMNAS_CLIENTE = `nombre, apellidos, email, telefono, actividad, fondos, equipo, factura, comentarios`

function valoresCliente(d) {
  return [d.nombre, d.apellidos || '', d.email, d.telefono || '', d.actividad || null, d.fondos || null,
    JSON.stringify(d.equipo || []), d.factura ? JSON.stringify(d.factura) : null, d.comentarios || null]
}

// datos ya validados con validarReserva(). Devuelve { reserva, pago }.
// Como mucho estas horas guardadas sin pagar a la vez desde la misma conexión, y en total
const MAX_RETENCIONES_POR_HUELLA = 2
const MAX_RETENCIONES_TOTALES = 12
// Intentos de pago por reserva (cada uno alarga la retención)
const MAX_INTENTOS_PAGO = 4

export async function crearReservaWeb(datos, { proveedor, huella = null, ahora = new Date(), reglas = REGLAS } = {}) {
  const { fecha, hora, horas } = datos
  const inicio = madridAInstante(fecha, hora)
  const fin = new Date(inicio.getTime() + horas * 3600000)

  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)

    if (huella) {
      // Si la misma persona vuelve atrás desde el banco y reserva otra vez, se suelta su hora anterior
      await q(
        `UPDATE reservas SET estado = 'caducada', actualizado_en = now()
          WHERE estado = 'pendiente' AND huella = $1 AND lower(email) = lower($2)`,
        [huella, datos.email]
      )
      const { rows } = await q(`SELECT count(*)::int AS n FROM reservas WHERE huella = $1 AND estado = 'pendiente'`, [huella])
      if (rows[0].n >= MAX_RETENCIONES_POR_HUELLA) {
        throw new ErrorReserva('limite', 'Ya tienes reservas pendientes de pago. Termina de pagarlas o espera unos minutos.', 429)
      }
    }
    const { rows: total } = await q(`SELECT count(*)::int AS n FROM reservas WHERE origen = 'web' AND estado = 'pendiente'`)
    if (total[0].n >= MAX_RETENCIONES_TOTALES) {
      throw new ErrorReserva('limite', 'Ahora mismo hay muchas reservas a medio pagar. Inténtalo en unos minutos o escríbenos por WhatsApp.', 429)
    }

    const fest = await festivos(q)
    const tipoDia = tipoDeDia(fecha, fest)
    const precio = precioCent(horas, tipoDia)
    if (precio == null) throw new ErrorReserva('duracion', 'Esa duración no se puede reservar ese día.')

    const [ini, finRango] = rangoDeDias(fecha, fecha)
    const ocupado = await ocupacion(q, ini, finRango)
    if (!horasLibres({ fecha, horas, ocupado, festivos: fest, ahora, reglas }).includes(hora)) {
      throw new ErrorReserva('ocupada', 'Esa hora ya no está libre. Elige otra, por favor.')
    }

    let fila
    for (let intento = 0; intento < 5 && !fila; intento++) {
      try {
        const { rows } = await q(
          `INSERT INTO reservas (codigo, token, origen, estado, inicio, fin, bloqueo_hasta, duracion_horas, tipo_dia,
              precio_cent, ${COLUMNAS_CLIENTE}, expira_en, acepto_condiciones_en, huella)
           VALUES ($1, $2, 'web', 'pendiente', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
              now() + make_interval(mins => $18), now(), $19)
           RETURNING *`,
          [codigoNuevo(), tokenNuevo(), inicio, fin, bloqueoHasta(fin, reglas), horas, tipoDia, precio,
            ...valoresCliente(datos), reglas.minutosRetencionPago, huella]
        )
        fila = rows[0]
      } catch (e) {
        // Código repetido (muy raro): se prueba otro. Cualquier otro error se lanza.
        if (e.code !== '23505') throw e
      }
    }
    if (!fila) throw new ErrorReserva('codigo', 'No se pudo crear la reserva. Inténtalo de nuevo.', 500)

    const pago = await nuevoPago(q, fila.id, proveedor, precio)
    await registrar(q, fila.id, 'creada', { origen: 'web', pedido: pago.pedido, proveedor })
    return { reserva: aReserva(fila), pago }
  })
}

// Nuevo intento de pago para una reserva que aún no está pagada
export async function reintentarPago(token, { proveedor, reglas = REGLAS } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    const { rows } = await q('SELECT * FROM reservas WHERE token = $1 FOR UPDATE', [token])
    const r = aReserva(rows[0])
    if (!r) throw new ErrorReserva('no_existe', 'No encontramos esa reserva.', 404)
    if (r.pagoEstado === 'pagado') throw new ErrorReserva('pagada', 'Esta reserva ya está pagada.')
    if (r.origen !== 'web' || !['pendiente', 'caducada'].includes(r.estado)) {
      throw new ErrorReserva('estado', 'Esta reserva ya no se puede pagar desde aquí. Escríbenos y lo vemos.')
    }
    if (r.inicio.getTime() - Date.now() < reglas.antelacionMinimaHoras * 3600000) {
      throw new ErrorReserva('tarde', 'Ya no se puede pagar esta reserva online. Escríbenos por WhatsApp.')
    }
    const { rows: intentos } = await q('SELECT count(*)::int AS n FROM pagos WHERE reserva_id = $1', [r.id])
    if (intentos[0].n >= MAX_INTENTOS_PAGO) {
      throw new ErrorReserva('intentos', 'Has hecho varios intentos de pago. Haz una reserva nueva o escríbenos por WhatsApp.', 429)
    }
    if (r.estado === 'caducada') {
      const ocupado = await ocupacion(q, new Date(r.inicio.getTime() - DIA_MS), new Date(r.bloqueoHasta.getTime() + DIA_MS), { excluirId: r.id })
      if (choca({ inicio: r.inicio, fin: r.fin }, ocupado, reglas)) {
        throw new ErrorReserva('ocupada', 'Mientras tanto otra persona ha reservado esa hora. Haz una reserva nueva, por favor.')
      }
    }
    const { rows: act } = await q(
      `UPDATE reservas SET estado = 'pendiente', expira_en = now() + make_interval(mins => $2), actualizado_en = now()
        WHERE id = $1 RETURNING *`,
      [r.id, reglas.minutosRetencionPago]
    )
    const pago = await nuevoPago(q, r.id, proveedor, r.precioCent)
    await registrar(q, r.id, 'reintento_pago', { pedido: pago.pedido, proveedor })
    return { reserva: aReserva(act[0]), pago }
  })
}

// Resultado de un pago que llega del TPV (notificación o vuelta del cliente).
// Se puede llamar varias veces con el mismo pedido: solo cuenta la primera.
// Devuelve { reserva, aviso } donde aviso es 'confirmada', 'conflicto', 'duplicado',
// 'tras_cancelar', 'fallido' o null (nada nuevo).
export async function registrarResultadoPago({ proveedor, pedido, pagado, importeCent = null, codigo = null, autorizacion = null, datos = null }) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    const { rows: ps } = await q('SELECT * FROM pagos WHERE pedido = $1 FOR UPDATE', [pedido])
    const pago = ps[0]
    if (!pago) throw new ErrorReserva('pago_desconocido', 'Pago desconocido.', 404)
    if (pago.proveedor !== proveedor) throw new ErrorReserva('proveedor', 'El pago no corresponde a este TPV.', 400)

    const { rows: rs } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [pago.reserva_id])
    const r = aReserva(rs[0])
    if (pago.estado === 'pagado' || (pago.estado === 'fallido' && !pagado)) return { reserva: r, aviso: null }

    if (!pagado) {
      await q(`UPDATE pagos SET estado = 'fallido', codigo_respuesta = $2, datos = $3, actualizado_en = now() WHERE id = $1`,
        [pago.id, codigo, datos ? JSON.stringify(datos) : null])
      await registrar(q, r.id, 'pago_fallido', { pedido, codigo })
      return { reserva: r, aviso: 'fallido' }
    }

    await q(`UPDATE pagos SET estado = 'pagado', codigo_respuesta = $2, autorizacion = $3, datos = $4, actualizado_en = now() WHERE id = $1`,
      [pago.id, codigo, autorizacion, datos ? JSON.stringify(datos) : null])

    const importeRaro = importeCent != null && Number(importeCent) !== pago.importe_cent
    let aviso
    let estado = r.estado
    if (r.pagoEstado === 'pagado') {
      aviso = 'duplicado' // ya estaba pagada por otro intento: hay que devolver este cobro
    } else if (r.estado === 'cancelada') {
      aviso = 'tras_cancelar'
    } else {
      estado = 'confirmada'
      if (r.estado === 'caducada') {
        const ocupado = await ocupacion(q, new Date(r.inicio.getTime() - DIA_MS), new Date(r.bloqueoHasta.getTime() + DIA_MS), { excluirId: r.id })
        if (choca({ inicio: r.inicio, fin: r.fin }, ocupado)) estado = 'conflicto'
        // Sesión del plan (horas aparte pagadas tarde): también tienen que caberle las horas del plan
        if (estado === 'confirmada' && r.origen === 'plan' && !(await cabenHorasDelPlan(q, r))) estado = 'conflicto'
      }
      if (importeRaro) estado = 'conflicto'
      aviso = estado === 'confirmada' ? 'confirmada' : 'conflicto'
    }

    const marcarPagada = (nuevoEstado) =>
      q(
        `UPDATE reservas SET estado = $2, pago_estado = 'pagado', metodo_pago = coalesce(metodo_pago, 'tarjeta'),
            pagado_en = coalesce(pagado_en, now()), expira_en = NULL, actualizado_en = now()
          WHERE id = $1 RETURNING *`,
        [r.id, nuevoEstado]
      )
    // Un cobro nunca se puede perder: si al confirmarla choca con otra reserva activa
    // (la base de datos lo impide), queda en "conflicto" para que el estudio la resuelva.
    let act
    await q('SAVEPOINT confirmar_pago')
    try {
      ;({ rows: act } = await marcarPagada(estado))
      await q('RELEASE SAVEPOINT confirmar_pago')
    } catch (e) {
      if (e.code !== '23P01') throw e
      await q('ROLLBACK TO SAVEPOINT confirmar_pago')
      estado = 'conflicto'
      aviso = 'conflicto'
      ;({ rows: act } = await marcarPagada(estado))
    }
    await registrar(q, r.id, 'pagada', { pedido, autorizacion, importeCent, aviso })
    return { reserva: aReserva(act[0]), aviso }
  })
}

// ¿Le caben a esta sesión del plan sus horas del plan, contando las demás de su periodo?
async function cabenHorasDelPlan(q, r) {
  if (!(r.horasPlan > 0)) return true
  const { rows: s } = await q('SELECT fecha_inicio::text AS fi, horas_periodo FROM suscripciones WHERE id = $1', [r.suscripcionId])
  if (!s[0]) return false
  const periodo = periodoDe({ fechaInicio: s[0].fi }, fechaMadrid(r.inicio))
  if (!periodo) return false
  const { rows: c } = await q('SELECT horas FROM cuotas WHERE suscripcion_id = $1 AND periodo = $2', [r.suscripcionId, periodo.numero])
  const total = Number(c[0] ? c[0].horas : s[0].horas_periodo)
  const { rows: u } = await q(
    `SELECT coalesce(sum(horas_plan), 0) AS n FROM reservas
      WHERE suscripcion_id = $1 AND id <> $2 AND inicio >= $3 AND inicio < $4
        AND (estado IN ('pendiente', 'confirmada', 'conflicto') OR (estado = 'cancelada' AND cuenta_como_usada))`,
    [r.suscripcionId, r.id, madridAInstante(periodo.desde, '00:00'), madridAInstante(periodo.hasta, '00:00')]
  )
  return Number(u[0].n) + r.horasPlan <= total + 1e-9
}

export async function reservaPorToken(token) {
  if (typeof token !== 'string' || token.length < 20) return null
  await caducarRetenciones(query)
  const { rows } = await query('SELECT * FROM reservas WHERE token = $1', [token])
  return aReserva(rows[0])
}

export async function reservaPorPedido(pedido) {
  const { rows } = await query('SELECT r.* FROM reservas r JOIN pagos p ON p.reserva_id = r.id WHERE p.pedido = $1', [pedido])
  return aReserva(rows[0])
}

export async function pagoPorPedido(pedido) {
  const { rows } = await query('SELECT * FROM pagos WHERE pedido = $1', [pedido])
  return aPago(rows[0])
}

export async function registrarEvento(reservaId, tipo, detalle, opciones) {
  await registrar(query, reservaId, tipo, detalle, opciones)
}

// Reservas con el plan de su suscripción (si son sesiones de un plan)
const SELECT_RESERVA = `SELECT r.*, s.plan AS plan_suscripcion FROM reservas r LEFT JOIN suscripciones s ON s.id = r.suscripcion_id`

// ---------- Panel del estudio ----------

export async function reservaPorId(id) {
  await caducarRetenciones(query)
  const { rows } = await query(`${SELECT_RESERVA} WHERE r.id = $1`, [Number(id)])
  return aReserva(rows[0])
}

export async function listarReservas({ desde, hasta, estados = ['pendiente', 'confirmada', 'conflicto'] }) {
  await caducarRetenciones(query)
  const { rows } = await query(
    `${SELECT_RESERVA} WHERE r.inicio >= $1 AND r.inicio < $2 AND r.estado = ANY($3) ORDER BY r.inicio`,
    [desde, hasta, estados]
  )
  return rows.map(aReserva)
}

export async function buscarReservas(texto, limite = 30) {
  const t = `%${String(texto || '').trim().toLowerCase()}%`
  const { rows } = await query(
    `${SELECT_RESERVA}
      WHERE lower(r.nombre || ' ' || r.apellidos) LIKE $1 OR lower(r.email) LIKE $1 OR lower(r.codigo) LIKE $1 OR r.telefono LIKE $1
      ORDER BY r.inicio DESC LIMIT $2`,
    [t, limite]
  )
  return rows.map(aReserva)
}

export async function pagosDeReserva(id) {
  const { rows } = await query('SELECT * FROM pagos WHERE reserva_id = $1 ORDER BY creado_en', [id])
  return rows.map(aPago)
}

export async function eventosDeReserva(id) {
  const { rows } = await query('SELECT tipo, detalle, creado_en FROM eventos WHERE reserva_id = $1 ORDER BY creado_en', [id])
  return rows.map((e) => ({ tipo: e.tipo, detalle: e.detalle, creadoEn: new Date(e.creado_en) }))
}

// Franja del panel: día + desde/hasta (o, por compatibilidad, hora de inicio + horas)
export function franja({ fecha, desde, hasta, hora, horas }) {
  const ini = desde || hora
  if (!esFecha(fecha) || !esHora(ini)) throw new ErrorReserva('fecha', 'Fecha u hora no válidas.', 400)
  const inicio = madridAInstante(fecha, ini)
  let fin
  if (hasta) {
    if (!esHora(hasta)) throw new ErrorReserva('fecha', 'Hora de fin no válida.', 400)
    fin = madridAInstante(fecha, hasta)
  } else {
    const h = Number(horas)
    if (!Number.isFinite(h)) throw new ErrorReserva('horas', 'Pon la hora de fin.', 400)
    fin = new Date(inicio.getTime() + h * 3600000)
  }
  const minutos = Math.round((fin - inicio) / 60000)
  if (minutos <= 0) throw new ErrorReserva('horas', 'La hora de fin tiene que ser después de la de inicio.', 400)
  if (minutos < 30 || minutos > 14 * 60) throw new ErrorReserva('horas', 'La reserva tiene que durar entre 30 minutos y 14 horas.', 400)
  if (minutos % 15) throw new ErrorReserva('horas', 'Usa horas en punto, y cuarto, y media o menos cuarto.', 400)
  return { inicio, fin, horas: minutos / 60 }
}

export async function comprobarHueco(q, { inicio, fin }, excluirId = null) {
  const ocupado = await ocupacion(q, new Date(inicio.getTime() - DIA_MS), new Date(fin.getTime() + 2 * DIA_MS), { excluirId })
  if (choca({ inicio, fin }, ocupado)) {
    throw new ErrorReserva('ocupada', 'Esa franja choca con otra reserva o con un bloqueo (recuerda los 30 minutos entre reservas).')
  }
}

// Reserva apuntada a mano por el estudio (WhatsApp, transferencia, Bizum…).
// No mira la antelación ni el horario: solo que no choque con nada.
export async function crearReservaManual(datos) {
  const { inicio, fin, horas } = franja(datos)
  const metodos = ['transferencia', 'bizum', 'efectivo', 'tarjeta', 'stripe', 'otro']
  if (datos.metodoPago && !metodos.includes(datos.metodoPago)) throw new ErrorReserva('metodo', 'Elige cómo se ha pagado.', 400)
  const deCalendly = datos.origen === 'calendly'
  if (deCalendly && datos.pagoEstado !== 'pagado') throw new ErrorReserva('calendly', 'Una reserva de Calendly ya está cobrada: márcala como pagada.', 400)
  const cobradoEn = datos.pagoEstado === 'pagado' ? instanteDeCobro(datos.pagadoEn) : null
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    await comprobarHueco(q, { inicio, fin })
    const fest = await festivos(q)
    const tipoDia = tipoDeDia(datos.fecha, fest)
    const precio = datos.precioCent != null && datos.precioCent !== '' ? Number(datos.precioCent) : precioCent(horas, tipoDia)
    if (!Number.isInteger(precio) || precio < 0) throw new ErrorReserva('precio', 'Pon el precio de esta reserva.', 400)
    const pagado = datos.pagoEstado === 'pagado'
    const { rows } = await q(
      `INSERT INTO reservas (codigo, token, origen, estado, pago_estado, metodo_pago, pagado_en, inicio, fin, bloqueo_hasta,
          duracion_horas, tipo_dia, precio_cent, ${COLUMNAS_CLIENTE}, notas_internas)
       VALUES ($1, $2, $3, 'confirmada', $4, $5, CASE WHEN $4 = 'pagado' THEN coalesce($22::timestamptz, now()) END, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [codigoNuevo(), tokenNuevo(), deCalendly ? 'calendly' : 'manual', pagado ? 'pagado' : 'pendiente',
        datos.metodoPago || null, inicio, fin, bloqueoHasta(fin), horas, tipoDia, precio, ...valoresCliente(datos),
        datos.notasInternas || null, cobradoEn]
    )
    await registrar(q, rows[0].id, 'creada', { origen: deCalendly ? 'calendly' : 'manual' })
    return aReserva(rows[0])
  })
}

// comprobar: para las sesiones de suscripción, función (q, reserva, nueva, festivos) que
// valida las reglas del plan y devuelve { horasPlan, precioCent, pagoEstado, metodoPago }
export async function reprogramar(id, { fecha, desde, hasta, hora, horas }, { comprobar = null, autor = null } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    const { rows } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [Number(id)])
    const r = aReserva(rows[0])
    if (!r) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
    if (!['confirmada', 'conflicto'].includes(r.estado)) throw new ErrorReserva('estado', 'Solo se pueden mover reservas confirmadas o en revisión.')
    const nueva = franja({ fecha, desde: desde || hora, hasta, horas: horas ?? r.duracionHoras })
    await comprobarHueco(q, nueva, r.id)
    const fest = await festivos(q)
    if (r.origen === 'plan' && !comprobar) throw new ErrorReserva('plan', 'Es una sesión de suscripción: muévela desde su reserva en el panel.', 400)
    const plan = comprobar ? await comprobar(q, r, nueva, fest) : null
    // Una sola actualización: la base de datos exige que las horas del plan no pasen de la duración
    const { rows: act } = await q(
      `UPDATE reservas SET inicio = $2, fin = $3, bloqueo_hasta = $4, duracion_horas = $5, tipo_dia = $6,
          estado = 'confirmada', recordatorio_enviado_en = NULL, actualizado_en = now(),
          horas_plan = CASE WHEN $7::boolean THEN $8::numeric ELSE horas_plan END,
          precio_cent = CASE WHEN $7::boolean THEN $9::integer ELSE precio_cent END,
          pago_estado = CASE WHEN $7::boolean THEN $10::text ELSE pago_estado END,
          metodo_pago = CASE WHEN $7::boolean THEN $11::text ELSE metodo_pago END,
          pagado_en = CASE WHEN NOT $7::boolean THEN pagado_en WHEN $10::text = 'pagado' THEN coalesce(pagado_en, now()) END
        WHERE id = $1 RETURNING *`,
      [r.id, nueva.inicio, nueva.fin, bloqueoHasta(nueva.fin), nueva.horas, tipoDeDia(fecha, fest),
        Boolean(plan), plan?.horasPlan ?? null, plan?.precioCent ?? null, plan?.pagoEstado ?? null, plan?.metodoPago ?? null]
    )
    await registrar(q, r.id, 'movida', {
      antes: { inicio: r.inicio, fin: r.fin }, despues: { inicio: nueva.inicio, fin: nueva.fin }, estadoAntes: r.estado,
      ...(plan ? { horasPlan: plan.horasPlan, avisosAceptados: plan.avisosAceptados || [] } : {}),
    }, { suscripcionId: r.suscripcionId, autor })
    return aReserva(act[0])
  })
}

// Vuelve a activar una reserva cancelada (por ejemplo, si llegó un pago después de cancelarla)
export async function reactivar(id) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    const { rows } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [Number(id)])
    const r = aReserva(rows[0])
    if (!r) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
    if (r.estado !== 'cancelada') throw new ErrorReserva('estado', 'Solo se pueden reactivar reservas canceladas.')
    if (r.origen === 'plan') throw new ErrorReserva('plan', 'Es una sesión de suscripción: resérvala otra vez desde Nueva reserva.')
    if (r.reembolsoCent) throw new ErrorReserva('estado', 'Esta reserva ya tiene una devolución apuntada: haz una reserva nueva.')
    await comprobarHueco(q, r, r.id)
    const { rows: act } = await q(
      `UPDATE reservas SET estado = 'confirmada', cancelada_en = NULL, motivo_cancelacion = NULL, actualizado_en = now()
        WHERE id = $1 RETURNING *`,
      [r.id]
    )
    await registrar(q, r.id, 'reactivada', null)
    return aReserva(act[0])
  })
}

// Día del cobro apuntado a mano: hoy -> ahora; un día pasado -> ese día a las 12:00 de Madrid
function instanteDeCobro(fecha) {
  if (fecha === null || fecha === undefined || fecha === '') return null
  const hoy = fechaMadrid(new Date())
  if (!esFecha(fecha) || fecha > hoy) throw new ErrorReserva('fecha', 'La fecha del cobro no puede ser futura.', 400)
  return fecha === hoy ? null : madridAInstante(fecha, '12:00')
}

export async function marcarPagada(id, { metodo, nota, fecha = null }) {
  const metodos = ['transferencia', 'bizum', 'efectivo', 'tarjeta', 'otro']
  if (!metodos.includes(metodo)) throw new ErrorReserva('metodo', 'Elige cómo se ha pagado.', 400)
  const cobradoEn = instanteDeCobro(fecha)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    const { rows } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [Number(id)])
    const r = aReserva(rows[0])
    if (!r) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
    if (r.pagoEstado === 'pagado') throw new ErrorReserva('pagada', 'Ya estaba marcada como pagada.')
    if (r.estado === 'cancelada') throw new ErrorReserva('estado', 'La reserva está cancelada.')
    if (r.estado === 'caducada') await comprobarHueco(q, r, r.id)
    const { rows: act } = await q(
      `UPDATE reservas SET estado = CASE WHEN estado IN ('pendiente', 'caducada') THEN 'confirmada' ELSE estado END,
          pago_estado = 'pagado', metodo_pago = $2, pagado_en = coalesce($3::timestamptz, now()), expira_en = NULL, actualizado_en = now()
        WHERE id = $1 RETURNING *`,
      [r.id, metodo, cobradoEn]
    )
    await registrar(q, r.id, 'pagada_a_mano', { metodo, nota: nota || null, fecha: fecha || null }, { suscripcionId: r.suscripcionId })
    return aReserva(act[0])
  })
}

// comprobar(reserva): se llama con la fila ya bloqueada (FOR UPDATE), antes de cancelar; puede
// lanzar un error si mientras tanto ha cambiado (p. ej. ha llegado el pago)
export async function cancelar(id, { motivo, reembolsoCent = 0, cuentaComoUsada = false, excepcion = false, autor = null, comprobar = null }) {
  const reembolso = Number(reembolsoCent || 0)
  if (!Number.isInteger(reembolso) || reembolso < 0) throw new ErrorReserva('reembolso', 'Importe de devolución no válido.', 400)
  return transaction(async (tx) => {
    const q = tx.query
    const { rows } = await q('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [Number(id)])
    const r = aReserva(rows[0])
    if (!r) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
    if (r.estado === 'cancelada') throw new ErrorReserva('estado', 'Ya estaba cancelada.')
    if (comprobar) await comprobar(r)
    if (reembolso > r.precioCent) throw new ErrorReserva('reembolso', 'La devolución no puede ser mayor que el precio.', 400)
    if (cuentaComoUsada && r.origen !== 'plan') throw new ErrorReserva('estado', 'Solo las sesiones de suscripción cuentan como usadas.', 400)
    let pago = r.pagoEstado
    if (r.pagoEstado === 'pagado' && reembolso > 0) pago = reembolso >= r.precioCent ? 'reembolsado' : 'reembolsado_parcial'
    const { rows: act } = await q(
      `UPDATE reservas SET estado = 'cancelada', pago_estado = $2, reembolso_cent = $3, cancelada_en = now(),
          motivo_cancelacion = $4, expira_en = NULL, cuenta_como_usada = $5, actualizado_en = now()
        WHERE id = $1 RETURNING *`,
      [r.id, pago, reembolso || null, motivo || null, Boolean(cuentaComoUsada)]
    )
    await registrar(q, r.id, 'cancelada', {
      motivo: motivo || null, reembolsoCent: reembolso,
      ...(r.origen === 'plan' ? { cuentaComoUsada: Boolean(cuentaComoUsada), excepcion: Boolean(excepcion) } : {}),
    }, { suscripcionId: r.suscripcionId, autor })
    return aReserva(act[0])
  })
}

export async function guardarNotas(id, notas) {
  const { rows } = await query(
    'UPDATE reservas SET notas_internas = $2, actualizado_en = now() WHERE id = $1 RETURNING *',
    [Number(id), String(notas || '').slice(0, 4000)]
  )
  return aReserva(rows[0])
}

// ---------- Bloqueos y festivos ----------

export async function listarBloqueos({ desde }) {
  const { rows } = await query('SELECT * FROM bloqueos WHERE fin > $1 ORDER BY inicio', [desde])
  return rows.map((b) => ({ id: b.id, inicio: new Date(b.inicio), fin: new Date(b.fin), motivo: b.motivo }))
}

export async function crearBloqueo({ fecha, desde, hasta, fechaFin, motivo }) {
  if (!esFecha(fecha) || !esHora(desde) || !esHora(hasta)) throw new ErrorReserva('fecha', 'Fecha u horas no válidas.', 400)
  const fFin = fechaFin && esFecha(fechaFin) ? fechaFin : fecha
  const inicio = madridAInstante(fecha, desde)
  const fin = madridAInstante(fFin, hasta)
  if (fin <= inicio) throw new ErrorReserva('fecha', 'El final tiene que ser después del inicio.', 400)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_AGENDA])
    await caducarRetenciones(q)
    const { rows: choques } = await q(
      `SELECT codigo FROM reservas WHERE estado IN ('pendiente', 'confirmada', 'conflicto') AND inicio < $2 AND fin > $1`,
      [inicio, fin]
    )
    if (choques.length) {
      throw new ErrorReserva('ocupada', `Hay reservas en esas horas (${choques.map((c) => c.codigo).join(', ')}). Muévelas o cancélalas antes.`)
    }
    const { rows } = await q('INSERT INTO bloqueos (inicio, fin, motivo) VALUES ($1, $2, $3) RETURNING *', [inicio, fin, String(motivo || '').slice(0, 200)])
    return rows[0]
  })
}

export async function borrarBloqueo(id) {
  await query('DELETE FROM bloqueos WHERE id = $1', [Number(id)])
}

export async function guardarFestivo({ fecha, nombre }) {
  if (!esFecha(fecha)) throw new ErrorReserva('fecha', 'Fecha no válida.', 400)
  await query(
    'INSERT INTO festivos (fecha, nombre) VALUES ($1, $2) ON CONFLICT (fecha) DO UPDATE SET nombre = EXCLUDED.nombre',
    [fecha, String(nombre || 'Festivo').slice(0, 80)]
  )
}

export async function borrarFestivo(fecha) {
  if (!esFecha(fecha)) throw new ErrorReserva('fecha', 'Fecha no válida.', 400)
  await query('DELETE FROM festivos WHERE fecha = $1', [fecha])
}

// ---------- Tareas diarias ----------

// Reservas confirmadas de mañana (hora de Madrid) sin recordatorio enviado
export async function reservasParaRecordar(ahora = new Date()) {
  const manana = sumarDias(fechaMadrid(ahora), 1)
  const { rows } = await query(
    `SELECT * FROM reservas WHERE estado = 'confirmada' AND recordatorio_enviado_en IS NULL
        AND inicio >= $1 AND inicio < $2 ORDER BY inicio`,
    [madridAInstante(manana, '00:00'), madridAInstante(sumarDias(manana, 1), '00:00')]
  )
  return rows.map(aReserva)
}

export async function marcarRecordatorio(id) {
  await query('UPDATE reservas SET recordatorio_enviado_en = now() WHERE id = $1', [id])
}

export async function limpiarRetenciones() {
  await caducarRetenciones(query)
}
