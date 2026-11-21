// Fallos que encontró la revisión de facturas y de alta/cobros (noviembre de 2026), uno por
// prueba. Base de datos Postgres real en memoria (PGlite), TPV simulado y un buzón falso de
// Resend (se intercepta fetch) para ver qué correos salen y hacer que fallen.
import crypto from 'node:crypto'

process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.REDSYS_COBRO_RECURRENTE = '1'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-R'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-RS'
process.env.ESTUDIO_IBAN = 'ES00 0000 0000 0000 0000 0000'
process.env.RESEND_API_KEY = 're_prueba_no_es_real'
delete process.env.VERCEL
delete process.env.FACTURAS_AUTOMATICAS
process.env.REDSYS_CLAVE = crypto.randomBytes(24).toString('base64')

// ---- Buzón falso de Resend ----
const buzon = []
let fallarCorreo = null // null | (correo) => true si ese correo tiene que fallar
const fetchReal = globalThis.fetch
globalThis.fetch = async (url, op = {}) => {
  if (String(url).includes('api.resend.com')) {
    const correo = JSON.parse(op.body)
    buzon.push(correo)
    if (fallarCorreo && fallarCorreo(correo)) {
      return new Response(JSON.stringify({ name: 'application_error', message: 'Resend caído (prueba)', statusCode: 500 }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ id: `correo-${buzon.length}` }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return fetchReal(url, op)
}
const asuntos = () => buzon.map((c) => c.subject)
const vaciarBuzon = () => { buzon.length = 0 }

import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as F from '../lib/facturas/servicio.js'
import * as A from '../lib/suscripciones/alta.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import { tareasPendientes, cuotaImpagada } from '../lib/suscripciones/reglas.js'
import { LOGO_PNG_BASE64 } from '../lib/facturas/logo.js'
import { contratoSecciones, condicionesModelo, CONTRATO_VERSION } from '../lib/suscripciones/contrato.js'
import { emitirYEnviar } from '../lib/facturas/envio.js'
import { recibirResultado } from '../lib/reservas/flujo.js'
import { firmaSimulada } from '../lib/pagos/simulado.js'
import { abrirSesion } from '../lib/admin/auth.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'
import rutaNueva from '../pages/api/admin/reservas/nueva.js'
import rutaReserva from '../pages/api/admin/reservas/[id].js'
import rutaFacturaCliente from '../pages/api/reservas/[token]/factura.js'

after(() => cerrarDb())
beforeEach(() => {
  vaciarBuzon()
  fallarCorreo = null
  process.env.SIMULADO_MIT = 'ok'
})

const BASE = 'http://localhost'
const HOY = fechaMadrid(new Date())
const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, 1)
  usados.add(f)
  return f
}
let n = 0
const CLIENTE = () => ({ nombre: 'Marta', apellidos: 'Revisión', email: `rev${++n}@example.com`, telefono: '+34 600 000 000', actividad: 'Fotos' })
const DATOS = { nombre: 'Estudio Cliente SL', nif: 'B12345678', direccion: 'Avenida del Puerto 1, 46021 València' }
const vigente = async (reservaId) => (await query('SELECT * FROM facturas WHERE reserva_id = $1 AND sustituida_en IS NULL', [reservaId])).rows[0] || null
const eventos = async (reservaId) => (await query('SELECT tipo FROM eventos WHERE reserva_id = $1 ORDER BY id', [reservaId])).rows.map((e) => e.tipo)
const eventosSus = async (susId) => (await query('SELECT tipo, detalle FROM eventos WHERE suscripcion_id = $1 ORDER BY id', [susId])).rows

// Llama a una ruta de la API como lo haría el navegador (con la sesión del panel si hace falta)
const cookieAdmin = await (async () => {
  const h = {}
  await abrirSesion({ setHeader: (k, v) => { h[k] = v } })
  const [k, v] = h['Set-Cookie'].split(';')[0].split('=')
  return { [k]: v }
})()
async function llamar(handler, { body = {}, query: q = {}, admin = true, method = 'POST' } = {}) {
  const res = {
    statusCode: 200, headers: {}, cuerpo: null,
    setHeader(k, v) { this.headers[k] = v },
    getHeader(k) { return this.headers[k] },
    status(c) { this.statusCode = c; return this },
    json(d) { this.cuerpo = d; return this },
    send(d) { this.cuerpo = d; return this },
    end(d) { if (d !== undefined && this.cuerpo === null) this.cuerpo = d; return this },
  }
  const req = { method, headers: { host: 'localhost', origin: 'http://localhost' }, cookies: admin ? cookieAdmin : {}, body, query: q, socket: { remoteAddress: `10.0.0.${++n % 250}` } }
  await handler(req, res)
  return res
}

const pagarSimulado = (campos, resultado = 'ok', importe = campos.importe) =>
  recibirResultado('simulado', { pedido: campos.pedido, importe, resultado, firma: firmaSimulada(campos.pedido, importe, resultado) }, BASE)

// ================= Facturas =================

test('facturas 6: una reserva de 0 € no se factura (ni a mano)', async () => {
  const fecha = await laborable(30)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum', precioCent: 0 })
  await assert.rejects(F.emitirFactura(r.id), { codigo: 'importe' })
  assert.equal(await vigente(r.id), null)
})

test('facturas 7: «Reenviar» de una cuota devuelta con datos guardados después manda la simplificada que hay', async () => {
  const { suscripcion: sus } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Ana', apellidos: 'Reenvío', email: `reenvio${++n}@example.com`, telefono: '600000000',
    fechaInicio: HOY, metodoHabitual: 'transferencia', fianza: { estado: 'cobrada', metodo: 'transferencia', fecha: HOY },
  })
  const c1 = (await SUS.fichaSuscripcion(sus.id)).cuotas[0]
  await SUS.marcarCuotaPagada(c1.id, { metodo: 'transferencia' })
  const simple = (await F.emitirFacturaCuota(c1.id)).factura
  await SUS.devolverCuota(c1.id, {})
  await query('UPDATE suscripciones SET factura = $2 WHERE id = $1', [sus.id, JSON.stringify(DATOS)])
  const r = await F.emitirFacturaCuota(c1.id)
  assert.equal(r.nueva, false)
  assert.equal(r.factura.codigo, simple.codigo)
})

test('facturas 2: reserva apuntada ya pagada con el correo caído: se guarda, lleva factura y se apunta el fallo', async () => {
  const fecha = await laborable(31)
  fallarCorreo = (c) => /Reserva confirmada/.test(c.subject)
  const res = await llamar(rutaNueva, { body: { ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagado: true, metodoPago: 'bizum', enviarCorreo: true } })
  assert.equal(res.statusCode, 200, JSON.stringify(res.cuerpo))
  assert.match(res.cuerpo.mensaje, /No se ha podido mandar el correo/)
  const id = res.cuerpo.id
  assert.ok(await vigente(id), 'tiene factura')
  assert.ok((await eventos(id)).includes('correo_fallido'))
  assert.ok(asuntos().some((a) => /^Factura simplificada /.test(a)), 'la factura sí se ha enviado')
})

test('facturas 3: un pago que llegó con la reserva cancelada se factura al reactivarla, y antes sale en «cobros sin factura»', async () => {
  const fecha = await laborable(32)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'tarjeta' })
  await S.cancelar(r.id, { motivo: 'prueba', reembolsoCent: 0 })
  const dentroDeUnaHora = new Date(Date.now() + 3600000)
  assert.ok((await F.cobrosSinFactura({ ahora: dentroDeUnaHora })).reservas.some((x) => x.id === r.id))
  const res = await llamar(rutaReserva, { query: { id: String(r.id) }, body: { accion: 'reactivar' } })
  assert.equal(res.statusCode, 200, JSON.stringify(res.cuerpo))
  assert.ok(await vigente(r.id), 'al reactivarla sale su factura')
  assert.match(res.cuerpo.mensaje, /Factura AR-RS-/)
  assert.ok(!(await F.cobrosSinFactura({ ahora: dentroDeUnaHora })).reservas.some((x) => x.id === r.id))
})

test('facturas 5: emitir la completa desde el panel con el correo caído: queda emitida, se dice y se apunta', async () => {
  const fecha = await laborable(33)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum' })
  fallarCorreo = (c) => /^Factura /.test(c.subject)
  const res = await llamar(rutaReserva, { query: { id: String(r.id) }, body: { accion: 'factura', ...DATOS } })
  assert.equal(res.statusCode, 200, JSON.stringify(res.cuerpo))
  assert.match(res.cuerpo.mensaje, /emitida, pero no se ha podido enviar/)
  const f = await vigente(r.id)
  assert.equal(f.tipo, 'completa')
  assert.equal(f.enviada_en, null)
  assert.ok((await eventos(r.id)).includes('factura_fallida'))
})

test('facturas 8: la ruta del cliente respeta FACTURAS_AUTOMATICAS=0 y un doble clic manda un solo correo', async () => {
  const fecha = await laborable(34)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum' })
  process.env.FACTURAS_AUTOMATICAS = '0'
  try {
    const apagada = await llamar(rutaFacturaCliente, { admin: false, query: { token: r.token }, body: DATOS })
    assert.equal(apagada.statusCode, 409)
    assert.equal(await vigente(r.id), null)
  } finally {
    delete process.env.FACTURAS_AUTOMATICAS
  }
  vaciarBuzon()
  const [a, b] = await Promise.all([
    llamar(rutaFacturaCliente, { admin: false, query: { token: r.token }, body: DATOS }),
    llamar(rutaFacturaCliente, { admin: false, query: { token: r.token }, body: DATOS }),
  ])
  assert.deepEqual([a.statusCode, b.statusCode], [200, 200], JSON.stringify([a.cuerpo, b.cuerpo]))
  assert.equal(asuntos().filter((s) => /^Factura AR-R-/.test(s)).length, 1, asuntos().join(' | '))
  // Con otros datos ya no: la factura completa no se cambia desde la web
  const otra = await llamar(rutaFacturaCliente, { admin: false, query: { token: r.token }, body: { ...DATOS, nombre: 'Otra Empresa de Prueba SL' } })
  assert.equal(otra.statusCode, 409)
  assert.equal(asuntos().filter((s) => /^Factura AR-R-/.test(s)).length, 1)
})

test('fuera de alcance: en Vercel sin RESEND_API_KEY la factura no se marca enviada', async () => {
  const fecha = await laborable(35)
  const r = await S.crearReservaManual({ ...CLIENTE(), fecha, desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum' })
  const clave = process.env.RESEND_API_KEY
  process.env.VERCEL = '1'
  delete process.env.RESEND_API_KEY
  try {
    const x = await emitirYEnviar(r)
    assert.equal(x.enviada, false)
    assert.match(x.errorEnvio, /RESEND_API_KEY/)
    assert.equal((await vigente(r.id)).enviada_en, null)
  } finally {
    process.env.RESEND_API_KEY = clave
    delete process.env.VERCEL
  }
})

// ================= Alta y cobros =================

// Miembro con la tarjeta guardada y el periodo 2 ya empezado (hace 10 días)
async function miembroConTarjeta({ diasAtras = 40 } = {}) {
  const inicio = sumarDias(HOY, -diasAtras)
  const { suscripcion } = await SUS.crearSuscripcion({
    plan: 'creator', nombre: 'Cobro', apellidos: `Rev ${++n}`, email: `cobrorev${n}@example.com`, telefono: '600000000',
    fechaInicio: inicio, primeraPagada: { metodo: 'tarjeta', fecha: inicio }, fianza: { estado: 'cobrada', metodo: 'transferencia', fecha: inicio },
  })
  await query(
    `UPDATE suscripciones SET origen = 'web', cobro_auto = true, cobro_enlace = false, tarjeta_ref = $2, tarjeta_cof_txnid = 'TX1',
        tarjeta_ultimos = '0003', tarjeta_caduca = '4912', tarjeta_proveedor = 'simulado', tarjeta_guardada_en = now() WHERE id = $1`,
    [suscripcion.id, `SIMREV${n}`]
  )
  await SUS.asegurarCuotasDeTodas()
  const { rows } = await query('SELECT * FROM cuotas WHERE suscripcion_id = $1 AND periodo = 2', [suscripcion.id])
  return { sus: suscripcion, cuota2: rows[0] }
}
const cuota = async (id) => (await query('SELECT * FROM cuotas WHERE id = $1', [id])).rows[0]
const pagosDe = async (cuotaId) => (await query('SELECT * FROM pagos_suscripcion WHERE cuota_id = $1 ORDER BY id', [cuotaId])).rows
const tokenDe = async (cuotaId) => (await A.enviarEnlaceCuota(cuotaId, BASE)).url.split('/').pop()

test('alta 1: mientras quedan reintentos el correo del rechazo no ofrece transferencia; al agotarse, sí (y avisa del impago)', async () => {
  const { cuota2 } = await miembroConTarjeta()
  process.env.SIMULADO_MIT = 'ko'
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE)).resultado, 'rechazada')
  const primero = buzon.find((c) => /No hemos podido cobrar tu cuota/.test(c.subject))
  assert.ok(primero)
  assert.doesNotMatch(primero.html, /transferencia/)
  assert.match(primero.html, /Lo volveremos a intentar/)
  // Siguientes intentos hasta agotarlos
  vaciarBuzon()
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })).resultado, 'rechazada')
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })).resultado, 'agotada')
  const ultimo = buzon.filter((c) => /No hemos podido cobrar tu cuota/.test(c.subject)).at(-1)
  assert.match(ultimo.html, /transferencia a ES00/)
  assert.match(ultimo.html, /se pierde la fianza/)
  const estudio = buzon.find((c) => /sin más intentos/.test(c.subject))
  assert.match(estudio.html, /baja por impago/)
})

test('alta 2: la baja se guarda aunque la cuota de después tenga un cobro intentado, y ya no se cobra', async () => {
  // a) Cobro automático rechazado (con reintento programado) en una cuota que ya empezó
  const { sus, cuota2 } = await miembroConTarjeta()
  process.env.SIMULADO_MIT = 'ko'
  await A.cobrarCuotaAutomatica(cuota2.id, BASE)
  const desde = (await query('SELECT desde::text AS d FROM cuotas WHERE id = $1', [cuota2.id])).rows[0].d
  await SUS.darDeBaja(sus.id, { avisoEn: HOY, ultimoDia: sumarDias(desde, -1) })
  const c = await cuota(cuota2.id)
  assert.equal(c.estado, 'anulada')
  assert.equal(c.cobro_estado, null)
  process.env.SIMULADO_MIT = 'ok'
  const antes = (await pagosDe(cuota2.id)).length
  await A.cobrosAutomaticosDelDia(BASE, { ahora: new Date(Date.now() + 2 * 86400000) })
  assert.equal((await pagosDe(cuota2.id)).length, antes, 'no se vuelve a cobrar')

  // b) Baja a futuro con un pago por enlace a medias: se anula, el pago se cierra y deshacer la recupera
  const { sus: otra } = await miembroConTarjeta({ diasAtras: 20 })
  await SUS.asegurarCuotas(query, otra, sumarDias(HOY, 15)) // la cuota del mes que viene
  const futura = (await query('SELECT * FROM cuotas WHERE suscripcion_id = $1 AND periodo = 2', [otra.id])).rows[0]
  const { pago } = await A.pagarCuota(await tokenDe(futura.id), BASE)
  const desde2 = (await query('SELECT desde::text AS d FROM cuotas WHERE id = $1', [futura.id])).rows[0].d
  await SUS.darDeBaja(otra.id, { avisoEn: HOY, ultimoDia: sumarDias(desde2, -1) })
  assert.equal((await cuota(futura.id)).estado, 'anulada')
  assert.equal((await pagosDe(futura.id)).find((p) => p.pedido === pago.campos.pedido).estado, 'fallido')
  await SUS.deshacerBaja(otra.id)
  assert.equal((await cuota(futura.id)).estado, 'pendiente')
})

test('alta 3: con un pago por enlace a medias, ni el cron ni «Cobrar ahora» cobran la tarjeta; si es antiguo, a revisar', async () => {
  const { cuota2 } = await miembroConTarjeta()
  const token = await tokenDe(cuota2.id)
  await A.pagarCuota(token, BASE) // está en la página del banco
  const ahora = await A.cobrarCuotaAutomatica(cuota2.id, BASE)
  assert.equal(ahora.resultado, 'saltada')
  const forzado = await A.cobrarCuotaAutomatica(cuota2.id, BASE, { forzar: true })
  assert.equal(forzado.resultado, 'saltada')
  assert.equal((await pagosDe(cuota2.id)).filter((p) => p.tipo === 'mit').length, 0)
  // Tres horas después sin resultado: no se sabe si pagó, lo mira el estudio
  const despues = await A.cobrarCuotaAutomatica(cuota2.id, BASE, { ahora: new Date(Date.now() + 3 * 3600000) })
  assert.equal(despues.resultado, 'revisar')
  assert.equal((await cuota(cuota2.id)).cobro_estado, 'revisar')
  assert.equal((await pagosDe(cuota2.id)).filter((p) => p.tipo === 'mit').length, 0)
})

test('alta 4: pagar con el enlace guarda la tarjeta pero no vuelve a activar el cobro automático que quitó el estudio', async () => {
  const { sus, cuota2 } = await miembroConTarjeta()
  await A.cambiarCobroAutomatico(sus.id, false)
  const token = await tokenDe(cuota2.id)
  const { pago } = await A.pagarCuota(token, BASE)
  assert.equal(pago.campos.guardar, '1')
  const r = await pagarSimulado(pago.campos)
  assert.equal(r.aviso, 'cuota')
  const { rows } = await query('SELECT cobro_auto, tarjeta_ref FROM suscripciones WHERE id = $1', [sus.id])
  assert.equal(rows[0].cobro_auto, false)
  assert.equal(rows[0].tarjeta_ref, `SIM${pago.campos.pedido}`)
})

test('alta 5: dos altas pagadas con el mismo correo crean una sola suscripción; la segunda queda duplicada', async () => {
  const email = `doble${++n}@example.com`
  const v = A.validarAlta({ plan: 'starter', nombre: 'Doble', apellidos: 'Alta', email, telefono: '600000000' })
  const [a1, a2] = [await A.crearAlta(v.datos, BASE), await A.crearAlta(v.datos, BASE)] // dos pestañas
  const r1 = await pagarSimulado(a1.pago.campos)
  const r2 = await pagarSimulado(a2.pago.campos)
  assert.equal(r1.aviso, 'alta')
  assert.equal(r2.aviso, 'alta_duplicada')
  const { rows } = await query('SELECT count(*)::int AS n FROM suscripciones WHERE lower(email) = $1', [email])
  assert.equal(rows[0].n, 1)
  const { rows: altas } = await query('SELECT estado, duplicada_de FROM altas WHERE token = $1', [a2.token])
  assert.deepEqual(altas[0], { estado: 'duplicada', duplicada_de: r1.suscripcion.id })
  assert.ok(buzon.some((c) => /^Revisar pago/.test(c.subject) && /mismo correo/.test(c.html)))
  const pagina = await A.paginaContrato(a2.token)
  assert.equal(pagina.alta.estado, 'duplicada')
})

test('alta 6: se puede borrar una suscripción con el contrato enviado sin firmar; con pagos o firmado, no', async () => {
  const { suscripcion: sus } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Borrar', apellidos: 'Prueba', email: `borrar${++n}@example.com`, telefono: '600000000', fechaInicio: sumarDias(HOY, 5),
  })
  await A.enviarEnlaceContrato(sus.id, BASE)
  await SUS.borrarSuscripcion(sus.id)
  assert.equal((await query('SELECT count(*)::int AS n FROM suscripciones WHERE id = $1', [sus.id])).rows[0].n, 0)
  assert.equal((await query('SELECT count(*)::int AS n FROM contratos WHERE suscripcion_id = $1', [sus.id])).rows[0].n, 0)
  // Con un contrato firmado, no
  const { suscripcion: otra } = await SUS.crearSuscripcion({
    plan: 'starter', nombre: 'Borrar', apellidos: 'Firmado', email: `borrar${++n}@example.com`, telefono: '600000000', fechaInicio: sumarDias(HOY, 5),
  })
  await A.enviarEnlaceContrato(otra.id, BASE)
  await query(`UPDATE contratos SET estado = 'firmado', firmado_en = now(), datos = '{}', firma_png = 'x', pdf = 'x' WHERE suscripcion_id = $1`, [otra.id])
  await assert.rejects(SUS.borrarSuscripcion(otra.id), { codigo: 'movimientos' })
})

test('alta 7: si el banco confirma un importe distinto, la cuota pasa a «revisar» al momento y no se cobra sola', async () => {
  const { cuota2 } = await miembroConTarjeta()
  const token = await tokenDe(cuota2.id)
  const { pago } = await A.pagarCuota(token, BASE)
  const r = await pagarSimulado(pago.campos, 'ok', String(Number(pago.campos.importe) + 1))
  assert.equal(r.aviso, 'importe_distinto')
  const c = await cuota(cuota2.id)
  assert.equal(c.cobro_estado, 'revisar')
  assert.equal(c.estado, 'pendiente')
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE)).resultado, 'saltada')
  assert.ok(buzon.some((c2) => /^Revisar pago/.test(c2.subject)))
})

test('facturas 4: si la factura de una cuota cobrada falla, el estudio recibe un aviso por correo', async () => {
  const { sus, cuota2 } = await miembroConTarjeta()
  fallarCorreo = (c) => /^Factura/.test(c.subject) // la factura sale, pero el correo con ella no
  assert.equal((await A.cobrarCuotaAutomatica(cuota2.id, BASE)).resultado, 'cobrada')
  assert.equal((await cuota(cuota2.id)).estado, 'pagada')
  const aviso = buzon.find((c) => c.subject === `Factura pendiente: ${sus.codigo}`)
  assert.ok(aviso, asuntos().join(' | '))
  assert.ok((await eventosSus(sus.id)).some((e) => e.tipo === 'factura_fallida'))
  // La factura existe (no se marca enviada)
  const { rows: fs } = await query('SELECT enviada_en FROM facturas WHERE cuota_id = $1 AND sustituida_en IS NULL', [cuota2.id])
  assert.equal(fs.length, 1)
  assert.equal(fs[0].enviada_en, null)
})

test('impago: el contrato dice que se pierde la fianza y «Para hacer» pide decidir la baja', async () => {
  const t = JSON.stringify(contratoSecciones({ c: { ...condicionesModelo('creator'), cobroAuto: true }, estudio: { nombre: null, nif: null }, iban: null }))
  assert.match(t, /Impago: mientras una cuota esté sin pagar/)
  assert.match(t, /no puede usar el estudio ni reservar sesiones/)
  assert.match(t, /pierde el depósito de garantía/)
  assert.equal(CONTRATO_VERSION, '2026-11-20.2')
  const tareas = tareasPendientes({
    fichas: [{ sus: { id: 1, nombre: 'Ana', cobroAuto: true, fechaInicio: '2026-01-01', mesPrueba: false }, cuotas: [{ estado: 'pendiente', cobroEstado: 'agotado', desde: '2026-02-01', importeCent: 19900 }] }],
    hoy: '2026-02-10',
  })
  assert.ok(tareas.some((x) => x.urgente && /darle de baja por impago y quedarte la fianza/.test(x.texto)))
})

test('impago: con una cuota sin pagar sale el aviso fuerte al reservar (se puede saltar) y al pagarla desaparece', async () => {
  const { sus, cuota2 } = await miembroConTarjeta()
  process.env.SIMULADO_MIT = 'ko'
  await A.cobrarCuotaAutomatica(cuota2.id, BASE) // rechazada: ya no puede usar el estudio
  const fecha = await laborable(5)
  const v = await SUS.comprobarSesion(sus.id, { fecha, desde: '10:00', hasta: '14:00' })
  const aviso = v.avisos.find((a) => a.codigo === 'impago')
  assert.ok(aviso, JSON.stringify(v.avisos))
  assert.match(aviso.texto, /^Cuota sin pagar: no puede usar el estudio hasta pagarla/)
  // Sin aceptarlo no se reserva; con «Reservar igualmente», sí
  await assert.rejects(SUS.crearSesionPlan(sus.id, { fecha, desde: '10:00', hasta: '14:00' }), { codigo: 'avisos' })
  const aceptados = v.avisos.map((a) => a.codigo)
  const { reserva } = await SUS.crearSesionPlan(sus.id, { fecha, desde: '10:00', hasta: '14:00', avisosAceptados: aceptados, precioExtraCent: 0 })
  assert.ok(reserva.id)
  // En el panel, sus sesiones y su ficha lo avisan
  assert.match((await SUS.suscripcionCorta(sus.id)).impago, /Cuota sin pagar/)
  assert.match((await SUS.fichaSuscripcion(sus.id)).impago, /Cuota sin pagar/)
  // Paga: todo vuelve a la normalidad
  await SUS.marcarCuotaPagada(cuota2.id, { metodo: 'transferencia' })
  const otra = await SUS.comprobarSesion(sus.id, { fecha: await laborable(6), desde: '10:00', hasta: '14:00' })
  assert.ok(!otra.avisos.some((a) => a.codigo === 'impago'))
  assert.equal((await SUS.suscripcionCorta(sus.id)).impago, null)
})

test('impago: qué cuenta como sin pagar', () => {
  const c = (x) => ({ estado: 'pendiente', importeCent: 19900, desde: '2026-03-01', cobroEstado: null, ...x })
  const auto = { cobroAuto: true }
  const enlace = { cobroAuto: false }
  assert.equal(cuotaImpagada(c(), auto, '2026-03-01'), false, 'el cobro automático aún no se ha hecho')
  assert.equal(cuotaImpagada(c({ cobroEstado: 'rechazado' }), auto, '2026-03-01'), true)
  assert.equal(cuotaImpagada(c({ cobroEstado: 'revisar' }), auto, '2026-03-05'), false, 'por comprobar no bloquea')
  assert.equal(cuotaImpagada(c(), enlace, '2026-03-01'), false, 'el mismo día que empieza aún puede pagarla')
  assert.equal(cuotaImpagada(c(), enlace, '2026-03-02'), true)
  assert.equal(cuotaImpagada(c(), { cobroAuto: false, cobroExterno: 'stripe' }, '2026-03-03'), false, 'Stripe: margen hasta que se atrasa')
  assert.equal(cuotaImpagada(c(), { cobroAuto: false, cobroExterno: 'stripe' }, '2026-03-10'), true)
  assert.equal(cuotaImpagada(c({ estado: 'pagada' }), enlace, '2026-03-10'), false)
})

test('fianza: 7 días desde la firma; se ve el plazo y fuera de plazo sale en «Para hacer»', async () => {
  const v = A.validarAlta({ plan: 'creator', nombre: 'Fianza', apellidos: 'Plazo', email: `plazo${++n}@example.com`, telefono: '600000000' })
  const alta = await A.crearAlta(v.datos, BASE)
  const r = await pagarSimulado(alta.pago.campos)
  assert.equal(r.aviso, 'alta')
  assert.ok(buzon.some((c) => /7 días desde que firmes el contrato/.test(c.html)), 'el correo de bienvenida dice el plazo')
  const firma = A.validarFirma({ datos: { nombre: 'Fianza', apellidos: 'Plazo', documento: '00000000T', direccion: 'Calle de Ejemplo 2, 46001 València', telefono: '600000000' }, firma: `data:image/png;base64,${LOGO_PNG_BASE64}`, acepta: true })
  const ahora = new Date()
  const { sus } = await A.firmarContrato(alta.token, firma, { base: BASE, ahora })
  assert.equal(sus.fianzaLimite, sumarDias(fechaMadrid(ahora), 7))
  const firmado = buzon.filter((c) => /firmado/i.test(c.subject)).at(-1)
  assert.ok(firmado, buzon.map((c) => c.subject).join(' | '))
  assert.match(firmado.html, /Tienes hasta el/)
  const t = JSON.stringify(contratoSecciones({ c: { ...condicionesModelo('creator'), cobroAuto: true }, estudio: { nombre: null, nif: null }, iban: null }))
  assert.match(t, /en los 7 días siguientes a la firma de este contrato/)
  // Dentro del plazo, tarea normal; pasado, urgente
  const dentro = tareasPendientes({ fichas: [{ sus, cuotas: [] }], hoy: sus.fianzaLimite }).find((x) => x.tipo === 'fianza_cobrar')
  assert.equal(dentro.urgente, false)
  assert.match(dentro.texto, /tiene hasta el/)
  const fuera = tareasPendientes({ fichas: [{ sus, cuotas: [] }], hoy: sumarDias(sus.fianzaLimite, 1) }).find((x) => x.tipo === 'fianza_cobrar')
  assert.equal(fuera.urgente, true)
  assert.match(fuera.texto, /el plazo acabó/)
})
