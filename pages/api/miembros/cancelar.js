// Cancela una sesión suya: { ok, cuentaComoUsada } (con menos de su aviso cuenta como usada)
import { rutaMiembro } from '../../../lib/miembros/api.js'
import { cancelarMiembro } from '../../../lib/miembros/acciones.js'
import { urlBase } from '../../../lib/http.js'

export default rutaMiembro(async (req, res, { sus }) => {
  return res.status(200).json(await cancelarMiembro(sus, { codigo: req.body?.codigo }, urlBase(req)))
})
