// Marco de las pantallas de entrada del panel (entrar y crear contraseña), como la de Gartalia:
// a la izquierda la foto del estudio con el logo y la frase; a la derecha, el formulario.
// Estilos en styles/admin/_entrada.scss.
import Head from 'next/head'
import { useState } from 'react'
import Logo from './ui/Logo'

export default function MarcaEntrada({ titulo, children }) {
  return (
    <div className="adm adm-entrada">
      <Head>
        <title>{titulo}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#3a2b1f" />
        <meta name="referrer" content="no-referrer" />
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

      <main className="adm-entrada__lado">{children}</main>
    </div>
  )
}

// Campo de contraseña con «Ver» / «Ocultar»
export function CampoClave({ id, valor, onCambio, autoComplete = 'current-password', autoFocus = false, invalido = false, describe }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="adm-entrada__campo">
      <input
        id={id} type={ver ? 'text' : 'password'} value={valor} onChange={(e) => onCambio(e.target.value)}
        autoFocus={autoFocus} autoComplete={autoComplete}
        aria-invalid={invalido ? 'true' : undefined} aria-describedby={describe}
      />
      <button type="button" className="adm-entrada__ver" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar la contraseña' : 'Ver la contraseña'} aria-pressed={ver}>
        {ver ? 'Ocultar' : 'Ver'}
      </button>
    </div>
  )
}
