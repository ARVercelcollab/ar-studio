import Image from 'next/image'
import { useState } from 'react'

// Tarjeta de vídeo de YouTube con "fachada": muestra solo la miniatura y, al pulsar,
// carga el reproductor y arranca. Así la página no arrastra el JavaScript de YouTube
// hasta que alguien quiere ver el vídeo.
export default function YoutubeCard({ id, titulo, autor, inicio = 0 }) {
  const [activo, setActivo] = useState(false)

  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&start=${inicio}`

  return (
    <figure className="youtube__card">
      <div className="youtube__marco">
        {activo ? (
          <iframe
            src={src}
            title={titulo}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button className="youtube__play" onClick={() => setActivo(true)} aria-label={`Reproducir: ${titulo}`}>
            <Image
              src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
              alt={titulo}
              width={640}
              height={360}
              sizes="(max-width: 700px) 84vw, 420px"
              loading="lazy"
            />
            <span className="youtube__boton" aria-hidden="true">
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                <path d="M1 1.5v17l16-8.5L1 1.5z" fill="currentColor" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <figcaption>
        <span className="youtube__titulo">{titulo}</span>
        <span className="youtube__autor">{autor}</span>
      </figcaption>
    </figure>
  )
}
