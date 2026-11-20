// Añadir con la base de datos de verdad (PGlite en memoria): quién ha reservado antes, las cuotas
// pendientes y que lo que manda «Escribirlo» al guardar lo aceptan las mismas funciones del panel.
process.env.PGLITE_DIR = 'memoria'
delete process.env.VERCEL
delete process.env.FACTURAS_AUTOMATICAS
delete process.env.FACTURA_EMISOR_NOMBRE

const { test } = await import('node:test')
const assert = (await import('node:assert/strict')).default
const S = await import('../lib/reservas/servicio.js')
const SUS = await import('../lib/suscripciones/servicio.js')
const F = await import('../lib/finanzas/servicio.js')
const A = await import('../lib/admin/anadir.js')
const { interpretar } = await import('../lib/admin/interprete.js')
const { fechaMadrid } = await import('../lib/reservas/tiempo.js')
const { sumarDias } = await import('../lib/admin/interprete.js')

const HOY = fechaMadrid(new Date())
let n = 0
const reservar = (dias, datos) => S.crearReservaManual({
  actividad: 'Fotos', fondos: 'no', equipo: [], comentarios: '', factura: null,
  fecha: sumarDias(HOY, dias), desde: `${String(9 + (n++ % 10)).padStart(2, '0')}:00`, hasta: `${String(10 + ((n - 1) % 10)).padStart(2, '0')}:00`,
  precioCent: 4840, pagoEstado: 'pendiente', origen: 'manual', ...datos,
})

test('clientes conocidos: una fila por correo (o teléfono) con su última reserva', async () => {
  await reservar(-40, { nombre: 'Laura', apellidos: 'Ribera', email: 'LAURA@ejemplo.es', telefono: '600111222' })
  await reservar(-10, { nombre: 'Laura', apellidos: 'Ribera Vidal', email: 'laura@ejemplo.es', telefono: '600111222' })
  await reservar(-5, { nombre: 'Pepe', apellidos: 'Gómez', email: '', telefono: '611222333' })
  const c = await A.clientesConocidos()
  const lauras = c.filter((x) => x.nombre === 'Laura')
  assert.equal(lauras.length, 1, 'el mismo correo en mayúsculas o minúsculas es la misma persona')
  assert.equal(lauras[0].apellidos, 'Ribera Vidal', 'con los datos de la última reserva')
  assert.ok(c.some((x) => x.nombre === 'Pepe' && x.telefono === '611222333'), 'sin correo cuenta por teléfono')
})

test('cuotas pendientes con su miembro, y «Escribirlo» encuentra la suya', async () => {
  const { suscripcion } = await SUS.crearSuscripcion({ plan: 'starter', nombre: 'Irene', apellidos: 'Campos', email: 'irene@ejemplo.es', fechaInicio: HOY })
  const cuotas = await A.cuotasPendientes(HOY)
  const suya = cuotas.find((c) => c.susId === suscripcion.id)
  assert.ok(suya, 'la primera cuota sin pagar sale')
  assert.equal(suya.nombre, 'Irene Campos')
  assert.equal(suya.plan, 'Starter')
  const miembros = (await SUS.opcionesParaReservar()).map((m) => ({ id: m.id, nombre: m.nombre }))
  const r = interpretar('Cobrado 129 € de cuota de Irene por Bizum', { hoy: HOY, miembros, cuotas, clientes: [], categorias: [], festivos: [] })
  assert.equal(r.tipo, 'cuota')
  assert.equal(r.listo, true)
  assert.equal(r.campos.cuotaId, suya.id)
  await SUS.marcarCuotaPagada(r.campos.cuotaId, { metodo: r.campos.metodo, pagadaEn: r.campos.fecha })
  assert.ok(!(await A.cuotasPendientes(HOY)).some((c) => c.id === suya.id), 'pagada, ya no sale')
})

test('lo que guarda «Escribirlo» (gasto, ingreso y bloqueo) lo aceptan las funciones del panel', async () => {
  const { categorias } = await F.datosFormularioGasto()
  const g = interpretar('Aquaservice 32 € con tarjeta', { hoy: HOY, categorias, miembros: [], clientes: [], cuotas: [], festivos: [] })
  assert.equal(g.listo, true)
  const cat = categorias.find((c) => c.id === g.campos.categoriaId)
  assert.equal(cat.clave, 'aquaservice')
  // El mismo cuerpo que manda components/admin/anadir/guardar.js
  const gasto = await F.crearGasto({
    categoriaId: cat.id, importeEs: 'pagado', importe: '32,00', fecha: g.campos.fecha, concepto: g.campos.concepto, proveedor: '', numFactura: '',
    tipoFactura: cat.tipoFactura, ivaPct: ['nif', 'ticket'].includes(cat.tipoFactura) ? cat.ivaPct ?? 21 : null, iva: '', retencionPct: 0,
    metodoPago: g.campos.metodoPago, enlace: '', nota: '',
  }, { clave: 'prueba-anadir-gasto' })
  assert.equal(gasto.totalCent, 3200)

  const i = interpretar('Cobrado 24,20 € de fondo blanco en efectivo', { hoy: HOY, categorias, miembros: [], clientes: [], cuotas: [], festivos: [] })
  const ingreso = await F.crearIngresoManual({
    tipo: i.campos.tipo, sentido: 'cobro', fecha: i.campos.fecha, concepto: i.campos.concepto, importe: '24,20', ivaPct: 21, iva: '', reservaId: '',
    facturaRef: '', clienteNombre: '', clienteNif: '', metodoPago: i.campos.metodoPago, enlace: '', nota: '',
  }, { clave: 'prueba-anadir-ingreso' })
  assert.equal(ingreso.totalCent, 2420)

  const b = interpretar('Bloquear el domingo por la mañana para limpieza', { hoy: HOY, categorias, miembros: [], clientes: [], cuotas: [], festivos: [] })
  await S.crearBloqueo({ fecha: b.campos.fecha, fechaFin: b.campos.fechaFin, desde: b.campos.desde, hasta: b.campos.hasta, motivo: b.campos.motivo })
  const bloqueos = await S.listarBloqueos({ desde: new Date(`${HOY}T00:00:00Z`) })
  assert.ok(bloqueos.some((x) => x.motivo === 'Limpieza'))
})

test('el resumen del mes sale sin romper aunque haya poco', async () => {
  const m = await A.resumenDelMes(HOY)
  assert.ok(m)
  assert.equal(typeof m.ingresosCent, 'number')
  assert.equal(typeof m.gastosCent, 'number')
  assert.equal(m.beneficioCent, m.ingresosCent - m.gastosCent)
})
