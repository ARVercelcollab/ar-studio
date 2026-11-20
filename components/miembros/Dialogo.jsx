// Diálogo de confirmación del área de miembros: se cierra con Escape o tocando fuera,
// el foco se queda dentro mientras está abierto y vuelve al botón que lo abrió.
import { useEffect, useRef } from 'react'

export default function Dialogo({ abierto, titulo, onCerrar, children, acciones }) {
  const ref = useRef(null)
  const antes = useRef(null)
  // (en una ref: si el padre pasa una función nueva en cada render, no se vuelve a montar)
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    if (!abierto) return
    antes.current = document.activeElement
    const caja = ref.current
    const enfocables = () => [...caja.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled)
    // El primer botón suele ser el de «No»: más seguro
    const primero = caja.querySelector('[data-foco]') || enfocables()[0]
    primero?.focus()
    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cerrar.current()
      } else if (e.key === 'Tab') {
        const lista = enfocables()
        if (!lista.length) return
        const [a, z] = [lista[0], lista[lista.length - 1]]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', tecla)
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = scroll
      antes.current?.focus?.()
    }
  }, [abierto])

  if (!abierto) return null
  return (
    <div className="mbr-dialogo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="mbr-dialogo__caja" role="dialog" aria-modal="true" aria-labelledby="mbr-dialogo-titulo" ref={ref}>
        <h2 id="mbr-dialogo-titulo">{titulo}</h2>
        <div className="mbr-dialogo__cuerpo">{children}</div>
        {acciones && <div className="mbr-dialogo__acciones">{acciones}</div>}
      </div>
    </div>
  )
}
