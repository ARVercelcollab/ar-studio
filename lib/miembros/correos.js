// Correos del área de miembros (studioar.es/miembros): el enlace para entrar, las sesiones
// que reserva, cambia o cancela el miembro (a él y aviso al estudio) y sus mensajes.
// El estudio solo quiere avisos por correo.

import { plantilla, enviar, esc, ESTUDIO_EMAIL } from '../reservas/correos.js'
import { ESTUDIO, PLANES, formatoEuros, textoDuracion } from '../reservas/config.js'
import { textoFranja, textoFecha, textoDiaCorto, textoFechaCorta, fechaMadrid, horaMadrid } from '../reservas/tiempo.js'
import { icsCliente } from '../reservas/ics.js'
import { query } from '../db/index.js'
import { registrar } from '../reservas/servicio.js'
import { _cargarSuscripcion as cargarSuscripcion, _datosDelPeriodo as datosDelPeriodo } from '../suscripciones/servicio.js'
import { resumenPeriodo, ultimoDiaDe } from '../suscripciones/reglas.js'

const MARRON = '#4b3828'
const h = (x) => textoDuracion(x, { corto: true })
const planDe = (sus) => PLANES[sus.plan]?.nombre || sus.plan
const nombreCompleto = (s) => `${s.nombre} ${s.apellidos || ''}`.trim()
export const urlArea = (base) => `${base}/miembros`
export const urlFichaMiembro = (base, id) => `${base}/admin/miembros/${id}`

// ---------- Entrar ----------

export async function correoEnlaceAcceso({ email, nombre }, url, { minutos }) {
  const html = plantilla({
    titulo: 'Entra en tu área de AR Studio',
    intro: `Hola ${esc(nombre || '')}, pulsa el botón para entrar en tu área de miembro: verás tus horas, tus sesiones y tus pagos, y podrás reservar.`,
    boton: { url, texto: 'Entrar en mi área' },
    bloques: [
      `El enlace vale ${minutos} minutos y solo sirve una vez. Si caduca, pide otro en <a href="${esc(ESTUDIO.web)}/miembros" style="color:${MARRON}">studioar.es/miembros</a>.`,
      'Si no lo has pedido tú, no hagas nada: nadie puede entrar sin este correo.',
    ],
  })
  return enviar({ para: email, asunto: 'Entra en tu área de AR Studio', html, responderA: ESTUDIO_EMAIL() })
}

// ---------- Sesiones ----------

function filasSesion(r, { restantes = null, ultimoDia = null } = {}) {
  const extra = Math.max(0, r.duracionHoras - (r.horasPlan || 0))
  return [
    ['Sesión', esc(r.codigo)],
    ['Cuándo', esc(textoFranja(r.inicio, r.fin))],
    ['Duración', esc(textoDuracion(r.duracionHoras))],
    ['Del plan', esc(h(r.horasPlan || 0))],
    extra > 0 ? ['Aparte', esc(`${h(extra)} · ${formatoEuros(r.precioCent)} (IVA incluido)${r.pagoEstado === 'pagado' ? ' · pagadas' : ' · sin pagar'}`)] : null,
    restantes !== null ? ['Te quedan', esc(`${h(restantes)} del plan hasta el ${textoFechaCorta(ultimoDia)}`)] : null,
    ['Dónde', `<a href="${ESTUDIO.mapa}" style="color:${MARRON}">${esc(ESTUDIO.direccion)}</a>`],
  ].filter(Boolean)
}

const TEXTOS = {
  reservada: { titulo: 'Sesión reservada', intro: (n) => `Hola ${esc(n)}, ya tienes tu sesión en el estudio. Te esperamos.`, asunto: (r) => `Sesión reservada · ${textoFecha(fechaMadrid(r.inicio))}, ${horaMadrid(r.inicio)}` },
  cambiada: { titulo: 'Sesión cambiada', intro: (n) => `Hola ${esc(n)}, así queda tu sesión:`, asunto: (r) => `Tu sesión ahora es el ${textoFecha(fechaMadrid(r.inicio))}, ${horaMadrid(r.inicio)}` },
  cancelada: { titulo: 'Sesión cancelada', intro: (n, r) => `Hola ${esc(n)}, hemos cancelado tu sesión ${esc(r.codigo)} del ${esc(textoFranja(r.inicio, r.fin))}.`, asunto: (r) => `Sesión ${r.codigo} cancelada` },
}

async function correoAlMiembro(r, tipo, { sus, resumen, base }) {
  const t = TEXTOS[tipo]
  const area = urlArea(base)
  const bloques = []
  if (tipo === 'cancelada') {
    bloques.push(r.cuentaComoUsada
      ? `Como faltaban menos de ${sus.avisoCancelacionH} horas, la sesión cuenta como usada y esas horas no vuelven a tu plan.`
      : r.pagoEstado === 'pendiente' && r.precioCent > 0 && !(r.horasPlan > 0)
        ? 'No se ha cobrado nada.'
        : 'Las horas vuelven a tu plan.')
  } else {
    bloques.push('Puedes entrar a partir de la hora reservada y la salida es a la hora de fin. Deja el estudio como lo encontraste.')
    bloques.push(`Si necesitas cambiarla o cancelarla, hazlo desde tu área con al menos ${sus.avisoCancelacionH} horas de antelación: con menos, cuenta como usada.`)
    if (r.precioCent > 0 && r.pagoEstado === 'pagado') bloques.push('La factura de las horas aparte te llega en un correo aparte.')
  }
  const html = plantilla({
    titulo: t.titulo,
    intro: t.intro(sus.nombre, r),
    filas: tipo === 'cancelada' ? [] : filasSesion(r, resumen ? { restantes: resumen.restantes, ultimoDia: resumen.ultimoDia } : {}),
    boton: { texto: 'Ir a mi área', url: area },
    bloques,
  })
  return enviar({
    para: sus.email,
    asunto: t.asunto(r),
    html,
    responderA: ESTUDIO_EMAIL(),
    adjuntos: tipo === 'cancelada' ? undefined : [{ filename: `sesion-${r.codigo}.ics`, content: Buffer.from(icsCliente(r, area), 'utf8') }],
  })
}

const VERBOS = { reservada: 'ha reservado', cambiada: 'ha cambiado', cancelada: 'ha cancelado' }

async function avisoAlEstudio(r, tipo, { sus, resumen, base, antes = null }) {
  const filas = [
    ['Miembro', esc(`${nombreCompleto(sus)} · Plan ${planDe(sus)}`)],
    ...filasSesion(r, resumen ? { restantes: resumen.restantes, ultimoDia: resumen.ultimoDia } : {}).filter(([k]) => k !== 'Dónde' && k !== 'Te quedan'),
    resumen ? ['Le quedan', esc(`${h(resumen.restantes)} del plan hasta el ${textoFechaCorta(resumen.ultimoDia)}`)] : null,
    antes ? ['Antes era', esc(textoFranja(antes.inicio, antes.fin))] : null,
    tipo === 'cancelada' ? ['Cuenta como usada', r.cuentaComoUsada ? 'Sí (con menos de su aviso)' : 'No'] : null,
    ['Correo', `<a href="mailto:${esc(sus.email)}" style="color:${MARRON}">${esc(sus.email)}</a>`],
    ['WhatsApp', sus.telefono ? `<a href="https://wa.me/${esc(sus.telefono.replace(/[^0-9]/g, ''))}" style="color:${MARRON}">${esc(sus.telefono)}</a>` : '—'],
  ].filter(Boolean)
  const html = plantilla({
    titulo: `${sus.nombre} ${VERBOS[tipo]} una sesión`,
    intro: 'Lo ha hecho desde su área de miembro. Ya está en el panel y en el calendario.',
    filas,
    boton: { texto: 'Abrir su ficha', url: urlFichaMiembro(base, sus.id) },
  })
  return enviar({
    para: ESTUDIO_EMAIL(),
    asunto: `Miembro · ${nombreCompleto(sus)} ${VERBOS[tipo]} ${textoDiaCorto(fechaMadrid(r.inicio))} ${horaMadrid(r.inicio)} (${h(r.duracionHoras)})`,
    html,
    responderA: sus.email,
  })
}

// Los dos correos de una sesión que ha tocado el miembro. Nunca lanza: si falla un correo,
// se apunta en el historial (el cambio ya está hecho).
export async function correosSesionMiembro(reserva, tipo, base, { antes = null, autor = 'cliente' } = {}) {
  let sus
  let resumen = null
  try {
    sus = await cargarSuscripcion(query, reserva.suscripcionId)
    const { periodo, cuota, sesiones } = await datosDelPeriodo(query, sus, fechaMadrid(reserva.inicio))
    if (periodo) {
      const r = resumenPeriodo({ periodo, horas: cuota ? cuota.horas : sus.horasPeriodo, sesiones })
      resumen = { restantes: r.restantes, ultimoDia: ultimoDiaDe(periodo) }
    }
  } catch (e) {
    console.error('[miembros] no se pudo preparar el correo', e.message)
    return { ok: false }
  }
  const fallos = []
  for (const [quien, fn] of [['miembro', correoAlMiembro], ['estudio', avisoAlEstudio]]) {
    try {
      const r = await fn(reserva, tipo, { sus, resumen, base, antes })
      if (r?.noEnviado) fallos.push(`${quien}: ${r.motivo}`)
    } catch (e) {
      console.error(`[miembros] correo al ${quien} fallido`, e.message)
      fallos.push(`${quien}: ${String(e.message || e)}`)
    }
  }
  if (fallos.length) {
    await registrar(query, reserva.id, 'correo_fallido', { error: fallos.join(' · ') }, { suscripcionId: sus.id, autor: 'sistema' }).catch(() => {})
  } else {
    await registrar(query, reserva.id, 'correos_confirmacion', { tipo }, { suscripcionId: sus.id, autor }).catch(() => {})
  }
  return { ok: fallos.length === 0 }
}

// ---------- Mensajes al estudio ----------

const TIPOS_MENSAJE = { baja: 'Quiere darse de baja', consulta: 'Mensaje de un miembro' }

export async function avisoMensajeMiembro(sus, { tipo, texto }, { base }) {
  const html = plantilla({
    titulo: `${TIPOS_MENSAJE[tipo] || TIPOS_MENSAJE.consulta}: ${nombreCompleto(sus)}`,
    intro: texto ? `«${esc(texto)}»` : null,
    filas: [
      ['Miembro', esc(`${nombreCompleto(sus)} · Plan ${planDe(sus)} · ${sus.codigo}`)],
      ['Correo', `<a href="mailto:${esc(sus.email)}" style="color:${MARRON}">${esc(sus.email)}</a>`],
      ['WhatsApp', sus.telefono ? esc(sus.telefono) : '—'],
    ],
    boton: { texto: 'Abrir su ficha', url: urlFichaMiembro(base, sus.id) },
    bloques: [tipo === 'baja' ? 'Lo ha pedido desde su área. La baja no se apunta sola: revisa su permanencia y apúntala en su ficha (Baja).' : 'Contesta a este correo para responderle.'],
  })
  return enviar({
    para: ESTUDIO_EMAIL(),
    asunto: `${tipo === 'baja' ? 'Baja pedida' : 'Mensaje'}: ${nombreCompleto(sus)} · ${planDe(sus)}`,
    html,
    responderA: sus.email,
  })
}
