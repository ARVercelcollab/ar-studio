// Lo que ve el cliente de su reserva (sin datos internos del estudio)

import { ESTUDIO, formatoEuros, porcentajeReembolso, textoDuracion } from './config.js'
import { fechaMadrid, horaMadrid, textoFranja } from './tiempo.js'

export function vistaPublica(r) {
  if (!r) return null
  return {
    codigo: r.codigo,
    estado: r.estado,
    pagoEstado: r.pagoEstado,
    origen: r.origen,
    fecha: fechaMadrid(r.inicio),
    horaInicio: horaMadrid(r.inicio),
    horaFin: horaMadrid(r.fin),
    franja: textoFranja(r.inicio, r.fin),
    inicioIso: r.inicio.toISOString(),
    duracionHoras: r.duracionHoras,
    duracionTexto: textoDuracion(r.duracionHoras),
    finIso: r.fin.toISOString(),
    tipoDia: r.tipoDia,
    importe: formatoEuros(r.precioCent),
    nombre: r.nombre,
    email: r.email,
    expiraEn: r.expiraEn ? r.expiraEn.toISOString() : null,
    pasada: r.fin.getTime() < Date.now(),
    reembolsoHoy: porcentajeReembolso(r.inicio),
    reembolso: r.reembolsoCent ? formatoEuros(r.reembolsoCent) : null,
    direccion: ESTUDIO.direccion,
    mapa: ESTUDIO.mapa,
  }
}
