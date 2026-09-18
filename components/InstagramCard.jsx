import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

// Tarjeta de un reel: portada en el estilo de la web y, al pulsar, el vídeo se reproduce
// ahí mismo (alojado en la web, sin cargar nada de Instagram). `activo` lo decide el padre
// para que solo suene un reel a la vez.
export default function InstagramCard({ code, titulo, activo, onActivar, onTerminar }) {
  const videoRef = useRef(null)
  // La portada se retira cuando el vídeo ya pinta fotogramas, así no hay un hueco negro al empezar
  const [reproduciendo, setReproduciendo] = useState(false)

  const reproducir = () => {
    onActivar(code)
    // play() dentro del propio clic: así iOS permite el sonido
    videoRef.current?.play().catch(() => {})
  }

  // Al dejar de ser el activo (otro reel empieza o este termina), vuelve a la portada
  useEffect(() => {
    if (activo) return
    const v = videoRef.current
    if (v) {
      v.pause()
      v.currentTime = 0
    }
    setReproduciendo(false)
  }, [activo])

  return (
    <figure className="igcard">
      <div className="igcard__marco">
        <video
          ref={videoRef}
          className={`igcard__video ${reproduciendo ? 'igcard__video--visible' : ''}`}
          src={`/media/ig/${code}.mp4`}
          playsInline
          preload="none"
          controls={activo}
          onPlaying={() => setReproduciendo(true)}
          onEnded={() => onTerminar(code)}
        />
        {!reproduciendo && (
          <button className="igcard__portada" onClick={reproducir} aria-label={`Reproducir: ${titulo}`}>
            <Image
              src={`/media/ig/${code}.jpg`}
              alt={titulo}
              width={675}
              height={1200}
              sizes="(max-width: 500px) 84vw, 300px"
              loading="lazy"
            />
            <span className="igcard__play" aria-hidden="true">
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                <path d="M1 1.5v17l16-8.5L1 1.5z" fill="currentColor" />
              </svg>
            </span>
            <span className="igcard__icono" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <figcaption>{titulo}</figcaption>
    </figure>
  )
}
