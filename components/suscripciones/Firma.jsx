// Recuadro para firmar con el dedo o el ratón. Devuelve la firma como PNG (data URL)
// con onCambio(dataUrl | null).
import { useEffect, useRef, useState } from 'react'

export default function Firma({ onCambio, error }) {
  const lienzo = useRef(null)
  const dibujando = useRef(false)
  const ultimo = useRef(null)
  const trazos = useRef(0)
  const [vacia, setVacia] = useState(true)

  // Tamaño real en píxeles (pantallas de alta densidad) y trazo marrón
  useEffect(() => {
    const c = lienzo.current
    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const escala = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      c.width = Math.round(r.width * escala)
      c.height = Math.round(r.height * escala)
      const ctx = c.getContext('2d')
      ctx.scale(escala, escala)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#2b211a'
      trazos.current = 0
      setVacia(true)
      onCambio(null)
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const punto = (e) => {
    const r = lienzo.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const empezar = (e) => {
    e.preventDefault()
    lienzo.current.setPointerCapture?.(e.pointerId)
    dibujando.current = true
    ultimo.current = punto(e)
    const ctx = lienzo.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(ultimo.current.x, ultimo.current.y, 1, 0, Math.PI * 2)
    ctx.fillStyle = '#2b211a'
    ctx.fill()
  }
  const mover = (e) => {
    if (!dibujando.current) return
    e.preventDefault()
    const p = punto(e)
    const ctx = lienzo.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(ultimo.current.x, ultimo.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    // Se cuenta lo que se ha dibujado (en píxeles) para no dar por buena una firma vacía
    trazos.current += Math.hypot(p.x - ultimo.current.x, p.y - ultimo.current.y)
    ultimo.current = p
  }
  const terminar = () => {
    if (!dibujando.current) return
    dibujando.current = false
    if (trazos.current > 40) {
      setVacia(false)
      onCambio(lienzo.current.toDataURL('image/png'))
    }
  }
  const borrar = () => {
    const c = lienzo.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    trazos.current = 0
    setVacia(true)
    onCambio(null)
  }

  return (
    <div className={`rsv-firma${error ? ' is-error' : ''}`}>
      <canvas
        ref={lienzo}
        className="rsv-firma__lienzo"
        aria-label="Recuadro para firmar"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
      />
      <div className="rsv-firma__pie">
        <span>{vacia ? 'Firma aquí con el dedo o el ratón' : 'Firma lista'}</span>
        <button type="button" className="rsv-enlace" onClick={borrar}>Borrar</button>
      </div>
      {error && <span className="rsv__error">{error}</span>}
    </div>
  )
}
