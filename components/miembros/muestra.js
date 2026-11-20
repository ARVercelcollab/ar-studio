// SOLO PARA LA PÁGINA DE MUESTRA (pages/miembros/muestra-local.jsx): datos inventados con la
// forma de datosArea() y datosReservar(), y una API falsa para recorrer el reservador.
// Nombres y correos de mentira: el repositorio es público.
import { sumarDias, diaSemana, minutosDeHora, horaDeMinutos } from '../../lib/reservas/tiempo'

export const CASOS = {
  normal: 'Normal',
  'sin-horas': 'Sin horas',
  impago: 'Cuota sin pagar',
  contrato: 'Contrato por firmar',
  fianza: 'Fianza pendiente',
  usada: 'Cancelar cuenta como usada',
  'pago-ko': 'Pago sin completar',
  entrada: 'Entrada (sin sesión)',
  entrar: 'Enlace del correo',
  reservar: 'Reservar',
  'reservar-extra': 'Reservar con horas aparte',
  cambiar: 'Cambiar una sesión',
}

// Siguiente día de lunes a viernes a partir de «desde» (incluido) + n días laborables
function laborable(desde, n = 0) {
  let f = desde
  let vistos = -1
  for (;;) {
    if (![0, 6].includes(diaSemana(f))) vistos++
    if (vistos >= n) return f
    f = sumarDias(f, 1)
  }
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// Como aSesion() del servidor
function sesion(codigo, fecha, desde, horas, extra = {}) {
  const hasta = horaDeMinutos(minutosDeHora(desde) + horas * 60)
  return {
    codigo, fecha, fechaTexto: `${DIAS_LARGOS[diaSemana(fecha)]} ${Number(fecha.slice(8))} de ${MESES_LARGOS[Number(fecha.slice(5, 7)) - 1]}`,
    desde, hasta, horas, horasPlan: horas, horasExtra: 0, extraTexto: null, estado: 'confirmada',
    puedeCambiar: true, puedeCancelar: true, motivoNoCambiar: null, cancelarCuentaComoUsada: false,
    textoCancelar: 'Las horas vuelven a tu plan.', ...extra,
  }
}

export function datosMuestra(caso, hoy) {
  const desde = sumarDias(hoy, -9)
  const ultimoDia = sumarDias(hoy, 20)
  const proxima = laborable(sumarDias(hoy, 4))
  const otra = laborable(sumarDias(hoy, 11))
  const manana = laborable(sumarDias(hoy, 1))
  const sinHoras = caso === 'sin-horas'
  const periodo = {
    texto: `${Number(desde.slice(8))} ${MES[Number(desde.slice(5, 7)) - 1]} – ${Number(ultimoDia.slice(8))} ${MES[Number(ultimoDia.slice(5, 7)) - 1]}`,
    desde, hasta: sumarDias(ultimoDia, 1), ultimoDia, horas: 12,
    usadas: sinHoras ? 12 : 8, reservadas: sinHoras ? 8 : 4, restantes: sinHoras ? 0 : 4, diasParaCaducar: 20,
    sesionesUsadas: sinHoras ? 3 : 2,
  }
  const proximas = caso === 'pago-ko'
    ? [sesion('AR-7KQ2MP', proxima, '10:00', 4), sesion('AR-2WX9QL', otra, '09:00', 6, { horasPlan: 4, horasExtra: 2, extraTexto: '2 h aparte · 121 € · sin pagar', estado: 'pendiente', puedeCambiar: false, motivoNoCambiar: 'Falta pagar las horas aparte.', textoCancelar: 'Se suelta la hora y no se cobra nada.' })]
    : caso === 'usada'
    ? [sesion('AR-7KQ2MP', manana, '10:00', 4, { cancelarCuentaComoUsada: true, puedeCambiar: false, motivoNoCambiar: 'Faltan menos de 48 horas: para cambiarla, escríbenos.', textoCancelar: 'Faltan menos de 48 horas para la sesión: si la cancelas ahora, sus 4 horas cuentan como usadas y no vuelven a tu plan.' })]
    : sinHoras
      ? [sesion('AR-7KQ2MP', proxima, '10:00', 4), sesion('AR-9TR4WD', otra, '09:30', 6, { horasPlan: 4, horasExtra: 2, extraTexto: '2 h aparte · 121 € · pagadas', puedeCambiar: false, puedeCancelar: false, motivoNoCambiar: 'Tiene horas aparte: escríbenos para cambiarla.' })]
      : [sesion('AR-7KQ2MP', proxima, '10:00', 4)]
  const pasadas = [
    sesion('AR-3HD8NC', laborable(sumarDias(hoy, -6)), '11:00', 4, { puedeCambiar: false, puedeCancelar: false, motivoNoCambiar: 'Ya ha pasado.' }),
    sesion('AR-5PL2XV', laborable(sumarDias(hoy, -20)), '09:00', 4, { puedeCambiar: false, puedeCancelar: false, motivoNoCambiar: 'Ya ha pasado.' }),
  ]
  const avisos = []
  if (caso === 'impago') avisos.push({ tipo: 'impago', titulo: 'Tienes una cuota sin pagar', texto: 'La cuota del 11 nov (199 €) está sin pagar: hasta pagarla no puedes usar el estudio.', enlace: '/miembros/muestra-local?caso=impago', textoEnlace: 'Pagar la cuota', transferencia: null })
  if (caso === 'contrato') avisos.push({ tipo: 'contrato', titulo: 'Firma tu contrato', texto: 'Para empezar a reservar, firma tu contrato. Son dos minutos y lo puedes hacer desde el móvil.', enlace: '/miembros/muestra-local?caso=contrato', textoEnlace: 'Firmar el contrato', transferencia: null })
  if (caso === 'fianza' || caso === 'contrato') avisos.push({ tipo: 'fianza', titulo: 'Falta la fianza de 100 €', texto: 'Haz la transferencia antes del 25 nov. Se devuelve al terminar tu suscripción si el estudio y el equipo quedan bien.', enlace: null, textoEnlace: null, transferencia: { iban: 'ES00 0000 0000 0000 0000 0000', titular: 'Titular de ejemplo', importeTexto: '100 €', concepto: 'Fianza SUS-MUESTRA' } })
  const suscripcion = {
    codigo: 'SUS-MUESTRA', planNombre: 'Creator', estado: 'activa', fechaInicio: sumarDias(desde, -61), ultimoDia: null,
    estadoTexto: 'Activa',
    condiciones: ['12 h al mes', '3 sesiones de 4 h al mes', 'De lunes a viernes, de 09:00 a 18:00', 'Reserva con 72 h de antelación', 'Cambia o cancela con 48 h de antelación', 'Las horas que no uses en el mes se pierden'],
    franjaDesde: '09:00', franjaHasta: '18:00', duraciones: [4], antelacionH: 72, avisoCancelacionH: 48, maxSesiones: 3,
    puedeReservar: !sinHoras && caso !== 'impago',
    motivoNoReservar: sinHoras ? 'Ya has reservado todas las horas de este mes. Desde el día de tu próxima cuota tendrás horas nuevas.' : caso === 'impago' ? 'Tienes sin pagar la cuota del 11 nov (199 €): cuando la pagues podrás reservar.' : null,
  }
  const cuota = (n, d, estado, extra = {}) => ({
    id: n, periodoTexto: `${Number(d.slice(8))} ${MES[Number(d.slice(5, 7)) - 1]} – ${Number(sumarDias(d, 29).slice(8))} ${MES[Number(sumarDias(d, 29).slice(5, 7)) - 1]}`,
    importeTexto: '199 €', estado, estadoTexto: estado === 'pagada' ? `Pagada el ${Number(d.slice(8))} ${MES[Number(d.slice(5, 7)) - 1]}` : 'Sin pagar',
    factura: estado === 'pagada' ? { id: 900 + n, numero: `AR-W-2026-00${30 + n}`, url: '#factura' } : null, enlacePago: null, ...extra,
  })
  const cuotas = [
    cuota(3, desde, caso === 'impago' ? 'pendiente' : 'pagada', caso === 'impago' ? { enlacePago: '/miembros/muestra-local?caso=impago' } : {}),
    cuota(2, sumarDias(desde, -30), 'pagada'),
    cuota(1, sumarDias(desde, -61), 'pagada'),
  ]
  return {
    nombre: 'Lucía',
    email: 'lucia@ejemplo.com',
    suscripcion,
    periodo,
    proximas,
    pasadas,
    avisos,
    cuotas,
    facturasSesiones: sinHoras ? [{ id: 950, numero: 'AR-S-2026-0007', fechaTexto: `${Number(sumarDias(hoy, -2).slice(8))} ${MES[Number(sumarDias(hoy, -2).slice(5, 7)) - 1]}`, importeTexto: '121 €', url: '#factura' }] : [],
    contrato: caso === 'contrato' ? { estado: 'pendiente', url: null, enlaceFirmar: '/miembros/muestra-local?caso=contrato' } : { estado: 'firmado', url: '#contrato', enlaceFirmar: null },
    tarjeta: { ultimos: '4242', caduca: '12/28', cobroAutomatico: true },
  }
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export function reservarMuestra(caso, hoy) {
  const area = datosMuestra('normal', hoy)
  const extra = caso === 'reservar-extra'
  return {
    nombre: 'Lucía',
    planNombre: 'Creator',
    franjaDesde: '09:00',
    franjaHasta: '18:00',
    duraciones: extra ? [{ horas: 2, texto: '2 h (lo que te queda)' }, { horas: 4, texto: '4 h' }] : [{ horas: 4, texto: '4 h' }],
    duracionPorDefecto: 4,
    desde: sumarDias(hoy, 3),
    hasta: sumarDias(hoy, 50),
    periodos: [
      { numero: 3, texto: area.periodo.texto, ultimoDia: area.periodo.ultimoDia, horas: 12, restantes: extra ? 2 : 4 },
      { numero: 4, texto: 'mes siguiente', ultimoDia: sumarDias(area.periodo.ultimoDia, 30), horas: 12, restantes: 12 },
    ],
    pagoExtraDisponible: !caso.startsWith('cambiar'),
    cambiando: caso === 'cambiar' ? area.proximas[0] : null,
    puedeReservar: true,
    motivoNoReservar: null,
  }
}

// API falsa del reservador (en el navegador)
export function apiMuestra(caso) {
  const espera = (x) => new Promise((r) => setTimeout(() => r(x), 250))
  return {
    dias: ({ desde, hasta }) => {
      const dias = []
      for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
        if ([0, 6].includes(diaSemana(f))) continue
        dias.push({ fecha: f, huecos: Number(f.slice(8)) % 7 === 3 ? 0 : 4 })
      }
      return espera({ dias })
    },
    huecos: ({ horas }) => {
      const lista = []
      for (let m = minutosDeHora('09:00'); m + horas * 60 <= minutosDeHora('18:00'); m += 30) lista.push(horaDeMinutos(m))
      return espera({ huecos: lista.filter((x) => x !== '12:30') })
    },
    comprobar: ({ horas }) => {
      if (caso === 'reservar-extra' && horas > 2) {
        return espera({ ok: true, errores: [], notas: [], horasPlan: 2, horasExtra: horas - 2, precioExtraCent: 12100, precioExtraTexto: '121 € (IVA incluido)', restantesDespues: 0 })
      }
      return espera({ errores: [], notas: [], horasPlan: horas, horasExtra: 0, precioExtraCent: 0, restantesDespues: Math.max(0, (caso === 'reservar-extra' ? 2 : 4) - horas) })
    },
    reservar: () => espera({ estado: 'confirmada', codigo: 'AR-MUESTRA' }),
    cambiar: ({ codigo }) => espera({ estado: 'confirmada', codigo }),
  }
}
