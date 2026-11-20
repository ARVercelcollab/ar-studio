// Botones del panel. Principal: marrón con texto blanco. Secundario: blanco con borde.
//   <Boton href="/admin/anadir" icono="mas">Añadir</Boton>
//   <Boton variante="secundario" onClick={…}>Exportar CSV</Boton>
//   <BotonIcono icono="x" etiqueta="Cerrar" onClick={…} />
import Link from 'next/link'
import Icono from './Icono'

function clases(variante, tam, className) {
  return ['ui-boton', `ui-boton--${variante}`, tam === 'peq' ? 'ui-boton--peq' : '', className].filter(Boolean).join(' ')
}

// variante: 'primario' | 'secundario' | 'texto' | 'peligro' · tam: 'normal' | 'peq'
// href: si se pasa, es un enlace (externo si empieza por http o lleva externo); si no, un <button>
export default function Boton({ variante = 'primario', tam = 'normal', href, externo = false, icono, iconoDerecha, children, className = '', type = 'button', ...resto }) {
  const contenido = (
    <>
      {icono && <Icono nombre={icono} />}
      {children}
      {iconoDerecha && <Icono nombre={iconoDerecha} />}
    </>
  )
  if (href) {
    if (externo || /^https?:|^mailto:|^tel:/.test(href)) {
      return <a href={href} className={clases(variante, tam, className)} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...resto}>{contenido}</a>
    }
    return <Link href={href} className={clases(variante, tam, className)} {...resto}>{contenido}</Link>
  }
  return <button type={type} className={clases(variante, tam, className)} {...resto}>{contenido}</button>
}

// Botón cuadrado solo con icono. etiqueta es obligatoria (la leen los lectores de pantalla)
export function BotonIcono({ icono, etiqueta, href, externo = false, className = '', ...resto }) {
  const cl = `ui-boton-icono${className ? ` ${className}` : ''}`
  if (href) {
    const ext = externo || /^https?:/.test(href)
    return <a href={href} className={cl} aria-label={etiqueta} title={etiqueta} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...resto}><Icono nombre={icono} /></a>
  }
  return <button type="button" className={cl} aria-label={etiqueta} title={etiqueta} {...resto}><Icono nombre={icono} /></button>
}

// Enlace con flecha («Ver todos ›»)
export function EnlaceFlecha({ href, children, className = '' }) {
  return <Link href={href} className={`ui-enlace-flecha${className ? ` ${className}` : ''}`}>{children}<Icono nombre="der" /></Link>
}
