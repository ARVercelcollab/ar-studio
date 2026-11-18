import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { pedirJson } from '../../lib/reservas/navegador'

export default function Login() {
  const router = useRouter()
  const [contrasena, setContrasena] = useState('')
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
    <div className="adm">
      <Head>
        <title>Entrar · Panel AR Studio</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="adm-login">
        <h1>Panel de AR Studio</h1>
        <form onSubmit={entrar}>
          <input type="password" placeholder="Contraseña" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoFocus autoComplete="current-password" />
          {error && <p className="adm-mensaje is-error">{error}</p>}
          <button type="submit" className="adm-boton" disabled={enviando || !contrasena}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}
