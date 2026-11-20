// Clientes: se juntan las reservas de cada persona por correo (o teléfono) y se guardan sus notas
process.env.PGLITE_DIR = 'memoria'
process.env.PAGOS_PROVEEDOR = 'simulado'

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { cerrarDb, query } from '../lib/db/index.js'
import * as S from '../lib/reservas/servicio.js'
import * as CL from '../lib/reservas/clientes.js'
import { fechaMadrid, sumarDias, diaSemana } from '../lib/reservas/tiempo.js'

after(() => cerrarDb())

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
const reservar = async (dias, datos, extra = {}) => S.crearReservaManual({
  fecha: await laborable(dias), desde: '10:00', hasta: '12:00', pagoEstado: 'pagado', metodoPago: 'bizum',
  actividad: 'Fotos', ...datos, ...extra,
})

test('la clave junta por correo (sin mayúsculas ni espacios) y, si no hay correo, por teléfono', () => {
  assert.equal(CL.claveCliente({ email: '  Laura@Ejemplo.ES ', telefono: '600 111 222' }), 'e:laura@ejemplo.es')
  assert.equal(CL.claveCliente({ email: '', telefono: '+34 600 111 222' }), 't:600111222')
  assert.equal(CL.claveCliente({ email: '', telefono: '12' }), null)
  assert.ok(CL.claveValida('e:laura@ejemplo.es'))
  assert.ok(CL.claveValida('t:600111222'))
  assert.ok(!CL.claveValida('x:algo'))
  assert.equal(CL.textoVez(1), 'primera vez')
  assert.equal(CL.textoVez(10), '10.ª vez')
})

test('lista de clientes: junta reservas, cuenta, suma lo pagado y deja fuera las que no se pagaron', async () => {
  const laura = { nombre: 'Laura', apellidos: 'Prueba', email: 'laura.clientes@example.com', telefono: '600 100 100' }
  const a = await reservar(-40, laura, { actividad: 'Podcast', precioCent: 9680 })
  await reservar(-20, { ...laura, email: 'LAURA.clientes@example.com ' }, { actividad: 'Podcast', precioCent: 9680 })
  const c = await reservar(10, laura, { actividad: 'Fotos', fondos: 'blanco', precioCent: 9680 })
  // Una cancelada y devuelta: sale en el historial pero no cuenta ni suma
  const d = await reservar(15, laura, { precioCent: 9680 })
  await S.cancelar(d.id, { motivo: 'prueba', reembolsoCent: 9680 })
  // Sin correo: se junta por teléfono
  const pepe = { nombre: 'Pepe', apellidos: 'Teléfono', email: '', telefono: '+34 611 222 333' }
  await reservar(-10, pepe, { pagoEstado: 'pendiente', metodoPago: null, precioCent: 14520 })
  await reservar(-5, { ...pepe, telefono: '611222333' }, { precioCent: 14520 })

  const { clientes, cifras } = await CL.listarClientes()
  const l = clientes.find((x) => x.clave === 'e:laura.clientes@example.com')
  assert.ok(l, 'Laura sale como cliente')
  assert.equal(l.total, 3)
  assert.equal(l.canceladas, 1)
  assert.equal(l.horas, 6)
  assert.equal(l.pagadoCent, 3 * 9680)
  assert.equal(l.actividad, 'Podcast')
  assert.equal(l.repite, true)
  assert.ok(l.proxima && l.ultima, 'tiene una pasada y una próxima')
  const p = clientes.find((x) => x.clave === 't:611222333')
  assert.ok(p, 'sin correo, se junta por teléfono')
  assert.equal(p.total, 2)
  assert.equal(p.pagadoCent, 14520, 'la que no se pagó no suma')
  assert.ok(cifras.clientes >= 2)

  // Qué vez es cada reserva (por orden de fecha; la cancelada no cuenta)
  const veces = await CL.vecesDeReservas([a.id, c.id, d.id])
  assert.equal(veces.get(a.id).vez, 1)
  assert.equal(veces.get(c.id).vez, 3)
  assert.equal(veces.get(c.id).total, 3)
  assert.equal(veces.get(d.id).vez, null)
})

test('ficha del cliente: cifras, lo que suele hacer, próximas e historial, y notas guardadas', async () => {
  const f = await CL.fichaCliente('e:laura.clientes@example.com')
  assert.equal(f.nombre, 'Laura')
  assert.equal(f.total, 3)
  assert.equal(f.actividades[0][0], 'Podcast')
  assert.equal(f.actividades[0][1], 2)
  assert.deepEqual(f.fondos, [['el fondo blanco', 1]])
  assert.equal(f.proximas.length, 1)
  assert.equal(f.historial.length, 3, 'dos pasadas y la cancelada')
  assert.equal(f.mediaCent, 9680)

  await CL.guardarNotasCliente(f.clave, 'Siempre llega pronto.')
  assert.equal((await CL.fichaCliente(f.clave)).notas, 'Siempre llega pronto.')
  await CL.guardarNotasCliente(f.clave, '   ')
  assert.equal((await CL.fichaCliente(f.clave)).notas, '')
  await assert.rejects(() => CL.guardarNotasCliente('x:nada', 'hola'))
  assert.equal(await CL.fichaCliente('e:nadie@example.com'), null)
})

test('filtros de la vista Clientes: buscar, repiten, nuevos y orden', async () => {
  const { clientes } = await CL.listarClientes()
  assert.ok(CL.filtrarClientes(clientes, { q: 'laura prueba' }).some((c) => c.nombre === 'Laura'))
  assert.ok(CL.filtrarClientes(clientes, { q: '611 222' }).some((c) => c.nombre === 'Pepe'), 'busca por teléfono')
  assert.ok(CL.filtrarClientes(clientes, { tipo: 'repiten' }).every((c) => c.repite))
  const porPagado = CL.filtrarClientes(clientes, { orden: 'pagado' })
  for (let i = 1; i < porPagado.length; i++) assert.ok(porPagado[i - 1].pagadoCent >= porPagado[i].pagadoCent)
})
