// Cifra grande con su comparación (las del Inicio: Ingresos, Gastos, Beneficio, Horas reservadas).
//   <Cifra nombre="Ingresos" valor="5.633 €" delta={{ texto: '2.643 € más que a estas alturas de octubre', tono: 'bien', direccion: 'sube' }} />
//   <Cifra nombre="Horas reservadas" valor="109 h" sufijo="· 42 % ocupado" href="/admin/reservas" />
// tono: 'bien' | 'mal' | 'neutro' (colorea la flecha y la cifra del delta) · direccion: 'sube' | 'baja' | null
// importe: si es true, la cifra se difumina con «Ocultar importes»
import Link from 'next/link'
import Icono from './Icono'

export default function Cifra({ nombre, valor, sufijo, delta, href, importe = false, destacada = false, className = '' }) {
  const cl = ['ui-cifra', destacada ? 'ui-cifra--destacada' : '', className].filter(Boolean).join(' ')
  const cuerpo = (
    <>
      <p className="ui-cifra__nombre">{nombre}</p>
      <p className="ui-cifra__valor">
        <span className={importe ? 'ui-imp' : ''}>{valor}</span>
        {sufijo && <small> {sufijo}</small>}
      </p>
      {delta && (
        <p className={`ui-cifra__delta ui-cifra__delta--${delta.tono || 'neutro'}`}>
          {delta.direccion && <Icono nombre={delta.direccion === 'baja' ? 'baja' : 'sube'} />}
          <span>{delta.texto}</span>
        </p>
      )}
    </>
  )
  if (href) return <Link href={href} className={cl}>{cuerpo}</Link>
  return <div className={cl}>{cuerpo}</div>
}

// Fila de totales (Movimientos 44 · Entra 6.815 € · Sale 1.044 € · Diferencia +5.770 €)
//   <Totales items={[{ nombre: 'Entra', valor: '6.815,38 €', tono: 'bien', importe: true }, …]} />
export function Totales({ items, className = '' }) {
  return (
    <div className={`ui-totales${className ? ` ${className}` : ''}`} style={{ '--n': items.length }}>
      {items.map((it) => (
        <div key={it.nombre}>
          <span>{it.nombre}</span>
          <b className={[it.tono === 'bien' ? 'ui-bien' : it.tono === 'mal' ? 'ui-mal' : '', it.importe ? 'ui-imp' : ''].filter(Boolean).join(' ')}>{it.valor}</b>
        </div>
      ))}
    </div>
  )
}
