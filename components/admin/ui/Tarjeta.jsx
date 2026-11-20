// Tarjeta blanca con borde fino. Cabecera opcional (título, nota y acciones) y pie opcional.
//   <Tarjeta titulo="Ingresos y gastos por mes" nota="Sin IVA" acciones={<Conmutador …/>} pie={<EnlaceFlecha …/>}>…</Tarjeta>
//   <Tarjeta tabla> … una <table className="ui-tabla"> sin márgenes … </Tarjeta>
//   <Tarjeta tono="aviso"> … borde ámbar (lo que pide atención) </Tarjeta>

export default function Tarjeta({ titulo, nota, acciones, pie, tabla = false, tono, as: Etiqueta = 'section', className = '', children, ...resto }) {
  const cl = ['ui-tarjeta', tabla ? 'ui-tarjeta--tabla' : '', tono ? `ui-tarjeta--${tono}` : '', className].filter(Boolean).join(' ')
  const conCabecera = titulo || nota || acciones
  return (
    <Etiqueta className={cl} {...resto}>
      {conCabecera && (
        <div className={`ui-tarjeta__cab${tabla ? ' ui-tarjeta__cab--tabla' : ''}`}>
          <div>
            {titulo && <h2>{titulo}</h2>}
            {nota && <p className="ui-tarjeta__nota">{nota}</p>}
          </div>
          {acciones && <div className="ui-tarjeta__acciones">{acciones}</div>}
        </div>
      )}
      {children}
      {pie && <div className="ui-tarjeta__pie">{pie}</div>}
    </Etiqueta>
  )
}

// Rejilla de tarjetas: columnas 2 | 3 | 4 (en el móvil, una; la de 4 pasa por 2)
// columnas="cifras": las cifras del mes (dos por fila en el móvil, cuatro en ordenador)
export function Rejilla({ columnas = 2, className = '', children }) {
  return <div className={`ui-rejilla ui-rejilla--${columnas}${className ? ` ${className}` : ''}`}>{children}</div>
}

// Título de un bloque dentro de la página («Pendiente ahora», con algo a la derecha)
export function Seccion({ titulo, derecha, children }) {
  return (
    <>
      <div className="ui-seccion">
        <h2>{titulo}</h2>
        {derecha && <div className="ui-seccion__derecha">{derecha}</div>}
      </div>
      {children}
    </>
  )
}
