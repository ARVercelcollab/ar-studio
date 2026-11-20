// Clientes del estudio: cada persona que ha reservado alguna vez, con todas sus reservas.
//
// No hay tabla de clientes: se juntan las reservas por la misma persona. La clave es el correo
// (en minúsculas y sin espacios) y, si la reserva no tiene correo, las 9 últimas cifras del
// teléfono. Entran las reservas web, las del panel, las sesiones de los miembros y las de
// Calendly pasadas a la agenda. Las que se quedaron sin pagar (pendientes o caducadas) no cuentan:
// esa persona no llegó a reservar.
//
// Lo único que se guarda aparte son las notas del estudio sobre cada cliente (tabla
// clientes_notas, migración 14), con la misma clave.

import { query } from '../db/index.js'
import { madridAInstante, fechaMadrid, sumarDias } from './tiempo.js'
import { FONDOS, EQUIPO } from './config.js'
import { ErrorReserva } from './servicio.js'
import { claveCliente, claveValida, cifrasDeClientes } from './clientes-vista.js'

// Lo que no toca la base de datos está en clientes-vista.js (lo usan también las páginas)
export { claveCliente, claveValida, cifrasDeClientes, filtrarClientes, textoVez } from './clientes-vista.js'

// La misma clave en SQL y en JavaScript (tienen que coincidir siempre)
const CIFRAS_TEL = `regexp_replace(coalesce(r.telefono, ''), '[^0-9]', '', 'g')`
export const SQL_CLAVE = `CASE
  WHEN btrim(coalesce(r.email, '')) <> '' THEN 'e:' || lower(btrim(r.email))
  WHEN length(${CIFRAS_TEL}) >= 6 THEN 't:' || right(${CIFRAS_TEL}, 9)
END`

// Reservas que cuentan (las que han usado o van a usar el estudio) y las que salen en el historial
const CUENTAN = `r.estado IN ('confirmada', 'conflicto')`
const EN_HISTORIAL = `r.estado IN ('confirmada', 'conflicto', 'cancelada')`
// Lo que ha pagado de verdad (lo devuelto se resta). Las reservas importadas del CSV de Calendly
// (externo_ref) no suman: su dinero está en Stripe y en Calendly por meses, y su importe puede ser
// estimado. Sí cuentan como reservas y horas.
const PAGADO = `CASE WHEN r.pago_estado IN ('pagado', 'reembolsado', 'reembolsado_parcial') AND r.externo_ref IS NULL
  THEN r.precio_cent - coalesce(r.reembolso_cent, 0) ELSE 0 END`
const importada = (r) => Boolean(r.externo_ref)

function limites(ahora) {
  const hoy = fechaMadrid(ahora)
  const anio = hoy.slice(0, 4)
  const mes = hoy.slice(0, 7)
  const sigMes = sumarDias(`${mes}-01`, 32).slice(0, 7)
  return {
    hoy,
    anioIni: madridAInstante(`${anio}-01-01`, '00:00'),
    anioFin: madridAInstante(`${Number(anio) + 1}-01-01`, '00:00'),
    mesIni: madridAInstante(`${mes}-01`, '00:00'),
    mesFin: madridAInstante(`${sigMes}-01`, '00:00'),
  }
}

const iso = (d) => (d ? new Date(d).toISOString() : null)
const PLAN_NOMBRE = { starter: 'Starter', creator: 'Creator', pro: 'Pro' }

// Miembros (suscripciones que no han terminado) por clave de cliente
async function miembrosPorClave(hoy, claves = null) {
  const { rows } = await query(
    `SELECT id, codigo, plan, nombre, apellidos, email, telefono, fecha_inicio::text AS fecha_inicio
       FROM suscripciones WHERE ultimo_dia IS NULL OR ultimo_dia >= $1 ORDER BY fecha_inicio DESC, id DESC`,
    [hoy]
  )
  const mapa = new Map()
  for (const s of rows) {
    const clave = claveCliente(s)
    if (!clave || (claves && !claves.has(clave)) || mapa.has(clave)) continue
    mapa.set(clave, {
      id: s.id, codigo: s.codigo, plan: s.plan, planNombre: PLAN_NOMBRE[s.plan] || s.plan,
      nombre: s.nombre, apellidos: s.apellidos, email: s.email, telefono: s.telefono, desde: s.fecha_inicio,
    })
  }
  return mapa
}

// Cuotas pagadas de los planes, por correo (lo que han pagado como miembros)
async function cuotasPorClave() {
  const { rows } = await query(
    `SELECT lower(btrim(s.email)) AS email, count(*)::int AS n, coalesce(sum(c.importe_cent), 0)::int AS cent
       FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE c.estado = 'pagada' GROUP BY 1`
  )
  return new Map(rows.map((x) => [`e:${x.email}`, { n: x.n, cent: x.cent }]))
}

// Lista de clientes con sus cifras. Se filtra y se ordena en la página (son pocos cientos).
export async function listarClientes({ ahora = new Date() } = {}) {
  const L = limites(ahora)
  const { rows } = await query(
    `WITH r AS (
       SELECT ${SQL_CLAVE} AS clave, r.* FROM reservas r WHERE ${EN_HISTORIAL}
     ), datos AS (
       SELECT DISTINCT ON (clave) clave, nombre, apellidos, email, telefono
         FROM r WHERE clave IS NOT NULL ORDER BY clave, (r.estado <> 'cancelada') DESC, inicio DESC
     )
     SELECT a.*, d.nombre, d.apellidos, d.email, d.telefono FROM (
       SELECT clave,
         count(*) FILTER (WHERE ${CUENTAN})::int AS total,
         count(*) FILTER (WHERE ${CUENTAN} AND r.inicio >= $2 AND r.inicio < $3)::int AS anio,
         count(*) FILTER (WHERE r.estado = 'cancelada')::int AS canceladas,
         coalesce(sum(r.duracion_horas) FILTER (WHERE ${CUENTAN}), 0)::float AS horas,
         coalesce(sum(${PAGADO}), 0)::int AS pagado,
         min(r.inicio) FILTER (WHERE ${CUENTAN}) AS primera,
         max(r.inicio) FILTER (WHERE ${CUENTAN} AND r.inicio < $1) AS ultima,
         min(r.inicio) FILTER (WHERE ${CUENTAN} AND r.inicio >= $1) AS proxima,
         mode() WITHIN GROUP (ORDER BY r.actividad) FILTER (WHERE ${CUENTAN} AND r.origen <> 'plan' AND coalesce(r.actividad, '') <> '') AS actividad,
         count(*) FILTER (WHERE ${CUENTAN} AND r.origen = 'calendly')::int AS de_calendly,
         count(*) FILTER (WHERE ${CUENTAN} AND r.origen = 'plan')::int AS sesiones_plan
       FROM r WHERE clave IS NOT NULL GROUP BY clave
     ) a JOIN datos d USING (clave)`,
    [ahora, L.anioIni, L.anioFin]
  )
  const [miembros, cuotas] = await Promise.all([miembrosPorClave(L.hoy), cuotasPorClave()])
  const lista = rows.map((x) => {
    const cuota = cuotas.get(x.clave) || { n: 0, cent: 0 }
    return aCliente(x, miembros.get(x.clave) || null, cuota, L)
  })
  // Miembros que aún no han reservado nada: también son clientes
  const ya = new Set(lista.map((c) => c.clave))
  for (const [clave, m] of miembros) {
    if (ya.has(clave)) continue
    const cuota = cuotas.get(clave) || { n: 0, cent: 0 }
    lista.push(aCliente({
      clave, total: 0, anio: 0, canceladas: 0, horas: 0, pagado: 0, primera: null, ultima: null, proxima: null,
      actividad: null, de_calendly: 0, sesiones_plan: 0, nombre: m.nombre, apellidos: m.apellidos, email: m.email, telefono: m.telefono,
    }, m, cuota, L))
  }
  return { clientes: lista, cifras: cifrasDeClientes(lista) }
}

function aCliente(x, miembro, cuota, L) {
  const primera = iso(x.primera)
  // Nuevo: su primera reserva (o su alta de miembro, si aún no ha reservado) es de este mes
  const inicioCliente = primera || (miembro ? madridAInstante(miembro.desde, '00:00').toISOString() : null)
  const nuevo = Boolean(inicioCliente && inicioCliente >= L.mesIni.toISOString() && inicioCliente < L.mesFin.toISOString())
  return {
    clave: x.clave,
    nombre: x.nombre || '',
    apellidos: x.apellidos || '',
    email: x.email || '',
    telefono: x.telefono || '',
    total: x.total,
    anio: x.anio,
    canceladas: x.canceladas,
    horas: Number(x.horas) || 0,
    pagadoReservasCent: x.pagado,
    cuotas: cuota.n,
    pagadoCent: x.pagado + cuota.cent,
    primera,
    ultima: iso(x.ultima),
    proxima: iso(x.proxima),
    actividad: x.actividad || (x.sesiones_plan ? 'Sesión del plan' : null),
    deCalendly: x.de_calendly,
    repite: x.total >= 2,
    nuevo,
    miembro,
  }
}

// Ficha de un cliente: sus datos, cifras, lo que suele hacer y todas sus reservas
export async function fichaCliente(clave, { ahora = new Date() } = {}) {
  if (!claveValida(clave)) return null
  const L = limites(ahora)
  const { rows } = await query(
    `SELECT r.*, s.plan AS plan_suscripcion,
            (SELECT f.codigo FROM facturas f WHERE f.reserva_id = r.id AND f.sustituida_en IS NULL ORDER BY f.id DESC LIMIT 1) AS factura_codigo,
            (SELECT f.tipo FROM facturas f WHERE f.reserva_id = r.id AND f.sustituida_en IS NULL ORDER BY f.id DESC LIMIT 1) AS factura_tipo
       FROM reservas r LEFT JOIN suscripciones s ON s.id = r.suscripcion_id
      WHERE ${EN_HISTORIAL} AND ${SQL_CLAVE} = $1
        -- Con correo, el índice reservas_email_min_idx evita recorrer toda la tabla
        AND ($2::text IS NULL OR lower(btrim(r.email)) = $2)
      ORDER BY r.inicio`,
    [clave, clave.startsWith('e:') ? clave.slice(2) : null]
  )
  const miembros = await miembrosPorClave(L.hoy, new Set([clave]))
  const miembro = miembros.get(clave) || null
  if (!rows.length && !miembro) return null

  const cuotas = (await cuotasPorClave()).get(clave) || { n: 0, cent: 0 }
  const { rows: notas } = await query('SELECT notas, actualizado_en FROM clientes_notas WHERE clave = $1', [clave])

  const cuentan = rows.filter((r) => r.estado !== 'cancelada')
  const ahoraMs = ahora.getTime()
  const reservas = rows.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    origen: r.origen,
    estado: r.estado,
    pagoEstado: r.pago_estado,
    inicio: iso(r.inicio),
    fin: iso(r.fin),
    horas: Number(r.duracion_horas),
    actividad: r.origen === 'plan' ? 'Sesión del plan' : r.actividad || '',
    fondos: r.fondos && r.fondos !== 'no' ? (FONDOS.find((f) => f.id === r.fondos)?.texto || r.fondos).replace(/^Sí, /, '') : null,
    precioCent: r.precio_cent,
    pagadoCent: Number(r.pago_estado === 'pendiente' || importada(r) ? 0 : r.precio_cent - (r.reembolso_cent || 0)),
    importada: importada(r),
    incluida: r.origen === 'plan' && !r.precio_cent,
    plan: r.plan_suscripcion ? PLAN_NOMBRE[r.plan_suscripcion] : null,
    factura: r.factura_codigo ? { codigo: r.factura_codigo, tipo: r.factura_tipo } : null,
    futura: new Date(r.inicio).getTime() >= ahoraMs,
  }))

  // Lo que suele hacer: actividades, fondos y equipo, de más a menos veces
  const contar = (valores) => {
    const m = new Map()
    for (const v of valores) if (v) m.set(v, (m.get(v) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
  }
  const actividades = contar(cuentan.map((r) => (r.origen === 'plan' ? 'Sesión del plan' : r.actividad)))
  const fondos = contar(cuentan.map((r) => (r.fondos && r.fondos !== 'no' ? (FONDOS.find((f) => f.id === r.fondos)?.texto || r.fondos).replace(/^Sí, /, '') : null)))
  const equipo = contar(cuentan.flatMap((r) => (Array.isArray(r.equipo) ? r.equipo : []).map((id) => (EQUIPO.find((e) => e.id === id)?.texto || id).replace(/ \(.*\)$/, ''))))

  // Datos: los de su última reserva (o los de la suscripción si aún no ha reservado)
  const ultimaFila = [...rows].reverse().find((r) => r.estado !== 'cancelada') || rows.at(-1) || null
  const base = ultimaFila || miembro
  const factura = [...rows].reverse().find((r) => r.factura && r.factura.nif)?.factura || null

  const pagadoReservas = rows.reduce((s, r) => s + (['pagado', 'reembolsado', 'reembolsado_parcial'].includes(r.pago_estado) && !importada(r) ? r.precio_cent - (r.reembolso_cent || 0) : 0), 0)
  const pagadas = cuentan.filter((r) => r.origen !== 'plan' && r.pago_estado === 'pagado' && r.precio_cent > 0 && !importada(r))
  const primera = cuentan[0] ? iso(cuentan[0].inicio) : null
  const pasadas = cuentan.filter((r) => new Date(r.inicio).getTime() < ahoraMs)
  const anio = cuentan.filter((r) => new Date(r.inicio) >= L.anioIni && new Date(r.inicio) < L.anioFin).length
  const inicioCliente = primera || (miembro ? madridAInstante(miembro.desde, '00:00').toISOString() : null)

  return {
    clave,
    nombre: base?.nombre || '',
    apellidos: base?.apellidos || '',
    email: base?.email || '',
    telefono: base?.telefono || '',
    factura,
    miembro,
    total: cuentan.length,
    anio,
    canceladas: rows.length - cuentan.length,
    horas: cuentan.reduce((s, r) => s + Number(r.duracion_horas), 0),
    pagadoCent: pagadoReservas + cuotas.cent,
    cuotas: cuotas.n,
    mediaCent: pagadas.length ? Math.round(pagadas.reduce((s, r) => s + r.precio_cent - (r.reembolso_cent || 0), 0) / pagadas.length) : null,
    primera,
    ultima: pasadas.length ? iso(pasadas.at(-1).inicio) : null,
    desde: inicioCliente,
    repite: cuentan.length >= 2,
    nuevo: Boolean(inicioCliente && inicioCliente >= L.mesIni.toISOString() && inicioCliente < L.mesFin.toISOString()),
    deCalendly: cuentan.filter((r) => r.origen === 'calendly').length,
    actividades,
    fondos,
    equipo,
    proximas: reservas.filter((r) => r.futura && r.estado !== 'cancelada'),
    historial: reservas.filter((r) => !(r.futura && r.estado !== 'cancelada')).reverse(),
    notas: notas[0]?.notas || '',
    notasActualizadas: notas[0] ? iso(notas[0].actualizado_en) : null,
  }
}

// Para la ficha y la lista de reservas: de quién es cada reserva y qué vez es la suya
// (contando solo las que cuentan, por orden de fecha). Devuelve Map id -> { clave, vez, total }
export async function vecesDeReservas(ids) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))]
  if (!lista.length) return new Map()
  const { rows } = await query(
    `WITH r AS (SELECT ${SQL_CLAVE} AS clave, r.id, r.inicio, r.estado FROM reservas r WHERE ${EN_HISTORIAL}),
          mias AS (SELECT DISTINCT clave FROM r WHERE id = ANY($1) AND clave IS NOT NULL),
          orden AS (
            SELECT r.id, r.clave, r.estado,
                   count(*) FILTER (WHERE r.estado <> 'cancelada') OVER (PARTITION BY r.clave ORDER BY r.inicio, r.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::int AS vez,
                   count(*) FILTER (WHERE r.estado <> 'cancelada') OVER (PARTITION BY r.clave)::int AS total
              FROM r JOIN mias USING (clave)
          )
     SELECT id, clave, estado, vez, total FROM orden WHERE id = ANY($1)`,
    [lista]
  )
  return new Map(rows.map((x) => [x.id, { clave: x.clave, vez: x.estado === 'cancelada' ? null : x.vez, total: x.total }]))
}

// Notas del estudio sobre un cliente (texto libre; vacío = se borran)
export async function guardarNotasCliente(clave, notas) {
  if (!claveValida(clave)) throw new ErrorReserva('cliente', 'Cliente no válido.', 400)
  const texto = String(notas || '').slice(0, 4000)
  if (!texto.trim()) {
    await query('DELETE FROM clientes_notas WHERE clave = $1', [clave])
    return { notas: '' }
  }
  await query(
    `INSERT INTO clientes_notas (clave, notas) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET notas = EXCLUDED.notas, actualizado_en = now()`,
    [clave, texto]
  )
  return { notas: texto }
}

