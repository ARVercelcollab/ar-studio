// Reglas de las suscripciones (planes mensuales). Funciones puras: no tocan la base de
// datos, así que las usan el servidor, las páginas del panel y, en la fase 3, el área de
// clientes (con modo 'cliente', donde los avisos pasan a ser errores).
//
// Un "periodo" es el mes de cobro: del día del primer cobro (fecha de inicio) al mismo día
// del mes siguiente, sin incluirlo. Si ese día no existe en un mes, se usa el último del
// mes, pero siempre contando desde el día ancla (31-ene → 28-feb → 31-mar).

import { PLANES, PLAN_COMUN, PLAN_HORA_EXTRA_CENT, tarifaWebCent, formatoEuros, textoDuracion } from '../reservas/config.js'
import {
  fechaMadrid, horaMadrid, diaSemana, madridAInstante, sumarDias, sumarMeses, diasEntre,
  textoFechaCorta, minutosDeHora, horaDeMinutos, esHora,
} from '../reservas/tiempo.js'
import { tipoDeDia, choca } from '../reservas/disponibilidad.js'

const H = 3600000
const EPS = 1e-9
const cuarto = (h) => Math.floor(h * 4 + EPS) / 4
const enCuartos = (h) => Math.abs(h * 4 - Math.round(h * 4)) < EPS
const item = (codigo, texto) => ({ codigo, texto })
const h = (x) => textoDuracion(x, { corto: true })

// ---------- Periodos ----------

export function periodoNumero(sus, n) {
  return { numero: n, desde: sumarMeses(sus.fechaInicio, n - 1), hasta: sumarMeses(sus.fechaInicio, n) }
}

// Periodo que contiene una fecha ('AAAA-MM-DD'); null si es antes de empezar
export function periodoDe(sus, fecha) {
  if (!fecha || fecha < sus.fechaInicio) return null
  let n = (Number(fecha.slice(0, 4)) - Number(sus.fechaInicio.slice(0, 4))) * 12 +
    Number(fecha.slice(5, 7)) - Number(sus.fechaInicio.slice(5, 7)) + 1
  if (periodoNumero(sus, n).desde > fecha) n--
  return periodoNumero(sus, n)
}

export const ultimoDiaDe = (p) => sumarDias(p.hasta, -1)
export const ultimoDiaPermanencia = (sus) => sumarDias(sumarMeses(sus.fechaInicio, sus.permanenciaMeses), -1)
export const textoPeriodo = (p) => `${textoFechaCorta(p.desde)} – ${textoFechaCorta(ultimoDiaDe(p))}`

// 'por_empezar' | 'activa' | 'baja_avisada' | 'finalizada'
export function estadoDe(sus, hoy) {
  if (sus.ultimoDia && hoy > sus.ultimoDia) return 'finalizada'
  if (hoy < sus.fechaInicio) return 'por_empezar'
  return sus.ultimoDia ? 'baja_avisada' : 'activa'
}

export const ESTADOS_SUSCRIPCION = {
  por_empezar: 'Empieza pronto',
  activa: 'Activa',
  baja_avisada: 'Se da de baja',
  finalizada: 'Finalizada',
}

export function enPrueba(sus, hoy) {
  if (!sus.mesPrueba || estadoDe(sus, hoy) === 'finalizada') return false
  return periodoDe(sus, hoy < sus.fechaInicio ? sus.fechaInicio : hoy).numero === 1
}

// Periodo "de hoy" (o el primero si aún no ha empezado)
export function periodoActual(sus, hoy) {
  return periodoDe(sus, hoy < sus.fechaInicio ? sus.fechaInicio : hoy)
}

// ---------- Sesiones ----------

// ¿Gasta horas del plan? Las activas sí; las canceladas solo si fue con menos de 48 h
export function cuentaParaElPlan(s) {
  return ['pendiente', 'confirmada', 'conflicto'].includes(s.estado) || (s.estado === 'cancelada' && Boolean(s.cuentaComoUsada))
}

export function duracionValida(sus, horas) {
  if (sus.duracionesH && sus.duracionesH.length) return sus.duracionesH.some((d) => Math.abs(d - horas) < EPS)
  return horas >= sus.sesionMinH - EPS && horas <= sus.sesionMaxH + EPS
}

export function textoDuraciones(sus) {
  if (sus.duracionesH && sus.duracionesH.length) return sus.duracionesH.map(h).join(' o ')
  if (Math.abs(sus.sesionMinH - sus.sesionMaxH) < EPS) return h(sus.sesionMinH)
  return `${h(sus.sesionMinH)} a ${h(sus.sesionMaxH)}`
}

// Horas de la sesión dentro de su horario y en un día incluido (lunes a viernes, no festivo)
export function horasDentro(sus, inicio, fin, festivos = new Set()) {
  const fecha = fechaMadrid(inicio)
  const d = diaSemana(fecha)
  if (d === 0 || d === 6 || festivos.has(fecha)) return 0
  const a = Math.max(inicio.getTime(), madridAInstante(fecha, sus.franjaDesde).getTime())
  const b = Math.min(fin.getTime(), madridAInstante(fecha, sus.franjaHasta).getTime())
  return cuarto(Math.max(0, b - a) / H)
}

// Comprueba una sesión propuesta. Devuelve errores (no se puede), avisos (hace falta pulsar
// «Reservar igualmente») y notas (solo información), con el reparto de horas del plan y aparte.
// impagadas: cuotas de esta suscripción sin pagar (de cualquier mes); con una que no le deja
// usar el estudio (cuotaImpagada) sale el aviso «Cuota sin pagar», que se puede saltar
export function validarSesion({
  sus, cuota = null, sesionesPeriodo = [], inicio, fin, horasPlan = null, festivos = new Set(),
  ahora = new Date(), excluirId = null, moviendo = null, modo = 'panel', impagadas = [],
}) {
  const errores = []
  const avisos = []
  const notas = []
  inicio = new Date(inicio)
  fin = new Date(fin)
  const fecha = fechaMadrid(inicio)
  const hoy = fechaMadrid(ahora)
  const horas = Math.round((fin - inicio) / 60000) / 60
  const tipoDia = tipoDeDia(fecha, festivos)
  const periodo = periodoDe(sus, fecha)
  const resultado = {
    errores, avisos, notas, periodo, horas, horasPlan: 0, horasExtra: horas, horasPlanPorDefecto: 0,
    restantesAntes: 0, restantesDespues: 0, tipoDia, precioExtraSugeridoCent: 0,
  }

  // 1. Lo que no se puede de ninguna manera
  if (!periodo) {
    errores.push(item('antes_de_empezar', `La suscripción empieza el ${textoFechaCorta(sus.fechaInicio)}.`))
    return resultado
  }
  if (sus.ultimoDia && fecha > sus.ultimoDia) {
    errores.push(item('despues_de_baja', `Su último día es el ${textoFechaCorta(sus.ultimoDia)}.`))
    return resultado
  }
  if (fechaMadrid(new Date(fin.getTime() - 1)) !== fecha) {
    errores.push(item('dos_dias', 'Una sesión no puede pasar de un día a otro.'))
    return resultado
  }

  // 2. Horas del periodo
  const otras = sesionesPeriodo.filter((s) => s.id !== excluirId && cuentaParaElPlan(s))
  const total = cuota ? cuota.horas : sus.horasPeriodo
  const usadas = otras.reduce((a, s) => a + (Number(s.horasPlan) || 0), 0)
  const restantesAntes = Math.max(0, total - usadas)

  // 3. Reparto por defecto: lo que cae fuera de su horario o de las horas que le quedan va aparte
  const dentro = horasDentro(sus, inicio, fin, festivos)
  const porDefecto = Math.min(dentro, restantesAntes)
  let plan = porDefecto

  // 4. Reparto elegido a mano
  if (horasPlan !== null && horasPlan !== undefined && horasPlan !== '') {
    const hp = Number(horasPlan)
    if (!Number.isFinite(hp) || hp < 0 || hp > horas + EPS || !enCuartos(hp)) {
      errores.push(item('horas_plan', 'Las horas del plan tienen que estar entre 0 y la duración, en cuartos de hora.'))
    } else if (hp > restantesAntes + EPS) {
      errores.push(item('horas_plan', `Le quedan ${h(restantesAntes)} del plan en este periodo: pon como mucho ${h(restantesAntes)}.`))
    } else {
      plan = hp
    }
  }
  const extra = Math.max(0, cuarto(horas - plan + EPS))
  const restantesDespues = Math.max(0, restantesAntes - plan)

  // 5. Condiciones del contrato: avisos si gasta horas del plan; si no, solo notas
  const iniMin = minutosDeHora(horaMadrid(inicio))
  const finMin = iniMin + Math.round(horas * 60)
  const d = diaSemana(fecha)
  const contrato = []
  if (d === 0 || d === 6) contrato.push(item('finde', 'Es sábado o domingo: el plan no incluye fines de semana.'))
  else if (festivos.has(fecha)) contrato.push(item('festivo', 'Es festivo: el plan no incluye festivos.'))
  if (iniMin < minutosDeHora(sus.franjaDesde) || finMin > minutosDeHora(sus.franjaHasta)) {
    contrato.push(item('franja', `Fuera de su horario (de ${sus.franjaDesde} a ${sus.franjaHasta}).`))
  }
  if (plan > EPS) {
    avisos.push(...contrato)
    if (!duracionValida(sus, plan) && Math.abs(plan - restantesAntes) > EPS) {
      avisos.push(item('duracion', `Su plan es de sesiones de ${textoDuraciones(sus)}. Esta usa ${h(plan)} del plan.`))
    }
    const conPlan = otras.filter((s) => (Number(s.horasPlan) || 0) > EPS).length
    if (sus.maxSesiones && conPlan >= sus.maxSesiones) {
      avisos.push(item('sesiones', `Ya tiene ${conPlan} ${conPlan === 1 ? 'sesión' : 'sesiones'} en este periodo y su plan incluye ${sus.maxSesiones}.`))
    }
  } else {
    notas.push(...contrato)
  }

  // 6. Avisos de tiempo
  const falta = inicio.getTime() - ahora.getTime()
  if (falta < 0) {
    notas.push(item('pasada', 'Es una sesión pasada: se apunta igual.'))
  } else if (falta < sus.antelacionH * H) {
    avisos.push(item('antelacion', `Faltan menos de ${sus.antelacionH} h para la sesión.`))
  }
  if (moviendo) {
    const faltaAntes = new Date(moviendo.inicio).getTime() - ahora.getTime()
    if (faltaAntes > 0 && faltaAntes < sus.avisoCancelacionH * H) {
      avisos.push(item('mover_tarde', `Faltan menos de ${sus.avisoCancelacionH} h para la sesión: según las condiciones, cambiarla cuenta como usada.`))
    }
  }

  // 7. Notas
  if (extra > EPS) notas.push(item('extra', `${h(extra)} ${extra === 1 ? 'va' : 'van'} aparte y se cobran.`))
  if (restantesDespues > EPS && restantesDespues < sus.sesionMinH - EPS) {
    notas.push(item('sobrante', `Le quedarán ${h(restantesDespues)} este periodo: no llegan a una sesión de ${h(sus.sesionMinH)}.`))
  }
  const impago = impagadas.filter((c) => cuotaImpagada(c, sus, hoy)).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0]
  if (impago) {
    avisos.push(item('impago', textoImpago(impago)))
  } else if (cuota && cuota.estado === 'pendiente' && cuota.importeCent > 0 && cuota.desde <= hoy) {
    notas.push(item('cuota_sin_pagar', `La cuota de este periodo (${formatoEuros(cuota.importeCent)}) aún no está pagada.`))
  }
  const actual = periodoActual(sus, hoy)
  if (actual && periodo.numero > actual.numero + 1) {
    notas.push(item('periodo_lejano', 'Es para dentro de más de un mes: la cuota de ese periodo aún no se ha cobrado.'))
  }
  if (sus.mesPrueba && actual && actual.numero === 1 && periodo.numero >= 2) {
    notas.push(item('prueba', 'Está en el mes de prueba: si no sigue, habrá que cancelar esta sesión.'))
  }

  // 8. En el área de clientes (fase 3) no hay «reservar igualmente»
  if (modo === 'cliente') {
    errores.push(...avisos.splice(0), ...notas.filter((n) => !['sobrante', 'cuota_sin_pagar'].includes(n.codigo)))
    if (extra > EPS) errores.push(item('extra', 'No te quedan horas del plan para esa sesión.'))
  }

  return {
    ...resultado,
    horasPlan: plan,
    horasExtra: extra,
    horasPlanPorDefecto: porDefecto,
    restantesAntes,
    restantesDespues,
    // El mismo día, la tarifa de horas no contratadas; con antelación, la de la web
    precioExtraSugeridoCent: extra <= EPS ? 0 : fecha === hoy ? Math.round(extra * PLAN_HORA_EXTRA_CENT[tipoDia]) : tarifaWebCent(extra, tipoDia),
  }
}

// Resumen de un periodo: horas usadas, reservadas, perdidas…
export function resumenPeriodo({ periodo, horas, sesiones = [], ahora = new Date() }) {
  const hoy = fechaMadrid(ahora)
  let usadas = 0
  let hechas = 0
  let reservadas = 0
  let canceladasTarde = 0
  for (const s of sesiones) {
    if (!cuentaParaElPlan(s)) continue
    const hp = Number(s.horasPlan) || 0
    usadas += hp
    if (s.estado === 'cancelada') canceladasTarde += hp
    else if (new Date(s.fin).getTime() < ahora.getTime()) hechas += hp
    else reservadas += hp
  }
  const restantes = Math.max(0, horas - usadas)
  const ultimoDia = ultimoDiaDe(periodo)
  return {
    periodo,
    texto: textoPeriodo(periodo),
    horas,
    usadas,
    hechas,
    reservadas,
    canceladasTarde,
    restantes,
    ultimoDia,
    diasParaCaducar: diasEntre(hoy, ultimoDia),
    seHanPerdido: hoy > ultimoDia ? restantes : 0,
  }
}

// ¿Cancelar ahora hace que la sesión cuente como usada? (menos de 48 h, o ya pasada)
export function cancelacionCuenta(sus, sesion, ahora = new Date()) {
  return new Date(sesion.inicio).getTime() - ahora.getTime() < sus.avisoCancelacionH * H
}

// Último día que le corresponde según su contrato si avisa de la baja ese día
export function propuestaBaja(sus, avisoEn) {
  const m = periodoDe(sus, avisoEn < sus.fechaInicio ? sus.fechaInicio : avisoEn).numero
  if (sus.mesPrueba && m === 1) return { ultimoPeriodo: 1, ultimoDia: ultimoDiaDe(periodoNumero(sus, 1)), motivo: 'prueba' }
  let k = Math.max(sus.permanenciaMeses, 1)
  const paso = Math.max(1, sus.renovacionMeses)
  while (!(k >= m && diasEntre(avisoEn, periodoNumero(sus, k + 1).desde) >= sus.preavisoDias)) k += paso
  return { ultimoPeriodo: k, ultimoDia: ultimoDiaDe(periodoNumero(sus, k)), motivo: 'contrato' }
}

// Qué pasa si su último día es "ultimoDia" (textos para el panel)
export function consecuenciasBaja(sus, ultimoDia, avisoEn = null) {
  const periodo = periodoDe(sus, ultimoDia < sus.fechaInicio ? sus.fechaInicio : ultimoDia)
  const finPermanencia = ultimoDiaPermanencia(sus)
  const prueba = Boolean(sus.mesPrueba) && periodo.numero === 1
  const cumplePermanencia = ultimoDia >= finPermanencia
  const textos = []
  let fianza
  if (prueba) {
    textos.push('Está en el mes de prueba: se va sin más cargos y se le devuelve la fianza. La cuota de prueba no se devuelve.')
    fianza = 'devolver'
  } else if (!cumplePermanencia) {
    textos.push(`No llega a los ${sus.permanenciaMeses} meses de permanencia (hasta el ${textoFechaCorta(finPermanencia, { anio: true })}): según las condiciones pierde la fianza.`)
    fianza = 'retener'
  } else {
    textos.push('Cumple la permanencia: se le devuelve la fianza si el estudio y el equipo están bien.')
    fianza = 'devolver'
  }
  if (sus.fianzaEstado === 'sin_fianza') textos.push('No dejó fianza.')
  const finPeriodo = ultimoDiaDe(periodo)
  if (ultimoDia !== finPeriodo) textos.push(`Termina a mitad de periodo (el periodo acaba el ${textoFechaCorta(finPeriodo)}): no se prorratea.`)
  let antesDeContrato = false
  if (avisoEn) {
    const p = propuestaBaja(sus, avisoEn)
    if (ultimoDia < p.ultimoDia) {
      antesDeContrato = true
      textos.push(`Según su contrato, el último día sería el ${textoFechaCorta(p.ultimoDia, { anio: true })}. Revisa el contrato por si hay penalización.`)
    }
  }
  return { periodo, enPrueba: prueba, cumplePermanencia, antesDeContrato, fianza, textos }
}

// Horas de inicio libres ese día dentro de su horario (con ahora: también con su antelación)
export function iniciosPosibles({ fecha, horas, sus, ocupado = {}, ahora = null, pasoMin = 30 }) {
  const d = diaSemana(fecha)
  if (d === 0 || d === 6 || !(horas > 0)) return []
  const libres = []
  const ultimo = minutosDeHora(sus.franjaHasta) - Math.round(horas * 60)
  for (let m = minutosDeHora(sus.franjaDesde); m <= ultimo; m += pasoMin) {
    const hora = horaDeMinutos(m)
    const inicio = madridAInstante(fecha, hora)
    const fin = new Date(inicio.getTime() + horas * H)
    if (ahora && inicio.getTime() - ahora.getTime() < sus.antelacionH * H) continue
    if (choca({ inicio, fin }, ocupado)) continue
    libres.push(hora)
  }
  return libres
}

// ---------- Cuotas ----------

// 'pagada' | 'anulada' | 'devuelta' | 'sin_cargo' | 'proxima' | 'sin_pagar' | 'atrasada'
// ¿Esta cuota está sin pagar de forma que la persona no puede usar el estudio? Ya ha
// empezado y: el cobro automático ha fallado, o (si no se cobra sola) lleva al menos un día
// sin pagarse. Si la cobra Stripe u otro, cuando ya está atrasada (por si el aviso tarda).
// Un cobro automático que aún no se ha hecho o que está por comprobar no cuenta.
export function cuotaImpagada(cuota, sus, hoy) {
  if (!cuota || cuota.estado !== 'pendiente' || !(cuota.importeCent > 0) || cuota.desde > hoy) return false
  if (['rechazado', 'agotado'].includes(cuota.cobroEstado)) return true
  if (sus.cobroAuto || ['cobrando', 'revisar'].includes(cuota.cobroEstado)) return false
  if (sus.cobroExterno) return chipCuota(cuota, hoy) === 'atrasada'
  return cuota.desde < hoy
}

export const textoImpago = (c) => `Cuota sin pagar: no puede usar el estudio hasta pagarla (la del ${textoFechaCorta(c.desde)}, ${formatoEuros(c.importeCent)}).`

export function chipCuota(cuota, hoy) {
  if (['pagada', 'anulada', 'devuelta'].includes(cuota.estado)) return cuota.estado
  if (cuota.importeCent === 0) return 'sin_cargo'
  if (cuota.desde > hoy) return 'proxima'
  return diasEntre(cuota.desde, hoy) > 5 ? 'atrasada' : 'sin_pagar'
}

export const TEXTOS_CHIP_CUOTA = {
  pagada: 'Pagada',
  anulada: 'Anulada',
  devuelta: 'Devuelta',
  sin_cargo: 'Sin cargo',
  proxima: 'Próxima',
  sin_pagar: 'Sin pagar',
  atrasada: 'Atrasada',
}

// Lo que hay que hacer con las suscripciones (recuadro «Para hacer» del panel)
// Día del próximo cobro automático: la cuota pendiente más antigua que ya toca, o el
// inicio del siguiente mes (si no es después de su baja). null si no se cobra sola.
export function proximoCobro(sus, cuotas = [], hoy) {
  if (!sus.cobroAuto) return null
  const pendiente = cuotas.filter((c) => c.estado === 'pendiente' && c.importeCent > 0 && c.periodo > 1).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0]
  if (pendiente) return pendiente.cobroEstado === 'rechazado' && pendiente.cobroProximo ? pendiente.cobroProximo : pendiente.desde
  const actual = periodoActual(sus, hoy)
  if (!actual) return null
  const siguiente = periodoNumero(sus, actual.numero + 1).desde
  return sus.ultimoDia && siguiente > sus.ultimoDia ? null : siguiente
}

// Último día de validez de una tarjeta que caduca en 'AAMM'
export function finCaducidad(aamm) {
  if (!/^\d{4}$/.test(String(aamm || ''))) return null
  const y = 2000 + Number(aamm.slice(0, 2))
  const m = Number(aamm.slice(2))
  if (m < 1 || m > 12) return null
  const siguiente = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return sumarDias(siguiente, -1)
}

export function tareasPendientes({ fichas, hoy }) {
  const tareas = []
  for (const { sus, cuotas = [], resumen = null } of fichas) {
    const estado = estadoDe(sus, hoy)
    const quien = sus.nombre
    for (const c of cuotas) {
      const chip = chipCuota(c, hoy)
      if (c.estado === 'pendiente' && c.cobroEstado === 'revisar') {
        tareas.push({ tipo: 'cobro_revisar', urgente: true, suscripcionId: sus.id,
          texto: `No sabemos si se cobró la cuota de ${quien} del ${textoFechaCorta(c.desde)} (${formatoEuros(c.importeCent)}): compruébalo en el portal del TPV.` })
        continue
      }
      if (c.estado === 'pendiente' && ['rechazado', 'agotado'].includes(c.cobroEstado)) {
        tareas.push({ tipo: 'cobro_rechazado', urgente: c.cobroEstado === 'agotado', suscripcionId: sus.id,
          texto: c.cobroEstado === 'agotado'
            ? `El banco rechazó todos los cobros de la cuota de ${quien} del ${textoFechaCorta(c.desde)} (${formatoEuros(c.importeCent)}). Le llegó el enlace para pagarla. Si no paga, decide: darle de baja por impago y quedarte la fianza.`
            : `El banco rechazó el cobro de la cuota de ${quien} del ${textoFechaCorta(c.desde)}${c.cobroProximo ? `; se reintenta el ${textoFechaCorta(c.cobroProximo)}` : ''}.` })
        continue
      }
      if (sus.cobroAuto && c.estado === 'pendiente' && !c.cobroEstado && c.desde >= hoy) continue // se cobra sola
      if (chip === 'sin_pagar' || chip === 'atrasada') {
        tareas.push({ tipo: 'cuota', urgente: chip === 'atrasada', suscripcionId: sus.id,
          texto: `Cuota de ${quien} sin pagar desde el ${textoFechaCorta(c.desde)} (${formatoEuros(c.importeCent)}).` })
      }
    }
    if (sus.mesPrueba && !sus.ultimoDia && estado !== 'finalizada') {
      const segundo = periodoNumero(sus, 2).desde
      const faltan = diasEntre(hoy, segundo)
      if (faltan >= 0 && faltan <= 7) {
        tareas.push({ tipo: 'prueba', urgente: faltan <= 2, suscripcionId: sus.id,
          texto: `Fin del mes de prueba de ${quien}: si no sigue, tiene que avisar por escrito antes del ${textoFechaCorta(segundo)}.${sus.cobroExterno === 'stripe' ? ' Stripe cobra solo el 2.º mes.' : ''}` })
      }
    }
    if (resumen && ['activa', 'baja_avisada'].includes(estado) && resumen.restantes > EPS && resumen.diasParaCaducar >= 0 && resumen.diasParaCaducar <= 7) {
      tareas.push({ tipo: 'horas', urgente: false, suscripcionId: sus.id,
        texto: `A ${quien} le quedan ${h(resumen.restantes)} y se pierden el ${textoFechaCorta(resumen.ultimoDia)}.` })
    }
    if (sus.ultimoDia && sus.cobroExterno) {
      tareas.push({ tipo: 'cobro_externo', urgente: true, suscripcionId: sus.id,
        texto: `Cancela el cobro automático de ${quien} en ${sus.cobroExterno === 'stripe' ? 'Stripe' : 'la pasarela'} (último día ${textoFechaCorta(sus.ultimoDia)}).` })
    }
    if (estado === 'finalizada' && sus.fianzaEstado === 'cobrada') {
      tareas.push({ tipo: 'fianza_resolver', urgente: false, suscripcionId: sus.id,
        texto: `Resuelve la fianza de ${quien} (${formatoEuros(sus.fianzaCent)}): devolverla o quedárosla.` })
    }
    if (sus.cobroAuto && sus.tarjeta?.caduca && estado !== 'finalizada') {
      const prox = proximoCobro(sus, cuotas, hoy)
      const fin = finCaducidad(sus.tarjeta.caduca)
      if (prox && fin && fin < prox) {
        tareas.push({ tipo: 'tarjeta', urgente: diasEntre(hoy, prox) <= 7, suscripcionId: sus.id,
          texto: `La tarjeta de ${quien} caduca (${sus.tarjeta.caduca.slice(2)}/${sus.tarjeta.caduca.slice(0, 2)}) antes del próximo cobro, el ${textoFechaCorta(prox)}. Si falla, le llegará el enlace para pagar con otra.` })
      }
    }
    if (estado !== 'finalizada' && sus.contratoEstado === 'pendiente') {
      tareas.push({ tipo: 'contrato', urgente: false, suscripcionId: sus.id,
        texto: `Falta que ${quien} firme el contrato (le llega el enlace por correo; se puede reenviar desde su ficha).` })
    }
    if (estado !== 'finalizada' && sus.fianzaEstado === 'pendiente') {
      const fueraDePlazo = Boolean(sus.fianzaLimite && sus.fianzaLimite < hoy)
      tareas.push({ tipo: 'fianza_cobrar', urgente: fueraDePlazo, suscripcionId: sus.id,
        texto: fueraDePlazo
          ? `La fianza de ${quien} (${formatoEuros(sus.fianzaCent)}) no ha llegado y el plazo acabó el ${textoFechaCorta(sus.fianzaLimite)}: escríbele.`
          : `Falta cobrar la fianza de ${quien} (${formatoEuros(sus.fianzaCent)})${sus.fianzaLimite ? `; tiene hasta el ${textoFechaCorta(sus.fianzaLimite)}` : ''}.` })
    }
  }
  return tareas.sort((a, b) => Number(b.urgente) - Number(a.urgente))
}

export function textoRecordatorioCuota(sus, cuota, { iban = null } = {}) {
  const mes = textoFechaCorta(cuota.desde).split(' ')[1]
  const pago = iban
    ? ` Puedes pagarla por transferencia o Bizum (IBAN ${iban}, concepto «${sus.codigo} ${mes}»).`
    : ' Puedes pagarla por transferencia o Bizum.'
  return `Hola ${sus.nombre}, te recuerdo la cuota de tu suscripción ${PLANES[cuota.plan || sus.plan]?.nombre || ''} de AR Studio del ${textoFechaCorta(cuota.desde)} al ${textoFechaCorta(sumarDias(cuota.hasta, -1))}: ${formatoEuros(cuota.importeCent)}.${pago} ¡Gracias!`
}

// ---------- Condiciones ----------

// Condiciones de partida de un plan (para el alta)
export function condicionesDePlan(plan) {
  const p = PLANES[plan] || PLANES.starter
  return {
    cuotaCent: p.cuotaCent,
    horasPeriodo: p.horasPeriodo,
    duracionesH: p.duracionesH ? [...p.duracionesH] : null,
    sesionMinH: p.sesionMinH,
    sesionMaxH: p.sesionMaxH,
    maxSesiones: p.maxSesiones,
    franjaDesde: p.franja[0],
    franjaHasta: p.franja[1],
    antelacionH: PLAN_COMUN.antelacionH,
    avisoCancelacionH: PLAN_COMUN.avisoCancelacionH,
    permanenciaMeses: PLAN_COMUN.permanenciaMeses,
    renovacionMeses: PLAN_COMUN.renovacionMeses,
    preavisoDias: PLAN_COMUN.preavisoDias,
  }
}

export function textoCondiciones(sus) {
  const lineas = [`${h(sus.horasPeriodo)} al mes`]
  if (sus.maxSesiones) lineas.push(`${sus.maxSesiones} ${sus.maxSesiones === 1 ? 'sesión' : 'sesiones'} de ${textoDuraciones(sus)}`)
  else lineas.push(`sesiones de ${textoDuraciones(sus)}`)
  lineas.push(`L–V de ${sus.franjaDesde} a ${sus.franjaHasta}`)
  lineas.push(`reservar con ${sus.antelacionH} h`)
  lineas.push(`cancelar con menos de ${sus.avisoCancelacionH} h = sesión usada`)
  lineas.push(`permanencia ${sus.permanenciaMeses} ${sus.permanenciaMeses === 1 ? 'mes' : 'meses'}`)
  if (sus.renovacionMeses > 1 || sus.preavisoDias > 0) {
    lineas.push(`renovación cada ${sus.renovacionMeses} ${sus.renovacionMeses === 1 ? 'mes' : 'meses'}${sus.preavisoDias ? `, preaviso ${sus.preavisoDias} días` : ''}`)
  }
  return lineas
}

// Comprueba unas condiciones (alta o cambio). Devuelve { campo: texto } con lo que esté mal.
export function validarCondiciones(c) {
  const e = {}
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))
  if (!Number.isInteger(num(c.cuotaCent)) || num(c.cuotaCent) < 0) e.cuotaCent = 'La cuota tiene que ser 0 o más.'
  const horas = num(c.horasPeriodo)
  if (!(horas > 0) || !enCuartos(horas) || horas > 200) e.horasPeriodo = 'Las horas al mes tienen que ser más de 0 (en cuartos de hora).'
  const min = num(c.sesionMinH)
  const max = num(c.sesionMaxH)
  if (!(min > 0) || !enCuartos(min)) e.sesionMinH = 'El mínimo por sesión tiene que ser más de 0.'
  if (!(max >= min) || !enCuartos(max) || max > 14) e.sesionMaxH = 'El máximo por sesión tiene que ser igual o mayor que el mínimo (y como mucho 14 h).'
  if (c.duracionesH != null) {
    if (!Array.isArray(c.duracionesH) || c.duracionesH.some((d) => !(Number(d) >= min - EPS && Number(d) <= max + EPS) || !enCuartos(Number(d)))) {
      e.duracionesH = 'Las duraciones permitidas tienen que estar entre el mínimo y el máximo.'
    }
  }
  if (!esHora(c.franjaDesde) || !esHora(c.franjaHasta) || c.franjaHasta <= c.franjaDesde) e.franja = 'Revisa el horario (desde y hasta).'
  else if ((minutosDeHora(c.franjaHasta) - minutosDeHora(c.franjaDesde)) / 60 < min - EPS) e.franja = 'El horario es más corto que una sesión.'
  const entero = (v, a, b) => Number.isInteger(num(v)) && num(v) >= a && num(v) <= b
  if (!entero(c.antelacionH, 0, 720)) e.antelacionH = 'La antelación tiene que ser de 0 a 720 horas.'
  if (!entero(c.avisoCancelacionH ?? PLAN_COMUN.avisoCancelacionH, 0, 720)) e.avisoCancelacionH = 'El aviso para cancelar tiene que ser de 0 a 720 horas.'
  if (!entero(c.permanenciaMeses, 0, 24)) e.permanenciaMeses = 'La permanencia tiene que ser de 0 a 24 meses.'
  if (!entero(c.renovacionMeses, 1, 12)) e.renovacionMeses = 'La renovación tiene que ser de 1 a 12 meses.'
  if (!entero(c.preavisoDias, 0, 120)) e.preavisoDias = 'El preaviso tiene que ser de 0 a 120 días.'
  if (c.maxSesiones != null && c.maxSesiones !== '' && !entero(c.maxSesiones, 1, 31)) e.maxSesiones = 'El máximo de sesiones tiene que ser de 1 a 31 (o vacío).'
  return e
}
