// Datos de las vistas de Reservas (Calendario, Lista, Clientes). SOLO SERVIDOR: lo usan los
// getServerSideProps de pages/admin/reservas/* (y la muestra local). No importar desde componentes.
import { listarReservas, listarBloqueos, buscarReservas, festivos as leerFestivos } from '../../../lib/reservas/servicio'
import { vistaAdmin } from '../../../lib/admin/vista'
import { listarClientes, fichaCliente, vecesDeReservas } from '../../../lib/reservas/clientes'
import { claveValida, textoVez } from '../../../lib/reservas/clientes-vista'
import { madridAInstante, fechaMadrid, horaMadrid, sumarDias, diaSemana, minutosDeHora, esFecha } from '../../../lib/reservas/tiempo'
import { HORARIO, textoDuracion, formatoEuros } from '../../../lib/reservas/config'
import { avisosDeConfiguracion } from '../../../lib/admin/configuracion'
import { urlBase } from '../../../lib/http'
import { query } from '../../../lib/db/index'
import { estadoReserva } from './comun'
import { ESTADOS_LISTA, TIPOS_LISTA } from './VistaLista'
import { PERIODOS, TIPOS, ORDENES } from './VistaClientes'

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const ABRE = Math.min(minutosDeHora(HORARIO.laborable.abre), minutosDeHora(HORARIO.finde.abre))
const CIERRA = Math.max(minutosDeHora(HORARIO.laborable.cierra), minutosDeHora(HORARIO.finde.cierra))

// ---------- Calendario ----------
function lunesDe(fecha) {
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7))
}

// Trozo de un intervalo [inicio, fin) que cae en el día `fecha`, recortado al horario
function trozoDelDia(fecha, inicio, fin) {
  const ini = Math.max(inicio.getTime(), madridAInstante(fecha, '00:00').getTime())
  const finDia = madridAInstante(sumarDias(fecha, 1), '00:00').getTime()
  const fn = Math.min(fin.getTime(), finDia)
  if (fn <= ini) return null
  const minutos = (t) => minutosDeHora(horaMadrid(new Date(t)))
  const desde = Math.max(minutos(ini), ABRE)
  const hasta = fn === finDia ? CIERRA : Math.min(minutos(fn), CIERRA)
  if (hasta <= desde) return null
  return { desde, hasta, ini: horaMadrid(new Date(ini)), fin: fn === finDia ? '24:00' : horaMadrid(new Date(fn)) }
}


export async function cargarCalendario(consulta) {
  const hoy = fechaMadrid(new Date())
  const pedida = typeof consulta.semana === 'string' && esFecha(consulta.semana) ? consulta.semana : hoy
  const lunes = lunesDe(pedida)
  const desde = madridAInstante(lunes, '00:00')
  const hasta = madridAInstante(sumarDias(lunes, 7), '00:00')

  const [reservas, bloqueos, fest] = await Promise.all([
    listarReservas({ desde: madridAInstante(sumarDias(lunes, -1), '00:00'), hasta, estados: ['pendiente', 'confirmada', 'conflicto'] }),
    listarBloqueos({ desde }),
    leerFestivos(),
  ])

  const dias = []
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i)
    const eventos = []
    for (const r of reservas) {
      const t = trozoDelDia(fecha, r.inicio, r.fin)
      if (!t) continue
      const esPlan = r.origen === 'plan'
      const sinPagar = r.estado === 'pendiente' || (r.pagoEstado === 'pendiente' && r.precioCent > 0)
      const tipo = r.estado === 'conflicto' ? 'revisar' : sinPagar ? 'sinpagar' : esPlan ? 'plan' : 'horas'
      const quien = `${r.nombre} ${r.apellidos}`.trim()
      const sub = r.estado === 'conflicto' ? 'Revisar pago'
        : r.estado === 'pendiente' ? 'Esperando pago'
        : sinPagar ? 'Sin pagar'
        : esPlan ? (r.precioCent ? 'Sesión del plan · horas aparte' : 'Incluida en el plan')
        : `${r.actividad || 'Reserva'}${r.origen === 'calendly' ? ' · Calendly' : ''}`
      eventos.push({
        clave: `r${r.id}`, tipo, titulo: quien, sub, href: `/admin/reserva/${r.id}`,
        ini: t.ini, fin: t.fin, desdeMin: t.desde - ABRE, duracionMin: t.hasta - t.desde,
        duracion: textoDuracion(r.duracionHoras, { corto: true }),
      })
    }
    for (const b of bloqueos) {
      if (b.inicio >= hasta) continue
      const t = trozoDelDia(fecha, b.inicio, b.fin)
      if (!t) continue
      eventos.push({
        clave: `b${b.id}-${fecha}`, tipo: 'bloqueo', titulo: 'Bloqueado', sub: b.motivo || 'No se puede reservar', href: null,
        ini: t.ini, fin: t.fin, desdeMin: t.desde - ABRE, duracionMin: t.hasta - t.desde,
      })
    }
    eventos.sort((a, b) => a.desdeMin - b.desdeMin)
    const [, , d] = fecha.split('-').map(Number)
    dias.push({ fecha, nombre: DIAS_CORTOS[diaSemana(fecha)], numero: d, festivo: fest.has(fecha), eventos })
  }

  const horas = []
  for (let m = ABRE; m <= CIERRA; m += 60) horas.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`)

  return {
      semana: lunes,
      dias,
      hoy,
      horas,
      anterior: `/admin/reservas?semana=${sumarDias(lunes, -7)}`,
      siguiente: `/admin/reservas?semana=${sumarDias(lunes, 7)}`,
      avisos: avisosDeConfiguracion(),
      hayEventos: dias.some((d) => d.eventos.length > 0),
  }
}

// ---------- Lista ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const ESTADOS_DE = {
  proximas: ['pendiente', 'confirmada', 'conflicto'],
  sin_pagar: ['pendiente', 'confirmada', 'conflicto'],
  revisar: ['conflicto'],
  pasadas: ['confirmada', 'conflicto'],
  canceladas: ['cancelada'],
  todas: ['pendiente', 'confirmada', 'conflicto', 'cancelada'],
}

export async function cargarLista(consulta, req) {
  const texto = (v) => (typeof v === 'string' ? v.trim() : '')
  const hoy = fechaMadrid(new Date())
  const ahora = new Date()
  const filtros = {
    q: texto(consulta.q).slice(0, 80),
    mes: /^\d{4}-\d{2}$/.test(texto(consulta.mes)) ? texto(consulta.mes) : 'todos',
    estado: ESTADOS_LISTA.some(([v]) => v === consulta.estado) ? consulta.estado : 'proximas',
    tipo: TIPOS_LISTA.some(([v]) => v === consulta.tipo) ? consulta.tipo : 'todas',
  }

  // Meses para el filtro: del año pasado a tres meses vista
  const meses = []
  let m = `${Number(hoy.slice(0, 4)) - 1}-${hoy.slice(5, 7)}`
  const ultimo = sumarDias(`${hoy.slice(0, 7)}-01`, 100).slice(0, 7)
  while (m <= ultimo) {
    const [y, mm] = m.split('-').map(Number)
    meses.unshift({ valor: m, texto: `${MESES[mm - 1].charAt(0).toUpperCase()}${MESES[mm - 1].slice(1)} ${y}` })
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
  }

  // Lo que hay que leer de la base de datos
  const estados = ESTADOS_DE[filtros.estado]
  let lista
  if (filtros.q) {
    lista = (await buscarReservas(filtros.q, 300)).filter((r) => estados.includes(r.estado) || filtros.estado === 'todas')
  } else {
    let desde
    let hasta
    if (filtros.mes !== 'todos') {
      desde = madridAInstante(`${filtros.mes}-01`, '00:00')
      hasta = madridAInstante(`${sumarDias(`${filtros.mes}-01`, 32).slice(0, 7)}-01`, '00:00')
    } else if (filtros.estado === 'proximas' || filtros.estado === 'sin_pagar' || filtros.estado === 'revisar') {
      desde = filtros.estado === 'proximas' ? madridAInstante(hoy, '00:00') : madridAInstante(sumarDias(hoy, -365), '00:00')
      hasta = madridAInstante(sumarDias(hoy, 400), '00:00')
    } else if (filtros.estado === 'pasadas') {
      desde = madridAInstante(sumarDias(hoy, -365), '00:00')
      hasta = ahora
    } else {
      desde = madridAInstante(sumarDias(hoy, -365), '00:00')
      hasta = madridAInstante(sumarDias(hoy, 400), '00:00')
    }
    lista = await listarReservas({ desde, hasta, estados })
  }
  lista = lista.filter((r) => {
    if (filtros.mes !== 'todos' && fechaMadrid(r.inicio).slice(0, 7) !== filtros.mes) return false
    if (filtros.estado === 'proximas' && r.fin.getTime() < ahora.getTime()) return false
    if (filtros.estado === 'pasadas' && r.fin.getTime() >= ahora.getTime()) return false
    if (filtros.estado === 'sin_pagar' && !(r.estado === 'conflicto' || r.estado === 'pendiente' || (r.pagoEstado === 'pendiente' && r.precioCent > 0))) return false
    if (filtros.tipo === 'horas' && !['web', 'manual'].includes(r.origen)) return false
    if (filtros.tipo === 'plan' && r.origen !== 'plan') return false
    if (filtros.tipo === 'calendly' && r.origen !== 'calendly') return false
    return true
  })
  // Próximas, de la más cercana a la más lejana; el resto, de la más reciente a la más antigua
  lista.sort((a, b) => (filtros.estado === 'proximas' ? a.inicio - b.inicio : b.inicio - a.inicio))
  lista = lista.slice(0, 300)

  const ids = lista.map((r) => r.id)
  const [veces, facturas] = await Promise.all([
    vecesDeReservas(ids),
    ids.length
      ? query('SELECT reserva_id, codigo, tipo FROM facturas WHERE reserva_id = ANY($1) AND sustituida_en IS NULL', [ids]).then((x) => new Map(x.rows.map((f) => [f.reserva_id, { codigo: f.codigo, tipo: f.tipo }])))
      : new Map(),
  ])

  const anio = hoy.slice(0, 4)
  const filas = lista.map((r) => {
    const v = vistaAdmin(r)
    const vez = veces.get(r.id)
    return {
      id: v.id, codigo: v.codigo, origen: v.origen, estado: v.estado, pagoEstado: v.pagoEstado, fecha: v.fecha,
      anioDistinto: v.fecha.slice(0, 4) !== anio, horaInicio: v.horaInicio, horaFin: v.horaFin, duracionTexto: v.duracionTexto,
      nombre: v.nombre, apellidos: v.apellidos, actividad: v.actividad, esPlan: v.esPlan, planTexto: v.planTexto,
      precioCent: v.precioCent, importe: v.importe, facturaInfo: facturas.get(r.id) || null,
      vez: vez && vez.vez && !v.esPlan ? textoVez(vez.vez) : null,
    }
  })
  const cobradoCent = lista.reduce((s, r) => s + (['pagado', 'reembolsado', 'reembolsado_parcial'].includes(r.pagoEstado) ? r.precioCent - (r.reembolsoCent || 0) : 0), 0)
  const totales = {
    reservas: lista.filter((r) => r.estado !== 'cancelada').length,
    horas: lista.filter((r) => r.estado !== 'cancelada').reduce((s, r) => s + r.duracionHoras, 0),
    cobrado: formatoEuros(cobradoCent) || '0 €',
    sinPagar: lista.filter((r) => r.estado !== 'cancelada' && estadoReserva({ ...r, esPlan: r.origen === 'plan' })[0] === 'Sin pagar').length,
  }

  const token = process.env.CALENDARIO_TOKEN
  return {
      filtros,
      meses,
      filas,
      totales,
      calendario: token && token.length >= 24 ? `${urlBase(req)}/api/admin/calendario?clave=${token}` : null,
  }
}

// ---------- Clientes ----------
export async function cargarClientes(consulta) {
  const ahora = new Date()
  const hoy = fechaMadrid(ahora)
  const val = (lista, v, def) => (lista.some(([k]) => k === v) ? v : def)
  const inicial = {
    q: typeof consulta.q === 'string' ? consulta.q.slice(0, 80) : '',
    periodo: val(PERIODOS, consulta.periodo, 'todo'),
    tipo: val(TIPOS, consulta.tipo, 'todos'),
    orden: val(ORDENES, consulta.orden, 'reservas'),
  }
  const clave = typeof consulta.c === 'string' && claveValida(consulta.c) ? consulta.c : null
  const [{ clientes }, ficha] = await Promise.all([listarClientes({ ahora }), clave ? fichaCliente(clave, { ahora }) : null])
  return { clientes, ficha, hoy, anio: hoy.slice(0, 4), inicial }
}
