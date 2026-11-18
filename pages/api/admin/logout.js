import { cerrarSesion } from '../../../lib/admin/auth.js'

export default function handler(req, res) {
  cerrarSesion(res)
  res.redirect(303, '/admin/login')
}
