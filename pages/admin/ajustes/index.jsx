// Ajustes: una sola pantalla con todo lo que se configura (como en el prototipo). Precios, reglas y
// planes son de solo lectura (se cambian en lib/reservas/config.js); gastos fijos, Google Calendar,
// Calendly, festivos y bloqueos tienen su apartado para cambiarlos.
import ResumenAjustes, { euro } from '../../../components/admin/ajustes/Resumen'
import { redirigirSiNoAdmin, personaDeLaPeticion } from '../../../lib/admin/auth'
import { listarPersonas } from '../../../lib/admin/cuentas'
import { query } from '../../../lib/db/index'
import { fechaMadrid, horaMadrid, textoFecha } from '../../../lib/reservas/tiempo'
import { listarFestivos, listarBloqueos } from '../../../lib/reservas/servicio'
import { listarGastosFijos, ajustesFinanzas, cobraCalendly } from '../../../lib/finanzas/servicio'
import { textoMes, mesDe, sumarMesesMes } from '../../../lib/finanzas/calculos'
import { METODOS_GASTO, CADA_MESES } from '../../../lib/finanzas/config'
import { estadoGoogle } from '../../../lib/google/calendario'

const METODO = Object.fromEntries(METODOS_GASTO)

export default ResumenAjustes

function textoFijo(f) {
  const cada = f.cadaMeses === 1 ? '' : ` · ${(CADA_MESES.find(([n]) => n === f.cadaMeses)?.[1] || `cada ${f.cadaMeses} meses`).toLowerCase()}`
  const iva = ['nif', 'ticket'].includes(f.tipoFactura) ? (f.ivaPct ? ` · IVA ${f.ivaPct} %` : '') : ' · sin IVA'
  return `El día ${f.dia}${f.metodoPago ? ` · ${METODO[f.metodoPago] || f.metodoPago}` : ''}${iva}${cada}`
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const ahora = new Date()
  const hoy = fechaMadrid(ahora)
  const [fijos, google, festivos, bloqueos, aj, cal] = await Promise.all([
    listarGastosFijos({ hoy }),
    estadoGoogle(),
    listarFestivos(),
    listarBloqueos({ desde: ahora }),
    ajustesFinanzas(undefined, { hoy }),
    query('SELECT mes::text AS mes, cobrado_cent, devuelto_cent FROM calendly_meses ORDER BY mes DESC LIMIT 5'),
  ])
  const yo = await personaDeLaPeticion(ctx.req)
  const ESTADO = { activa: 'activa', invitada: 'invitación enviada', sin_acceso: 'sin acceso' }
  const personas = yo?.puedeDarAcceso ? await listarPersonas() : []
  const acceso = yo?.puedeDarAcceso
    ? { compartida: Boolean(yo.compartida), n: personas.length, lista: personas.filter((p) => p.activa).slice(0, 6).map((p) => ({ nombre: p.nombre, email: p.email, estado: ESTADO[p.estado] })) }
    : null
  const mesHoy = mesDe(hoy)
  const anterior = sumarMesesMes(mesHoy, -1)
  const apuntados = new Set(cal.rows.map((r) => r.mes.slice(0, 7)))
  const textoHora = (d) => `${textoFecha(fechaMadrid(d))}, ${horaMadrid(d)}`
  return {
    props: JSON.parse(JSON.stringify({
      fijos: fijos.activos.map((f) => ({
        id: f.id,
        concepto: f.concepto,
        texto: textoFijo(f),
        importe: f.importeActualCent ? `${euro(f.importeActualCent)}${f.importeEs === 'base' ? ' + IVA' : ''}` : 'Según factura',
      })),
      alMesCent: fijos.alMes.conIvaCent,
      google: {
        configurado: google.configurado, conectado: google.conectado, revocado: Boolean(google.revocado), cuenta: google.cuenta || null,
        calendarioNombre: google.calendarioNombre || null, pendientes: google.pendientes || 0, errores: google.errores || 0,
      },
      calendly: {
        sigue: cobraCalendly(aj, mesHoy),
        hasta: aj.calendlyHasta && !['sigue', 'nunca'].includes(aj.calendlyHasta) ? textoMes(aj.calendlyHasta) : null,
        falta: anterior >= aj.desde && cobraCalendly(aj, anterior) && !apuntados.has(anterior) ? textoMes(anterior) : null,
        meses: cal.rows.map((r) => ({ mes: r.mes, texto: textoMes(r.mes.slice(0, 7)), cobradoCent: r.cobrado_cent, devueltoCent: r.devuelto_cent })),
      },
      festivos: festivos.filter((x) => x.fecha >= hoy).slice(0, 5).map((x) => ({ fecha: x.fecha, nombre: x.nombre, texto: textoFecha(x.fecha) })),
      bloqueos: bloqueos.slice(0, 4).map((b) => ({ id: b.id, desde: textoHora(b.inicio), hasta: textoHora(b.fin), motivo: b.motivo || '' })),
      acceso,
    })),
  }
}
