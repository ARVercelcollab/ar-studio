// Cuentas del panel: quién puede entrar, sus contraseñas y los enlaces para crearlas o cambiarlas.
//
// - Contraseñas con scrypt (node:crypto, N=2^15), sal aleatoria de 16 bytes, guardadas como
//   «scrypt$N$r$p$sal$resumen» (los resúmenes con otros parámetros siguen valiendo). Se comparan
//   en tiempo constante, y si el correo no existe se calcula igual un scrypt para que no se note.
// - Enlaces de invitación (72 h) y de recuperar (1 h): de un solo uso; solo se guarda su sha256.
//   Se gastan al guardar la contraseña, no al abrir la página (los antivirus del correo abren los
//   enlaces). Recuperar solo vale para quien ya tiene contraseña.
// - Al poner contraseña se revocan TODAS las sesiones de esa persona en la misma transacción, y la
//   entrada comprueba que la contraseña no ha cambiado mientras se calculaba: una entrada con la
//   contraseña vieja que se cruce con el cambio no deja ninguna sesión viva.
// - La primera contraseña activa las cuentas para siempre (lib/admin/auth.js): se anulan todos los
//   demás enlaces sin usar y las sesiones de la contraseña compartida.
// - Solo quien puede dar acceso gestiona a las personas; nadie se quita el acceso ni el permiso a
//   sí mismo, ni se puede dejar el panel sin ninguna persona (activa y con contraseña) que pueda
//   dar acceso.

import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { query, transaction } from '../db/index.js'
import { ErrorReserva } from '../reservas/servicio.js'
import { plantilla, enviar, esc } from '../reservas/correos.js'
import { iniciales, crearSesion, revocarSesionesDe, MARCA_CUENTAS } from './auth.js'

const scrypt = promisify(crypto.scrypt)
const N = 32768
const R = 8
const P = 1
const LARGO = 64
const MAXMEM = 96 * 1024 * 1024
export const MINIMO_CLAVE = 10
export const HORAS_INVITACION = 72
export const HORAS_RECUPERAR = 1
const CANDADO_PERSONAS = 7271003
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/

export const MENSAJE_OLVIDADA = 'Si ese correo tiene acceso, te llega un enlace para poner otra contraseña.'
export const MENSAJE_ENLACE_MALO = 'Este enlace ya no vale. Pide otro desde la entrada («¿Has olvidado la contraseña?») o a quien te dio acceso.'
export const MENSAJE_ENTRADA_MALA = 'Correo o contraseña incorrectos.'

const resumen = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex')
export const normalizarEmail = (e) => String(e || '').normalize('NFC').trim().toLowerCase().slice(0, 120)
const texto = (v, max) => String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max)

// ---------- Contraseñas ----------

export async function resumirClave(clave) {
  const sal = crypto.randomBytes(16)
  const h = await scrypt(String(clave), sal, LARGO, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${Buffer.from(h).toString('base64')}`
}

export async function claveCorrecta(clave, guardado) {
  const partes = String(guardado || '').split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false
  const [, n, r, p, salB64, hB64] = partes
  if (![16384, 32768, 65536].includes(Number(n)) || Number(r) !== 8 || Number(p) !== 1) return false
  const esperado = Buffer.from(hB64, 'base64')
  if (esperado.length !== LARGO) return false
  const h = Buffer.from(await scrypt(String(clave ?? ''), Buffer.from(salB64, 'base64'), LARGO, { N: Number(n), r: 8, p: 1, maxmem: 2 * MAXMEM }))
  return crypto.timingSafeEqual(h, esperado)
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

// ---------- Límites de intentos (atómicos) ----------

// Reserva un intento en cada clave a la vez (con candado, contando y apuntando en la misma
// transacción): si alguna ya llegó a su máximo, no se apunta nada. Devuelve las marcas para
// soltarlas si el intento sale bien.
export async function reservarIntentos(limites, minutos) {
  const orden = [...limites].sort((a, b) => (a.clave < b.clave ? -1 : 1))
  return transaction(async (tx) => {
    for (const l of orden) await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [l.clave])
    for (const l of orden) {
      const { rows } = await tx.query(
        'SELECT count(*)::int AS n FROM limites WHERE clave = $1 AND creado_en > now() - make_interval(mins => $2)',
        [l.clave, minutos]
      )
      if (rows[0].n >= l.max) return { ok: false, marcas: [] }
    }
    const marcas = []
    for (const l of orden) {
      const { rows } = await tx.query('INSERT INTO limites (clave) VALUES ($1) RETURNING creado_en::text AS t', [l.clave])
      marcas.push([l.clave, rows[0].t])
    }
    return { ok: true, marcas }
  })
}

export async function soltarIntentos(marcas = []) {
  for (const [clave, t] of marcas) {
    await query('DELETE FROM limites WHERE ctid IN (SELECT ctid FROM limites WHERE clave = $1 AND creado_en::text = $2 LIMIT 1)', [clave, t])
  }
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

// Dentro del candado: quien hace el cambio sigue pudiendo dar acceso (o es la sesión compartida,
// que solo existe antes de las cuentas)
async function revalidarGestor(q, quien) {
  exigirGestor(quien)
  if (quien.compartida) {
    const { rows } = await q('SELECT 1 FROM ajustes WHERE clave = $1', [MARCA_CUENTAS])
    if (rows.length) throw new ErrorReserva('permiso', 'Vuelve a entrar en el panel.', 403)
    return
  }
  const { rows } = await q('SELECT activa, clave_hash IS NOT NULL AS con_clave, puede_dar_acceso FROM personas_panel WHERE id = $1 FOR UPDATE', [quien.id])
  const r = rows[0]
  if (!r || !r.activa || !r.con_clave || !r.puede_dar_acceso) throw new ErrorReserva('permiso', 'Solo quien puede dar acceso gestiona las personas del panel.', 403)
}

// ¿Quedaría alguna persona activa, con contraseña, que pueda dar acceso, además de esta?
async function quedanOtrosGestores(q, idQueSeVa) {
  const { rows } = await q(
    'SELECT count(*)::int AS n FROM personas_panel WHERE activa AND puede_dar_acceso AND clave_hash IS NOT NULL AND id <> $1',
    [idQueSeVa]
  )
  return rows[0].n > 0
}

const cuentaGestor = (p) => p.activa && p.puede_dar_acceso && p.clave_hash

function nombreDe(quien) {
  return quien?.compartida ? 'AR Studio' : quien?.nombre || 'AR Studio'
}

// ---------- Enlaces ----------

async function nuevoEnlace(q, personaId, tipo, ahora = new Date(), { anularAnteriores = true } = {}) {
  // Los enlaces anteriores del mismo tipo que no se usaron dejan de valer (salvo los de recuperar:
  // así nadie puede gastar el enlace de otra persona pidiendo otros)
  if (anularAnteriores) await q(`UPDATE enlaces_panel SET usado_en = $3 WHERE persona_id = $1 AND tipo = $2 AND usado_en IS NULL`, [personaId, tipo, ahora])
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
      WHERE e.token_hash = $1 AND e.usado_en IS NULL AND e.expira_en > $2 AND p.activa
        AND (e.tipo = 'invitacion' OR p.clave_hash IS NOT NULL)`,
    [resumen(token), ahora]
  )
  return rows[0] ? { tipo: rows[0].tipo, nombre: rows[0].nombre, email: rows[0].email } : null
}

// Gasta el enlace, guarda la contraseña, revoca TODAS sus sesiones y abre una nueva, todo en la
// misma transacción. La primera contraseña del panel activa las cuentas para siempre.
// Devuelve { persona, token } (token para la cookie).
export async function guardarClaveConEnlace(token, clave, repetida, { ahora = new Date() } = {}) {
  const fallo = validarClave(clave, repetida)
  if (fallo) throw new ErrorReserva('clave', fallo, 400)
  if (!token || typeof token !== 'string' || token.length > 200) throw new ErrorReserva('enlace', MENSAJE_ENLACE_MALO, 400)
  const hash = await resumirClave(clave)
  const r = await transaction(async (tx) => {
    const q = tx.query
    // En fila con los demás cambios de personas (y con otra primera contraseña a la vez)
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_PERSONAS])
    const { rows } = await q(
      `UPDATE enlaces_panel e SET usado_en = $2
        FROM personas_panel p
        WHERE e.token_hash = $1 AND e.usado_en IS NULL AND e.expira_en > $2 AND p.id = e.persona_id AND p.activa
          AND (e.tipo = 'invitacion' OR p.clave_hash IS NOT NULL)
        RETURNING e.id, e.persona_id`,
      [resumen(token), ahora]
    )
    if (!rows[0]) return null
    const { id: enlaceId, persona_id: personaId } = rows[0]
    // ¿Es la primera contraseña del panel? Se activan las cuentas para siempre
    const { rows: marca } = await q(
      `INSERT INTO ajustes (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING RETURNING clave`,
      [MARCA_CUENTAS, ahora.toISOString()]
    )
    if (marca.length) {
      // Fuera todo lo que se dio con la contraseña compartida: enlaces sin usar y sus sesiones
      await q('UPDATE enlaces_panel SET usado_en = $2 WHERE usado_en IS NULL AND id <> $1', [enlaceId, ahora])
      await revocarSesionesDe(q, null, ahora)
    }
    const { rows: ps } = await q(
      `UPDATE personas_panel SET clave_hash = $2, ultimo_acceso_en = $3 WHERE id = $1 RETURNING *`,
      [personaId, hash, ahora]
    )
    // Cualquier otro enlace suyo sin usar deja de valer y se cierran todas sus sesiones
    await q('UPDATE enlaces_panel SET usado_en = $2 WHERE persona_id = $1 AND usado_en IS NULL', [personaId, ahora])
    await revocarSesionesDe(q, personaId, ahora)
    const sesion = await crearSesion(q, personaId, ahora)
    return { persona: aPersona(ps[0]), token: sesion }
  })
  if (!r) throw new ErrorReserva('enlace', MENSAJE_ENLACE_MALO, 400)
  return r
}

// ---------- Entrar ----------

// { persona, token } si el correo y la contraseña son buenos; null si no (tarda lo mismo exista o
// no). La sesión se crea con la fila de la persona bloqueada y solo si su contraseña sigue siendo
// la que se ha comprobado: si se cambió mientras tanto, no entra.
export async function comprobarEntrada(email, clave, { ahora = new Date() } = {}) {
  const e = normalizarEmail(email)
  const { rows } = EMAIL.test(e)
    ? await query('SELECT * FROM personas_panel WHERE email = $1 AND activa AND clave_hash IS NOT NULL', [e])
    : { rows: [] }
  const p = rows[0]
  const bien = await claveCorrecta(typeof clave === 'string' ? clave : '', p ? p.clave_hash : await resumenFalso())
  if (!p || !bien) return null
  return transaction(async (tx) => {
    const { rows: ahoraMismo } = await tx.query('SELECT * FROM personas_panel WHERE id = $1 FOR UPDATE', [p.id])
    const f = ahoraMismo[0]
    if (!f || !f.activa || f.clave_hash !== p.clave_hash) return null
    await tx.query('UPDATE personas_panel SET ultimo_acceso_en = $2 WHERE id = $1', [p.id, ahora])
    const token = await crearSesion(tx.query, p.id, ahora)
    return { persona: aPersona(f), token }
  })
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

async function mandarInvitacion(persona, token, base, quien) {
  const url = urlClave(base, token)
  const envio = await correoInvitacion(persona, url, nombreDe(quien))
  // url: solo para las pruebas (la ruta no la devuelve)
  return { persona, enviado: !envio?.noEnviado, motivo: envio?.motivo || null, url }
}

// ---------- Gestión (solo quien puede dar acceso) ----------

export async function darAcceso(quien, { nombre, email, puedeDarAcceso = false }, base, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  const n = texto(nombre, 80)
  const e = normalizarEmail(email)
  if (!n) throw new ErrorReserva('nombre', 'Escribe su nombre.', 400)
  if (!EMAIL.test(e)) throw new ErrorReserva('email', 'Revisa el correo.', 400)
  const { persona, token } = await transaction(async (tx) => {
    await revalidarGestor(tx.query, quien)
    const { rows } = await tx.query(
      `INSERT INTO personas_panel (nombre, email, puede_dar_acceso, invitado_por) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [n, e, Boolean(puedeDarAcceso), nombreDe(quien)]
    )
    if (!rows[0]) {
      const { rows: ya } = await tx.query('SELECT nombre, activa FROM personas_panel WHERE email = $1', [e])
      throw new ErrorReserva('ya', ya[0]?.activa === false
        ? `${ya[0].nombre} ya estaba con ese correo: usa «Volver a dar acceso».`
        : `${ya[0]?.nombre || 'Esa persona'} ya tiene acceso con ese correo.`, 409)
    }
    return { persona: aPersona(rows[0]), token: await nuevoEnlace(tx.query, rows[0].id, 'invitacion', ahora) }
  })
  return mandarInvitacion(persona, token, base, quien)
}

async function cargarParaCambiar(q, id) {
  const { rows } = await q('SELECT * FROM personas_panel WHERE id = $1 FOR UPDATE', [Number(id)])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'No encontramos a esa persona.', 404)
  return rows[0]
}

export async function reenviarInvitacion(quien, id, base, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  const { persona, token } = await transaction(async (tx) => {
    await revalidarGestor(tx.query, quien)
    const p = await cargarParaCambiar(tx.query, id)
    if (!p.activa) throw new ErrorReserva('sin_acceso', `${p.nombre} no tiene acceso: usa «Volver a dar acceso».`, 409)
    if (p.clave_hash) throw new ErrorReserva('ya', `${p.nombre} ya tiene su contraseña. Si la ha olvidado, que use «¿Has olvidado la contraseña?» en la entrada.`, 409)
    return { persona: aPersona(p), token: await nuevoEnlace(tx.query, p.id, 'invitacion', ahora) }
  })
  return mandarInvitacion(persona, token, base, quien)
}

export async function cerrarSesionesDe(quien, id, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  return transaction(async (tx) => {
    await revalidarGestor(tx.query, quien)
    const p = await cargarParaCambiar(tx.query, id)
    await revocarSesionesDe(tx.query, p.id, ahora)
    return aPersona(p)
  })
}

export async function quitarAcceso(quien, id, { ahora = new Date() } = {}) {
  exigirGestor(quien)
  if (!quien.compartida && Number(id) === quien.id) throw new ErrorReserva('a_ti', 'No puedes quitarte el acceso a ti. Pídeselo a otra persona que pueda dar acceso.', 409)
  return transaction(async (tx) => {
    const q = tx.query
    // Candado para que dos personas no se quiten a la vez y quede el panel sin nadie
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_PERSONAS])
    await revalidarGestor(q, quien)
    const p = await cargarParaCambiar(q, id)
    if (!p.activa) return aPersona(p)
    if (cuentaGestor(p) && !(await quedanOtrosGestores(q, p.id))) {
      throw new ErrorReserva('ultima', `${p.nombre} es la única que puede dar acceso: dale ese permiso a otra persona antes de quitarla.`, 409)
    }
    const { rows } = await q('UPDATE personas_panel SET activa = false WHERE id = $1 RETURNING *', [p.id])
    await q('UPDATE enlaces_panel SET usado_en = $2 WHERE persona_id = $1 AND usado_en IS NULL', [p.id, ahora])
    await revocarSesionesDe(q, p.id, ahora)
    return aPersona(rows[0])
  })
}

// Cambia si puede dar acceso a otras personas
export async function cambiarPermiso(quien, id, puedeDarAcceso) {
  exigirGestor(quien)
  if (!quien.compartida && Number(id) === quien.id) throw new ErrorReserva('a_ti', 'No puedes cambiar tu propio permiso. Pídeselo a otra persona que pueda dar acceso.', 409)
  return transaction(async (tx) => {
    const q = tx.query
    await q('SELECT pg_advisory_xact_lock($1)', [CANDADO_PERSONAS])
    await revalidarGestor(q, quien)
    const p = await cargarParaCambiar(q, id)
    const nuevo = Boolean(puedeDarAcceso)
    if (!nuevo && cuentaGestor(p) && !(await quedanOtrosGestores(q, p.id))) {
      throw new ErrorReserva('ultima', `${p.nombre} es la única que puede dar acceso: dale ese permiso a otra persona antes.`, 409)
    }
    const { rows } = await q('UPDATE personas_panel SET puede_dar_acceso = $2 WHERE id = $1 RETURNING *', [p.id, nuevo])
    return aPersona(rows[0])
  })
}

// Vuelve a tener acceso con una invitación nueva (crea otra contraseña: la de antes ya no vale).
// El permiso de dar acceso se elige otra vez (por defecto, no).
export async function volverADarAcceso(quien, id, base, { ahora = new Date(), puedeDarAcceso = false } = {}) {
  exigirGestor(quien)
  const { persona, token } = await transaction(async (tx) => {
    await revalidarGestor(tx.query, quien)
    const p = await cargarParaCambiar(tx.query, id)
    if (p.activa) throw new ErrorReserva('ya', `${p.nombre} ya tiene acceso.`, 409)
    const { rows } = await tx.query(
      'UPDATE personas_panel SET activa = true, clave_hash = NULL, puede_dar_acceso = $2, invitado_por = $3 WHERE id = $1 RETURNING *',
      [p.id, Boolean(puedeDarAcceso), nombreDe(quien)]
    )
    await revocarSesionesDe(tx.query, p.id, ahora)
    return { persona: aPersona(rows[0]), token: await nuevoEnlace(tx.query, p.id, 'invitacion', ahora) }
  })
  return mandarInvitacion(persona, token, base, quien)
}

// ---------- He olvidado la contraseña ----------

// Siempre se contesta lo mismo; solo sale el correo si la persona tiene acceso Y contraseña (una
// invitada sin contraseña necesita que le reenvíen la invitación)
export async function pedirRecuperar(email, base, { ahora = new Date() } = {}) {
  const e = normalizarEmail(email)
  if (!EMAIL.test(e)) return { enviado: false, motivo: 'correo' }
  const { rows } = await query('SELECT * FROM personas_panel WHERE email = $1 AND activa AND clave_hash IS NOT NULL', [e])
  if (!rows[0]) return { enviado: false, motivo: 'sin_acceso' }
  const token = await transaction(async (tx) => nuevoEnlace(tx.query, rows[0].id, 'recuperar', ahora, { anularAnteriores: false }))
  const url = urlClave(base, token)
  await correoRecuperar(aPersona(rows[0]), url)
  return { enviado: true, url }
}
