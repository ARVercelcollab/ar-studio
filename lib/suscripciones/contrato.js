// Texto del contrato de suscripción (planes mensuales), el mismo para la web y el PDF.
//
// Es una plantilla genérica: las condiciones salen de cada suscripción (o del plan, en el
// modelo que se enseña antes de pagar) y los datos de la persona, de lo que rellena al
// firmar. Los datos de quien firma por el estudio NO van en el código (el repositorio es
// público): el nombre sale de FACTURA_EMISOR_NOMBRE y, solo si CONTRATO_INCLUIR_NIF=1, el
// NIF de FACTURA_EMISOR_NIF. El número de cuenta, de ESTUDIO_IBAN.
//
// Si cambias el texto, sube CONTRATO_VERSION: cada contrato firmado guarda la suya.

import { PLANES, PLAN_COMUN, PLAN_HORA_EXTRA_CENT, ESTUDIO, formatoEuros, textoDuracion } from '../reservas/config.js'
import { textoFecha } from '../reservas/tiempo.js'
import { condicionesDePlan } from './reglas.js'

export const CONTRATO_VERSION = '2026-11-19'

const h = (x) => textoDuracion(x, { corto: false })
const sinIva = (cent) => formatoEuros(Math.round(cent / 1.21))

// Quien firma por el estudio (de las variables de entorno)
export function firmanteEstudio() {
  const nombre = (process.env.FACTURA_EMISOR_NOMBRE || '').trim() || null
  const nif = process.env.CONTRATO_INCLUIR_NIF === '1' ? (process.env.FACTURA_EMISOR_NIF || '').trim() || null : null
  return { nombre, nif }
}

export function ibanEstudio() {
  return (process.env.ESTUDIO_IBAN || '').trim() || null
}

// Condiciones del modelo (antes de pagar): las del plan tal cual
export function condicionesModelo(plan) {
  return { plan, ...condicionesDePlan(plan), fianzaCent: PLAN_COMUN.fianzaCent }
}

function textoSesiones(c) {
  const n = (x) => h(x).replace(/ horas?$/, '')
  const dur = c.duracionesH && c.duracionesH.length
    ? `${c.duracionesH.map(n).join(' u ')} horas`
    : c.sesionMinH === c.sesionMaxH ? h(c.sesionMinH) : `entre ${n(c.sesionMinH)} y ${h(c.sesionMaxH)}`
  if (c.maxSesiones === 1) return `en 1 sesión de ${dur}`
  if (c.maxSesiones) return `en sesiones de ${dur} (como máximo ${c.maxSesiones} sesiones al mes)`
  return `en sesiones de ${dur}`
}

// c: condiciones ({ plan, cuotaCent, horasPeriodo, duracionesH, sesionMinH, sesionMaxH, maxSesiones,
//    franjaDesde, franjaHasta, antelacionH, avisoCancelacionH, permanenciaMeses, renovacionMeses,
//    preavisoDias, fianzaCent })
// persona: { nombre, apellidos, documento, direccion, telefono, email } o null (modelo)
// codigo: el de la suscripción (concepto de la fianza); fecha: 'YYYY-MM-DD' del contrato
export function contratoSecciones({ c, persona = null, codigo = null, fecha = null, estudio = firmanteEstudio(), iban = ibanEstudio() }) {
  const planNombre = PLANES[c.plan]?.nombre || c.plan
  const vacio = '____________________'
  const p = persona || {}
  const nombrePersona = `${p.nombre || ''} ${p.apellidos || ''}`.trim()
  const quienEstudio = estudio.nombre ? `${estudio.nombre}, ${estudio.nif ? `con NIF ${estudio.nif}, ` : ''}` : 'La titular de AR Studio, '
  const preaviso = c.preavisoDias > 0
    ? `con al menos ${c.preavisoDias} días de antelación`
    : 'antes de que empiece su siguiente mes de suscripción'
  const renovacion = c.renovacionMeses > 1
    ? `por periodos de ${c.renovacionMeses} meses`
    : 'mes a mes'
  const cuentaFianza = iban
    ? `a la cuenta de EL ESTUDIO ${iban}${estudio.nombre ? ` (titular: ${estudio.nombre})` : ''}`
    : 'a la cuenta que indique EL ESTUDIO'

  return {
    titulo: 'Contrato de suscripción',
    subtitulo: `AR Studio · Plan ${planNombre} · ${formatoEuros(c.cuotaCent)}/mes (IVA incluido)`,
    lugarFecha: fecha ? `En València, a ${textoFecha(fecha).replace(/^[a-záéíóúñ]+, /i, '')}.` : 'En València, en la fecha de la firma electrónica.',
    partes: [
      {
        titulo: 'De una parte, «EL ESTUDIO»',
        texto: `${quienEstudio}que opera bajo el nombre comercial «AR Studio», con el estudio en ${ESTUDIO.direccion} (en adelante, EL ESTUDIO).`,
      },
      {
        titulo: 'De otra parte, «LA PERSONA SUSCRIPTORA»',
        lineas: [
          ['Nombre y apellidos', nombrePersona || vacio],
          ['DNI/NIE', p.documento || vacio],
          ['Domicilio', p.direccion || vacio],
          ['Teléfono', p.telefono || vacio],
          ['Correo electrónico', p.email || vacio],
        ],
      },
    ],
    intro: 'Ambas partes se reconocen capacidad legal para contratar y acuerdan las siguientes cláusulas:',
    clausulas: [
      {
        titulo: '1. Objeto de la suscripción',
        parrafos: [
          `EL ESTUDIO concede a LA PERSONA SUSCRIPTORA una suscripción Plan ${planNombre} de acceso al estudio, con el material profesional incluido (iluminación, kit de pódcast, vídeo y mobiliario). Incluye ${h(c.horasPeriodo)} al mes, ${textoSesiones(c)}, con acceso de lunes a viernes de ${c.franjaDesde} a ${c.franjaHasta}. Los sábados, domingos y festivos no están incluidos.`,
          'La suscripción es personal e intransferible. LA PERSONA SUSCRIPTORA puede traer a su equipo, clientes o modelos a sus sesiones, pero no ceder ni prestar su acceso a terceros. Solo una persona suscrita usa el estudio a la vez. LA PERSONA SUSCRIPTORA monta y desmonta el set y el equipo que vaya a usar; la asistencia técnica para configurar el equipo no está incluida.',
        ],
      },
      {
        titulo: '2. Reservas, horas y sesiones',
        parrafos: [
          `Toda sesión debe reservarse con un mínimo de ${c.antelacionH} horas de antelación, por el canal que indique EL ESTUDIO. Sin reserva confirmada no hay acceso. Solo se puede entrar al estudio a partir de la hora reservada y la salida debe hacerse dentro del horario reservado.`,
          'Las horas son de cada mes: las que no se usen dentro del mes se pierden y no se acumulan para los meses siguientes. Cada mes se cuenta desde la fecha de cobro de la primera cuota.',
          `Cancelar o cambiar una sesión con menos de ${c.avisoCancelacionH} horas de antelación supone que esa sesión cuenta como usada. Debe respetarse un margen de 30 minutos entre sesiones para la limpieza y preparación del espacio.`,
          `Horas aparte: las horas que no entran en la suscripción (agotadas las del mes, fuera del horario del plan o en fines de semana y festivos) se cobran aparte y están sujetas a disponibilidad. Si se piden el mismo día de la sesión, a ${sinIva(PLAN_HORA_EXTRA_CENT.laborable)}/h + IVA entre semana y ${sinIva(PLAN_HORA_EXTRA_CENT.finde)}/h + IVA en fines de semana y festivos. Si se reservan con antelación, a la tarifa por horas publicada en la web de EL ESTUDIO.`,
        ],
      },
      {
        titulo: '3. Cuidado y uso del estudio',
        parrafos: [
          'LA PERSONA SUSCRIPTORA debe devolver el estudio en las mismas condiciones en que se le entrega. Queda prohibido subirse a mesas o sofás (con calzado, con tacones o descalzo), arrastrar el mobiliario o las plantas (deben moverse con cuidado, nunca arrastrarse) y fumar dentro del estudio. Cualquier daño al equipo, al mobiliario, a la mesa principal o a las plantas correrá a cargo de LA PERSONA SUSCRIPTORA (reparación o reposición). El estudio no está insonorizado, por lo que puede oírse ruido de fuera; EL ESTUDIO no se hace responsable de posibles interferencias sonoras.',
          'Penalizaciones y extras, según las condiciones generales de la web:',
        ],
        lista: [
          'Subirse a mesas o sofás: 30 € + IVA.',
          'Arrastrar mobiliario o plantas: 20 € + IVA.',
          'Limpieza profunda por entregar el estudio en mal estado: 40 € + IVA.',
          'Superar la hora de salida en más de 5 minutos (media hora adicional): 25 € + IVA entre semana y 30 € + IVA en fin de semana.',
          'Uso de fondos de color: 20 € + IVA por metro pisado (montaje y desmontaje a cargo de LA PERSONA SUSCRIPTORA).',
        ],
      },
      {
        titulo: '4. Cuota, inicio y renovación',
        parrafos: [
          `La cuota es de ${formatoEuros(c.cuotaCent)} al mes (IVA incluido). La primera se paga al darse de alta en la web y la suscripción empieza ese mismo día. Las siguientes se pagan al empezar cada mes de suscripción, con el enlace de pago que EL ESTUDIO envía por correo electrónico, o por transferencia o Bizum a la cuenta de EL ESTUDIO. Cada cuota pagada lleva su factura.`,
          `Hay una permanencia mínima de ${c.permanenciaMeses} ${c.permanenciaMeses === 1 ? 'mes' : 'meses'} contados desde el primer cobro. Después, la suscripción se renueva automáticamente ${renovacion}.`,
          'Cambio de plan: LA PERSONA SUSCRIPTORA puede subir a un plan superior en cualquier momento, sin penalización. Se abonará la diferencia proporcional del mes en curso y, desde la siguiente cuota, la del nuevo plan. El cambio no interrumpe la permanencia mínima.',
        ],
      },
      {
        titulo: '5. Depósito de garantía (fianza)',
        parrafos: [
          `LA PERSONA SUSCRIPTORA abonará un depósito de ${formatoEuros(c.fianzaCent)} (sin IVA) al firmar este contrato, mediante transferencia ${cuentaFianza}, con el concepto «Fianza${codigo ? ` ${codigo}` : ''}».`,
          'El depósito se devuelve al terminar la suscripción si el espacio y el equipo quedan en buen estado, y puede usarse para cubrir daños o penalizaciones pendientes.',
        ],
      },
      {
        titulo: '6. Baja de la suscripción',
        parrafos: [
          `Para darse de baja, LA PERSONA SUSCRIPTORA debe comunicarlo por escrito a ${ESTUDIO.email} ${preaviso}. La baja antes de cumplir los ${c.permanenciaMeses} meses de permanencia supone la pérdida del depósito de garantía.`,
        ],
      },
      {
        titulo: '7. Firma electrónica, protección de datos y jurisdicción',
        parrafos: [
          'Este contrato se firma por medios electrónicos en la web de EL ESTUDIO. Se guardan la fecha y la hora de la firma, la versión del contrato y una huella cifrada de la conexión desde la que se firma, y se envía una copia en PDF a ambas partes.',
          'Los datos de LA PERSONA SUSCRIPTORA se tratan conforme al RGPD (UE 2016/679) y la LOPDGDD para gestionar esta relación contractual; puede ejercer sus derechos de acceso, rectificación, supresión, limitación y oposición escribiendo al correo de EL ESTUDIO. Este contrato se rige por la legislación española, sometiéndose ambas partes a los Juzgados y Tribunales de València.',
        ],
      },
    ],
    cierre: 'Y en conformidad con cuanto antecede, ambas partes firman el presente contrato en el lugar y la fecha indicados.',
    firmas: {
      estudio: { titulo: 'Por EL ESTUDIO', nombre: estudio.nombre ? `${estudio.nombre} · AR Studio` : 'AR Studio' },
      persona: { titulo: 'Por LA PERSONA SUSCRIPTORA', nombre: nombrePersona || null, documento: p.documento || null },
    },
  }
}

// Condiciones de una suscripción ya creada (las que se copiaron al dar de alta)
export function condicionesDeSuscripcion(sus) {
  return {
    plan: sus.plan,
    cuotaCent: sus.cuotaCent,
    horasPeriodo: sus.horasPeriodo,
    duracionesH: sus.duracionesH,
    sesionMinH: sus.sesionMinH,
    sesionMaxH: sus.sesionMaxH,
    maxSesiones: sus.maxSesiones,
    franjaDesde: sus.franjaDesde,
    franjaHasta: sus.franjaHasta,
    antelacionH: sus.antelacionH,
    avisoCancelacionH: sus.avisoCancelacionH,
    permanenciaMeses: sus.permanenciaMeses,
    renovacionMeses: sus.renovacionMeses,
    preavisoDias: sus.preavisoDias,
    fianzaCent: sus.fianzaCent,
  }
}
