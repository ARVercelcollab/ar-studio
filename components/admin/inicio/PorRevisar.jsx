// «Por revisar» del Inicio, como en AR Academy: un botón pequeño en la cabecera con lo que hay que
// mirar (cobros pendientes, miembros por resolver y avisos). Al pulsarlo se abre la lista y cada
// fila lleva a su ficha. Lo urgente va primero y pone el punto en rojo.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useEuros } from '../graficas'

export default function PorRevisar({ porCobrar, porResolver, avisos = [] }) {
  const e = useEuros()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (ev) => {
      if (caja.current && !caja.current.contains(ev.target)) setAbierto(false)
    }
    const tecla = (ev) => {
      if (ev.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  const filas = [
    ...(porCobrar?.items || []).map((x) => ({
      clave: x.clave, urgente: Boolean(x.impago), titulo: x.titulo, detalle: x.detalle, importe: e(x.importeCent), enlace: x.enlace,
    })),
    ...(porResolver?.items || []).map((x) => ({
      clave: x.clave, urgente: Boolean(x.urgente), titulo: x.titulo, detalle: x.detalle, enlace: x.enlace,
    })),
    ...avisos.map((a, i) => ({
      clave: `a${i}`, urgente: a.nivel === 'error', titulo: a.chip, detalle: a.texto, enlace: a.enlace || null,
    })),
  ].sort((a, b) => Number(b.urgente) - Number(a.urgente))

  const n = filas.length
  const urgentes = filas.filter((f) => f.urgente).length
  const tono = !n ? 'bien' : urgentes ? 'mal' : 'aviso'

  return (
    <div className="ini-revisar" ref={caja}>
      <button
        type="button" className="ini-revisar__boton" aria-expanded={abierto} aria-controls="ini-revisar-lista"
        onClick={() => setAbierto((v) => !v)} disabled={!n}
      >
        <span className={`ini-revisar__punto ini-revisar__punto--${tono}`} aria-hidden="true" />
        {n ? <span>Por revisar: <strong>{n === 1 ? '1 cosa' : `${n} cosas`}</strong></span> : <span>Nada por revisar</span>}
      </button>
      {abierto && n > 0 && (
        <div className="ini-revisar__panel" id="ini-revisar-lista">
          <ul>
            {filas.map((f) => {
              const dentro = (
                <>
                  <span className={`ini-revisar__punto ini-revisar__punto--${f.urgente ? 'mal' : 'aviso'}`} aria-hidden="true" />
                  <span className="ini-revisar__texto">
                    <b>{f.titulo}</b>
                    <span>{f.detalle}</span>
                  </span>
                  {f.importe ? <span className="ini-revisar__importe">{f.importe}</span> : <span />}
                </>
              )
              return (
                <li key={f.clave}>
                  {f.enlace ? <Link href={f.enlace} onClick={() => setAbierto(false)}>{dentro}</Link> : <div>{dentro}</div>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
