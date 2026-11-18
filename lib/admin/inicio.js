// Datos del Inicio del panel (dashboard): todo ya agregado en hora de Madrid. Las gráficas no
// calculan nada. Dinero sin IVA y por fecha de cobro; horas, por fecha de la sesión.

import { query } from '../db/index.js'
import { fechaMadrid, horaMadrid, madridAInstante, sumarDias, sumarMeses, diasEntre, diaSemana, textoFecha } from '../reservas/tiempo.js'
import { HORARIO } from '../reservas/config.js'
import { listarReservas } from '../reservas/servicio.js'
import { listarSuscripciones } from '../suscripciones/servicio.js'
import { vistaAdmin } from './vista.js'
import { avisosDeConfiguracion } from './configuracion.js'
import * as FIN from '../finanzas/servicio.js'
import * as C from '../finanzas/calculos.js'

const ABRE = Number(HORARIO.laborable.abre.slice(0, 2)) // 9
const CIERRA = Number(HORARIO.laborable.cierra.slice(0, 2)) // 22
const HORAS_DIA = CIERRA - ABRE
const MIN = 60000
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']
const idxDia = (fecha) => (diaSemana(fecha) + 6) % 7 // lunes = 0

// ---------- Tramos y comparación ----------

// El tramo que se mira: el periodo entero o, si está en curso, hasta hoy (incluido)
export function tramoDe(periodo, hoy) {
  if (!periodo.contieneHoy) return { desde: periodo.desde, hasta: periodo.hasta, enCurso: false, dias: diasEntre(periodo.desde, periodo.hasta) }
  const hasta = sumarDias(hoy, 1)
  return { desde: periodo.desde, hasta, enCurso: true, dias: diasEntre(periodo.desde, hasta), hastaPeriodo: periodo.hasta }
}

const mesesDelTipo = { mes: 1, trimestre: 3, anio: 12 }

// Periodo con el que se compara: los mismos días del anterior (o del año pasado)
export function tramoComparado(periodo, tramo, modo) {
  if (modo === 'no') return null
  const atras = modo === 'anio' ? 12 : mesesDelTipo[periodo.tipo]
  const desde = sumarMeses(periodo.desde, -atras, 1)
  const finCompleto = sumarMeses(periodo.hasta, -atras, 1)
  let hasta = finCompleto
  if (tramo.enCurso) {
    const h = sumarDias(desde, tramo.dias)
    hasta = h < finCompleto ? h : finCompleto
  }
  return { desde, hasta, completo: hasta === finCompleto, enCurso: false }
}

// '1–18 nov', 'octubre', '4.º trim. 2026', '2025'
export function textoTramo(t, periodo) {
  if (!t) return ''
  const f = (x) => `${Number(x.slice(8, 10))} ${C.textoMes(C.mesDe(x), { corto: true }).split(' ')[0]}`
  const ultimo = sumarDias(t.hasta, -1)
  if (periodo.tipo === 'mes' && t.desde.slice(8, 10) === '01' && t.hasta === C.primerDia(C.sumarMesesMes(C.mesDe(t.desde), 1))) {
    return C.textoMes(C.mesDe(t.desde), { soloNombre: true }) + (t.desde.slice(0, 4) !== periodo.desde.slice(0, 4) ? ` ${t.desde.slice(0, 4)}` : '')
  }
  if (C.mesDe(t.desde) === C.mesDe(ultimo)) return `${Number(t.desde.slice(8, 10))}–${f(ultimo)}`
  return `${f(t.desde)} – ${f(ultimo)}${t.desde.slice(0, 4) !== periodo.desde.slice(0, 4) ? ` ${t.desde.slice(0, 4)}` : ''}`
}

// ---------- Ocupación ----------

async function sesiones(desde, hasta) {
  const { rows } = await query(
    `SELECT id, codigo, origen, estado, inicio, fin, duracion_horas, tipo_dia, precio_cent, pago_estado, nombre, apellidos, suscripcion_id, horas_plan
       FROM reservas WHERE estado IN ('confirmada', 'conflicto') AND inicio < $2 AND fin > $1`,
    [madridAInstante(desde, '00:00'), madridAInstante(hasta, '00:00')]
  )
  return rows.map((r) => ({ ...r, inicio: new Date(r.inicio), fin: new Date(r.fin), duracion: Number(r.duracion_horas), fecha: fechaMadrid(new Date(r.inicio)) }))
}

async function bloqueos(desde, hasta) {
  const { rows } = await query('SELECT inicio, fin FROM bloqueos WHERE inicio < $2 AND fin > $1', [madridAInstante(desde, '00:00'), madridAInstante(hasta, '00:00')])
  return rows.map((b) => ({ inicio: new Date(b.inicio), fin: new Date(b.fin) }))
}

const solape = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))

// Minutos ocupados y disponibles por día de la semana y franja horaria, de [desde, hasta)
export function ocupacionDe(lista, bloq, desde, hasta, ahora = new Date()) {
  const celdas = Array.from({ length: 7 }, () => Array.from({ length: HORAS_DIA }, () => ({ ocup: 0, disp: 0, bloq: 0, dias: 0 })))
  let disp = 0
  let ocup = 0
  let celebradas = 0
  let futuras = 0
  const porFecha = new Map()
  for (const s of lista) {
    if (!porFecha.has(s.fecha)) porFecha.set(s.fecha, [])
    porFecha.get(s.fecha).push(s)
  }
  for (let f = desde; f < hasta; f = sumarDias(f, 1)) {
    const d = idxDia(f)
    const delDia = porFecha.get(f) || []
    for (let h = 0; h < HORAS_DIA; h++) {
      const a = madridAInstante(f, `${String(ABRE + h).padStart(2, '0')}:00`).getTime()
      const b = a + 60 * MIN
      const cel = celdas[d][h]
      cel.dias++
      let bl = 0
      for (const x of bloq) bl += solape(a, b, x.inicio.getTime(), x.fin.getTime())
      bl = Math.min(bl, 60 * MIN)
      const disponible = 60 * MIN - bl
      cel.disp += disponible
      cel.bloq += bl
      disp += disponible
      for (const s of delDia) {
        const o = solape(a, b, s.inicio.getTime(), s.fin.getTime())
        if (!o) continue
        cel.ocup += o
        ocup += o
        const corte = ahora.getTime()
        celebradas += solape(a, b, s.inicio.getTime(), Math.min(s.fin.getTime(), corte))
        futuras += solape(a, b, Math.max(s.inicio.getTime(), corte), s.fin.getTime())
      }
    }
  }
  const pct = (o, dd) => (dd > 0 ? Math.round((o * 100) / dd) : null)
  const horas = (m) => Math.round((m / (60 * MIN)) * 4) / 4
  const porDia = celdas.map((fila, i) => {
    const o = fila.reduce((a, c) => a + c.ocup, 0)
    const dd = fila.reduce((a, c) => a + c.disp, 0)
    return { dia: DIAS_SEMANA[i], pct: pct(o, dd), horas: horas(o) }
  })
  const porHora = Array.from({ length: HORAS_DIA }, (_, h) => {
    const o = celdas.reduce((a, fila) => a + fila[h].ocup, 0)
    const dd = celdas.reduce((a, fila) => a + fila[h].disp, 0)
    return { hora: ABRE + h, pct: pct(o, dd) }
  })
  return {
    pct: pct(ocup, disp),
    horasOcupadas: horas(ocup),
    horasPosibles: horas(disp),
    horasCelebradas: horas(celebradas),
    horasFuturas: horas(futuras),
    celdas: celdas.map((fila, i) => fila.map((c, h) => ({
      dia: DIAS_SEMANA[i], hora: ABRE + h, pct: c.disp > 0 ? pct(c.ocup, c.disp) : null, bloqueada: c.disp === 0 && c.dias > 0,
      diasConUso: null, dias: c.dias,
    }))),
    porDia,
    porHora,
  }
}

// «Lo más reservado: sábados de 10 a 14 h (82 %). Lo más libre: lunes por la mañana (5 %).»
function fraseOcupacion(o) {
  let max = null
  for (const fila of o.celdas) for (const c of fila) if (c.pct !== null && (!max || c.pct > max.pct)) max = c
  if (!max || !max.pct) return null
  const fila = o.celdas[DIAS_SEMANA.indexOf(max.dia)]
  let i0 = max.hora - ABRE
  let i1 = i0
  while (i0 > 0 && fila[i0 - 1].pct !== null && fila[i0 - 1].pct >= max.pct * 0.75) i0--
  while (i1 < HORAS_DIA - 1 && fila[i1 + 1].pct !== null && fila[i1 + 1].pct >= max.pct * 0.75) i1++
  const bloques = [['por la mañana', 9, 14], ['por la tarde', 14, 18], ['por la noche', 18, 22]]
  let min = null
  o.celdas.forEach((f, d) => {
    for (const [nombre, a, b] of bloques) {
      const cs = f.slice(a - ABRE, b - ABRE).filter((c) => c.pct !== null)
      if (!cs.length) continue
      const p = Math.round(cs.reduce((x, c) => x + c.pct, 0) / cs.length)
      if (!min || p < min.pct) min = { dia: d, nombre, pct: p }
    }
  })
  const punta = `Lo más reservado: ${DIAS_LARGOS[DIAS_SEMANA.indexOf(max.dia)]} de ${ABRE + i0} a ${ABRE + i1 + 1} h (${max.pct} %).`
  return min ? `${punta} Lo más libre: ${DIAS_LARGOS[min.dia]} ${min.nombre} (${min.pct} %).` : punta
}

// ---------- Reservas del tramo ----------

const esPorHoras = (s) => ['web', 'manual', 'calendly'].includes(s.origen)

function resumenReservas(lista, desde, hasta) {
  const dentro = lista.filter((s) => s.fecha >= desde && s.fecha < hasta)
  const horas = dentro.filter(esPorHoras)
  const plan = dentro.filter((s) => s.origen === 'plan')
  const suma = (xs) => xs.reduce((a, s) => a + s.duracion, 0)
  const DUR = [2, 3, 4, 6, 8, 10]
  const porDuracion = DUR.map((d) => {
    const xs = horas.filter((s) => Math.abs(s.duracion - d) < 0.01)
    return { etiqueta: `${d} h`, n: xs.length, horas: suma(xs), finde: xs.filter((s) => s.tipo_dia === 'finde').length }
  })
  const otras = horas.filter((s) => !DUR.some((d) => Math.abs(s.duracion - d) < 0.01))
  if (otras.length) porDuracion.push({ etiqueta: 'Otras', n: otras.length, horas: suma(otras), finde: otras.filter((s) => s.tipo_dia === 'finde').length })
  const hayCalendly = dentro.some((s) => s.origen === 'calendly')
  const llegada = [
    { id: 'web', texto: hayCalendly ? 'Web (incluye Calendly)' : 'Web', xs: dentro.filter((s) => s.origen === 'web' || s.origen === 'calendly') },
    { id: 'manual', texto: 'Apuntadas a mano', xs: dentro.filter((s) => s.origen === 'manual') },
    { id: 'plan', texto: 'Suscripción', xs: plan },
  ].map(({ xs, ...r }) => ({ ...r, n: xs.length, horas: suma(xs) }))
  return {
    porHoras: { n: horas.length, horas: suma(horas) },
    plan: { n: plan.length, horas: suma(plan) },
    porDuracion,
    llegada,
    total: dentro.length,
  }
}

// ---------- Inicio ----------

export async function datosInicio({ periodo, comparar = 'anterior' }, { ahora = new Date() } = {}) {
  const hoy = fechaMadrid(ahora)
  const tramo = tramoDe(periodo, hoy)
  const comp = tramoComparado(periodo, tramo, comparar)
  const base = await FIN.datosDelPeriodo(periodo, { hoy })
  const aj = base.aj

  // Dinero del tramo y del comparado (los fijos del mes cuentan desde el día 1)
  const actual = await FIN.movimientosYGastos(tramo.desde, tramo.enCurso ? periodo.hasta : tramo.hasta, { hoy })
  const movsTramo = actual.movimientos.filter((m) => m.fecha < tramo.hasta)
  const rAct = C.resumir({ movimientos: movsTramo, gastos: actual.gastos })
  let rComp = null
  let compEstado = 'no'
  if (comp) {
    const c = await FIN.movimientosYGastos(comp.desde, comp.hasta, { hoy })
    compEstado = c.sinDatos ? 'sin_datos' : c.incompleto ? 'incompleta' : 'ok'
    rComp = c.sinDatos ? null : C.resumir({ movimientos: c.movimientos, gastos: c.gastos })
  }

  // Sesiones: de los 12 meses del gráfico, el tramo comparado y los últimos 3 meses (mapa de calor)
  const meses = base.meses
  const ini = [C.primerDia(meses[0]), comp?.desde || periodo.desde, sumarMeses(C.primerDia(C.mesDe(hoy)), -2, 1), periodo.desde].sort()[0]
  const fin = [C.primerDia(C.sumarMesesMes(meses.at(-1), 1)), periodo.hasta, sumarDias(hoy, 31)].sort().at(-1)
  const ses = await sesiones(ini, fin)
  const bloq = await bloqueos(ini, fin)
  const ocupTramo = ocupacionDe(ses, bloq, tramo.desde, tramo.hasta, ahora)
  const ocupPeriodo = ocupacionDe(ses, bloq, periodo.desde, periodo.hasta, ahora)
  const ocupComp = comp ? ocupacionDe(ses, bloq, comp.desde, comp.hasta, ahora) : null
  const ultimos3 = { desde: sumarMeses(C.primerDia(C.mesDe(hoy)), -2, 1), hasta: sumarDias(hoy, 1) }
  const ocup3 = ocupacionDe(ses, bloq, ultimos3.desde, ultimos3.hasta, ahora)
  const resTramo = resumenReservas(ses, tramo.desde, tramo.hasta)
  const resComp = comp ? resumenReservas(ses, comp.desde, comp.hasta) : null
  const futurasPeriodo = tramo.enCurso ? resumenReservas(ses, tramo.hasta, periodo.hasta) : null

  // Gráfico de 12 meses (con la ocupación de cada mes)
  const grafico = C.porMeses({ movimientos: base.todos.movimientos, gastos: base.todos.gastos, meses, hoy, desde: aj.desde, mesesSinCalendly: base.faltan })
    .map((m) => {
      const d = C.primerDia(m.mes)
      const h = m.estado === 'en_curso' ? sumarDias(hoy, 1) : C.primerDia(C.sumarMesesMes(m.mes, 1))
      return { ...m, ocupacionPct: m.estado === 'futuro' ? null : ocupacionDe(ses, bloq, d, h, ahora).pct, elegido: periodo.meses.includes(m.mes) }
    })

  // Cómo va el periodo: acumulado por día (o por mes en el año)
  const evolucion = acumulados({ periodo, tramo, hoy, movimientos: base.todos.movimientos, gastos: base.todos.gastos })
  let evolucionComp = null
  if (comp) {
    const compCompleto = { desde: comp.desde, hasta: sumarMeses(periodo.hasta, -(comparar === 'anio' ? 12 : mesesDelTipo[periodo.tipo]), 1) }
    const c = await FIN.movimientosYGastos(compCompleto.desde, compCompleto.hasta, { hoy })
    if (!c.sinDatos) evolucionComp = acumulados({ periodo: { ...periodo, desde: compCompleto.desde, hasta: compCompleto.hasta, contieneHoy: false }, tramo: { ...compCompleto, enCurso: false }, hoy, movimientos: c.movimientos, gastos: c.gastos }).puntos.map((p) => p.ingresosCent)
  }

  // Suscripciones
  const subs = await listarSuscripciones({ vista: 'activas', ahora })
  const { rows: altas } = await query(`SELECT count(*)::int AS n FROM suscripciones WHERE fecha_inicio >= $1::date AND fecha_inicio < $2::date`, [tramo.desde, tramo.hasta])
  const { rows: bajas } = await query(`SELECT count(*)::int AS n FROM suscripciones WHERE ultimo_dia >= $1::date AND ultimo_dia < $2::date`, [tramo.desde, tramo.hasta])
  const { rows: cuotasMes } = await query(
    `SELECT coalesce(sum(cuota_cent), 0)::int AS c FROM suscripciones WHERE fecha_inicio <= $1::date AND (ultimo_dia IS NULL OR ultimo_dia >= $1::date)`,
    [hoy]
  )
  const activos = subs.filas.filter((f) => f.estado !== 'por_empezar')

  // Hoy y lo que viene
  const hoyIni = madridAInstante(hoy, '00:00')
  const lista = (await listarReservas({ desde: hoyIni, hasta: madridAInstante(sumarDias(hoy, 60), '00:00'), estados: ['pendiente', 'confirmada', 'conflicto'] })).map(vistaAdmin)
  const deHoy = lista.filter((r) => r.fecha === hoy)
  const manana = lista.filter((r) => r.fecha === sumarDias(hoy, 1))
  const proxima = lista.find((r) => r.fecha > hoy) || null
  const ocupHoy = ocupacionDe(ses.filter((s) => s.fecha === hoy), bloq, hoy, sumarDias(hoy, 1), ahora)

  // Para hacer: avisos de finanzas, de suscripciones, cobros pendientes y configuración
  const sinCobrarReservas = base.sinCobrar.reservas
  const cuotasTareas = subs.tareas.filter((t) => t.tipo === 'cuota')
  const paraHacer = [
    ...(cuotasTareas.length > 2
      ? [{ nivel: cuotasTareas.some((t) => t.urgente) ? 'error' : 'aviso', chip: 'Sin pagar', texto: `${cuotasTareas.length} cuotas sin pagar · ${C.euros(base.sinCobrar.cuotas.reduce((a, x) => a + x.totalCent, 0))}`, enlace: '/admin/suscripciones?vista=sin_pagar' }]
      : cuotasTareas.map((t) => ({ nivel: t.urgente ? 'error' : 'aviso', chip: t.urgente ? 'Atrasada' : 'Sin pagar', texto: t.texto, enlace: `/admin/suscripciones/${t.suscripcionId}` }))),
    ...subs.tareas.filter((t) => t.tipo !== 'cuota').map((t) => ({ nivel: t.urgente ? 'error' : 'aviso', chip: 'Suscripción', texto: t.texto, enlace: `/admin/suscripciones/${t.suscripcionId}` })),
    ...(sinCobrarReservas.length ? [{ nivel: 'aviso', chip: 'Sin cobrar', texto: sinCobrarReservas.length === 1 ? '1 reserva ya hecha y sin cobrar' : `${sinCobrarReservas.length} reservas ya hechas y sin cobrar`, enlace: '/admin/finanzas/ingresos#sin-cobrar' }] : []),
    ...base.revisar.map((a) => ({ nivel: a.urgente ? 'error' : 'aviso', chip: a.urgente ? 'Revisar' : 'Aviso', texto: a.texto, enlace: a.enlace })),
    ...avisosDeConfiguracion().map((t) => ({ nivel: 'info', chip: 'Configurar', texto: t, enlace: null })),
  ].sort((a, b) => ['error', 'aviso', 'info'].indexOf(a.nivel) - ['error', 'aviso', 'info'].indexOf(b.nivel))

  // IVA del trimestre (el que contiene el periodo, o los cuatro del año)
  const iva = base.trimestres.map((t) => C.ivaDelTrimestre({
    movimientos: base.todos.movimientos, gastos: base.todos.gastos, trimestre: t, sinCobrar: base.sinCobrar, mesesSinCalendly: base.faltan, desde: aj.desde, hoy,
  }))

  const cascada = (r) => r && {
    cobradoCent: r.porFuente.reduce((a, f) => a + f.baseCent, 0),
    devolucionesCent: r.devoluciones.baseCent,
    ingresosCent: r.facturacion.baseCent,
    fijosCent: r.porGrupo.find((g) => g.grupo === 'fijo')?.costeCent || 0,
    variablesCent: r.porGrupo.find((g) => g.grupo === 'variable')?.costeCent || 0,
    materialCent: r.porGrupo.find((g) => g.grupo === 'material')?.costeCent || 0,
    beneficioCent: r.beneficioCent,
    gastosN: r.gastos.n,
  }

  return {
    hoy,
    actualizado: horaMadrid(ahora),
    desdeDatos: aj.desde,
    periodo: {
      clave: periodo.clave, tipo: periodo.tipo, texto: periodo.texto, contieneHoy: periodo.contieneHoy, anterior: periodo.anterior,
      siguiente: periodo.siguiente, meses: periodo.meses, desde: periodo.desde, hasta: periodo.hasta,
      antesDeDatos: periodo.hasta <= C.primerDia(aj.desde),
    },
    comparar,
    tramo: { ...tramo, texto: textoTramo(tramo, periodo) },
    comparado: comp ? { ...comp, texto: textoTramo(comp, periodo), estado: compEstado } : null,
    kpis: {
      ingresos: { actual: rAct.facturacion.baseCent, comp: rComp?.facturacion.baseCent ?? null, conIvaCent: rAct.facturacion.totalCent },
      gastos: { actual: rAct.gastos.costeCent, comp: rComp?.gastos.costeCent ?? null, fijosCent: rAct.porGrupo[0].costeCent, n: rAct.gastos.n },
      beneficio: { actual: rAct.beneficioCent, comp: rComp ? rComp.beneficioCent : null, deCada100: rAct.deCada100, ingresos: rAct.facturacion.baseCent },
      ocupacion: {
        actual: ocupTramo.pct, comp: ocupComp?.pct ?? null, horas: ocupTramo.horasOcupadas, posibles: ocupTramo.horasPosibles,
        futurasPeriodo: futurasPeriodo ? futurasPeriodo.porHoras.horas + futurasPeriodo.plan.horas : null,
      },
    },
    apoyo: {
      porHoras: { ...resTramo.porHoras, comp: resComp?.porHoras.n ?? null },
      plan: { ...resTramo.plan, comp: resComp?.plan.n ?? null },
      miembros: { n: activos.length, altas: altas[0].n, bajas: bajas[0].n },
      cuotasSinPagar: { n: base.sinCobrar.cuotas.length, totalCent: base.sinCobrar.cuotas.reduce((a, x) => a + x.totalCent, 0) },
    },
    grafico,
    evolucion: { ...evolucion, comparacion: evolucionComp },
    cascada: { actual: cascada(rAct), comp: cascada(rComp) },
    fuentes: rAct.porFuente.map((f) => ({ ...f, comp: rComp ? rComp.porFuente.find((x) => x.fuente === f.fuente)?.baseCent || 0 : null })),
    devoluciones: rAct.devoluciones,
    grupos: rAct.porGrupo.map((g) => {
      const top = g.categorias.slice(0, 4)
      const resto = g.categorias.slice(4)
      return {
        grupo: g.grupo, texto: g.texto, costeCent: g.costeCent,
        comp: rComp ? rComp.porGrupo.find((x) => x.grupo === g.grupo)?.costeCent || 0 : null,
        categorias: [...top, ...(resto.length ? [{ id: null, nombre: `Otros (${resto.length})`, costeCent: resto.reduce((a, c) => a + c.costeCent, 0) }] : [])],
      }
    }),
    ocupacion: {
      tramo: { pct: ocupTramo.pct, horas: ocupTramo.horasOcupadas, posibles: ocupTramo.horasPosibles },
      periodo: { celebradas: ocupPeriodo.horasCelebradas, futuras: ocupPeriodo.horasFuturas, posibles: ocupPeriodo.horasPosibles, pct: ocupPeriodo.pct },
      meses: grafico.slice(-6).map((m) => ({ mes: m.mes, corto: m.corto, pct: m.ocupacionPct, actual: m.mes === C.mesDe(hoy) })),
      mapa: { tramo: ocupTramo.celdas, tresMeses: ocup3.celdas },
      porDia: { tramo: ocupTramo.porDia, tresMeses: ocup3.porDia },
      porHora: { tramo: ocupTramo.porHora, tresMeses: ocup3.porHora },
      frase: { tramo: fraseOcupacion(ocupTramo), tresMeses: fraseOcupacion(ocup3) },
      pocas: resTramo.total < 10,
    },
    reservas: resTramo,
    suscripciones: {
      n: activos.length, altas: altas[0].n, bajas: bajas[0].n, cuotasMesCent: Math.round((cuotasMes[0].c * 100) / 121),
      usadas: activos.reduce((a, f) => a + (f.horas - f.restantes), 0), incluidas: activos.reduce((a, f) => a + f.horas, 0),
      lista: activos.slice(0, 5).map((f) => ({ id: f.id, nombre: f.nombre, planNombre: f.planNombre, horas: f.horas, usadas: f.horas - f.restantes, cuota: f.cuota })),
    },
    iva,
    proximosFijos: await FIN.proximosFijos({ hoy }),
    hoyBloque: {
      texto: textoFecha(hoy),
      reservas: deHoy.slice(0, 3).map((r) => ({ id: r.id, horaInicio: r.horaInicio, horaFin: r.horaFin, nombre: `${r.nombre} ${r.apellidos || ''}`.trim(), duracionTexto: r.duracionTexto, estado: r.estado, pagoEstado: r.pagoEstado, esPlan: r.esPlan, planTexto: r.planTexto, cuentaComoUsada: r.cuentaComoUsada, hecha: new Date(madridAInstante(hoy, r.horaFin)).getTime() < ahora.getTime() })),
      n: deHoy.length,
      horas: deHoy.reduce((a, r) => a + r.duracionHoras, 0),
      ocupacionPct: ocupHoy.pct,
      manana: manana.length ? { n: manana.length, primera: manana[0].horaInicio } : null,
      proxima: proxima ? { fecha: proxima.fecha, fechaTexto: proxima.fechaTexto, hora: proxima.horaInicio, nombre: proxima.nombre, duracionTexto: proxima.duracionTexto } : null,
    },
    paraHacer,
  }
}

// Ingresos y gastos acumulados del periodo, por día (o por mes en la vista de año)
function acumulados({ periodo, tramo, hoy, movimientos, gastos }) {
  const porMes = periodo.tipo === 'anio'
  const claves = []
  if (porMes) for (let m = C.mesDe(periodo.desde); C.primerDia(m) < periodo.hasta; m = C.sumarMesesMes(m, 1)) claves.push(m)
  else for (let f = periodo.desde; f < periodo.hasta; f = sumarDias(f, 1)) claves.push(f)
  const corte = tramo.enCurso ? (porMes ? C.mesDe(hoy) : hoy) : null
  const ing = new Map()
  const gas = new Map()
  const k = (f) => (porMes ? C.mesDe(f) : f)
  for (const m of movimientos) {
    if (m.fecha < periodo.desde || m.fecha >= periodo.hasta) continue
    ing.set(k(m.fecha), (ing.get(k(m.fecha)) || 0) + (m.sentido === 'cobro' ? 1 : -1) * m.baseCent)
  }
  for (const g of gastos) {
    if (g.estado !== 'apuntado') continue
    // Los fijos cuentan desde el día 1 de su mes
    const f = g.mes || g.fecha
    if (f < periodo.desde || f >= periodo.hasta) continue
    gas.set(k(f), (gas.get(k(f)) || 0) + C.costeGasto(g))
  }
  let ai = 0
  let ag = 0
  let cruce = null
  const puntos = []
  for (const c of claves) {
    const futuro = corte && c > corte
    ai += ing.get(c) || 0
    ag += gas.get(c) || 0
    if (!futuro && cruce === null && ag > 0 && ai >= ag) cruce = c
    puntos.push({ clave: c, ingresosCent: futuro ? null : ai, gastosCent: futuro ? null : ag })
  }
  const ultimo = [...puntos].reverse().find((p) => p.ingresosCent !== null) || { ingresosCent: 0, gastosCent: 0 }
  return { porMes, puntos, cruce, ingresosCent: ultimo.ingresosCent, gastosCent: ultimo.gastosCent }
}
