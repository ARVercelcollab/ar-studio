// Lo que ve el miembro en su área (studioar.es/miembros): su plan, las horas del mes, sus
// sesiones, los avisos (cuota sin pagar, contrato, fianza, tarjeta), sus cuotas y facturas,
// y lo que hace falta para reservar (días, duraciones, horas que le quedan).
//
// Solo lectura: las acciones están en acciones.js. Todo en «tú».

import { query } from '../db/index.js'
import { tokenNuevo } from '../reservas/servicio.js'
import {
  fichaSuscripcion, conReglasDelPeriodo, _datosDelPeriodo as datosDelPeriodo,
} from '../suscripciones/servicio.js'
import {
  estadoDe, ESTADOS_SUSCRIPCION, periodoActual, periodoNumero, ultimoDiaDe, textoPeriodo, cuentaParaElPlan,
  cancelacionCuenta, cuotaImpagada, chipCuota, proximoCobro, finCaducidad, textoDuraciones, duracionValida,
  resumenPeriodo, enPrueba, esLoQueQueda,
} from '../suscripciones/reglas.js'
import { contratoDeSuscripcion } from '../suscripciones/alta.js'
import { ibanEstudio, firmanteEstudio } from '../suscripciones/contrato.js'
import { proveedorActivo, comprobarProveedor } from '../pagos/index.js'
import { ESTUDIO, FIANZA_PLAZO_DIAS, formatoEuros, textoDuracion } from '../reservas/config.js'
import { fechaMadrid, horaMadrid, textoFecha, textoFechaCorta } from '../reservas/tiempo.js'
import { suscripcionVisible } from './acceso.js'

const H = 3600000
const EPS = 1e-9
const h = (x) => textoDuracion(x, { corto: true })
export const WHATSAPP = `https://wa.me/${ESTUDIO.whatsapp}`

// 'jueves 26 de noviembre'
export const fechaLarga = (fecha) => textoFecha(fecha).replace(/^(\S+), /, '$1 ').replace(/ de \d{4}$/, '')

// ---------- Ayudas ----------

// Por qué no puede reservar ahora (o null). El impago se mira aparte (hace falta la cuota).
export function motivoNoReservar(sus, { hoy, impagada = null }) {
  if (estadoDe(sus, hoy) === 'finalizada') return 'Tu suscripción ha terminado.'
  if (sus.contratoEstado === 'pendiente') return 'Firma tu contrato para empezar a reservar.'
  if (impagada) return `Tienes sin pagar la cuota del ${textoFechaCorta(impagada.desde)} (${formatoEuros(impagada.importeCent)}): cuando la pagues podrás reservar.`
  return null
}

// Días en los que puede reservar: desde hoy + su antelación hasta el final del mes siguiente
// (o su último día, o el final del mes de prueba)
export function rangoReservable(sus, reglas, ahora = new Date()) {
  const hoy = fechaMadrid(ahora)
  let desde = fechaMadrid(new Date(ahora.getTime() + reglas.antelacionH * H))
  if (desde < sus.fechaInicio) desde = sus.fechaInicio
  const actual = periodoActual(sus, hoy)
  let hasta = ultimoDiaDe(periodoNumero(sus, actual.numero + 1))
  if (sus.mesPrueba && actual.numero === 1) hasta = ultimoDiaDe(actual)
  if (sus.ultimoDia && sus.ultimoDia < hasta) hasta = sus.ultimoDia
  return { desde, hasta }
}

// Duraciones que puede elegir: las de su plan y, si le quedan menos horas (o unas que no son
// una duración del plan), también «lo que te queda»
export function duracionesDe(reglas, restantes = 0) {
  let base
  if (reglas.duracionesH && reglas.duracionesH.length) {
    base = [...reglas.duracionesH]
  } else {
    base = []
    for (let x = reglas.sesionMinH; x <= reglas.sesionMaxH + EPS; x += 1) base.push(x)
    if (!base.some((v) => Math.abs(v - reglas.sesionMaxH) < EPS)) base.push(reglas.sesionMaxH)
  }
  const lista = base.map((x) => ({ horas: x, texto: h(x) }))
  if (!duracionValida(reglas, restantes) && esLoQueQueda(reglas, restantes, restantes)) {
    lista.push({ horas: restantes, texto: `${h(restantes)} (lo que te queda)` })
  }
  return lista.sort((a, b) => a.horas - b.horas)
}

// Frases cortas con las condiciones de su plan
export function condicionesCortas(reglas, horasMes) {
  const dur = textoDuraciones(reglas)
  return [
    `${h(horasMes)} al mes`,
    reglas.maxSesiones ? `${reglas.maxSesiones} ${reglas.maxSesiones === 1 ? 'sesión' : 'sesiones'} de ${dur} al mes` : `Sesiones de ${dur}`,
    `De lunes a viernes, de ${reglas.franjaDesde} a ${reglas.franjaHasta}`,
    `Reserva con ${reglas.antelacionH} h de antelación`,
    `Cambia o cancela con ${reglas.avisoCancelacionH} h de antelación`,
    'Las horas que no uses en el mes se pierden',
  ]
}

// Una sesión tal como la ve el miembro
// bloqueo: por qué no puede cambiar sesiones ahora (cuota sin pagar, contrato), o null
export function aSesion(r, sus, ahora = new Date(), { finalizada = false, bloqueo = null } = {}) {
  const fecha = fechaMadrid(r.inicio)
  const extra = Math.max(0, r.duracionHoras - (r.horasPlan || 0))
  const futura = r.inicio.getTime() > ahora.getTime()
  const conExtra = extra > EPS || r.precioCent > 0
  const extraPagado = r.precioCent > 0 && r.pagoEstado === 'pagado'
  const tarde = futura && cancelacionCuenta(sus, r, ahora)
  let motivoNoCambiar = null
  if (finalizada) motivoNoCambiar = 'Tu suscripción ha terminado.'
  else if (!futura) motivoNoCambiar = 'Ya ha pasado.'
  else if (r.estado === 'pendiente') motivoNoCambiar = 'Falta pagar las horas aparte.'
  else if (r.estado === 'conflicto') motivoNoCambiar = 'El estudio está revisando esta sesión: te escribimos.'
  else if (conExtra) motivoNoCambiar = 'Tiene horas aparte: escríbenos para cambiarla.'
  else if (tarde) motivoNoCambiar = `Faltan menos de ${sus.avisoCancelacionH} h: escríbenos para cambiarla.`
  else if (bloqueo) motivoNoCambiar = bloqueo
  const puedeCancelar = futura && !finalizada && ['confirmada', 'pendiente'].includes(r.estado) && !extraPagado
  let textoCancelar
  if (extraPagado) textoCancelar = 'Esta sesión tiene horas aparte pagadas: escríbenos y lo vemos.'
  else if (r.estado === 'pendiente') textoCancelar = 'Se suelta la hora y no se cobra nada.'
  else if (tarde) textoCancelar = `Faltan menos de ${sus.avisoCancelacionH} h: si la cancelas, cuenta como usada y esas horas no vuelven a tu plan.`
  else textoCancelar = 'Las horas vuelven a tu plan.'
  return {
    codigo: r.codigo,
    fecha,
    fechaTexto: fechaLarga(fecha),
    desde: horaMadrid(r.inicio),
    hasta: horaMadrid(r.fin),
    horas: r.duracionHoras,
    horasPlan: r.horasPlan || 0,
    horasExtra: extra,
    extraTexto: extra > EPS
      ? r.precioCent > 0
        ? `${h(extra)} aparte · ${formatoEuros(r.precioCent)}${r.pagoEstado === 'pagado' ? ' · pagadas' : ' · sin pagar'}`
        : `${h(extra)} aparte · sin cargo`
      : null,
    estado: r.estado,
    puedeCambiar: !motivoNoCambiar,
    puedeCancelar,
    motivoNoCambiar,
    cancelarCuentaComoUsada: r.estado === 'confirmada' && tarde,
    textoCancelar,
  }
}

const ESTADO_CUOTA = { sin_pagar: 'pendiente' }
const TEXTO_CUOTA = { pagada: 'Pagada', pendiente: 'Sin pagar', atrasada: 'Atrasada', proxima: 'Próxima', sin_cargo: 'Sin cargo', anulada: 'Anulada', devuelta: 'Devuelta' }

// ¿Puede pagar esta cuota con el enlace? (no si se cobra sola o hay un cobro en curso)
function cuotaPagableConEnlace(c, sus, hoy) {
  if (c.estado !== 'pendiente' || !(c.importeCent > 0) || c.desde > hoy) return false
  if (['cobrando', 'revisar'].includes(c.cobroEstado)) return false
  if (sus.cobroExterno) return false
  if (sus.cobroAuto && !['rechazado', 'agotado'].includes(c.cobroEstado)) return false
  return estadoDe(sus, hoy) !== 'finalizada'
}

async function enlaceDeCuota(cuotaId) {
  await query('UPDATE cuotas SET pago_token = $2 WHERE id = $1 AND pago_token IS NULL', [cuotaId, tokenNuevo()])
  const { rows } = await query('SELECT pago_token FROM cuotas WHERE id = $1', [cuotaId])
  return rows[0]?.pago_token ? `/cuota/${rows[0].pago_token}` : null
}

const caducaTexto = (aamm) => (/^\d{4}$/.test(String(aamm || '')) ? `${aamm.slice(2)}/${aamm.slice(0, 2)}` : null)

// ---------- Inicio del área ----------

export async function datosArea(email, { ahora = new Date() } = {}) {
  const visible = await suscripcionVisible(email, { ahora })
  if (!visible) return null
  const hoy = fechaMadrid(ahora)
  const f = await fichaSuscripcion(visible.id, { ahora })
  const sus = f.sus
  const estado = f.estado
  const finalizada = estado === 'finalizada'
  const cuotaActual = f.cuotas.find((c) => c.periodo === f.periodoActual.numero) || null
  const reglas = conReglasDelPeriodo(sus, cuotaActual)
  const impagada = f.cuotas.filter((c) => cuotaImpagada(c, sus, hoy)).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0] || null

  const motivo = motivoNoReservar(sus, { hoy, impagada })
  const sesionesActual = f.sesionesActual || []
  const periodo = finalizada ? null : {
    texto: f.resumenActual.texto,
    ultimoDia: f.resumenActual.ultimoDia,
    horas: f.resumenActual.horas,
    usadas: f.resumenActual.usadas,
    reservadas: f.resumenActual.reservadas,
    hechas: f.resumenActual.hechas,
    restantes: f.resumenActual.restantes,
    sesionesUsadas: sesionesActual.filter((s) => cuentaParaElPlan(s) && (s.horasPlan || 0) > EPS).length,
    maxSesiones: reglas.maxSesiones || null,
    diasParaCaducar: f.resumenActual.diasParaCaducar,
  }

  const vivas = f.sesiones.filter((s) => ['confirmada', 'conflicto'].includes(s.estado) || (s.estado === 'pendiente' && s.expiraEn && s.expiraEn.getTime() > ahora.getTime()))
  const proximas = vivas.filter((s) => s.fin.getTime() > ahora.getTime()).sort((a, b) => a.inicio - b.inicio).map((s) => aSesion(s, sus, ahora, { finalizada, bloqueo: motivo }))
  const pasadas = f.sesiones
    .filter((s) => s.estado === 'confirmada' && s.fin.getTime() <= ahora.getTime())
    .sort((a, b) => b.inicio - a.inicio)
    .slice(0, 6)
    .map((s) => aSesion(s, sus, ahora, { finalizada }))

  // Avisos
  const avisos = []
  if (impagada) {
    const enlace = cuotaPagableConEnlace(impagada, sus, hoy) ? await enlaceDeCuota(impagada.id) : null
    const rechazo = ['rechazado', 'agotado'].includes(impagada.cobroEstado)
    avisos.push({
      tipo: rechazo ? 'cobro' : 'impago',
      titulo: rechazo ? 'No hemos podido cobrar tu cuota' : 'Tienes una cuota sin pagar',
      texto: rechazo
        ? `El banco ha rechazado el cobro de la cuota del ${textoFechaCorta(impagada.desde)} (${formatoEuros(impagada.importeCent)}).${impagada.cobroEstado === 'rechazado' && impagada.cobroProximo ? ` Lo volvemos a intentar el ${textoFechaCorta(impagada.cobroProximo)}.` : ''} Hasta que esté pagada no puedes usar el estudio.${enlace ? ' Puedes pagarla ahora con otra tarjeta.' : ''}`
        : `La cuota del ${textoFechaCorta(impagada.desde)} (${formatoEuros(impagada.importeCent)}) está sin pagar: hasta pagarla no puedes usar el estudio.${enlace ? '' : ' Si ya la has pagado, escríbenos.'}`,
      enlace,
      textoEnlace: enlace ? 'Pagar la cuota' : null,
      transferencia: null,
    })
  }
  const contrato = await contratoDeSuscripcion(sus.id)
  if (!finalizada && sus.contratoEstado === 'pendiente') {
    avisos.push({
      tipo: 'contrato',
      titulo: 'Firma tu contrato',
      texto: 'Para empezar a reservar, firma tu contrato. Son dos minutos y lo puedes hacer desde el móvil.',
      enlace: contrato?.token ? `/contrato/${contrato.token}` : null,
      textoEnlace: contrato?.token ? 'Firmar el contrato' : null,
      transferencia: null,
    })
  }
  if (!finalizada && sus.fianzaEstado === 'pendiente' && sus.fianzaCent > 0) {
    const iban = ibanEstudio()
    const fuera = Boolean(sus.fianzaLimite && sus.fianzaLimite < hoy)
    avisos.push({
      tipo: 'fianza',
      titulo: `Falta la fianza de ${formatoEuros(sus.fianzaCent)}`,
      texto: (sus.fianzaLimite
        ? fuera
          ? `El plazo para la transferencia acabó el ${textoFechaCorta(sus.fianzaLimite)}. Hazla cuanto antes.`
          : `Haz la transferencia antes del ${textoFechaCorta(sus.fianzaLimite)}.`
        : `Haz la transferencia en los ${FIANZA_PLAZO_DIAS} días siguientes a firmar el contrato.`) +
        ' Se devuelve al terminar tu suscripción si el estudio y el equipo quedan bien.' +
        (iban ? '' : ' Escríbenos y te pasamos la cuenta.'),
      enlace: null,
      textoEnlace: null,
      transferencia: iban ? { iban, titular: firmanteEstudio().nombre, importeTexto: formatoEuros(sus.fianzaCent), concepto: `Fianza ${sus.codigo}` } : null,
    })
  }
  if (!finalizada && sus.cobroAuto && sus.tarjeta?.caduca) {
    const prox = proximoCobro(sus, f.cuotas, hoy)
    const fin = finCaducidad(sus.tarjeta.caduca)
    if (prox && fin && fin < prox) {
      avisos.push({
        tipo: 'tarjeta',
        titulo: 'Tu tarjeta caduca antes del próximo cobro',
        texto: `La tarjeta${sus.tarjeta.ultimos ? ` acabada en ${sus.tarjeta.ultimos}` : ''} caduca el ${caducaTexto(sus.tarjeta.caduca)} y la próxima cuota se cobra el ${textoFechaCorta(prox)}. Si el cobro falla, te llegará un enlace para pagar con otra.`,
        enlace: null,
        textoEnlace: null,
        transferencia: null,
      })
    }
  }

  // Cuotas (la más reciente primero)
  const cuotas = []
  for (const c of [...f.cuotas].sort((a, b) => b.periodo - a.periodo)) {
    const chip = chipCuota(c, hoy)
    const est = ESTADO_CUOTA[chip] || chip
    let estadoTexto = TEXTO_CUOTA[est] || est
    if (est === 'pagada' && c.pagadaEn) estadoTexto = `Pagada el ${textoFechaCorta(c.pagadaEn)}`
    else if (['cobrando', 'revisar'].includes(c.cobroEstado) && c.estado === 'pendiente') estadoTexto = 'Cobrándose'
    else if (est === 'proxima') estadoTexto = sus.cobroAuto ? `Se cobra sola el ${textoFechaCorta(c.desde)}` : `Desde el ${textoFechaCorta(c.desde)}`
    cuotas.push({
      id: c.id,
      periodoTexto: textoPeriodo(c),
      importeTexto: formatoEuros(c.importeCent),
      estado: est,
      estadoTexto,
      factura: c.factura ? { id: c.factura.id, numero: c.factura.codigo, url: `/api/miembros/factura/${c.factura.id}` } : null,
      enlacePago: cuotaPagableConEnlace(c, sus, hoy) ? await enlaceDeCuota(c.id) : null,
    })
  }

  const { rows: fs } = await query(
    `SELECT f.id, f.codigo, f.total_cent, r.inicio
       FROM facturas f JOIN reservas r ON r.id = f.reserva_id
      WHERE r.suscripcion_id = $1 AND f.sustituida_en IS NULL
      ORDER BY r.inicio DESC, f.id DESC`,
    [sus.id]
  )
  // La fecha es la de la sesión (no la del pago): «Horas aparte · sesión del 27 nov»
  const facturasSesiones = fs.map((x) => ({ id: x.id, numero: x.codigo, fechaTexto: `sesión del ${textoFechaCorta(fechaMadrid(new Date(x.inicio)))}`, importeTexto: formatoEuros(x.total_cent), url: `/api/miembros/factura/${x.id}` }))

  return {
    nombre: sus.nombre,
    email: sus.email,
    suscripcion: {
      codigo: sus.codigo,
      planNombre: sus.planNombre,
      estado,
      estadoTexto: enPrueba(sus, hoy) && !finalizada ? `${ESTADOS_SUSCRIPCION[estado]} · mes de prueba` : ESTADOS_SUSCRIPCION[estado],
      fechaInicio: sus.fechaInicio,
      ultimoDia: sus.ultimoDia,
      condiciones: condicionesCortas(reglas, cuotaActual ? cuotaActual.horas : sus.horasPeriodo),
      puedeReservar: !motivo,
      motivoNoReservar: motivo,
    },
    periodo,
    proximas,
    pasadas,
    avisos,
    cuotas,
    facturasSesiones,
    contrato: sus.contratoEstado === 'firmado'
      ? { estado: 'firmado', url: '/api/miembros/contrato', enlaceFirmar: null }
      : sus.contratoEstado === 'pendiente'
        ? { estado: 'pendiente', url: null, enlaceFirmar: contrato?.token ? `/contrato/${contrato.token}` : null }
        : { estado: 'sin_contrato', url: null, enlaceFirmar: null },
    tarjeta: sus.tarjeta ? { ultimos: sus.tarjeta.ultimos, caduca: caducaTexto(sus.tarjeta.caduca), cobroAutomatico: sus.cobroAuto } : null,
    whatsapp: WHATSAPP,
  }
}

// ---------- Para reservar (o cambiar una sesión) ----------

export async function pagoExtraDisponible() {
  try {
    await comprobarProveedor(proveedorActivo())
    return true
  } catch {
    return false
  }
}

// Resumen de un periodo para reservar: horas y las que le quedan (sin contar su sesión
// retenida esperando el pago, como las comprobaciones)
async function periodoParaReservar(sus, numero, ahora, { sinId = null } = {}) {
  const p = periodoNumero(sus, numero)
  const { cuota, sesiones } = await datosDelPeriodo(query, sus, p.desde)
  const r = resumenPeriodo({ periodo: p, horas: cuota ? cuota.horas : sus.horasPeriodo, sesiones: sesiones.filter((x) => x.id !== sinId), ahora })
  return { numero, texto: textoPeriodo(p), ultimoDia: ultimoDiaDe(p), horas: r.horas, restantes: r.restantes, cuota }
}

export async function datosReservar(email, { ahora = new Date(), codigo = null } = {}) {
  const sus = await suscripcionVisible(email, { ahora })
  if (!sus) return null
  const hoy = fechaMadrid(ahora)
  const f = await fichaSuscripcion(sus.id, { ahora })
  const s = f.sus
  const actual = f.periodoActual
  const cuotaActual = f.cuotas.find((c) => c.periodo === actual.numero) || null
  const reglas = conReglasDelPeriodo(s, cuotaActual)
  const impagada = f.cuotas.filter((c) => cuotaImpagada(c, s, hoy)).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0] || null
  let motivo = motivoNoReservar(s, { hoy, impagada })

  const { desde, hasta } = rangoReservable(s, reglas, ahora)
  // Su sesión retenida esperando el pago (si la hay): para pagarla o soltarla antes de otra
  const retenida = f.sesiones.find((x) => x.estado === 'pendiente' && x.expiraEn && x.expiraEn.getTime() > ahora.getTime()) || null
  const periodos = []
  for (const n of [actual.numero, actual.numero + 1]) {
    const p = periodoNumero(s, n)
    if (p.desde > hasta || ultimoDiaDe(p) < desde) continue
    const x = await periodoParaReservar(s, n, ahora, { sinId: codigo ? null : retenida?.id ?? null })
    periodos.push({ numero: x.numero, texto: x.texto, ultimoDia: x.ultimoDia, horas: x.horas, restantes: x.restantes })
  }
  if (!motivo && (desde > hasta || !periodos.length)) motivo = 'Ahora mismo no te quedan días para reservar.'

  let cambiando = null
  if (codigo) {
    const r = f.sesiones.find((x) => x.codigo === String(codigo))
    if (r) cambiando = aSesion(r, s, ahora, { finalizada: f.estado === 'finalizada', bloqueo: motivo })
  }
  const restantesPrimero = periodos[0]?.restantes ?? 0
  const duraciones = duracionesDe(reglas, cambiando ? cambiando.horas : restantesPrimero)
  return {
    nombre: s.nombre,
    planNombre: s.planNombre,
    franjaDesde: reglas.franjaDesde,
    franjaHasta: reglas.franjaHasta,
    duraciones,
    duracionPorDefecto: cambiando ? cambiando.horas : reglas.duracionesH?.[0] ?? reglas.sesionMinH,
    desde,
    hasta,
    periodos,
    pagoExtraDisponible: !cambiando && (await pagoExtraDisponible()),
    cambiando,
    retenida: retenida ? aSesion(retenida, s, ahora, { finalizada: f.estado === 'finalizada' }) : null,
    // Al cambiar una sesión manda lo que diga la sesión (que ya incluye la cuota sin pagar)
    puedeReservar: cambiando ? cambiando.puedeCambiar : !motivo,
    motivoNoReservar: cambiando ? cambiando.motivoNoCambiar : motivo,
  }
}
