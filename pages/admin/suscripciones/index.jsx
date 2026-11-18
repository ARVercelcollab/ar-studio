// Suscripciones: quién está con plan, cuántas horas le quedan, cuotas y lo que hay que hacer
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel, { Chip, ChipCuota, BarraHoras } from '../../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { listarSuscripciones } from '../../../lib/suscripciones/servicio'
import { ESTADOS_SUSCRIPCION } from '../../../lib/suscripciones/reglas'
import { formatoEuros, textoDuracion } from '../../../lib/reservas/config'
import { textoFechaCorta } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'

const VISTAS = [
  ['activas', 'Activas'],
  ['sin_pagar', 'Sin pagar'],
  ['finalizadas', 'Finalizadas'],
]

const TIPO_ESTADO = { por_empezar: 'gris', activa: 'plan', baja_avisada: 'aviso', finalizada: 'gris' }

function Tareas({ tareas }) {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: null, error: null })
  if (!tareas.length) return null
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
    <div className="adm-caja">
      <h2>Para hacer</h2>
      <ul className="adm-tareas">
        {tareas.map((t, i) => (
          <li key={`${t.tipo}-${t.suscripcionId}-${i}`} className={t.urgente ? 'is-urgente' : ''}>
            <span>{t.texto}</span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {t.tipo === 'cobro_externo' && (
                <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando === t.suscripcionId} onClick={() => cancelado(t.suscripcionId)}>Ya está cancelado</button>
              )}
              <Link href={`/admin/suscripciones/${t.suscripcionId}`}>Ver ficha</Link>
            </span>
          </li>
        ))}
      </ul>
      {estado.error && <p className="adm-mensaje is-error">{estado.error}</p>}
    </div>
  )
}

export default function Suscripciones({ vista, filas, cifras, tareas, ok }) {
  return (
    <Panel titulo="Suscripciones" acciones={<Link href="/admin/suscripciones/nueva" className="adm-boton">+ Nueva suscripción</Link>}>
      {ok === 'borrada' && <p className="adm-mensaje">Suscripción borrada.</p>}
      <Tareas tareas={tareas} />

      <div className="adm-cifras">
        <div><span>Activas</span><strong>{cifras.activas}</strong></div>
        <div><span>Cuotas sin pagar</span><strong>{cifras.cuotasSinPagar.n}{cifras.cuotasSinPagar.n ? ` · ${formatoEuros(cifras.cuotasSinPagar.totalCent)}` : ''}</strong></div>
        <div><span>Horas que caducan (7 días)</span><strong>{textoDuracion(cifras.horasQueCaducan, { corto: true })}</strong></div>
        <div><span>Fianzas por resolver</span><strong>{cifras.fianzasPorResolver}</strong></div>
      </div>

      <div className="adm-filtros">
        {VISTAS.map(([v, t]) => (
          <Link key={v} href={`/admin/suscripciones?vista=${v}`} className={vista === v ? 'is-activo' : ''}>{t}</Link>
        ))}
      </div>

      {filas.length === 0 && (
        <div className="adm-caja">
          <p>{vista === 'activas' ? 'Todavía no hay nadie con suscripción. Da de alta la primera con «+ Nueva suscripción».' : vista === 'sin_pagar' ? 'No hay cuotas sin pagar.' : 'No hay suscripciones finalizadas.'}</p>
        </div>
      )}

      {filas.map((f) => (
        <div key={f.id} className="adm-sus">
          <div className="adm-sus__quien">
            <Link href={`/admin/suscripciones/${f.id}`}>{f.nombre}</Link>{' '}
            <Chip tipo="plan">{f.planNombre}</Chip>{' '}
            {f.enPrueba && <Chip tipo="aviso">En prueba</Chip>}{' '}
            {f.estado !== 'activa' && <Chip tipo={TIPO_ESTADO[f.estado]}>{ESTADOS_SUSCRIPCION[f.estado]}{f.estado === 'baja_avisada' && f.ultimoDia ? ` · último día ${textoFechaCorta(f.ultimoDia)}` : ''}</Chip>}
            <small>{f.codigo} · periodo {f.periodoTexto}{f.proximaSesion ? ` · próxima sesión ${f.proximaSesion}` : ''}</small>
          </div>
          <div className="adm-sus__horas">
            {f.estado === 'finalizada' ? <small>Terminó el {textoFechaCorta(f.ultimoDia, { anio: true })}</small> : <BarraHoras usadas={f.horas - f.restantes} total={f.horas} />}
          </div>
          <div>
            {f.debe && (vista === 'sin_pagar' || f.cuota?.chip !== f.debe.chip)
              ? <><ChipCuota chip={f.debe.chip} /><small>{f.debe.importe} desde el {textoFechaCorta(f.debe.desde)}{f.sinPagar > 1 ? ` · ${f.sinPagar} sin pagar` : ''}</small></>
              : f.cuota ? <><ChipCuota chip={f.cuota.chip} /><small>{f.cuota.importe}{f.sinPagar > 1 ? ` · ${f.sinPagar} sin pagar` : ''}</small></> : <small>—</small>}
          </div>
          <div className="adm-sus__botones">
            {f.estado !== 'finalizada' && <Link href={`/admin/nueva?suscripcion=${f.id}`} className="adm-boton">+ Sesión</Link>}
            <Link href={`/admin/suscripciones/${f.id}`} className="adm-boton adm-boton--claro">Ficha</Link>
          </div>
        </div>
      ))}
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const vista = VISTAS.some(([v]) => v === ctx.query.vista) ? ctx.query.vista : 'activas'
  const { filas, cifras, tareas } = await listarSuscripciones({ vista })
  return { props: { vista, filas, cifras, tareas, ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null } }
}
