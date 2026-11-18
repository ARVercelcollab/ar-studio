// Campos de las condiciones de un plan (cuota, horas, duraciones, horario, permanencia…),
// para el alta (condiciones especiales) y para «Cambiar condiciones» en la ficha.
import { condicionesDePlan } from '../../lib/suscripciones/reglas'

const txt = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','))

export function formularioDeCondiciones(c) {
  return {
    cuota: txt(c.cuotaCent / 100),
    horasPeriodo: txt(c.horasPeriodo),
    duracionesH: c.duracionesH && c.duracionesH.length ? c.duracionesH.map(txt).join('; ') : '',
    sesionMinH: txt(c.sesionMinH),
    sesionMaxH: txt(c.sesionMaxH),
    maxSesiones: txt(c.maxSesiones),
    franjaDesde: c.franjaDesde,
    franjaHasta: c.franjaHasta,
    antelacionH: txt(c.antelacionH),
    permanenciaMeses: txt(c.permanenciaMeses),
    renovacionMeses: txt(c.renovacionMeses),
    preavisoDias: txt(c.preavisoDias),
  }
}

export const formularioDePlan = (plan) => formularioDeCondiciones(condicionesDePlan(plan))

export function distintasDelPlan(form, plan) {
  const base = formularioDePlan(plan)
  return Object.keys(base).filter((k) => String(form[k]).trim() !== String(base[k]).trim())
}

export default function CondicionesPlan({ valor, onCambio }) {
  const poner = (k) => (e) => onCambio({ ...valor, [k]: e.target.value })
  return (
    <div className="adm-form">
      <label>Cuota al mes (€, IVA incluido)<input inputMode="decimal" value={valor.cuota} onChange={poner('cuota')} /></label>
      <label>Horas al mes<input inputMode="decimal" value={valor.horasPeriodo} onChange={poner('horasPeriodo')} /></label>
      <label>Sesión mínima (h)<input inputMode="decimal" value={valor.sesionMinH} onChange={poner('sesionMinH')} /></label>
      <label>Sesión máxima (h)<input inputMode="decimal" value={valor.sesionMaxH} onChange={poner('sesionMaxH')} /></label>
      <label>Duraciones que puede elegir (h)
        <input value={valor.duracionesH} onChange={poner('duracionesH')} placeholder="Ej.: 4; 8 (vacío = cualquiera entre el mínimo y el máximo)" />
      </label>
      <label>Sesiones al mes como mucho<input inputMode="numeric" value={valor.maxSesiones} onChange={poner('maxSesiones')} placeholder="Vacío = sin límite" /></label>
      <label>Horario: desde (lunes a viernes)<input type="time" step="900" value={valor.franjaDesde} onChange={poner('franjaDesde')} /></label>
      <label>Horario: hasta<input type="time" step="900" value={valor.franjaHasta} onChange={poner('franjaHasta')} /></label>
      <label>Reservar con (horas de antelación)<input inputMode="numeric" value={valor.antelacionH} onChange={poner('antelacionH')} /></label>
      <label>Permanencia (meses)<input inputMode="numeric" value={valor.permanenciaMeses} onChange={poner('permanenciaMeses')} /></label>
      <label>Se renueva cada (meses)<input inputMode="numeric" value={valor.renovacionMeses} onChange={poner('renovacionMeses')} /></label>
      <label>Preaviso para la baja (días)<input inputMode="numeric" value={valor.preavisoDias} onChange={poner('preavisoDias')} /></label>
    </div>
  )
}
