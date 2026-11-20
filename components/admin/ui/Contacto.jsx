// Botones de llamar y WhatsApp (y correo, si se pide) para una persona.
//   <Contacto telefono={r.telefono} nombre="Laura Ribera" />
//   <Contacto telefono={…} email={…} nombre="…" conCorreo mensaje="Hola Laura, …" />
import { BotonIcono } from './Boton'
import { enlaceWhatsApp } from '../../../lib/admin/vista'

function enlaceTel(telefono) {
  let n = String(telefono || '').replace(/[^0-9+]/g, '')
  if (!n) return null
  if (/^[0-9]{9}$/.test(n)) n = `+34${n}`
  return `tel:${n}`
}

export default function Contacto({ telefono, email, nombre = '', mensaje = '', conCorreo = false, className = '' }) {
  const tel = enlaceTel(telefono)
  const wa = enlaceWhatsApp(telefono, mensaje)
  if (!tel && !(conCorreo && email)) return null
  return (
    <div className={`ui-contacto${className ? ` ${className}` : ''}`}>
      {tel && <BotonIcono icono="tel" etiqueta={`Llamar a ${nombre}`.trim()} href={tel} />}
      {wa && <BotonIcono icono="wa" etiqueta={`WhatsApp a ${nombre}`.trim()} href={wa} externo />}
      {conCorreo && email && <BotonIcono icono="correo" etiqueta={`Correo a ${nombre}`.trim()} href={`mailto:${email}`} />}
    </div>
  )
}
