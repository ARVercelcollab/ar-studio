// Entrar en el panel. Con cuentas: correo y contraseña de cada persona. Sin cuentas todavía: la
// contraseña compartida (ADMIN_PASSWORD), como hasta ahora (ver lib/admin/auth.js).
//
// Límites (solo cuentan los fallos; el intento se reserva ANTES de comprobar la contraseña, de
// forma atómica, y se suelta si entra bien): 8 cada 15 minutos por conexión; 5 por correo y
// conexión; 30 por correo en total. Así nadie puede dejar fuera a otra persona desde otra conexión
// con solo saber su correo, y una ráfaga en paralelo no se salta el límite.
import { contrasenaCorrecta, abrirSesion, ponerCookie, panelConfigurado, hayCuentas } from '../../../lib/admin/auth.js'
import { comprobarEntrada, normalizarEmail, reservarIntentos, soltarIntentos, MENSAJE_ENTRADA_MALA } from '../../../lib/admin/cuentas.js'
import { soloMetodos, mismoOrigen, huellaDe, sinCache, responderError } from '../../../lib/http.js'

const DEMASIADOS = 'Demasiados intentos fallidos. Espera 15 minutos.'

export default async function handler(req, res) {
  sinCache(res)
  if (!soloMetodos(req, res, ['POST'])) return
  if (!mismoOrigen(req)) return res.status(403).json({ mensaje: 'Petición no permitida.' })
  try {
    const cuentas = await hayCuentas()
    if (!panelConfigurado({ cuentas })) return res.status(503).json({ mensaje: 'Falta configurar ADMIN_PASSWORD (12 caracteres o más) y SESSION_SECRET.' })
    const huella = huellaDe(req)

    if (!cuentas) {
      const r = await reservarIntentos([{ clave: `login_fallido:${huella}`, max: 8 }], 15)
      if (!r.ok) return res.status(429).json({ mensaje: DEMASIADOS })
      if (!contrasenaCorrecta(req.body?.contrasena)) return res.status(401).json({ mensaje: 'Contraseña incorrecta.' })
      await soltarIntentos(r.marcas)
      await abrirSesion(res)
      return res.status(200).json({ ok: true })
    }

    const email = normalizarEmail(req.body?.email)
    const limites = [{ clave: `login_fallido:${huella}`, max: 8 }]
    if (email) limites.push({ clave: `login_fallido_cc:${email}:${huella}`, max: 5 }, { clave: `login_fallido_correo:${email}`, max: 30 })
    const r = await reservarIntentos(limites, 15)
    if (!r.ok) return res.status(429).json({ mensaje: DEMASIADOS })
    const entrada = await comprobarEntrada(email, req.body?.contrasena)
    if (!entrada) return res.status(401).json({ mensaje: MENSAJE_ENTRADA_MALA })
    await soltarIntentos(r.marcas)
    ponerCookie(res, entrada.token)
    return res.status(200).json({ ok: true })
  } catch (e) {
    return responderError(res, e)
  }
}
