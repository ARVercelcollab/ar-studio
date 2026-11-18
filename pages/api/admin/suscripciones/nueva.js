// Alta de una suscripción desde el panel
import { rutaAdmin, centimos } from '../../../../lib/admin/api.js'
import { crearSuscripcion } from '../../../../lib/suscripciones/servicio.js'

const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  const c = b.condiciones || {}
  const condiciones = {
    cuotaCent: c.cuota !== undefined ? centimos(c.cuota) : undefined,
    horasPeriodo: numero(c.horasPeriodo) ?? undefined,
    duracionesH: c.duracionesH,
    sesionMinH: numero(c.sesionMinH) ?? undefined,
    sesionMaxH: numero(c.sesionMaxH) ?? undefined,
    maxSesiones: c.maxSesiones === '' ? null : numero(c.maxSesiones) ?? undefined,
    franjaDesde: c.franjaDesde || undefined,
    franjaHasta: c.franjaHasta || undefined,
    antelacionH: numero(c.antelacionH) ?? undefined,
    permanenciaMeses: numero(c.permanenciaMeses) ?? undefined,
    renovacionMeses: numero(c.renovacionMeses) ?? undefined,
    preavisoDias: numero(c.preavisoDias) ?? undefined,
  }
  for (const k of Object.keys(condiciones)) if (condiciones[k] === undefined) delete condiciones[k]
  const { suscripcion } = await crearSuscripcion({
    plan: b.plan,
    nombre: b.nombre,
    apellidos: b.apellidos,
    email: b.email,
    telefono: b.telefono,
    factura: b.quiereFactura ? b.factura : null,
    fechaInicio: b.fechaInicio,
    mesPrueba: Boolean(b.mesPrueba),
    metodoHabitual: b.metodoHabitual,
    cobroExternoRef: b.cobroExternoRef,
    contratoUrl: b.contratoUrl,
    notasInternas: b.notasInternas,
    primeraPagada: b.primeraPagada ? { metodo: b.primeraMetodo || b.metodoHabitual, fecha: b.primeraFecha, referencia: b.primeraReferencia, enlace: b.primeraEnlace } : null,
    fianza: { estado: b.fianzaEstado, importeCent: centimos(b.fianzaImporte), metodo: b.fianzaMetodo, fecha: b.fianzaFecha },
    condiciones,
  }, { confirmado: Boolean(b.confirmado) })
  res.status(200).json({ id: suscripcion.id })
})
