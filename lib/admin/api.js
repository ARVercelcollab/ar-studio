// Envoltorio para las rutas del panel: sesión, método POST y mismo origen
import { esAdmin } from './auth.js'
import { soloMetodos, mismoOrigen, responderError, sinCache } from '../http.js'

export function rutaAdmin(fn, { metodos = ['POST'] } = {}) {
  return async (req, res) => {
    sinCache(res)
    if (!soloMetodos(req, res, metodos)) return
    if (!esAdmin(req)) return res.status(401).json({ error: 'sesion', mensaje: 'Vuelve a entrar en el panel.' })
    if (req.method !== 'GET' && !mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
    try {
      await fn(req, res)
    } catch (e) {
      responderError(res, e)
    }
  }
}

// '12,5' -> 1250 céntimos; vacío -> null; algo que no es un número -> NaN
export function centimos(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.').trim())
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}
