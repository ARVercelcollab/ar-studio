// Cuentas del panel: quién puede entrar, sus contraseñas y los enlaces para crearlas o cambiarlas.
//
// - Contraseñas con scrypt (node:crypto), sal aleatoria de 16 bytes, guardadas como
//   «scrypt$N$r$p$sal$resumen». Se comparan en tiempo constante, y si el correo no existe se
//   calcula igual un scrypt para que no se note por lo que tarda.
// - Enlaces de invitación (72 h) y de recuperar (1 h): de un solo uso; solo se guarda su sha256.
//   Se gastan al guardar la contraseña, no al abrir la página (los antivirus del correo abren los
//   enlaces). Al poner contraseña se cierran las demás sesiones de esa persona.
// - Solo quien puede dar acceso gestiona a las personas; nadie se quita el acceso a sí mismo ni se
//   puede quitar a la última que puede dar acceso.

import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { query, transaction } from '../db/index.js'
import { ErrorReserva } from '../reservas/servicio.js'
import { plantilla, enviar, esc } from '../reservas/correos.js'
import { iniciales } from './auth.js'

const scrypt = promisify(crypto.scrypt)
const N = 16384
const R = 8
const P = 1
const LARGO = 64
export const MINIMO_CLAVE = 10
export const HORAS_INVITACION = 72
export const HORAS_RECUPERAR = 1
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/

export const MENSAJE_OLVIDADA = 'Si ese correo tiene acceso, te llega un enlace para poner otra contraseña.'
export const MENSAJE_ENLACE_MALO = 'Este enlace ya no vale. Pide otro desde la entrada («¿Has olvidado la contraseña?») o a quien te dio acceso.'
export const MENSAJE_ENTRADA_MALA = 'Correo o contraseña incorrectos.'

const resumen = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex')
export const normalizarEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 120)
const texto = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max)

// ---------- Contraseñas ----------

export async function resumirClave(clave) {
  const sal = crypto.randomBytes(16)
  const h = await scrypt(String(clave), sal, LARGO, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${Buffer.from(h).toString('base64')}`
}

export async function claveCorrecta(clave, guardado) {
  const partes = String(guardado || '').split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false
  const [, n, r, p, salB64, hB64] = partes
  const esperado = Buffer.from(hB64, 'base64')
  const h = Buffer.from(await scrypt(String(clave ?? ''), Buffer.from(salB64, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) }))
  return h.length === esperado.length && crypto.timingSafeEqual(h, esperado)
}

// Resumen de una contraseña que nadie tiene: para gastar el mismo tiempo si el correo no existe
let falso = null
async function resumenFalso() {
  if (!falso) falso = await resumirClave(crypto.randomBytes(24).toString('base64'))
  return falso
}

export function validarClave(clave, repetida) {
  const c = String(clave || '')
  if (c.length < MINIMO_CLAVE) return `La contraseña tiene que tener al menos ${MINIMO_CLAVE} caracteres.`
  if (c.length > 200) return 'La contraseña es demasiado larga.'
  if (repetida !== undefined && c !== String(repetida || '')) return 'Las dos contraseñas no coinciden.'
  return null
}

// ---------- Personas ----------

function aPersona(f) {
  if (!f) return null
  const estado = !f.activa ? 'sin_acceso' : f.clave_hash ? 'activa' : 'invitada'
  return {
    id: f.id,
    nombre: f.nombre,
    email: f.email,
    puedeDarAcceso: Boolean(f.puede_dar_acceso),
    activa: Boolean(f.activa),
    conClave: Boolean(f.clave_hash),
    estado,
    creadoEn: f.creado_en ? new Date(f.creado_en).toISOString() : null,
    ultimoAccesoEn: f.ultimo_acceso_en ? new Date(f.ultimo_acceso_en).toISOString() : null,
    invitacionEnviadaEn: f.invitacion_en ? new Date(f.invitacion_en).toISOString() : null,
    invitadoPor: f.invitado_por || null,
    iniciales: iniciales(f.nombre),
  }
}

export async function listarPersonas() {
  const { rows } = await query(
    `SELECT p.*, (SELECT max(e.creado_en) FROM enlaces_panel e WHERE e.persona_id = p.id AND e.tipo = 'invitacion') AS invitacion_en
       FROM personas_panel p ORDER BY p.activa DESC, lower(p.nombre)`
  )
  return rows.map(aPersona)
}

export async function personaPorId(id) {
  const { rows } = await query('SELECT * FROM personas_panel WHERE id = $1', [Number(id)])
  return aPersona(rows[0])
}

function exigirGestor(quien) {
  if (!quien?.puedeDarAcceso) throw new ErrorReserva('permiso', 'Solo quien puede dar acceso gestiona las personas del panel.', 403)
}

function nombreDe(quien) {
  return quien?.compartida ? 'AR Studio' : quien?.nombre || 'AR Studio'
}

// ---------- Enlaces ----------

async function nuevoEnlace(q, personaId, tipo, ahora = new Date()) {
  // Los enlaces anteriores del mismo tipo que no se usaron dejan de valer
  await q(`UPDATE enlaces_panel SET usado_en = $3 WHERE persona_id = $1 AND tipo = $2 AND usado_en IS NULL`, [personaId, tipo, ahora])
  const token = crypto.randomBytes(32).toString('base64url')
  const horas = tipo === 'invitacion' ? HORAS_INVITACION : HORAS_RECUPERAR
  await q(
    `INSERT INTO enlaces_panel (persona_id, tipo, token_hash, expira_en) VALUES ($1, $2, $3, $4::timestamptz + make_interval(hours => $5))`,
    [personaId, tipo, resumen(token), ahora, horas]
  )
  return token
}

export const urlClave = (base, token) => `${base}/admin/clave?t=${encodeURIComponent(token)}`

// Lo que dice un enlace sin gastarlo (para el título de la página): { tipo, nombre, email } | null
export async function verEnlace(token, ahora = new Date()) {
  if (!token || typeof token !== 'string' || token.length > 200) return null
  const { rows } = await query(
    `SELECT e.tipo, p.nombre, p.email FROM enlaces_panel e JOIN personas_panel p ON p.id = e.persona_id
      WHERE e.token_hash = $1 AND e.usado_en IS NULL AND e.expira_en > $2 AND p.activa`,
    [resumen(token), ahora]
  )
  return rows[0] ? { tipo: rows[0].tipo, nombre: rows[0].nombre, email: rows[0].email } : null
}

// Gasta el enlace y guarda la contraseña. Cierra las demás sesiones (sesiones_desde = ahora).
// Devuelve la persona (para abrirle la sesión con la misma hora `ahora`).
export async function guardarClaveConEnlace(token, clave, repetida, { ahora = new Date() } = {}) {
  const fallo = validarClave(clave, repetida)
  if (fallo) throw new ErrorReserva('clave', fallo, 400)
  if (!token || typeof token !== 'string' || token.length > 200) throw new ErrorReserva('enlace', MENSAJE_ENLACE_MALO, 400)
  const hash = await resumirClave(clave)
  const fila = await transaction(async (tx) => {
    const { rows } = await tx.query(
      `UPDATE enlaces_panel e SET usado_en = $2
        FROM personas_panel p
        WHERE e.token_hash = $1 AND e.usado_en IS NULL AND e.expira_en > $2 AND p.id = e.persona_id AND p.activa
        RETURNING e.persona_id`,
      [resumen(token), ahora]
    )
    if (!rows[0]) return null
    const { rows: ps } = await tx.query(
      `UPDATE personas_panel SET clave_hash = $2, sesiones_desde = $3, ultimo_acceso_en = $3 WHERE id = $1 RETURNING *`,
      [rows[0].persona_id, hash, ahora]
    )
    // Cualquier otro enlace suyo sin usar deja de valer
    await tx.query('UPDATE enlaces_panel SET usado_en = $2 WHERE persona_id = $1 AND usado_en IS NULL', [rows[0].persona_id, ahora])
    return ps[0]
  })
  if (!fila) throw new ErrorReserva('enlace', MENSAJE_ENLACE_MALO, 400)
  return aPersona(fila)
}

// ---------- Entrar ----------

// La persona si el correo y la contraseña son buenos; null si no (tarda lo mismo exista o no)
export async function comprobarEntrada(email, clave, { ahora = new Date() } = {}) {
  const e = normalizarEmail(email)
  const { rows } = EMAIL.test(e)
    ? await query('SELECT * FROM personas_panel WHERE email = $1 AND activa AND clave_hash IS NOT NULL', [e])
    : { rows: [] }
  const p = rows[0]
  const bien = await claveCorrecta(typeof clave === 'string' ? clave : '', p ? p.clave_hash : await resumenFalso())
  if (!p || !bien) return null
  await query('UPDATE personas_panel SET ultimo_acceso_en = $2 WHERE id = $1', [p.id, ahora])
  return aPersona(p)
}

// ---------- Correos ----------

async function correoInvitacion(persona, url, de) {
  const html = plantilla({
    titulo: 'Te han dado acceso al panel de AR Studio',
    intro: `Hola ${esc(persona.nombre.split(' ')[0])}, ${esc(de)} te ha dado acceso al panel de AR Studio: las reservas, los miembros y las cuentas del estudio.<br><br>Crea tu contraseña para entrar. El enlace vale ${HORAS_INVITACION} horas y solo se puede usar una vez.`,
    boton: { url, texto: 'Crear mi contraseña' },
    bloques: [`Después entrarás en <b>studioar.es/admin</b> con este correo (${esc(persona.email)}) y tu contraseña.`],
  })
  return enviar({ para: persona.email, asunto: 'Te han dado acceso al panel de AR Studio', html })
}

async function correoRecuperar(persona, url) {
  const html = plantilla({
    titulo: 'Pon una contraseña nueva',
    intro: `Hola ${esc(persona.nombre.split(' ')[0])}, has pedido cambiar la contraseña del panel de AR Studio. El enlace vale ${HORAS_RECUPERAR === 1 ? '1 hora' : `${HORAS_RECUPERAR} horas`} y solo se puede usar una vez.`,
    boton: { url, texto: 'Poner contraseña nueva' },
    bloques: ['Si no lo has pedido tú, no hagas nada: tu contraseña sigue igual.'],
  })
  return enviar({ para: persona.email, asunto: 'Pon una contraseña nueva · AR Studio', html })
}

// ---------- Gestión (solo quien puede dar acceso) ----------

export async function darAcceso(quien, { nombre, email, puedeDarAcceso = false }, base, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  const n = texto(nombre, 80)
  const e = normalizarEmail(email)
  if (!n) throw new ErrorReserva('nombre', 'Escribe su nombre.', 400)
  if (!EMAIL.test(e)) throw new ErrorReserva('email', 'Revisa el correo.', 400)
  const { persona, token } = await transaction(async (tx) => {
    const { rows: ya } = await tx.query('SELECT * FROM personas_panel WHERE email = $1 FOR UPDATE', [e])
    if (ya[0]) {
      throw new ErrorReserva('ya', ya[0].activa
        ? `${ya[0].nombre} ya tiene acceso con ese correo.`
        : `${ya[0].nombre} ya estaba con ese correo: usa «Volver a dar acceso».`, 409)
    }
    const { rows } = await tx.query(
      `INSERT INTO personas_panel (nombre, email, puede_dar_acceso, invitado_por) VALUES ($1, $2, $3, $4) RETURNING *`,
      [n, e, Boolean(puedeDarAcceso), nombreDe(quien)]
    )
    return { persona: aPersona(rows[0]), token: await nuevoEnlace(tx.query, rows[0].id, 'invitacion', ahora) }
  })
  const url = urlClave(base, token)
  const envio = await correoInvitacion(persona, url, nombreDe(quien))
  // url: solo para las pruebas (la ruta no la devuelve)
  return { persona, enviado: !envio?.noEnviado, motivo: envio?.motivo || null, url }
}

async function cargarParaCambiar(q, id) {
  const { rows } = await q('SELECT * FROM personas_panel WHERE id = $1 FOR UPDATE', [Number(id)])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'No encontramos a esa persona.', 404)
  return rows[0]
}

export async function reenviarInvitacion(quien, id, base, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  const { persona, token } = await transaction(async (tx) => {
    const p = await cargarParaCambiar(tx.query, id)
    if (!p.activa) throw new ErrorReserva('sin_acceso', `${p.nombre} no tiene acceso: usa «Volver a dar acceso».`, 409)
    if (p.clave_hash) throw new ErrorReserva('ya', `${p.nombre} ya tiene su contraseña. Si la ha olvidado, que use «¿Has olvidado la contraseña?» en la entrada.`, 409)
    return { persona: aPersona(p), token: await nuevoEnlace(tx.query, p.id, 'invitacion', ahora) }
  })
  const url = urlClave(base, token)
  const envio = await correoInvitacion(persona, url, nombreDe(quien))
  // url: solo para las pruebas (la ruta no la devuelve)
  return { persona, enviado: !envio?.noEnviado, motivo: envio?.motivo || null, url }
}

export async function cerrarSesionesDe(quien, id, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  const { rows } = await query('UPDATE personas_panel SET sesiones_desde = $2 WHERE id = $1 RETURNING *', [Number(id), ahora])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'No encontramos a esa persona.', 404)
  return aPersona(rows[0])
}

export async function quitarAcceso(quien, id, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  if (!quien.compartida && Number(id) === quien.id) throw new ErrorReserva('a_ti', 'No puedes quitarte el acceso a ti. Pídeselo a otra persona que pueda dar acceso.', 409)
  return transaction(async (tx) => {
    // Candado para que dos personas no se quiten a la vez y quede el panel sin nadie
    await tx.query('SELECT pg_advisory_xact_lock(7271003)')
    const p = await cargarParaCambiar(tx.query, id)
    if (!p.activa) return aPersona(p)
    if (p.puede_dar_acceso) {
      const { rows } = await tx.query('SELECT count(*)::int AS n FROM personas_panel WHERE activa AND puede_dar_acceso AND id <> $1', [p.id])
      if (rows[0].n === 0) throw new ErrorReserva('ultima', `${p.nombre} es la única que puede dar acceso: dale ese permiso a otra persona antes de quitarla.`, 409)
    }
    const { rows } = await tx.query('UPDATE personas_panel SET activa = false, sesiones_desde = $2 WHERE id = $1 RETURNING *', [p.id, ahora])
    await tx.query('UPDATE enlaces_panel SET usado_en = $2 WHERE persona_id = $1 AND usado_en IS NULL', [p.id, ahora])
    return aPersona(rows[0])
  })
}

// Vuelve a tener acceso con una invitación nueva (crea otra contraseña: la de antes ya no vale)
export async function volverADarAcceso(quien, id, base, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  const { persona, token } = await transaction(async (tx) => {
    const p = await cargarParaCambiar(tx.query, id)
    if (p.activa) throw new ErrorReserva('ya', `${p.nombre} ya tiene acceso.`, 409)
    const { rows } = await tx.query(
      'UPDATE personas_panel SET activa = true, clave_hash = NULL, sesiones_desde = $2, invitado_por = $3 WHERE id = $1 RETURNING *',
      [p.id, ahora, nombreDe(quien)]
    )
    return { persona: aPersona(rows[0]), token: await nuevoEnlace(tx.query, p.id, 'invitacion', ahora) }
  })
  const url = urlClave(base, token)
  const envio = await correoInvitacion(persona, url, nombreDe(quien))
  // url: solo para las pruebas (la ruta no la devuelve)
  return { persona, enviado: !envio?.noEnviado, motivo: envio?.motivo || null, url }
}

// ---------- He olvidado la contraseña ----------

// Siempre se contesta lo mismo; solo sale el correo si la persona tiene acceso
export async function pedirRecuperar(email, base, { ahora = new Date() } = {}) {
  const e = normalizarEmail(email)
  if (!EMAIL.test(e)) return { enviado: false, motivo: 'correo' }
  const { rows } = await query('SELECT * FROM personas_panel WHERE email = $1 AND activa', [e])
  if (!rows[0]) return { enviado: false, motivo: 'sin_acceso' }
  const token = await transaction(async (tx) => nuevoEnlace(tx.query, rows[0].id, 'recuperar', ahora))
  const url = urlClave(base, token)
  await correoRecuperar(aPersona(rows[0]), url)
  return { enviado: true, url }
}
