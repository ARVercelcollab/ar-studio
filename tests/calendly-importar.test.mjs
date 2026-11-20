// Importar el CSV de Calendly (lib/reservas/calendly-importar.js): lector de CSV, fechas, columnas
// en inglés y en español, reservas futuras que ocupan su hueco, historial, choques, reimportar sin
// duplicar y que el dinero del estudio no cambia. Con PGlite en memoria y datos inventados.
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'
process.env.FACTURA_EMISOR_NOMBRE = 'Emisora de Prueba'
process.env.FACTURA_EMISOR_NIF = 'X0000000T'
process.env.FACTURA_EMISOR_DIRECCION = 'Calle Falsa 1|46007 València|España'
process.env.FACTURA_SERIE = 'AR-K'
process.env.FACTURA_SERIE_SIMPLIFICADA = 'AR-KS'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as K from '../lib/reservas/calendly-importar.js'
import * as CL from '../lib/reservas/clientes.js'
import * as C from '../lib/finanzas/calculos.js'
import * as M from '../lib/finanzas/movimientos.js'
import * as I from '../lib/admin/inicio.js'
import { fechaMadrid, horaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'
import { tarifaWebCent } from '../lib/reservas/config.js'

after(() => cerrarDb())

const HOY = fechaMadrid(new Date())
const usados = new Set()
async function laborable(dias) {
  const { rows } = await query('SELECT fecha::text AS fecha FROM festivos')
  const fest = new Set(rows.map((r) => r.fecha))
  let f = sumarDias(HOY, dias)
  const paso = dias < 0 ? -1 : 1
  while ([0, 6].includes(diaSemana(f)) || fest.has(f) || usados.has(f)) f = sumarDias(f, paso)
  usados.add(f)
  return f
}
const csvDe = (filas) => filas.map((f) => f.map((c) => (/[",\n;]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\r\n')
const cuantas = async () => (await query('SELECT count(*)::int AS n FROM reservas')).rows[0].n

// ---------- Piezas sueltas ----------

test('lector de CSV: BOM, punto y coma, comillas, comillas dobles y saltos de línea dentro', () => {
  const { separador, filas } = K.leerCsv('﻿a;b;"c;d"\r\n1;"x\ny";"dijo ""hola"""\r\n\r\n')
  assert.equal(separador, ';')
  assert.deepEqual(filas, [['a', 'b', 'c;d'], ['1', 'x\ny', 'dijo "hola"']])
  assert.deepEqual(K.leerCsv('x,y\n1,2').filas, [['x', 'y'], ['1', '2']])
})

test('fechas de Calendly: 24 h, am/pm, «p. m.», barras día/mes y mes/día, ISO con zona; lo raro es null', () => {
  assert.deepEqual(K.leerFechaHora('2026-11-26 3:00 pm'), { fecha: '2026-11-26', hora: '15:00' })
  assert.deepEqual(K.leerFechaHora('2026-11-26 12:30 am'), { fecha: '2026-11-26', hora: '00:30' })
  assert.deepEqual(K.leerFechaHora('2026-11-26 12:00 p. m.'), { fecha: '2026-11-26', hora: '12:00' })
  assert.deepEqual(K.leerFechaHora('2026-11-26 15:00'), { fecha: '2026-11-26', hora: '15:00' })
  assert.deepEqual(K.leerFechaHora('26/11/2026 15:00', 'dm'), { fecha: '2026-11-26', hora: '15:00' })
  assert.deepEqual(K.leerFechaHora('11/26/2026 3:00 PM', 'md'), { fecha: '2026-11-26', hora: '15:00' })
  assert.equal(K.leerFechaHora('2026-11-26T15:00:00+01:00').instante.toISOString(), '2026-11-26T14:00:00.000Z')
  assert.equal(K.leerFechaHora('mañana a las 5'), null)
  assert.equal(K.leerFechaHora('2026-02-30 10:00'), null)
  assert.equal(K.leerFechaHora('2026-11-26 13:00 pm'), null)
  assert.equal(K.leerFechaHora('05/06/2026 10:00', 'mezcla'), null)
  // El orden de las barras: por las propias fechas o, si no se sabe, por el idioma (y se avisa)
  assert.deepEqual(K.ordenDeFechas(['25/11/2026 10:00', '03/12/2026 10:00'], 'en'), { orden: 'dm', deducido: false })
  assert.deepEqual(K.ordenDeFechas(['11/25/2026 10:00 am'], 'es'), { orden: 'md', deducido: false })
  assert.deepEqual(K.ordenDeFechas(['05/06/2026 10:00'], 'es'), { orden: 'dm', deducido: true })
  assert.equal(K.ordenDeFechas(['25/11/2026 10:00', '11/25/2026 10:00'], 'es').orden, 'mezcla')
})

test('respuestas: actividad, fondos, equipo y teléfono a sus campos; el resto a comentarios', () => {
  const r = K.repartirRespuestas([
    { pregunta: '¿Qué vas a hacer en el estudio?', respuesta: 'Grabar un podcast' },
    { pregunta: '¿Vas a usar los fondos?', respuesta: 'Sí, el blanco y el negro' },
    { pregunta: '¿Necesitas equipo?', respuesta: 'Teleprompter y proyector' },
    { pregunta: 'WhatsApp', respuesta: '600 000 009' },
    { pregunta: 'Algo más', respuesta: 'Llegamos 3' },
  ])
  assert.equal(r.actividad, 'Podcast')
  assert.equal(r.fondos, 'blanco-negro')
  assert.deepEqual(r.equipo.sort(), ['proyector', 'teleprompter'])
  assert.equal(r.telefono, '600 000 009')
  assert.deepEqual(r.comentarios, ['Algo más: Llegamos 3'])
  // Si la actividad no está clara (dos a la vez), no se adivina
  assert.equal(K.repartirRespuestas([{ pregunta: 'Actividad', respuesta: 'Fotos y vídeo' }]).actividad, null)
})

test('una zona horaria cualquiera a instante (también en verano)', () => {
  assert.equal(K.instanteEnZona('2026-07-01', '10:00', 'America/New_York').toISOString(), '2026-07-01T14:00:00.000Z')
  assert.equal(K.instanteEnZona('2027-01-15', '10:00', 'Europe/Madrid').toISOString(), '2027-01-15T09:00:00.000Z')
})

// ---------- De punta a punta, en inglés ----------

const CAB = ['Invitee Name', 'Invitee Email', 'Text Reminder Number', 'Event Type Name', 'Start Date & Time', 'End Date & Time',
  'Invitee Time Zone', 'Scheduled At', 'Canceled', 'Cancellation reason', 'Question 1', 'Response 1', 'Question 2', 'Response 2',
  'Question 3', 'Response 3', 'Event UUID', 'Invitee UUID', 'Payment Amount', 'Payment Currency']

test('importar el CSV de Calendly: resumen sin tocar nada, futuras que ocupan su hueco, choques, reimportar y dinero igual', async () => {
  const P1 = await laborable(-40)
  const P2 = await laborable(-30)
  const P3 = await laborable(-20)
  const F1 = await laborable(12)
  const F2 = await laborable(14)
  const F3 = await laborable(16)
  const F4 = await laborable(18)

  // Lo que ya hay en el panel: una reserva de otra persona (choque), una de Calendly apuntada a mano
  // (misma hora y persona: se salta) y una pagada de Ana (su ficha no cambia de dinero)
  const base = { apellidos: 'Prueba', telefono: '600000000', actividad: 'Fotos', fondos: 'no', equipo: [], pagoEstado: 'pagado', metodoPago: 'bizum' }
  await S.crearReservaManual({ ...base, nombre: 'Otra', email: 'otra@example.com', fecha: F2, desde: '10:00', hasta: '12:00' })
  await S.crearReservaManual({ ...base, nombre: 'Pepa', email: 'pepa@example.com', fecha: F3, desde: '10:00', hasta: '12:00', origen: 'calendly', metodoPago: 'stripe' })
  await S.crearReservaManual({ ...base, nombre: 'Ana', email: 'ana@example.com', fecha: P3, desde: '10:00', hasta: '12:00', pagadoEn: P3 })

  const csv = csvDe([
    CAB,
    ['Lucía Inventada', 'lucia@example.com', '+34 600 000 001', 'Alquiler 2 horas', `${P1} 10:00 am`, `${P1} 12:00 pm`, 'Europe/Madrid', `${sumarDias(P1, -3)} 9:15 am`, 'false', '',
      '¿Qué vas a hacer en el estudio?', 'Sesión de fotos', '¿Vas a usar los fondos?', 'Sí, el blanco', 'Comentarios', 'Llego 10 min antes,\n"gracias"', 'EV-1', 'INV-1', '96.80', 'EUR'],
    ['Marcos Ficticio', 'marcos@example.com', '', 'Alquiler 2 horas', `${P2} 4:00 pm`, `${P2} 6:00 pm`, 'Europe/Madrid', `${sumarDias(P2, -5)} 8:00 pm`, 'true', 'No puedo ir',
      '', '', '', '', '', '', 'EV-2', 'INV-2', '', ''],
    ['Ana Ejemplo', 'ANA@example.com', '600 000 003', 'Alquiler 2 horas', `${F1} 4:00 pm`, `${F1} 6:00 pm`, 'Europe/Madrid', `${HOY} 9:00 am`, 'false', '',
      '¿Necesitas equipo?', 'Kit podcast', '', '', '', '', 'EV-3', 'INV-3', '96,80', 'EUR'],
    ['Ana Ejemplo', 'ana@example.com', '600 000 003', 'Alquiler 2 horas', `${F1} 4:00 pm`, `${F1} 6:00 pm`, 'Europe/Madrid', `${HOY} 9:00 am`, 'false', '',
      '', '', '', '', '', '', 'EV-3', 'INV-3', '96.80', 'EUR'],
    ['Fecha Rara', 'rara@example.com', '', 'Alquiler 2 horas', 'mañana a las 5', `${F1} 6:00 pm`, 'Europe/Madrid', '', 'false', '', '', '', '', '', '', '', 'EV-5', 'INV-5', '', ''],
    ['Choque Inventado', 'choque@example.com', '', 'Alquiler 2 horas', `${F2} 11:00 am`, `${F2} 1:00 pm`, 'Europe/Madrid', '', 'false', '', '', '', '', '', '', '', 'EV-6', 'INV-6', '', ''],
    ['Pepa Prueba', 'pepa@example.com', '', 'Alquiler 2 horas', `${F3} 10:00 am`, `${F3} 12:00 pm`, 'Europe/Madrid', '', 'false', '', '', '', '', '', '', '', 'EV-7', 'INV-7', '', ''],
    ['Rita Larga', 'rita@example.com', '', 'Alquiler 5 horas', `${F4} 10:00 am`, `${F4} 3:00 pm`, 'Europe/Madrid', '', 'false', '', '', '', '', '', '', '', 'EV-8', 'INV-8', '', ''],
  ])

  // Dinero antes
  const anio = Number(HOY.slice(0, 4))
  const dinero = async () => {
    const meses = [...new Set([P1, P2, P3, HOY].map((f) => C.mesDe(f)))]
    const movs = []
    for (const m of meses) movs.push(await M.listarMovimientos(C.leerPeriodo(m, HOY)))
    const ini = await I.datosInicio({ periodo: C.periodoActual('mes', HOY), comparar: 'anterior' })
    const ana = await CL.fichaCliente('e:ana@example.com')
    return JSON.stringify({
      movs, mesAMes: await M.mesAMes(anio),
      inicio: { k: [ini.kpis.ingresos, ini.kpis.gastos, ini.kpis.beneficio], fuentes: ini.fuentes, cascada: ini.cascada, grafico: ini.graficoAnio, porCobrar: ini.porCobrar.totalCent, iva: ini.ivaHoy },
      ana: ana.pagadoCent,
    })
  }
  const antes = await dinero()
  const fichaAntes = await CL.fichaCliente('e:ana@example.com')
  const n0 = await cuantas()

  // 1. Revisar: no toca nada
  const a = K.paraPantalla(await K.analizarCsv(csv))
  assert.equal(await cuantas(), n0)
  assert.ok(a.columnas.reconocidas.includes('Inicio') && a.columnas.reconocidas.includes('UUID del invitado'))
  assert.deepEqual(a.resumen, { filas: 8, nuevas: 4, pasadas: 1, futuras: 2, canceladas: 1, yaImportadas: 0, yaEnPanel: 1, conError: 2, estimadas: 2 })
  const errores = a.problemas.filter((p) => p.tipo === 'error')
  assert.ok(errores.some((p) => p.fila === 6 && /fecha de inicio/.test(p.texto)))
  assert.ok(errores.some((p) => p.fila === 7 && /Choca con la reserva/.test(p.texto)))
  assert.ok(a.problemas.some((p) => p.fila === 5 && /Repetida/.test(p.texto)))
  assert.ok(a.problemas.some((p) => p.fila === 9 && /no vende/.test(p.texto)))
  assert.equal(a.proximas.length, 2)

  // 2. Importar
  const r = await K.importarCsv(csv)
  assert.equal(r.importadas, 4)
  assert.equal(r.futuras, 2)
  assert.equal(await cuantas(), n0 + 4)
  const { rows } = await query(`SELECT * FROM reservas WHERE externo_ref LIKE 'calendly:%' ORDER BY inicio`)
  assert.equal(rows.length, 4)
  const porRef = Object.fromEntries(rows.map((x) => [x.externo_ref, x]))
  const lucia = porRef['calendly:INV-1']
  assert.equal(lucia.origen, 'calendly')
  assert.equal(lucia.estado, 'confirmada')
  assert.equal(lucia.pago_estado, 'pagado')
  assert.equal(lucia.precio_cent, 9680)
  assert.equal(lucia.actividad, 'Fotos')
  assert.equal(lucia.fondos, 'blanco')
  assert.match(lucia.comentarios, /Llego 10 min antes,\n"gracias"/)
  assert.equal(lucia.telefono, '+34 600 000 001')
  assert.equal(horaMadrid(lucia.inicio), '10:00')
  assert.equal(fechaMadrid(lucia.inicio), P1)
  assert.equal(new Date(lucia.bloqueo_hasta).getTime(), new Date(lucia.fin).getTime(), 'las pasadas no llevan margen')
  assert.equal(lucia.gcal_estado, 'ok')
  assert.ok(lucia.recordatorio_enviado_en, 'sin recordatorio nuestro: lo manda Calendly')
  const marcos = porRef['calendly:INV-2']
  assert.equal(marcos.estado, 'cancelada')
  assert.equal(marcos.motivo_cancelacion, 'No puedo ir')
  const ana = porRef['calendly:INV-3']
  assert.equal(ana.email, 'ana@example.com')
  assert.deepEqual(ana.equipo, ['podcast'])
  assert.equal(new Date(ana.bloqueo_hasta).getTime() - new Date(ana.fin).getTime(), 30 * 60000, 'las futuras llevan su margen')
  const rita = porRef['calendly:INV-8']
  assert.equal(Number(rita.duracion_horas), 5)
  assert.equal(rita.precio_cent, tarifaWebCent(5, 'laborable'))
  assert.match(rita.notas_internas, /Precio estimado/)
  // No hay facturas de estas (las hizo Stripe)
  assert.equal((await query(`SELECT count(*)::int AS n FROM facturas f JOIN reservas r ON r.id = f.reserva_id WHERE r.externo_ref IS NOT NULL`)).rows[0].n, 0)

  // 3. La futura ocupa su hora (con los 30 minutos) y ya no se ofrece en la web
  const h = await S.consultarHoras({ fecha: F1, horas: 2 })
  for (const x of ['14:00', '15:00', '16:00', '17:00', '18:00']) assert.ok(!h.horas.includes(x), `${x} no debería estar libre`)
  assert.ok(h.horas.includes('18:30'))
  await assert.rejects(S.crearReservaManual({ ...base, nombre: 'Encima', email: 'encima@example.com', fecha: F1, desde: '17:00', hasta: '19:00' }), /choca/)

  // 4. Reimportar: nada nuevo
  const otra = await K.importarCsv(csv)
  assert.equal(otra.importadas, 0)
  assert.equal(otra.resumen.yaImportadas, 4)
  assert.equal(otra.resumen.yaEnPanel, 1)
  assert.equal(await cuantas(), n0 + 4)

  // 5. El dinero del estudio y lo pagado en las fichas no cambian; el uso sí
  assert.equal(await dinero(), antes)
  const fichaDespues = await CL.fichaCliente('e:ana@example.com')
  assert.equal(fichaDespues.total, fichaAntes.total + 1)
  assert.equal(fichaDespues.pagadoCent, fichaAntes.pagadoCent)
  assert.equal(fichaDespues.deCalendly, 1)
  const fila = fichaDespues.proximas.find((x) => x.importada)
  assert.ok(fila && fila.pagadoCent === 0)
  const luciaFicha = await CL.fichaCliente('e:lucia@example.com')
  assert.equal(luciaFicha.total, 1)
  assert.equal(luciaFicha.pagadoCent, 0)
  const lista = (await CL.listarClientes()).clientes
  assert.equal(lista.find((c) => c.clave === 'e:lucia@example.com').pagadoCent, 0)
  assert.equal(lista.find((c) => c.clave === 'e:ana@example.com').total, 2)
})

// ---------- En español, con punto y coma y fechas con barras ----------

test('CSV en español: separador punto y coma, fechas día/mes, «Sí» de cancelado y preguntas', async () => {
  const F = await laborable(25)
  const G = await laborable(27)
  const [y, m, d] = F.split('-')
  const [y2, m2, d2] = G.split('-')
  // Una fecha con día > 12 aclara el orden día/mes
  const csv = [
    'Nombre del invitado;Correo electrónico del invitado;Fecha y hora de inicio;Fecha y hora de finalización;Zona horaria del invitado;Cancelado;Motivo de la cancelación;UUID del invitado;Pregunta 1;Respuesta 1',
    `Laura Prueba Uno;laura@example.com;${d}/${m}/${y} 17:00;${d}/${m}/${y} 19:00;Europe/Madrid;No;;ES-1;¿Qué vas a hacer?;Podcast`,
    `Íñigo Prueba;inigo@example.com;${d2}/${m2}/${y2} 10:00;${d2}/${m2}/${y2} 13:00;Europe/Madrid;Sí;Me ha surgido algo;ES-2;;`,
    'Otra Fecha;otra2@example.com;28/12/2026 10:00;28/12/2026 12:00;Europe/Madrid;Sí;;ES-3;;',
  ].join('\n')
  const a = await K.analizarCsv(csv)
  assert.equal(a.avisoOrden, null)
  assert.equal(a.resumen.nuevas, 3)
  assert.equal(a.resumen.canceladas, 2)
  const laura = a._nuevas.find((x) => x.clave === 'calendly:ES-1')
  assert.equal(laura.fecha, F)
  assert.equal(horaMadrid(laura.inicio), '17:00')
  assert.equal(laura.nombre, 'Laura')
  assert.equal(laura.apellidos, 'Prueba Uno')
  assert.equal(laura.actividad, 'Podcast')
  assert.equal(laura.cancelada, false)
  const inigo = a._nuevas.find((x) => x.clave === 'calendly:ES-2')
  assert.equal(inigo.cancelada, true)
  assert.equal(inigo.motivo, 'Me ha surgido algo')
})

// ---------- Zona horaria ----------

test('zona horaria: en hora de Madrid avisa de quien tenía otra zona; con «cada persona» la convierte', async () => {
  const F = await laborable(30)
  const csv = csvDe([
    ['Invitee Name', 'Invitee Email', 'Start Date & Time', 'End Date & Time', 'Invitee Time Zone', 'Canceled', 'Invitee UUID'],
    ['Viajera Inventada', 'viajera@example.com', `${F} 10:00 am`, `${F} 12:00 pm`, 'America/New_York', 'false', 'TZ-1'],
  ])
  const enMadrid = await K.analizarCsv(csv, { zona: 'madrid' })
  assert.equal(horaMadrid(enMadrid._nuevas[0].inicio), '10:00')
  assert.ok(enMadrid.problemas.some((p) => /otra zona horaria \(America\/New_York\)/.test(p.texto)))
  const suya = await K.analizarCsv(csv, { zona: 'invitado' })
  const esperado = K.instanteEnZona(F, '10:00', 'America/New_York')
  assert.equal(suya._nuevas[0].inicio.getTime(), esperado.getTime())
  assert.notEqual(horaMadrid(suya._nuevas[0].inicio), '10:00')
  // Con «cada persona», una zona que no se entiende no se adivina
  const rara = csvDe([
    ['Invitee Name', 'Invitee Email', 'Start Date & Time', 'End Date & Time', 'Invitee Time Zone', 'Canceled', 'Invitee UUID'],
    ['Zona Rara', 'zona@example.com', `${F} 10:00 am`, `${F} 12:00 pm`, 'Hora de Marte', 'false', 'TZ-2'],
  ])
  const r = await K.analizarCsv(rara, { zona: 'invitado' })
  assert.equal(r.resumen.nuevas, 0)
  assert.ok(r.problemas.some((p) => p.tipo === 'error' && /Zona horaria del invitado no reconocida/.test(p.texto)))
})

test('archivo que no es de Calendly o vacío: error claro', async () => {
  await assert.rejects(K.analizarCsv(''), /vacío/)
  await assert.rejects(K.analizarCsv('a,b\n1,2'), /faltan columnas/)
  await assert.rejects(K.analizarCsv('Invitee Name,Start Date & Time,End Date & Time'), /no tiene filas/)
})
