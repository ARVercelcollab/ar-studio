// Mensaje del miembro al estudio (una consulta o que quiere darse de baja): llega por correo
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { mensajeMiembro } from '../../../lib/miembros/acciones.js'
import { urlBase } from '../../../lib/http.js'

export default rutaMiembro(async (req, res, { sus }) => {
  const b = req.body || {}
  return res.status(200).json(await mensajeMiembro(sus, { tipo: b.tipo, texto: b.texto }, urlBase(req)))
}, { calendario: false })
