// Personas con acceso al panel (Ajustes): dar acceso, reenviar la invitación, cerrar sus sesiones,
// quitar el acceso y volver a darlo. Solo quien puede dar acceso (se comprueba en lib/admin/cuentas).
import { rutaAdmin } from '../../../lib/admin/api.js'
import { personaDeLaPeticion } from '../../../lib/admin/auth.js'
import * as C from '../../../lib/admin/cuentas.js'
import { urlBase } from '../../../lib/http.js'

const avisoEnvio = (r, texto) => (r.enviado ? texto : `${texto} Pero el correo no ha salido${r.motivo ? `: ${r.motivo}` : ''}.`)

export default rutaAdmin(async (req, res) => {
  const quien = await personaDeLaPeticion(req)
  const b = req.body || {}
  const base = urlBase(req)
  switch (b.accion) {
    case 'dar_acceso': {
      const r = await C.darAcceso(quien, { nombre: b.nombre, email: b.email, puedeDarAcceso: Boolean(b.puedeDarAcceso) }, base)
      return res.status(200).json({ ok: true, mensaje: avisoEnvio(r, `Invitación enviada a ${r.persona.email}.`) })
    }
    case 'reenviar': {
      const r = await C.reenviarInvitacion(quien, b.id, base)
      return res.status(200).json({ ok: true, mensaje: avisoEnvio(r, `Invitación enviada otra vez a ${r.persona.email}.`) })
    }
    case 'cerrar_sesiones': {
      const p = await C.cerrarSesionesDe(quien, b.id)
      return res.status(200).json({ ok: true, mensaje: `Sesiones de ${p.nombre} cerradas: tendrá que volver a entrar.` })
    }
    case 'quitar': {
      const p = await C.quitarAcceso(quien, b.id)
      return res.status(200).json({ ok: true, mensaje: `${p.nombre} ya no tiene acceso.` })
    }
    case 'volver': {
      const r = await C.volverADarAcceso(quien, b.id, base)
      return res.status(200).json({ ok: true, mensaje: avisoEnvio(r, `Invitación enviada a ${r.persona.email}: tendrá que crear una contraseña nueva.`) })
    }
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
}, { calendario: false })
