// Datos de la pantalla Añadir: las cuotas que se pueden marcar pagadas, quién ha reservado antes
// (para que «Escribirlo» reconozca a la gente por su nombre) y el resumen del mes («¿Cómo va el mes?»).
import { query } from '../db/index.js'
import { PLANES } from '../reservas/config.js'
import { asegurarCuotasDeTodas } from '../suscripciones/servicio.js'
import { resumenFinanzas } from '../finanzas/servicio.js'
import { periodoActual, textoMes } from '../finanzas/calculos.js'

// Cuotas pendientes que ya han empezado o empiezan en el próximo mes (con su miembro)
export async function cuotasPendientes(hoy) {
  await asegurarCuotasDeTodas(hoy)
  const { rows } = await query(
    `SELECT c.id, c.periodo, c.desde::text AS desde, c.importe_cent, c.cobro_estado, s.id AS sus_id, s.nombre, s.apellidos, s.plan, s.factura
       FROM cuotas c JOIN suscripciones s ON s.id = c.suscripcion_id
      WHERE c.estado = 'pendiente' AND c.importe_cent > 0 AND c.desde <= ($1::date + 31)
      ORDER BY c.desde, s.nombre`,
    [hoy]
  )
  return rows.map((r) => ({
    id: r.id, susId: r.sus_id, nombre: `${r.nombre} ${r.apellidos}`.trim(), periodo: r.periodo, desde: r.desde, importeCent: r.importe_cent,
    cobroEstado: r.cobro_estado || null, plan: PLANES[r.plan]?.nombre || r.plan, conDatos: Boolean(r.factura),
  }))
}

// Quien ya ha reservado alguna vez: una fila por correo (o por teléfono, si no dejó correo),
// con los datos de su última reserva
export async function clientesConocidos() {
  const { rows } = await query(
    `SELECT DISTINCT ON (lower(coalesce(nullif(email, ''), telefono))) nombre, apellidos, email, telefono
       FROM reservas
      WHERE coalesce(nullif(email, ''), nullif(telefono, '')) IS NOT NULL AND estado IN ('confirmada', 'cancelada', 'conflicto')
      ORDER BY lower(coalesce(nullif(email, ''), telefono)), inicio DESC
      LIMIT 2000`
  )
  return rows.map((r) => ({ nombre: r.nombre, apellidos: r.apellidos || '', email: r.email || '', telefono: r.telefono || '' }))
}

// Lo de este mes, sin IVA. null si no se puede calcular (no rompe la pantalla)
export async function resumenDelMes(hoy) {
  try {
    const r = await resumenFinanzas(periodoActual('mes', hoy))
    return {
      texto: textoMes(hoy.slice(0, 7), { soloNombre: true }),
      ingresosCent: r.cifras.facturacion.baseCent,
      gastosCent: r.cifras.gastos.costeCent,
      beneficioCent: r.cifras.beneficioCent,
      deCada100: r.cifras.deCada100 ?? null,
    }
  } catch {
    return null
  }
}
