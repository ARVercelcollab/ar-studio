// Miembros · «Para hacer»: cuotas sin pagar, contratos sin firmar, fianzas fuera de plazo, cobros
// rechazados, horas que se van a perder, cobros de Stripe que hay que cancelar…
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { Tarjeta, Boton, Icono } from '../ui'
import { pedirJson } from '../../../lib/reservas/navegador'

export default function ParaHacer({ tareas }) {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: null, error: null })
  const [todas, setTodas] = useState(false)
  if (!tareas.length) return null
  // Las urgentes primero; si hay muchas, se enseñan cinco y el resto con «Ver todas»
  const ordenadas = [...tareas].sort((a, b) => Number(Boolean(b.urgente)) - Number(Boolean(a.urgente)))
  const visibles = todas ? ordenadas : ordenadas.slice(0, 5)
  async function cancelado(id) {
    setEstado({ enviando: id, error: null })
    try {
      await pedirJson(`/api/admin/suscripciones/${id}`, { method: 'POST', body: { accion: 'cobro_externo_cancelado' } })
      setEstado({ enviando: null, error: null })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setEstado({ enviando: null, error: e.message })
    }
  }
  return (
    <Tarjeta titulo="Para hacer" nota={`${tareas.length} ${tareas.length === 1 ? 'cosa' : 'cosas'} de miembros`} tono="aviso" className="mb-parahacer">
      <ul className="mb-parahacer__lista">
        {visibles.map((t, i) => (
          <li key={`${t.tipo}-${t.suscripcionId}-${i}`} className={t.urgente ? 'is-urgente' : ''}>
            {t.urgente && <Icono nombre="aviso" />}
            <span className="mb-parahacer__texto">{t.texto}</span>
            <span className="mb-parahacer__acciones">
              {t.tipo === 'cobro_externo' && (
                <Boton variante="secundario" tam="peq" disabled={estado.enviando === t.suscripcionId} onClick={() => cancelado(t.suscripcionId)}>Ya está cancelado</Boton>
              )}
              <Link href={`/admin/miembros/${t.suscripcionId}`} className="ui-enlace-flecha">Ver ficha<Icono nombre="der" /></Link>
            </span>
          </li>
        ))}
      </ul>
      {ordenadas.length > 5 && (
        <div className="mb-botones">
          <Boton variante="texto" tam="peq" onClick={() => setTodas(!todas)}>{todas ? 'Ver menos' : `Ver todas (${ordenadas.length})`}</Boton>
        </div>
      )}
      {estado.error && <p className="mb-mensaje is-error" role="alert">{estado.error}</p>}
    </Tarjeta>
  )
}
