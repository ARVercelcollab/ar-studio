// Entrada al panel (como la de Gartalia): a la izquierda la foto del estudio con el logo y una frase;
// a la derecha, la contraseña. En el móvil, la foto queda arriba como una franja.
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { pedirJson } from '../../lib/reservas/navegador'
import Logo from '../../components/admin/ui/Logo'
import Icono from '../../components/admin/ui/Icono'

export default function Login() {
  const router = useRouter()
  const [contrasena, setContrasena] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await pedirJson('/api/admin/login', { method: 'POST', body: { contrasena } })
      const volver = typeof router.query.volver === 'string' && router.query.volver.startsWith('/admin') ? router.query.volver : '/admin'
      router.replace(volver)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <div className="adm adm-entrada">
      <Head>
        <title>Entrar · AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#3a2b1f" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <section className="adm-entrada__marca" aria-label="AR Studio">
        <Logo ancho={176} className="adm-entrada__logo" />
        <div className="adm-entrada__lema">
          <p className="adm-entrada__titulo">Todo el estudio,<br />en orden.</p>
          <p className="adm-entrada__texto">Reservas, miembros y cuentas. Quién viene, qué entra y qué sale, en un solo sitio.</p>
        </div>
        <p className="adm-entrada__pie">Estudio de fotografía con luz natural · València</p>
      </section>

      <main className="adm-entrada__lado">
        <form className="adm-entrada__form" onSubmit={entrar} noValidate>
          <h1>Hola de nuevo</h1>
          <p className="adm-entrada__sub">Escribe la contraseña para entrar.</p>

          <label htmlFor="contrasena">Contraseña</label>
          <div className="adm-entrada__campo">
            <input
              id="contrasena" type={ver ? 'text' : 'password'} value={contrasena}
              onChange={(e) => setContrasena(e.target.value)} autoFocus autoComplete="current-password"
              aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'entrada-error' : undefined}
            />
            <button type="button" className="adm-entrada__ver" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar la contraseña' : 'Ver la contraseña'} aria-pressed={ver}>
              {ver ? 'Ocultar' : 'Ver'}
            </button>
          </div>

          {error && <p className="adm-entrada__error" id="entrada-error" role="alert">{error}</p>}

          <button type="submit" className="adm-entrada__boton" disabled={enviando || !contrasena}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="adm-entrada__nota">
            <Icono nombre="info" />
            <span>Si no recuerdas la contraseña, pídele a Carlos que te ponga una nueva.</span>
          </p>
        </form>
      </main>
    </div>
  )
}
