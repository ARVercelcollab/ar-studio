// Comprobación de los datos que manda el formulario de reserva.
// Devuelve { ok, datos, errores } con los textos ya limpios.

import { ACTIVIDADES, EQUIPO, FONDOS, duracion } from './config.js'
import { esFecha, esHora } from './tiempo.js'

const RE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/
const RE_TELEFONO = /^\+?[0-9 ()-]{6,20}$/

function texto(valor, max) {
  if (typeof valor !== 'string') return ''
  return valor.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function textoLargo(valor, max) {
  if (typeof valor !== 'string') return ''
  return valor.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

export function validarCliente(entrada = {}) {
  const errores = {}
  const datos = {
    nombre: texto(entrada.nombre, 80),
    apellidos: texto(entrada.apellidos, 80),
    email: texto(entrada.email, 120).toLowerCase(),
    telefono: texto(entrada.telefono, 20),
    actividad: texto(entrada.actividad, 40),
    fondos: texto(entrada.fondos, 20) || 'no',
    equipo: Array.isArray(entrada.equipo) ? [...new Set(entrada.equipo.filter((e) => typeof e === 'string'))] : [],
    comentarios: textoLargo(entrada.comentarios, 1000),
    factura: null,
  }

  if (!datos.nombre) errores.nombre = 'Escribe tu nombre.'
  if (!datos.apellidos) errores.apellidos = 'Escribe tus apellidos.'
  if (!RE_EMAIL.test(datos.email)) errores.email = 'Revisa el correo electrónico.'
  if (!RE_TELEFONO.test(datos.telefono)) errores.telefono = 'Revisa el número de WhatsApp.'
  if (!ACTIVIDADES.includes(datos.actividad)) errores.actividad = 'Elige qué vas a hacer en el estudio.'
  if (!FONDOS.some((f) => f.id === datos.fondos)) errores.fondos = 'Elige si vas a usar los fondos.'
  if (datos.equipo.some((e) => !EQUIPO.some((q) => q.id === e))) errores.equipo = 'Revisa el equipo elegido.'

  if (entrada.quiereFactura) {
    const factura = {
      nombre: texto(entrada.factura?.nombre, 120),
      nif: texto(entrada.factura?.nif, 20).toUpperCase(),
      direccion: texto(entrada.factura?.direccion, 200),
    }
    if (!factura.nombre) errores.facturaNombre = 'Escribe a nombre de quién va la factura.'
    if (factura.nif.length < 5) errores.facturaNif = 'Revisa el NIF o CIF.'
    if (!factura.direccion) errores.facturaDireccion = 'Escribe la dirección de facturación.'
    datos.factura = factura
  }

  return { ok: Object.keys(errores).length === 0, datos, errores }
}

export function validarReserva(entrada = {}) {
  const errores = {}
  const fecha = entrada.fecha
  const hora = entrada.hora
  const horas = Number(entrada.horas)
  if (!esFecha(fecha)) errores.fecha = 'Elige un día.'
  if (!esHora(hora)) errores.hora = 'Elige una hora.'
  if (!duracion(horas)) errores.horas = 'Elige cuántas horas.'
  if (entrada.aceptaCondiciones !== true) errores.aceptaCondiciones = 'Tienes que aceptar las condiciones del estudio.'

  const cliente = validarCliente(entrada)
  Object.assign(errores, cliente.errores)
  return {
    ok: Object.keys(errores).length === 0,
    datos: { fecha, hora, horas, ...cliente.datos },
    errores,
  }
}
