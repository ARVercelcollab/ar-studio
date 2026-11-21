// Crear la contraseña del panel (invitación) o poner otra (recuperar): /admin/clave?t=…
// El código se quita de la barra de direcciones al cargar y solo se gasta al guardar (los
// antivirus del correo abren los enlaces). Al guardar, entra directamente en el panel.
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { pedirJson } from '../../lib/reservas/navegador'
import MarcaEntrada, { CampoClave } from '../../components/admin/MarcaEntrada'

const MINIMO = 10

export default function Clave() {
  const router = useRouter()
  const token = useRef(null)
  const [info, setInfo] = useState(null) // { tipo, nombre, email }
  const [malo, setMalo] = useState(null)
  const [clave, setClave] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!router.isReady || token.current !== null) return
    const t = typeof router.query.t === 'string' ? router.query.t : ''
    token.current = t
    // Fuera de la barra de direcciones (y del historial)
    window.history.replaceState(window.history.state, '', '/admin/clave')
    if (!t) {
      setMalo('Falta el código del enlace. Ábrelo otra vez desde el correo.')
      return
    }
    pedirJson('/api/admin/clave/ver', { method: 'POST', body: { token: t } })
      .then(setInfo)
      .catch((e) => setMalo(e.message))
  }, [router.isReady, router.query.t])

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (clave.length < MINIMO) return setError(`La contraseña tiene que tener al menos ${MINIMO} caracteres.`)
    if (clave !== repetida) return setError('Las dos contraseñas no coinciden.')
    setEnviando(true)
    try {
      await pedirJson('/api/admin/clave/guardar', { method: 'POST', body: { token: token.current, clave, repetida } })
      router.replace('/admin')
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  const nueva = info?.tipo === 'recuperar'
  return (
    <MarcaEntrada titulo={`${nueva ? 'Contraseña nueva' : 'Crea tu contraseña'} · AR Studio`}>
      <div className="adm-entrada__form">
        {malo ? (
          <>
            <h1>Este enlace ya no vale</h1>
            <p className="adm-entrada__sub">{malo}</p>
            <Link href="/admin/login" className="adm-entrada__boton adm-entrada__enlace-boton">Ir a la entrada</Link>
          </>
        ) : !info ? (
          <p className="adm-entrada__sub" aria-live="polite">Comprobando el enlace…</p>
        ) : (
          <form onSubmit={guardar} noValidate>
            <h1>{nueva ? 'Pon una contraseña nueva' : 'Crea tu contraseña'}</h1>
            <p className="adm-entrada__sub">
              Hola {info.nombre}. Elige una contraseña de al menos {MINIMO} caracteres para entrar con <b>{info.email}</b>.
            </p>

            <label htmlFor="clave">Contraseña nueva</label>
            <CampoClave id="clave" valor={clave} onCambio={setClave} autoComplete="new-password" autoFocus invalido={Boolean(error)} describe={error ? 'clave-error' : undefined} />

            <label htmlFor="repetida">Repítela</label>
            <CampoClave id="repetida" valor={repetida} onCambio={setRepetida} autoComplete="new-password" invalido={Boolean(error)} describe={error ? 'clave-error' : undefined} />

            {error && <p className="adm-entrada__error" id="clave-error" role="alert">{error}</p>}

            <button type="submit" className="adm-entrada__boton" disabled={enviando || !clave || !repetida}>
              {enviando ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>
        )}
      </div>
    </MarcaEntrada>
  )
}
