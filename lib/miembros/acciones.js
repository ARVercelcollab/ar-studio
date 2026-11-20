// Lo que hace el miembro desde su área: ver huecos, comprobar, reservar (con las horas aparte
// pagadas por el TPV si ya no le quedan del plan), cambiar y cancelar sus sesiones, escribir
// al estudio y bajar sus facturas y su contrato.
//
// Todo con las reglas del plan en modo 'cliente' (sin «reservar igualmente») y siempre
// comprobando que la sesión es de SU suscripción.

import { query, dentroDelLimite } from '../db/index.js'
import { ErrorReserva, aReserva, festivos as leerFestivos, ocupacion, registrar } from '../reservas/servicio.js'
import {
  comprobarSesion, crearSesionPlan, crearSesionPlanConPago, moverSesionPlan, cancelarSesionPlan,
  conReglasDelPeriodo, _SELECT_CUOTA as SELECT_CUOTA, aCuota, _cuotasSinPagar as cuotasSinPagar,
  _cargarSuscripcion as cargarSuscripcion,
} from '../suscripciones/servicio.js'
import { periodoDe, iniciosPosibles, cuotaImpagada, ultimoDiaDe } from '../suscripciones/reglas.js'
import { pdfDelContrato } from '../suscripciones/alta.js'
import { proveedorActivo, comprobarProveedor } from '../pagos/index.js'
import { formularioPago } from '../reservas/flujo.js'
import { facturaPorId } from '../facturas/servicio.js'
import { pdfFactura } from '../facturas/pdf.js'
import { formatoEuros, textoDuracion } from '../reservas/config.js'
import { esFecha, esHora, sumarDias, diaSemana, madridAInstante, fechaMadrid, textoFechaCorta } from '../reservas/tiempo.js'
import { motivoNoReservar, rangoReservable, aSesion, pagoExtraDisponible } from './area.js'
import { correosSesionMiembro, avisoMensajeMiembro } from './correos.js'

const EPS = 1e-9
const h = (x) => textoDuracion(x, { corto: true })
const AUTOR = 'cliente'

// ---------- Ayudas ----------

function horasValidas(horas) {
  const n = Number(String(horas ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > 14 || Math.abs(n * 4 - Math.round(n * 4)) > EPS) {
    throw new ErrorReserva('horas', 'Elige cuántas horas.', 400)
  }
  return n
}

function fechaValida(fecha) {
  if (!esFecha(fecha)) throw new ErrorReserva('fecha', 'Elige un día.', 400)
  return fecha
}

function horaValida(hora) {
  if (!esHora(hora)) throw new ErrorReserva('hora', 'Elige una hora.', 400)
  return hora
}

// Su sesión por el código (404 si no es suya)
async function sesionSuya(sus, codigo) {
  const { rows } = await query('SELECT * FROM reservas WHERE codigo = $1 AND suscripcion_id = $2', [String(codigo || '').slice(0, 40), sus.id])
  const r = aReserva(rows[0])
  if (!r) throw new ErrorReserva('no_existe', 'No encontramos esa sesión.', 404)
  return r
}

// Cuota y reglas del periodo de una fecha (para el horario, la antelación…)
async function reglasDeFecha(sus, fecha) {
  const p = periodoDe(sus, fecha)
  if (!p) return { reglas: sus, periodo: null }
  const { rows } = await query(`${SELECT_CUOTA} WHERE suscripcion_id = $1 AND periodo = $2`, [sus.id, p.numero])
  return { reglas: conReglasDelPeriodo(sus, aCuota(rows[0])), periodo: p }
}

// Por qué no puede reservar ni cambiar ahora (contrato, cuota sin pagar…), con la ficha al día
async function bloqueoActual(sus, ahora) {
  const hoy = fechaMadrid(ahora)
  const actual = await cargarSuscripcion(query, sus.id)
  const impagada = (await cuotasSinPagar(query, actual, hoy)).find((c) => cuotaImpagada(c, actual, hoy)) || null
  return motivoNoReservar(actual, { hoy, impagada })
}

// ---------- Huecos ----------

// Días posibles de su plan con algún hueco libre: { 'AAAA-MM-DD': número de huecos }
export async function diasConHuecosMiembro(sus, { desde, hasta, horas, codigo = null }, { ahora = new Date() } = {}) {
  fechaValida(desde)
  fechaValida(hasta)
  const n = horasValidas(horas)
  const { reglas: reglasHoy } = await reglasDeFecha(sus, fechaMadrid(ahora) < sus.fechaInicio ? sus.fechaInicio : fechaMadrid(ahora))
  const rango = rangoReservable(sus, reglasHoy, ahora)
  let a = desde < rango.desde ? rango.desde : desde
  let b = hasta > rango.hasta ? rango.hasta : hasta
  if (sumarDias(a, 62) < b) b = sumarDias(a, 62)
  const dias = {}
  if (a > b) return { dias }
  const excluir = codigo ? (await sesionSuya(sus, codigo)).id : null
  const [fest, ocupado] = await Promise.all([
    leerFestivos(),
    ocupacion(query, madridAInstante(sumarDias(a, -1), '00:00'), madridAInstante(sumarDias(b, 2), '00:00'), { excluirId: excluir }),
  ])
  const porPeriodo = new Map()
  for (let f = a; f <= b; f = sumarDias(f, 1)) {
    if ([0, 6].includes(diaSemana(f)) || fest.has(f)) continue
    const p = periodoDe(sus, f)
    if (!p) continue
    if (!porPeriodo.has(p.numero)) porPeriodo.set(p.numero, (await reglasDeFecha(sus, f)).reglas)
    const huecos = iniciosPosibles({ fecha: f, horas: n, sus: porPeriodo.get(p.numero), ocupado, ahora })
    if (huecos.length) dias[f] = huecos.length
  }
  return { dias }
}

export async function huecosMiembro(sus, { fecha, horas, codigo = null }, { ahora = new Date() } = {}) {
  fechaValida(fecha)
  const n = horasValidas(horas)
  const { reglas } = await reglasDeFecha(sus, fecha)
  const rango = rangoReservable(sus, reglas, ahora)
  const fest = await leerFestivos()
  if (fecha < rango.desde || fecha > rango.hasta || [0, 6].includes(diaSemana(fecha)) || fest.has(fecha)) return { huecos: [] }
  const excluir = codigo ? (await sesionSuya(sus, codigo)).id : null
  const ocupado = await ocupacion(query, madridAInstante(sumarDias(fecha, -1), '00:00'), madridAInstante(sumarDias(fecha, 2), '00:00'), { excluirId: excluir })
  return { huecos: iniciosPosibles({ fecha, horas: n, sus: reglas, ocupado, ahora }) }
}

// ---------- Comprobar y reservar ----------

export async function comprobarMiembro(sus, { fecha, desde, horas, codigo = null }, { ahora = new Date() } = {}) {
  fechaValida(fecha)
  horaValida(desde)
  const n = horasValidas(horas)
  const errores = []
  let excluirId = null
  if (codigo) {
    const r = await sesionSuya(sus, codigo)
    const vista = aSesion(r, sus, ahora)
    if (!vista.puedeCambiar) errores.push({ codigo: 'cambiar', texto: vista.motivoNoCambiar })
    excluirId = r.id
  }
  const bloqueo = await bloqueoActual(sus, ahora)
  if (bloqueo && !errores.length) errores.push({ codigo: 'bloqueo', texto: bloqueo })
  const permitirExtra = !codigo && (await pagoExtraDisponible())
  const v = await comprobarSesion(sus.id, { fecha, desde, horas: n, excluirId }, { ahora, modo: 'cliente', permitirExtra })
  // Lo de la cuota sin pagar ya va en «bloqueo»
  const resto = v.errores.filter((e) => !(bloqueo && e.codigo === 'impago'))
  const todos = [...errores, ...resto]
  return {
    ok: todos.length === 0,
    errores: todos,
    notas: v.notas || [],
    horasPlan: v.horasPlan ?? 0,
    horasExtra: v.horasExtra ?? 0,
    precioExtraCent: v.precioExtraSugeridoCent || 0,
    precioExtraTexto: v.precioExtraSugeridoCent ? `${formatoEuros(v.precioExtraSugeridoCent)} (IVA incluido)` : null,
    restantesDespues: v.restantesDespues ?? 0,
    resumen: resumenTexto(v),
  }
}

function resumenTexto(v) {
  if (!v.periodo) return ''
  const partes = [h(v.horas)]
  if (v.horasPlan > EPS) partes.push(`${h(v.horasPlan)} de tu plan`)
  if (v.horasExtra > EPS) partes.push(`${h(v.horasExtra)} aparte`)
  partes.push(`te quedarán ${h(v.restantesDespues)} hasta el ${textoFechaCorta(ultimoDiaDe(v.periodo))}`)
  return partes.join(' · ')
}

// Reserva una sesión. Sin horas aparte, queda confirmada. Con horas aparte (no le quedan
// del plan) hace falta aceptoPagoExtra: queda retenida y se devuelve el formulario del TPV.
export async function reservarMiembro(sus, { fecha, desde, horas, aceptoPagoExtra = false }, base, { ahora = new Date() } = {}) {
  fechaValida(fecha)
  horaValida(desde)
  const n = horasValidas(horas)
  const bloqueo = await bloqueoActual(sus, ahora)
  if (bloqueo) throw new ErrorReserva('bloqueo', bloqueo, 409)
  const datos = { fecha, desde, horas: n }
  const permitirExtra = await pagoExtraDisponible()
  const previa = await comprobarSesion(sus.id, datos, { ahora, modo: 'cliente', permitirExtra })
  if (previa.errores.length) throw new ErrorReserva('reglas', previa.errores[0].texto, 409, { errores: previa.errores, notas: previa.notas })

  if (previa.horasExtra > EPS) {
    if (!aceptoPagoExtra) {
      throw new ErrorReserva('pago_extra', `${h(previa.horasExtra)} van aparte: ${formatoEuros(previa.precioExtraSugeridoCent)} (IVA incluido). Acepta el pago para reservar.`, 409, {
        horasExtra: previa.horasExtra, precioExtraCent: previa.precioExtraSugeridoCent,
      })
    }
    const proveedor = await comprobarProveedor(proveedorActivo())
    try {
      const r = await crearSesionPlanConPago(sus.id, datos, { proveedor: proveedor.id, ahora, autor: AUTOR })
      return {
        estado: 'pago',
        codigo: r.reserva.codigo,
        pago: formularioPago(proveedor, { reserva: r.reserva, pago: r.pago }, base),
        expiraEn: r.reserva.expiraEn,
      }
    } catch (e) {
      // Mientras tanto se ha liberado algo y ya no lleva horas aparte: se reserva sin pago
      if (!(e instanceof ErrorReserva && e.codigo === 'sin_extra')) throw e
    }
  }

  const { reserva } = await crearSesionPlan(sus.id, datos, { ahora, modo: 'cliente', autor: AUTOR })
  await correosSesionMiembro(reserva, 'reservada', base, { autor: AUTOR })
  return { estado: 'confirmada', codigo: reserva.codigo }
}

// ---------- Cambiar y cancelar ----------

export async function cambiarMiembro(sus, { codigo, fecha, desde, horas }, base, { ahora = new Date() } = {}) {
  fechaValida(fecha)
  horaValida(desde)
  const n = horasValidas(horas)
  const r = await sesionSuya(sus, codigo)
  const vista = aSesion(r, sus, ahora)
  if (!vista.puedeCambiar) throw new ErrorReserva('cambiar', vista.motivoNoCambiar, 409)
  const bloqueo = await bloqueoActual(sus, ahora)
  if (bloqueo) throw new ErrorReserva('bloqueo', bloqueo, 409)
  const nueva = await moverSesionPlan(r.id, { fecha, desde, horas: n }, { ahora, modo: 'cliente', autor: AUTOR })
  await correosSesionMiembro(nueva, 'cambiada', base, { antes: { inicio: r.inicio, fin: r.fin }, autor: AUTOR })
  return { estado: 'confirmada', codigo: nueva.codigo }
}

export async function cancelarMiembro(sus, { codigo }, base, { ahora = new Date() } = {}) {
  const r = await sesionSuya(sus, codigo)
  if (!['confirmada', 'pendiente'].includes(r.estado)) {
    throw new ErrorReserva('estado', r.estado === 'cancelada' ? 'Esta sesión ya estaba cancelada.' : 'Esta sesión no se puede cancelar desde aquí. Escríbenos.', 409)
  }
  if (r.inicio.getTime() <= ahora.getTime()) throw new ErrorReserva('pasada', 'Esta sesión ya ha empezado o ha pasado.', 409)
  if (r.pagoEstado === 'pagado' && r.precioCent > 0) throw new ErrorReserva('extra_pagado', 'Esta sesión tiene horas aparte pagadas: escríbenos y lo vemos.', 409)
  let cancelada
  if (r.estado === 'pendiente') {
    // Sin pagar todavía: se suelta la hora (si luego llegara el pago, el estudio lo verá)
    cancelada = await cancelarSesionPlan(r.id, { motivo: 'Pago sin terminar: la soltó desde su área', cuentaComoUsada: false }, { ahora, autor: AUTOR })
  } else {
    cancelada = await cancelarSesionPlan(r.id, { motivo: 'Cancelada por el miembro desde su área' }, { ahora, autor: AUTOR })
    await correosSesionMiembro(cancelada, 'cancelada', base, { autor: AUTOR })
  }
  return { ok: true, cuentaComoUsada: Boolean(cancelada.cuentaComoUsada) }
}

// ---------- Mensajes al estudio ----------

export async function mensajeMiembro(sus, { tipo, texto }, base) {
  const t = tipo === 'baja' ? 'baja' : 'consulta'
  const limpio = String(texto ?? '').replace(/\r\n/g, '\n').trim().slice(0, 2000)
  if (t === 'consulta' && limpio.length < 3) throw new ErrorReserva('texto', 'Escribe tu mensaje.', 400)
  if (!(await dentroDelLimite(`miembro_mensaje:${sus.id}`, 5, 24 * 60))) {
    throw new ErrorReserva('limite', 'Ya nos has escrito varias veces hoy. Si es urgente, escríbenos por WhatsApp.', 429)
  }
  const r = await avisoMensajeMiembro(sus, { tipo: t, texto: limpio }, { base })
  if (r?.noEnviado) throw new ErrorReserva('correo', 'Ahora mismo no se puede enviar. Escríbenos por WhatsApp.', 503)
  await registrar(query, null, 'mensaje_miembro', { tipo: t, texto: limpio.slice(0, 300) }, { suscripcionId: sus.id, autor: AUTOR })
  return { ok: true }
}

// ---------- Documentos ----------

// La factura solo si es de una cuota o una sesión de una suscripción con su correo
export async function facturaDelMiembro(email, id) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) throw new ErrorReserva('no_existe', 'Factura no encontrada.', 404)
  const f = await facturaPorId(n)
  if (!f) throw new ErrorReserva('no_existe', 'Factura no encontrada.', 404)
  const { rows } = await query(
    `SELECT s.email FROM suscripciones s
      WHERE s.id = (SELECT suscripcion_id FROM cuotas WHERE id = $1)
         OR s.id = (SELECT suscripcion_id FROM reservas WHERE id = $2)`,
    [f.cuotaId ?? null, f.reservaId ?? null]
  )
  const suya = rows.some((x) => String(x.email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase())
  if (!suya) throw new ErrorReserva('no_existe', 'Factura no encontrada.', 404)
  return { pdf: await pdfFactura(f), nombre: `${f.simplificada ? 'Factura simplificada' : 'Factura'} ${f.codigo}.pdf` }
}

export async function contratoDelMiembro(sus) {
  const c = await pdfDelContrato({ susId: sus.id })
  if (!c) throw new ErrorReserva('no_existe', 'Todavía no hay contrato firmado.', 404)
  return c
}
