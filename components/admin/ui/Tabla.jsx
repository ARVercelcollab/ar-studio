// Tabla del panel: cabecera gris cálido, filas que se pueden tocar y pie de totales.
// En el móvil (clase lista) cada fila pasa a ser una tarjeta: marca las celdas con
//   m-principal (lo primero), m-derecha (importe arriba a la derecha), m-fecha (fecha pequeña encima),
//   m-fila (en línea debajo) o m-oculto (no sale en el móvil).
//   <Tabla lista columnas={[{ texto: 'Fecha' }, { texto: 'Concepto' }, { texto: 'Importe', der: true }]}
//          pie={<tr><th scope="row" colSpan={2}>Total</th><td className="der">…</td></tr>}>
//     <tr className="ui-fila" onClick={…}>…</tr>
//   </Tabla>

export default function Tabla({ columnas, children, pie, lista = false, titulo, className = '' }) {
  const cl = ['ui-tabla', lista ? 'ui-tabla--lista' : '', className].filter(Boolean).join(' ')
  return (
    <div className="ui-tabla-caja">
      <table className={cl}>
        {titulo && <caption className="ui-solo-lector">{titulo}</caption>}
        {columnas && (
          <thead>
            <tr>{columnas.map((c, i) => <th key={c.clave || c.texto || i} scope="col" className={c.der ? 'der' : undefined}>{c.texto}</th>)}</tr>
          </thead>
        )}
        <tbody>{children}</tbody>
        {pie && <tfoot>{pie}</tfoot>}
      </table>
    </div>
  )
}

// Texto principal y secundario dentro de una celda
export function Celda({ principal, sub }) {
  return (
    <>
      <span className="ui-tabla__principal">{principal}</span>
      {sub && <span className="ui-tabla__sub">{sub}</span>}
    </>
  )
}
