import { useEffect, useMemo, useRef, useState } from 'react'
import { urlPost } from '../lib/instagram'

// Carga embed.js de Instagram solo la primera vez que hace falta (al abrir una publicación)
let cargaEmbed = null
const cargarEmbed = () => {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.instgrm?.Embeds) return Promise.resolve()
  if (!cargaEmbed) {
    cargaEmbed = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://www.instagram.com/embed.js'
      s.async = true
      s.onload = resolve
      s.onerror = reject
      document.body.appendChild(s)
    })
  }
  return cargaEmbed
}

// A partir de aquí, además del aviso de carga, se ofrece el enlace a Instagram
const AVISO_LENTO = 6000

// Ventana sobre la página con el reproductor oficial de una publicación de Instagram.
// El blockquote se inyecta como HTML opaco (con identidad fija por publicación) para que
// React no lo reconcilie cuando embed.js lo sustituye por su iframe.
export default function InstagramModal({ code, onClose }) {
  const embedRef = useRef(null)
  // 'cargando' hasta que el iframe de Instagram toma su altura real ('lento' si tarda);
  // 'error' solo si embed.js no se puede cargar (bloqueadores, sin red)
  const [estado, setEstado] = useState('cargando')

  const html = useMemo(() => {
    const url = urlPost(code)
    return { __html: `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"><a href="${url}" target="_blank" rel="noopener noreferrer">Ver en Instagram</a></blockquote>` }
  }, [code])

  useEffect(() => {
    setEstado('cargando')
    let activo = true
    cargarEmbed().then(() => activo && window.instgrm?.Embeds?.process()).catch(() => activo && setEstado('error'))

    // Instagram ajusta la altura del iframe por mensajes; hasta entonces mide unos píxeles.
    // Puede tardar bastante, así que no se corta: solo se avisa y se ofrece el enlace.
    const inicio = Date.now()
    const sondeo = setInterval(() => {
      const iframe = embedRef.current?.querySelector('iframe')
      if (iframe && iframe.getBoundingClientRect().height > 200) {
        setEstado('listo')
        clearInterval(sondeo)
      } else if (Date.now() - inicio > AVISO_LENTO) {
        setEstado((e) => (e === 'cargando' ? 'lento' : e))
      }
    }, 250)

    return () => {
      activo = false
      clearInterval(sondeo)
    }
  }, [code])

  // Esc cierra; mientras está abierta, la página de detrás no hace scroll
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', tecla)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = anterior
    }
  }, [onClose])

  return (
    <div className="igmodal" onClick={onClose} role="dialog" aria-modal="true" aria-label="Publicación de Instagram">
      <button className="igmodal__cerrar" aria-label="Cerrar" onClick={onClose}>×</button>
      <div className={`igmodal__caja igmodal__caja--${estado}`} onClick={(e) => e.stopPropagation()}>
        <div ref={embedRef} dangerouslySetInnerHTML={html} />
        {estado !== 'listo' && (
          <div className="igmodal__aviso">
            {estado === 'error'
              ? <span>No se ha podido cargar aquí.</span>
              : <span>Cargando publicación…</span>}
            {estado !== 'cargando' && (
              <a href={urlPost(code)} target="_blank" rel="noopener noreferrer">Ver en Instagram →</a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
