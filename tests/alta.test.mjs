// Alta de miembros por la web: pago del primer mes, contrato firmado y cuotas con enlace,
// con una base de datos Postgres real en memoria (PGlite) y el TPV simulado
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-Q'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-QS'
process.env.ESTUDIO_IBAN = 'ES00 0000 0000 0000 0000 0000'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as A from '../lib/suscripciones/alta.js'
import * as SUS from '../lib/suscripciones/servicio.js'
import { tareasPendientes } from '../lib/suscripciones/reglas.js'
import { contratoSecciones, condicionesModelo, CONTRATO_VERSION } from '../lib/suscripciones/contrato.js'
import { recibirResultado } from '../lib/reservas/flujo.js'
import { firmaSimulada } from '../lib/pagos/simulado.js'
import { LOGO_PNG_BASE64 } from '../lib/facturas/logo.js'
import { fechaMadrid, sumarDias } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

const BASE = 'http://localhost:3000'
const HOY = fechaMadrid(new Date())
let n = 0
const DATOS = (plan = 'creator') => ({ plan, nombre: 'Lucía', apellidos: 'Prueba Uno', email: `miembro${++n}@example.com`, telefono: '+34 600 000 000', acepta: true })
const FIRMA = `data:image/png;base64,${LOGO_PNG_BASE64}`
const PERSONA = { nombre: 'Lucía', apellidos: 'Prueba Uno', documento: '00000000t', direccion: 'Calle de Ejemplo 2, 46001 València', telefono: '600000000' }

async function pagar(campos, resultado = 'ok', importe = campos.importe) {
  return recibirResultado('simulado', { pedido: campos.pedido, importe, resultado, firma: firmaSimulada(campos.pedido, importe, resultado) }, BASE)
}

async function altaPagada(plan = 'creator') {
  const v = A.validarAlta(DATOS(plan))
  assert.ok(v.ok, JSON.stringify(v.errores))
  const alta = await A.crearAlta(v.datos, BASE)
  const r = await pagar(alta.pago.campos)
  return { alta, r }
}

test('validar el alta: plan, datos y casilla obligatoria', () => {
  const mal = A.validarAlta({ plan: 'nada', nombre: '', apellidos: '', email: 'x', telefono: '12', acepta: false })
  assert.equal(mal.ok, false)
  assert.deepEqual(Object.keys(mal.errores).sort(), ['acepta', 'apellidos', 'email', 'nombre', 'plan', 'telefono'])
  assert.ok(A.validarAlta(DATOS()).ok)
})

test('el modelo de contrato sale con las condiciones del plan y sin datos de nadie', () => {
  const t = contratoSecciones({ c: condicionesModelo('pro'), estudio: { nombre: null, nif: null }, iban: null })
  const todo = JSON.stringify(t)
  assert.match(t.subtitulo, /Plan Pro · 349 €\/mes/)
  assert.match(todo, /16 horas al mes/)
  assert.match(todo, /50 €\/h \+ IVA entre semana y 60 €\/h \+ IVA/)
  assert.match(todo, /a la cuenta que indique EL ESTUDIO/)
  assert.doesNotMatch(todo, /X0000000T|ES00/)
})

test('alta completa: pago, suscripción con la primera cuota pagada y factura, contrato pendiente', async () => {
  const v = A.validarAlta(DATOS())
  const alta = await A.crearAlta(v.datos, BASE)
  assert.equal(alta.pago.accion, '/pago-simulado')
  assert.equal(alta.pago.campos.importe, '19900')
  assert.match(alta.pago.campos.ok, /\/api\/pagos\/vuelta\/sus\/.+\/ok$/)

  // Antes de pagar, el enlace del contrato solo dice que se espera el pago
  const antes = await A.paginaContrato(alta.token)
  assert.equal(antes.tipo, 'alta')
  assert.equal(antes.alta.estado, 'pendiente')

  const r = await pagar(alta.pago.campos)
  assert.equal(r.tipo, 'suscripcion')
  assert.equal(r.aviso, 'alta')
  assert.equal(r.destino, `${BASE}/contrato/${alta.token}`)
  const sus = r.suscripcion
  assert.equal(sus.plan, 'creator')
  assert.equal(sus.origen, 'web')
  assert.equal(sus.cobroEnlace, true)
  assert.equal(sus.contratoEstado, 'pendiente')
  assert.equal(sus.fianzaEstado, 'pendiente')
  assert.equal(sus.fechaInicio, HOY)

  const { rows: cuotas } = await query('SELECT * FROM cuotas WHERE suscripcion_id = $1', [sus.id])
  assert.equal(cuotas.length, 1)
  assert.equal(cuotas[0].estado, 'pagada')
  assert.equal(cuotas[0].metodo_pago, 'tarjeta')
  assert.equal(cuotas[0].proveedor, 'comercia')
  assert.equal(cuotas[0].proveedor_ref, alta.pago.campos.pedido)
  const { rows: fs } = await query('SELECT * FROM facturas WHERE cuota_id = $1', [cuotas[0].id])
  assert.equal(fs.length, 1)
  assert.equal(fs[0].tipo, 'simplificada')
  assert.ok(fs[0].enviada_en)

  const despues = await A.paginaContrato(alta.token)
  assert.equal(despues.tipo, 'contrato')
  assert.equal(despues.contrato.estado, 'pendiente')
  assert.equal(despues.contrato.version, CONTRATO_VERSION)

  // En el «Para hacer» del panel: contrato sin firmar y fianza sin cobrar
  const tareas = tareasPendientes({ fichas: [{ sus, cuotas: [] }], hoy: HOY }).map((t) => t.tipo)
  assert.ok(tareas.includes('contrato'))
  assert.ok(tareas.includes('fianza_cobrar'))
})

test('el aviso del banco repetido no crea otra suscripción; pagar dos veces el alta avisa', async () => {
  const { alta, r } = await altaPagada()
  const otra = await pagar(alta.pago.campos)
  assert.equal(otra.aviso, null)
  const { rows } = await query('SELECT count(*)::int AS n FROM suscripciones WHERE lower(email) = $1', [r.suscripcion.email])
  assert.equal(rows[0].n, 1)
  // Un segundo pago del mismo alta (p. ej. pagó en dos pestañas)
  const { rows: as } = await query('SELECT id FROM altas WHERE token = $1', [alta.token])
  const { rows: ps } = await query(
    `INSERT INTO pagos_suscripcion (alta_id, proveedor, importe_cent, pedido) VALUES ($1, 'simulado', 19900, '9999' || lpad(nextval('pedido_seq')::text, 8, '0')) RETURNING pedido`,
    [as[0].id]
  )
  const dos = await pagar({ pedido: ps[0].pedido, importe: '19900' })
  assert.equal(dos.aviso, 'duplicado')
  const { rows: n2 } = await query('SELECT count(*)::int AS n FROM suscripciones WHERE lower(email) = $1', [r.suscripcion.email])
  assert.equal(n2[0].n, 1)
})

test('pago rechazado: el alta queda fallida y se puede volver a intentar', async () => {
  const v = A.validarAlta(DATOS('pro'))
  const alta = await A.crearAlta(v.datos, BASE)
  const ko = await pagar(alta.pago.campos, 'ko')
  assert.equal(ko.aviso, 'fallido')
  const p = await A.paginaContrato(alta.token)
  assert.equal(p.alta.estado, 'fallida')
  const otra = await A.reintentarAlta(alta.token, BASE)
  assert.notEqual(otra.pago.campos.pedido, alta.pago.campos.pedido)
  const ok = await pagar(otra.pago.campos)
  assert.equal(ok.aviso, 'alta')
  await assert.rejects(A.reintentarAlta(alta.token, BASE), /ya está pagada/)
})

test('importe distinto del esperado: no se da de alta y se avisa', async () => {
  const alta = await A.crearAlta(A.validarAlta(DATOS()).datos, BASE)
  const r = await pagar(alta.pago.campos, 'ok', '100')
  assert.equal(r.aviso, 'importe_distinto')
  assert.equal((await A.paginaContrato(alta.token)).tipo, 'alta')
})

test('no deja darse de alta dos veces con el mismo correo', async () => {
  const { r } = await altaPagada()
  await assert.rejects(A.crearAlta({ ...A.validarAlta(DATOS()).datos, email: r.suscripcion.email }, BASE), /Ya hay una suscripción activa/)
})

test('enlaces del contrato que no valen', async () => {
  assert.equal(await A.paginaContrato('corto'), null)
  assert.equal(await A.paginaContrato('x'.repeat(32)), null)
  await assert.rejects(A.firmarContrato('x'.repeat(32), { datos: PERSONA, factura: null, firmaPng: LOGO_PNG_BASE64 }), /no es válido/)
})

test('validar la firma: datos, firma y casilla', () => {
  const mal = A.validarFirma({ datos: { nombre: '', apellidos: '', documento: '1', direccion: 'x', telefono: '1' }, firma: 'data:image/png;base64,AAAA', acepta: false })
  assert.equal(mal.ok, false)
  assert.deepEqual(Object.keys(mal.errores).sort(), ['acepta', 'apellidos', 'direccion', 'documento', 'firma', 'nombre', 'telefono'])
  const ok = A.validarFirma({ datos: PERSONA, firma: FIRMA, acepta: true })
  assert.ok(ok.ok, JSON.stringify(ok.errores))
  assert.equal(ok.datos.documento, '00000000T')
  assert.equal(ok.factura, null)
})

test('firmar el contrato: PDF guardado, ficha al día y no se firma dos veces', async () => {
  const { alta, r } = await altaPagada()
  const v = A.validarFirma({ datos: PERSONA, firma: FIRMA, acepta: true })
  const { sus, pdf } = await A.firmarContrato(alta.token, v, { huella: 'huella-de-prueba', base: BASE })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal(sus.contratoEstado, 'firmado')
  assert.equal(sus.apellidos, 'Prueba Uno')
  const p = await A.paginaContrato(alta.token)
  assert.equal(p.contrato.estado, 'firmado')
  assert.equal(p.contrato.datos.documento, '00000000T')
  assert.equal(p.contrato.datos.email, r.suscripcion.email)
  assert.equal(p.contrato.huella, 'huella-de-prueba')
  const guardado = await A.pdfDelContrato({ token: alta.token })
  assert.equal(guardado.pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok((await A.pdfDelContrato({ susId: sus.id })).pdf.length > 1000)
  await assert.rejects(A.firmarContrato(alta.token, v, { base: BASE }), /ya está firmado/)
  const tareas = tareasPendientes({ fichas: [{ sus, cuotas: [] }], hoy: HOY }).map((t) => t.tipo)
  assert.ok(!tareas.includes('contrato'))
})

test('con datos de empresa al firmar, la primera cuota pasa a factura completa', async () => {
  const { alta, r } = await altaPagada()
  const v = A.validarFirma({ datos: PERSONA, factura: { nombre: 'Empresa Prueba SL', nif: 'b00000000', direccion: 'Avenida 3, 46002 València' }, firma: FIRMA, acepta: true })
  assert.ok(v.ok, JSON.stringify(v.errores))
  await A.firmarContrato(alta.token, v, { base: BASE })
  const { rows } = await query(
    `SELECT f.tipo, f.sustituida_en, f.cliente FROM facturas f JOIN cuotas c ON c.id = f.cuota_id WHERE c.suscripcion_id = $1 ORDER BY f.id`,
    [r.suscripcion.id]
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].tipo, 'simplificada')
  assert.ok(rows[0].sustituida_en)
  assert.equal(rows[1].tipo, 'completa')
  assert.equal(rows[1].cliente.nif, 'B00000000')
  const sus = await SUS.suscripcionCorta(r.suscripcion.id).catch(() => null)
  assert.ok(sus)
})

test('desde el panel: mandar el contrato a un miembro dado de alta a mano', async () => {
  const { suscripcion } = await SUS.crearSuscripcion({ plan: 'starter', nombre: 'Panel', email: `panel${++n}@example.com`, fechaInicio: HOY })
  const r = await A.enviarEnlaceContrato(suscripcion.id, BASE)
  assert.match(r.url, /\/contrato\/.{20,}$/)
  const c = await A.contratoDeSuscripcion(suscripcion.id)
  assert.equal(c.estado, 'pendiente')
  // Reenviar usa el mismo enlace
  const r2 = await A.enviarEnlaceContrato(suscripcion.id, BASE)
  assert.equal(r2.url, r.url)
})

test('recordatorio del contrato a las 48 h (una sola vez)', async () => {
  const { alta } = await altaPagada()
  await query(`UPDATE contratos SET enviado_en = now() - interval '49 hours', creado_en = now() - interval '49 hours' WHERE token = $1`, [alta.token])
  const r1 = await A.tareasDiariasSuscripciones(BASE)
  assert.ok(r1.recordados >= 1)
  const { rows } = await query('SELECT recordado_en FROM contratos WHERE token = $1', [alta.token])
  assert.ok(rows[0].recordado_en)
  const r2 = await A.tareasDiariasSuscripciones(BASE)
  assert.equal(r2.recordados, 0)
})

test('cuotas siguientes: enlace de pago al empezar el periodo, pago por TPV y factura', async () => {
  const inicio = sumarDias(HOY, -40)
  const { suscripcion } = await SUS.crearSuscripcion({ plan: 'creator', nombre: 'Enlace', apellidos: 'Cuota', email: `cuota${++n}@example.com`, fechaInicio: inicio, primeraPagada: { metodo: 'tarjeta', fecha: inicio } })
  await query('UPDATE suscripciones SET cobro_enlace = true WHERE id = $1', [suscripcion.id])
  await SUS.asegurarCuotasDeTodas()
  const r1 = await A.tareasDiariasSuscripciones(BASE)
  assert.ok(r1.enlaces >= 1)
  const { rows } = await query('SELECT * FROM cuotas WHERE suscripcion_id = $1 AND periodo = 2', [suscripcion.id])
  const c2 = rows[0]
  assert.ok(c2.pago_token)
  assert.ok(c2.aviso_pago_en)
  // No se manda dos veces
  const r2 = await A.tareasDiariasSuscripciones(BASE)
  const { rows: otra } = await query('SELECT aviso_pago_en FROM cuotas WHERE id = $1', [c2.id])
  assert.equal(String(otra[0].aviso_pago_en), String(c2.aviso_pago_en))
  assert.equal(r2.enlaces, 0)

  const pagina = await A.paginaCuota(c2.pago_token)
  assert.equal(pagina.pagable, true)
  assert.equal(pagina.cuota.importeCent, 19900)
  const { pago } = await A.pagarCuota(c2.pago_token, BASE)
  assert.match(pago.campos.ok, new RegExp(`/api/pagos/vuelta/sus/${c2.pago_token}/ok$`))
  const r = await pagar(pago.campos)
  assert.equal(r.aviso, 'cuota')
  assert.equal(r.destino, `${BASE}/cuota/${c2.pago_token}`)
  const { rows: pagada } = await query('SELECT * FROM cuotas WHERE id = $1', [c2.id])
  assert.equal(pagada[0].estado, 'pagada')
  assert.equal(pagada[0].proveedor_ref, pago.campos.pedido)
  const { rows: fs } = await query('SELECT tipo FROM facturas WHERE cuota_id = $1 AND sustituida_en IS NULL', [c2.id])
  assert.equal(fs.length, 1)
  // Repetir el aviso no cambia nada; volver a pagar una cuota ya pagada no se puede
  assert.equal((await pagar(pago.campos)).aviso, null)
  await assert.rejects(A.pagarCuota(c2.pago_token, BASE), /ya está pagada/)
  assert.equal((await A.paginaCuota(c2.pago_token)).pagable, false)
  assert.equal(await A.paginaCuota('x'.repeat(32)), null)
})
