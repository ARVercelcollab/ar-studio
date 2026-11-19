// Suscripciones (planes mensuales) en la base de datos: alta, cuotas de cada periodo,
// sesiones del plan (son reservas normales con origen 'plan'), bajas y fianza.
//
// Todo lo que gasta horas del plan pasa por el candado de la agenda (conAgenda), así dos
// personas no pueden gastar las últimas horas a la vez. Las acciones de cuotas bloquean
// solo su fila.

import { query, transaction } from '../db/index.js'
import {
  ErrorReserva, aReserva, conAgenda, festivos, ocupacion, comprobarHueco, codigoNuevo, tokenNuevo,
  registrar, franja, reprogramar, cancelar,
} from '../reservas/servicio.js'
import { PLANES, PLAN_COMUN, METODOS_CUOTA, formatoEuros, textoDuracion } from '../reservas/config.js'
import { fechaMadrid, horaMadrid, madridAInstante, sumarDias, esFecha, textoFechaCorta, textoDiaCorto } from '../reservas/tiempo.js'
import { tipoDeDia, choca, bloqueoHasta } from '../reservas/disponibilidad.js'
import {
  periodoDe, periodoNumero, periodoActual, ultimoDiaDe, ultimoDiaPermanencia, estadoDe, enPrueba, cuentaParaElPlan,
  validarSesion, resumenPeriodo, cancelacionCuenta, propuestaBaja, consecuenciasBaja, iniciosPosibles, chipCuota,
  tareasPendientes, textoCondiciones, validarCondiciones, condicionesDePlan, textoPeriodo,
} from './reglas.js'

const DIA_MS = 86400000
const hoyMadrid = (ahora = new Date()) => fechaMadrid(ahora)
const h = (x) => textoDuracion(x, { corto: true })
const METODOS = METODOS_CUOTA.map(([id]) => id)

// ---------- Filas de la base de datos -> objetos ----------

const SELECT_SUS = `SELECT *, fecha_inicio::text AS fecha_inicio_txt, ultimo_dia::text AS ultimo_dia_txt,
  baja_avisada_en::text AS baja_avisada_en_txt, fianza_cobrada_en::text AS fianza_cobrada_en_txt,
  fianza_resuelta_en::text AS fianza_resuelta_en_txt FROM suscripciones`
const SELECT_CUOTA = `SELECT *, desde::text AS desde_txt, hasta::text AS hasta_txt, pagada_en::text AS pagada_en_txt,
  devuelta_en::text AS devuelta_en_txt FROM cuotas`

export function aSuscripcion(f) {
  if (!f) return null
  return {
    id: f.id,
    codigo: f.codigo,
    plan: f.plan,
    planNombre: PLANES[f.plan]?.nombre || f.plan,
    nombre: f.nombre,
    apellidos: f.apellidos,
    email: f.email,
    telefono: f.telefono,
    factura: f.factura,
    cuotaCent: f.cuota_cent,
    horasPeriodo: Number(f.horas_periodo),
    sesionMinH: Number(f.sesion_min_h),
    sesionMaxH: Number(f.sesion_max_h),
    duracionesH: Array.isArray(f.duraciones_h) ? f.duraciones_h.map(Number) : null,
    maxSesiones: f.max_sesiones ?? null,
    franjaDesde: f.franja_desde,
    franjaHasta: f.franja_hasta,
    antelacionH: f.antelacion_h,
    avisoCancelacionH: f.aviso_cancelacion_h,
    permanenciaMeses: f.permanencia_meses,
    renovacionMeses: f.renovacion_meses,
    preavisoDias: f.preaviso_dias,
    mesPrueba: Boolean(f.mes_prueba),
    fechaInicio: f.fecha_inicio_txt,
    ultimoDia: f.ultimo_dia_txt || null,
    bajaAvisadaEn: f.baja_avisada_en_txt || null,
    motivoBaja: f.motivo_baja,
    fianzaCent: f.fianza_cent,
    fianzaEstado: f.fianza_estado,
    fianzaMetodo: f.fianza_metodo,
    fianzaCobradaEn: f.fianza_cobrada_en_txt || null,
    fianzaDevueltaCent: f.fianza_devuelta_cent,
    fianzaResueltaEn: f.fianza_resuelta_en_txt || null,
    fianzaNota: f.fianza_nota,
    metodoHabitual: f.metodo_habitual,
    cobroExterno: f.cobro_externo,
    cobroExternoRef: f.cobro_externo_ref,
    contratoUrl: f.contrato_url,
    notasInternas: f.notas_internas || '',
    creadoEn: new Date(f.creado_en).toISOString(),
  }
}

export function aCuota(f) {
  if (!f) return null
  return {
    id: f.id,
    suscripcionId: f.suscripcion_id,
    periodo: f.periodo,
    plan: f.plan,
    planNombre: PLANES[f.plan]?.nombre || f.plan,
    reglas: f.reglas || null,
    desde: f.desde_txt,
    hasta: f.hasta_txt,
    horas: Number(f.horas),
    importeCent: f.importe_cent,
    estado: f.estado,
    metodoPago: f.metodo_pago,
    pagadaEn: f.pagada_en_txt || null,
    devueltaEn: f.devuelta_en_txt || null,
    referencia: f.referencia,
    enlace: f.enlace,
    proveedor: f.proveedor,
    proveedorRef: f.proveedor_ref,
    nota: f.nota,
  }
}

// ---------- Ayudas internas ----------

// Reglas de reserva que se guardan en cada cuota (las del periodo)
function reglasDe(c) {
  return {
    sesionMinH: Number(c.sesionMinH), sesionMaxH: Number(c.sesionMaxH),
    duracionesH: Array.isArray(c.duracionesH) && c.duracionesH.length ? c.duracionesH.map(Number) : null,
    maxSesiones: c.maxSesiones === null || c.maxSesiones === undefined ? null : Number(c.maxSesiones),
    franjaDesde: c.franjaDesde, franjaHasta: c.franjaHasta, antelacionH: Number(c.antelacionH),
  }
}

// La suscripción con las reglas del periodo de esa cuota (si las tiene guardadas)
export function conReglasDelPeriodo(sus, cuota) {
  return cuota?.reglas ? { ...sus, ...reglasDe(cuota.reglas) } : sus
}

async function cargarSuscripcion(q, id, { bloquear = false } = {}) {
  const { rows } = await q(`${SELECT_SUS} WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [Number(id)])
  const sus = aSuscripcion(rows[0])
  if (!sus) throw new ErrorReserva('no_existe', 'Suscripción no encontrada.', 404)
  return sus
}

async function cargarCuota(q, id, { bloquear = false } = {}) {
  const { rows } = await q(`${SELECT_CUOTA} WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [Number(id)])
  const c = aCuota(rows[0])
  if (!c) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
  return c
}

async function sesionesEntre(q, susId, desde, hasta) {
  const { rows } = await q(
    `SELECT * FROM reservas WHERE suscripcion_id = $1 AND inicio >= $2 AND inicio < $3 ORDER BY inicio`,
    [susId, madridAInstante(desde, '00:00'), madridAInstante(hasta, '00:00')]
  )
  return rows.map(aReserva)
}

async function datosDelPeriodo(q, sus, fecha) {
  const periodo = periodoDe(sus, fecha)
  if (!periodo) return { periodo: null, cuota: null, sesiones: [] }
  const { rows } = await q(`${SELECT_CUOTA} WHERE suscripcion_id = $1 AND periodo = $2`, [sus.id, periodo.numero])
  const sesiones = await sesionesEntre(q, sus.id, periodo.desde, periodo.hasta)
  return { periodo, cuota: aCuota(rows[0]), sesiones }
}

function exigir(v, avisosAceptados = []) {
  if (v.errores.length) {
    throw new ErrorReserva('reglas', v.errores[0].texto, 409, { errores: v.errores, avisos: v.avisos, notas: v.notas })
  }
  const aceptados = new Set(avisosAceptados || [])
  if (v.avisos.some((a) => !aceptados.has(a.codigo))) {
    throw new ErrorReserva('avisos', 'Revisa los avisos antes de reservar.', 409, { avisos: v.avisos, notas: v.notas })
  }
}

function precioDeExtra(horasExtra, precioExtraCent) {
  if (!(horasExtra > 0)) return 0
  const p = precioExtraCent === null || precioExtraCent === undefined || precioExtraCent === '' ? NaN : Number(precioExtraCent)
  if (!Number.isInteger(p) || p < 0) throw new ErrorReserva('precio', 'Pon el precio de las horas aparte (0 si son de regalo).', 400)
  return p
}

async function registrarSus(q, susId, tipo, detalle = null, autor = 'panel', reservaId = null) {
  await registrar(q, reservaId, tipo, detalle, { suscripcionId: susId, autor })
}

function enlaceSeguro(url, campo = 'enlace') {
  const t = String(url || '').trim()
  if (!t) return null
  if (!/^https:\/\//i.test(t) || t.length > 500) throw new ErrorReserva(campo, 'Pega un enlace que empiece por https://', 400)
  return t
}

function fechaPasadaOHoy(fecha, texto = 'Fecha no válida.') {
  if (!esFecha(fecha) || fecha > hoyMadrid()) throw new ErrorReserva('fecha', texto, 400)
  return fecha
}

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

// La misma suscripción de Stripe no puede estar en dos fichas
function errorRefExterna(codigo = null) {
  return new ErrorReserva('cobroExternoRef', `Esa suscripción de Stripe ya está apuntada en otra ficha${codigo ? ` (${codigo})` : ''}.`, 409)
}

async function refExternaLibre(q, cobroExterno, cobroExternoRef, excluirId = 0) {
  if (!cobroExterno || !cobroExternoRef) return
  const { rows } = await q('SELECT codigo FROM suscripciones WHERE cobro_externo = $1 AND cobro_externo_ref = $2 AND id <> $3', [cobroExterno, cobroExternoRef, excluirId])
  if (rows[0]) throw errorRefExterna(rows[0].codigo)
}

function limpiarFactura(f) {
  if (!f) return null
  const r = { nombre: texto(f.nombre, 120), nif: texto(f.nif, 20).toUpperCase(), direccion: texto(f.direccion, 200) }
  if (!r.nombre && !r.nif && !r.direccion) return null
  if (!r.nombre || r.nif.length < 5 || !r.direccion) throw new ErrorReserva('factura', 'Para la factura hacen falta nombre, NIF y dirección.', 400)
  return r
}

// '4; 8', '4 8', '4, 8' y '4,8' -> [4, 8]; '4,5; 8' y '4,5, 8' -> [4.5, 8]. Una coma pegada a
// ,25 / ,5 / ,75 es decimal (cuartos de hora); si no, separa.
export function leerDuraciones(textoDuraciones) {
  const r = []
  for (const trozo of String(textoDuraciones).split(/\s*;\s*|,\s+|\s+/).filter(Boolean)) {
    if (/^\d+,(25|5|50|75)$/.test(trozo)) r.push(Number(trozo.replace(',', '.')))
    else for (const x of trozo.split(',').filter(Boolean)) r.push(Number(x.replace(',', '.')))
  }
  return r
}

function normalizarCondiciones(base, cambios = {}) {
  const c = { ...base, ...cambios }
  const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
  let duraciones = c.duracionesH
  if (typeof duraciones === 'string') duraciones = leerDuraciones(duraciones)
  const r = {
    cuotaCent: n(c.cuotaCent),
    horasPeriodo: n(c.horasPeriodo),
    duracionesH: Array.isArray(duraciones) && duraciones.length ? duraciones.map(Number) : null,
    sesionMinH: n(c.sesionMinH),
    sesionMaxH: n(c.sesionMaxH),
    maxSesiones: n(c.maxSesiones),
    franjaDesde: c.franjaDesde,
    franjaHasta: c.franjaHasta,
    antelacionH: n(c.antelacionH),
    avisoCancelacionH: n(c.avisoCancelacionH ?? PLAN_COMUN.avisoCancelacionH),
    permanenciaMeses: n(c.permanenciaMeses),
    renovacionMeses: n(c.renovacionMeses),
    preavisoDias: n(c.preavisoDias),
  }
  const errores = validarCondiciones(r)
  if (Object.keys(errores).length) throw new ErrorReserva('condiciones', Object.values(errores)[0], 400, { errores })
  return r
}

// ---------- Alta, edición y condiciones ----------

export async function crearSuscripcion(datos, { confirmado = false, autor = 'panel' } = {}) {
  const plan = datos.plan
  if (!PLANES[plan]) throw new ErrorReserva('plan', 'Elige un plan.', 400)
  const nombre = texto(datos.nombre, 80)
  const email = texto(datos.email, 120).toLowerCase()
  if (!nombre) throw new ErrorReserva('nombre', 'Escribe el nombre.', 400)
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)) throw new ErrorReserva('email', 'Revisa el correo: hace falta para la suscripción.', 400)
  if (!esFecha(datos.fechaInicio)) throw new ErrorReserva('fechaInicio', 'Pon el día en que empieza (el del primer cobro).', 400)
  const cond = normalizarCondiciones(condicionesDePlan(plan), datos.condiciones || {})
  const metodoHabitual = datos.metodoHabitual && METODOS.includes(datos.metodoHabitual) ? datos.metodoHabitual : null
  const cobroExterno = metodoHabitual === 'stripe' ? 'stripe' : datos.cobroExterno === 'comercia' ? 'comercia' : null
  const cobroExternoRef = cobroExterno ? texto(datos.cobroExternoRef, 120) || null : null
  const factura = limpiarFactura(datos.factura)
  const contratoUrl = enlaceSeguro(datos.contratoUrl, 'contratoUrl')

  const f = datos.fianza || {}
  const fianzaEstado = ['pendiente', 'cobrada', 'sin_fianza'].includes(f.estado) ? f.estado : 'pendiente'
  const fianzaCent = f.importeCent === null || f.importeCent === undefined || f.importeCent === '' ? PLAN_COMUN.fianzaCent : Number(f.importeCent)
  if (!Number.isInteger(fianzaCent) || fianzaCent < 0) throw new ErrorReserva('fianza', 'Importe de la fianza no válido.', 400)
  let fianzaMetodo = null
  let fianzaCobradaEn = null
  if (fianzaEstado === 'cobrada') {
    if (!METODOS.includes(f.metodo)) throw new ErrorReserva('fianza', 'Elige cómo se cobró la fianza.', 400)
    fianzaMetodo = f.metodo
    fianzaCobradaEn = fechaPasadaOHoy(f.fecha || hoyMadrid(), 'Revisa la fecha de cobro de la fianza.')
  }

  let primera = null
  if (datos.primeraPagada) {
    const p = datos.primeraPagada
    if (!METODOS.includes(p.metodo)) throw new ErrorReserva('primeraPagada', 'Elige cómo se pagó la primera cuota.', 400)
    primera = {
      metodo: p.metodo,
      fecha: fechaPasadaOHoy(p.fecha || hoyMadrid(), 'Revisa la fecha de pago de la primera cuota.'),
      referencia: texto(p.referencia, 200) || null,
      enlace: enlaceSeguro(p.enlace),
    }
  }

  return transaction(async (tx) => {
    const q = tx.query
    await refExternaLibre(q, cobroExterno, cobroExternoRef)
    if (!confirmado) {
      const { rows } = await q(
        `SELECT codigo FROM suscripciones WHERE lower(email) = $1 AND (ultimo_dia IS NULL OR ultimo_dia >= $2::date)`,
        [email, hoyMadrid()]
      )
      if (rows.length) {
        throw new ErrorReserva('avisos', 'Ya hay una suscripción con ese correo.', 409, {
          avisos: [{ codigo: 'mismo_correo', texto: `Ya hay una suscripción activa con ese correo (${rows[0].codigo}). El plan es personal.` }],
        })
      }
    }
    let fila
    for (let i = 0; i < 5 && !fila; i++) {
      try {
        const { rows } = await q(
          `INSERT INTO suscripciones (codigo, plan, nombre, apellidos, email, telefono, factura, cuota_cent, horas_periodo,
              sesion_min_h, sesion_max_h, duraciones_h, max_sesiones, franja_desde, franja_hasta, antelacion_h,
              aviso_cancelacion_h, permanencia_meses, renovacion_meses, preaviso_dias, mes_prueba, fecha_inicio,
              fianza_cent, fianza_estado, fianza_metodo, fianza_cobrada_en, metodo_habitual, cobro_externo,
              cobro_externo_ref, contrato_url, notas_internas)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
              $23, $24, $25, $26, $27, $28, $29, $30, $31)
           RETURNING id`,
          [codigoNuevo('SUS-'), plan, nombre, texto(datos.apellidos, 80), email, texto(datos.telefono, 20),
            factura ? JSON.stringify(factura) : null, cond.cuotaCent, cond.horasPeriodo, cond.sesionMinH, cond.sesionMaxH,
            cond.duracionesH ? JSON.stringify(cond.duracionesH) : null, cond.maxSesiones, cond.franjaDesde, cond.franjaHasta,
            cond.antelacionH, cond.avisoCancelacionH, cond.permanenciaMeses, cond.renovacionMeses, cond.preavisoDias,
            Boolean(datos.mesPrueba), datos.fechaInicio, fianzaCent, fianzaEstado, fianzaMetodo, fianzaCobradaEn,
            metodoHabitual, cobroExterno, cobroExternoRef, contratoUrl, texto(datos.notasInternas, 4000) || null]
        )
        fila = rows[0]
      } catch (e) {
        if (e.code === '23505' && /cobro_externo/.test(e.constraint || e.message || '')) throw errorRefExterna()
        if (e.code !== '23505' || !/codigo/.test(e.constraint || e.message || '')) throw e
      }
    }
    if (!fila) throw new ErrorReserva('codigo', 'No se pudo crear la suscripción. Inténtalo de nuevo.', 500)
    const sus = await cargarSuscripcion(q, fila.id)
    const p1 = periodoNumero(sus, 1)
    await q(
      `INSERT INTO cuotas (suscripcion_id, periodo, desde, hasta, horas, importe_cent, estado, metodo_pago, pagada_en, referencia, enlace, plan, reglas)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [sus.id, p1.desde, p1.hasta, sus.horasPeriodo, sus.cuotaCent, primera ? 'pagada' : 'pendiente',
        primera?.metodo ?? null, primera?.fecha ?? null, primera?.referencia ?? null, primera?.enlace ?? null, sus.plan,
        JSON.stringify(reglasDe(sus))]
    )
    await registrarSus(q, sus.id, 'alta', { plan, condiciones: cond, primeraPagada: Boolean(primera), fianza: fianzaEstado }, autor)
    return { suscripcion: sus }
  })
}

export async function editarSuscripcion(id, cambios) {
  return transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    const nombre = cambios.nombre !== undefined ? texto(cambios.nombre, 80) : sus.nombre
    const email = cambios.email !== undefined ? texto(cambios.email, 120).toLowerCase() : sus.email
    if (!nombre) throw new ErrorReserva('nombre', 'Escribe el nombre.', 400)
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)) throw new ErrorReserva('email', 'Revisa el correo.', 400)
    const apellidos = cambios.apellidos !== undefined ? texto(cambios.apellidos, 80) : sus.apellidos
    const telefono = cambios.telefono !== undefined ? texto(cambios.telefono, 20) : sus.telefono
    const factura = cambios.factura !== undefined ? limpiarFactura(cambios.factura) : sus.factura
    const metodoHabitual = cambios.metodoHabitual !== undefined ? (METODOS.includes(cambios.metodoHabitual) ? cambios.metodoHabitual : null) : sus.metodoHabitual
    let cobroExterno = sus.cobroExterno
    let cobroExternoRef = sus.cobroExternoRef
    if (cambios.metodoHabitual !== undefined && metodoHabitual !== sus.metodoHabitual) {
      cobroExterno = metodoHabitual === 'stripe' ? 'stripe' : null
      cobroExternoRef = cobroExterno ? (cambios.cobroExternoRef !== undefined ? texto(cambios.cobroExternoRef, 120) || null : sus.cobroExternoRef) : null
    } else if (cambios.cobroExternoRef !== undefined && metodoHabitual === 'stripe') {
      // Con el mismo método: una referencia nueva (re)activa el cobro; vacía no reactiva nada
      const ref = texto(cambios.cobroExternoRef, 120) || null
      if (ref) {
        cobroExterno = 'stripe'
        cobroExternoRef = ref
      } else if (cobroExterno) {
        cobroExternoRef = null
      }
    }
    const contratoUrl = cambios.contratoUrl !== undefined ? enlaceSeguro(cambios.contratoUrl, 'contratoUrl') : sus.contratoUrl
    await refExternaLibre(q, cobroExterno, cobroExternoRef, sus.id)
    await q(
      `UPDATE suscripciones SET nombre = $2, apellidos = $3, email = $4, telefono = $5, factura = $6, metodo_habitual = $7,
          cobro_externo = $8, cobro_externo_ref = $9, contrato_url = $10, actualizado_en = now()
        WHERE id = $1`,
      [sus.id, nombre, apellidos, email, telefono, factura ? JSON.stringify(factura) : null, metodoHabitual,
        cobroExterno, cobroExternoRef, contratoUrl]
    )
    // Los datos de contacto también en las sesiones que aún no han pasado
    await q(
      `UPDATE reservas SET nombre = $2, apellidos = $3, email = $4, telefono = $5, actualizado_en = now()
        WHERE suscripcion_id = $1 AND estado = 'confirmada' AND inicio > now()`,
      [sus.id, nombre, apellidos, email, telefono]
    )
    const antes = { cobroExterno: sus.cobroExterno, cobroExternoRef: sus.cobroExternoRef }
    await registrarSus(q, sus.id, 'editada', cobroExterno !== sus.cobroExterno || cobroExternoRef !== sus.cobroExternoRef ? { antes } : null)
    return cargarSuscripcion(q, sus.id)
  })
}

export async function cambiarCondiciones(id, condiciones, { desdePeriodo }) {
  return conAgenda(async (q) => {
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    const desde = Number(desdePeriodo)
    if (!Number.isInteger(desde) || desde < 1) throw new ErrorReserva('desdePeriodo', 'Elige desde qué periodo.', 400)
    const plan = condiciones.plan && PLANES[condiciones.plan] ? condiciones.plan : sus.plan
    const actuales = {
      cuotaCent: sus.cuotaCent, horasPeriodo: sus.horasPeriodo, duracionesH: sus.duracionesH, sesionMinH: sus.sesionMinH,
      sesionMaxH: sus.sesionMaxH, maxSesiones: sus.maxSesiones, franjaDesde: sus.franjaDesde, franjaHasta: sus.franjaHasta,
      antelacionH: sus.antelacionH, avisoCancelacionH: sus.avisoCancelacionH, permanenciaMeses: sus.permanenciaMeses,
      renovacionMeses: sus.renovacionMeses, preavisoDias: sus.preavisoDias,
    }
    const { plan: _p, ...resto } = condiciones
    const nuevas = normalizarCondiciones(actuales, resto)
    // Los periodos de antes de «desde» que aún no tienen cuota se crean ya, con las condiciones de antes
    if (desde > 1) await asegurarCuotas(q, sus, periodoNumero(sus, desde - 1).desde)

    // No se pueden bajar las horas por debajo de lo ya reservado en esos periodos
    const { rows: cuotas } = await q(`${SELECT_CUOTA} WHERE suscripcion_id = $1 AND periodo >= $2 ORDER BY periodo`, [sus.id, desde])
    const cambiar = []
    const pagadas = []
    for (const c of cuotas.map(aCuota)) {
      if (c.estado !== 'pendiente') {
        pagadas.push(c)
        continue
      }
      const usadas = (await sesionesEntre(q, sus.id, c.desde, c.hasta)).filter(cuentaParaElPlan).reduce((a, s) => a + (s.horasPlan || 0), 0)
      if (usadas > nuevas.horasPeriodo + 1e-9) {
        throw new ErrorReserva('horas', `En el periodo ${c.periodo} (${textoPeriodo(c)}) ya tiene ${h(usadas)} reservadas: no se pueden bajar a ${h(nuevas.horasPeriodo)}.`, 409)
      }
      cambiar.push(c)
    }
    await q(
      `UPDATE suscripciones SET plan = $2, cuota_cent = $3, horas_periodo = $4, sesion_min_h = $5, sesion_max_h = $6,
          duraciones_h = $7, max_sesiones = $8, franja_desde = $9, franja_hasta = $10, antelacion_h = $11,
          aviso_cancelacion_h = $12, permanencia_meses = $13, renovacion_meses = $14, preaviso_dias = $15, actualizado_en = now()
        WHERE id = $1`,
      [sus.id, plan, nuevas.cuotaCent, nuevas.horasPeriodo, nuevas.sesionMinH, nuevas.sesionMaxH,
        nuevas.duracionesH ? JSON.stringify(nuevas.duracionesH) : null, nuevas.maxSesiones, nuevas.franjaDesde, nuevas.franjaHasta,
        nuevas.antelacionH, nuevas.avisoCancelacionH, nuevas.permanenciaMeses, nuevas.renovacionMeses, nuevas.preavisoDias]
    )
    for (const c of cambiar) {
      await q('UPDATE cuotas SET importe_cent = $2, horas = $3, plan = $4, reglas = $5, actualizado_en = now() WHERE id = $1',
        [c.id, nuevas.cuotaCent, nuevas.horasPeriodo, plan, JSON.stringify(reglasDe(nuevas))])
    }
    await registrarSus(q, sus.id, 'condiciones', { antes: { plan: sus.plan, ...actuales }, despues: { plan, ...nuevas }, desdePeriodo: desde })
    return { suscripcion: await cargarSuscripcion(q, sus.id), cuotasCambiadas: cambiar.length, cuotasPagadasSinTocar: pagadas.map((c) => c.periodo) }
  })
}

export async function guardarNotasSuscripcion(id, notas) {
  await query('UPDATE suscripciones SET notas_internas = $2, actualizado_en = now() WHERE id = $1', [Number(id), String(notas || '').slice(0, 4000)])
}

// Solo para corregir un alta equivocada: sin sesiones, sin cuotas cobradas y sin facturas
export async function borrarSuscripcion(id) {
  return transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    const { rows } = await q(
      `SELECT (SELECT count(*)::int FROM reservas WHERE suscripcion_id = $1) AS sesiones,
              (SELECT count(*)::int FROM cuotas WHERE suscripcion_id = $1 AND estado IN ('pagada', 'devuelta')) AS cobradas,
              (SELECT count(*)::int FROM facturas f JOIN cuotas c ON c.id = f.cuota_id WHERE c.suscripcion_id = $1) AS facturas`,
      [sus.id]
    )
    if (rows[0].sesiones || rows[0].cobradas || rows[0].facturas) {
      throw new ErrorReserva('movimientos', 'Ya tiene movimientos: dale de baja en vez de borrarla.')
    }
    await q('DELETE FROM eventos WHERE suscripcion_id = $1', [sus.id])
    await q('DELETE FROM cuotas WHERE suscripcion_id = $1', [sus.id])
    await q('DELETE FROM suscripciones WHERE id = $1', [sus.id])
  })
}

// ---------- Cuotas de cada periodo ----------

// Crea las cuotas que falten hasta el periodo de "hastaFecha" (y nunca después de la baja)
export async function asegurarCuotas(q, sus, hastaFecha) {
  const limite = sus.ultimoDia && sus.ultimoDia < hastaFecha ? sus.ultimoDia : hastaFecha
  const p = periodoDe(sus, limite)
  if (!p) return
  const { rows } = await q('SELECT periodo FROM cuotas WHERE suscripcion_id = $1', [sus.id])
  const hay = new Set(rows.map((f) => Number(f.periodo)))
  for (let n = 1; n <= p.numero; n++) {
    if (hay.has(n)) continue
    const per = periodoNumero(sus, n)
    await q(
      `INSERT INTO cuotas (suscripcion_id, periodo, desde, hasta, horas, importe_cent, plan, reglas) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (suscripcion_id, periodo) DO NOTHING`,
      [sus.id, n, per.desde, per.hasta, sus.horasPeriodo, sus.cuotaCent, sus.plan, JSON.stringify(reglasDe(sus))]
    )
  }
}

export async function asegurarCuotasDeTodas(hoy = hoyMadrid()) {
  const { rows } = await query(`${SELECT_SUS} WHERE ultimo_dia IS NULL OR ultimo_dia >= $1::date`, [hoy])
  for (const sus of rows.map(aSuscripcion)) await asegurarCuotas(query, sus, hoy)
}

async function cargarTodo(hoy, ahora) {
  await asegurarCuotasDeTodas(hoy)
  const { rows: subs } = await query(`${SELECT_SUS} ORDER BY nombre, apellidos`)
  const { rows: cuotas } = await query(`${SELECT_CUOTA} ORDER BY suscripcion_id, periodo`)
  const { rows: sesiones } = await query(
    `SELECT * FROM reservas WHERE suscripcion_id IS NOT NULL AND inicio >= $1 ORDER BY inicio`,
    [new Date(ahora.getTime() - 45 * DIA_MS)]
  )
  const porSus = (lista, clave) => {
    const m = new Map()
    for (const x of lista) {
      if (!m.has(x[clave])) m.set(x[clave], [])
      m.get(x[clave]).push(x)
    }
    return m
  }
  return {
    subs: subs.map(aSuscripcion),
    cuotas: porSus(cuotas.map(aCuota), 'suscripcionId'),
    sesiones: porSus(sesiones.map(aReserva), 'suscripcionId'),
  }
}

function resumenDe(sus, cuotasSus, sesionesSus, ahora, periodo) {
  const cuota = cuotasSus.find((c) => c.periodo === periodo.numero)
  const deEse = sesionesSus.filter((s) => {
    const f = fechaMadrid(s.inicio)
    return f >= periodo.desde && f < periodo.hasta
  })
  return { cuota, resumen: resumenPeriodo({ periodo, horas: cuota ? cuota.horas : sus.horasPeriodo, sesiones: deEse, ahora }), sesiones: deEse }
}

export async function listarSuscripciones({ vista = 'activas', ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const { subs, cuotas, sesiones } = await cargarTodo(hoy, ahora)
  const filas = []
  const fichas = []
  const cifras = { activas: 0, cuotasSinPagar: { n: 0, totalCent: 0 }, fianzasPorResolver: 0, horasQueCaducan: 0 }
  for (const sus of subs) {
    const estado = estadoDe(sus, hoy)
    const cs = cuotas.get(sus.id) || []
    const ss = sesiones.get(sus.id) || []
    const periodo = periodoActual(sus, hoy)
    const { cuota, resumen } = resumenDe(sus, cs, ss, ahora, periodo)
    const chips = cs.map((c) => ({ c, chip: chipCuota(c, hoy) }))
    const sinPagar = chips.filter((x) => x.chip === 'sin_pagar' || x.chip === 'atrasada')
    if (estado !== 'finalizada') {
      cifras.activas++
      if (resumen.diasParaCaducar >= 0 && resumen.diasParaCaducar <= 7) cifras.horasQueCaducan += resumen.restantes
    }
    cifras.cuotasSinPagar.n += sinPagar.length
    cifras.cuotasSinPagar.totalCent += sinPagar.reduce((a, x) => a + x.c.importeCent, 0)
    if (estado === 'finalizada' && sus.fianzaEstado === 'cobrada') cifras.fianzasPorResolver++
    if (estado !== 'finalizada' || sus.fianzaEstado === 'cobrada') fichas.push({ sus, cuotas: cs, resumen: estado === 'finalizada' ? null : resumen })

    const incluir = vista === 'finalizadas' ? estado === 'finalizada' : vista === 'sin_pagar' ? sinPagar.length > 0 : estado !== 'finalizada'
    if (!incluir) continue
    const proxima = ss.find((s) => s.estado === 'confirmada' && s.fin.getTime() > ahora.getTime())
    filas.push({
      id: sus.id,
      codigo: sus.codigo,
      nombre: `${sus.nombre} ${sus.apellidos}`.trim(),
      plan: sus.plan,
      planNombre: sus.planNombre,
      estado,
      enPrueba: enPrueba(sus, hoy),
      periodoTexto: resumen.texto,
      horas: resumen.horas,
      restantes: resumen.restantes,
      cuota: cuota ? { id: cuota.id, chip: chipCuota(cuota, hoy), importe: formatoEuros(cuota.importeCent) } : null,
      sinPagar: sinPagar.length,
      // La más antigua sin pagar (la que hay que reclamar)
      debe: sinPagar.length ? { chip: sinPagar[0].chip, importe: formatoEuros(sinPagar[0].c.importeCent), desde: sinPagar[0].c.desde } : null,
      proximaSesion: proxima ? `${textoDiaCorto(fechaMadrid(proxima.inicio))}, ${horaMadrid(proxima.inicio)}–${horaMadrid(proxima.fin)}` : null,
      ultimoDia: sus.ultimoDia,
    })
  }
  return { filas, cifras, tareas: tareasPendientes({ fichas, hoy }) }
}

export async function contarCuotasSinPagar(hoy = hoyMadrid()) {
  await asegurarCuotasDeTodas(hoy)
  const { rows } = await query(
    `SELECT count(*)::int AS n, coalesce(sum(importe_cent), 0)::int AS total FROM cuotas
      WHERE estado = 'pendiente' AND importe_cent > 0 AND desde <= $1::date`,
    [hoy]
  )
  return { n: rows[0].n, totalCent: rows[0].total }
}

export async function fichaSuscripcion(id, { ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  let sus = await cargarSuscripcion(query, id)
  await asegurarCuotas(query, sus, hoy)
  sus = await cargarSuscripcion(query, id)
  const { rows: cr } = await query(
    `SELECT c.*, c.desde::text AS desde_txt, c.hasta::text AS hasta_txt, c.pagada_en::text AS pagada_en_txt,
            c.devuelta_en::text AS devuelta_en_txt,
            f.id AS factura_id, f.codigo AS factura_codigo, f.enviada_en AS factura_enviada_en, f.tipo AS factura_tipo
       FROM cuotas c LEFT JOIN facturas f ON f.cuota_id = c.id AND f.sustituida_en IS NULL
      WHERE c.suscripcion_id = $1 ORDER BY c.periodo`,
    [sus.id]
  )
  const { rows: sr } = await query('SELECT * FROM reservas WHERE suscripcion_id = $1 ORDER BY inicio', [sus.id])
  const sesiones = sr.map(aReserva)
  const cuotas = cr.map((f) => {
    const c = aCuota(f)
    const usadas = sesiones.filter((s) => {
      const d = fechaMadrid(s.inicio)
      return d >= c.desde && d < c.hasta && cuentaParaElPlan(s)
    }).reduce((a, s) => a + (s.horasPlan || 0), 0)
    return { ...c, chip: chipCuota(c, hoy), horasUsadas: usadas, factura: f.factura_id ? { id: f.factura_id, codigo: f.factura_codigo, enviada: Boolean(f.factura_enviada_en), simplificada: f.factura_tipo === 'simplificada' } : null }
  })
  const estado = estadoDe(sus, hoy)
  const actual = periodoActual(sus, hoy)
  const deActual = resumenDe(sus, cuotas, sesiones, ahora, actual)
  const siguiente = periodoNumero(sus, actual.numero + 1)
  const haySiguiente = !sus.ultimoDia || siguiente.desde <= sus.ultimoDia
  const deSiguiente = haySiguiente ? resumenDe(sus, cuotas, sesiones, ahora, siguiente) : null
  const eventos = await eventosDeSuscripcion(sus.id)
  return {
    sus,
    estado,
    enPrueba: enPrueba(sus, hoy),
    periodoActual: actual,
    resumenActual: deActual.resumen,
    sesionesActual: deActual.sesiones,
    resumenSiguiente: deSiguiente ? deSiguiente.resumen : null,
    cuotas,
    sesiones,
    eventos,
    ultimoDiaPermanencia: ultimoDiaPermanencia(sus),
    propuestaBajaHoy: sus.ultimoDia ? null : propuestaBaja(sus, hoy),
    puedeBorrarse: sesiones.length === 0 && !cuotas.some((c) => ['pagada', 'devuelta'].includes(c.estado) || c.factura),
    condiciones: textoCondiciones(sus),
  }
}

export async function cuotaPorId(id) {
  return cargarCuota(query, id)
}

export async function suscripcionCorta(id) {
  if (!id) return null
  const { rows } = await query(`${SELECT_SUS} WHERE id = $1`, [Number(id)])
  const sus = aSuscripcion(rows[0])
  return sus ? { id: sus.id, codigo: sus.codigo, nombre: `${sus.nombre} ${sus.apellidos}`.trim(), planNombre: sus.planNombre, avisoCancelacionH: sus.avisoCancelacionH } : null
}

export async function opcionesParaReservar({ ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const { subs, cuotas, sesiones } = await cargarTodo(hoy, ahora)
  return subs
    .filter((sus) => estadoDe(sus, hoy) !== 'finalizada')
    .map((sus) => {
      const { resumen, cuota } = resumenDe(sus, cuotas.get(sus.id) || [], sesiones.get(sus.id) || [], ahora, periodoActual(sus, hoy))
      const reglas = conReglasDelPeriodo(sus, cuota)
      return {
        id: sus.id,
        nombre: `${sus.nombre} ${sus.apellidos}`.trim(),
        planNombre: sus.planNombre,
        email: sus.email,
        franjaDesde: reglas.franjaDesde,
        franjaHasta: reglas.franjaHasta,
        duracionPorDefecto: reglas.duracionesH?.[0] ?? reglas.sesionMinH,
        resumen: { restantes: resumen.restantes, horas: resumen.horas, hastaTexto: textoFechaCorta(resumen.ultimoDia) },
        condiciones: textoCondiciones({ ...reglas, horasPeriodo: resumen.horas }),
      }
    })
}

// ---------- Sesiones del plan ----------

function lineaResumen(v) {
  if (!v.periodo) return ''
  const partes = [h(v.horas)]
  if (v.horasPlan > 0) partes.push(`${h(v.horasPlan)} del plan`)
  if (v.horasExtra > 0) partes.push(`${h(v.horasExtra)} aparte`)
  partes.push(`le quedarán ${h(v.restantesDespues)} hasta el ${textoFechaCorta(ultimoDiaDe(v.periodo))}`)
  return partes.join(' · ')
}

// Vista previa en directo (sin candado): reparto, avisos, huecos libres ese día
export async function comprobarSesion(susId, { fecha, desde, hasta, horasPlan = null, excluirId = null }, { ahora = new Date(), modo = 'panel' } = {}) {
  const sus = await cargarSuscripcion(query, susId)
  let fr
  try {
    fr = franja({ fecha, desde, hasta })
  } catch (e) {
    if (!(e instanceof ErrorReserva)) throw e
    return { errores: [{ codigo: e.codigo, texto: e.message }], avisos: [], notas: [], huecos: [], linea: '' }
  }
  const fest = await festivos(query)
  const { cuota, sesiones } = await datosDelPeriodo(query, sus, fecha)
  let moviendo = null
  if (excluirId) {
    const { rows } = await query('SELECT * FROM reservas WHERE id = $1 AND suscripcion_id = $2', [Number(excluirId), sus.id])
    moviendo = aReserva(rows[0])
  }
  const susP = conReglasDelPeriodo(sus, cuota)
  const v = validarSesion({ sus: susP, cuota, sesionesPeriodo: sesiones, inicio: fr.inicio, fin: fr.fin, horasPlan, festivos: fest, ahora, excluirId: moviendo?.id ?? null, moviendo, modo })
  const ocupado = await ocupacion(query, new Date(fr.inicio.getTime() - DIA_MS), new Date(fr.fin.getTime() + 2 * DIA_MS), { excluirId: moviendo?.id ?? null })
  if (choca(fr, ocupado)) v.errores.push({ codigo: 'ocupada', texto: 'Choca con otra reserva o con un bloqueo (con sus 30 minutos entre reservas).' })
  const huecos = iniciosPosibles({ fecha, horas: fr.horas, sus: susP, ocupado, ahora: modo === 'cliente' ? ahora : null })
  return { ...v, periodo: v.periodo, huecos, linea: lineaResumen(v) }
}

export async function crearSesionPlan(susId, datos, { ahora = new Date(), modo = 'panel', autor = 'panel' } = {}) {
  const fr = franja(datos)
  return conAgenda(async (q) => {
    const sus = await cargarSuscripcion(q, susId, { bloquear: true })
    await comprobarHueco(q, fr)
    await asegurarCuotas(q, sus, datos.fecha)
    const { periodo, cuota, sesiones } = await datosDelPeriodo(q, sus, datos.fecha)
    const fest = await festivos(q)
    const v = validarSesion({ sus: conReglasDelPeriodo(sus, cuota), cuota, sesionesPeriodo: sesiones, inicio: fr.inicio, fin: fr.fin, horasPlan: datos.horasPlan ?? null, festivos: fest, ahora, modo })
    exigir(v, datos.avisosAceptados)
    const precio = precioDeExtra(v.horasExtra, datos.precioExtraCent)
    const metodoExtra = METODOS.includes(datos.extraMetodo) ? datos.extraMetodo : null
    const pagado = precio === 0 || Boolean(datos.extraPagado)
    const fondos = ['no', 'blanco', 'negro', 'blanco-negro'].includes(datos.fondos) ? datos.fondos : 'no'
    const { rows } = await q(
      `INSERT INTO reservas (codigo, token, origen, estado, pago_estado, metodo_pago, pagado_en, inicio, fin, bloqueo_hasta,
          duracion_horas, tipo_dia, precio_cent, nombre, apellidos, email, telefono, actividad, fondos, equipo, factura,
          notas_internas, suscripcion_id, horas_plan)
       VALUES ($1, $2, 'plan', 'confirmada', $3, $4, CASE WHEN $3 = 'pagado' THEN now() END, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, 'Creación de contenido', $15, '[]', $16, $17, $18, $19)
       RETURNING *`,
      [codigoNuevo(), tokenNuevo(), pagado ? 'pagado' : 'pendiente', precio === 0 ? 'plan' : pagado ? metodoExtra || 'otro' : null,
        fr.inicio, fr.fin, bloqueoHasta(fr.fin), fr.horas, tipoDeDia(datos.fecha, fest), precio, sus.nombre, sus.apellidos,
        sus.email, sus.telefono, fondos, precio > 0 && sus.factura ? JSON.stringify(sus.factura) : null,
        texto(datos.notasInternas, 4000) || null, sus.id, v.horasPlan]
    )
    const reserva = aReserva({ ...rows[0], plan_suscripcion: sus.plan })
    await registrar(q, reserva.id, 'creada', {
      origen: 'plan', horasPlan: v.horasPlan, horasExtra: v.horasExtra, precioExtraCent: precio, avisosAceptados: v.avisos.map((a) => a.codigo),
    }, { suscripcionId: sus.id, autor })
    const despues = await sesionesEntre(q, sus.id, periodo.desde, periodo.hasta)
    return { reserva, suscripcion: sus, resumen: resumenPeriodo({ periodo, horas: cuota ? cuota.horas : sus.horasPeriodo, sesiones: despues, ahora }) }
  })
}

export async function moverSesionPlan(reservaId, datos, { ahora = new Date() } = {}) {
  const comprobar = async (q, r, nueva, fest) => {
    const sus = await cargarSuscripcion(q, r.suscripcionId, { bloquear: true })
    const fecha = fechaMadrid(nueva.inicio)
    await asegurarCuotas(q, sus, fecha)
    const { cuota, sesiones } = await datosDelPeriodo(q, sus, fecha)
    const v = validarSesion({ sus: conReglasDelPeriodo(sus, cuota), cuota, sesionesPeriodo: sesiones, inicio: nueva.inicio, fin: nueva.fin, horasPlan: datos.horasPlan ?? null, festivos: fest, ahora, excluirId: r.id, moviendo: r })
    exigir(v, datos.avisosAceptados)
    const extrasAntes = Math.max(0, r.duracionHoras - (r.horasPlan || 0))
    const sinPrecio = datos.precioExtraCent === null || datos.precioExtraCent === undefined || datos.precioExtraCent === ''
    if (sinPrecio && Math.abs(v.horasExtra - extrasAntes) < 1e-9) {
      // Mismas horas aparte: se queda con su precio y su pago (también si eran de regalo)
      return { horasPlan: v.horasPlan, precioCent: r.precioCent, pagoEstado: r.pagoEstado, metodoPago: r.metodoPago, avisosAceptados: v.avisos.map((a) => a.codigo) }
    }
    const precio = precioDeExtra(v.horasExtra, v.horasExtra > 0 && (datos.precioExtraCent === null || datos.precioExtraCent === undefined || datos.precioExtraCent === '') && r.pagoEstado === 'pagado' && r.precioCent > 0 ? r.precioCent : datos.precioExtraCent)
    if (r.pagoEstado === 'pagado' && r.precioCent > 0 && precio !== r.precioCent) {
      throw new ErrorReserva('pagada', 'Tiene horas aparte ya pagadas: para cambiar las horas, cancélala (con devolución) y resérvala de nuevo.')
    }
    return {
      horasPlan: v.horasPlan,
      precioCent: precio,
      pagoEstado: precio === 0 ? 'pagado' : r.precioCent > 0 ? r.pagoEstado : 'pendiente',
      metodoPago: precio === 0 ? 'plan' : r.metodoPago === 'plan' ? null : r.metodoPago,
      avisosAceptados: v.avisos.map((a) => a.codigo),
    }
  }
  return reprogramar(reservaId, { fecha: datos.fecha, desde: datos.desde, hasta: datos.hasta }, { comprobar })
}

export async function cancelarSesionPlan(reservaId, { motivo, cuentaComoUsada = null, reembolsoCent = 0 }, { ahora = new Date() } = {}) {
  const { rows } = await query('SELECT * FROM reservas WHERE id = $1', [Number(reservaId)])
  const r = aReserva(rows[0])
  if (!r) throw new ErrorReserva('no_existe', 'Reserva no encontrada.', 404)
  if (r.origen !== 'plan') throw new ErrorReserva('plan', 'No es una sesión de suscripción.', 400)
  const sus = await cargarSuscripcion(query, r.suscripcionId)
  const regla = cancelacionCuenta(sus, r, ahora)
  const cuenta = cuentaComoUsada === null || cuentaComoUsada === undefined ? regla : Boolean(cuentaComoUsada)
  return cancelar(r.id, { motivo, reembolsoCent, cuentaComoUsada: cuenta, excepcion: regla && !cuenta })
}

// ---------- Acciones sobre cuotas ----------

async function horasReservadasEnCuota(q, c) {
  return (await sesionesEntre(q, c.suscripcionId, c.desde, c.hasta)).filter(cuentaParaElPlan).reduce((a, s) => a + (s.horasPlan || 0), 0)
}

export async function marcarCuotaPagada(cuotaId, { metodo, pagadaEn = null, referencia = null, enlace = null, nota = null }) {
  if (!METODOS.includes(metodo)) throw new ErrorReserva('metodo', 'Elige cómo ha pagado.', 400)
  const fecha = fechaPasadaOHoy(pagadaEn || hoyMadrid(), 'La fecha de pago no puede ser futura.')
  const link = enlaceSeguro(enlace)
  return transaction(async (tx) => {
    const q = tx.query
    const c = await cargarCuota(q, cuotaId, { bloquear: true })
    if (c.estado !== 'pendiente') throw new ErrorReserva('estado', 'Esta cuota no está pendiente.')
    await q(
      `UPDATE cuotas SET estado = 'pagada', metodo_pago = $2, pagada_en = $3, referencia = $4, enlace = $5,
          nota = coalesce($6, nota), actualizado_en = now() WHERE id = $1`,
      [c.id, metodo, fecha, texto(referencia, 200) || null, link, texto(nota, 500) || null]
    )
    await q('UPDATE suscripciones SET metodo_habitual = coalesce(metodo_habitual, $2), actualizado_en = now() WHERE id = $1', [c.suscripcionId, metodo])
    await registrarSus(q, c.suscripcionId, 'cuota_pagada', { periodo: c.periodo, metodo, fecha, importeCent: c.importeCent })
    return { cuota: await cargarCuota(q, c.id), suscripcion: await cargarSuscripcion(q, c.suscripcionId) }
  })
}

export async function desmarcarCuota(cuotaId) {
  return transaction(async (tx) => {
    const q = tx.query
    const c = await cargarCuota(q, cuotaId, { bloquear: true })
    if (c.estado !== 'pagada') throw new ErrorReserva('estado', 'Solo se puede deshacer una cuota pagada.')
    const { rows } = await q('SELECT codigo FROM facturas WHERE cuota_id = $1 AND sustituida_en IS NULL', [c.id])
    if (rows[0]) throw new ErrorReserva('factura', `Tiene la factura ${rows[0].codigo}: si hay que corregirla, haz una rectificativa a mano.`)
    await q(
      `UPDATE cuotas SET estado = 'pendiente', metodo_pago = NULL, pagada_en = NULL, referencia = NULL, enlace = NULL,
          proveedor = NULL, proveedor_ref = NULL, actualizado_en = now() WHERE id = $1`,
      [c.id]
    )
    await registrarSus(q, c.suscripcionId, 'cuota_desmarcada', { periodo: c.periodo, metodo: c.metodoPago, pagadaEn: c.pagadaEn })
  })
}

export async function editarCuota(cuotaId, { importeCent = null, horas = null, nota = null }) {
  return conAgenda(async (q) => {
    const c = await cargarCuota(q, cuotaId, { bloquear: true })
    const cambios = {}
    if (importeCent !== null && importeCent !== undefined && importeCent !== '') {
      const imp = Number(importeCent)
      if (!Number.isInteger(imp) || imp < 0) throw new ErrorReserva('importe', 'Importe no válido.', 400)
      if (imp !== c.importeCent && c.estado !== 'pendiente') throw new ErrorReserva('estado', 'El importe solo se cambia mientras está pendiente.')
      cambios.importeCent = imp
    }
    if (horas !== null && horas !== undefined && horas !== '') {
      const hh = Number(String(horas).replace(',', '.'))
      if (!(hh >= 0) || Math.abs(hh * 4 - Math.round(hh * 4)) > 1e-9) throw new ErrorReserva('horas', 'Las horas van en cuartos de hora (p. ej. 4 o 4,5).', 400)
      const usadas = await horasReservadasEnCuota(q, c)
      if (hh < usadas - 1e-9) throw new ErrorReserva('horas', `Ya tiene ${h(usadas)} reservadas en ese periodo.`, 409)
      cambios.horas = hh
    }
    await q(
      `UPDATE cuotas SET importe_cent = coalesce($2, importe_cent), horas = coalesce($3, horas), nota = coalesce($4, nota), actualizado_en = now()
        WHERE id = $1`,
      [c.id, cambios.importeCent ?? null, cambios.horas ?? null, texto(nota, 500) || null]
    )
    await registrarSus(q, c.suscripcionId, 'cuota_editada', { periodo: c.periodo, antes: { importeCent: c.importeCent, horas: c.horas }, despues: cambios, nota: nota || null })
    return cargarCuota(q, c.id)
  })
}

export async function anularCuota(cuotaId, { nota = null, pausa = false } = {}) {
  return conAgenda(async (q) => {
    const c = await cargarCuota(q, cuotaId, { bloquear: true })
    if (c.estado !== 'pendiente') throw new ErrorReserva('estado', 'Solo se anulan cuotas pendientes.')
    if (pausa && (await horasReservadasEnCuota(q, c)) > 0) {
      throw new ErrorReserva('sesiones', 'Tiene sesiones en ese periodo: cancélalas antes de quitarle las horas.')
    }
    await q(
      `UPDATE cuotas SET estado = 'anulada', horas = CASE WHEN $2 THEN 0 ELSE horas END, nota = coalesce($3, nota), actualizado_en = now()
        WHERE id = $1`,
      [c.id, Boolean(pausa), texto(nota, 500) || null]
    )
    await registrarSus(q, c.suscripcionId, 'cuota_anulada', { periodo: c.periodo, pausa: Boolean(pausa), nota: nota || null })
  })
}

export async function devolverCuota(cuotaId, { nota = null, fecha = null } = {}) {
  const f = fechaPasadaOHoy(fecha || hoyMadrid(), 'La fecha de la devolución no puede ser futura.')
  return transaction(async (tx) => {
    const q = tx.query
    const c = await cargarCuota(q, cuotaId, { bloquear: true })
    if (c.estado !== 'pagada') throw new ErrorReserva('estado', 'Solo se devuelve una cuota pagada.')
    if (c.pagadaEn && f < c.pagadaEn) throw new ErrorReserva('fecha', 'La devolución no puede ser de antes del pago.', 400)
    await q(`UPDATE cuotas SET estado = 'devuelta', devuelta_en = $3, nota = coalesce($2, nota), actualizado_en = now() WHERE id = $1`, [c.id, texto(nota, 500) || null, f])
    const { rows } = await q('SELECT codigo FROM facturas WHERE cuota_id = $1 AND sustituida_en IS NULL', [c.id])
    await registrarSus(q, c.suscripcionId, 'cuota_devuelta', { periodo: c.periodo, factura: rows[0]?.codigo || null, nota: nota || null, fecha: f })
    return { facturaCodigo: rows[0]?.codigo || null }
  })
}

// Única entrada para cobros automáticos (Stripe o Comercia) cuando haya webhooks. Idempotente.
export async function registrarCobroCuota({ proveedor, suscripcionRef, cobroRef, fecha, importeCent = null, enlace = null }) {
  if (!['stripe', 'comercia'].includes(proveedor) || !cobroRef || !esFecha(fecha)) throw new ErrorReserva('datos', 'Cobro no válido.', 400)
  return transaction(async (tx) => {
    const q = tx.query
    const { rows: ya } = await q(`${SELECT_CUOTA} WHERE proveedor = $1 AND proveedor_ref = $2`, [proveedor, cobroRef])
    if (ya[0]) return { cuota: aCuota(ya[0]), nuevo: false, aviso: null }
    const { rows: ss } = await q(`${SELECT_SUS} WHERE cobro_externo = $1 AND cobro_externo_ref = $2`, [proveedor, suscripcionRef])
    const sus = aSuscripcion(ss[0])
    if (!sus) throw new ErrorReserva('no_existe', 'No hay ninguna suscripción con esa referencia.', 404)
    await asegurarCuotas(q, sus, fecha)
    const p = periodoDe(sus, fecha)
    if (!p) throw new ErrorReserva('fecha', 'El cobro es de antes de empezar la suscripción.', 409)
    const { rows } = await q(`${SELECT_CUOTA} WHERE suscripcion_id = $1 AND periodo = $2 FOR UPDATE`, [sus.id, p.numero])
    const c = aCuota(rows[0])
    const importeRaro = importeCent !== null && c && Number(importeCent) !== c.importeCent
    let aviso = null
    if (c && c.estado === 'pendiente') {
      await q(
        `UPDATE cuotas SET estado = 'pagada', metodo_pago = $2, pagada_en = $3, proveedor = $4, proveedor_ref = $5,
            enlace = coalesce($6, enlace), actualizado_en = now() WHERE id = $1`,
        [c.id, proveedor === 'stripe' ? 'stripe' : 'tarjeta', fecha, proveedor, cobroRef, enlace && /^https:\/\//.test(enlace) ? enlace : null]
      )
      await registrarSus(q, sus.id, 'cuota_pagada', { periodo: c.periodo, proveedor, cobroRef, importeCent, aviso: importeRaro ? 'importe_distinto' : null }, 'sistema')
    } else if (c && c.estado === 'pagada' && !c.proveedorRef) {
      await q('UPDATE cuotas SET proveedor = $2, proveedor_ref = $3, enlace = coalesce(enlace, $4), actualizado_en = now() WHERE id = $1',
        [c.id, proveedor, cobroRef, enlace && /^https:\/\//.test(enlace) ? enlace : null])
      await registrarSus(q, sus.id, 'cobro_enlazado', { periodo: c.periodo, proveedor, cobroRef }, 'sistema')
    } else {
      aviso = 'revisar'
      await registrarSus(q, sus.id, 'cobro_sin_cuota', { periodo: p.numero, proveedor, cobroRef, importeCent }, 'sistema')
    }
    if (importeRaro) aviso = aviso || 'importe_distinto'
    return { cuota: c ? await cargarCuota(q, c.id) : null, nuevo: true, aviso }
  })
}

// ---------- Baja ----------

export async function darDeBaja(id, { avisoEn, ultimoDia, motivo = null, cancelarSesiones = true, cobroExternoCancelado = false }, { ahora = new Date() } = {}) {
  if (!esFecha(avisoEn) || !esFecha(ultimoDia)) throw new ErrorReserva('fecha', 'Pon cuándo avisó y su último día.', 400)
  return conAgenda(async (q) => {
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    if (sus.ultimoDia) throw new ErrorReserva('estado', 'Ya tiene la baja apuntada: deshazla para cambiarla.')
    if (ultimoDia < sus.fechaInicio) throw new ErrorReserva('fecha', 'El último día no puede ser antes de empezar.', 400)
    const consecuencias = consecuenciasBaja(sus, ultimoDia, avisoEn)
    const { rows } = await q(
      `SELECT * FROM reservas WHERE suscripcion_id = $1 AND estado IN ('pendiente', 'confirmada', 'conflicto') AND inicio >= $2 ORDER BY inicio`,
      [sus.id, madridAInstante(sumarDias(ultimoDia, 1), '00:00')]
    )
    const despues = rows.map(aReserva)
    if (despues.length && !cancelarSesiones) {
      throw new ErrorReserva('sesiones', `Tiene ${despues.length} ${despues.length === 1 ? 'sesión' : 'sesiones'} después de ese día.`, 409, {
        sesiones: despues.map((s) => ({ codigo: s.codigo, cuando: `${textoDiaCorto(fechaMadrid(s.inicio))} ${horaMadrid(s.inicio)}` })),
      })
    }
    const conExtraPagado = []
    for (const s of despues) {
      await q(
        `UPDATE reservas SET estado = 'cancelada', cancelada_en = now(), motivo_cancelacion = 'Baja de la suscripción',
            cuenta_como_usada = false, expira_en = NULL, actualizado_en = now() WHERE id = $1`,
        [s.id]
      )
      await registrar(q, s.id, 'cancelada', { motivo: 'Baja de la suscripción', cuentaComoUsada: false }, { suscripcionId: sus.id, autor: 'panel' })
      if (s.pagoEstado === 'pagado' && s.precioCent > 0) conExtraPagado.push(s.codigo)
    }
    const { rows: borradas } = await q(`${SELECT_CUOTA} WHERE suscripcion_id = $1 AND desde > $2::date AND estado IN ('pendiente', 'anulada') ORDER BY periodo`, [sus.id, ultimoDia])
    await q(`DELETE FROM cuotas WHERE suscripcion_id = $1 AND desde > $2::date AND estado IN ('pendiente', 'anulada')`, [sus.id, ultimoDia])
    const { rows: pagadas } = await q(`${SELECT_CUOTA} WHERE suscripcion_id = $1 AND desde > $2::date AND estado = 'pagada'`, [sus.id, ultimoDia])
    await q(
      `UPDATE suscripciones SET ultimo_dia = $2, baja_avisada_en = $3, motivo_baja = $4,
          cobro_externo = CASE WHEN $5 THEN NULL ELSE cobro_externo END,
          cobro_externo_ref = CASE WHEN $5 THEN NULL ELSE cobro_externo_ref END, actualizado_en = now()
        WHERE id = $1`,
      [sus.id, ultimoDia, avisoEn, texto(motivo, 500) || null, Boolean(cobroExternoCancelado)]
    )
    await registrarSus(q, sus.id, 'baja', {
      avisoEn, ultimoDia, motivo: motivo || null, textos: consecuencias.textos, sesionesCanceladas: despues.map((s) => s.codigo),
      cobroExterno: sus.cobroExterno, cobroExternoRef: sus.cobroExternoRef, cobroExternoCancelado: Boolean(cobroExternoCancelado),
      cuotasBorradas: borradas.map(aCuota).map((c) => ({ periodo: c.periodo, desde: c.desde, hasta: c.hasta, horas: c.horas, importeCent: c.importeCent, estado: c.estado, nota: c.nota, plan: c.plan, reglas: c.reglas })),
    })
    return {
      suscripcion: await cargarSuscripcion(q, sus.id),
      consecuencias,
      sesionesCanceladas: despues.map((s) => s.codigo),
      sesionesConExtraPagado: conExtraPagado,
      cuotasPagadasDespues: pagadas.map(aCuota),
    }
  })
}

export async function deshacerBaja(id, { ahora = new Date() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    if (!sus.ultimoDia) throw new ErrorReserva('estado', 'No tiene la baja apuntada.')
    if (sus.ultimoDia < hoyMadrid(ahora)) throw new ErrorReserva('estado', 'La suscripción ya terminó: crea una nueva.')
    await q(`UPDATE suscripciones SET ultimo_dia = NULL, baja_avisada_en = NULL, motivo_baja = NULL, actualizado_en = now() WHERE id = $1`, [sus.id])
    const { rows: ev } = await q(`SELECT id, detalle FROM eventos WHERE suscripcion_id = $1 AND tipo = 'baja' ORDER BY creado_en DESC, id DESC LIMIT 1`, [sus.id])
    const borradas = ev[0]?.detalle?.cuotasBorradas || []
    // Si después de la baja se cambiaron las condiciones, las pendientes desde ese periodo van con las de ahora
    let cambioDesde = null
    if (ev[0]) {
      const { rows: cc } = await q(
        `SELECT min((detalle->>'desdePeriodo')::int) AS d FROM eventos WHERE suscripcion_id = $1 AND tipo = 'condiciones' AND id > $2`,
        [sus.id, ev[0].id]
      )
      cambioDesde = cc[0]?.d ?? null
    }
    for (const c of borradas) {
      const actuales = c.estado !== 'anulada' && cambioDesde !== null && c.periodo >= cambioDesde
      await q(
        `INSERT INTO cuotas (suscripcion_id, periodo, desde, hasta, horas, importe_cent, estado, nota, plan, reglas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (suscripcion_id, periodo) DO NOTHING`,
        [sus.id, c.periodo, c.desde, c.hasta, actuales ? sus.horasPeriodo : c.horas, actuales ? sus.cuotaCent : c.importeCent,
          c.estado === 'anulada' ? 'anulada' : 'pendiente', c.nota ?? null, actuales ? sus.plan : c.plan || sus.plan,
          JSON.stringify(actuales || !c.reglas ? reglasDe(sus) : c.reglas)]
      )
    }
    await registrarSus(q, sus.id, 'baja_deshecha', { ultimoDia: sus.ultimoDia, cuotasRecuperadas: borradas.map((c) => c.periodo) })
  })
}

export async function marcarCobroExternoCancelado(id) {
  return transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    await q('UPDATE suscripciones SET cobro_externo = NULL, cobro_externo_ref = NULL, actualizado_en = now() WHERE id = $1', [sus.id])
    await registrarSus(q, sus.id, 'cobro_externo_cancelado', { cobroExterno: sus.cobroExterno, cobroExternoRef: sus.cobroExternoRef })
  })
}

// ---------- Fianza ----------

export async function resolverFianza(id, { accion, importeCent = null, metodo = null, fecha = null, nota = null }) {
  return transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, id, { bloquear: true })
    const n = texto(nota, 500) || null
    if (accion === 'cobrada') {
      if (!['pendiente', 'sin_fianza'].includes(sus.fianzaEstado)) throw new ErrorReserva('estado', 'La fianza ya está cobrada.')
      if (!METODOS.includes(metodo)) throw new ErrorReserva('metodo', 'Elige cómo se cobró.', 400)
      const f = fechaPasadaOHoy(fecha || hoyMadrid(), 'La fecha de cobro no puede ser futura.')
      const imp = importeCent === null || importeCent === undefined || importeCent === '' ? sus.fianzaCent : Number(importeCent)
      if (!Number.isInteger(imp) || imp <= 0) throw new ErrorReserva('importe', 'Importe de la fianza no válido.', 400)
      await q(`UPDATE suscripciones SET fianza_estado = 'cobrada', fianza_cent = $2, fianza_metodo = $3, fianza_cobrada_en = $4,
          fianza_nota = coalesce($5, fianza_nota), actualizado_en = now() WHERE id = $1`, [sus.id, imp, metodo, f, n])
    } else if (accion === 'devolver' || accion === 'retener') {
      if (sus.fianzaEstado !== 'cobrada') throw new ErrorReserva('estado', 'La fianza no está cobrada.')
      if (!sus.ultimoDia) throw new ErrorReserva('estado', 'Primero apunta la baja.')
      const f = fechaPasadaOHoy(fecha || hoyMadrid(), 'La fecha no puede ser futura.')
      if (accion === 'devolver') {
        const imp = importeCent === null || importeCent === undefined || importeCent === '' ? sus.fianzaCent : Number(importeCent)
        if (!Number.isInteger(imp) || imp < 1 || imp > sus.fianzaCent) throw new ErrorReserva('importe', `Lo que se devuelve tiene que ser de 0,01 a ${formatoEuros(sus.fianzaCent)}.`, 400)
        if (imp < sus.fianzaCent && !n) throw new ErrorReserva('nota', 'Si devuelves solo una parte, explica por qué en la nota.', 400)
        await q(`UPDATE suscripciones SET fianza_estado = 'devuelta', fianza_devuelta_cent = $2, fianza_resuelta_en = $3,
            fianza_nota = coalesce($4, fianza_nota), actualizado_en = now() WHERE id = $1`, [sus.id, imp, f, n])
      } else {
        if (!n) throw new ErrorReserva('nota', 'Explica en la nota por qué os quedáis la fianza.', 400)
        await q(`UPDATE suscripciones SET fianza_estado = 'retenida', fianza_resuelta_en = $2, fianza_nota = $3, actualizado_en = now()
            WHERE id = $1`, [sus.id, f, n])
      }
    } else if (accion === 'sin_fianza') {
      if (sus.fianzaEstado !== 'pendiente') throw new ErrorReserva('estado', 'Solo si aún no se ha cobrado.')
      await q(`UPDATE suscripciones SET fianza_estado = 'sin_fianza', fianza_nota = coalesce($2, fianza_nota), actualizado_en = now() WHERE id = $1`, [sus.id, n])
    } else {
      throw new ErrorReserva('accion', 'Acción desconocida.', 400)
    }
    await registrarSus(q, sus.id, 'fianza', { accion, importeCent, metodo, fecha, nota: n })
    return cargarSuscripcion(q, sus.id)
  })
}

export async function eventosDeSuscripcion(id) {
  const { rows } = await query(
    `SELECT e.tipo, e.detalle, e.creado_en, e.reserva_id, r.codigo
       FROM eventos e LEFT JOIN reservas r ON r.id = e.reserva_id
      WHERE e.suscripcion_id = $1 ORDER BY e.creado_en, e.id`,
    [Number(id)]
  )
  return rows.map((e) => ({ tipo: e.tipo, detalle: e.detalle, creadoEn: new Date(e.creado_en), reservaId: e.reserva_id, codigo: e.codigo }))
}

export { condicionesDePlan, cargarSuscripcion as _cargarSuscripcion }
