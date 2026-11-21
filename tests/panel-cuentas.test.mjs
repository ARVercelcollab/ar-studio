// Cuentas del panel: cada persona entra con su correo y su contraseña. Paso desde la contraseña
// compartida, invitaciones, recuperar, quitar el acceso y límites. Con PGlite en memoria y sin
// datos reales.
process.env.PGLITE_DIR = 'memoria'
delete process.env.ADMIN_PASSWORD // en local la compartida es «estudio»

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as A from '../lib/admin/auth.js'
import * as C from '../lib/admin/cuentas.js'
import rutaLogin from '../pages/api/admin/login.js'
import rutaPersonas from '../pages/api/admin/personas.js'
import rutaGuardar from '../pages/api/admin/clave/guardar.js'
import rutaOlvidada from '../pages/api/admin/clave/olvidada.js'

after(() => cerrarDb())

const BASE = 'http://localhost:3000'
const H = 3600000
const COMPARTIDA = { id: 0, nombre: 'Estudio', puedeDarAcceso: true, compartida: true }
const tokenDe = (url) => new URL(url).searchParams.get('t')
let ip = 0

async function llamar(handler, { body = {}, cookie = null, ipFija = null } = {}) {
  const res = {
    statusCode: 200, headers: {}, cuerpo: null,
    setHeader(k, v) { this.headers[k] = v },
    getHeader(k) { return this.headers[k] },
    status(c) { this.statusCode = c; return this },
    json(d) { this.cuerpo = d; return this },
    send(d) { this.cuerpo = d; return this },
    end(d) { if (d !== undefined && this.cuerpo === null) this.cuerpo = d; return this },
  }
  const req = {
    method: 'POST', headers: { host: 'localhost', origin: 'http://localhost' }, body, query: {},
    cookies: cookie ? { ar_admin: cookie } : {}, socket: { remoteAddress: ipFija || `10.1.${Math.floor(++ip / 250)}.${ip % 250}` },
  }
  await handler(req, res)
  return res
}
const cookieDe = (res) => {
  const c = res.headers['Set-Cookie']
  return c ? c.split(';')[0].split('=').slice(1).join('=') : null
}

// ---------- Antes de que nadie tenga contraseña ----------

test('sin cuentas se entra con la contraseña compartida; la sesión id 0 puede dar acceso', async () => {
  assert.equal(await A.hayCuentas(), false)
  const mala = await llamar(rutaLogin, { body: { contrasena: 'otra cosa' } })
  assert.equal(mala.statusCode, 401)
  const buena = await llamar(rutaLogin, { body: { contrasena: 'estudio' } })
  assert.equal(buena.statusCode, 200)
  const p = await A.personaDeCookie(cookieDe(buena))
  assert.equal(p.id, 0)
  assert.equal(p.compartida, true)
  assert.equal(p.puedeDarAcceso, true)
})

test('no se puede quitar a la última persona que puede dar acceso', async () => {
  const r = await C.darAcceso(COMPARTIDA, { nombre: 'Carla Gestora', email: 'carla.gestora@example.com', puedeDarAcceso: true }, BASE)
  await assert.rejects(C.quitarAcceso(COMPARTIDA, r.persona.id), { codigo: 'ultima' })
  // Con otra que también puede dar acceso, sí
  const otra = await C.darAcceso(COMPARTIDA, { nombre: 'Dora Gestora', email: 'dora.gestora@example.com', puedeDarAcceso: true }, BASE)
  const q = await C.quitarAcceso(COMPARTIDA, r.persona.id)
  assert.equal(q.activa, false)
  await assert.rejects(C.quitarAcceso(COMPARTIDA, otra.persona.id), { codigo: 'ultima' })
  // Una invitación sin contraseña todavía no cambia el modo
  assert.equal(await A.hayCuentas(), false)
})

test('dar acceso: el correo se guarda en minúsculas y no se repite', async () => {
  const r = await C.darAcceso(COMPARTIDA, { nombre: 'Eva Invitada', email: '  EVA.Invitada@Example.com ', puedeDarAcceso: false }, BASE)
  assert.equal(r.persona.email, 'eva.invitada@example.com')
  assert.equal(r.persona.estado, 'invitada')
  await assert.rejects(C.darAcceso(COMPARTIDA, { nombre: 'Eva Otra', email: 'eva.invitada@example.com' }, BASE), { codigo: 'ya' })
  await assert.rejects(C.darAcceso(COMPARTIDA, { nombre: '', email: 'x@example.com' }, BASE), { codigo: 'nombre' })
  await assert.rejects(C.darAcceso(COMPARTIDA, { nombre: 'X', email: 'no-es-correo' }, BASE), { codigo: 'email' })
  // Solo se guarda el resumen del enlace
  const { rows } = await query('SELECT token_hash FROM enlaces_panel e JOIN personas_panel p ON p.id = e.persona_id WHERE p.email = $1', ['eva.invitada@example.com'])
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].token_hash, tokenDe(r.url))
})

// ---------- Primera contraseña: se pasa a cuentas ----------

let ana = null
let cookieAna = null
let cookieCompartida = null

test('la primera contraseña pasa el panel a cuentas: la compartida deja de valer', async () => {
  cookieCompartida = cookieDe(await llamar(rutaLogin, { body: { contrasena: 'estudio' } }))
  const r = await C.darAcceso(COMPARTIDA, { nombre: 'Ana Prueba', email: 'ana.prueba@example.com', puedeDarAcceso: true }, BASE)
  const t = tokenDe(r.url)
  assert.deepEqual(await C.verEnlace(t), { tipo: 'invitacion', nombre: 'Ana Prueba', email: 'ana.prueba@example.com' })
  // Ver no gasta el enlace
  assert.ok(await C.verEnlace(t))
  // Contraseña corta o que no coincide
  const corta = await llamar(rutaGuardar, { body: { token: t, clave: 'corta', repetida: 'corta' } })
  assert.equal(corta.statusCode, 400)
  const distinta = await llamar(rutaGuardar, { body: { token: t, clave: 'una-clave-larga', repetida: 'otra-clave-larga' } })
  assert.equal(distinta.statusCode, 400)
  const ok = await llamar(rutaGuardar, { body: { token: t, clave: 'clave-de-ana-123', repetida: 'clave-de-ana-123' } })
  assert.equal(ok.statusCode, 200)
  cookieAna = cookieDe(ok)
  ana = await A.personaDeCookie(cookieAna)
  assert.equal(ana.email, 'ana.prueba@example.com')
  assert.equal(ana.puedeDarAcceso, true)
  // De un solo uso
  const otra = await llamar(rutaGuardar, { body: { token: t, clave: 'clave-de-ana-456', repetida: 'clave-de-ana-456' } })
  assert.equal(otra.statusCode, 400)
  assert.equal(otra.cuerpo.error, 'enlace')
  // Ya hay cuentas: la compartida y las sesiones id 0 no valen
  assert.equal(await A.hayCuentas(), true)
  assert.equal(await A.personaDeCookie(cookieCompartida), null)
  const compartida = await llamar(rutaLogin, { body: { contrasena: 'estudio' } })
  assert.equal(compartida.statusCode, 401)
})

test('entrar con correo y contraseña; el correo que no existe da la misma respuesta', async () => {
  const buena = await llamar(rutaLogin, { body: { email: 'ANA.prueba@example.com', contrasena: 'clave-de-ana-123' } })
  assert.equal(buena.statusCode, 200)
  assert.equal((await A.personaDeCookie(cookieDe(buena))).id, ana.id)
  const mala = await llamar(rutaLogin, { body: { email: 'ana.prueba@example.com', contrasena: 'no-es-esta-clave' } })
  const nadie = await llamar(rutaLogin, { body: { email: 'nadie@example.com', contrasena: 'no-es-esta-clave' } })
  assert.equal(mala.statusCode, 401)
  assert.equal(nadie.statusCode, 401)
  assert.equal(mala.cuerpo.mensaje, nadie.cuerpo.mensaje)
  assert.equal(cookieDe(mala), null)
  // Una invitada sin contraseña todavía no puede entrar
  const eva = await llamar(rutaLogin, { body: { email: 'eva.invitada@example.com', contrasena: 'cualquier-cosa-larga' } })
  assert.equal(eva.statusCode, 401)
})

test('invitación caducada a las 72 h', async () => {
  const ahora = new Date()
  const r = await C.darAcceso(ana, { nombre: 'Fran Tarde', email: 'fran.tarde@example.com' }, BASE, { ahora })
  const t = tokenDe(r.url)
  await assert.rejects(C.guardarClaveConEnlace(t, 'clave-de-fran-1', 'clave-de-fran-1', { ahora: new Date(ahora.getTime() + 73 * H) }), { codigo: 'enlace' })
  // Reenviar crea otro y el anterior ya no vale
  const otra = await C.reenviarInvitacion(ana, r.persona.id, BASE)
  assert.equal(await C.verEnlace(t), null)
  const p = await C.guardarClaveConEnlace(tokenDe(otra.url), 'clave-de-fran-1', 'clave-de-fran-1')
  assert.equal(p.estado, 'activa')
})

test('recuperar la contraseña cierra las demás sesiones', async () => {
  const t0 = new Date()
  const vieja = A.valorCookie(ana.id, t0.getTime())
  assert.ok(await A.personaDeCookie(vieja))
  await new Promise((r) => setTimeout(r, 15))
  const r = await C.pedirRecuperar('ana.prueba@example.com', BASE, { ahora: t0 })
  assert.equal(r.enviado, true)
  assert.equal((await C.verEnlace(tokenDe(r.url))).tipo, 'recuperar')
  // Correo sin acceso: no se manda nada (la ruta contesta lo mismo)
  assert.equal((await C.pedirRecuperar('nadie@example.com', BASE)).enviado, false)
  const res = await llamar(rutaGuardar, { body: { token: tokenDe(r.url), clave: 'clave-nueva-de-ana', repetida: 'clave-nueva-de-ana' } })
  assert.equal(res.statusCode, 200)
  assert.equal(await A.personaDeCookie(vieja), null)
  assert.equal(await A.personaDeCookie(cookieAna), null)
  cookieAna = cookieDe(res)
  assert.equal((await A.personaDeCookie(cookieAna)).id, ana.id)
  // El enlace de recuperar caduca a la hora
  const r2 = await C.pedirRecuperar('ana.prueba@example.com', BASE)
  await assert.rejects(C.guardarClaveConEnlace(tokenDe(r2.url), 'otra-clave-nueva', 'otra-clave-nueva', { ahora: new Date(Date.now() + 61 * 60000) }), { codigo: 'enlace' })
  // La ruta de «olvidada» contesta lo mismo exista o no
  const a = await llamar(rutaOlvidada, { body: { email: 'ana.prueba@example.com' } })
  const b = await llamar(rutaOlvidada, { body: { email: 'nadie.mas@example.com' } })
  assert.equal(a.statusCode, 200)
  assert.deepEqual(a.cuerpo, b.cuerpo)
})

test('quitar el acceso deja fuera al momento, aunque tenga la cookie; cerrar sesiones también', async () => {
  const r = await C.darAcceso(ana, { nombre: 'Gus Temporal', email: 'gus.temporal@example.com' }, BASE)
  await C.guardarClaveConEnlace(tokenDe(r.url), 'clave-de-gus-1', 'clave-de-gus-1')
  const cookieGus = cookieDe(await llamar(rutaLogin, { body: { email: 'gus.temporal@example.com', contrasena: 'clave-de-gus-1' } }))
  const gus = await A.personaDeCookie(cookieGus)
  assert.equal(gus.puedeDarAcceso, false)
  // Cerrar sus sesiones
  await C.cerrarSesionesDe(ana, gus.id, { ahora: new Date(Date.now() + 1000) })
  assert.equal(await A.personaDeCookie(cookieGus), null)
  const otraVez = cookieDe(await llamar(rutaLogin, { body: { email: 'gus.temporal@example.com', contrasena: 'clave-de-gus-1' } }))
  // (la nueva es posterior al cierre)
  await query('UPDATE personas_panel SET sesiones_desde = now() - interval \'1 minute\' WHERE id = $1', [gus.id])
  assert.ok(await A.personaDeCookie(otraVez))
  // Quitar el acceso
  await C.quitarAcceso(ana, gus.id)
  assert.equal(await A.personaDeCookie(otraVez), null)
  const entra = await llamar(rutaLogin, { body: { email: 'gus.temporal@example.com', contrasena: 'clave-de-gus-1' } })
  assert.equal(entra.statusCode, 401)
  // Volver a dar acceso pide crear otra contraseña (la de antes ya no vale)
  const v = await C.volverADarAcceso(ana, gus.id, BASE)
  assert.equal(v.persona.estado, 'invitada')
  const vieja = await llamar(rutaLogin, { body: { email: 'gus.temporal@example.com', contrasena: 'clave-de-gus-1' } })
  assert.equal(vieja.statusCode, 401)
})

test('solo quien puede dar acceso gestiona personas; nadie se quita el acceso a sí mismo', async () => {
  const r = await C.darAcceso(ana, { nombre: 'Hugo Normal', email: 'hugo.normal@example.com', puedeDarAcceso: false }, BASE)
  const p = await C.guardarClaveConEnlace(tokenDe(r.url), 'clave-de-hugo-1', 'clave-de-hugo-1')
  const hugo = { ...p, compartida: false }
  await assert.rejects(C.darAcceso(hugo, { nombre: 'Iris', email: 'iris@example.com' }, BASE), { codigo: 'permiso' })
  await assert.rejects(C.quitarAcceso(hugo, ana.id), { codigo: 'permiso' })
  await assert.rejects(C.quitarAcceso(ana, ana.id), { codigo: 'a_ti' })
  // Y por la ruta: con la cookie de Hugo, 403
  const cookieHugo = cookieDe(await llamar(rutaLogin, { body: { email: 'hugo.normal@example.com', contrasena: 'clave-de-hugo-1' } }))
  const res = await llamar(rutaPersonas, { cookie: cookieHugo, body: { accion: 'dar_acceso', nombre: 'Iris', email: 'iris@example.com' } })
  assert.equal(res.statusCode, 403)
  // Sin cookie, 401; con la de Ana, sí
  assert.equal((await llamar(rutaPersonas, { body: { accion: 'dar_acceso', nombre: 'Iris', email: 'iris@example.com' } })).statusCode, 401)
  const bien = await llamar(rutaPersonas, { cookie: cookieAna, body: { accion: 'dar_acceso', nombre: 'Iris Nueva', email: 'iris@example.com' } })
  assert.equal(bien.statusCode, 200, JSON.stringify(bien.cuerpo))
})

test('cookies falsas o caducadas no valen', async () => {
  assert.equal(await A.personaDeCookie('basura'), null)
  assert.equal(await A.personaDeCookie(`${ana.id}.1.99999999999.firma-falsa`), null)
  const caducada = A.valorCookie(ana.id, Date.now() - 8 * 24 * H)
  assert.equal(await A.personaDeCookie(caducada), null)
  // La firma no se puede trasladar a otra persona
  const [, emitida, caduca, f] = cookieAna.split('.')
  assert.equal(await A.personaDeCookie(`${ana.id + 1}.${emitida}.${caduca}.${f}`), null)
})

test('límites: 5 fallos por correo y 8 por conexión cada 15 minutos', async () => {
  await query('DELETE FROM limites') // los fallos de las pruebas de antes no cuentan
  for (let i = 0; i < 5; i++) {
    const r = await llamar(rutaLogin, { body: { email: 'ana.prueba@example.com', contrasena: `mal-${i}-xxxxxx` } })
    assert.equal(r.statusCode, 401)
  }
  // Aunque ahora acierte (y desde otra conexión), espera
  const bloqueada = await llamar(rutaLogin, { body: { email: 'ana.prueba@example.com', contrasena: 'clave-nueva-de-ana' } })
  assert.equal(bloqueada.statusCode, 429)
  // Por conexión: 8 fallos con correos distintos desde la misma IP
  for (let i = 0; i < 8; i++) {
    const r = await llamar(rutaLogin, { ipFija: '192.0.2.77', body: { email: `otro${i}@example.com`, contrasena: 'nada-de-nada' } })
    assert.equal(r.statusCode, 401)
  }
  const nueve = await llamar(rutaLogin, { ipFija: '192.0.2.77', body: { email: 'hugo.normal@example.com', contrasena: 'clave-de-hugo-1' } })
  assert.equal(nueve.statusCode, 429)
})

test('contraseñas: scrypt con sal, nunca en claro', async () => {
  const h1 = await C.resumirClave('misma-clave-123')
  const h2 = await C.resumirClave('misma-clave-123')
  assert.notEqual(h1, h2)
  assert.match(h1, /^scrypt\$16384\$8\$1\$/)
  assert.equal(await C.claveCorrecta('misma-clave-123', h1), true)
  assert.equal(await C.claveCorrecta('misma-clave-124', h1), false)
  assert.equal(await C.claveCorrecta('x', 'no-es-un-resumen'), false)
  const { rows } = await query('SELECT clave_hash FROM personas_panel WHERE clave_hash IS NOT NULL')
  assert.ok(rows.length > 0 && rows.every((r) => r.clave_hash.startsWith('scrypt$')))
})
