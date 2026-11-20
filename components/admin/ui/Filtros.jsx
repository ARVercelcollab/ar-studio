// Buscador, barra de filtros y chips (como Movimientos de Gartalia).
//   <Buscador valor={q} onCambio={setQ} placeholder="Buscar: Aquaservice, Laura, AR-W-2026-004…" />
//   <BarraFiltros columnas={5}>
//     <Campo etiqueta="Mes"><select className="ui-control" …>…</select></Campo>
//   </BarraFiltros>
//   <Chips>{activos.map((f) => <Chip key={f.clave} onQuitar={() => quitar(f.clave)}>{f.texto}</Chip>)}</Chips>
import { useId } from 'react'
import Icono from './Icono'

export function Buscador({ valor, onCambio, placeholder = 'Buscar', etiqueta = 'Buscar', className = '', ...resto }) {
  return (
    <div className={`ui-buscar${className ? ` ${className}` : ''}`}>
      <Icono nombre="buscar" />
      <input type="search" className="ui-control" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} aria-label={etiqueta} {...resto} />
    </div>
  )
}

// columnas: cuántos filtros caben en una fila en ordenador (2–5); en el móvil van de dos en dos
export function BarraFiltros({ columnas = 5, className = '', children }) {
  return <div className={`ui-filtros${className ? ` ${className}` : ''}`} style={{ '--columnas': columnas }}>{children}</div>
}

// Campo con su etiqueta. El hijo (select, input) recibe el id solo si no lleva uno.
export function Campo({ etiqueta, ayuda, children, className = '' }) {
  const id = useId()
  const hijo = children && children.props && !children.props.id ? { ...children, props: { ...children.props, id } } : children
  return (
    <div className={`ui-campo${className ? ` ${className}` : ''}`}>
      <label htmlFor={hijo?.props?.id || id}>{etiqueta}</label>
      {hijo}
      {ayuda && <p className="ui-campo__ayuda">{ayuda}</p>}
    </div>
  )
}

export function Chips({ children, className = '' }) {
  return <div className={`ui-chips${className ? ` ${className}` : ''}`}>{children}</div>
}

// Chip de un filtro puesto; con onQuitar lleva la × para quitarlo
export function Chip({ children, onQuitar }) {
  if (!onQuitar) return <span className="ui-chip">{children}</span>
  return (
    <button type="button" className="ui-chip" onClick={onQuitar} aria-label={`Quitar el filtro ${typeof children === 'string' ? children : ''}`.trim()}>
      {children}<Icono nombre="x" />
    </button>
  )
}
