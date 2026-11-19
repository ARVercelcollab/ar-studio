// Envoltorio para las rutas del panel: sesión, método POST y mismo origen
import { esAdmin } from './auth.js'
import { soloMetodos, mismoOrigen, responderError, sinCache, urlBase } from '../http.js'
import { googleConfigurado, sincronizarTrasCambio } from '../google/calendario.js'

// calendario: después de un cambio, pasa a Google Calendar lo que haya quedado pendiente
// ANTES de contestar (en Vercel la función se puede parar en cuanto sale la respuesta).
export function rutaAdmin(fn, { metodos = ['POST'], calendario = true } = {}) {
  return async (req, res) => {
    sinCache(res)
    if (!soloMetodos(req, res, metodos)) return
    if (!esAdmin(req)) return res.status(401).json({ error: 'sesion', mensaje: 'Vuelve a entrar en el panel.' })
    if (req.method !== 'GET' && !mismoOrigen(req)) return res.status(403).json({ error: 'origen', mensaje: 'Petición no permitida.' })
    const sincronizar = calendario && req.method !== 'GET' && googleConfigurado()
    // Se guarda el final de la respuesta hasta haber sincronizado
    const terminar = res.end
    let final = null
    if (sincronizar) {
      res.end = (...args) => {
        final = args
        return res
      }
    }
    try {
      await fn(req, res)
    } catch (e) {
      responderError(res, e)
    } finally {
      if (sincronizar) {
        res.end = terminar
        await sincronizarTrasCambio(urlBase(req))
        if (final) terminar.apply(res, final)
      }
    }
  }
}

// '12,5' -> 1250 céntimos; vacío -> null; algo que no es un número -> NaN
export function centimos(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.').trim())
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}
