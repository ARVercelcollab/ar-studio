// Alta de miembros por la web, contrato firmado en la web y cobro de las cuotas.
//
// 1. En /planmensual/alta la persona elige plan, deja nombre, correo y teléfono y paga el
//    primer mes por el TPV (junto al botón ve el resumen de las condiciones; el contrato no
//    se enseña antes de pagar). Con el cobro recurrente activo, solo con tarjeta, y la
//    tarjeta queda guardada en Redsys (COF).
// 2. Cuando el banco confirma el pago (su aviso es la fuente de verdad; se puede recibir
//    varias veces y solo cuenta la primera), se crea la suscripción con la primera cuota
//    pagada (y su factura), «Contrato pendiente» y «Fianza pendiente».
// 3. En /contrato/<token> rellena sus datos, firma dibujando y le llega el PDF. La fianza
//    se paga por transferencia (se marca en el panel cuando llega).
// 4. Cada cuota siguiente la cobra sola el cron diario el día que empieza su periodo, con la
//    tarjeta guardada (cobro MIT por la API REST de Redsys). Si el banco la rechaza, se
//    reintenta al día siguiente y a los 3 días, y le llega un enlace (/cuota/<token>) para
//    pagarla o poner otra tarjeta. Sin cobro recurrente (REDSYS_COBRO_RECURRENTE), al
//    empezar cada periodo le llega ese enlace para pagar.

import { query, transaction } from '../db/index.js'
import { proveedorActivo, proveedorPorId, comprobarProveedor, cobroRecurrente } from '../pagos/index.js'
import { ErrorReserva, tokenNuevo, registrar } from '../reservas/servicio.js'
import { PLANES, ESTUDIO, FIANZA_PLAZO_DIAS, formatoEuros } from '../reservas/config.js'
import { fechaMadrid, sumarDias } from '../reservas/tiempo.js'
import { crearSuscripcion, aSuscripcion, aCuota, _cargarSuscripcion as cargarSuscripcion } from './servicio.js'
import { estadoDe, textoPeriodo } from './reglas.js'
import { CONTRATO_VERSION, firmanteEstudio, ibanEstudio, condicionesDeSuscripcion } from './contrato.js'
import { pdfContrato } from './contratoPdf.js'
import {
  correoAltaPagada, avisoAltaEstudio, correoContratoFirmado, correoFirmarContrato, avisoContratoSinFirmar,
  correoPagarCuota, avisoPagoSuscripcion, correoCuotaCobrada, correoCobroRechazado, avisoCobroEstudio,
} from './correos.js'
import { facturasAutomaticas } from '../facturas/servicio.js'
import { emitirYEnviarCuota } from '../facturas/envio.js'
import { avisoFacturaCuotaFallida } from '../reservas/correos.js'

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const hoyMadrid = () => fechaMadrid(new Date())
const titular = () => firmanteEstudio().nombre

export const urlContrato = (base, token) => `${base}/contrato/${token}`
export const urlCuota = (base, token) => `${base}/cuota/${token}`
export const urlFicha = (base, id) => `${base}/admin/miembros/${id}`

// ---------- 1. Antes de pagar ----------

export function validarAlta(b = {}) {
  const errores = {}
  const plan = String(b.plan || '')
  if (!PLANES[plan]) errores.plan = 'Elige un plan.'
  const nombre = texto(b.nombre, 80)
  const apellidos = texto(b.apellidos, 80)
  const email = texto(b.email, 120).toLowerCase()
  const telefono = texto(b.telefono, 20)
  if (!nombre) errores.nombre = 'Escribe tu nombre.'
  if (!apellidos) errores.apellidos = 'Escribe tus apellidos.'
  if (!EMAIL.test(email)) errores.email = 'Revisa el correo: ahí te llegan el contrato y las facturas.'
  if (telefono.replace(/\D/g, '').length < 9) errores.telefono = 'Escribe un teléfono de contacto.'
  if (Object.keys(errores).length) return { ok: false, errores }
  return { ok: true, datos: { plan, nombre, apellidos, email, telefono } }
}

async function nuevoPago(q, { altaId = null, cuotaId = null, proveedor, importeCent, tipo = 'redireccion', guardaTarjeta = false }) {
  const { rows } = await q(
    `INSERT INTO pagos_suscripcion (alta_id, cuota_id, proveedor, importe_cent, pedido, tipo, guarda_tarjeta)
     VALUES ($1, $2, $3, $4, to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYMM') || lpad(nextval('pedido_seq')::text, 8, '0'), $5, $6)
     RETURNING *`,
    [altaId, cuotaId, proveedor, importeCent, tipo, guardaTarjeta]
  )
  return rows[0]
}

function formularioPago(proveedor, { pedido, importeCent, descripcion, titularPago, email, token, guardarTarjeta = false }, base) {
  const vuelta = `${base}/api/pagos/vuelta/sus/${token}`
  return proveedor.crearPago({
    pedido,
    importeCent,
    descripcion,
    titular: titularPago,
    email,
    urlOk: `${vuelta}/ok`,
    urlKo: `${vuelta}/ko`,
    urlNotificacion: proveedor.id === 'addon' ? `${base}/api/pagos/addon/respuesta` : `${base}/api/pagos/${proveedor.id}/notificacion`,
    guardarTarjeta,
  })
}

// ¿Se cobran solas las cuotas con el TPV que hay ahora? (para los textos de la web)
export function cobroAutomaticoActivo() {
  try {
    return cobroRecurrente(proveedorActivo())
  } catch {
    return false
  }
}

const descripcionAlta = (plan) => `Suscripción AR Studio · plan ${PLANES[plan].nombre} · primer mes`

// Guarda lo que ha dejado y devuelve el formulario para ir al TPV
export async function crearAlta(datos, base, { huella = null } = {}) {
  const proveedor = await comprobarProveedor(proveedorActivo())
  const plan = PLANES[datos.plan]
  const guardarTarjeta = cobroRecurrente(proveedor)
  const { rows: ya } = await query(
    `SELECT codigo FROM suscripciones WHERE lower(email) = $1 AND (ultimo_dia IS NULL OR ultimo_dia >= $2::date)`,
    [datos.email, hoyMadrid()]
  )
  if (ya.length) {
    throw new ErrorReserva('ya_miembro', `Ya hay una suscripción activa con ese correo. Si quieres cambiar de plan, escríbenos por WhatsApp al ${ESTUDIO.whatsappVisible}.`, 409)
  }
  return transaction(async (tx) => {
    const q = tx.query
    const token = tokenNuevo()
    const { rows } = await q(
      `INSERT INTO altas (token, plan, nombre, apellidos, email, telefono, importe_cent, acepta_en, contrato_version, huella)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9) RETURNING *`,
      [token, datos.plan, datos.nombre, datos.apellidos, datos.email, datos.telefono, plan.cuotaCent, CONTRATO_VERSION, huella]
    )
    const alta = rows[0]
    const pago = await nuevoPago(q, { altaId: alta.id, proveedor: proveedor.id, importeCent: alta.importe_cent, guardaTarjeta: guardarTarjeta })
    return {
      token,
      importe: formatoEuros(alta.importe_cent),
      pago: formularioPago(proveedor, {
        pedido: pago.pedido, importeCent: pago.importe_cent, descripcion: descripcionAlta(alta.plan),
        titularPago: `${alta.nombre} ${alta.apellidos}`, email: alta.email, token, guardarTarjeta,
      }, base),
    }
  })
}

// Volver a intentar el pago de un alta que no se completó
export async function reintentarAlta(token, base) {
  const proveedor = await comprobarProveedor(proveedorActivo())
  return transaction(async (tx) => {
    const q = tx.query
    const { rows } = await q('SELECT * FROM altas WHERE token = $1 FOR UPDATE', [String(token)])
    const alta = rows[0]
    if (!alta) throw new ErrorReserva('no_existe', 'No encontramos tu alta. Empieza de nuevo desde la web.', 404)
    if (alta.estado === 'pagada') throw new ErrorReserva('pagada', 'Este alta ya está pagada.', 409)
    if (alta.estado === 'duplicada') throw new ErrorReserva('ya_miembro', 'Ya tienes una suscripción activa con este correo.', 409)
    await q(`UPDATE altas SET estado = 'pendiente', actualizado_en = now() WHERE id = $1`, [alta.id])
    const guardarTarjeta = cobroRecurrente(proveedor)
    const pago = await nuevoPago(q, { altaId: alta.id, proveedor: proveedor.id, importeCent: alta.importe_cent, guardaTarjeta: guardarTarjeta })
    return {
      token,
      pago: formularioPago(proveedor, {
        pedido: pago.pedido, importeCent: pago.importe_cent, descripcion: descripcionAlta(alta.plan),
        titularPago: `${alta.nombre} ${alta.apellidos}`, email: alta.email, token, guardarTarjeta,
      }, base),
    }
  })
}

// ---------- 2. Llega el resultado del TPV ----------

// Guarda la tarjeta que ha dejado Redsys para los cobros siguientes (nunca el número)
async function guardarTarjeta(q, susId, t, proveedorId) {
  await q(
    `UPDATE suscripciones SET tarjeta_ref = $2, tarjeta_cof_txnid = $3, tarjeta_ultimos = $4, tarjeta_caduca = $5,
        tarjeta_proveedor = $6, tarjeta_guardada_en = now(), actualizado_en = now() WHERE id = $1`,
    [susId, t.ref, t.cofTxnid || null, t.ultimos || null, t.caduca || null, proveedorId]
  )
  await registrar(q, null, 'tarjeta_guardada', { ultimos: t.ultimos || null, caduca: t.caduca || null }, { suscripcionId: susId, autor: 'sistema' })
}

// ¿El estudio quitó a mano el cobro automático? (lo último que hizo fue «Dejar de cobrar»)
async function cobroQuitadoPorEstudio(q, susId) {
  const { rows } = await q(
    `SELECT tipo FROM eventos WHERE suscripcion_id = $1 AND tipo IN ('cobro_desactivado', 'cobro_activado') ORDER BY creado_en DESC, id DESC LIMIT 1`,
    [susId]
  )
  return rows[0]?.tipo === 'cobro_desactivado'
}

export async function esPagoDeSuscripcion(pedido) {
  const { rows } = await query('SELECT 1 FROM pagos_suscripcion WHERE pedido = $1', [String(pedido || '')])
  return rows.length > 0
}

// Se puede llamar varias veces con el mismo pedido (aviso del banco y vuelta del cliente):
// solo cuenta la primera. Devuelve { tipo: 'suscripcion', aviso, suscripcion, destino, codigo }.
export async function recibirResultadoSuscripcion(proveedorId, resultado, base) {
  const { pedido, pagado, importeCent = null, codigo = null, autorizacion = null, datos = null } = resultado
  const hoy = hoyMadrid()
  const r = await transaction(async (tx) => {
    const q = tx.query
    const { rows: ps } = await q('SELECT * FROM pagos_suscripcion WHERE pedido = $1 FOR UPDATE', [pedido])
    const pago = ps[0]
    if (!pago) throw new ErrorReserva('no_existe', 'Pago desconocido.', 404)
    if (pago.proveedor !== proveedorId) throw new ErrorReserva('proveedor', 'El pago es de otro TPV.', 400)
    const { rows: as } = pago.alta_id ? await q('SELECT * FROM altas WHERE id = $1 FOR UPDATE', [pago.alta_id]) : { rows: [] }
    const alta = as[0] || null
    const { rows: cs } = pago.cuota_id ? await q('SELECT *, desde::text AS desde_txt, hasta::text AS hasta_txt, pagada_en::text AS pagada_en_txt FROM cuotas WHERE id = $1 FOR UPDATE', [pago.cuota_id]) : { rows: [] }
    const cuotaFila = cs[0] || null
    const susId = alta?.suscripcion_id || cuotaFila?.suscripcion_id || null
    const token = alta?.token || cuotaFila?.pago_token
    const base0 = { pagoId: pago.id, altaId: alta?.id ?? null, cuotaId: cuotaFila?.id ?? null, susId, token }

    if (pago.estado === 'pagado') return { ...base0, aviso: null }
    if (!pagado) {
      if (pago.estado === 'iniciado') {
        await q(`UPDATE pagos_suscripcion SET estado = 'fallido', codigo_respuesta = $2, datos = $3, actualizado_en = now() WHERE id = $1`,
          [pago.id, codigo, datos ? JSON.stringify(datos) : null])
      }
      if (alta && alta.estado === 'pendiente') await q(`UPDATE altas SET estado = 'fallida', actualizado_en = now() WHERE id = $1`, [alta.id])
      return { ...base0, aviso: 'fallido' }
    }
    await q(`UPDATE pagos_suscripcion SET estado = 'pagado', codigo_respuesta = $2, autorizacion = $3, datos = $4, actualizado_en = now() WHERE id = $1`,
      [pago.id, codigo, autorizacion, datos ? JSON.stringify(datos) : null])
    if (importeCent !== null && Number(importeCent) !== pago.importe_cent) {
      if (susId) await registrar(q, null, 'pago_revisar', { pedido, importeCent, esperado: pago.importe_cent }, { suscripcionId: susId, autor: 'sistema' })
      // La cuota no se vuelve a cobrar sola (ni se queda «cobrando»): la mira el estudio
      if (cuotaFila && cuotaFila.estado === 'pendiente') {
        await q(`UPDATE cuotas SET cobro_estado = 'revisar', cobro_error = $2, actualizado_en = now() WHERE id = $1`,
          [cuotaFila.id, 'El banco ha cobrado un importe distinto del de la cuota: revísalo en el portal del TPV.'])
      }
      return { ...base0, aviso: 'importe_distinto' }
    }

    if (alta) {
      if (alta.estado === 'pagada') {
        await registrar(q, null, 'pago_revisar', { pedido, motivo: 'duplicado' }, { suscripcionId: alta.suscripcion_id, autor: 'sistema' })
        return { ...base0, aviso: 'duplicado' }
      }
      // Ya hay otra suscripción activa con ese correo (dos pestañas, volver atrás y pagar otra
      // vez…): no se crea otra; el estudio devuelve este pago
      const { rows: otra } = await q(
        `SELECT id FROM suscripciones WHERE lower(email) = lower($1) AND (ultimo_dia IS NULL OR ultimo_dia >= $2::date) ORDER BY id LIMIT 1`,
        [alta.email, hoy]
      )
      if (otra[0]) {
        await q(`UPDATE altas SET estado = 'duplicada', duplicada_de = $2, actualizado_en = now() WHERE id = $1`, [alta.id, otra[0].id])
        await registrar(q, null, 'pago_revisar', { pedido, motivo: 'alta_duplicada', importeCent: pago.importe_cent }, { suscripcionId: otra[0].id, autor: 'sistema' })
        return { ...base0, susId: otra[0].id, aviso: 'alta_duplicada' }
      }
      const { suscripcion } = await crearSuscripcion({
        plan: alta.plan, nombre: alta.nombre, apellidos: alta.apellidos, email: alta.email, telefono: alta.telefono,
        fechaInicio: hoy, metodoHabitual: 'tarjeta', fianza: { estado: 'pendiente' },
        primeraPagada: { metodo: 'tarjeta', fecha: hoy, referencia: `TPV ${pedido}` },
      }, { confirmado: true, autor: 'web', q })
      // Con la tarjeta guardada, las cuotas se cobran solas; si no (cobro recurrente apagado o
      // el banco no la ha guardado), le llega un enlace de pago cada mes
      const tarjeta = pago.guarda_tarjeta ? resultado.tarjeta : null
      if (tarjeta?.ref) await guardarTarjeta(q, suscripcion.id, tarjeta, proveedorId)
      await q(`UPDATE suscripciones SET origen = 'web', cobro_auto = $2, cobro_enlace = NOT $2, contrato_estado = 'pendiente', actualizado_en = now() WHERE id = $1`, [suscripcion.id, Boolean(tarjeta?.ref)])
      if (pago.guarda_tarjeta && !tarjeta?.ref) await registrar(q, null, 'tarjeta_no_guardada', { pedido }, { suscripcionId: suscripcion.id, autor: 'sistema' })
      await q(`UPDATE cuotas SET proveedor = 'comercia', proveedor_ref = $2 WHERE suscripcion_id = $1 AND periodo = 1`, [suscripcion.id, pedido])
      await q(`INSERT INTO contratos (suscripcion_id, token, version, enviado_en) VALUES ($1, $2, $3, now())`, [suscripcion.id, alta.token, CONTRATO_VERSION])
      await q(`UPDATE altas SET estado = 'pagada', suscripcion_id = $2, actualizado_en = now() WHERE id = $1`, [alta.id, suscripcion.id])
      await registrar(q, null, 'alta_web', { pedido, autorizacion, contratoVersion: alta.contrato_version }, { suscripcionId: suscripcion.id, autor: 'web' })
      const { rows: c1 } = await q('SELECT id FROM cuotas WHERE suscripcion_id = $1 AND periodo = 1', [suscripcion.id])
      return { ...base0, susId: suscripcion.id, cuotaId: c1[0].id, aviso: 'alta', tarjetaNoGuardada: pago.guarda_tarjeta && !tarjeta?.ref }
    }

    // Cuota de un periodo
    if (cuotaFila.estado !== 'pendiente') {
      await registrar(q, null, 'pago_revisar', { pedido, motivo: cuotaFila.estado === 'pagada' ? 'duplicado' : 'sin_cuota', periodo: cuotaFila.periodo }, { suscripcionId: susId, autor: 'sistema' })
      return { ...base0, aviso: cuotaFila.estado === 'pagada' ? 'duplicado' : 'sin_cuota' }
    }
    const automatico = pago.tipo === 'mit'
    await q(
      `UPDATE cuotas SET estado = 'pagada', metodo_pago = 'tarjeta', pagada_en = $2, referencia = $3, proveedor = 'comercia',
          proveedor_ref = $4, cobro_estado = NULL, cobro_proximo = NULL, cobro_error = NULL, actualizado_en = now() WHERE id = $1`,
      [cuotaFila.id, hoy, `${automatico ? 'Cobro automático' : 'TPV'} ${pedido}`, pedido]
    )
    // Pagó con el enlace y se pidió guardar la tarjeta: a partir de ahora se cobra con esa
    // (si el estudio quitó el cobro automático, se guarda la tarjeta pero sigue sin cobrarse sola)
    if (pago.guarda_tarjeta && resultado.tarjeta?.ref) {
      await guardarTarjeta(q, susId, resultado.tarjeta, proveedorId)
      if (!(await cobroQuitadoPorEstudio(q, susId))) {
        await q('UPDATE suscripciones SET cobro_auto = true, cobro_enlace = false, actualizado_en = now() WHERE id = $1', [susId])
      }
    }
    await registrar(q, null, 'cuota_pagada', { periodo: cuotaFila.periodo, metodo: 'tarjeta', fecha: hoy, importeCent: cuotaFila.importe_cent, pedido, automatico },
      { suscripcionId: susId, autor: automatico ? 'sistema' : 'web' })
    return { ...base0, aviso: 'cuota', automatico }
  })

  const sus = r.susId ? await cargarSuscripcion(query, r.susId) : null
  const iban = ibanEstudio()
  try {
    if (r.aviso === 'alta') {
      await correoAltaPagada(sus, { urlContrato: urlContrato(base, r.token), iban, titular: titular() })
      await avisoAltaEstudio(sus, { urlFicha: urlFicha(base, sus.id) })
      if (r.tarjetaNoGuardada) await avisoCobroEstudio(sus, 'tarjeta_no_guardada', { urlFicha: urlFicha(base, sus.id) })
    } else if (['duplicado', 'importe_distinto', 'sin_cuota', 'alta_duplicada'].includes(r.aviso)) {
      await avisoPagoSuscripcion(sus, r.aviso, { urlFicha: sus ? urlFicha(base, sus.id) : null, pedido })
    }
  } catch (e) {
    console.error('[suscripciones] fallo al enviar correos', e.message)
    if (sus) await registrar(query, null, 'correo_fallido', { error: String(e.message || e) }, { suscripcionId: sus.id, autor: 'sistema' }).catch(() => {})
  }
  // La factura de la cuota pagada (completa o simplificada), aparte de los correos de arriba
  if (['alta', 'cuota'].includes(r.aviso) && facturasAutomaticas()) await facturaDeCuotaPagada(r.cuotaId, r.susId, base)
  const destino = r.altaId ? urlContrato(base, r.token) : r.token ? urlCuota(base, r.token) : base
  return { tipo: 'suscripcion', aviso: r.aviso, suscripcion: sus, destino, codigo: sus?.codigo || pedido, resultado }
}

// Emite y manda la factura de una cuota recién pagada. Si falla (al emitir o al enviar),
// lo apunta y avisa al estudio por correo: con el cobro automático nadie mira el historial.
async function facturaDeCuotaPagada(cuotaId, susId, base, opciones = {}) {
  let error = null
  try {
    const f = await emitirYEnviarCuota(cuotaId, opciones)
    if (f.errorEnvio) error = `emitida (${f.factura.codigo}) pero no enviada: ${f.errorEnvio}`
  } catch (e) {
    console.error('[suscripciones] factura de cuota fallida', e.message)
    error = String(e.message || e)
    await registrar(query, null, 'factura_fallida', { error }, { suscripcionId: susId, autor: 'sistema' }).catch(() => {})
  }
  if (!error) return
  try {
    const sus = await cargarSuscripcion(query, susId)
    const { rows } = await query('SELECT periodo FROM cuotas WHERE id = $1', [Number(cuotaId)])
    await avisoFacturaCuotaFallida(sus, error, { urlFicha: base ? urlFicha(base, susId) : null, periodo: rows[0]?.periodo ?? null })
  } catch (e) {
    console.error('[suscripciones] aviso de factura fallida', e.message)
  }
}

// ---------- 3. El contrato ----------

function aContrato(f) {
  if (!f) return null
  return {
    id: f.id,
    suscripcionId: f.suscripcion_id,
    token: f.token,
    version: f.version,
    estado: f.estado,
    datos: f.datos || null,
    firmadoEn: f.firmado_en ? new Date(f.firmado_en).toISOString() : null,
    huella: f.huella || null,
    enviadoEn: f.enviado_en ? new Date(f.enviado_en).toISOString() : null,
    recordadoEn: f.recordado_en ? new Date(f.recordado_en).toISOString() : null,
    creadoEn: new Date(f.creado_en).toISOString(),
  }
}

export async function contratoDeSuscripcion(susId) {
  const { rows } = await query('SELECT * FROM contratos WHERE suscripcion_id = $1', [Number(susId)])
  return aContrato(rows[0])
}

// Lo que enseña /contrato/<token>. null si el enlace no vale.
export async function paginaContrato(token) {
  const t = String(token || '')
  if (t.length < 20) return null
  const { rows } = await query('SELECT * FROM contratos WHERE token = $1', [t])
  const contrato = aContrato(rows[0])
  if (contrato) {
    const sus = await cargarSuscripcion(query, contrato.suscripcionId)
    return { tipo: 'contrato', contrato, sus }
  }
  // Aún no ha llegado el pago (o no se completó)
  const { rows: as } = await query('SELECT plan, estado, importe_cent, nombre FROM altas WHERE token = $1', [t])
  if (!as[0]) return null
  return { tipo: 'alta', alta: { plan: as[0].plan, estado: as[0].estado, importeCent: as[0].importe_cent, nombre: as[0].nombre } }
}

const DOCUMENTO = /^[A-Z0-9]{5,20}$/

export function validarFirma(b = {}) {
  const errores = {}
  const d = b.datos || {}
  const datos = {
    nombre: texto(d.nombre, 80),
    apellidos: texto(d.apellidos, 80),
    documento: texto(d.documento, 30).toUpperCase().replace(/[\s.-]/g, ''),
    direccion: texto(d.direccion, 200),
    telefono: texto(d.telefono, 20),
  }
  if (!datos.nombre) errores.nombre = 'Escribe tu nombre.'
  if (!datos.apellidos) errores.apellidos = 'Escribe tus apellidos.'
  if (!DOCUMENTO.test(datos.documento)) errores.documento = 'Escribe tu DNI, NIE o pasaporte.'
  if (datos.direccion.length < 8) errores.direccion = 'Escribe tu dirección completa (calle, número, código postal y ciudad).'
  if (datos.telefono.replace(/\D/g, '').length < 9) errores.telefono = 'Escribe un teléfono de contacto.'
  let factura = null
  if (b.factura) {
    factura = { nombre: texto(b.factura.nombre, 120), nif: texto(b.factura.nif, 20).toUpperCase().replace(/[\s.-]/g, ''), direccion: texto(b.factura.direccion, 200) }
    if (!factura.nombre) errores.facturaNombre = 'Escribe el nombre o la razón social.'
    if (factura.nif.length < 5) errores.facturaNif = 'Escribe el NIF o CIF.'
    if (factura.direccion.length < 8) errores.facturaDireccion = 'Escribe la dirección de facturación.'
  }
  if (b.acepta !== true) errores.acepta = 'Marca la casilla para firmar.'
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.firma || ''))
  let firmaPng = null
  if (!m) errores.firma = 'Firma en el recuadro con el dedo o el ratón.'
  else {
    const buf = Buffer.from(m[1], 'base64')
    const esPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    if (!esPng || buf.length > 400 * 1024) errores.firma = 'No hemos podido leer la firma. Bórrala y vuelve a firmar.'
    else if (buf.length < 600) errores.firma = 'La firma está vacía. Firma en el recuadro.'
    else firmaPng = buf.toString('base64')
  }
  if (Object.keys(errores).length) return { ok: false, errores }
  return { ok: true, datos, factura, firmaPng }
}

// Firma el contrato. Devuelve { sus, pdf }.
export async function firmarContrato(token, { datos, factura, firmaPng }, { huella = null, base, ahora = new Date() } = {}) {
  const { rows } = await query('SELECT * FROM contratos WHERE token = $1', [String(token || '')])
  const previo = aContrato(rows[0])
  if (!previo) throw new ErrorReserva('no_existe', 'Este enlace no es válido.', 404)
  if (previo.estado === 'firmado') throw new ErrorReserva('firmado', 'Este contrato ya está firmado.', 409)
  const susAntes = await cargarSuscripcion(query, previo.suscripcionId)
  const persona = { ...datos, email: susAntes.email }
  const contrato = { version: previo.version, firmadoEn: ahora.toISOString(), huella, datos: persona, firmaPng }
  const pdf = await pdfContrato({
    c: condicionesDeSuscripcion(susAntes), codigo: susAntes.codigo, contrato, estudio: firmanteEstudio(), iban: ibanEstudio(),
  })

  await transaction(async (tx) => {
    const q = tx.query
    const { rows: rs } = await q('SELECT estado FROM contratos WHERE id = $1 FOR UPDATE', [previo.id])
    if (rs[0].estado === 'firmado') throw new ErrorReserva('firmado', 'Este contrato ya está firmado.', 409)
    await q(
      `UPDATE contratos SET estado = 'firmado', datos = $2, firma_png = $3, firmado_en = $4, huella = $5, pdf = $6, actualizado_en = now()
        WHERE id = $1`,
      [previo.id, JSON.stringify(persona), firmaPng, ahora, huella, pdf.toString('base64')]
    )
    await q(
      `UPDATE suscripciones SET nombre = $2, apellidos = $3, telefono = $4, contrato_estado = 'firmado',
          factura = coalesce($5::jsonb, factura),
          fianza_limite = CASE WHEN fianza_estado = 'pendiente' THEN $6::date ELSE fianza_limite END, actualizado_en = now() WHERE id = $1`,
      [susAntes.id, datos.nombre, datos.apellidos, datos.telefono, factura ? JSON.stringify(factura) : null, sumarDias(fechaMadrid(ahora), FIANZA_PLAZO_DIAS)]
    )
    await registrar(q, null, 'contrato_firmado', { version: previo.version, conFactura: Boolean(factura) }, { suscripcionId: susAntes.id, autor: 'cliente' })
  })

  const sus = await cargarSuscripcion(query, susAntes.id)
  try {
    await correoContratoFirmado(sus, pdf, { iban: ibanEstudio(), titular: titular(), urlContrato: base ? urlContrato(base, previo.token) : null })
  } catch (e) {
    console.error('[contratos] correo del contrato firmado fallido', e.message)
    await registrar(query, null, 'correo_fallido', { error: String(e.message || e) }, { suscripcionId: sus.id, autor: 'sistema' }).catch(() => {})
  }
  // Si ha dado datos de empresa, las cuotas ya pagadas con factura simplificada pasan a completa
  if (factura && facturasAutomaticas()) {
    const { rows: simples } = await query(
      `SELECT c.id FROM cuotas c JOIN facturas f ON f.cuota_id = c.id AND f.sustituida_en IS NULL AND f.tipo = 'simplificada'
        WHERE c.suscripcion_id = $1 AND c.estado = 'pagada'`,
      [sus.id]
    )
    for (const c of simples) await facturaDeCuotaPagada(c.id, sus.id, base, { datosCliente: factura, reenviar: true })
  }
  return { sus, pdf }
}

export async function pdfDelContrato({ token = null, susId = null }) {
  const { rows } = token
    ? await query(`SELECT pdf, suscripcion_id FROM contratos WHERE token = $1 AND estado = 'firmado'`, [String(token)])
    : await query(`SELECT pdf, suscripcion_id FROM contratos WHERE suscripcion_id = $1 AND estado = 'firmado'`, [Number(susId)])
  if (!rows[0]) return null
  const sus = await cargarSuscripcion(query, rows[0].suscripcion_id)
  return { pdf: Buffer.from(rows[0].pdf, 'base64'), nombre: `Contrato AR Studio ${sus.codigo}.pdf` }
}

// Desde el panel: crea el enlace para firmar (si no lo tiene) y se lo manda por correo
export async function enviarEnlaceContrato(susId, base) {
  const r = await transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, susId, { bloquear: true })
    const { rows } = await q('SELECT * FROM contratos WHERE suscripcion_id = $1 FOR UPDATE', [sus.id])
    if (rows[0]?.estado === 'firmado') throw new ErrorReserva('firmado', 'El contrato ya está firmado.', 409)
    let token = rows[0]?.token
    if (rows[0]) {
      await q('UPDATE contratos SET enviado_en = now(), actualizado_en = now() WHERE id = $1', [rows[0].id])
    } else {
      token = tokenNuevo()
      await q('INSERT INTO contratos (suscripcion_id, token, version, enviado_en) VALUES ($1, $2, $3, now())', [sus.id, token, CONTRATO_VERSION])
      await q(`UPDATE suscripciones SET contrato_estado = 'pendiente', actualizado_en = now() WHERE id = $1`, [sus.id])
    }
    await registrar(q, null, 'contrato_enviado', { nuevo: !rows[0] }, { suscripcionId: sus.id, autor: 'panel' })
    return { sus: await cargarSuscripcion(q, sus.id), token }
  })
  await correoFirmarContrato(r.sus, { urlContrato: urlContrato(base, r.token), iban: ibanEstudio(), titular: titular() })
  return { url: urlContrato(base, r.token) }
}

// ---------- 4. Cuotas que se pagan con enlace ----------

async function tokenDeCuota(q, cuotaId) {
  const { rows } = await q('SELECT pago_token FROM cuotas WHERE id = $1', [Number(cuotaId)])
  if (!rows[0]) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
  if (rows[0].pago_token) return rows[0].pago_token
  const token = tokenNuevo()
  await q('UPDATE cuotas SET pago_token = $2 WHERE id = $1 AND pago_token IS NULL', [Number(cuotaId), token])
  const { rows: r2 } = await q('SELECT pago_token FROM cuotas WHERE id = $1', [Number(cuotaId)])
  return r2[0].pago_token
}

// Miembros de la web o con cobro automático: al pagar con el enlace se guarda la tarjeta
function guardaTarjetaAlPagar(sus) {
  return sus.cobroAuto || sus.origen === 'web'
}

// Lo que enseña /cuota/<token>. null si el enlace no vale.
export async function paginaCuota(token) {
  const t = String(token || '')
  if (t.length < 20) return null
  const { rows } = await query('SELECT *, desde::text AS desde_txt, hasta::text AS hasta_txt, pagada_en::text AS pagada_en_txt FROM cuotas WHERE pago_token = $1', [t])
  if (!rows[0]) return null
  const cuota = aCuota(rows[0])
  const sus = await cargarSuscripcion(query, cuota.suscripcionId)
  // Mientras se cobra sola (o hay un cobro por comprobar) no se puede pagar también aquí
  const enCurso = ['cobrando', 'revisar'].includes(cuota.cobroEstado)
  const pagable = cuota.estado === 'pendiente' && cuota.importeCent > 0 && estadoDe(sus, hoyMadrid()) !== 'finalizada' && !enCurso
  return { cuota: { ...cuota, texto: textoPeriodo(cuota) }, sus, pagable, enCurso, guardaTarjeta: guardaTarjetaAlPagar(sus) }
}

export async function pagarCuota(token, base) {
  const proveedor = await comprobarProveedor(proveedorActivo())
  return transaction(async (tx) => {
    const q = tx.query
    const { rows } = await q('SELECT * FROM cuotas WHERE pago_token = $1 FOR UPDATE', [String(token || '')])
    const c = rows[0]
    if (!c) throw new ErrorReserva('no_existe', 'Este enlace no es válido.', 404)
    if (c.estado !== 'pendiente') throw new ErrorReserva('estado', c.estado === 'pagada' ? 'Esta cuota ya está pagada.' : 'Esta cuota ya no se puede pagar.', 409)
    if (c.importe_cent <= 0) throw new ErrorReserva('importe', 'Esta cuota no tiene nada que pagar.', 409)
    if (['cobrando', 'revisar'].includes(c.cobro_estado)) {
      throw new ErrorReserva('cobrando', 'Estamos cobrando esta cuota en tu tarjeta. Si tienes dudas, escríbenos por WhatsApp.', 409)
    }
    const { rows: ss } = await q('SELECT * FROM suscripciones WHERE id = $1', [c.suscripcion_id])
    const sus = aSuscripcion(ss[0])
    // Si sus cuotas se cobran solas, al pagar aquí se guarda esta tarjeta para las siguientes
    const guardarTarjeta = cobroRecurrente(proveedor) && guardaTarjetaAlPagar(sus)
    const pago = await nuevoPago(q, { cuotaId: c.id, proveedor: proveedor.id, importeCent: c.importe_cent, guardaTarjeta: guardarTarjeta })
    return {
      pago: formularioPago(proveedor, {
        pedido: pago.pedido, importeCent: pago.importe_cent,
        descripcion: `Cuota AR Studio · plan ${PLANES[c.plan]?.nombre || c.plan} · ${sus.codigo} · mes ${c.periodo}`,
        titularPago: `${sus.nombre} ${sus.apellidos}`, email: sus.email, token: c.pago_token, guardarTarjeta,
      }, base),
    }
  })
}

// Manda el enlace de pago de una cuota (cron al empezar el periodo, o el panel)
export async function enviarEnlaceCuota(cuotaId, base) {
  const token = await tokenDeCuota(query, cuotaId)
  const { rows } = await query('SELECT *, desde::text AS desde_txt, hasta::text AS hasta_txt, pagada_en::text AS pagada_en_txt FROM cuotas WHERE id = $1', [Number(cuotaId)])
  const cuota = aCuota(rows[0])
  if (cuota.estado !== 'pendiente' || cuota.importeCent <= 0) throw new ErrorReserva('estado', 'Esta cuota no está pendiente de pago.', 409)
  const sus = await cargarSuscripcion(query, cuota.suscripcionId)
  await correoPagarCuota(sus, cuota, { url: urlCuota(base, token), iban: ibanEstudio(), titular: titular(), guardaTarjeta: guardaTarjetaAlPagar(sus) && cobroAutomaticoActivo() })
  await query('UPDATE cuotas SET aviso_pago_en = now() WHERE id = $1', [cuota.id])
  await registrar(query, null, 'enlace_cuota', { periodo: cuota.periodo }, { suscripcionId: sus.id, autor: 'sistema' })
  return { url: urlCuota(base, token) }
}

// ---------- 5. Cobro automático de las cuotas con la tarjeta guardada ----------

// Reintentos si el banco rechaza el cobro: al día siguiente y a los 3 días del primero
export const COBRO_REINTENTOS_DIAS = [1, 2]
const MAX_INTENTOS = COBRO_REINTENTOS_DIAS.length + 1
// Un cobro que lleva más de esto «cobrando» se dio por perdido (el proceso se cortó)
const COBRO_COLGADO_MS = 30 * 60000
// Un pago con el enlace más reciente que esto se da por «en curso» (no se cobra con la tarjeta)
const ENLACE_EN_CURSO_MS = 2 * 3600000

// Cobra una cuota con la tarjeta guardada. Nunca cobra dos veces la misma cuota: el estado
// «cobrando» y un índice único en la base de datos lo impiden aunque el cron corra a la vez.
// forzar: desde el panel («Cobrar ahora»), también una cuota rechazada o agotada.
// Devuelve { resultado: 'cobrada' | 'rechazada' | 'agotada' | 'revisar' | 'saltada', motivo? }
export async function cobrarCuotaAutomatica(cuotaId, base, { ahora = new Date(), forzar = false, autor = 'sistema' } = {}) {
  const hoy = fechaMadrid(ahora)
  // El TPV se comprueba fuera de la transacción (consulta la base de datos)
  const { rows: tp } = await query('SELECT s.tarjeta_proveedor FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id WHERE c.id = $1', [Number(cuotaId)])
  if (!tp[0]) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
  const proveedor = await comprobarProveedor(proveedorPorId(tp[0].tarjeta_proveedor || proveedorActivo().id))
  if (!cobroRecurrente(proveedor)) return { resultado: 'saltada', motivo: 'El cobro automático no está activado en el TPV.' }
  const preparado = await transaction(async (tx) => {
    const q = tx.query
    const { rows } = await q('SELECT *, desde::text AS desde_txt, cobro_proximo::text AS cobro_proximo_txt FROM cuotas WHERE id = $1 FOR UPDATE', [Number(cuotaId)])
    const c = rows[0]
    if (!c) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
    const { rows: ss } = await q('SELECT *, ultimo_dia::text AS ultimo_dia_txt FROM suscripciones WHERE id = $1 FOR UPDATE', [c.suscripcion_id])
    const s0 = ss[0]
    const saltar = (motivo) => ({ saltada: motivo })
    if (c.estado !== 'pendiente') return saltar(c.estado === 'pagada' ? 'Ya está pagada.' : 'No está pendiente.')
    if (c.importe_cent <= 0) return saltar('No tiene nada que cobrar.')
    if (!s0.cobro_auto || !s0.tarjeta_ref) return saltar('No tiene el cobro automático con tarjeta.')
    if (s0.ultimo_dia_txt && s0.ultimo_dia_txt < c.desde_txt) return saltar('Es de después de su baja.')
    if (c.desde_txt > hoy) return saltar('Aún no ha empezado ese mes.')
    if (c.cobro_estado === 'cobrando') return saltar('Ya se está cobrando.')
    if (c.cobro_estado === 'revisar') return saltar('Hay un cobro sin confirmar: compruébalo en el portal del TPV.')
    if (!forzar) {
      if (c.cobro_estado === 'agotado') return saltar('Ya se intentó todas las veces.')
      if (c.cobro_estado === 'rechazado' && c.cobro_proximo_txt && c.cobro_proximo_txt > hoy) return saltar('El siguiente intento es más adelante.')
    }
    const { rows: ya } = await q(`SELECT 1 FROM pagos_suscripcion WHERE cuota_id = $1 AND tipo = 'mit' AND estado IN ('iniciado', 'pagado')`, [c.id])
    if (ya.length) return saltar('Ya hay un cobro automático de esta cuota.')
    // Un pago con el enlace a medias (está en la página del banco, o la cerró sin resultado):
    // cobrar ahora con la tarjeta podría cobrarla dos veces
    const { rows: enlace } = await q(`SELECT creado_en FROM pagos_suscripcion WHERE cuota_id = $1 AND tipo <> 'mit' AND estado = 'iniciado'`, [c.id])
    if (enlace.some((p) => ahora.getTime() - new Date(p.creado_en).getTime() < ENLACE_EN_CURSO_MS)) {
      return saltar('Está pagándola con el enlace ahora mismo.')
    }
    if (enlace.length) {
      const motivo = 'Hay un pago con el enlace sin resultado: comprueba en el portal del TPV si se cobró.'
      await q(`UPDATE cuotas SET cobro_estado = 'revisar', cobro_error = $2, actualizado_en = now() WHERE id = $1`, [c.id, motivo])
      await registrar(q, null, 'cobro_revisar', { periodo: c.periodo, error: 'enlace_sin_resultado' }, { suscripcionId: s0.id, autor })
      return { saltada: motivo, revisar: true, susId: s0.id }
    }
    const pago = await nuevoPago(q, { cuotaId: c.id, proveedor: proveedor.id, importeCent: c.importe_cent, tipo: 'mit' })
    await q(`UPDATE cuotas SET cobro_estado = 'cobrando', cobro_iniciado_en = now(), cobro_intentos = cobro_intentos + 1, actualizado_en = now() WHERE id = $1`, [c.id])
    await registrar(q, null, 'cobro_intento', { periodo: c.periodo, pedido: pago.pedido, intento: c.cobro_intentos + 1 }, { suscripcionId: s0.id, autor })
    return {
      pago, intento: c.cobro_intentos + 1, susId: s0.id, periodo: c.periodo,
      tarjeta: { ref: s0.tarjeta_ref, cofTxnid: s0.tarjeta_cof_txnid },
      descripcion: `Cuota AR Studio · plan ${PLANES[c.plan]?.nombre || c.plan} · ${s0.codigo} · mes ${c.periodo}`,
    }
  })
  if (preparado.revisar) {
    await avisarCobro(preparado.susId, cuotaId, 'revisar', base, { error: preparado.saltada })
    return { resultado: 'revisar', motivo: preparado.saltada }
  }
  if (preparado.saltada) return { resultado: 'saltada', motivo: preparado.saltada }

  const { pago, intento, susId } = preparado
  let resultado
  try {
    resultado = await proveedor.cobrarMit({
      pedido: pago.pedido, importeCent: pago.importe_cent, tarjetaRef: preparado.tarjeta.ref, cofTxnid: preparado.tarjeta.cofTxnid, descripcion: preparado.descripcion,
    })
  } catch (e) {
    if (e.desconocido) {
      // No sabemos si el banco lo ha cobrado: no se reintenta solo, lo mira el estudio
      await query(`UPDATE cuotas SET cobro_estado = 'revisar', cobro_error = $2, actualizado_en = now() WHERE id = $1`, [Number(cuotaId), String(e.message).slice(0, 300)])
      await registrar(query, null, 'cobro_revisar', { periodo: preparado.periodo, pedido: pago.pedido, error: String(e.message) }, { suscripcionId: susId, autor: 'sistema' })
      await avisarCobro(susId, cuotaId, 'revisar', base, { error: e.message })
      return { resultado: 'revisar', motivo: e.message }
    }
    // Rechazo claro sin cobro (p. ej. SIS0xxx): como una tarjeta rechazada
    resultado = { pedido: pago.pedido, pagado: false, codigo: e.codigo || 'error', autorizacion: null, datos: { error: String(e.message) } }
  }
  if (resultado.pedido !== pago.pedido) resultado = { ...resultado, pedido: pago.pedido }
  const r = await recibirResultadoSuscripcion(proveedor.id, resultado, base)
  if (resultado.pagado && r.aviso === 'cuota') {
    // Sin factura automática, al menos un correo de que se ha cobrado
    if (!facturasAutomaticas()) {
      const sus = await cargarSuscripcion(query, susId)
      const { rows } = await query(`${SELECT_CUOTA_TXT} WHERE id = $1`, [Number(cuotaId)])
      await correoCuotaCobrada(sus, aCuota(rows[0])).catch((e) => console.error('[cobros] correo del cobro fallido', e.message))
    }
    return { resultado: 'cobrada' }
  }
  if (resultado.pagado) return { resultado: 'revisar', motivo: r.aviso }

  // Rechazado: siguiente intento o se acabaron
  const agotado = intento >= MAX_INTENTOS
  const proximo = agotado ? null : sumarDias(hoy, COBRO_REINTENTOS_DIAS[intento - 1])
  const motivo = `Rechazado por el banco (código ${resultado.codigo || '—'})`
  await query(`UPDATE cuotas SET cobro_estado = $2, cobro_proximo = $3::date, cobro_error = $4, actualizado_en = now() WHERE id = $1`,
    [Number(cuotaId), agotado ? 'agotado' : 'rechazado', proximo, motivo])
  await registrar(query, null, agotado ? 'cobro_agotado' : 'cobro_rechazado', { periodo: preparado.periodo, pedido: pago.pedido, codigo: resultado.codigo, proximo }, { suscripcionId: susId, autor: 'sistema' })
  await avisarCobro(susId, cuotaId, agotado ? 'agotado' : 'rechazado', base, { intento, proximo, codigo: resultado.codigo })
  return { resultado: agotado ? 'agotada' : 'rechazada', motivo }
}

const SELECT_CUOTA_TXT = `SELECT *, desde::text AS desde_txt, hasta::text AS hasta_txt, pagada_en::text AS pagada_en_txt, cobro_proximo::text AS cobro_proximo_txt FROM cuotas`

// Correos de un cobro que no ha salido: al miembro (con el enlace para pagar) y al estudio
async function avisarCobro(susId, cuotaId, tipo, base, info = {}) {
  try {
    const sus = await cargarSuscripcion(query, susId)
    const { rows } = await query(`${SELECT_CUOTA_TXT} WHERE id = $1`, [Number(cuotaId)])
    const cuota = aCuota(rows[0])
    // Al miembro: en el primer rechazo y cuando ya no se va a reintentar (no si hay que revisarlo)
    if (tipo === 'agotado' || (tipo === 'rechazado' && info.intento === 1)) {
      const token = await tokenDeCuota(query, cuota.id)
      // Mientras quedan reintentos, solo el enlace: si pagara por transferencia, el reintento
      // la cobraría otra vez en la tarjeta. Sin más reintentos ya puede ir por transferencia.
      const ultimo = tipo === 'agotado'
      await correoCobroRechazado(sus, cuota, { url: urlCuota(base, token), proximo: info.proximo || null, iban: ultimo ? ibanEstudio() : null, titular: titular(), conFianza: ultimo && sus.fianzaEstado === 'cobrada' })
      await query('UPDATE cuotas SET aviso_pago_en = now() WHERE id = $1', [cuota.id])
    }
    await avisoCobroEstudio(sus, tipo, { urlFicha: urlFicha(base, sus.id), cuota, ...info })
  } catch (e) {
    console.error('[cobros] aviso del cobro fallido', susId, e.message)
    await registrar(query, null, 'correo_fallido', { error: String(e.message || e) }, { suscripcionId: susId, autor: 'sistema' }).catch(() => {})
  }
}

// Cobros que se quedaron «cobrando» (el proceso se cortó a medias): no se sabe si el banco
// cobró, así que pasan a «revisar» y se avisa al estudio. Nunca se vuelven a cobrar solos.
export async function revisarCobrosColgados(base, { ahora = new Date() } = {}) {
  const { rows } = await query(
    `UPDATE cuotas SET cobro_estado = 'revisar', cobro_error = 'El cobro se cortó a medias: comprueba en el portal del TPV si se cobró.', actualizado_en = now()
      WHERE cobro_estado = 'cobrando' AND cobro_iniciado_en < $1 RETURNING id, suscripcion_id, periodo`,
    [new Date(ahora.getTime() - COBRO_COLGADO_MS)]
  )
  for (const c of rows) {
    await registrar(query, null, 'cobro_revisar', { periodo: c.periodo, error: 'cortado' }, { suscripcionId: c.suscripcion_id, autor: 'sistema' }).catch(() => {})
    await avisarCobro(c.suscripcion_id, c.id, 'revisar', base, { error: 'El cobro se cortó a medias.' })
  }
  return rows.length
}

// Las cuotas que toca cobrar hoy (las que empiezan y los reintentos)
export async function cobrosAutomaticosDelDia(base, { ahora = new Date() } = {}) {
  const hoy = fechaMadrid(ahora)
  const r = { cobradas: 0, rechazadas: 0, revisar: 0, colgados: await revisarCobrosColgados(base, { ahora }) }
  if (!cobroAutomaticoActivo()) return r
  const { rows } = await query(
    `SELECT c.id FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE s.cobro_auto AND s.tarjeta_ref IS NOT NULL AND c.estado = 'pendiente' AND c.importe_cent > 0
        AND c.desde <= $1::date AND (s.ultimo_dia IS NULL OR s.ultimo_dia >= c.desde)
        AND (c.cobro_estado IS NULL OR (c.cobro_estado = 'rechazado' AND (c.cobro_proximo IS NULL OR c.cobro_proximo <= $1::date)))
      ORDER BY c.desde, c.id`,
    [hoy]
  )
  for (const c of rows) {
    try {
      const x = await cobrarCuotaAutomatica(c.id, base, { ahora })
      if (x.resultado === 'cobrada') r.cobradas++
      else if (['rechazada', 'agotada'].includes(x.resultado)) r.rechazadas++
      else if (x.resultado === 'revisar') r.revisar++
    } catch (e) {
      console.error('[cobros] cobro automático fallido', c.id, e.message)
    }
  }
  return r
}

// Desde el panel: dejar de cobrar solo (las cuotas se marcan a mano o con enlace) o volver a cobrar
export async function cambiarCobroAutomatico(susId, activar, { autor = 'panel' } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const sus = await cargarSuscripcion(q, susId, { bloquear: true })
    const { rows } = await q('SELECT tarjeta_ref FROM suscripciones WHERE id = $1', [sus.id])
    if (activar && !rows[0].tarjeta_ref) throw new ErrorReserva('tarjeta', 'No tiene tarjeta guardada: tiene que pagar una cuota con el enlace para guardarla.', 409)
    if (activar && !cobroAutomaticoActivo()) throw new ErrorReserva('tpv', 'El cobro automático no está activado en el TPV (REDSYS_COBRO_RECURRENTE).', 409)
    await q('UPDATE suscripciones SET cobro_auto = $2, cobro_enlace = CASE WHEN $2 THEN false ELSE cobro_enlace END, actualizado_en = now() WHERE id = $1', [sus.id, Boolean(activar)])
    await registrar(q, null, activar ? 'cobro_activado' : 'cobro_desactivado', null, { suscripcionId: sus.id, autor })
    return cargarSuscripcion(q, sus.id)
  })
}

// Un cobro por comprobar que el estudio ha mirado en el portal del TPV: no se cobró
// (vuelve a poder cobrarse) o sí se cobró (se marca pagada a mano desde la cuota)
export async function resolverCobroRevisar(cuotaId, { autor = 'panel' } = {}) {
  return transaction(async (tx) => {
    const q = tx.query
    const { rows } = await q('SELECT * FROM cuotas WHERE id = $1 FOR UPDATE', [Number(cuotaId)])
    const c = rows[0]
    if (!c) throw new ErrorReserva('no_existe', 'Cuota no encontrada.', 404)
    if (c.cobro_estado !== 'revisar') throw new ErrorReserva('estado', 'Esta cuota no tiene un cobro por comprobar.', 409)
    await q(`UPDATE pagos_suscripcion SET estado = 'fallido', codigo_respuesta = coalesce(codigo_respuesta, 'no_cobrado'), actualizado_en = now()
              WHERE cuota_id = $1 AND tipo = 'mit' AND estado = 'iniciado'`, [c.id])
    await q(`UPDATE cuotas SET cobro_estado = 'rechazado', cobro_proximo = NULL, actualizado_en = now() WHERE id = $1`, [c.id])
    await registrar(q, null, 'cobro_no_cobrado', { periodo: c.periodo }, { suscripcionId: c.suscripcion_id, autor })
  })
}

// Para la ficha del panel: los cobros automáticos hechos y su resultado
export async function historialCobros(susId) {
  const { rows } = await query(
    `SELECT p.pedido, p.estado, p.codigo_respuesta, p.importe_cent, p.creado_en, c.periodo
       FROM pagos_suscripcion p JOIN cuotas c ON c.id = p.cuota_id
      WHERE c.suscripcion_id = $1 AND p.tipo = 'mit' ORDER BY p.creado_en DESC, p.id DESC LIMIT 30`,
    [Number(susId)]
  )
  return rows.map((f) => ({
    pedido: f.pedido, estado: f.estado, codigo: f.codigo_respuesta, importeCent: f.importe_cent,
    cuando: new Date(f.creado_en).toISOString(), periodo: f.periodo,
  }))
}

// ---------- Tarea diaria ----------

// Recordatorio de los contratos sin firmar a las 48 h, enlaces de pago de las cuotas que
// empiezan (sin cobro automático) y cobros automáticos con la tarjeta guardada
export async function tareasDiariasSuscripciones(base, { ahora = new Date() } = {}) {
  const hoy = fechaMadrid(ahora)
  let recordados = 0
  let enlaces = 0
  const { rows: cs } = await query(
    `SELECT c.* FROM contratos c JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE c.estado = 'pendiente' AND c.recordado_en IS NULL AND coalesce(c.enviado_en, c.creado_en) < $1
        AND (s.ultimo_dia IS NULL OR s.ultimo_dia >= $2::date)`,
    [new Date(ahora.getTime() - 48 * 3600000), hoy]
  )
  for (const f of cs) {
    try {
      const sus = await cargarSuscripcion(query, f.suscripcion_id)
      await correoFirmarContrato(sus, { urlContrato: urlContrato(base, f.token), recordatorio: true, iban: ibanEstudio(), titular: titular() })
      await avisoContratoSinFirmar(sus, { urlFicha: urlFicha(base, sus.id) })
      await query('UPDATE contratos SET recordado_en = now() WHERE id = $1', [f.id])
      await registrar(query, null, 'contrato_recordado', null, { suscripcionId: sus.id, autor: 'sistema' })
      recordados++
    } catch (e) {
      console.error('[contratos] recordatorio fallido', f.id, e.message)
    }
  }
  const { rows: qs } = await query(
    `SELECT c.id FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE s.cobro_enlace AND NOT s.cobro_auto AND c.estado = 'pendiente' AND c.importe_cent > 0 AND c.aviso_pago_en IS NULL
        AND c.periodo > 1 AND c.desde <= $1::date AND (s.ultimo_dia IS NULL OR s.ultimo_dia >= c.desde)`,
    [hoy]
  )
  for (const c of qs) {
    try {
      await enviarEnlaceCuota(c.id, base)
      enlaces++
    } catch (e) {
      console.error('[cuotas] enlace de pago fallido', c.id, e.message)
    }
  }
  // Cobros automáticos con la tarjeta guardada (los que empiezan hoy y los reintentos)
  const cobros = await cobrosAutomaticosDelDia(base, { ahora })
  return { recordados, enlaces, cobros }
}

