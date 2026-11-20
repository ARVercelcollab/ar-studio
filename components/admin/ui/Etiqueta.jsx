// Etiquetas (píldoras) de estado: Pagada, Rechazada, Sin firmar, Miembro, Repite, AR-S-2026-001…
//   <Etiqueta tono="bien" punto>Pagada</Etiqueta>
//   <Etiqueta tono="borde">AR-S-2026-030</Etiqueta>
// tono: 'gris' (por defecto) | 'bien' | 'mal' | 'aviso' | 'marron' | 'borde' | 'info'

export default function Etiqueta({ tono = 'gris', punto = false, children, className = '', title }) {
  return (
    <span className={`ui-etiqueta ui-etiqueta--${tono}${className ? ` ${className}` : ''}`} title={title}>
      {punto && <i aria-hidden="true" />}
      {children}
    </span>
  )
}

// Punto de color de una categoría (en listas y leyendas)
export function Punto({ color }) {
  return <i className="ui-punto" style={{ background: color }} aria-hidden="true" />
}
