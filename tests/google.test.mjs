// Google Calendar con una API de Google falsa (fetch simulado) y PGlite en memoria
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba'

import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as G from '../lib/google/calendario.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

// ---------- Google falso ----------
const google = {
  eventos: new Map(), // id -> { ...evento, status }
  llamadas: [],
  falla: false,
  revocado: false,
  tokensRefresco: 0,
}
const json = (estado, datos) => new Response(datos === null ? null : JSON.stringify(datos), { status: estado, headers: { 'Content-Type': 'application/json' } })
const idToken = (email) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`

globalThis.fetch = async (url, op = {}) => {
  const u = new URL(url)
  const metodo = op.method || 'GET'
  google.llamadas.push(`${metodo} ${u.pathname}`)
  if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
    const p = new URLSearchParams(op.body)
    if (p.get('grant_type') === 'authorization_code') {
      return json(200, {
        access_token: 'acceso-1', expires_in: 3599, refresh_token: 'refresco-muy-secreto',
        scope: G.PERMISOS.join(' '), id_token: idToken('estudio@example.com'),
      })
    }
    google.tokensRefresco++
    if (google.revocado) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    assert.equal(p.get('refresh_token'), 'refresco-muy-secreto')
    return json(200, { access_token: `acceso-${google.tokensRefresco + 1}`, expires_in: 3599 })
  }
  if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) return json(200, {})
  assert.ok(String(op.headers?.Authorization || '').startsWith('Bearer acceso-'), 'lleva el token de acceso')
  if (google.falla) return json(503, { error: { message: 'Backend Error' } })
  if (u.pathname === '/calendar/v3/users/me/calendarList') {
    return json(200, { items: [{ id: 'estudio@example.com', summary: 'estudio@example.com', primary: true }, { id: 'reservas123@group.calendar.google.com', summary: 'Reservas' }] })
  }
  const m = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/)
  assert.ok(m, `ruta inesperada ${u.pathname}`)
  const cal = decodeURIComponent(m[1])
  const id = m[2] ? decodeURIComponent(m[2]) : null
  const clave = (i) => `${cal}|${i}`
  if (metodo === 'POST') {
    const ev = JSON.parse(op.body)
    if (google.eventos.has(clave(ev.id))) return json(409, { error: { message: 'The requested identifier already exists.' } })
    google.eventos.set(clave(ev.id), { ...ev, status: 'confirmed' })
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
    google.eventos.set(clave(id), { ...ev, status: 'cancelled' }) // como Google: el id queda ocupado
    return new Response(null, { status: 204 })
  }
  throw new Error(`método inesperado ${metodo}`)
}

const vivos = () => [...google.eventos.entries()].filter(([, e]) => e.status !== 'cancelled')
const eventoDe = (calendario, id) => google.eventos.get(`${calendario}|${id}`)
beforeEach(() => {
  google.llamadas = []
  google.falla = false
})

// Días laborables libres a unas semanas vista
const usados = new Set()
async function laborable(desdeHoy) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(fechaMadrid(new Date()), desdeHoy)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}

const CLIENTE = {
  nombre: 'Lucía', apellidos: 'Prueba Gómez', email: 'lucia@example.com', telefono: '+34 600 000 000',
  actividad: 'Podcast', fondos: 'blanco', equipo: ['podcast'], comentarios: 'Venimos tres personas',
}
async function reservaManual(dias, extra = {}) {
  const fecha = await laborable(dias)
  return S.crearReservaManual({ ...CLIENTE, fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum', ...extra })
}
const fila = async (id) => (await query('SELECT gcal_estado, gcal_evento_id, gcal_error, gcal_intentos FROM reservas WHERE id = $1', [id])).rows[0]

test('el token se guarda cifrado y no se puede leer si se toca', () => {
  const c = G.cifrar('refresco-muy-secreto')
  assert.ok(!c.includes('refresco'))
  assert.notEqual(G.cifrar('refresco-muy-secreto'), c, 'cada vez con un vector distinto')
  assert.equal(G.descifrar(c), 'refresco-muy-secreto')
  const roto = c.slice(0, -2) + (c.endsWith('A') ? 'B' : 'A')
  assert.throws(() => G.descifrar(roto))
})

test('sin conectar: la reserva se hace igual y queda pendiente', async () => {
  const r = await reservaManual(20)
  const res = await G.sincronizarPendientes()
  assert.equal(res.hecho, false)
  assert.equal(res.motivo, 'sin_conectar')
  assert.equal((await fila(r.id)).gcal_estado, 'pendiente')
  assert.equal(google.llamadas.length, 0)
})

test('conectar guarda la cuenta y el token cifrado, y pasa lo pendiente', async () => {
  const { cuenta } = await G.completarConexion({ codigo: 'codigo-1', redirectUri: 'http://localhost/api/admin/google/callback' })
  assert.equal(cuenta, 'estudio@example.com')
  const { rows } = await query(`SELECT valor FROM ajustes WHERE clave = 'google_conexion'`)
  assert.ok(!rows[0].valor.includes('refresco-muy-secreto'), 'nunca en claro en la base')
  const c = await G.leerConexion()
  assert.equal(c.calendarioId, 'primary')
  assert.equal(G.descifrar(c.token), 'refresco-muy-secreto')

  const res = await G.sincronizarPendientes({ base: 'https://www.studioar.es' })
  assert.equal(res.hecho, true)
  assert.ok(res.creados >= 1)
  const e = vivos().find(([, ev]) => ev.summary.includes('Lucía'))
  assert.ok(e, 'el evento de la reserva pendiente ya está')
})

test('crear: el evento lleva los datos del cliente y nunca se duplica', async () => {
  const r = await reservaManual(22, { factura: { nombre: 'Lucía SL', nif: 'B00000000', direccion: 'Calle 1' }, notasInternas: 'Trae trípode' })
  await G.sincronizarPendientes({ base: 'https://www.studioar.es' })
  const f = await fila(r.id)
  assert.equal(f.gcal_estado, 'ok')
  const ev = eventoDe('primary', f.gcal_evento_id)
  assert.equal(ev.summary, 'Reserva · Lucía Prueba Gómez (2 h)')
  for (const t of ['+34 600 000 000', 'lucia@example.com', 'Podcast', 'Sí, el fondo blanco', 'Kit podcast', 'Venimos tres personas',
    r.codigo, 'pagada (Bizum)', 'Lucía SL', 'Trae trípode', `https://www.studioar.es/admin/reserva/${r.id}`]) {
    assert.ok(ev.description.includes(t), `falta «${t}» en la descripción`)
  }
  assert.equal(ev.start.timeZone, 'Europe/Madrid')
  assert.equal(new Date(ev.start.dateTime).getTime(), r.inicio.getTime())

  // Otra pasada no llama a Google
  google.llamadas = []
  await G.sincronizarPendientes()
  assert.equal(google.llamadas.filter((l) => !l.includes('token')).length, 0)

  // Si el evento se creó pero la base no llegó a apuntarlo, no sale otro: mismo id fijo
  await query(`UPDATE reservas SET gcal_evento_id = NULL, gcal_estado = 'pendiente' WHERE id = $1`, [r.id])
  const antes = vivos().length
  await G.sincronizarPendientes()
  assert.equal(vivos().length, antes)
  assert.equal((await fila(r.id)).gcal_evento_id, f.gcal_evento_id)
})

test('mover y cambiar datos actualiza el evento; cancelar lo quita', async () => {
  const r = await reservaManual(24)
  await G.sincronizarPendientes()
  const id = (await fila(r.id)).gcal_evento_id
  const nuevaFecha = await laborable(26)
  await S.reprogramar(r.id, { fecha: nuevaFecha, desde: '16:00', hasta: '19:00' })
  assert.equal((await fila(r.id)).gcal_estado, 'pendiente', 'el disparador lo marca')
  await G.sincronizarPendientes()
  let ev = eventoDe('primary', id)
  assert.equal(ev.summary, 'Reserva · Lucía Prueba Gómez (3 h)')
  assert.equal(fechaMadrid(new Date(ev.start.dateTime)), nuevaFecha)

  await S.guardarNotas(r.id, 'Llegan tarde')
  await G.sincronizarPendientes()
  ev = eventoDe('primary', id)
  assert.ok(ev.description.includes('Llegan tarde'))

  await S.cancelar(r.id, { motivo: 'prueba' })
  await G.sincronizarPendientes()
  assert.equal(eventoDe('primary', id).status, 'cancelled')
  const f = await fila(r.id)
  assert.equal(f.gcal_estado, 'ok')
  assert.equal(f.gcal_evento_id, null)
})

test('si Google falla, la reserva sigue y se reintenta luego', async () => {
  google.falla = true
  const r = await reservaManual(28)
  const res = await G.sincronizarPendientes()
  assert.ok(res.errores >= 1)
  let f = await fila(r.id)
  assert.equal(f.gcal_estado, 'error')
  assert.match(f.gcal_error, /Backend Error/)
  assert.equal(f.gcal_intentos, 1)
  assert.equal((await S.reservaPorId(r.id)).estado, 'confirmada')
  const estado = await G.estadoGoogle()
  assert.ok(estado.errores >= 1)

  google.falla = false
  await G.sincronizarPendientes()
  f = await fila(r.id)
  assert.equal(f.gcal_estado, 'ok')
  assert.ok(eventoDe('primary', f.gcal_evento_id))
})

test('tras muchos fallos solo lo reintentan el cron y el botón (todo)', async () => {
  google.falla = true
  const r = await reservaManual(30)
  for (let i = 0; i < 5; i++) await G.sincronizarPendientes()
  assert.equal((await fila(r.id)).gcal_intentos, 5)
  google.falla = false
  google.llamadas = []
  await G.sincronizarPendientes()
  assert.equal((await fila(r.id)).gcal_estado, 'error', 'el automático ya no insiste')
  await G.sincronizarPendientes({ todo: true })
  assert.equal((await fila(r.id)).gcal_estado, 'ok')
})

test('bloqueos: se crean y, al borrarlos, se quita su evento', async () => {
  const fecha = await laborable(32)
  const b = await S.crearBloqueo({ fecha, desde: '09:00', hasta: '14:00', motivo: 'Mantenimiento' })
  await G.sincronizarPendientes()
  const { rows } = await query('SELECT gcal_evento_id FROM bloqueos WHERE id = $1', [b.id])
  const ev = eventoDe('primary', rows[0].gcal_evento_id)
  assert.equal(ev.summary, 'Cerrado · Mantenimiento')
  await S.borrarBloqueo(b.id)
  assert.equal((await query('SELECT count(*)::int AS n FROM gcal_borrar')).rows[0].n, 1)
  await G.sincronizarPendientes()
  assert.equal(eventoDe('primary', rows[0].gcal_evento_id).status, 'cancelled')
  assert.equal((await query('SELECT count(*)::int AS n FROM gcal_borrar')).rows[0].n, 0)
})

test('las reservas de Calendly no se copian (Calendly ya las pone)', async () => {
  const r = await reservaManual(34, { origen: 'calendly' })
  await G.sincronizarPendientes()
  const f = await fila(r.id)
  assert.equal(f.gcal_estado, 'ok')
  assert.equal(f.gcal_evento_id, null)
})

test('cambiar de calendario mueve los eventos sin duplicar', async () => {
  const r = await reservaManual(36)
  await G.sincronizarPendientes()
  const id = (await fila(r.id)).gcal_evento_id
  await G.elegirCalendario('reservas123@group.calendar.google.com')
  await G.sincronizarPendientes({ limite: 100 })
  assert.equal(eventoDe('primary', id).status, 'cancelled', 'se quita del anterior')
  assert.equal(eventoDe('reservas123@group.calendar.google.com', id).status, 'confirmed', 'y está en el nuevo')
  assert.equal((await G.leerConexion()).calendarioNombre, 'Reservas')
  await G.elegirCalendario('primary')
  await G.sincronizarPendientes({ limite: 100 })
  assert.equal(eventoDe('primary', id).status, 'confirmed', 'vuelve al principal (mismo id, se reescribe)')
})

test('si Google corta el permiso, queda como «revocado» y no rompe', async () => {
  google.revocado = true
  await G.desconectar()
  await G.completarConexion({ codigo: 'codigo-2', redirectUri: 'http://localhost/api/admin/google/callback' })
  // El token de acceso vale una hora: se simula que caducó
  G._olvidarAcceso()
  await reservaManual(38)
  const res = await G.sincronizarPendientes()
  assert.equal(res.hecho, false)
  assert.equal(res.motivo, 'revocado')
  assert.equal((await G.estadoGoogle()).revocado, true)
  google.revocado = false
})

test('desconectar borra la conexión guardada', async () => {
  await G.completarConexion({ codigo: 'codigo-3', redirectUri: 'http://localhost/api/admin/google/callback' })
  await G.desconectar()
  assert.equal(await G.leerConexion(), null)
  assert.ok(google.llamadas.some((l) => l.includes('/revoke')))
  const res = await G.sincronizarPendientes()
  assert.equal(res.motivo, 'sin_conectar')
})

test('las rutas del panel pasan el cambio a Google antes de contestar', async () => {
  const { rutaAdmin } = await import('../lib/admin/api.js')
  const { abrirSesion } = await import('../lib/admin/auth.js')
  await G.completarConexion({ codigo: 'codigo-4', redirectUri: 'http://localhost/api/admin/google/callback' })
  // Cookie de sesión válida
  const cabeceras = {}
  await abrirSesion({ setHeader: (k, v) => { cabeceras[k] = v } })
  const cookie = cabeceras['Set-Cookie'].split(';')[0].split('=')
  let creada = null
  let eventosAlContestar = null
  await G.sincronizarPendientes({ todo: true, limite: 100 }) // lo que dejaron las pruebas anteriores
  const antes = vivos().length
  const handler = rutaAdmin(async (req, res) => {
    creada = await reservaManual(40)
    res.status(200).json({ ok: true })
  })
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(d) { return this.end(JSON.stringify(d)) },
    end(cuerpo) { eventosAlContestar = vivos().length; this.cuerpo = cuerpo; return this },
  }
  await handler({ method: 'POST', headers: { host: 'localhost' }, cookies: { [cookie[0]]: cookie[1] }, body: {} }, res)
  assert.equal(res.cuerpo, '{"ok":true}')
  assert.equal(eventosAlContestar, antes + 1, 'el evento ya estaba en Google al contestar')
  assert.equal((await fila(creada.id)).gcal_estado, 'ok', 'ya estaba en Google al contestar')
})
