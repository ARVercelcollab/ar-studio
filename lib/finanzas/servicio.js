// Finanzas en la base de datos: gastos (sueltos y fijos de cada mes), lo cobrado por Calendly
// cada mes, otros ingresos apuntados a mano, ajustes y avisos. Los cobros de reservas y cuotas
// no se copian: se leen de sus tablas cada vez (ver lib/finanzas/calculos.js).

import { query, transaction } from '../db/index.js'
import { ErrorReserva } from '../reservas/servicio.js'
import { fechaMadrid, madridAInstante, esFecha, sumarDias } from '../reservas/tiempo.js'
import { reservasAbiertas } from '../http.js'
import { contarCuotasSinPagar } from '../suscripciones/servicio.js'
import { desglose } from '../facturas/iva.js'
import { METODOS_CUOTA } from '../reservas/config.js'
import {
  GRUPOS, TIPOS_FACTURA, RETENCIONES, CADA_MESES, METODOS_GASTO, METODOS_INGRESO, TIPOS_INGRESO, FUENTES,
  TEXTO_FUENTE, FILTROS_INGRESO, COMISION_STRIPE_TIPO_FACTURA, MAX_CENT, ANIO_MINIMO, TIPOS_FACTURA_CSV,
} from './config.js'
import * as C from './calculos.js'
import { aCsv, fechaCsv } from './csv.js'

export const CANDADO_FINANZAS = 7271004
const hoyMadrid = (ahora = new Date()) => fechaMadrid(ahora)
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const opcional = (v, max) => texto(v, max) || null
const TIPOS_FAC = TIPOS_FACTURA.map(([id]) => id)
const RETS = RETENCIONES.map(([p]) => p)
const CADAS = CADA_MESES.map(([n]) => n)
const MET_GASTO = METODOS_GASTO.map(([id]) => id)
const MET_INGRESO = METODOS_INGRESO.map(([id]) => id)
const TIPOS_ING = TIPOS_INGRESO.map(([id]) => id)
const GRUPOS_IDS = GRUPOS.map(([g]) => g)
const MET_TEXTO = { ...Object.fromEntries(METODOS_CUOTA), ...Object.fromEntries(METODOS_INGRESO), plan: 'Incluida en la suscripción' }

function enlaceSeguro(url, campo = 'enlace') {
  const t = String(url || '').trim()
  if (!t) return null
  if (!/^https:\/\//i.test(t) || t.length > 500) throw new ErrorReserva(campo, 'Pega un enlace que empiece por https://', 400)
  return t
}
const claveValida = (k) => (typeof k === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(k) ? k : null)

async function conQ(q, fn) {
  if (q) return fn(q)
  return transaction(async (tx) => fn(tx.query))
}

function errorVersion(existe) {
  return existe
    ? new ErrorReserva('cambiado', 'Alguien lo ha cambiado mientras tanto. Recarga la página y vuelve a hacerlo.', 409)
    : new ErrorReserva('no_existe', 'No encontrado.', 404)
}

// ---------- Filas -> objetos ----------

export function aCategoria(f) {
  return {
    id: f.id, clave: f.clave, nombre: f.nombre, grupo: f.grupo, ayuda: f.ayuda || '', tipoFactura: f.tipo_factura,
    ivaPct: f.iva_pct ?? null, retencionPct: f.retencion_pct, avisoCadaMeses: f.aviso_cada_meses ?? null, orden: f.orden, activa: f.activa,
  }
}

export function aGasto(f) {
  return {
    id: f.id, fecha: f.fecha_txt, categoriaId: f.categoria_id, categoria: f.categoria, grupo: f.grupo, categoriaClave: f.categoria_clave,
    concepto: f.concepto, proveedor: f.proveedor || '', numFactura: f.num_factura || '', tipoFactura: f.tipo_factura,
    totalCent: f.total_cent, baseCent: f.base_cent, ivaPct: f.iva_pct ?? null, ivaCent: f.iva_cent, retencionPct: f.retencion_pct,
    retencionCent: f.retencion_cent, metodoPago: f.metodo_pago || null, enlace: f.enlace || null, nota: f.nota || '',
    fijoId: f.fijo_id || null, mes: f.mes_txt || null, editado: Boolean(f.editado), calendlyMes: f.calendly_mes_txt || null,
    estado: f.estado, version: f.version,
  }
}

function aFijo(f) {
  return {
    id: f.id, categoriaId: f.categoria_id, categoria: f.categoria, grupo: f.grupo, concepto: f.concepto, proveedor: f.proveedor || '',
    importeEs: f.importe_es, tipoFactura: f.tipo_factura, ivaPct: f.iva_pct ?? null, retencionPct: f.retencion_pct,
    metodoPago: f.metodo_pago || null, cadaMeses: f.cada_meses, dia: f.dia, desdeMes: f.desde_mes_txt, hastaMes: f.hasta_mes_txt || null,
    nota: f.nota || '', version: f.version,
  }
}

export function aIngreso(f) {
  return {
    id: f.id, tipo: f.tipo, sentido: f.sentido, fecha: f.fecha_txt, concepto: f.concepto, totalCent: f.total_cent, ivaPct: f.iva_pct ?? null,
    ivaCent: f.iva_cent, reservaId: f.reserva_id || null, reservaCodigo: f.reserva_codigo || null, facturaRef: f.factura_ref || '',
    clienteNombre: f.cliente_nombre || '', clienteNif: f.cliente_nif || '', metodoPago: f.metodo_pago || null, enlace: f.enlace || null,
    nota: f.nota || '', version: f.version,
  }
}

const SELECT_GASTO = `SELECT g.*, g.fecha::text AS fecha_txt, g.mes::text AS mes_txt, g.calendly_mes::text AS calendly_mes_txt,
    c.nombre AS categoria, c.grupo, c.clave AS categoria_clave
  FROM gastos g JOIN gasto_categorias c ON c.id = g.categoria_id`
const SELECT_FIJO = `SELECT f.*, f.desde_mes::text AS desde_mes_txt, f.hasta_mes::text AS hasta_mes_txt, c.nombre AS categoria, c.grupo
  FROM gastos_fijos f JOIN gasto_categorias c ON c.id = f.categoria_id`
const SELECT_INGRESO = `SELECT i.*, i.fecha::text AS fecha_txt, r.codigo AS reserva_codigo
  FROM ingresos_manuales i LEFT JOIN reservas r ON r.id = i.reserva_id`

// ---------- Ajustes ----------

export async function primerMesConDatos(q = query) {
  const { rows } = await q(`SELECT least(
      (SELECT min(fecha) FROM gastos WHERE fijo_id IS NULL AND calendly_mes IS NULL),
      (SELECT min(mes) FROM gastos WHERE fijo_id IS NOT NULL),
      (SELECT min(fecha) FROM ingresos_manuales),
      (SELECT min(mes) FROM calendly_meses),
      (SELECT min(pagada_en) FROM cuotas WHERE importe_cent > 0 AND estado IN ('pagada', 'devuelta')),
      (SELECT min((pagado_en AT TIME ZONE 'Europe/Madrid')::date) FROM reservas
        WHERE precio_cent > 0 AND origen <> 'calendly' AND pagado_en IS NOT NULL)
    )::text AS d`)
  return rows[0]?.d ? C.mesDe(rows[0].d) : null
}

export async function ajustesFinanzas(q = query, { hoy = hoyMadrid() } = {}) {
  const { rows } = await q(`SELECT clave, valor FROM ajustes WHERE clave IN ('finanzas_desde', 'finanzas_calendly_hasta')`)
  const a = Object.fromEntries(rows.map((r) => [r.clave, r.valor]))
  const primero = await primerMesConDatos(q)
  const mesHoy = C.mesDe(hoy)
  let desde = a.finanzas_desde || primero || mesHoy
  if (desde > mesHoy) desde = mesHoy
  return {
    desde,
    desdeGuardado: Boolean(a.finanzas_desde),
    calendlyHasta: a.finanzas_calendly_hasta || 'sigue',
    calendlyGuardado: Boolean(a.finanzas_calendly_hasta),
    primerMesConDatos: primero,
  }
}

export const cobraCalendly = (aj, mes) => {
  if (mes < aj.desde || aj.calendlyHasta === 'nunca') return false
  return aj.calendlyHasta === 'sigue' || mes <= aj.calendlyHasta
}

// ¿Se cobra por Calendly este mes y aún no está apuntado? (se apunta al cerrar el mes)
export async function calendlyEnCursoSinApuntar(aj, hoy = hoyMadrid()) {
  const mes = C.mesDe(hoy)
  if (!cobraCalendly(aj, mes)) return false
  const { rows } = await query('SELECT 1 FROM calendly_meses WHERE mes = $1', [C.primerDia(mes)])
  return !rows[0]
}

// Meses cerrados en los que se cobró por Calendly y no está apuntado
async function mesesSinCalendly(q, aj, hoy) {
  const { rows } = await q('SELECT mes::text AS m FROM calendly_meses')
  const hay = new Set(rows.map((r) => C.mesDe(r.m)))
  const r = []
  for (let m = aj.desde; m < C.mesDe(hoy); m = C.sumarMesesMes(m, 1)) if (cobraCalendly(aj, m) && !hay.has(m)) r.push(m)
  return r
}

export async function guardarAjustesFinanzas({ desde, calendlyHasta }, { hoy = hoyMadrid() } = {}) {
  const mesHoy = C.mesDe(hoy)
  const esMes = (v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) && C.leerPeriodo(v, hoy)
  if (!esMes(desde) || desde < `${ANIO_MINIMO}-01` || desde > mesHoy) throw new ErrorReserva('desde', 'Elige un mes de la lista.', 400)
  if (!['sigue', 'nunca'].includes(calendlyHasta) && !(esMes(calendlyHasta) && calendlyHasta <= mesHoy)) {
    throw new ErrorReserva('calendlyHasta', 'Elige hasta cuándo se cobró por Calendly.', 400)
  }
  const sql = `INSERT INTO ajustes (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`
  await transaction(async (tx) => {
    await tx.query(sql, ['finanzas_desde', desde])
    await tx.query(sql, ['finanzas_calendly_hasta', calendlyHasta])
  })
}

// ---------- Gastos fijos de cada mes ----------

async function tramosDe(q, ids) {
  if (!ids.length) return new Map()
  const { rows } = await q('SELECT fijo_id, desde_mes::text AS d, importe_cent FROM gastos_fijos_importes WHERE fijo_id = ANY($1::int[]) ORDER BY desde_mes', [ids])
  const m = new Map()
  for (const r of rows) {
    if (!m.has(r.fijo_id)) m.set(r.fijo_id, [])
    m.get(r.fijo_id).push({ desdeMes: r.d, importeCent: r.importe_cent })
  }
  return m
}

const COLS_FILA = 'fecha, mes, categoria_id, concepto, proveedor, tipo_factura, iva_pct, retencion_pct, metodo_pago, base_cent, iva_cent, retencion_cent, total_cent'
const valoresFila = (f) => [f.fecha, f.mes, f.categoriaId, f.concepto, f.proveedor, f.tipoFactura, f.ivaPct, f.retencionPct, f.metodoPago, f.baseCent, f.ivaCent, f.retencionCent, f.totalCent]

// Apunta en "gastos" la fila de cada mes que toca de cada fijo (nunca meses futuros). Idempotente.
export async function asegurarGastosFijos(q = null, { hoy = hoyMadrid(), soloId = null } = {}) {
  return conQ(q, async (qq) => {
    await qq('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const { rows } = await qq(`${SELECT_FIJO}${soloId ? ' WHERE f.id = $1' : ''}`, soloId ? [soloId] : [])
    const fijos = rows.map(aFijo)
    if (!fijos.length) return 0
    const tramos = await tramosDe(qq, fijos.map((f) => f.id))
    const { rows: ya } = await qq('SELECT fijo_id, mes::text AS m FROM gastos WHERE fijo_id = ANY($1::int[])', [fijos.map((f) => f.id)])
    const hay = new Set(ya.map((r) => `${r.fijo_id}|${r.m}`))
    let creadas = 0
    for (const f of fijos) {
      for (const mes of C.mesesQueTocan(f, C.mesDe(hoy))) {
        if (hay.has(`${f.id}|${mes}`)) continue
        const fila = C.filaDelFijo(f, tramos.get(f.id) || [], mes)
        if (!fila) continue
        const { rowCount } = await qq(
          `INSERT INTO gastos (fijo_id, ${COLS_FILA}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (fijo_id, mes) DO NOTHING`,
          [f.id, ...valoresFila(fila)]
        )
        creadas += rowCount || 0
      }
    }
    return creadas
  })
}

// ---------- Lectura de un rango ----------

const alInstante = (f) => madridAInstante(f, '00:00')

async function leerRango(q, desde, hasta) {
  const [a, b] = [alInstante(desde), alInstante(hasta)]
  const rango = { desde, hasta }
  const { rows: rs } = await q(
    `SELECT r.id, r.codigo, r.origen, r.nombre, r.apellidos, r.inicio, r.precio_cent, r.pago_estado, r.metodo_pago, r.pagado_en,
            r.reembolso_cent, r.cancelada_en, r.factura, f.id AS factura_id, f.codigo AS factura_codigo, f.tipo AS factura_tipo
       FROM reservas r LEFT JOIN facturas f ON f.reserva_id = r.id AND f.sustituida_en IS NULL
      WHERE r.origen <> 'calendly' AND r.precio_cent > 0 AND r.pago_estado IN ('pagado', 'reembolsado', 'reembolsado_parcial')
        AND ((r.pagado_en >= $1 AND r.pagado_en < $2)
          OR (r.pago_estado <> 'pagado' AND r.reembolso_cent > 0 AND r.cancelada_en >= $1 AND r.cancelada_en < $2))`,
    [a, b]
  )
  const { rows: cs } = await q(
    `SELECT c.id, c.suscripcion_id, c.periodo, c.plan, c.importe_cent, c.estado, c.metodo_pago, c.desde::text AS desde_txt,
            c.hasta::text AS hasta_txt, c.pagada_en::text AS pagada_en_txt, c.devuelta_en::text AS devuelta_en_txt,
            s.codigo AS sus_codigo, s.nombre, s.apellidos, s.factura, f.id AS factura_id, f.codigo AS factura_codigo, f.tipo AS factura_tipo
       FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id LEFT JOIN facturas f ON f.cuota_id = c.id AND f.sustituida_en IS NULL
      WHERE c.importe_cent > 0 AND c.estado IN ('pagada', 'devuelta')
        AND ((c.pagada_en >= $1::date AND c.pagada_en < $2::date) OR (c.devuelta_en >= $1::date AND c.devuelta_en < $2::date))`,
    [desde, hasta]
  )
  const { rows: fs } = await q(
    `SELECT id, codigo, nombre, apellidos, fianza_cent, fianza_estado, fianza_devuelta_cent, fianza_resuelta_en::text AS resuelta_txt
       FROM suscripciones WHERE fianza_estado IN ('retenida', 'devuelta') AND fianza_resuelta_en >= $1::date AND fianza_resuelta_en < $2::date`,
    [desde, hasta]
  )
  const { rows: ks } = await q('SELECT mes::text AS mes_txt, cobrado_cent, devuelto_cent, enlace, nota, version FROM calendly_meses WHERE mes >= $1::date AND mes < $2::date', [desde, hasta])
  const { rows: is } = await q(`${SELECT_INGRESO} WHERE i.fecha >= $1::date AND i.fecha < $2::date`, [desde, hasta])
  const { rows: gs } = await q(`${SELECT_GASTO} WHERE g.fecha >= $1::date AND g.fecha < $2::date ORDER BY g.fecha DESC, g.id DESC`, [desde, hasta])
  const movimientos = [
    ...rs.flatMap((r) => C.partidasDeReserva({
      id: r.id, codigo: r.codigo, origen: r.origen, nombre: r.nombre, apellidos: r.apellidos, inicio: r.inicio, precioCent: r.precio_cent,
      pagoEstado: r.pago_estado, metodoPago: r.metodo_pago, pagadoEn: r.pagado_en, reembolsoCent: r.reembolso_cent, canceladaEn: r.cancelada_en,
      factura: r.factura, facturaId: r.factura_id, facturaCodigo: r.factura_codigo, facturaTipo: r.factura_tipo,
    }, rango)),
    ...cs.flatMap((c) => C.partidasDeCuota({
      id: c.id, suscripcionId: c.suscripcion_id, periodo: c.periodo, plan: c.plan, importeCent: c.importe_cent, estado: c.estado, metodoPago: c.metodo_pago,
      desde: c.desde_txt, hasta: c.hasta_txt, pagadaEn: c.pagada_en_txt, devueltaEn: c.devuelta_en_txt, susCodigo: c.sus_codigo,
      nombre: c.nombre, apellidos: c.apellidos, factura: c.factura, facturaId: c.factura_id, facturaCodigo: c.factura_codigo, facturaTipo: c.factura_tipo,
    }, rango)),
    ...fs.flatMap((s) => C.partidaDeFianza({
      id: s.id, codigo: s.codigo, nombre: s.nombre, apellidos: s.apellidos, fianzaCent: s.fianza_cent, fianzaEstado: s.fianza_estado,
      fianzaDevueltaCent: s.fianza_devuelta_cent, resueltaEn: s.resuelta_txt,
    }, rango)),
    ...ks.flatMap((k) => C.partidasDeCalendly({ mes: k.mes_txt, cobradoCent: k.cobrado_cent, devueltoCent: k.devuelto_cent }, rango)),
    ...is.flatMap((i) => C.partidaDeIngreso(aIngreso(i), rango)),
  ].sort((x, y) => (x.fecha === y.fecha ? x.clave.localeCompare(y.clave) : x.fecha < y.fecha ? -1 : 1))
  return { movimientos, gastos: gs.map(aGasto), calendly: ks, ingresos: is.map(aIngreso) }
}

async function sinCobrar(q) {
  const { rows: rs } = await q(
    `SELECT id, codigo, nombre, apellidos, inicio, precio_cent FROM reservas
      WHERE estado = 'confirmada' AND pago_estado = 'pendiente' AND precio_cent > 0 AND fin < now() AND origen <> 'calendly' ORDER BY inicio`
  )
  const { rows: cs } = await q(
    `SELECT c.id, c.suscripcion_id, c.periodo, c.importe_cent, c.desde::text AS desde_txt, s.codigo, s.nombre, s.apellidos
       FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE c.estado = 'pendiente' AND c.importe_cent > 0 AND c.desde <= $1::date ORDER BY c.desde`,
    [hoyMadrid()]
  )
  return {
    reservas: rs.map((r) => ({ id: r.id, fecha: fechaMadrid(new Date(r.inicio)), texto: `Reserva ${r.codigo} · ${r.nombre} ${r.apellidos || ''}`.trim(), totalCent: r.precio_cent, enlace: `/admin/reserva/${r.id}` })),
    cuotas: cs.map((c) => ({ id: c.id, fecha: c.desde_txt, texto: `Cuota ${c.codigo} · periodo ${c.periodo} · ${c.nombre}`, totalCent: c.importe_cent, enlace: `/admin/miembros/${c.suscripcion_id}` })),
  }
}

async function datosRevisar(q, aj, hoy) {
  const hace = sumarDias(hoy, -365)
  const desdeDia = C.primerDia(aj.desde)
  const ventana = desdeDia > hace ? desdeDia : hace
  const { rows: conflictos } = await q(`SELECT id, codigo FROM reservas WHERE estado = 'conflicto' AND pago_estado = 'pagado'`)
  const { rows: ev } = await q(
    `SELECT e.id, e.detalle->>'aviso' AS aviso, r.id AS reserva_id, r.codigo FROM eventos e JOIN reservas r ON r.id = e.reserva_id
      WHERE e.tipo = 'pagada' AND e.detalle->>'aviso' IN ('duplicado', 'tras_cancelar') AND e.creado_en >= $1`,
    [alInstante(ventana)]
  )
  const { rows: baja } = await q(
    `SELECT r.id, r.codigo, r.precio_cent FROM reservas r
      WHERE r.origen = 'plan' AND r.estado = 'cancelada' AND r.motivo_cancelacion = 'Baja de la suscripción' AND r.pago_estado = 'pagado'
        AND r.precio_cent > 0 AND r.cancelada_en >= $1
        AND NOT EXISTS (SELECT 1 FROM ingresos_manuales i WHERE i.reserva_id = r.id AND i.sentido = 'devolucion')`,
    [alInstante(ventana)]
  )
  const { rows: cats } = await q('SELECT * FROM gasto_categorias WHERE activa AND aviso_cada_meses IS NOT NULL')
  const { rows: mcg } = await q(`SELECT DISTINCT categoria_id, to_char(fecha, 'YYYY-MM') AS m FROM gastos WHERE estado = 'apuntado'`)
  const mesesConGasto = {}
  for (const r of mcg) (mesesConGasto[r.categoria_id] ||= []).push(r.m)
  const { rows: gr } = await q(`${SELECT_GASTO} WHERE g.fecha >= $1::date`, [sumarDias(hoy, -45)])
  const { rows: ir } = await q(`${SELECT_INGRESO} WHERE i.fecha >= $1::date`, [sumarDias(hoy, -45)])
  const { rows: vistos } = await q(`SELECT detalle->>'clave' AS clave FROM eventos WHERE tipo = 'aviso_finanzas_visto'`)
  return C.avisosParaRevisar({
    hoy, desde: aj.desde, calendlyHasta: aj.calendlyHasta, mesesSinCalendly: await mesesSinCalendly(q, aj, hoy), reservasAbiertas: reservasAbiertas(),
    conflictos, eventosPago: ev.map((e) => ({ id: e.id, aviso: e.aviso, reservaId: e.reserva_id, codigo: e.codigo })),
    bajaExtra: baja.map((b) => ({ reservaId: b.id, codigo: b.codigo, precioCent: b.precio_cent })),
    categorias: cats.map(aCategoria), mesesConGasto, gastosRecientes: gr.map(aGasto), ingresosRecientes: ir.map(aIngreso), vistos: vistos.map((v) => v.clave),
  })
}

// Todo lo que necesitan el Resumen de Finanzas y el Inicio para un periodo
export async function datosDelPeriodo(periodo, { hoy = hoyMadrid(), conRevisar = true } = {}) {
  await asegurarGastosFijos(null, { hoy })
  const aj = await ajustesFinanzas(query, { hoy })
  const recorte = C.recortar(periodo, aj.desde)
  const meses = C.ventanaGrafico(periodo, hoy)
  const trimestres = periodo.tipo === 'anio' ? periodo.trimestres : [C.trimestreDe(periodo.tipo === 'mes' ? periodo.desde : periodo.desde)]
  // Un solo rango que lo cubre todo: periodo, sus trimestres y los 12 meses del gráfico
  const ini = [periodo.desde, C.primerDia(meses[0]), C.rangoTrimestre(trimestres[0]).desde].sort()[0]
  const fin = [periodo.hasta, C.primerDia(C.sumarMesesMes(meses.at(-1), 1)), C.rangoTrimestre(trimestres.at(-1)).hasta].sort().at(-1)
  const desdeDatos = C.primerDia(aj.desde) > ini ? C.primerDia(aj.desde) : ini
  const datos = desdeDatos < fin ? await leerRango(query, desdeDatos, fin) : { movimientos: [], gastos: [], calendly: [], ingresos: [] }
  const faltan = await mesesSinCalendly(query, aj, hoy)
  const sc = await sinCobrar(query)
  const delPeriodo = (x) => x.fecha >= recorte.desdeEfectivo && x.fecha < periodo.hasta
  const movimientos = recorte.sinDatos ? [] : datos.movimientos.filter(delPeriodo)
  const gastos = recorte.sinDatos ? [] : datos.gastos.filter(delPeriodo)
  return {
    aj, recorte, meses, trimestres, hoy, faltan, sinCobrar: sc,
    todos: datos,
    movimientos,
    gastos,
    revisar: conRevisar ? await datosRevisar(query, aj, hoy) : [],
  }
}

// Cobros, devoluciones y gastos de [desde, hasta) recortados por «desde». Los fijos cuentan en
// su mes entero (desde el día 1), aunque su día de cargo caiga después de "hasta".
export async function movimientosYGastos(desde, hasta, { hoy = hoyMadrid() } = {}) {
  const aj = await ajustesFinanzas(query, { hoy })
  const d = C.primerDia(aj.desde) > desde ? C.primerDia(aj.desde) : desde
  if (d >= hasta) return { movimientos: [], gastos: [], sinDatos: true, incompleto: false }
  const finMes = C.primerDia(C.sumarMesesMes(C.mesDe(sumarDias(hasta, -1)), 1))
  const datos = await leerRango(query, C.primerDia(C.mesDe(d)), finMes)
  return {
    movimientos: datos.movimientos.filter((m) => m.fecha >= d && m.fecha < hasta),
    gastos: datos.gastos.filter((g) => (g.mes ? g.mes >= C.primerDia(C.mesDe(d)) && g.mes < hasta : g.fecha >= d && g.fecha < hasta)),
    sinDatos: false,
    incompleto: d > desde,
  }
}

export async function resumenFinanzas(periodo, { ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const d = await datosDelPeriodo(periodo, { hoy })
  const r = C.resumir({ movimientos: d.movimientos, gastos: d.gastos })
  const grafico = C.porMeses({ movimientos: d.todos.movimientos, gastos: d.todos.gastos, meses: d.meses, hoy, desde: d.aj.desde, mesesSinCalendly: d.faltan })
  const mesesTabla = periodo.tipo === 'mes' ? d.meses : periodo.meses
  const mesAMes = C.porMeses({ movimientos: d.todos.movimientos, gastos: d.todos.gastos, meses: mesesTabla, hoy, desde: d.aj.desde, mesesSinCalendly: d.faltan })
  const hacienda = d.trimestres.map((t) => C.ivaDelTrimestre({
    movimientos: d.todos.movimientos, gastos: d.todos.gastos, trimestre: t, sinCobrar: d.sinCobrar, mesesSinCalendly: d.faltan, desde: d.aj.desde, hoy,
  }))
  const { rows: fz } = await query(`SELECT count(*)::int AS n, coalesce(sum(fianza_cent), 0)::int AS cent FROM suscripciones WHERE fianza_estado = 'cobrada'`)
  const rectificativas = d.movimientos.filter((m) => m.sentido === 'devolucion' && m.rectificar).map((m) => ({ factura: m.factura, de: m.ref }))
  const faltaEnPeriodo = d.faltan.filter((m) => C.primerDia(m) >= periodo.desde && C.primerDia(m) < periodo.hasta)
  const mesHoy = C.mesDe(hoy)
  return {
    recorte: d.recorte,
    ajustes: d.aj,
    vacio: !d.movimientos.length && !d.gastos.length,
    cifras: {
      facturacion: r.facturacion, gastos: r.gastos, beneficioCent: r.beneficioCent, deCada100: r.deCada100, iva: r.iva, diferenciaConIvaCent: r.diferenciaConIvaCent,
    },
    porFuente: r.porFuente,
    devoluciones: r.devoluciones,
    porGrupo: r.porGrupo,
    grafico,
    mesAMes,
    hacienda,
    fianzasGuardadas: fz[0],
    sinCobrar: {
      cuotas: { n: d.sinCobrar.cuotas.length, totalCent: d.sinCobrar.cuotas.reduce((a, x) => a + x.totalCent, 0) },
      reservas: { n: d.sinCobrar.reservas.length, totalCent: d.sinCobrar.reservas.reduce((a, x) => a + x.totalCent, 0) },
    },
    faltaCalendly: faltaEnPeriodo,
    calendlyEnCurso: periodo.meses.includes(mesHoy) && cobraCalendly(d.aj, mesHoy),
    rectificativas,
    revisar: d.revisar,
  }
}

// ---------- Facturación (lista de cobros y devoluciones) ----------

export async function listarIngresos(periodo, { filtro = 'todo', ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  const aj = await ajustesFinanzas(query, { hoy })
  const recorte = C.recortar(periodo, aj.desde)
  const datos = recorte.sinDatos ? { movimientos: [], calendly: [] } : await leerRango(query, recorte.desdeEfectivo, periodo.hasta)
  const f = FILTROS_INGRESO[filtro] === undefined ? null : FILTROS_INGRESO[filtro]
  const movimientos = datos.movimientos
    .filter((m) => (f === null ? true : f === 'devolucion' ? m.sentido === 'devolucion' : f.includes(m.fuente)))
    .sort((a, b) => (a.fecha === b.fecha ? b.clave.localeCompare(a.clave) : a.fecha < b.fecha ? 1 : -1))
  const totales = C.resumir({ movimientos, gastos: [] }).facturacion
  const guardados = new Map((datos.calendly || []).map((k) => [C.mesDe(k.mes_txt), k]))
  const mesHoy = C.mesDe(hoy)
  const calendly = periodo.meses.filter((m) => m <= mesHoy && cobraCalendly(aj, m)).map((m) => {
    const k = guardados.get(m)
    return {
      mes: m, texto: C.textoMes(m, { soloNombre: true }),
      estado: k ? 'guardado' : m === mesHoy ? 'en_curso' : 'falta',
      fila: k ? { cobradoCent: k.cobrado_cent, devueltoCent: k.devuelto_cent } : null,
    }
  })
  if (calendly.length) {
    const { rows } = await query('SELECT calendly_mes::text AS m, total_cent FROM gastos WHERE calendly_mes = ANY($1::date[])', [calendly.map((c) => C.primerDia(c.mes))])
    const com = new Map(rows.map((r) => [C.mesDe(r.m), r.total_cent]))
    for (const c of calendly) if (c.fila) c.fila.comisionCent = com.get(c.mes) || 0
  }
  const sc = await sinCobrar(query)
  const [a, b] = [alInstante(recorte.desdeEfectivo), alInstante(periodo.hasta)]
  const { rows: inc } = await query(`SELECT count(*)::int AS n FROM reservas WHERE origen = 'plan' AND precio_cent = 0 AND estado = 'confirmada' AND inicio >= $1 AND inicio < $2`, [a, b])
  const { rows: fzc } = await query(`SELECT coalesce(sum(fianza_cent), 0)::int AS c FROM suscripciones WHERE fianza_cobrada_en >= $1::date AND fianza_cobrada_en < $2::date`, [recorte.desdeEfectivo, periodo.hasta])
  const { rows: fzd } = await query(`SELECT coalesce(sum(fianza_devuelta_cent), 0)::int AS c FROM suscripciones WHERE fianza_estado = 'devuelta' AND fianza_resuelta_en >= $1::date AND fianza_resuelta_en < $2::date`, [recorte.desdeEfectivo, periodo.hasta])
  const { rows: kag } = await query(`SELECT count(*)::int AS n, coalesce(sum(precio_cent) FILTER (WHERE externo_ref IS NULL), 0)::int AS cent FROM reservas WHERE origen = 'calendly' AND pagado_en >= $1 AND pagado_en < $2`, [a, b])
  const { rows: fw } = await query(
    `SELECT f.id, f.codigo, f.tipo, f.sustituida_por, f.fecha_emision::text AS fecha, f.cliente, f.total_cent, r.codigo AS reserva_codigo, s.codigo AS sus_codigo, c.periodo
       FROM facturas f LEFT JOIN reservas r ON r.id = f.reserva_id LEFT JOIN cuotas c ON c.id = f.cuota_id LEFT JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE f.fecha_emision >= $1::date AND f.fecha_emision < $2::date ORDER BY f.fecha_emision, f.id`,
    [recorte.desdeEfectivo, periodo.hasta]
  )
  const facturas = [
    ...fw.map((x) => ({
      id: x.id, codigo: x.codigo, fecha: x.fecha, totalCent: x.total_cent, pdf: `/api/admin/facturas/${x.id}`,
      cliente: x.tipo === 'simplificada' ? 'Simplificada (sin datos)' : x.cliente?.nombre || '',
      de: `${x.reserva_codigo ? `Reserva ${x.reserva_codigo}` : `Cuota ${x.sus_codigo} · periodo ${x.periodo}`}${x.sustituida_por ? ` · sustituida por ${x.sustituida_por}` : ''}`,
      sustituida: Boolean(x.sustituida_por),
    })),
    ...(datos.movimientos || []).filter((m) => m.fuente === 'factura_manual' && m.sentido === 'cobro').map((m) => ({ id: null, codigo: m.factura, fecha: m.fecha, cliente: m.cliente, totalCent: m.totalCent, de: 'A mano', pdf: null })),
  ].sort((x, y) => (x.fecha < y.fecha ? -1 : 1))
  return {
    recorte, ajustes: aj, totales, calendly, movimientos,
    sinCobrar: sc,
    noCuentan: { incluidas: inc[0].n, fianzas: { cobradasCent: fzc[0].c, devueltasCent: fzd[0].c }, calendlyAgenda: kag[0] },
    facturas,
  }
}

// ---------- Gastos ----------

export async function listarCategorias({ todas = false } = {}) {
  const { rows } = await query(`SELECT * FROM gasto_categorias${todas ? '' : ' WHERE activa'} ORDER BY orden, nombre`)
  return rows.map(aCategoria)
}

export async function listarGastos(periodo, { grupo = null, categoriaId = null, ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  await asegurarGastosFijos(null, { hoy })
  const aj = await ajustesFinanzas(query, { hoy })
  const recorte = C.recortar(periodo, aj.desde)
  const { rows } = recorte.sinDatos ? { rows: [] } : await query(`${SELECT_GASTO} WHERE g.fecha >= $1::date AND g.fecha < $2::date ORDER BY g.fecha DESC, g.id DESC`, [recorte.desdeEfectivo, periodo.hasta])
  let gastos = rows.map(aGasto)
  if (grupo && GRUPOS_IDS.includes(grupo)) gastos = gastos.filter((g) => g.grupo === grupo)
  if (categoriaId) gastos = gastos.filter((g) => g.categoriaId === Number(categoriaId))
  const r = C.resumir({ gastos })
  const filas = gastos.map((g) => ({
    ...g,
    costeCent: C.costeGasto(g),
    chips: [
      g.fijoId && 'Fijo',
      g.fijoId && g.fecha > hoy && `Se paga el día ${Number(g.fecha.slice(8, 10))}`,
      g.fijoId && g.editado && 'Cambiado este mes',
      g.estado === 'anulado' && 'Este mes no se paga',
      g.tipoFactura === 'ticket' && 'Ticket sin NIF',
      g.calendlyMes && 'Calendly',
    ].filter(Boolean),
  }))
  return {
    recorte,
    ajustes: aj,
    totales: { costeCent: r.gastos.costeCent, conIvaCent: r.gastos.conIvaCent },
    grupos: GRUPOS.map(([id, textoG]) => {
      const fg = filas.filter((x) => x.grupo === id)
      const rg = r.porGrupo.find((x) => x.grupo === id)
      return { grupo: id, texto: textoG, costeCent: rg?.costeCent || 0, conIvaCent: rg?.conIvaCent || 0, filas: fg }
    }).filter((g) => !grupo || g.grupo === grupo),
    categorias: await listarCategorias({ todas: true }),
  }
}

export async function datosFormularioGasto() {
  const categorias = await listarCategorias()
  const { rows } = await query(
    `SELECT DISTINCT ON (categoria_id) categoria_id, concepto, proveedor, tipo_factura, total_cent, base_cent, iva_pct, iva_cent, retencion_pct, metodo_pago, fecha::text AS fecha_txt
       FROM gastos WHERE fijo_id IS NULL AND calendly_mes IS NULL AND estado = 'apuntado' ORDER BY categoria_id, fecha DESC, id DESC`
  )
  const ultimos = Object.fromEntries(rows.map((r) => [r.categoria_id, {
    concepto: r.concepto, proveedor: r.proveedor, tipoFactura: r.tipo_factura, totalCent: r.total_cent, baseCent: r.base_cent,
    ivaPct: r.iva_pct ?? 'mano', ivaCent: r.iva_cent, retencionPct: r.retencion_pct, metodoPago: r.metodo_pago, fecha: r.fecha_txt,
  }]))
  const { rows: pv } = await query(`SELECT DISTINCT proveedor FROM gastos WHERE proveedor <> '' ORDER BY proveedor LIMIT 200`)
  return { categorias, ultimos, proveedores: pv.map((p) => p.proveedor) }
}

async function cargarGasto(q, id, { bloquear = false } = {}) {
  if (!/^\d+$/.test(String(id))) throw new ErrorReserva('no_existe', 'Gasto no encontrado.', 404)
  const { rows } = await q(`${SELECT_GASTO} WHERE g.id = $1${bloquear ? ' FOR UPDATE OF g' : ''}`, [Number(id)])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'Gasto no encontrado.', 404)
  return aGasto(rows[0])
}

export async function fichaGasto(id, { hoy = hoyMadrid() } = {}) {
  const g = await cargarGasto(query, id)
  let fijo = null
  if (g.fijoId) {
    const { rows } = await query(`${SELECT_FIJO} WHERE f.id = $1`, [g.fijoId])
    fijo = rows[0] ? aFijo(rows[0]) : null
  }
  return { gasto: g, fijo, esComisionCalendly: Boolean(g.calendlyMes), trimestrePasado: C.rangoTrimestre(C.trimestreDe(g.fecha)).hasta <= hoy }
}

async function categoriaActiva(q, id, { permitirOculta = false } = {}) {
  const { rows } = await q('SELECT * FROM gasto_categorias WHERE id = $1', [Number(id)])
  const c = rows[0] ? aCategoria(rows[0]) : null
  if (!c || (!c.activa && !permitirOculta)) throw new ErrorReserva('categoria', 'Elige qué es.', 400)
  return c
}

async function fechaValida(q, fecha, hoy, { permitirFutura = false } = {}) {
  if (!esFecha(fecha)) throw new ErrorReserva('fecha', 'Fecha no válida.', 400)
  if (!permitirFutura && fecha > hoy) throw new ErrorReserva('fecha', 'La fecha no puede ser futura.', 400)
  if (fecha < `${ANIO_MINIMO}-01-01`) throw new ErrorReserva('fecha', 'Fecha no válida.', 400)
  const { rows } = await q(`SELECT valor FROM ajustes WHERE clave = 'finanzas_desde'`)
  if (rows[0] && fecha < C.primerDia(rows[0].valor)) {
    throw new ErrorReserva('fecha', `Es de antes de ${C.textoMes(rows[0].valor)}, cuando empezasteis a llevar aquí las cuentas.`, 400)
  }
}

function leerIvaPct(v) {
  if (v === 'mano' || v === null || v === undefined || v === '') return 'mano'
  return Number(v)
}

// Valida y desglosa los datos de un gasto (alta o edición)
async function datosGasto(q, d, hoy, { gastoFijo = null, permitirOculta = false, actual = null } = {}) {
  const cat = await categoriaActiva(q, d.categoriaId, { permitirOculta: permitirOculta || Boolean(gastoFijo) })
  if (!TIPOS_FAC.includes(d.tipoFactura)) throw new ErrorReserva('tipoFactura', 'Elige cómo es la factura.', 400)
  const ret = Number(d.retencionPct ?? 0)
  if (!RETS.includes(ret)) throw new ErrorReserva('retencion', 'Elige una opción.', 400)
  const conIva = ['nif', 'ticket'].includes(d.tipoFactura)
  const ivaPct = conIva ? leerIvaPct(d.ivaPct) : null
  if (conIva && ivaPct !== 'mano' && ![21, 10, 4].includes(ivaPct)) throw new ErrorReserva('iva', 'Elige el IVA de la factura.', 400)
  const des = C.desgloseGasto({
    importeCent: typeof d.importe === 'number' ? d.importe : C.leerImporte(d.importe),
    importeEs: d.importeEs === 'base' ? 'base' : 'pagado', tipoFactura: d.tipoFactura, ivaPct,
    ivaCent: ivaPct === 'mano' ? (typeof d.iva === 'number' ? d.iva : C.leerImporte(d.iva)) : null, retencionPct: ret,
  })
  if (!des.ok) throw new ErrorReserva(des.campo, des.texto, 400)
  // Al editar sin tocar el importe ni la forma de la factura, se queda el desglose que ya tenía
  // (rehacerlo desde el total puede mover un céntimo la base y la retención)
  if (actual && des.totalCent === actual.totalCent && d.tipoFactura === actual.tipoFactura && ret === actual.retencionPct
    && (des.ivaPct ?? null) === (actual.ivaPct ?? null) && (ivaPct !== 'mano' || des.ivaCent === actual.ivaCent)) {
    des.baseCent = actual.baseCent
    des.ivaCent = actual.ivaCent
    des.retencionCent = actual.retencionCent
  }
  const metodo = d.metodoPago || null
  if (metodo && !MET_GASTO.includes(metodo)) throw new ErrorReserva('metodo', 'Elige cómo se pagó.', 400)
  if (gastoFijo) {
    if (!esFecha(d.fecha) || C.mesDe(d.fecha) !== C.mesDe(gastoFijo.mes)) {
      throw new ErrorReserva('fecha', `La fecha tiene que ser de ${C.textoMes(C.mesDe(gastoFijo.mes))}.`, 400)
    }
  } else {
    await fechaValida(q, d.fecha, hoy)
  }
  return {
    fecha: d.fecha, categoriaId: cat.id, concepto: texto(d.concepto, 120) || cat.nombre, proveedor: texto(d.proveedor, 80),
    numFactura: opcional(d.numFactura, 60), tipoFactura: d.tipoFactura, baseCent: des.baseCent, ivaCent: des.ivaCent, ivaPct: des.ivaPct,
    retencionPct: ret, retencionCent: des.retencionCent, totalCent: des.totalCent, metodoPago: metodo, enlace: enlaceSeguro(d.enlace),
    nota: opcional(d.nota, 500), categoria: cat,
  }
}

export async function crearGasto(d, { clave = null, hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const g = await datosGasto(q, d, hoy)
    const k = claveValida(clave)
    const { rows } = await q(
      `INSERT INTO gastos (fecha, categoria_id, concepto, proveedor, num_factura, tipo_factura, base_cent, iva_cent, iva_pct, retencion_pct,
          retencion_cent, total_cent, metodo_pago, enlace, nota, clave)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (clave) DO NOTHING RETURNING id`,
      [g.fecha, g.categoriaId, g.concepto, g.proveedor, g.numFactura, g.tipoFactura, g.baseCent, g.ivaCent, g.ivaPct, g.retencionPct,
        g.retencionCent, g.totalCent, g.metodoPago, g.enlace, g.nota, k]
    )
    if (rows[0]) return { id: rows[0].id, repetido: false, concepto: g.concepto, totalCent: g.totalCent }
    const { rows: ya } = await q('SELECT id FROM gastos WHERE clave = $1', [k])
    return { id: ya[0].id, repetido: true, concepto: g.concepto, totalCent: g.totalCent }
  })
}

export async function editarGasto(id, d, { version, hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const actual = await cargarGasto(q, id, { bloquear: true })
    if (actual.calendlyMes) throw new ErrorReserva('calendly', `Es la comisión de Stripe de ${C.textoMes(C.mesDe(actual.calendlyMes))}: se cambia en Ajustes → Calendly.`, 409)
    if (actual.estado === 'anulado') throw new ErrorReserva('estado', 'Este mes no se paga: vuelve a contarlo antes de cambiarlo.', 409)
    if (actual.fijoId && Number(d.categoriaId) !== actual.categoriaId) throw new ErrorReserva('categoria', 'Un gasto fijo no cambia de categoría: cámbialo en Gastos fijos.', 400)
    const g = await datosGasto(q, d, hoy, { gastoFijo: actual.fijoId ? actual : null, permitirOculta: Number(d.categoriaId) === actual.categoriaId, actual })
    const { rows } = await q(
      `UPDATE gastos SET fecha = $3, categoria_id = $4, concepto = $5, proveedor = $6, num_factura = $7, tipo_factura = $8, base_cent = $9,
          iva_cent = $10, iva_pct = $11, retencion_pct = $12, retencion_cent = $13, total_cent = $14, metodo_pago = $15, enlace = $16, nota = $17,
          editado = (fijo_id IS NOT NULL), version = version + 1, actualizado_en = now()
        WHERE id = $1 AND version = $2 RETURNING id`,
      [actual.id, Number(version), g.fecha, g.categoriaId, g.concepto, g.proveedor, g.numFactura, g.tipoFactura, g.baseCent, g.ivaCent, g.ivaPct,
        g.retencionPct, g.retencionCent, g.totalCent, g.metodoPago, g.enlace, g.nota]
    )
    if (!rows[0]) throw errorVersion(true)
    return { id: actual.id }
  })
}

export async function borrarGasto(id, { version } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const g = await cargarGasto(q, id, { bloquear: true })
    if (g.fijoId) throw new ErrorReserva('fijo', 'Es un gasto fijo: si este mes no se paga, usa «Este mes no se paga».', 409)
    if (g.calendlyMes) throw new ErrorReserva('calendly', 'Es la comisión de Stripe de un mes de Calendly: se cambia en Ajustes → Calendly.', 409)
    const { rowCount } = await q('DELETE FROM gastos WHERE id = $1 AND version = $2', [g.id, Number(version)])
    if (!rowCount) throw errorVersion(true)
    await q(`INSERT INTO eventos (reserva_id, tipo, detalle, autor) VALUES (NULL, 'gasto_borrado', $1, 'panel')`, [JSON.stringify({
      id: g.id, fecha: g.fecha, categoria: g.categoria, concepto: g.concepto, totalCent: g.totalCent, baseCent: g.baseCent, ivaCent: g.ivaCent,
    })])
  })
}

async function filaDeFijoBloqueada(q, id, version) {
  const g = await cargarGasto(q, id, { bloquear: true })
  if (!g.fijoId) throw new ErrorReserva('fijo', 'Solo los gastos fijos se marcan así.', 400)
  if (version !== undefined && version !== null && Number(version) !== g.version) throw errorVersion(true)
  return g
}

export async function anularMesFijo(id, { version, nota = null } = {}) {
  return transaction(async (tx) => {
    const g = await filaDeFijoBloqueada(tx.query, id, version)
    await tx.query(`UPDATE gastos SET estado = 'anulado', nota = coalesce($2, nota), version = version + 1, actualizado_en = now() WHERE id = $1`, [g.id, opcional(nota, 500)])
  })
}

export async function recuperarMesFijo(id, { version } = {}) {
  return transaction(async (tx) => {
    const g = await filaDeFijoBloqueada(tx.query, id, version)
    await tx.query(`UPDATE gastos SET estado = 'apuntado', version = version + 1, actualizado_en = now() WHERE id = $1`, [g.id])
  })
}

export async function volverAlFijo(id, { version } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const g = await filaDeFijoBloqueada(q, id, version)
    const { rows } = await q(`${SELECT_FIJO} WHERE f.id = $1`, [g.fijoId])
    const fijo = aFijo(rows[0])
    const fila = C.filaDelFijo(fijo, (await tramosDe(q, [fijo.id])).get(fijo.id) || [], g.mes)
    if (!fila) throw new ErrorReserva('fijo', 'No se ha podido calcular el importe de ese mes.', 409)
    await q(
      `UPDATE gastos SET fecha = $2, categoria_id = $4, concepto = $5, proveedor = $6, tipo_factura = $7, iva_pct = $8, retencion_pct = $9,
          metodo_pago = $10, base_cent = $11, iva_cent = $12, retencion_cent = $13, total_cent = $14, editado = false, version = version + 1, actualizado_en = now()
        WHERE id = $1 AND mes = $3`,
      [g.id, ...valoresFila(fila)]
    )
  })
}

// ---------- Plantillas de gastos fijos ----------

export async function listarGastosFijos({ hoy = hoyMadrid() } = {}) {
  await asegurarGastosFijos(null, { hoy })
  const { rows } = await query(`${SELECT_FIJO} ORDER BY f.hasta_mes IS NOT NULL, c.orden, f.concepto`)
  const fijos = rows.map(aFijo)
  const tramos = await tramosDe(query, fijos.map((f) => f.id))
  const { rows: cuentas } = await query(`SELECT fijo_id, count(*)::int AS n, count(*) FILTER (WHERE editado)::int AS e FROM gastos WHERE fijo_id IS NOT NULL GROUP BY fijo_id`)
  const porFijo = new Map(cuentas.map((c) => [c.fijo_id, c]))
  const mesHoy = C.primerDia(C.mesDe(hoy))
  const alMes = { conIvaCent: 0, costeCent: 0, totalCent: 0 }
  const lista = fijos.map((f) => {
    const t = tramos.get(f.id) || []
    const importeCent = C.importeDelMes(t, mesHoy < f.desdeMes ? f.desdeMes : mesHoy)
    const pesa = C.fijoAlMes(f, importeCent)
    const activo = !f.hastaMes || f.hastaMes >= mesHoy
    if (activo && f.desdeMes <= mesHoy) {
      alMes.conIvaCent += pesa.conIvaCent
      alMes.costeCent += pesa.costeCent
      alMes.totalCent += pesa.totalCent
    }
    return {
      ...f, activo, importeActualCent: importeCent, desglose: pesa.desglose || null,
      tramosFuturos: t.filter((x) => x.desdeMes > mesHoy && x.desdeMes !== f.desdeMes),
      mesesApuntados: porFijo.get(f.id)?.n || 0, mesesEditados: porFijo.get(f.id)?.e || 0,
    }
  })
  return { activos: lista.filter((f) => f.activo), terminados: lista.filter((f) => !f.activo), alMes }
}

// Próximos cargos de los fijos (30 días): para el Inicio
export async function proximosFijos({ hoy = hoyMadrid(), dias = 30 } = {}) {
  const { activos } = await listarGastosFijos({ hoy })
  const fin = sumarDias(hoy, dias)
  const tramos = await tramosDe(query, activos.map((f) => f.id))
  const { rows } = await query(
    `SELECT fijo_id, mes::text AS m, fecha::text AS f, total_cent, estado FROM gastos WHERE fijo_id = ANY($1::int[]) AND mes >= $2::date`,
    [activos.map((f) => f.id), C.primerDia(C.mesDe(hoy))]
  )
  const apuntadas = new Map(rows.map((x) => [`${x.fijo_id}|${x.m}`, x]))
  const r = []
  for (const f of activos) {
    for (const mes of C.mesesQueTocan(f, C.mesDe(fin))) {
      const ya = apuntadas.get(`${f.id}|${mes}`)
      if (ya) {
        // El mes ya está apuntado: lo que diga su fila (cambiada a mano o «este mes no se paga»)
        if (ya.estado === 'anulado' || ya.f <= hoy || ya.f > fin) continue
        r.push({ fecha: ya.f, concepto: f.concepto, totalCent: ya.total_cent, fijoId: f.id })
        continue
      }
      const fila = C.filaDelFijo(f, tramos.get(f.id) || [], mes)
      if (!fila || fila.fecha <= hoy || fila.fecha > fin) continue
      r.push({ fecha: fila.fecha, concepto: f.concepto, totalCent: fila.totalCent, fijoId: f.id })
    }
  }
  return r.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
}

async function cargarFijo(q, id, version) {
  if (!/^\d+$/.test(String(id))) throw new ErrorReserva('no_existe', 'Gasto fijo no encontrado.', 404)
  const { rows } = await q(`${SELECT_FIJO} WHERE f.id = $1 FOR UPDATE OF f`, [Number(id)])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'Gasto fijo no encontrado.', 404)
  const f = aFijo(rows[0])
  if (version !== undefined && version !== null && Number(version) !== f.version) throw errorVersion(true)
  return f
}

async function datosFijo(q, d, hoy, { categoriaOculta = false } = {}) {
  const concepto = texto(d.concepto, 120)
  if (!concepto) throw new ErrorReserva('concepto', 'Escribe qué es.', 400)
  const cat = await categoriaActiva(q, d.categoriaId, { permitirOculta: categoriaOculta })
  if (!TIPOS_FAC.includes(d.tipoFactura)) throw new ErrorReserva('tipoFactura', 'Elige cómo es la factura.', 400)
  const conIva = ['nif', 'ticket'].includes(d.tipoFactura)
  if (conIva && (d.ivaPct === 'mano' || ![21, 10, 4].includes(Number(d.ivaPct)))) {
    throw new ErrorReserva('iva', 'En un gasto fijo elige el IVA; si cambia cada mes, apúntalo como gasto variable.', 400)
  }
  const ret = Number(d.retencionPct ?? 0)
  if (!RETS.includes(ret)) throw new ErrorReserva('retencion', 'Elige una opción.', 400)
  const dia = Number(d.dia)
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new ErrorReserva('dia', 'El día del cargo va del 1 al 31.', 400)
  const metodo = d.metodoPago || null
  if (metodo && !MET_GASTO.includes(metodo)) throw new ErrorReserva('metodo', 'Elige cómo se pagó.', 400)
  return {
    concepto, categoriaId: cat.id, proveedor: texto(d.proveedor, 80), tipoFactura: d.tipoFactura, ivaPct: conIva ? Number(d.ivaPct) : null,
    retencionPct: ret, metodoPago: metodo, dia, nota: opcional(d.nota, 500),
  }
}

function importeDeFijo(d, f) {
  const imp = typeof d.importe === 'number' ? d.importe : C.leerImporte(d.importe)
  const des = C.desgloseGasto({ importeCent: imp, importeEs: f.importeEs, tipoFactura: f.tipoFactura, ivaPct: f.ivaPct, retencionPct: f.retencionPct })
  if (!des.ok) throw new ErrorReserva(des.campo, des.texto, 400)
  return imp
}

export async function crearGastoFijo(d, { hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const f = await datosFijo(q, d, hoy)
    const cada = Number(d.cadaMeses ?? 1)
    if (!CADAS.includes(cada)) throw new ErrorReserva('cadaMeses', 'Elige cada cuánto se paga.', 400)
    const importeEs = d.importeEs === 'base' ? 'base' : 'pagado'
    const mesHoy = C.mesDe(hoy)
    const desdeMes = d.desdeMes
    const aj = await ajustesFinanzas(q, { hoy })
    if (typeof desdeMes !== 'string' || !/^\d{4}-\d{2}$/.test(desdeMes) || desdeMes < C.sumarMesesMes(mesHoy, -24) || desdeMes > C.sumarMesesMes(mesHoy, 12)
      || (aj.desdeGuardado && desdeMes < aj.desde)) {
      throw new ErrorReserva('mes', 'Elige un mes de la lista.', 400)
    }
    const imp = importeDeFijo(d, { ...f, importeEs })
    const { rows } = await q(
      `INSERT INTO gastos_fijos (categoria_id, concepto, proveedor, importe_es, tipo_factura, iva_pct, retencion_pct, metodo_pago, cada_meses, dia, desde_mes, nota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [f.categoriaId, f.concepto, f.proveedor, importeEs, f.tipoFactura, f.ivaPct, f.retencionPct, f.metodoPago, cada, f.dia, C.primerDia(desdeMes), f.nota]
    )
    const id = rows[0].id
    await q('INSERT INTO gastos_fijos_importes (fijo_id, desde_mes, importe_cent) VALUES ($1, $2, $3)', [id, C.primerDia(desdeMes), imp])
    const mesesApuntados = await asegurarGastosFijos(q, { hoy, soloId: id })
    return { id, mesesApuntados, concepto: f.concepto }
  })
}

// Recalcula las filas de un fijo desde un mes (sin tocar las cambiadas a mano ni las anuladas)
async function recalcularFilas(q, fijo, { desdeMes, hastaMes = null }) {
  const tramos = (await tramosDe(q, [fijo.id])).get(fijo.id) || []
  const { rows } = await q(
    `SELECT id, mes::text AS m FROM gastos WHERE fijo_id = $1 AND mes >= $2 ${hastaMes ? 'AND mes < $3' : ''} AND NOT editado FOR UPDATE`,
    hastaMes ? [fijo.id, desdeMes, hastaMes] : [fijo.id, desdeMes]
  )
  let n = 0
  for (const r of rows) {
    const fila = C.filaDelFijo(fijo, tramos, r.m)
    if (!fila) continue
    await q(
      `UPDATE gastos SET fecha = $2, categoria_id = $4, concepto = $5, proveedor = $6, tipo_factura = $7, iva_pct = $8, retencion_pct = $9,
          metodo_pago = $10, base_cent = $11, iva_cent = $12, retencion_cent = $13, total_cent = $14, version = version + 1, actualizado_en = now()
        WHERE id = $1 AND mes = $3 AND NOT editado`,
      [r.id, ...valoresFila(fila)]
    )
    n++
  }
  return n
}

export async function editarGastoFijo(id, d, { version, hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const actual = await cargarFijo(q, id, version)
    if ((d.desdeMes && C.primerDia(d.desdeMes) !== actual.desdeMes) || (d.cadaMeses && Number(d.cadaMeses) !== actual.cadaMeses)
      || (d.importeEs && d.importeEs !== actual.importeEs)) {
      throw new ErrorReserva('meses', 'Para cambiar desde cuándo o cada cuánto se paga, termínalo y crea otro.', 409)
    }
    const f = await datosFijo(q, d, hoy, { categoriaOculta: Number(d.categoriaId) === actual.categoriaId })
    // El IVA y la retención tienen que cuadrar con los importes que ya tiene
    for (const t of (await tramosDe(q, [actual.id])).get(actual.id) || []) importeDeFijo({ importe: t.importeCent }, { ...f, importeEs: actual.importeEs })
    await q(
      `UPDATE gastos_fijos SET categoria_id = $2, concepto = $3, proveedor = $4, tipo_factura = $5, iva_pct = $6, retencion_pct = $7,
          metodo_pago = $8, dia = $9, nota = $10, version = version + 1, actualizado_en = now() WHERE id = $1`,
      [actual.id, f.categoriaId, f.concepto, f.proveedor, f.tipoFactura, f.ivaPct, f.retencionPct, f.metodoPago, f.dia, f.nota]
    )
    const nuevo = { ...actual, ...f }
    const cambiados = await recalcularFilas(q, nuevo, { desdeMes: C.primerDia(C.mesDe(hoy)) })
    return { cambiados }
  })
}

export async function cambiarImporteFijo(id, { importe, desdeMes, version }, { hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const f = await cargarFijo(q, id, version)
    const tope = [C.sumarMesesMes(C.mesDe(hoy), 12), f.hastaMes ? C.mesDe(f.hastaMes) : null].filter(Boolean).sort()[0]
    if (typeof desdeMes !== 'string' || !/^\d{4}-\d{2}$/.test(desdeMes) || C.primerDia(desdeMes) < f.desdeMes || desdeMes > tope) {
      throw new ErrorReserva('mes', `Elige un mes entre ${C.textoMes(C.mesDe(f.desdeMes), { corto: true })} y ${C.textoMes(tope, { corto: true })}.`, 400)
    }
    const imp = importeDeFijo({ importe }, f)
    await q(
      `INSERT INTO gastos_fijos_importes (fijo_id, desde_mes, importe_cent) VALUES ($1, $2, $3)
       ON CONFLICT (fijo_id, desde_mes) DO UPDATE SET importe_cent = EXCLUDED.importe_cent`,
      [f.id, C.primerDia(desdeMes), imp]
    )
    await q('UPDATE gastos_fijos SET version = version + 1, actualizado_en = now() WHERE id = $1', [f.id])
    const { rows: sig } = await q('SELECT min(desde_mes)::text AS d FROM gastos_fijos_importes WHERE fijo_id = $1 AND desde_mes > $2', [f.id, C.primerDia(desdeMes)])
    const hasta = sig[0]?.d || null
    const cambiados = await recalcularFilas(q, f, { desdeMes: C.primerDia(desdeMes), hastaMes: hasta })
    const { rows: ed } = await q(
      `SELECT mes::text AS m FROM gastos WHERE fijo_id = $1 AND mes >= $2 ${hasta ? 'AND mes < $3' : ''} AND editado ORDER BY mes`,
      hasta ? [f.id, C.primerDia(desdeMes), hasta] : [f.id, C.primerDia(desdeMes)]
    )
    return { cambiados, sinTocar: ed.map((r) => C.mesDe(r.m)) }
  })
}

export async function quitarCambioImporte(id, { desdeMes, version }, { hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const f = await cargarFijo(q, id, version)
    const d = typeof desdeMes === 'string' ? C.primerDia(C.mesDe(desdeMes)) : null
    if (!d || d <= C.primerDia(C.mesDe(hoy)) || d === f.desdeMes) throw new ErrorReserva('mes', 'Solo se quitan cambios que aún no han empezado.', 409)
    const { rowCount } = await q('DELETE FROM gastos_fijos_importes WHERE fijo_id = $1 AND desde_mes = $2', [f.id, d])
    if (!rowCount) throw new ErrorReserva('mes', 'Solo se quitan cambios que aún no han empezado.', 409)
    await q('UPDATE gastos_fijos SET version = version + 1, actualizado_en = now() WHERE id = $1', [f.id])
  })
}

export async function terminarGastoFijo(id, { ultimoMes, version }) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const f = await cargarFijo(q, id, version)
    if (typeof ultimoMes !== 'string' || !/^\d{4}-\d{2}$/.test(ultimoMes) || C.primerDia(ultimoMes) < f.desdeMes) {
      throw new ErrorReserva('mes', `El último mes no puede ser antes de empezar (${C.textoMes(C.mesDe(f.desdeMes), { corto: true })}).`, 400)
    }
    await q('UPDATE gastos_fijos SET hasta_mes = $2, version = version + 1, actualizado_en = now() WHERE id = $1', [f.id, C.primerDia(ultimoMes)])
    const { rowCount } = await q('DELETE FROM gastos WHERE fijo_id = $1 AND mes > $2 AND NOT editado', [f.id, C.primerDia(ultimoMes)])
    const { rows } = await q('SELECT mes::text AS m FROM gastos WHERE fijo_id = $1 AND mes > $2 ORDER BY mes', [f.id, C.primerDia(ultimoMes)])
    return { quitados: rowCount || 0, seQuedan: rows.map((r) => C.mesDe(r.m)) }
  })
}

export async function quitarFinalGastoFijo(id, { version }, { hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const f = await cargarFijo(q, id, version)
    await q('UPDATE gastos_fijos SET hasta_mes = NULL, version = version + 1, actualizado_en = now() WHERE id = $1', [f.id])
    return { apuntados: await asegurarGastosFijos(q, { hoy, soloId: f.id }) }
  })
}

export async function borrarGastoFijo(id, { version }) {
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_FINANZAS])
    const f = await cargarFijo(q, id, version)
    const { rows } = await q('SELECT count(*)::int AS n, count(*) FILTER (WHERE editado)::int AS e FROM gastos WHERE fijo_id = $1', [f.id])
    if (rows[0].e) throw new ErrorReserva('meses', 'Tiene meses cambiados a mano: ponle un último mes en vez de borrarlo.', 409)
    await q('DELETE FROM gastos_fijos WHERE id = $1', [f.id])
    await q(`INSERT INTO eventos (reserva_id, tipo, detalle, autor) VALUES (NULL, 'gasto_fijo_borrado', $1, 'panel')`, [JSON.stringify({ id: f.id, concepto: f.concepto, meses: rows[0].n })])
    return { borrados: rows[0].n }
  })
}

// ---------- Calendly de cada mes ----------

export async function calendlyDelMes(mes, { hoy = hoyMadrid() } = {}) {
  const aj = await ajustesFinanzas(query, { hoy })
  const d = C.primerDia(mes)
  const h = C.primerDia(C.sumarMesesMes(mes, 1))
  const [a, b] = [alInstante(d), alInstante(h)]
  const { rows } = await query('SELECT mes::text AS mes_txt, cobrado_cent, devuelto_cent, enlace, nota, version FROM calendly_meses WHERE mes = $1', [d])
  const { rows: com } = await query('SELECT total_cent FROM gastos WHERE calendly_mes = $1', [d])
  const uno = async (sql, p) => (await query(sql, p)).rows[0]
  const cuotas = await uno(`SELECT count(*)::int AS n, coalesce(sum(importe_cent), 0)::int AS cent FROM cuotas WHERE metodo_pago = 'stripe' AND estado IN ('pagada', 'devuelta') AND pagada_en >= $1::date AND pagada_en < $2::date`, [d, h])
  const cuotasDevueltas = await uno(`SELECT count(*)::int AS n, coalesce(sum(importe_cent), 0)::int AS cent FROM cuotas WHERE metodo_pago = 'stripe' AND estado = 'devuelta' AND devuelta_en >= $1::date AND devuelta_en < $2::date`, [d, h])
  const horasAparte = await uno(`SELECT count(*)::int AS n, coalesce(sum(precio_cent), 0)::int AS cent FROM reservas WHERE origen = 'plan' AND precio_cent > 0 AND metodo_pago = 'stripe' AND pagado_en >= $1 AND pagado_en < $2`, [a, b])
  const fianzas = await uno(`SELECT count(*)::int AS n, coalesce(sum(fianza_cent), 0)::int AS cent FROM suscripciones WHERE fianza_metodo = 'stripe' AND fianza_cobrada_en >= $1::date AND fianza_cobrada_en < $2::date`, [d, h])
  const agenda = await uno(`SELECT count(*)::int AS n FROM reservas WHERE origen = 'calendly' AND pagado_en >= $1 AND pagado_en < $2`, [a, b])
  const meses = []
  for (let m = aj.desde < `${ANIO_MINIMO}-01` ? `${ANIO_MINIMO}-01` : aj.desde; m <= C.mesDe(hoy); m = C.sumarMesesMes(m, 1)) meses.push(m)
  const f = rows[0]
  return {
    mes,
    fila: f ? { cobradoCent: f.cobrado_cent, devueltoCent: f.devuelto_cent, enlace: f.enlace || '', nota: f.nota || '', version: f.version } : null,
    comisionCent: com[0]?.total_cent || 0,
    pistas: { cuotas, horasAparte, fianzas, totalPanelCent: cuotas.cent + horasAparte.cent + fianzas.cent, cuotasDevueltas, reservasAgenda: agenda.n },
    meses: meses.reverse(),
  }
}

export async function guardarCalendlyMes({ mes, cobradoCent, devueltoCent, comisionCent, enlace, nota, version }, { hoy = hoyMadrid() } = {}) {
  const aj = await ajustesFinanzas(query, { hoy })
  const minimo = aj.desde > `${ANIO_MINIMO}-01` ? aj.desde : `${ANIO_MINIMO}-01`
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes) || mes < minimo || mes > C.mesDe(hoy)) throw new ErrorReserva('mes', 'Elige un mes de la lista.', 400)
  const imp = [cobradoCent, devueltoCent, comisionCent].map((v) => (v === null || v === undefined ? 0 : Number(v)))
  if (imp.some((v) => !Number.isInteger(v) || v < 0 || v > MAX_CENT)) throw new ErrorReserva('importe', 'Revisa los importes.', 400)
  const link = enlaceSeguro(enlace)
  const d = C.primerDia(mes)
  return transaction(async (tx) => {
    const q = tx.query
    const { rows: ya } = await q('SELECT version FROM calendly_meses WHERE mes = $1 FOR UPDATE', [d])
    if (ya[0] && Number(version) !== ya[0].version) throw errorVersion(true)
    await q(
      `INSERT INTO calendly_meses (mes, cobrado_cent, devuelto_cent, enlace, nota) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (mes) DO UPDATE SET cobrado_cent = EXCLUDED.cobrado_cent, devuelto_cent = EXCLUDED.devuelto_cent, enlace = EXCLUDED.enlace,
         nota = EXCLUDED.nota, version = calendly_meses.version + 1, actualizado_en = now()`,
      [d, imp[0], imp[1], link, opcional(nota, 500)]
    )
    if (imp[2] > 0) {
      const { rows: cat } = await q(`SELECT id FROM gasto_categorias WHERE clave = 'comisiones'`)
      await q(
        `INSERT INTO gastos (fecha, categoria_id, concepto, proveedor, tipo_factura, base_cent, iva_cent, iva_pct, retencion_pct, retencion_cent, total_cent, calendly_mes)
         VALUES ($1, $2, $3, 'Stripe', $4, $5, 0, NULL, 0, 0, $5, $1)
         ON CONFLICT (calendly_mes) DO UPDATE SET base_cent = EXCLUDED.base_cent, total_cent = EXCLUDED.total_cent, version = gastos.version + 1, actualizado_en = now()`,
        [d, cat[0].id, `Comisiones de Stripe · ${C.textoMes(mes)}`, COMISION_STRIPE_TIPO_FACTURA, imp[2]]
      )
    } else {
      await q('DELETE FROM gastos WHERE calendly_mes = $1', [d])
    }
  })
}

export async function borrarCalendlyMes(mes) {
  const d = typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes) ? C.primerDia(mes) : null
  if (!d) throw new ErrorReserva('mes', 'Elige un mes de la lista.', 400)
  const { rowCount } = await query('DELETE FROM calendly_meses WHERE mes = $1', [d])
  if (!rowCount) throw new ErrorReserva('no_existe', 'Ese mes no estaba apuntado.', 404)
}

// ---------- Otros ingresos ----------

async function datosIngreso(q, d, hoy, { excluirId = 0 } = {}) {
  if (!TIPOS_ING.includes(d.tipo)) throw new ErrorReserva('tipo', 'Elige qué es.', 400)
  if (!['cobro', 'devolucion'].includes(d.sentido)) throw new ErrorReserva('sentido', 'Elige si es un cobro o una devolución.', 400)
  await fechaValida(q, d.fecha, hoy)
  const concepto = texto(d.concepto, 160)
  if (!concepto) throw new ErrorReserva('concepto', 'Escribe qué es.', 400)
  const total = typeof d.importe === 'number' ? d.importe : C.leerImporte(d.importe)
  if (!Number.isInteger(total) || total < 1 || total > MAX_CENT) throw new ErrorReserva('importe', 'Pon el importe (por ejemplo 72,60).', 400)
  const pct = d.ivaPct === 'mano' ? 'mano' : Number(d.ivaPct ?? 21)
  let ivaCent
  if (pct === 'mano') {
    ivaCent = typeof d.iva === 'number' ? d.iva : C.leerImporte(d.iva)
    if (!Number.isInteger(ivaCent) || ivaCent < 0 || ivaCent >= total) throw new ErrorReserva('iva', 'El IVA tiene que ser menor que el importe.', 400)
  } else {
    if (![21, 10, 4, 0].includes(pct)) throw new ErrorReserva('iva', 'Elige el IVA.', 400)
    ivaCent = desglose(total, pct).ivaCent
  }
  let reservaId = null
  if (d.reservaId) {
    const { rows } = await q('SELECT id, origen FROM reservas WHERE id = $1', [Number(d.reservaId)])
    if (!rows[0]) throw new ErrorReserva('reserva', 'Esa reserva no existe.', 404)
    if (rows[0].origen === 'calendly' && d.sentido === 'devolucion') throw new ErrorReserva('reserva', 'La devolución de una reserva de Calendly va en el resumen de Calendly del mes.', 409)
    reservaId = rows[0].id
  }
  const facturaRef = opcional(d.facturaRef, 40)
  if (d.tipo === 'factura_manual' && d.sentido === 'cobro') {
    if (!facturaRef) throw new ErrorReserva('factura', 'Pon el número de la factura (p. ej. AR-M-2026-002).', 400)
    const { rows: w } = await q('SELECT 1 FROM facturas WHERE upper(btrim(codigo)) = upper(btrim($1))', [facturaRef])
    if (w[0]) throw new ErrorReserva('factura', 'Esa factura la ha hecho el panel: ya cuenta en Movimientos.', 409)
    const { rows: m } = await q(
      `SELECT fecha::text AS f FROM ingresos_manuales WHERE tipo = 'factura_manual' AND sentido = 'cobro' AND upper(btrim(factura_ref)) = upper(btrim($1)) AND id <> $2`,
      [facturaRef, excluirId]
    )
    if (m[0]) throw new ErrorReserva('factura', `La factura ${facturaRef} ya está apuntada (el ${m[0].f.slice(8, 10)}/${m[0].f.slice(5, 7)}).`, 409)
  }
  const metodo = d.metodoPago || null
  if (metodo && !MET_INGRESO.includes(metodo)) throw new ErrorReserva('metodo', 'Elige cómo se cobró.', 400)
  return {
    tipo: d.tipo, sentido: d.sentido, fecha: d.fecha, concepto, totalCent: total, ivaPct: pct === 'mano' ? null : pct, ivaCent, reservaId, facturaRef,
    clienteNombre: d.tipo === 'factura_manual' ? opcional(d.clienteNombre, 120) : null,
    clienteNif: d.tipo === 'factura_manual' ? (opcional(d.clienteNif, 20) || '').toUpperCase() || null : null,
    metodoPago: metodo, enlace: enlaceSeguro(d.enlace), nota: opcional(d.nota, 500),
  }
}

const COLS_ING = 'tipo, sentido, fecha, concepto, total_cent, iva_pct, iva_cent, reserva_id, factura_ref, cliente_nombre, cliente_nif, metodo_pago, enlace, nota'
const valoresIng = (i) => [i.tipo, i.sentido, i.fecha, i.concepto, i.totalCent, i.ivaPct, i.ivaCent, i.reservaId, i.facturaRef, i.clienteNombre, i.clienteNif, i.metodoPago, i.enlace, i.nota]
const errorFacturaRepetida = (e, ref) => (e.code === '23505' && /factura/.test(e.constraint || e.message || '') ? new ErrorReserva('factura', `La factura ${ref} ya está apuntada.`, 409) : e)

export async function crearIngresoManual(d, { clave = null, hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const i = await datosIngreso(q, d, hoy)
    const k = claveValida(clave)
    let rows
    try {
      ;({ rows } = await q(`INSERT INTO ingresos_manuales (${COLS_ING}, clave) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (clave) DO NOTHING RETURNING id`, [...valoresIng(i), k]))
    } catch (e) {
      throw errorFacturaRepetida(e, i.facturaRef)
    }
    if (rows[0]) return { id: rows[0].id, repetido: false, concepto: i.concepto, totalCent: i.totalCent }
    const { rows: ya } = await q('SELECT id FROM ingresos_manuales WHERE clave = $1', [k])
    return { id: ya[0].id, repetido: true, concepto: i.concepto, totalCent: i.totalCent }
  })
}

export async function fichaIngreso(id) {
  if (!/^\d+$/.test(String(id))) return null
  const { rows } = await query(`${SELECT_INGRESO} WHERE i.id = $1`, [Number(id)])
  return rows[0] ? aIngreso(rows[0]) : null
}

export async function editarIngresoManual(id, d, { version, hoy = hoyMadrid() } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const { rows: ya } = await q('SELECT id FROM ingresos_manuales WHERE id = $1 FOR UPDATE', [Number(id)])
    if (!ya[0]) throw new ErrorReserva('no_existe', 'Ingreso no encontrado.', 404)
    const i = await datosIngreso(q, d, hoy, { excluirId: Number(id) })
    let rows
    try {
      ;({ rows } = await q(
        `UPDATE ingresos_manuales SET (${COLS_ING}) = ($3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16), version = version + 1, actualizado_en = now()
          WHERE id = $1 AND version = $2 RETURNING id`,
        [Number(id), Number(version), ...valoresIng(i)]
      ))
    } catch (e) {
      throw errorFacturaRepetida(e, i.facturaRef)
    }
    if (!rows[0]) throw errorVersion(true)
  })
}

export async function borrarIngresoManual(id, { version } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const { rows } = await q(`${SELECT_INGRESO} WHERE i.id = $1 FOR UPDATE OF i`, [Number(id)])
    if (!rows[0]) throw new ErrorReserva('no_existe', 'Ingreso no encontrado.', 404)
    const i = aIngreso(rows[0])
    const { rowCount } = await q('DELETE FROM ingresos_manuales WHERE id = $1 AND version = $2', [i.id, Number(version)])
    if (!rowCount) throw errorVersion(true)
    await q(`INSERT INTO eventos (reserva_id, tipo, detalle, autor) VALUES (NULL, 'ingreso_borrado', $1, 'panel')`, [JSON.stringify(i)])
  })
}

export async function ingresosDeReserva(reservaId) {
  const { rows } = await query(`${SELECT_INGRESO} WHERE i.reserva_id = $1 ORDER BY i.fecha, i.id`, [Number(reservaId)])
  return rows.map(aIngreso)
}

// Las reservas de los últimos 30 días; «incluir»: una más (la de un aviso), aunque sea más antigua
export async function reservasParaIngreso({ hoy = hoyMadrid(), incluir = null } = {}) {
  const otra = /^\d+$/.test(String(incluir ?? '')) ? Number(incluir) : null
  const { rows } = await query(
    `SELECT id, codigo, nombre, apellidos, inicio FROM reservas
      WHERE (estado IN ('confirmada', 'cancelada') AND inicio >= $1 AND inicio < $2) OR id = $3
      ORDER BY inicio DESC LIMIT 201`,
    [alInstante(sumarDias(hoy, -30)), alInstante(sumarDias(hoy, 2)), otra]
  )
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return rows.map((r) => {
    const f = fechaMadrid(new Date(r.inicio))
    const dia = dias[new Date(`${f}T12:00:00Z`).getUTCDay()]
    return { id: r.id, texto: `${dia} ${Number(f.slice(8, 10))} ${C.textoMes(C.mesDe(f), { corto: true }).split(' ')[0]} · ${r.nombre}${r.apellidos ? ` ${r.apellidos.charAt(0)}.` : ''} · ${r.codigo}` }
  })
}

// ---------- Categorías y avisos ----------

function datosCategoria(d) {
  const nombre = texto(d.nombre, 60)
  if (!nombre) throw new ErrorReserva('nombre', 'Escribe el nombre.', 400)
  if (!GRUPOS_IDS.includes(d.grupo)) throw new ErrorReserva('grupo', 'Elige el grupo.', 400)
  const tipo = TIPOS_FAC.includes(d.tipoFactura) ? d.tipoFactura : 'nif'
  const conIva = ['nif', 'ticket'].includes(tipo)
  const iva = conIva ? ([21, 10, 4].includes(Number(d.ivaPct)) ? Number(d.ivaPct) : 21) : null
  const ret = RETS.includes(Number(d.retencionPct)) ? Number(d.retencionPct) : 0
  const aviso = [1, 2, 3].includes(Number(d.avisoCadaMeses)) ? Number(d.avisoCadaMeses) : null
  return { nombre, grupo: d.grupo, tipo, iva, ret, aviso }
}

export async function crearCategoria(d) {
  const c = datosCategoria(d)
  try {
    const { rows } = await query(
      `INSERT INTO gasto_categorias (nombre, grupo, tipo_factura, iva_pct, retencion_pct, aviso_cada_meses, orden)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT coalesce(max(orden), 0) + 10 FROM gasto_categorias)) RETURNING id`,
      [c.nombre, c.grupo, c.tipo, c.iva, c.ret, c.aviso]
    )
    return { id: rows[0].id }
  } catch (e) {
    if (e.code === '23505') throw new ErrorReserva('nombre', 'Ya hay una categoría con ese nombre.', 409)
    throw e
  }
}

export async function editarCategoria(id, d) {
  const c = datosCategoria(d)
  try {
    const { rowCount } = await query(
      `UPDATE gasto_categorias SET nombre = $2, grupo = $3, tipo_factura = $4, iva_pct = $5, retencion_pct = $6, aviso_cada_meses = $7,
          activa = coalesce($8, activa) WHERE id = $1`,
      [Number(id), c.nombre, c.grupo, c.tipo, c.iva, c.ret, c.aviso, typeof d.activa === 'boolean' ? d.activa : null]
    )
    if (!rowCount) throw new ErrorReserva('no_existe', 'Categoría no encontrada.', 404)
  } catch (e) {
    if (e.code === '23505') throw new ErrorReserva('nombre', 'Ya hay una categoría con ese nombre.', 409)
    throw e
  }
}

export async function mostrarCategoria(id, activa) {
  const { rowCount } = await query('UPDATE gasto_categorias SET activa = $2 WHERE id = $1', [Number(id), Boolean(activa)])
  if (!rowCount) throw new ErrorReserva('no_existe', 'Categoría no encontrada.', 404)
}

export async function marcarAvisoVisto(clave) {
  if (typeof clave !== 'string' || !/^(duplicado|tras_cancelar|baja_extra|factura_falta|repetido):[A-Za-z0-9:_-]{1,80}$/.test(clave)) {
    throw new ErrorReserva('clave', 'Aviso no válido.', 400)
  }
  await query(`INSERT INTO eventos (reserva_id, tipo, detalle, autor) VALUES (NULL, 'aviso_finanzas_visto', $1, 'panel')`, [JSON.stringify({ clave })])
}

// ---------- Exportación para la gestoría ----------

export async function exportarCsv(periodo, { tipo, ahora = new Date() } = {}) {
  const hoy = hoyMadrid(ahora)
  if (!['ingresos', 'gastos', 'facturas'].includes(tipo)) throw new ErrorReserva('tipo', 'Elige qué descargar.', 400)
  await asegurarGastosFijos(null, { hoy })
  const aj = await ajustesFinanzas(query, { hoy })
  const recorte = C.recortar(periodo, aj.desde)
  const datos = recorte.sinDatos ? { movimientos: [], gastos: [] } : await leerRango(query, recorte.desdeEfectivo, periodo.hasta)
  const nombre = `finanzas-${tipo}-${periodo.clave}.csv`
  if (tipo === 'ingresos') {
    const s = (m) => (m.sentido === 'cobro' ? 1 : -1)
    const filas = [...datos.movimientos].sort((a, b) => (a.fecha === b.fecha ? a.clave.localeCompare(b.clave) : a.fecha < b.fecha ? -1 : 1))
    return {
      nombre,
      contenido: aCsv([
        ['Fecha', (m) => fechaCsv(m.fecha), 'crudo'],
        ['Tipo', (m) => (m.sentido === 'cobro' ? 'Cobro' : 'Devolución')],
        ['Origen', (m) => TEXTO_FUENTE[m.fuente] || m.fuente],
        ['Concepto', (m) => m.texto],
        ['Referencia', (m) => m.ref],
        ['Cliente', (m) => m.cliente],
        ['NIF', (m) => m.nif],
        ['Factura', (m) => (m.factura ? `${m.factura}${m.sentido === 'devolucion' && m.rectificar ? ' (rectificar)' : ''}` : '')],
        ['Fecha del servicio', (m) => (m.fechaServicio ? (m.servicioHasta ? `${fechaCsv(m.fechaServicio)}–${fechaCsv(m.servicioHasta)}` : fechaCsv(m.fechaServicio)) : ''), 'crudo'],
        ['Cobrado por', (m) => MET_TEXTO[m.metodo] || m.metodo || ''],
        ['Base', (m) => s(m) * m.baseCent, 'numero'],
        ['IVA %', (m) => (m.ivaPct === null || m.ivaPct === undefined ? '' : m.ivaPct), 'crudo'],
        ['IVA', (m) => s(m) * m.ivaCent, 'numero'],
        ['Total', (m) => s(m) * m.totalCent, 'numero'],
        ['Nota', () => ''],
      ], filas),
    }
  }
  if (tipo === 'gastos') {
    const filas = datos.gastos.filter((g) => g.estado === 'apuntado').sort((a, b) => (a.fecha === b.fecha ? a.id - b.id : a.fecha < b.fecha ? -1 : 1))
    const grupoTxt = Object.fromEntries(GRUPOS)
    return {
      nombre,
      contenido: aCsv([
        ['Fecha', (g) => fechaCsv(g.fecha), 'crudo'],
        ['Grupo', (g) => grupoTxt[g.grupo]],
        ['Categoría', (g) => g.categoria],
        ['Concepto', (g) => g.concepto],
        ['Proveedor', (g) => g.proveedor],
        ['Nº factura', (g) => g.numFactura],
        ['Tipo de factura', (g) => TIPOS_FACTURA_CSV[g.tipoFactura]],
        ['Base', (g) => g.baseCent, 'numero'],
        ['IVA %', (g) => (g.ivaPct ?? ''), 'crudo'],
        ['IVA', (g) => g.ivaCent, 'numero'],
        ['IVA deducible', (g) => (g.tipoFactura === 'nif' ? 'Sí' : 'No')],
        ['Retención %', (g) => (g.retencionPct || ''), 'crudo'],
        ['Retención', (g) => g.retencionCent, 'numero'],
        ['Modelo', (g) => (g.retencionPct === 19 ? '115' : g.retencionPct === 7 || g.retencionPct === 15 ? '111' : ''), 'crudo'],
        ['Pagado al proveedor', (g) => g.totalCent, 'numero'],
        ['Cuenta como gasto', (g) => C.costeGasto(g), 'numero'],
        ['Fijo', (g) => (g.fijoId ? 'Sí' : 'No')],
        ['Cómo se pagó', (g) => Object.fromEntries(METODOS_GASTO)[g.metodoPago] || ''],
        ['Enlace', (g) => g.enlace || ''],
        ['Nota', (g) => g.nota],
      ], filas),
    }
  }
  const { rows } = await query(
    `SELECT f.*, f.fecha_emision::text AS fe, f.fecha_servicio::text AS fs, r.codigo AS reserva_codigo, r.reembolso_cent, r.pago_estado,
            s.codigo AS sus_codigo, c.periodo, c.estado AS cuota_estado, c.importe_cent
       FROM facturas f LEFT JOIN reservas r ON r.id = f.reserva_id LEFT JOIN cuotas c ON c.id = f.cuota_id LEFT JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE f.fecha_emision >= $1::date AND f.fecha_emision < $2::date ORDER BY f.fecha_emision, f.id`,
    [recorte.desdeEfectivo, periodo.hasta]
  )
  const filas = [
    ...rows.map((f) => {
      // La simplificada sustituida no se rectifica: ya la anula la completa que la sustituye
      const devuelto = f.sustituida_en ? 0 : f.reserva_codigo ? (['reembolsado', 'reembolsado_parcial'].includes(f.pago_estado) ? f.reembolso_cent || 0 : 0) : f.cuota_estado === 'devuelta' ? f.importe_cent : 0
      return {
        tipo: f.tipo === 'simplificada' ? 'Simplificada' : 'Completa', sustituye: f.sustituye?.codigo || '', sustituidaPor: f.sustituida_por || '',
        fecha: f.fe, numero: f.codigo, serie: f.serie, operacion: f.fs, cliente: f.cliente?.nombre || '', nif: f.cliente?.nif || '',
        // Sustituida: sus importes cuentan en la completa que la sustituye. Aquí van a 0 para
        // que sumar las columnas no cuente dos veces la operación; el original va aparte.
        concepto: f.lineas?.[0]?.descripcion || '', base: f.sustituida_en ? 0 : f.base_cent, ivaPct: f.iva_pct,
        iva: f.sustituida_en ? 0 : f.iva_cent, total: f.sustituida_en ? 0 : f.total_cent, original: f.sustituida_en ? f.total_cent : null,
        de: f.reserva_codigo ? `Reserva ${f.reserva_codigo}` : `Cuota ${f.sus_codigo} periodo ${f.periodo}`, enviada: f.enviada_en ? 'Sí' : 'No',
        devuelto: devuelto || null, rectificativa: devuelto ? 'Sí' : 'No',
      }
    }),
    ...datos.movimientos.filter((m) => m.fuente === 'factura_manual' && m.sentido === 'cobro').map((m) => ({
      tipo: 'Completa', sustituye: '', sustituidaPor: '',
      fecha: m.fecha, numero: m.factura, serie: 'AR-M', operacion: '', cliente: m.cliente, nif: m.nif, concepto: m.concepto || m.texto,
      base: m.baseCent, ivaPct: m.ivaPct, iva: m.ivaCent, total: m.totalCent, original: null, de: 'A mano', enviada: '', devuelto: null, rectificativa: '',
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  return {
    nombre,
    contenido: aCsv([
      ['Número', (f) => f.numero],
      ['Serie', (f) => f.serie],
      ['Tipo', (f) => f.tipo],
      ['Fecha de emisión', (f) => fechaCsv(f.fecha), 'crudo'],
      ['Fecha de la operación', (f) => fechaCsv(f.operacion), 'crudo'],
      ['Cliente', (f) => f.cliente],
      ['NIF', (f) => f.nif],
      ['Concepto', (f) => f.concepto],
      ['Base', (f) => f.base, 'numero'],
      ['IVA %', (f) => (f.ivaPct ?? ''), 'crudo'],
      ['IVA', (f) => f.iva, 'numero'],
      ['Total', (f) => f.total, 'numero'],
      ['De', (f) => f.de],
      ['Enviada', (f) => f.enviada],
      ['Importe devuelto', (f) => f.devuelto, 'numero'],
      ['Necesita rectificativa', (f) => f.rectificativa],
      ['Sustituye a', (f) => f.sustituye],
      ['Sustituida por', (f) => (f.sustituidaPor ? `Sustituida por ${f.sustituidaPor}` : '')],
      ['Importe original', (f) => f.original, 'numero'],
    ], filas),
  }
}

export { FUENTES, contarCuotasSinPagar }
