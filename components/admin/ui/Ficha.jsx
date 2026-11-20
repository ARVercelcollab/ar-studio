// Ficha lateral: panel que entra por la derecha (en el móvil ocupa toda la pantalla).
// Se cierra con Escape, con la × o tocando fuera; el foco se queda dentro mientras está abierta
// y vuelve a donde estaba al cerrarla.
//   <Ficha abierta={!!sel} titulo="Laura Ribera Vidal" sub="Cliente desde agosto 2025 · 11 reservas" onCerrar={() => setSel(null)}>
//     <FichaBloque titulo="Datos">…</FichaBloque>
//     <FichaAcciones><Boton …/></FichaAcciones>
//   </Ficha>
import { useEffect, useId, useRef } from 'react'
import Icono from './Icono'

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Ficha({ abierta, titulo, sub, onCerrar, ancho = 470, children }) {
  const caja = useRef(null)
  const antes = useRef(null)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar
  const idTitulo = useId()

  useEffect(() => {
    if (!abierta) return undefined
    antes.current = document.activeElement
    document.documentElement.classList.add('adm-con-capa')
    const primero = caja.current?.querySelector(ENFOCABLES)
    ;(primero || caja.current)?.focus()
    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (cerrar.current) cerrar.current()
        return
      }
      if (e.key !== 'Tab' || !caja.current) return
      const f = [...caja.current.querySelectorAll(ENFOCABLES)].filter((el) => el.offsetParent !== null)
      if (!f.length) return
      const [a, z] = [f[0], f[f.length - 1]]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.documentElement.classList.remove('adm-con-capa')
      if (antes.current && antes.current.isConnected && antes.current.focus) antes.current.focus()
    }
    // Solo al abrir y al cerrar: si dependiera de onCerrar, cada vez que la página se vuelve a
    // pintar (al escribir en un campo de la ficha) el foco saltaría al primer botón
  }, [abierta])

  if (!abierta) return null
  return (
    <>
      <div className="ui-capa-fondo" onClick={onCerrar} aria-hidden="true" />
      <aside ref={caja} className="ui-ficha" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1} style={{ '--ancho-ficha': `${ancho}px` }}>
        <header className="ui-ficha__cab">
          <div>
            <h2 id={idTitulo}>{titulo}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="ui-boton-icono" onClick={onCerrar} aria-label="Cerrar"><Icono nombre="x" /></button>
        </header>
        <div className="ui-ficha__cuerpo">{children}</div>
      </aside>
    </>
  )
}

// Bloque dentro de la ficha, separado por una línea
export function FichaBloque({ titulo, children }) {
  return (
    <section className="ui-ficha__bloque">
      {titulo && <h3>{titulo}</h3>}
      {children}
    </section>
  )
}

// Fila de botones al pie de un bloque
export function FichaAcciones({ children }) {
  return <div className="ui-ficha__acciones">{children}</div>
}

// Lista de datos «Correo · laura@…» en dos columnas
//   <Datos filas={[['Correo', r.email], ['WhatsApp', r.telefono]]} />
export function Datos({ filas }) {
  return (
    <dl className="ui-datos">
      {filas.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  )
}
