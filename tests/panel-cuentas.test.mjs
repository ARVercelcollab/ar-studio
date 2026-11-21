// Cuentas del panel: cada persona entra con su correo y su contraseña. Paso desde la contraseña
// compartida (de un solo sentido), invitaciones, recuperar, sesiones revocables, quitar el acceso,
// permisos y límites. Con PGlite en memoria y sin datos reales.
process.env.PGLITE_DIR = 'memoria'
delete process.env.ADMIN_PASSWORD // en local la compartida es «estudio»
delete process.env.RESEND_API_KEY
delete process.env.VERCEL

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { cerrarDb, query } from '../lib/db/index.js'
import * as A from '../lib/admin/auth.js'
import * as C from '../lib/admin/cuentas.js'
import rutaLogin from '../pages/api/admin/login.js'
import rutaLogout from '../pages/api/admin/logout.js'
import rutaPersonas from '../pages/api/admin/personas.js'
import rutaGuardar from '../pages/api/admin/clave/guardar.js'
import rutaOlvidada from '../pages/api/admin/clave/olvidada.js'

after(() => cerrarDb())

const BASE = 'http://localhost:3000'
const H = 3600000
const tokenDe = (url) => new URL(url).searchParams.get('t')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
let ip = 0

async function llamar(handler, { body = {}, cookie = null, ipFija = null, method = 'POST', origen = 'http://localhost' } = {}) {
  const res = {
    statusCode: 200, headers: {}, cuerpo: null, destino: null,
    setHeader(k, v) { this.headers[k] = v },
    getHeader(k) { return this.headers[k] },
    status(c) { this.statusCode = c; return this },
    json(d) { this.cuerpo = d; return this },
    send(d) { this.cuerpo = d; return this },
    redirect(c, u) { this.statusCode = c; this.destino = u; return this },
    end(d) { if (d !== undefined && this.cuerpo === null) this.cuerpo = d; return this },
  }
  const req = {
    method, headers: { host: 'localhost', ...(origen ? { origin: origen } : {}) }, body, query: {},
    cookies: cookie ? { ar_admin: cookie } : {}, socket: { remoteAddress: ipFija || `10.1.${Math.floor(++ip / 250)}.${ip % 250}` },
  }
  await handler(req, res)
  return res
}
const cookieDe = (res) => {
  const c = res.headers['Set-Cookie']
  const v = c ? c.split(';')[0].split('=').slice(1).join('=') : ''
  return v || null
}
const entrar = (email, contrasena, extra = {}) => llamar(rutaLogin, { body: { email, contrasena }, ...extra })
const compartida = async () => A.personaDeCookie(cookieDe(await llamar(rutaLogin, { body: { contrasena: 'estudio' } })))

// Da acceso y crea la contraseña; devuelve { id, cookie }
async function cuentaCon(quien, nombre, email, clave, puede = false) {
  const r = await C.darAcceso(quien, { nombre, email, puedeDarAcceso: puede }, BASE)
  const ok = await llamar(rutaGuardar, { body: { token: tokenDe(r.url), clave, repetida: clave } })
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.cuerpo))
  return { id: r.persona.id, cookie: cookieDe(ok) }
}

// ---------- Antes de que nadie tenga contraseña ----------

let cookieCompartidaVieja = null

test('sin cuentas se entra con la contraseña compartida; esa sesión puede dar acceso', async () => {
  assert.equal(await A.hayCuentas(), false)
  assert.equal((await llamar(rutaLogin, { body: { contrasena: 'otra cosa' } })).statusCode, 401)
  const buena = await llamar(rutaLogin, { body: { contrasena: 'estudio' } })
  assert.equal(buena.statusCode, 200)
  cookieCompartidaVieja = cookieDe(buena)
  const p = await A.personaDeCookie(cookieCompartidaVieja)
  assert.equal(p.compartida, true)
  assert.equal(p.puedeDarAcceso, true)
  // En la base solo está el resumen de la cookie
  const { rows } = await query('SELECT token_hash, persona_id FROM sesiones_panel')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].persona_id, null)
  assert.notEqual(rows[0].token_hash, cookieCompartidaVieja)
})

test('dar acceso: correo normalizado (espacios, mayúsculas, NFC), sin repetir; dos a la vez no rompen', async () => {
  const yo = await compartida()
  const r = await C.darAcceso(yo, { nombre: 'Eva Invitada', email: '  EVA.Invitada@Example.com ', puedeDarAcceso: false }, BASE)
  assert.equal(r.persona.email, 'eva.invitada@example.com')
  assert.equal(r.persona.estado, 'invitada')
  // «é» compuesta y descompuesta son el mismo correo
  await C.darAcceso(yo, { nombre: 'José', email: 'josé@example.com' }, BASE)
  await assert.rejects(C.darAcceso(yo, { nombre: 'José bis', email: 'josé@EXAMPLE.com' }, BASE), { codigo: 'ya' })
  await assert.rejects(C.darAcceso(yo, { nombre: 'Eva Otra', email: 'eva.invitada@example.com' }, BASE), { codigo: 'ya' })
  await assert.rejects(C.darAcceso(yo, { nombre: '', email: 'x@example.com' }, BASE), { codigo: 'nombre' })
  await assert.rejects(C.darAcceso(yo, { nombre: 'X', email: 'no-es-correo' }, BASE), { codigo: 'email' })
  const dos = await Promise.allSettled([
    C.darAcceso(yo, { nombre: 'Doble Uno', email: 'doble@example.com' }, BASE),
    C.darAcceso(yo, { nombre: 'Doble Dos', email: 'doble@example.com' }, BASE),
  ])
  assert.equal(dos.filter((x) => x.status === 'fulfilled').length, 1)
  assert.equal(dos.find((x) => x.status === 'rejected').reason.codigo, 'ya')
})

// ---------- La primera contraseña: cuentas para siempre ----------

let ana = null
let invitacionDeLaEx = null

test('al activarse las cuentas se anulan las invitaciones de la contraseña compartida y sus sesiones', async () => {
  const yo = await A.personaDeCookie(cookieCompartidaVieja)
  // Alguien con la contraseña compartida (p. ej. una excolaboradora) se invita como administradora
  const ex = await C.darAcceso(yo, { nombre: 'Ex Colaboradora', email: 'ex@example.net', puedeDarAcceso: true }, BASE)
  invitacionDeLaEx = tokenDe(ex.url)
  // El dueño hace lo que dice la guía: se da acceso y pone su contraseña
  const r = await C.darAcceso(yo, { nombre: 'Ana Dueña', email: 'ana@example.com', puedeDarAcceso: true }, BASE)
  const t = tokenDe(r.url)
  assert.deepEqual(await C.verEnlace(t), { tipo: 'invitacion', nombre: 'Ana Dueña', email: 'ana@example.com' })
  assert.ok(await C.verEnlace(t)) // ver no lo gasta
  assert.equal((await llamar(rutaGuardar, { body: { token: t, clave: 'corta', repetida: 'corta' } })).statusCode, 400)
  assert.equal((await llamar(rutaGuardar, { body: { token: t, clave: 'una-clave-larga', repetida: 'otra-clave-larga' } })).statusCode, 400)
  const ok = await llamar(rutaGuardar, { body: { token: t, clave: 'clave-de-ana-123', repetida: 'clave-de-ana-123' } })
  assert.equal(ok.statusCode, 200)
  ana = { id: r.persona.id, cookie: cookieDe(ok) }
  assert.equal((await A.personaDeCookie(ana.cookie)).email, 'ana@example.com')
  // De un solo uso
  const otra = await llamar(rutaGuardar, { body: { token: t, clave: 'clave-de-ana-456', repetida: 'clave-de-ana-456' } })
  assert.equal(otra.cuerpo.error, 'enlace')
  // Cuentas activadas: la compartida y sus sesiones ya no valen
  assert.equal(await A.hayCuentas(), true)
  assert.equal(await A.personaDeCookie(cookieCompartidaVieja), null)
  assert.equal((await llamar(rutaLogin, { body: { contrasena: 'estudio' } })).statusCode, 401)
  // La invitación de la ex ya no vale, y como no tiene contraseña tampoco puede «recuperarla»
  assert.equal(await C.verEnlace(invitacionDeLaEx), null)
  const conLaEx = await llamar(rutaGuardar, { body: { token: invitacionDeLaEx, clave: 'clave-de-la-ex-1', repetida: 'clave-de-la-ex-1' } })
  assert.equal(conLaEx.statusCode, 400)
  assert.equal((await C.pedirRecuperar('ex@example.net', BASE)).enviado, false)
})

test('entrar con correo y contraseña; el correo que no existe da la misma respuesta', async () => {
  const buena = await entrar('ANA@example.com', 'clave-de-ana-123')
  assert.equal(buena.statusCode, 200)
  assert.equal((await A.personaDeCookie(cookieDe(buena))).id, ana.id)
  const mala = await entrar('ana@example.com', 'no-es-esta-clave')
  const nadie = await entrar('nadie@example.com', 'no-es-esta-clave')
  assert.equal(mala.statusCode, 401)
  assert.equal(nadie.statusCode, 401)
  assert.equal(mala.cuerpo.mensaje, nadie.cuerpo.mensaje)
  assert.equal(cookieDe(mala), null)
  assert.equal((await entrar('eva.invitada@example.com', 'cualquier-cosa-larga')).statusCode, 401)
})

test('invitación caducada a las 72 h; reenviar anula la anterior', async () => {
  const yo = await A.personaDeCookie(ana.cookie)
  const ahora = new Date()
  const r = await C.darAcceso(yo, { nombre: 'Fran Tarde', email: 'fran@example.com' }, BASE, { ahora })
  const t = tokenDe(r.url)
  await assert.rejects(C.guardarClaveConEnlace(t, 'clave-de-fran-1', 'clave-de-fran-1', { ahora: new Date(ahora.getTime() + 73 * H) }), { codigo: 'enlace' })
  const otra = await C.reenviarInvitacion(yo, r.persona.id, BASE)
  assert.equal(await C.verEnlace(t), null)
  const { persona } = await C.guardarClaveConEnlace(tokenDe(otra.url), 'clave-de-fran-1', 'clave-de-fran-1')
  assert.equal(persona.estado, 'activa')
})

// ---------- Sesiones revocables ----------

test('recuperar cierra TODAS las demás sesiones; pedir enlaces no anula el de la persona', async () => {
  const otraSesion = cookieDe(await entrar('ana@example.com', 'clave-de-ana-123'))
  assert.ok(await A.personaDeCookie(otraSesion))
  const r = await C.pedirRecuperar('ana@example.com', BASE)
  assert.equal(r.enviado, true)
  assert.equal((await C.verEnlace(tokenDe(r.url))).tipo, 'recuperar')
  // Otra persona pide enlaces para el mismo correo: el primero sigue valiendo
  await C.pedirRecuperar('ana@example.com', BASE)
  assert.ok(await C.verEnlace(tokenDe(r.url)))
  assert.equal((await C.pedirRecuperar('nadie@example.com', BASE)).enviado, false)
  const res = await llamar(rutaGuardar, { body: { token: tokenDe(r.url), clave: 'clave-nueva-de-ana', repetida: 'clave-nueva-de-ana' } })
  assert.equal(res.statusCode, 200)
  assert.equal(await A.personaDeCookie(otraSesion), null)
  assert.equal(await A.personaDeCookie(ana.cookie), null)
  ana.cookie = cookieDe(res)
  assert.equal((await A.personaDeCookie(ana.cookie)).id, ana.id)
  assert.equal((await entrar('ana@example.com', 'clave-de-ana-123')).statusCode, 401)
  // El enlace de recuperar caduca a la hora
  const r2 = await C.pedirRecuperar('ana@example.com', BASE)
  await assert.rejects(C.guardarClaveConEnlace(tokenDe(r2.url), 'otra-clave-nueva', 'otra-clave-nueva', { ahora: new Date(Date.now() + 61 * 60000) }), { codigo: 'enlace' })
  // La ruta de «olvidada» contesta lo mismo exista o no
  const a = await llamar(rutaOlvidada, { body: { email: 'ana@example.com' } })
  const b = await llamar(rutaOlvidada, { body: { email: 'nadie.mas@example.com' } })
  assert.equal(a.statusCode, 200)
  assert.deepEqual(a.cuerpo, b.cuerpo)
})

test('una entrada con la contraseña vieja que se cruza con el cambio no deja ninguna sesión viva', async () => {
  const yo = await A.personaDeCookie(ana.cookie)
  const vic = await cuentaCon(yo, 'Vic Tima', 'vic@example.com', 'clave-vieja-123', false)
  const rec = await C.pedirRecuperar('vic@example.com', BASE)
  for (const retraso of [0, 1, 3, 8, 20]) {
    const reset = llamar(rutaGuardar, { body: { token: tokenDe(rec.url), clave: 'clave-nueva-456', repetida: 'clave-nueva-456' } })
    await espera(retraso)
    const ataque = entrar('vic@example.com', 'clave-vieja-123')
    const [, a] = await Promise.all([reset, ataque])
    if (a.statusCode === 200) assert.equal(await A.personaDeCookie(cookieDe(a)), null, `con ${retraso} ms la sesión vieja sigue viva`)
    // Se vuelve a dejar la contraseña vieja para la siguiente vuelta
    const otra = await C.pedirRecuperar('vic@example.com', BASE)
    await C.guardarClaveConEnlace(tokenDe(otra.url), 'clave-vieja-123', 'clave-vieja-123')
    Object.assign(rec, await C.pedirRecuperar('vic@example.com', BASE))
  }
  void vic
})

test('salir revoca la sesión en la base de datos (solo POST y desde la web)', async () => {
  const s = cookieDe(await entrar('ana@example.com', 'clave-nueva-de-ana'))
  assert.ok(await A.personaDeCookie(s))
  assert.equal((await llamar(rutaLogout, { cookie: s, method: 'GET' })).statusCode, 405)
  assert.equal((await llamar(rutaLogout, { cookie: s, origen: 'https://otra-web.example' })).statusCode, 403)
  assert.ok(await A.personaDeCookie(s))
  const fuera = await llamar(rutaLogout, { cookie: s })
  assert.equal(fuera.statusCode, 303)
  assert.equal(fuera.destino, '/admin/login')
  assert.match(fuera.headers['Set-Cookie'], /Max-Age=0/)
  // Aunque alguien hubiera copiado la cookie, ya no vale
  assert.equal(await A.personaDeCookie(s), null)
})

test('quitar el acceso y cerrar sus sesiones dejan fuera al momento; volver a dar acceso pide otra contraseña', async () => {
  const yo = await A.personaDeCookie(ana.cookie)
  const gus = await cuentaCon(yo, 'Gus Temporal', 'gus@example.com', 'clave-de-gus-1', true)
  await C.cerrarSesionesDe(yo, gus.id)
  assert.equal(await A.personaDeCookie(gus.cookie), null)
  const otraVez = cookieDe(await entrar('gus@example.com', 'clave-de-gus-1'))
  assert.ok(await A.personaDeCookie(otraVez))
  await C.quitarAcceso(yo, gus.id)
  assert.equal(await A.personaDeCookie(otraVez), null)
  assert.equal((await entrar('gus@example.com', 'clave-de-gus-1')).statusCode, 401)
  // Al volver, el permiso se elige otra vez (por defecto, no) y la contraseña vieja no vale
  const v = await C.volverADarAcceso(yo, gus.id, BASE)
  assert.equal(v.persona.estado, 'invitada')
  assert.equal(v.persona.puedeDarAcceso, false)
  assert.equal((await entrar('gus@example.com', 'clave-de-gus-1')).statusCode, 401)
})

test('cookies inventadas, caducadas o de una sesión revocada no valen', async () => {
  assert.equal(await A.personaDeCookie('basura'), null)
  assert.equal(await A.personaDeCookie(crypto.randomBytes(32).toString('base64url')), null)
  const s = cookieDe(await entrar('ana@example.com', 'clave-nueva-de-ana'))
  assert.ok(await A.personaDeCookie(s))
  assert.equal(await A.personaDeCookie(s, { ahora: new Date(Date.now() + 8 * 24 * H) }), null)
})

// ---------- Quién gestiona ----------

test('solo quien puede dar acceso gestiona; nadie se quita a sí mismo ni su permiso', async () => {
  const yo = await A.personaDeCookie(ana.cookie)
  const hugo = await cuentaCon(yo, 'Hugo Normal', 'hugo@example.com', 'clave-de-hugo-1', false)
  const comoHugo = await A.personaDeCookie(hugo.cookie)
  await assert.rejects(C.darAcceso(comoHugo, { nombre: 'Iris', email: 'iris@example.com' }, BASE), { codigo: 'permiso' })
  await assert.rejects(C.quitarAcceso(comoHugo, ana.id), { codigo: 'permiso' })
  await assert.rejects(C.quitarAcceso(yo, ana.id), { codigo: 'a_ti' })
  await assert.rejects(C.cambiarPermiso(yo, ana.id, false), { codigo: 'a_ti' })
  assert.equal((await llamar(rutaPersonas, { cookie: hugo.cookie, body: { accion: 'dar_acceso', nombre: 'Iris', email: 'iris@example.com' } })).statusCode, 403)
  assert.equal((await llamar(rutaPersonas, { body: { accion: 'dar_acceso', nombre: 'Iris', email: 'iris@example.com' } })).statusCode, 401)
  const bien = await llamar(rutaPersonas, { cookie: ana.cookie, body: { accion: 'dar_acceso', nombre: 'Iris Nueva', email: 'iris@example.com' } })
  assert.equal(bien.statusCode, 200, JSON.stringify(bien.cuerpo))
  // Dar y quitar el permiso por la ruta
  const dar = await llamar(rutaPersonas, { cookie: ana.cookie, body: { accion: 'cambiar_permiso', id: hugo.id, puedeDarAcceso: true } })
  assert.equal(dar.statusCode, 200)
  assert.equal((await A.personaDeCookie(hugo.cookie)).puedeDarAcceso, true)
  await C.cambiarPermiso(yo, hugo.id, false)
  assert.equal((await A.personaDeCookie(hugo.cookie)).puedeDarAcceso, false)
})

test('el paso a cuentas no tiene vuelta atrás: dos que se quitan a la vez no dejan el panel sin nadie', async () => {
  const yo = await A.personaDeCookie(ana.cookie)
  const bea = await cuentaCon(yo, 'Bea Dos', 'bea@example.com', 'clave-de-bea-123', true)
  // Una invitada que puede dar acceso pero no tiene contraseña no cuenta
  await C.darAcceso(yo, { nombre: 'Xavi Invitado', email: 'xavi@example.com', puedeDarAcceso: true }, BASE)
  // Quitar a la vez a todas las demás que pueden dar acceso, para que queden solo Ana y Bea
  for (const p of await C.listarPersonas()) {
    if (p.activa && p.puedeDarAcceso && p.conClave && ![ana.id, bea.id].includes(p.id)) await C.quitarAcceso(yo, p.id)
  }
  const [r1, r2] = await Promise.all([
    llamar(rutaPersonas, { body: { accion: 'quitar', id: bea.id }, cookie: ana.cookie }),
    llamar(rutaPersonas, { body: { accion: 'quitar', id: ana.id }, cookie: bea.cookie }),
  ])
  assert.deepEqual([r1.statusCode, r2.statusCode].sort(), [200, 403])
  const { rows } = await query('SELECT count(*)::int AS n FROM personas_panel WHERE activa AND puede_dar_acceso AND clave_hash IS NOT NULL')
  assert.equal(rows[0].n, 1)
  // Quien queda no se puede quitar ni quitar el permiso, y la contraseña compartida no vuelve
  const queda = r1.statusCode === 200 ? ana : bea
  const comoQueda = await A.personaDeCookie(queda.cookie)
  await assert.rejects(C.quitarAcceso(comoQueda, queda.id), { codigo: 'a_ti' })
  assert.equal(await A.hayCuentas(), true)
  assert.equal(await A.personaDeCookie(cookieCompartidaVieja), null)
  assert.equal((await llamar(rutaLogin, { body: { contrasena: 'estudio' } })).statusCode, 401)
  // Si Ana se fue, que vuelva (para las pruebas de después)
  if (queda === bea) {
    const v = await C.volverADarAcceso(comoQueda, ana.id, BASE, { puedeDarAcceso: true })
    const { token } = await C.guardarClaveConEnlace(tokenDe(v.url), 'clave-nueva-de-ana', 'clave-nueva-de-ana')
    ana.cookie = token
  }
})

test('no se puede dejar sin permiso a la última que puede dar acceso', async () => {
  const yo = await A.personaDeCookie(ana.cookie)
  // Quitar el permiso o el acceso a todas las demás con permiso
  for (const p of await C.listarPersonas()) {
    if (p.id !== ana.id && p.activa && p.puedeDarAcceso) await C.quitarAcceso(yo, p.id)
  }
  const lola = await cuentaCon(yo, 'Lola Gestora', 'lola@example.com', 'clave-de-lola-1', true)
  const comoLola = await A.personaDeCookie(lola.cookie)
  await C.cambiarPermiso(comoLola, ana.id, false)
  // Ahora Lola es la única: Ana no puede quitarle el permiso (ya no tiene) y nadie más puede
  await assert.rejects(C.cambiarPermiso(yo, lola.id, false), { codigo: 'permiso' })
  await assert.rejects(C.cambiarPermiso(comoLola, lola.id, false), { codigo: 'a_ti' })
  await C.cambiarPermiso(comoLola, ana.id, true)
})

// ---------- Límites ----------

test('límites: una ráfaga en paralelo no se salta el límite', async () => {
  await query('DELETE FROM limites')
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => entrar('bea@example.com', `mala-${i}-xxxxxx`, { ipFija: '203.0.113.7' })))
  const comprobados = rs.filter((r) => r.statusCode === 401).length
  assert.ok(comprobados <= 5, `se comprobaron ${comprobados} contraseñas`)
  assert.equal(rs.filter((r) => r.statusCode === 429).length, 40 - comprobados)
})

test('límites: nadie puede dejar fuera a otra persona desde otra conexión', async () => {
  await query('DELETE FROM limites')
  for (let i = 0; i < 5; i++) await entrar('ana@example.com', 'nope-nope-nope', { ipFija: '198.51.100.1' })
  assert.equal((await entrar('ana@example.com', 'nope-nope-nope', { ipFija: '198.51.100.1' })).statusCode, 429)
  // Ana, desde su conexión y con su contraseña, entra
  assert.equal((await entrar('ana@example.com', 'clave-nueva-de-ana', { ipFija: '192.0.2.50' })).statusCode, 200)
  // Y puede pedir su enlace aunque otra conexión haya pedido 3
  for (let i = 0; i < 3; i++) await llamar(rutaOlvidada, { body: { email: 'ana@example.com' }, ipFija: '198.51.100.1' })
  assert.equal((await llamar(rutaOlvidada, { body: { email: 'ana@example.com' }, ipFija: '198.51.100.1' })).statusCode, 429)
  assert.equal((await llamar(rutaOlvidada, { body: { email: 'ana@example.com' }, ipFija: '192.0.2.50' })).statusCode, 200)
  // Por conexión: 8 fallos con correos distintos desde la misma IP
  for (let i = 0; i < 8; i++) assert.equal((await entrar(`otro${i}@example.com`, 'nada-de-nada', { ipFija: '192.0.2.77' })).statusCode, 401)
  assert.equal((await entrar('ana@example.com', 'clave-nueva-de-ana', { ipFija: '192.0.2.77' })).statusCode, 429)
  // Entrar bien no gasta intentos
  await query('DELETE FROM limites')
  for (let i = 0; i < 10; i++) assert.equal((await entrar('ana@example.com', 'clave-nueva-de-ana', { ipFija: '192.0.2.88' })).statusCode, 200)
})

// ---------- Contraseñas ----------

test('contraseñas: scrypt con sal (N=2^15), nunca en claro; los resúmenes con N=2^14 siguen valiendo', async () => {
  const h1 = await C.resumirClave('misma-clave-123')
  const h2 = await C.resumirClave('misma-clave-123')
  assert.notEqual(h1, h2)
  assert.match(h1, /^scrypt\$32768\$8\$1\$/)
  assert.equal(await C.claveCorrecta('misma-clave-123', h1), true)
  assert.equal(await C.claveCorrecta('misma-clave-124', h1), false)
  assert.equal(await C.claveCorrecta('x', 'no-es-un-resumen'), false)
  const sal = crypto.randomBytes(16)
  const viejo = `scrypt$16384$8$1$${sal.toString('base64')}$${crypto.scryptSync('clave-antigua-1', sal, 64, { N: 16384, r: 8, p: 1 }).toString('base64')}`
  assert.equal(await C.claveCorrecta('clave-antigua-1', viejo), true)
  const { rows } = await query('SELECT clave_hash FROM personas_panel WHERE clave_hash IS NOT NULL')
  assert.ok(rows.length > 0 && rows.every((r) => r.clave_hash.startsWith('scrypt$')))
})
