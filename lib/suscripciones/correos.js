// Correos del alta por la web, del contrato y de las cuotas que se pagan con enlace.

import { plantilla, enviar, esc, ESTUDIO_EMAIL } from '../reservas/correos.js'
import { PLANES, formatoEuros, textoDuracion } from '../reservas/config.js'
import { textoFechaCorta, sumarDias } from '../reservas/tiempo.js'

const MARRON = '#4b3828'
const planDe = (sus) => PLANES[sus.plan]?.nombre || sus.plan
const nombreCompleto = (s) => `${s.nombre} ${s.apellidos || ''}`.trim()

// Bloque con los datos de la transferencia de la fianza
export function bloqueFianza(sus, { iban, titular }) {
  if (!['pendiente'].includes(sus.fianzaEstado) || !sus.fianzaCent) return null
  const cuenta = iban
    ? `IBAN <strong>${esc(iban)}</strong>${titular ? ` (titular: ${esc(titular)})` : ''}`
    : 'la cuenta del estudio (si no la tienes, contesta a este correo y te la mandamos)'
  return `<strong>Haz ahora la transferencia de la fianza de ${formatoEuros(sus.fianzaCent)}</strong> a ${cuenta}, con el concepto <strong>«Fianza ${esc(sus.codigo)}»</strong>. Se devuelve al terminar la suscripción si el estudio y el equipo quedan bien.`
}

// Al cliente, nada más pagar: bienvenida y enlace para firmar el contrato
export async function correoAltaPagada(sus, { urlContrato, iban, titular }) {
  const html = plantilla({
    titulo: `Ya eres miembro de AR Studio · Plan ${planDe(sus)}`,
    intro: `Hola ${esc(sus.nombre)}, hemos recibido el pago de tu primer mes. Para terminar, <strong>firma tu contrato</strong>: son dos minutos y lo puedes hacer desde el móvil.`,
    filas: [
      ['Suscripción', esc(sus.codigo)],
      ['Plan', esc(`${planDe(sus)} · ${textoDuracion(sus.horasPeriodo, { corto: true })} al mes`)],
      ['Cuota', `${formatoEuros(sus.cuotaCent)}/mes (IVA incluido)`],
      ['Empieza', esc(textoFechaCorta(sus.fechaInicio))],
    ],
    boton: { url: urlContrato, texto: 'Firmar el contrato' },
    bloques: [
      bloqueFianza(sus, { iban, titular }),
      'La factura de tu primer mes te llega en un correo aparte. Para reservar tus sesiones, escríbenos por WhatsApp.',
    ].filter(Boolean),
  })
  return enviar({ para: sus.email, asunto: `Firma tu contrato · AR Studio Plan ${planDe(sus)}`, html, responderA: ESTUDIO_EMAIL() })
}

// Al estudio: alguien se ha dado de alta por la web
export async function avisoAltaEstudio(sus, { urlFicha }) {
  const html = plantilla({
    titulo: `Nueva suscripción por la web: ${esc(nombreCompleto(sus))}`,
    intro: `Ha pagado el primer mes del plan ${esc(planDe(sus))}. Falta que firme el contrato y que llegue la transferencia de la fianza.`,
    filas: [
      ['Suscripción', esc(sus.codigo)],
      ['Correo', esc(sus.email)],
      ['Teléfono', esc(sus.telefono || '—')],
      ['Cuota', `${formatoEuros(sus.cuotaCent)}/mes`],
    ],
    boton: { url: urlFicha, texto: 'Ver en el panel' },
  })
  return enviar({ para: ESTUDIO_EMAIL(), asunto: `Nueva suscripción: ${nombreCompleto(sus)} · ${planDe(sus)}`, html })
}

// Al cliente, con el contrato firmado en PDF (copia oculta al estudio)
export async function correoContratoFirmado(sus, pdf, { iban, titular, urlContrato }) {
  const html = plantilla({
    titulo: 'Tu contrato está firmado',
    intro: `Hola ${esc(sus.nombre)}, te enviamos tu contrato de suscripción firmado en PDF. Guárdalo: es tu copia.`,
    filas: [
      ['Suscripción', esc(sus.codigo)],
      ['Plan', esc(planDe(sus))],
    ],
    boton: urlContrato ? { url: urlContrato, texto: 'Ver mi contrato' } : null,
    bloques: [bloqueFianza(sus, { iban, titular })].filter(Boolean),
  })
  return enviar({
    para: sus.email,
    asunto: `Contrato firmado · AR Studio ${sus.codigo}`,
    html,
    responderA: ESTUDIO_EMAIL(),
    copiaOculta: ESTUDIO_EMAIL(),
    adjuntos: [{ filename: `Contrato AR Studio ${sus.codigo}.pdf`, content: pdf }],
  })
}

// Enlace para firmar (lo manda el estudio desde el panel o el recordatorio de las 48 h)
export async function correoFirmarContrato(sus, { urlContrato, recordatorio = false, iban, titular }) {
  const html = plantilla({
    titulo: recordatorio ? 'Te falta firmar tu contrato' : 'Firma tu contrato de suscripción',
    intro: recordatorio
      ? `Hola ${esc(sus.nombre)}, aún no has firmado el contrato de tu suscripción a AR Studio. Puedes hacerlo ahora desde el móvil o el ordenador.`
      : `Hola ${esc(sus.nombre)}, aquí tienes el contrato de tu suscripción a AR Studio. Rellena tus datos y fírmalo desde el móvil o el ordenador.`,
    filas: [['Suscripción', esc(sus.codigo)], ['Plan', esc(planDe(sus))]],
    boton: { url: urlContrato, texto: 'Firmar el contrato' },
    bloques: [bloqueFianza(sus, { iban, titular })].filter(Boolean),
  })
  return enviar({ para: sus.email, asunto: `${recordatorio ? 'Recordatorio: firma' : 'Firma'} tu contrato · AR Studio`, html, responderA: ESTUDIO_EMAIL() })
}

export async function avisoContratoSinFirmar(sus, { urlFicha }) {
  const html = plantilla({
    titulo: `${esc(nombreCompleto(sus))} no ha firmado el contrato`,
    intro: 'Han pasado 48 horas desde el alta y el contrato sigue sin firmar. Le hemos mandado un recordatorio por correo; si hace falta, escríbele por WhatsApp.',
    filas: [['Suscripción', esc(sus.codigo)], ['Teléfono', esc(sus.telefono || '—')]],
    boton: { url: urlFicha, texto: 'Ver en el panel' },
  })
  return enviar({ para: ESTUDIO_EMAIL(), asunto: `Contrato sin firmar: ${nombreCompleto(sus)}`, html })
}

// Al empezar cada periodo: enlace para pagar la cuota por el TPV
export async function correoPagarCuota(sus, cuota, { url, iban, titular }) {
  const fin = textoFechaCorta(sumarDias(cuota.hasta, -1))
  const html = plantilla({
    titulo: `Tu cuota de AR Studio · ${formatoEuros(cuota.importeCent)}`,
    intro: `Hola ${esc(sus.nombre)}, empieza un nuevo mes de tu suscripción (del ${esc(textoFechaCorta(cuota.desde))} al ${esc(fin)}). Puedes pagar la cuota con tarjeta o Bizum desde este enlace.`,
    filas: [
      ['Suscripción', esc(sus.codigo)],
      ['Plan', esc(planDe({ plan: cuota.plan || sus.plan }))],
      ['Importe', `${formatoEuros(cuota.importeCent)} (IVA incluido)`],
    ],
    boton: { url, texto: `Pagar ${formatoEuros(cuota.importeCent)}` },
    bloques: [
      iban ? `Si lo prefieres, también por transferencia a ${esc(iban)}${titular ? ` (titular: ${esc(titular)})` : ''} con el concepto «${esc(sus.codigo)}». Al pagar te llega la factura.` : 'Al pagar te llega la factura.',
    ],
  })
  return enviar({ para: sus.email, asunto: `Cuota de tu suscripción · AR Studio ${sus.codigo}`, html, responderA: ESTUDIO_EMAIL() })
}

// Al estudio: un pago que hay que mirar (pagó dos veces, importe distinto…)
export async function avisoPagoSuscripcion(sus, aviso, { urlFicha, pedido }) {
  const textos = {
    duplicado: 'Ha llegado un segundo pago de algo que ya estaba pagado. Revisa si hay que devolverlo desde el portal del TPV.',
    importe_distinto: 'El banco ha confirmado un importe distinto del esperado. Revisa el pago en el portal del TPV.',
    sin_cuota: 'Ha llegado un pago de una cuota que ya no está pendiente (anulada o devuelta). Revisa si hay que devolverlo.',
  }
  const html = plantilla({
    titulo: `Revisar pago de ${esc(sus ? nombreCompleto(sus) : 'una suscripción')}`,
    intro: esc(textos[aviso] || 'Hay un pago que revisar.'),
    filas: [['Suscripción', esc(sus?.codigo || '—')], ['Pedido del TPV', esc(pedido)]],
    boton: urlFicha ? { url: urlFicha, texto: 'Ver en el panel' } : null,
  })
  return enviar({ para: ESTUDIO_EMAIL(), asunto: `Revisar pago${sus ? `: ${sus.codigo}` : ''}`, html })
}

export { MARRON }
