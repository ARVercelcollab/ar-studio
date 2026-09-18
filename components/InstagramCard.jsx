import Image from 'next/image'
import { urlPost } from '../lib/instagram'

// Tarjeta propia de una publicación de Instagram: miniatura en el estilo de la web,
// icono de play si es un reel y enlace a la publicación. No carga nada de Instagram.
export default function InstagramCard({ code, tipo, titulo, pos = 'center', onClick }) {
  return (
    <figure className="igcard">
      <a className="igcard__marco" href={urlPost(code)} target="_blank" rel="noopener noreferrer" onClick={onClick} aria-label={`${titulo} (abre en Instagram)`}>
        <Image
          src={`/media/ig/${code}.jpg`}
          alt={titulo}
          width={675}
          height={844}
          sizes="(max-width: 500px) 84vw, 330px"
          style={{ objectPosition: pos }}
          loading="lazy"
        />
        {tipo === 'reel' && (
          <span className="igcard__play" aria-hidden="true">
            <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
              <path d="M1 1.5v17l16-8.5L1 1.5z" fill="currentColor" />
            </svg>
          </span>
        )}
        <span className="igcard__icono" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
      </a>
      <figcaption>{titulo}</figcaption>
    </figure>
  )
}
