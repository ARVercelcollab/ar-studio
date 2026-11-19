// Alta de miembros por la web, contrato firmado en la web y cuotas que se pagan con enlace.
//
// 1. En /planmensual/alta la persona elige plan, deja nombre, correo y teléfono, acepta haber
//    leído las condiciones y el modelo de contrato, y paga el primer mes por el TPV.
// 2. Cuando el banco confirma el pago (su aviso es la fuente de verdad; se puede recibir
//    varias veces y solo cuenta la primera), se crea la suscripción con la primera cuota
//    pagada (y su factura), «Contrato pendiente» y «Fianza pendiente».
// 3. En /contrato/<token> rellena sus datos, firma dibujando y le llega el PDF. La fianza
//    se paga por transferencia (se marca en el panel cuando llega).
// 4. Al empezar cada periodo, el cron diario manda un enlace (/cuota/<token>) para pagar la
//    cuota por el TPV. Al pagarse se marca pagada y sale su factura.

import { query, transaction } from '../db/index.js'
import { proveedorActivo, comprobarProveedor } from '../pagos/index.js'
import { ErrorReserva, tokenNuevo, registrar } from '../reservas/servicio.js'
import { PLANES, ESTUDIO, formatoEuros } from '../reservas/config.js'
import { fechaMadrid } from '../reservas/tiempo.js'
import { crearSuscripcion, aSuscripcion, aCuota, _cargarSuscripcion as cargarSuscripcion } from './servicio.js'
import { estadoDe, textoPeriodo } from './reglas.js'
import { CONTRATO_VERSION, firmanteEstudio, ibanEstudio, condicionesDeSuscripcion } from './contrato.js'
import { pdfContrato } from './contratoPdf.js'
import {
  correoAltaPagada, avisoAltaEstudio, correoContratoFirmado, correoFirmarContrato, avisoContratoSinFirmar,
  correoPagarCuota, avisoPagoSuscripcion,
} from './correos.js'
import { facturasAutomaticas } from '../facturas/servicio.js'
import { emitirYEnviarCuota } from '../facturas/envio.js'
import { PLAZAS_LIBRES } from '../plazas.js'

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const hoyMadrid = () => fechaMadrid(new Date())
const titular = () => firmanteEstudio().nombre

export const urlContrato = (base, token) => `${base}/contrato/${token}`
export const urlCuota = (base, token) => `${base}/cuota/${token}`
export const urlFicha = (base, id) => `${base}/admin/suscripciones/${id}`

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
  if (b.acepta !== true) errores.acepta = 'Marca la casilla para seguir.'
  if (Object.keys(errores).length) return { ok: false, errores }
  return { ok: true, datos: { plan, nombre, apellidos, email, telefono } }
}

async function nuevoPago(q, { altaId = null, cuotaId = null, proveedor, importeCent }) {
  const { rows } = await q(
    `INSERT INTO pagos_suscripcion (alta_id, cuota_id, proveedor, importe_cent, pedido)
     VALUES ($1, $2, $3, $4, to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYMM') || lpad(nextval('pedido_seq')::text, 8, '0'))
     RETURNING *`,
    [altaId, cuotaId, proveedor, importeCent]
  )
  return rows[0]
}

function formularioPago(proveedor, { pedido, importeCent, descripcion, titularPago, email, token }, base) {
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
  })
}

const descripcionAlta = (plan) => `Suscripción AR Studio · plan ${PLANES[plan].nombre} · primer mes`

// Guarda lo que ha dejado y devuelve el formulario para ir al TPV
export async function crearAlta(datos, base, { huella = null } = {}) {
  const proveedor = await comprobarProveedor(proveedorActivo())
  const plan = PLANES[datos.plan]
  if ((PLAZAS_LIBRES[datos.plan] ?? 0) <= 0) {
    throw new ErrorReserva('plazas', `Ahora no quedan plazas en el plan ${plan.nombre}. Escríbenos por WhatsApp y te apuntamos a la lista de espera.`, 409)
  }
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
    const pago = await nuevoPago(q, { altaId: alta.id, proveedor: proveedor.id, importeCent: alta.importe_cent })
    return {
      token,
      importe: formatoEuros(alta.importe_cent),
      pago: formularioPago(proveedor, {
        pedido: pago.pedido, importeCent: pago.importe_cent, descripcion: descripcionAlta(alta.plan),
        titularPago: `${alta.nombre} ${alta.apellidos}`, email: alta.email, token,
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
    await q(`UPDATE altas SET estado = 'pendiente', actualizado_en = now() WHERE id = $1`, [alta.id])
    const pago = await nuevoPago(q, { altaId: alta.id, proveedor: proveedor.id, importeCent: alta.importe_cent })
    return {
      token,
      pago: formularioPago(proveedor, {
        pedido: pago.pedido, importeCent: pago.importe_cent, descripcion: descripcionAlta(alta.plan),
        titularPago: `${alta.nombre} ${alta.apellidos}`, email: alta.email, token,
      }, base),
    }
  })
}

// ---------- 2. Llega el resultado del TPV ----------

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
      return { ...base0, aviso: 'importe_distinto' }
    }

    if (alta) {
      if (alta.estado === 'pagada') {
        await registrar(q, null, 'pago_revisar', { pedido, motivo: 'duplicado' }, { suscripcionId: alta.suscripcion_id, autor: 'sistema' })
        return { ...base0, aviso: 'duplicado' }
      }
      const { suscripcion } = await crearSuscripcion({
        plan: alta.plan, nombre: alta.nombre, apellidos: alta.apellidos, email: alta.email, telefono: alta.telefono,
        fechaInicio: hoy, metodoHabitual: 'tarjeta', fianza: { estado: 'pendiente' },
        primeraPagada: { metodo: 'tarjeta', fecha: hoy, referencia: `TPV ${pedido}` },
      }, { confirmado: true, autor: 'web', q })
      await q(`UPDATE suscripciones SET origen = 'web', cobro_enlace = true, contrato_estado = 'pendiente', actualizado_en = now() WHERE id = $1`, [suscripcion.id])
      await q(`UPDATE cuotas SET proveedor = 'comercia', proveedor_ref = $2 WHERE suscripcion_id = $1 AND periodo = 1`, [suscripcion.id, pedido])
      await q(`INSERT INTO contratos (suscripcion_id, token, version, enviado_en) VALUES ($1, $2, $3, now())`, [suscripcion.id, alta.token, CONTRATO_VERSION])
      await q(`UPDATE altas SET estado = 'pagada', suscripcion_id = $2, actualizado_en = now() WHERE id = $1`, [alta.id, suscripcion.id])
      await registrar(q, null, 'alta_web', { pedido, autorizacion, contratoVersion: alta.contrato_version }, { suscripcionId: suscripcion.id, autor: 'web' })
      const { rows: c1 } = await q('SELECT id FROM cuotas WHERE suscripcion_id = $1 AND periodo = 1', [suscripcion.id])
      return { ...base0, susId: suscripcion.id, cuotaId: c1[0].id, aviso: 'alta' }
    }

    // Cuota de un periodo
    if (cuotaFila.estado !== 'pendiente') {
      await registrar(q, null, 'pago_revisar', { pedido, motivo: cuotaFila.estado === 'pagada' ? 'duplicado' : 'sin_cuota', periodo: cuotaFila.periodo }, { suscripcionId: susId, autor: 'sistema' })
      return { ...base0, aviso: cuotaFila.estado === 'pagada' ? 'duplicado' : 'sin_cuota' }
    }
    await q(
      `UPDATE cuotas SET estado = 'pagada', metodo_pago = 'tarjeta', pagada_en = $2, referencia = $3, proveedor = 'comercia',
          proveedor_ref = $4, actualizado_en = now() WHERE id = $1`,
      [cuotaFila.id, hoy, `TPV ${pedido}`, pedido]
    )
    await registrar(q, null, 'cuota_pagada', { periodo: cuotaFila.periodo, metodo: 'tarjeta', fecha: hoy, importeCent: cuotaFila.importe_cent, pedido }, { suscripcionId: susId, autor: 'web' })
    return { ...base0, aviso: 'cuota' }
  })

  const sus = r.susId ? await cargarSuscripcion(query, r.susId) : null
  const iban = ibanEstudio()
  try {
    if (r.aviso === 'alta') {
      await correoAltaPagada(sus, { urlContrato: urlContrato(base, r.token), iban, titular: titular() })
      await avisoAltaEstudio(sus, { urlFicha: urlFicha(base, sus.id) })
    } else if (['duplicado', 'importe_distinto', 'sin_cuota'].includes(r.aviso)) {
      await avisoPagoSuscripcion(sus, r.aviso, { urlFicha: sus ? urlFicha(base, sus.id) : null, pedido })
    }
  } catch (e) {
    console.error('[suscripciones] fallo al enviar correos', e.message)
    if (sus) await registrar(query, null, 'correo_fallido', { error: String(e.message || e) }, { suscripcionId: sus.id, autor: 'sistema' }).catch(() => {})
  }
  // La factura de la cuota pagada (completa o simplificada), aparte de los correos de arriba
  if (['alta', 'cuota'].includes(r.aviso) && facturasAutomaticas()) {
    try {
      await emitirYEnviarCuota(r.cuotaId)
    } catch (e) {
      console.error('[suscripciones] factura de cuota fallida', e.message)
      await registrar(query, null, 'factura_fallida', { error: String(e.message || e) }, { suscripcionId: r.susId, autor: 'sistema' }).catch(() => {})
    }
  }
  const destino = r.altaId ? urlContrato(base, r.token) : r.token ? urlCuota(base, r.token) : base
  return { tipo: 'suscripcion', aviso: r.aviso, suscripcion: sus, destino, codigo: sus?.codigo || pedido, resultado }
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
          factura = coalesce($5::jsonb, factura), actualizado_en = now() WHERE id = $1`,
      [susAntes.id, datos.nombre, datos.apellidos, datos.telefono, factura ? JSON.stringify(factura) : null]
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
    for (const c of simples) {
      await emitirYEnviarCuota(c.id, { datosCliente: factura, reenviar: true }).catch(async (e) => {
        await registrar(query, null, 'factura_fallida', { error: String(e.message || e) }, { suscripcionId: sus.id, autor: 'sistema' }).catch(() => {})
      })
    }
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

// Lo que enseña /cuota/<token>. null si el enlace no vale.
export async function paginaCuota(token) {
  const t = String(token || '')
  if (t.length < 20) return null
  const { rows } = await query('SELECT *, desde::text AS desde_txt, hasta::text AS hasta_txt, pagada_en::text AS pagada_en_txt FROM cuotas WHERE pago_token = $1', [t])
  if (!rows[0]) return null
  const cuota = aCuota(rows[0])
  const sus = await cargarSuscripcion(query, cuota.suscripcionId)
  const pagable = cuota.estado === 'pendiente' && cuota.importeCent > 0 && estadoDe(sus, hoyMadrid()) !== 'finalizada'
  return { cuota: { ...cuota, texto: textoPeriodo(cuota) }, sus, pagable }
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
    const { rows: ss } = await q('SELECT * FROM suscripciones WHERE id = $1', [c.suscripcion_id])
    const sus = aSuscripcion(ss[0])
    const pago = await nuevoPago(q, { cuotaId: c.id, proveedor: proveedor.id, importeCent: c.importe_cent })
    return {
      pago: formularioPago(proveedor, {
        pedido: pago.pedido, importeCent: pago.importe_cent,
        descripcion: `Cuota AR Studio · plan ${PLANES[c.plan]?.nombre || c.plan} · ${sus.codigo} · mes ${c.periodo}`,
        titularPago: `${sus.nombre} ${sus.apellidos}`, email: sus.email, token: c.pago_token,
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
  await correoPagarCuota(sus, cuota, { url: urlCuota(base, token), iban: ibanEstudio(), titular: titular() })
  await query('UPDATE cuotas SET aviso_pago_en = now() WHERE id = $1', [cuota.id])
  await registrar(query, null, 'enlace_cuota', { periodo: cuota.periodo }, { suscripcionId: sus.id, autor: 'sistema' })
  return { url: urlCuota(base, token) }
}

// ---------- Tarea diaria ----------

// Recordatorio de los contratos sin firmar a las 48 h y enlaces de pago de las cuotas que empiezan
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
      WHERE s.cobro_enlace AND c.estado = 'pendiente' AND c.importe_cent > 0 AND c.aviso_pago_en IS NULL
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
  return { recordados, enlaces }
}

