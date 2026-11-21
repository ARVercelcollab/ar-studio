// Entrada al panel (como la de Gartalia): a la izquierda la foto del estudio con el logo y una frase;
// a la derecha, el correo y la contraseña. En el móvil, la foto queda arriba como una franja.
// Mientras nadie tenga su cuenta, se entra solo con la contraseña compartida (lib/admin/auth.js).
import { useRouter } from 'next/router'
import { useState } from 'react'
import { pedirJson } from '../../lib/reservas/navegador'
import Icono from '../../components/admin/ui/Icono'
import MarcaEntrada, { CampoClave } from '../../components/admin/MarcaEntrada'
import { hayCuentas } from '../../lib/admin/auth'

export default function Login({ cuentas }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [olvido, setOlvido] = useState(false)
  const [aviso, setAviso] = useState(null)

  async function entrar(e) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await pedirJson('/api/admin/login', { method: 'POST', body: cuentas ? { email, contrasena } : { contrasena } })
      const volver = typeof router.query.volver === 'string' && router.query.volver.startsWith('/admin') ? router.query.volver : '/admin'
      router.replace(volver)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  async function pedirEnlace(e) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const r = await pedirJson('/api/admin/clave/olvidada', { method: 'POST', body: { email } })
      setAviso(r.mensaje)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  function cambiar(a) {
    setOlvido(a)
    setError(null)
    setAviso(null)
  }

  const nota = (
    <p className="adm-entrada__nota">
      <Icono nombre="info" />
      <span>{cuentas ? 'Si aún no tienes acceso, pídeselo a Carlos.' : 'Si no recuerdas la contraseña, pídele a Carlos que te ponga una nueva.'}</span>
    </p>
  )

  return (
    <MarcaEntrada titulo="Entrar · AR Studio">
      {olvido ? (
        <form className="adm-entrada__form" onSubmit={pedirEnlace} noValidate>
          <h1>¿Has olvidado la contraseña?</h1>
          <p className="adm-entrada__sub">Escribe tu correo y te mandamos un enlace para poner otra.</p>
          {aviso ? (
            <p className="adm-entrada__bien" role="status">{aviso}</p>
          ) : (
            <>
              <label htmlFor="email">Correo</label>
              <div className="adm-entrada__campo">
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" inputMode="email" />
              </div>
              {error && <p className="adm-entrada__error" role="alert">{error}</p>}
              <button type="submit" className="adm-entrada__boton" disabled={enviando || !email}>{enviando ? 'Enviando…' : 'Mandarme un enlace'}</button>
            </>
          )}
          <p className="adm-entrada__enlaces">
            <button type="button" className="adm-entrada__textual" onClick={() => cambiar(false)}>Volver a entrar</button>
          </p>
        </form>
      ) : (
        <form className="adm-entrada__form" onSubmit={entrar} noValidate>
          <h1>Hola de nuevo</h1>
          <p className="adm-entrada__sub">{cuentas ? 'Entra con tu correo y tu contraseña.' : 'Escribe la contraseña para entrar.'}</p>

          {cuentas && (
            <>
              <label htmlFor="email">Correo</label>
              <div className="adm-entrada__campo">
                <input
                  id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" inputMode="email"
                  aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'entrada-error' : undefined}
                />
              </div>
            </>
          )}

          <label htmlFor="contrasena">Contraseña</label>
          <CampoClave
            id="contrasena" valor={contrasena} onCambio={setContrasena} autoFocus={!cuentas} autoComplete="current-password"
            invalido={Boolean(error)} describe={error ? 'entrada-error' : undefined}
          />

          {error && <p className="adm-entrada__error" id="entrada-error" role="alert">{error}</p>}

          <button type="submit" className="adm-entrada__boton" disabled={enviando || !contrasena || (cuentas && !email)}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          {cuentas && (
            <p className="adm-entrada__enlaces">
              <button type="button" className="adm-entrada__textual" onClick={() => cambiar(true)}>¿Has olvidado la contraseña?</button>
            </p>
          )}
          {nota}
        </form>
      )}
    </MarcaEntrada>
  )
}

export async function getServerSideProps({ res }) {
  res.setHeader('Cache-Control', 'no-store')
  let cuentas = false
  try {
    cuentas = await hayCuentas()
  } catch (e) {
    console.error('[panel] no se pudo saber si hay cuentas', e.message)
  }
  return { props: { cuentas } }
}
