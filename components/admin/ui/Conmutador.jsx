// Conmutador de vistas («Calendario | Lista | Clientes», «Lista | Tablero», «6 meses | Año»).
// Con href en cada opción son enlaces (la elegida lleva aria-current); sin href, botones con onCambio.
//   <Conmutador etiqueta="Vista" valor="calendario" opciones={[
//     { valor: 'calendario', texto: 'Calendario', icono: 'cal', href: '/admin/reservas' },
//     { valor: 'lista', texto: 'Lista', icono: 'lista', href: '/admin/reservas/lista' },
//   ]} />
//   <Conmutador valor={rango} onCambio={setRango} opciones={[{ valor: '6', texto: '6 meses' }, { valor: 'anio', texto: 'Año 2026' }]} />
import Link from 'next/link'
import Icono from './Icono'

export default function Conmutador({ opciones, valor, onCambio, etiqueta = 'Vista', className = '' }) {
  return (
    <div className={`ui-conmutador${className ? ` ${className}` : ''}`} role="group" aria-label={etiqueta}>
      {opciones.map((o) => {
        const elegida = o.valor === valor
        const contenido = <>{o.icono && <Icono nombre={o.icono} />}{o.texto}</>
        if (o.href) {
          return <Link key={o.valor} href={o.href} scroll={false} aria-current={elegida ? 'page' : undefined}>{contenido}</Link>
        }
        return <button key={o.valor} type="button" aria-pressed={elegida} onClick={() => onCambio && onCambio(o.valor)}>{contenido}</button>
      })}
    </div>
  )
}

// Selector con flechas (‹ Noviembre 2026 ›, ‹ 16 nov – 22 nov ›, ‹ 4.º trimestre ›).
// anterior/siguiente: href o función; null = flecha desactivada.
//   <SelectorFlechas texto="Noviembre 2026" anterior="/admin?p=2026-10" siguiente={null} etiqueta="Mes" />
export function SelectorFlechas({ texto, sub, anterior, siguiente, etiqueta = 'Periodo' }) {
  const flecha = (destino, dir) => {
    const nombre = dir === 'izq' ? `${etiqueta} anterior` : `${etiqueta} siguiente`
    if (!destino) return <button type="button" disabled aria-label={nombre}><Icono nombre={dir} /></button>
    if (typeof destino === 'function') return <button type="button" onClick={destino} aria-label={nombre}><Icono nombre={dir} /></button>
    return <Link href={destino} scroll={false} aria-label={nombre}><Icono nombre={dir} /></Link>
  }
  return (
    <div className="ui-selector" role="group" aria-label={etiqueta}>
      {flecha(anterior, 'izq')}
      <span>{texto}{sub && <small>{sub}</small>}</span>
      {flecha(siguiente, 'der')}
    </div>
  )
}
