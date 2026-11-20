// Formularios «Cobro de cuota» y «Bloqueo» de Añadir (las mismas rutas que la ficha del miembro
// y que Ajustes › Bloqueos)
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { Boton, Vacio } from '../ui'
import { METODOS_CUOTA } from '../../../lib/reservas/config'
import { pedirJson } from '../../../lib/reservas/navegador'
import { euros } from '../../../lib/admin/interprete'

const ESTADO_COBRO = { rechazado: 'cobro rechazado', agotado: 'cobro rechazado (sin más intentos)', revisar: 'cobro por revisar', cobrando: 'cobrando ahora' }
const dma = (f) => f.split('-').reverse().join('/')

export function FormCuota({ cuotas, hoy, facturas, inicial = {}, onAnadido }) {
  const router = useRouter()
  const pedida = inicial.cuotaId != null ? String(inicial.cuotaId) : ''
  const [f, setF] = useState({
    cuotaId: cuotas.some((c) => String(c.id) === pedida) ? pedida : cuotas.length === 1 ? String(cuotas[0].id) : '',
    metodo: inicial.metodo || 'transferencia',
    fecha: inicial.fecha && inicial.fecha <= hoy ? inicial.fecha : hoy,
    referencia: '',
    emitirFactura: facturas,
  })
  const [estado, setEstado] = useState({ enviando: false, error: null, ok: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const c = cuotas.find((x) => String(x.id) === f.cuotaId)

  if (!cuotas.length) return <Vacio icono="ok" tono="bien" texto="No hay cuotas pendientes de cobrar." />

  async function guardar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: null, ok: null })
    const ref = f.referencia.trim()
    try {
      const r = await pedirJson(`/api/admin/cuotas/${c.id}`, {
        method: 'POST',
        body: { accion: 'pagada', metodo: f.metodo, fecha: f.fecha, emitirFactura: f.emitirFactura && c.importeCent > 0, ...(/^https?:\/\//.test(ref) ? { enlace: ref } : ref ? { referencia: ref } : {}) },
      })
      onAnadido?.({ texto: `Cuota de ${c.nombre} · mes ${c.periodo} · pagada`, enlace: `/admin/miembros/${c.susId}` })
      setEstado({ enviando: false, error: null, ok: r?.mensaje || 'Cuota marcada como pagada.' })
      setF((x) => ({ ...x, cuotaId: '', referencia: '' }))
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (err) {
      setEstado({ enviando: false, error: err.message, ok: null })
    }
  }

  return (
    <form onSubmit={guardar}>
      <div className="adm-form">
        <label className="adm-ancho">Qué cuota
          <select required value={f.cuotaId} onChange={(e) => poner('cuotaId', e.target.value)}>
            <option value="">Elige la cuota…</option>
            {cuotas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre} · mes {x.periodo} (desde el {dma(x.desde)}) · {euros(x.importeCent)}{x.cobroEstado ? ` · ${ESTADO_COBRO[x.cobroEstado] || x.cobroEstado}` : x.desde > hoy ? ' · aún no ha empezado' : ''}
              </option>
            ))}
          </select>
        </label>
        {c && (
          <p className="adm-ancho adm-nota">
            {c.plan ? `Plan ${c.plan} · ` : ''}<Link href={`/admin/miembros/${c.susId}`} className="adm-enlace">Ver su ficha</Link>
            {(c.cobroEstado === 'cobrando' || c.cobroEstado === 'revisar') && ' · Tiene un cobro con tarjeta sin resolver: compruébalo en el portal del TPV antes de marcarla pagada.'}
          </p>
        )}
        <label>Cómo ha pagado
          <select value={f.metodo} onChange={(e) => setF((x) => ({ ...x, metodo: e.target.value, emitirFactura: e.target.value === 'stripe' ? false : x.emitirFactura }))}>
            {METODOS_CUOTA.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select>
        </label>
        <label>Cuándo<input type="date" required max={hoy} value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
        <label className="adm-ancho">Referencia o enlace (opcional)<input value={f.referencia} onChange={(e) => poner('referencia', e.target.value)} placeholder="Concepto, n.º de cobro, o el enlace al recibo de Stripe" /></label>
        {facturas ? (
          <label className="adm-check adm-ancho">
            <input type="checkbox" checked={f.emitirFactura} onChange={(e) => poner('emitirFactura', e.target.checked)} /> Emitir y enviarle la factura{c?.conDatos === false ? ' simplificada (no ha dado sus datos de facturación)' : ''}{f.metodo === 'stripe' ? ' (si Stripe ya se la manda, déjalo sin marcar)' : ''}
          </label>
        ) : (
          <p className="adm-ancho adm-nota">Para emitir facturas faltan los datos de quien factura en Vercel.</p>
        )}
      </div>
      {estado.ok && <p className="adm-mensaje" role="status">{estado.ok}</p>}
      {estado.error && <p className="adm-mensaje is-error" role="alert">{estado.error}</p>}
      <div className="adm-anadir__guardar"><Boton type="submit" icono="check" disabled={estado.enviando || !c}>{estado.enviando ? 'Guardando…' : 'Marcar pagada'}</Boton></div>
    </form>
  )
}

export function FormBloqueo({ inicial = {}, onAnadido }) {
  const vacio = { fecha: '', fechaFin: '', desde: '09:00', hasta: '22:00', motivo: '' }
  const [f, setF] = useState(() => ({ ...vacio, ...Object.fromEntries(Object.entries(inicial).filter(([k, v]) => k in vacio && v)) }))
  const [estado, setEstado] = useState({ enviando: false, error: null, ok: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function guardar(e) {
    e.preventDefault()
    setEstado({ enviando: true, error: null, ok: null })
    try {
      await pedirJson('/api/admin/bloqueos', { method: 'POST', body: { accion: 'crear', ...f } })
      onAnadido?.({ texto: `Bloqueo · ${dma(f.fecha)}${f.fechaFin ? ` al ${dma(f.fechaFin)}` : ''}, ${f.desde}–${f.hasta}`, enlace: '/admin/ajustes/bloqueos' })
      setEstado({ enviando: false, error: null, ok: 'Horas bloqueadas: nadie puede reservar en ese hueco.' })
      setF(vacio)
    } catch (err) {
      setEstado({ enviando: false, error: err.message, ok: null })
    }
  }

  return (
    <form onSubmit={guardar}>
      <div className="adm-form">
        <label>Día<input type="date" required value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></label>
        <label>Hasta el día (si son varios)<input type="date" value={f.fechaFin} min={f.fecha || undefined} onChange={(e) => poner('fechaFin', e.target.value)} /></label>
        <label>Desde<input type="time" step="1800" required value={f.desde} onChange={(e) => poner('desde', e.target.value)} /></label>
        <label>Hasta<input type="time" step="1800" required value={f.hasta} onChange={(e) => poner('hasta', e.target.value)} /></label>
        <label className="adm-ancho">Motivo (solo lo veis vosotros)<input value={f.motivo} onChange={(e) => poner('motivo', e.target.value)} placeholder="Grabación de Ari, vacaciones…" /></label>
      </div>
      {estado.ok && <p className="adm-mensaje" role="status">{estado.ok} <Link href="/admin/ajustes/bloqueos" className="adm-enlace">Ver los bloqueos</Link></p>}
      {estado.error && <p className="adm-mensaje is-error" role="alert">{estado.error}</p>}
      <div className="adm-anadir__guardar"><Boton type="submit" icono="candado" disabled={estado.enviando}>{estado.enviando ? 'Guardando…' : 'Bloquear'}</Boton></div>
    </form>
  )
}
