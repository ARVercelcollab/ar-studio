// Estado vacío («No hay reservas en esta vista»), con icono y una acción opcional.
//   <Vacio texto="Todavía no hay clientes." accion={<Boton href="/admin/anadir">Añadir reserva</Boton>} />
//   <Vacio icono="ok" tono="bien" texto="Nada pendiente." compacto />
import Icono from './Icono'

export default function Vacio({ texto, icono = 'info', tono, accion, compacto = false, children }) {
  return (
    <div className={`ui-vacio${compacto ? ' ui-vacio--compacto' : ''}${tono ? ` ui-vacio--${tono}` : ''}`}>
      {icono && <Icono nombre={icono} />}
      <div>
        <p>{texto}</p>
        {children}
        {accion && <div className="ui-vacio__accion">{accion}</div>}
      </div>
    </div>
  )
}

// Aviso en caja (ámbar «Es una cuenta orientativa», rojo «No puede usar el estudio», azul informativo)
//   <Aviso tono="aviso" titulo="Es una cuenta orientativa.">Sirve para saber cuánto apartar…</Aviso>
export function Aviso({ tono = 'aviso', titulo, children, className = '', icono: iconoPedido }) {
  const icono = iconoPedido || (tono === 'mal' ? 'aviso' : tono === 'info' ? 'info' : 'aviso')
  return (
    <div className={`ui-aviso ui-aviso--${tono}${className ? ` ${className}` : ''}`} role={tono === 'mal' ? 'alert' : undefined}>
      <Icono nombre={icono} />
      <p>{titulo && <strong>{titulo} </strong>}{children}</p>
    </div>
  )
}
