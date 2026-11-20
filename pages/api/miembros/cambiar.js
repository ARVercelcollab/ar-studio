// Cambia una sesión suya a otro día u hora (con su aviso de cambio y sin horas aparte)
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { cambiarMiembro } from '../../../lib/miembros/acciones.js'
import { urlBase } from '../../../lib/http.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const b = req.body || {}
  return res.status(200).json(await cambiarMiembro(sus, { codigo: b.codigo, fecha: b.fecha, desde: b.desde, horas: b.horas }, urlBase(req)))
})
