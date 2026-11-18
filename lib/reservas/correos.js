// Correos de las reservas (con Resend, como el resto de la web).
// Sin RESEND_API_KEY, en local se guardan en .data/correos/ para poder verlos.

import { Resend } from 'resend'
import { ESTUDIO, FONDOS, EQUIPO, TEXTO_CANCELACION, formatoEuros, porcentajeReembolso } from './config.js'
import { textoFranja, textoFecha, fechaMadrid, horaMadrid } from './tiempo.js'
import { icsCliente } from './ics.js'

const REMITENTE = () => process.env.RESERVAS_EMAIL_FROM || 'AR Studio <reservas@studioar.es>'
const ESTUDIO_EMAIL = () => process.env.RESERVAS_EMAIL_ESTUDIO || ESTUDIO.email

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

const MARRON = '#4b3828'
const BEIGE = '#d4c4b2'

function plantilla({ titulo, intro, filas = [], boton, bloques = [], pie }) {
  const tabla = filas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0">
        ${filas.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#8a7a6c;font-size:13px;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eee;color:${MARRON};font-size:14px">${v}</td></tr>`).join('')}
      </table>`
    : ''
  const btn = boton
    ? `<p style="margin:24px 0"><a href="${esc(boton.url)}" style="background:${MARRON};color:#fff;text-decoration:none;padding:12px 18px;font-size:14px;letter-spacing:.5px;text-transform:uppercase;display:inline-block">${esc(boton.texto)}</a></p>`
    : ''
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f3ef;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px 28px">
    <p style="margin:0 0 24px;font-size:20px;letter-spacing:-.5px;color:${MARRON};text-transform:uppercase">AR Studio</p>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:400;color:${MARRON}">${esc(titulo)}</h1>
    ${intro ? `<p style="margin:0;color:${MARRON};font-size:15px;line-height:1.5">${intro}</p>` : ''}
    ${tabla}${btn}
    ${bloques.map((b) => `<div style="background:#f6f3ef;border-left:3px solid ${BEIGE};padding:12px 14px;margin:16px 0;color:${MARRON};font-size:13px;line-height:1.5">${b}</div>`).join('')}
    <p style="margin:28px 0 0;color:#8a7a6c;font-size:12px;line-height:1.5">${pie || `${esc(ESTUDIO.direccion)} · WhatsApp ${esc(ESTUDIO.whatsappVisible)} · ${esc(ESTUDIO.email)}`}</p>
  </div></body></html>`
}

async function enviar({ para, asunto, html, adjuntos, responderA, copiaOculta }) {
  const clave = process.env.RESEND_API_KEY
  if (!clave) {
    if (process.env.VERCEL) {
      console.warn('RESEND_API_KEY no configurada: no se envía', asunto)
      return { guardado: false }
    }
    const fs = await import('node:fs/promises')
    const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${asunto.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.html`
    await fs.mkdir('.data/correos', { recursive: true })
    await fs.writeFile(`.data/correos/${nombre}`, `<!-- Para: ${esc(para)}${copiaOculta ? ` | CCO: ${esc(copiaOculta)}` : ''} | Asunto: ${esc(asunto)} -->\n${html}`)
    for (const a of adjuntos || []) await fs.writeFile(`.data/correos/${nombre}-${a.filename}`, a.content)
    console.log(`[correo] ${asunto} -> ${para} (guardado en .data/correos/${nombre})`)
    return { guardado: true }
  }
  const resend = new Resend(clave)
  const { data, error } = await resend.emails.send({
    from: REMITENTE(),
    to: para,
    subject: asunto,
    html,
    replyTo: responderA,
    bcc: copiaOculta,
    attachments: adjuntos,
  })
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`)
  return data
}

const textoFondos = (id) => FONDOS.find((f) => f.id === id)?.texto || 'No'
const textoEquipo = (lista) => (lista?.length ? lista.map((id) => EQUIPO.find((e) => e.id === id)?.texto || id).join(', ') : 'Nada')
const nombreCompleto = (r) => `${r.nombre} ${r.apellidos}`.trim()
const enlaceWa = (texto) => `https://wa.me/${ESTUDIO.whatsapp}?text=${encodeURIComponent(texto)}`

function filasReserva(r) {
  return [
    ['Reserva', esc(r.codigo)],
    ['Cuándo', esc(textoFranja(r.inicio, r.fin))],
    ['Duración', `${r.duracionHoras} horas`],
    ['Importe', `${formatoEuros(r.precioCent)} (IVA incluido)${r.pagoEstado === 'pagado' ? ' · pagado' : ' · pendiente de pago'}`],
    ['Dónde', `<a href="${ESTUDIO.mapa}" style="color:${MARRON}">${esc(ESTUDIO.direccion)}</a>`],
  ]
}

function bloqueExtras(r) {
  const extras = []
  if (r.fondos && r.fondos !== 'no') extras.push(`Fondos: ${esc(textoFondos(r.fondos))}. Se pagan 20 € + IVA por metro usado el mismo día, por Bizum o transferencia, y el montaje es por tu cuenta.`)
  if (r.equipo?.length) {
    const dePago = r.equipo.some((id) => id !== 'proyector')
    extras.push(`Equipo: ${esc(textoEquipo(r.equipo))}. ${dePago ? 'Se paga el día de la reserva.' : 'Lo tendrás preparado.'}`)
  }
  return extras.length ? extras.join('<br>') : null
}

// ---- Al cliente ----

export async function correoConfirmacion(reserva, { urlReserva, facturaAutomatica = false }) {
  const extras = bloqueExtras(reserva)
  const factura = reserva.factura
    ? facturaAutomatica
      ? 'La factura te llega en un correo aparte en unos minutos.'
      : 'Te enviaremos la factura con los datos que nos has dado.'
    : null
  const html = plantilla({
    titulo: 'Tu reserva está confirmada',
    intro: `Hola ${esc(reserva.nombre)}, ya tienes el estudio reservado. Te esperamos.`,
    filas: filasReserva(reserva),
    boton: { texto: 'Ver mi reserva', url: urlReserva },
    bloques: [
      'Puedes entrar a partir de la hora reservada y la salida es a la hora de fin. Si te pasas más de 5 minutos se cobra media hora más. Deja el estudio como lo encontraste.',
      extras,
      factura,
      `<strong>Cambios y cancelaciones</strong><br>${TEXTO_CANCELACION.map(esc).join('<br>')}<br>Lee las <a href="${ESTUDIO.web}/condiciones" style="color:${MARRON}">condiciones del estudio</a>.`,
    ].filter(Boolean),
  })
  return enviar({
    para: reserva.email,
    asunto: `Reserva confirmada · ${textoFecha(fechaMadrid(reserva.inicio))}, ${horaMadrid(reserva.inicio)}`,
    html,
    responderA: ESTUDIO_EMAIL(),
    adjuntos: [{ filename: `reserva-${reserva.codigo}.ics`, content: Buffer.from(icsCliente(reserva, urlReserva), 'utf8') }],
  })
}

export async function correoRecordatorio(reserva, { urlReserva }) {
  const html = plantilla({
    titulo: `Mañana tienes el estudio a las ${horaMadrid(reserva.inicio)}`,
    intro: `Hola ${esc(reserva.nombre)}, te recordamos tu reserva en AR Studio.`,
    filas: filasReserva(reserva),
    boton: { texto: 'Cómo llegar', url: ESTUDIO.mapa },
    bloques: [bloqueExtras(reserva), `Si necesitas algo, escríbenos por <a href="${enlaceWa(`Hola, tengo la reserva ${reserva.codigo} mañana`)}" style="color:${MARRON}">WhatsApp</a>.`].filter(Boolean),
  })
  return enviar({ para: reserva.email, asunto: `Mañana a las ${horaMadrid(reserva.inicio)} en AR Studio`, html, responderA: ESTUDIO_EMAIL() })
}

export async function correoCambio(reserva, { urlReserva }) {
  const html = plantilla({
    titulo: 'Hemos cambiado tu reserva',
    intro: `Hola ${esc(reserva.nombre)}, así queda tu reserva:`,
    filas: filasReserva(reserva),
    boton: { texto: 'Ver mi reserva', url: urlReserva },
  })
  return enviar({
    para: reserva.email,
    asunto: `Tu reserva ahora es el ${textoFecha(fechaMadrid(reserva.inicio))}, ${horaMadrid(reserva.inicio)}`,
    html,
    responderA: ESTUDIO_EMAIL(),
    adjuntos: [{ filename: `reserva-${reserva.codigo}.ics`, content: Buffer.from(icsCliente(reserva, urlReserva), 'utf8') }],
  })
}

export async function correoCancelacion(reserva) {
  const devolucion = reserva.reembolsoCent ? `Te devolvemos ${formatoEuros(reserva.reembolsoCent)} a la misma tarjeta o cuenta con la que pagaste; puede tardar unos días en verse.` : null
  const html = plantilla({
    titulo: 'Tu reserva está cancelada',
    intro: `Hola ${esc(reserva.nombre)}, hemos cancelado la reserva ${esc(reserva.codigo)} del ${esc(textoFranja(reserva.inicio, reserva.fin))}.`,
    bloques: [devolucion, `Si quieres otra fecha, puedes reservar en <a href="${ESTUDIO.web}/reservar" style="color:${MARRON}">studioar.es/reservar</a>.`].filter(Boolean),
  })
  return enviar({ para: reserva.email, asunto: `Reserva ${reserva.codigo} cancelada`, html, responderA: ESTUDIO_EMAIL() })
}

export async function correoFactura(reserva, factura, pdf) {
  const html = plantilla({
    titulo: `Factura ${factura.codigo}`,
    intro: `Hola ${esc(reserva.nombre)}, te enviamos la factura de tu reserva ${esc(reserva.codigo)} del ${esc(textoFranja(reserva.inicio, reserva.fin))}.`,
    filas: [
      ['Factura', esc(factura.codigo)],
      ['A nombre de', esc(`${factura.cliente.nombre} · ${factura.cliente.nif}`)],
      ['Total', `${formatoEuros(factura.totalCent)} (IVA incluido)`],
    ],
    bloques: ['La tienes en PDF en este correo. Si hay que corregir algún dato, contesta a este correo.'],
  })
  return enviar({
    para: reserva.email,
    asunto: `Factura ${factura.codigo} · AR Studio`,
    html,
    responderA: ESTUDIO_EMAIL(),
    copiaOculta: ESTUDIO_EMAIL(),
    adjuntos: [{ filename: `Factura ${factura.codigo}.pdf`, content: pdf }],
  })
}

export async function avisoFacturaFallida(reserva, error, { urlPanel }) {
  const html = plantilla({
    titulo: 'No se ha podido enviar una factura',
    intro: `La reserva ${esc(reserva.codigo)} pidió factura y no se ha podido emitir o enviar: ${esc(error)}. Entra en el panel y pulsa «Emitir y enviar factura».`,
    filas: filasEstudio(reserva),
    boton: { texto: 'Abrir en el panel', url: `${urlPanel}/reserva/${reserva.id}` },
  })
  return enviar({ para: ESTUDIO_EMAIL(), asunto: `Factura pendiente: ${reserva.codigo}`, html })
}

// ---- Al estudio ----

function filasEstudio(r) {
  return [
    ...filasReserva(r),
    ['Cliente', esc(nombreCompleto(r))],
    ['Correo', `<a href="mailto:${esc(r.email)}" style="color:${MARRON}">${esc(r.email)}</a>`],
    ['WhatsApp', r.telefono ? `<a href="https://wa.me/${esc(r.telefono.replace(/[^0-9]/g, ''))}" style="color:${MARRON}">${esc(r.telefono)}</a>` : '—'],
    ['Actividad', esc(r.actividad || '—')],
    ['Fondos', esc(textoFondos(r.fondos))],
    ['Equipo', esc(textoEquipo(r.equipo))],
    ['Factura', r.factura ? esc(`${r.factura.nombre} · ${r.factura.nif} · ${r.factura.direccion}`) : 'No la pide'],
    ['Comentarios', esc(r.comentarios || '—')],
  ]
}

export async function avisoNuevaReserva(reserva, { urlPanel }) {
  const html = plantilla({
    titulo: 'Nueva reserva pagada',
    filas: filasEstudio(reserva),
    boton: { texto: 'Abrir en el panel', url: `${urlPanel}/reserva/${reserva.id}` },
    bloques: [reserva.factura ? 'Ha pedido factura: hay que hacerla con los datos de arriba.' : null].filter(Boolean),
  })
  return enviar({
    para: ESTUDIO_EMAIL(),
    asunto: `Nueva reserva: ${nombreCompleto(reserva)} · ${fechaMadrid(reserva.inicio)} ${horaMadrid(reserva.inicio)} (${reserva.duracionHoras} h)`,
    html,
    responderA: reserva.email,
  })
}

const TEXTOS_ALERTA = {
  conflicto: 'Ha llegado un pago, pero la hora ya estaba ocupada o el importe no cuadra. Hay que hablar con el cliente: moverle la reserva o devolverle el dinero desde el TPV.',
  duplicado: 'Esta reserva ya estaba pagada y ha llegado otro cobro. Hay que devolver el segundo desde el TPV.',
  tras_cancelar: 'Ha llegado un pago de una reserva que ya estaba cancelada. Hay que devolverlo desde el TPV o reactivar la reserva.',
}

export async function alertaPago(reserva, aviso, { urlPanel }) {
  const html = plantilla({
    titulo: 'Revisa este pago',
    intro: esc(TEXTOS_ALERTA[aviso] || 'Hay algo raro con este pago.'),
    filas: filasEstudio(reserva),
    boton: { texto: 'Abrir en el panel', url: `${urlPanel}/reserva/${reserva.id}` },
  })
  return enviar({ para: ESTUDIO_EMAIL(), asunto: `Revisar pago de la reserva ${reserva.codigo}`, html })
}

export async function avisoSolicitud(reserva, { tipo, mensaje, urlPanel }) {
  const pct = porcentajeReembolso(reserva.inicio)
  const html = plantilla({
    titulo: tipo === 'cancelar' ? 'Piden cancelar una reserva' : 'Piden cambiar una reserva',
    intro: mensaje ? `«${esc(mensaje)}»` : null,
    filas: filasEstudio(reserva),
    boton: { texto: 'Abrir en el panel', url: `${urlPanel}/reserva/${reserva.id}` },
    bloques: [tipo === 'cancelar' ? `Según la política, hoy le corresponde el ${pct} % (${formatoEuros(Math.round((reserva.precioCent * pct) / 100))}).` : 'Los cambios de fecha se piden con al menos 7 días de antelación.'],
  })
  return enviar({
    para: ESTUDIO_EMAIL(),
    asunto: `${tipo === 'cancelar' ? 'Cancelación' : 'Cambio'} pedido: ${reserva.codigo} · ${nombreCompleto(reserva)}`,
    html,
    responderA: reserva.email,
  })
}
