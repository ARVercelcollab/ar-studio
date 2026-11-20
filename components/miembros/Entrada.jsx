// Entrada al área de miembros: pedir el enlace por correo (sin contraseñas) y, desde el
// enlace del correo, entrar con un botón (así los programas que abren los enlaces del
// correo para revisarlos no lo gastan).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { pedirJson } from '../../lib/reservas/navegador'
import { WHATSAPP } from './formato'

function Marco({ children }) {
  return (
    <main className="mbr mbr--entrada">
      <div className="mbr-entrada">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mbr-entrada__logo" src="/assets/AR_Studio.svg" alt="AR Studio" width={180} height={23} />
        {children}
      </div>
    </main>
  )
}

const correoValido = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t.trim())

export default function Entrada({ aviso = null, cerrada = false }) {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState({ enviando: false, enviado: null, error: null })
  const pedir = async (e) => {
    e.preventDefault()
    if (estado.enviando) return
    if (!correoValido(email)) return setEstado({ enviando: false, enviado: null, error: 'Escribe tu correo completo, por ejemplo nombre@gmail.com.' })
    setEstado({ enviando: true, enviado: null, error: null })
    try {
      await pedirJson('/api/miembros/enlace', { method: 'POST', body: { email: email.trim() } })
      setEstado({ enviando: false, enviado: email.trim(), error: null })
    } catch (err) {
      setEstado({ enviando: false, enviado: null, error: err.message })
    }
  }

  if (cerrada) {
    return (
      <Marco>
        <h1>Área de miembros</h1>
        <p className="mbr-entrada__texto">El área de miembros abre muy pronto. Mientras tanto, para reservar o cambiar tus sesiones escríbenos por WhatsApp.</p>
        <a className="mbr-boton" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
        <p className="mbr-entrada__pie"><Link className="mbr-enlace" href="/planmensual">Ver los planes</Link></p>
      </Marco>
    )
  }

  if (estado.enviado) {
    return (
      <Marco>
        <h1>Revisa tu correo</h1>
        <p className="mbr-entrada__texto">
          Si <strong>{estado.enviado}</strong> es el correo de tu plan, te acabamos de mandar un enlace para entrar. Ábrelo en este mismo móvil u ordenador.
        </p>
        <p className="mbr-nota">Si en unos minutos no te llega, mira en la carpeta de spam o escríbenos por <a className="mbr-enlace" href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp</a>.</p>
        <button type="button" className="mbr-boton mbr-boton--claro" onClick={() => setEstado({ enviando: false, enviado: null, error: null })}>Probar con otro correo</button>
      </Marco>
    )
  }

  return (
    <Marco>
      <h1>Área de miembros</h1>
      <p className="mbr-entrada__texto">Escribe el correo con el que te diste de alta y te mandamos un enlace para entrar.</p>
      {aviso && <p className={`mbr-aviso mbr-aviso--${aviso.tono || 'aviso'}`} role="status">{aviso.texto}</p>}
      <form onSubmit={pedir} noValidate>
        <label className="mbr-campo">
          <span>Tu correo</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (estado.error) setEstado({ ...estado, error: null })
            }}
            aria-invalid={estado.error ? 'true' : undefined}
            aria-describedby={estado.error ? 'mbr-entrada-error' : undefined}
            required
          />
        </label>
        {estado.error && <p id="mbr-entrada-error" className="mbr-aviso mbr-aviso--mal" role="alert">{estado.error}</p>}
        <button type="submit" className="mbr-boton" disabled={estado.enviando}>{estado.enviando ? 'Mandando…' : 'Mandarme el enlace'}</button>
      </form>
      <p className="mbr-entrada__pie"><Link className="mbr-enlace" href="/planmensual">¿Aún no eres miembro? Mira los planes</Link></p>
    </Marco>
  )
}

// /miembros/entrar?t=…: un botón que gasta el enlace y abre la sesión
export function EntrarConEnlace({ token }) {
  const router = useRouter()
  const [estado, setEstado] = useState({ entrando: false, error: null })
  const entrar = async () => {
    setEstado({ entrando: true, error: null })
    try {
      await pedirJson('/api/miembros/entrar', { method: 'POST', body: { token } })
      router.replace('/miembros')
    } catch (e) {
      setEstado({ entrando: false, error: e.message || 'El enlace no es válido o ha caducado.' })
    }
  }
  if (!token) {
    return (
      <Marco>
        <h1>Falta el enlace</h1>
        <p className="mbr-entrada__texto">Abre el enlace tal cual te llegó al correo, o pide uno nuevo.</p>
        <Link className="mbr-boton" href="/miembros">Pedir un enlace</Link>
      </Marco>
    )
  }
  return (
    <Marco>
      <h1>Entrar en tu área</h1>
      {estado.error ? (
        <>
          <p className="mbr-aviso mbr-aviso--mal" role="alert">{estado.error}</p>
          <p className="mbr-entrada__texto">Los enlaces caducan al poco tiempo y solo sirven una vez. Pide otro y entra desde el correo nuevo.</p>
          <Link className="mbr-boton" href="/miembros">Pedir otro enlace</Link>
        </>
      ) : (
        <>
          <p className="mbr-entrada__texto">Pulsa el botón para entrar. Te quedarás dentro en este dispositivo durante 30 días.</p>
          <button type="button" className="mbr-boton" onClick={entrar} disabled={estado.entrando}>{estado.entrando ? 'Entrando…' : 'Entrar'}</button>
        </>
      )}
    </Marco>
  )
}
