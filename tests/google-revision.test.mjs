// Arreglos de la revisión de Google Calendar: copias de la base (vistas previas), eventos
// sueltos, cambios de calendario, reconectar, plazos y cron. API de Google falsa + PGlite.
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba'

import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import * as G from '../lib/google/calendario.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

// ---------- Google falso ----------
const google = {
  eventos: new Map(), // `${calendario}|${id}` -> evento
  llamadas: [],
  retrasoMs: 0, // cada llamada tarda esto (respeta el AbortSignal, como fetch)
  cortarTrasCrear: null, // id de reserva: crea su evento pero la respuesta «no llega» (tiempo agotado)
  alCrear: null, // { ref, f }: se ejecuta mientras Google crea el evento de esa reserva (carreras)
  fallaSi: null, // (evento) => true: Google da error con ese evento
  refrescos: [], // refresh tokens con los que se pidió un token de acceso
  cuenta: 'estudio@example.com',
}
const json = (estado, datos) => new Response(datos === null ? null : JSON.stringify(datos), { status: estado, headers: { 'Content-Type': 'application/json' } })
const idToken = (email) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`
const esperar = (ms, signal) => new Promise((ok, mal) => {
  if (!ms) return ok()
  const t = setTimeout(ok, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); mal(signal.reason) }, { once: true })
})

globalThis.fetch = async (url, op = {}) => {
  const u = new URL(url)
  const metodo = op.method || 'GET'
  google.llamadas.push(`${metodo} ${u.pathname}`)
  await esperar(google.retrasoMs, op.signal)
  if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
    const p = new URLSearchParams(op.body)
    if (p.get('grant_type') === 'authorization_code') {
      return json(200, { access_token: `acceso-${p.get('code')}`, expires_in: 3599, refresh_token: `refresco-${p.get('code')}`, scope: G.PERMISOS.join(' '), id_token: idToken(google.cuenta) })
    }
    google.refrescos.push(p.get('refresh_token'))
    return json(200, { access_token: `acceso-de-${p.get('refresh_token')}`, expires_in: 3599 })
  }
  if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) return json(200, {})
  if (u.pathname === '/calendar/v3/users/me/calendarList') {
    return json(200, { items: [{ id: 'estudio@example.com', summary: 'estudio@example.com', primary: true }, { id: 'reservas123@group.calendar.google.com', summary: 'Reservas' }] })
  }
  const m = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/)
  assert.ok(m, `ruta inesperada ${u.pathname}`)
  const cal = decodeURIComponent(m[1])
  const id = m[2] ? decodeURIComponent(m[2]) : null
  const clave = (i) => `${cal}|${i}`
  if (metodo === 'POST' || metodo === 'PUT') {
    const ev = JSON.parse(op.body)
    if (google.fallaSi?.(ev)) return json(503, { error: { message: 'Backend Error' } })
  }
  if (metodo === 'POST') {
    const ev = JSON.parse(op.body)
    if (google.eventos.has(clave(ev.id))) return json(409, { error: { message: 'The requested identifier already exists.' } })
    google.eventos.set(clave(ev.id), { ...ev, status: 'confirmed' })
    const ref = ev.extendedProperties?.private?.arstudioRef
    if (google.alCrear && google.alCrear.ref === ref) { const { f } = google.alCrear; google.alCrear = null; await f() }
    if (google.cortarTrasCrear && google.cortarTrasCrear === ref) { google.cortarTrasCrear = null; throw new DOMException('Se acabó el tiempo', 'TimeoutError') }
    return json(200, ev)
  }
  if (metodo === 'PUT') {
    if (!google.eventos.has(clave(id))) return json(404, { error: { message: 'Not Found' } })
    google.eventos.set(clave(id), { ...JSON.parse(op.body), id })
    return json(200, { id })
  }
  if (metodo === 'DELETE') {
    const ev = google.eventos.get(clave(id))
    if (!ev || ev.status === 'cancelled') return json(410, { error: { message: 'Resource has been deleted' } })
    google.eventos.set(clave(id), { ...ev, status: 'cancelled' })
    return new Response(null, { status: 204 })
  }
  throw new Error(`método inesperado ${metodo}`)
}

const PRINCIPAL = 'primary'
const RESERVAS = 'reservas123@group.calendar.google.com'
const vivosEn = (cal) => [...google.eventos.entries()].filter(([k, e]) => k.startsWith(`${cal}|`) && e.status !== 'cancelled')
const eventoDe = (cal, id) => google.eventos.get(`${cal}|${id}`)
const fila = async (id) => (await query('SELECT gcal_estado, gcal_evento_id, gcal_intentos FROM reservas WHERE id = $1', [id])).rows[0]
const revocaciones = () => google.llamadas.filter((l) => l.includes('/revoke')).length

let codigo = 0
async function conectar() {
  codigo++
  await G.completarConexion({ codigo: `c${codigo}`, redirectUri: 'http://localhost/api/admin/google/callback' })
}
// Deja la base limpia de Google para cada prueba: sin conexión, todo «al día» sin eventos
async function empezarDeCero() {
  await query(`DELETE FROM ajustes WHERE clave LIKE 'google_%'`)
  await query(`DELETE FROM ajustes WHERE clave = 'entorno'`)
  await query('DELETE FROM gcal_borrar')
  for (const t of ['reservas', 'bloqueos']) {
    await query(`UPDATE ${t} SET gcal_estado = 'ok', gcal_evento_id = NULL, gcal_intentos = 0, gcal_tomado_por = NULL, gcal_tomado_en = NULL`)
  }
  G._olvidarAcceso()
  google.eventos.clear()
}
beforeEach(async () => {
  google.llamadas = []
  google.retrasoMs = 0
  google.cortarTrasCrear = null
  google.alCrear = null
  google.fallaSi = null
  google.refrescos = []
  google.cuenta = 'estudio@example.com'
  await empezarDeCero()
})

const usados = new Set()
async function laborable(desdeHoy) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(fechaMadrid(new Date()), desdeHoy)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}
const CLIENTE = { nombre: 'Lucía', apellidos: 'Prueba', email: 'lucia@example.com', telefono: '+34 600 000 000', actividad: 'Podcast' }
let dias = 20
async function reserva(extra = {}) {
  const fecha = await laborable(dias++)
  return S.crearReservaManual({ ...CLIENTE, fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum', ...extra })
}

// ---------- #1: vistas previas con copia de la base de producción ----------

test('#1 una copia de la base no usa la conexión de producción ni la revoca', async () => {
  await conectar()
  const r = await reserva()
  await G.sincronizarPendientes({ limite: 100 })
  const idProd = (await fila(r.id)).gcal_evento_id
  assert.ok(idProd)
  const semillaAntes = (await query(`SELECT valor FROM ajustes WHERE clave = 'google_semilla'`)).rows[0].valor

  // La base ahora es una copia: se conectó Google en otro servidor
  await query(`UPDATE ajustes SET valor = 'servidor-de-produccion' WHERE clave = 'google_base'`)
  google.llamadas = []
  assert.equal(await G.leerConexion(), null, 'en la copia, como si no estuviera conectado')
  const estado = await G.estadoGoogle()
  assert.equal(estado.conectado, false)
  assert.equal((await fila(r.id)).gcal_evento_id, null, 'olvida los ids de los eventos de producción')
  const semillaDespues = (await query(`SELECT valor FROM ajustes WHERE clave = 'google_semilla'`)).rows[0]?.valor
  assert.notEqual(semillaDespues, semillaAntes)

  // Cancelar o mover en la copia no toca el evento real
  await S.cancelar(r.id, { motivo: 'prueba' })
  const res = await G.sincronizarPendientes({ limite: 100 })
  assert.equal(res.motivo, 'sin_conectar')
  assert.equal(eventoDe(PRINCIPAL, idProd).status, 'confirmed')
  // Desconectar en la copia nunca revoca el acceso de producción
  await G.desconectar()
  assert.equal(revocaciones(), 0)
  assert.equal(google.llamadas.length, 0, 'ni una llamada a Google')
})

test('#1 copia detectada por la marca de producción de otro servidor', async () => {
  await conectar()
  await query(`DELETE FROM ajustes WHERE clave = 'google_base'`)
  await query(`INSERT INTO ajustes (clave, valor) VALUES ('entorno', 'produccion:servidor-de-produccion')`)
  assert.equal(await G.leerConexion(), null)
  // Conectar aquí (un calendario de pruebas) funciona y queda ligado a esta base
  await conectar()
  const c = await G.leerConexion()
  assert.equal(c.estado, 'ok')
  assert.equal(c.base, 'local')
})

test('#1 si el token no se puede descifrar, cuenta como «revocado» y no se revoca nada', async () => {
  await conectar()
  const c = await G.leerConexion()
  await query(`UPDATE ajustes SET valor = $1 WHERE clave = 'google_conexion'`, [JSON.stringify({ ...c, token: 'v1.AAAA.BBBB.CCCC' })])
  G._olvidarAcceso()
  await reserva()
  const res = await G.sincronizarPendientes()
  assert.equal(res.hecho, false)
  assert.equal(res.motivo, 'revocado')
  assert.equal((await G.estadoGoogle()).revocado, true)
  google.llamadas = []
  await G.desconectar()
  assert.equal(revocaciones(), 0)
})

// ---------- #2: eventos sueltos de reservas canceladas ----------

test('#2 Google crea el evento pero la respuesta no llega: al cancelar se quita igual', async () => {
  await conectar()
  const r = await reserva()
  google.cortarTrasCrear = String(r.id)
  await G.sincronizarPendientes({ limite: 100 })
  const f = await fila(r.id)
  assert.equal(f.gcal_estado, 'error')
  assert.ok(f.gcal_evento_id, 'el id quedó apuntado antes de crear')
  assert.equal(eventoDe(PRINCIPAL, f.gcal_evento_id).status, 'confirmed')
  await S.cancelar(r.id, { motivo: 'prueba' })
  await G.sincronizarPendientes()
  assert.equal(eventoDe(PRINCIPAL, f.gcal_evento_id).status, 'cancelled')
  assert.equal((await fila(r.id)).gcal_evento_id, null)
})

test('#2 cancelada mientras se creaba su evento: no queda suelto', async () => {
  await conectar()
  const r = await reserva()
  google.alCrear = { ref: String(r.id), f: () => S.cancelar(r.id, { motivo: 'prueba' }) }
  await G.sincronizarPendientes({ limite: 100 })
  const f = await fila(r.id)
  assert.equal(f.gcal_estado, 'pendiente', 'la fila cambió mientras tanto: no se da por buena')
  await G.sincronizarPendientes()
  assert.equal(eventoDe(PRINCIPAL, f.gcal_evento_id).status, 'cancelled')
  assert.equal((await fila(r.id)).gcal_estado, 'ok')
})

test('#2 una fila que está pasando otro proceso no se toca; si se le corta, se libera sola', async () => {
  await conectar()
  const r = await reserva()
  await query(`UPDATE reservas SET gcal_tomado_por = 'otro', gcal_tomado_en = now() WHERE id = $1`, [r.id])
  await G.sincronizarPendientes({ limite: 100 })
  const deEsta = () => [...google.eventos.values()].filter((e) => e.extendedProperties?.private?.arstudioRef === String(r.id))
  assert.equal(deEsta().length, 0, 'no se ha creado su evento')
  assert.equal((await fila(r.id)).gcal_estado, 'pendiente')
  await query(`UPDATE reservas SET gcal_tomado_en = now() - interval '5 minutes' WHERE id = $1`, [r.id])
  await G.sincronizarPendientes({ limite: 100 })
  assert.equal((await fila(r.id)).gcal_estado, 'ok')
  const { rows } = await query('SELECT gcal_tomado_por FROM reservas WHERE id = $1', [r.id])
  assert.equal(rows[0].gcal_tomado_por, null, 'se suelta al terminar')
})

// ---------- #3 y #4: cambiar de calendario ----------

test('#3 ir a otro calendario y volver antes de vaciar la cola no pierde eventos', async () => {
  await conectar()
  const rs = [await reserva(), await reserva(), await reserva()]
  await G.sincronizarPendientes({ limite: 100 })
  await G.elegirCalendario(RESERVAS)
  await G.sincronizarPendientes({ limite: 1, tiempoMaxMs: 1 }) // casi nada: la cola se queda llena
  await G.elegirCalendario('primary')
  await G.sincronizarPendientes({ limite: 100, todo: true })
  for (const r of rs) {
    const f = await fila(r.id)
    assert.equal(f.gcal_estado, 'ok')
    assert.equal(eventoDe(PRINCIPAL, f.gcal_evento_id)?.status, 'confirmed', 'sigue en el principal')
  }
  assert.equal(vivosEn(RESERVAS).length, 0)
})

test('#4 cambiar de calendario también se lleva las reservas antiguas', async () => {
  await conectar()
  const r = await reserva()
  await G.sincronizarPendientes()
  const id = (await fila(r.id)).gcal_evento_id
  // Se convierte en una reserva de hace más de un año (con su evento)
  await query(`UPDATE reservas SET inicio = inicio - interval '400 days', fin = fin - interval '400 days', bloqueo_hasta = bloqueo_hasta - interval '400 days' WHERE id = $1`, [r.id])
  await G.sincronizarPendientes()
  await G.elegirCalendario(RESERVAS)
  await G.sincronizarPendientes({ limite: 100 })
  assert.equal(eventoDe(PRINCIPAL, id).status, 'cancelled')
  assert.equal(eventoDe(RESERVAS, id)?.status, 'confirmed', 'la antigua también está en el nuevo')
})

// ---------- #5: desconectar y volver a conectar ----------

test('#5 reconectar la misma cuenta sigue en el mismo calendario y no duplica', async () => {
  await conectar()
  await G.elegirCalendario(RESERVAS)
  const a = await reserva()
  const b = await reserva()
  await G.sincronizarPendientes({ limite: 100 })
  const idA = (await fila(a.id)).gcal_evento_id
  const idB = (await fila(b.id)).gcal_evento_id
  await G.desconectar()
  await S.cancelar(b.id, { motivo: 'prueba' }) // se cancela mientras está desconectado
  await conectar()
  assert.equal((await G.leerConexion()).calendarioId, RESERVAS)
  await G.sincronizarPendientes({ limite: 100 })
  assert.equal(eventoDe(RESERVAS, idA).status, 'confirmed')
  assert.equal(eventoDe(RESERVAS, idB).status, 'cancelled', 'la cancelada se quita')
  assert.equal(vivosEn(PRINCIPAL).length, 0, 'nada duplicado en el principal')
})

// ---------- #6: plazo total tras un cambio ----------

test('#6 tras un cambio se espera como mucho unos 3 s aunque Google vaya lento', async () => {
  await conectar()
  G._olvidarAcceso()
  for (let i = 0; i < 4; i++) await reserva()
  google.retrasoMs = 1500
  const t0 = Date.now()
  await G.sincronizarTrasCambio()
  const tardo = Date.now() - t0
  assert.ok(tardo < 3600, `tardó ${tardo} ms`)
  const { rows } = await query(`SELECT gcal_estado, gcal_intentos FROM reservas WHERE gcal_estado <> 'ok'`)
  assert.ok(rows.length >= 1, 'lo que no dio tiempo se queda para luego')
  assert.ok(rows.every((x) => x.gcal_estado === 'pendiente' && x.gcal_intentos === 0), 'sin tiempo no cuenta como fallo')
  google.retrasoMs = 0
  await G.sincronizarPendientes({ limite: 100 })
  assert.equal((await query(`SELECT count(*)::int AS n FROM reservas WHERE gcal_estado <> 'ok'`)).rows[0].n, 0)
})

// ---------- #7: cron ----------

test('#7 las que fallan siempre no tapan a las nuevas y el cron llega al final', async () => {
  await conectar()
  google.fallaSi = (ev) => ev.summary?.includes('Falla')
  for (let i = 0; i < 3; i++) await reserva({ nombre: 'Falla' })
  for (let i = 0; i < 5; i++) await G.sincronizarPendientes() // agotan los intentos solos
  const nuevas = [await reserva(), await reserva(), await reserva()]
  const res = await G.sincronizarPendientes({ limite: 2, todo: true, tiempoMaxMs: 10000 })
  for (const r of nuevas) assert.equal((await fila(r.id)).gcal_estado, 'ok')
  assert.equal(res.quedan, 0)
})

// ---------- #8: token de acceso ligado a su cuenta ----------

test('#8 el token de acceso en memoria no se usa con otra conexión', async () => {
  await conectar()
  await reserva()
  await G.sincronizarPendientes()
  const c = await G.leerConexion()
  // Otra conexión (otro refresh token) sin pasar por completarConexion en esta instancia
  await query(`UPDATE ajustes SET valor = $1 WHERE clave = 'google_conexion'`, [JSON.stringify({ ...c, token: G.cifrar('refresco-de-otra-cuenta') })])
  google.refrescos = []
  await reserva()
  await G.sincronizarPendientes()
  assert.deepEqual(google.refrescos, ['refresco-de-otra-cuenta'], 'pide un token nuevo para la otra conexión')
})

// ---------- #9: datos del evento ----------

test('#9 el evento es privado y no lleva el NIF; las notas del estudio sí', async () => {
  await conectar()
  const r = await reserva({ factura: { nombre: 'Lucía SL', nif: 'B12345678', direccion: 'Calle 1' }, notasInternas: 'Trae trípode' })
  await G.sincronizarPendientes()
  const ev = eventoDe(PRINCIPAL, (await fila(r.id)).gcal_evento_id)
  assert.equal(ev.visibility, 'private')
  assert.ok(!ev.description.includes('B12345678'))
  assert.ok(ev.description.includes('Lucía SL'))
  assert.ok(ev.description.includes('Trae trípode'))
})

// ---------- #10: cambio de plan ----------

test('#10 cambiar el plan de una suscripción actualiza el título de sus sesiones', async () => {
  await conectar()
  const hoy = fechaMadrid(new Date())
  const { suscripcion } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Ana', apellidos: 'Plan', email: 'ana-plan@example.com', telefono: '600000000',
    fechaInicio: hoy, metodoHabitual: 'transferencia', fianza: { estado: 'cobrada', metodo: 'transferencia', fecha: hoy },
  }, { confirmado: true })
  const fecha = await laborable(dias++)
  const { reserva: sesion } = await SUS.crearSesionPlan(suscripcion.id, { fecha, desde: '14:00', hasta: '18:00' }, { modo: 'panel' })
  await G.sincronizarPendientes()
  const id = (await fila(sesion.id)).gcal_evento_id
  assert.match(eventoDe(PRINCIPAL, id).summary, /^Plan Starter/)
  await query(`UPDATE suscripciones SET plan = 'creator' WHERE id = $1`, [suscripcion.id])
  assert.equal((await fila(sesion.id)).gcal_estado, 'pendiente')
  await G.sincronizarPendientes()
  assert.match(eventoDe(PRINCIPAL, id).summary, /^Plan Creator/)
})
