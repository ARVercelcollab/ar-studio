// Alta a mano de una suscripción (plan mensual). Las altas por la web llegan solas.
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../Panel'
import { Tarjeta, Boton, Aviso } from '../ui'
import CondicionesPlan, { formularioDePlan, distintasDelPlan } from '../CondicionesPlan'
import { PLANES, PLAN_COMUN, METODOS_CUOTA, formatoEuros, textoDuracion } from '../../../lib/reservas/config'
import { textoFechaCorta, esFecha } from '../../../lib/reservas/tiempo'
import { textoCondiciones, condicionesDePlan } from '../../../lib/suscripciones/reglas'
import { pedirJson } from '../../../lib/reservas/navegador'

const METODOS_A_MANO = METODOS_CUOTA.filter(([id]) => id !== 'stripe')

export default function NuevaSuscripcion({ hoy }) {
  const router = useRouter()
  const [f, setF] = useState({
    plan: 'starter', nombre: '', apellidos: '', email: '', telefono: '',
    fechaInicio: hoy, mesPrueba: false, metodoHabitual: 'transferencia', cobroExternoRef: '',
    primeraPagada: false, primeraMetodo: 'transferencia', primeraFecha: hoy, primeraReferencia: '',
    fianzaEstado: 'pendiente', fianzaImporte: String(PLAN_COMUN.fianzaCent / 100), fianzaMetodo: 'transferencia', fianzaFecha: hoy,
    quiereFactura: false, factura: { nombre: '', nif: '', direccion: '' }, contratoUrl: '', notasInternas: '',
  })
  const [cond, setCond] = useState(formularioDePlan('starter'))
  const [estado, setEstado] = useState({ enviando: false, error: null, avisos: null })
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const elegirPlan = (plan) => {
    poner('plan', plan)
    setCond(formularioDePlan(plan))
  }
  const cambiadas = distintasDelPlan(cond, f.plan)

  async function guardar(confirmado = false) {
    setEstado({ enviando: true, error: null, avisos: null })
    try {
      const { id } = await pedirJson('/api/admin/suscripciones/nueva', {
        method: 'POST',
        body: {
          ...f,
          primeraMetodo: f.metodoHabitual === 'stripe' ? 'stripe' : f.primeraMetodo,
          // «Referencia o enlace»: una dirección https va como enlace (justificante)
          ...(/^https:\/\//i.test(f.primeraReferencia.trim()) ? { primeraEnlace: f.primeraReferencia.trim(), primeraReferencia: '' } : {}),
          condiciones: cond,
          confirmado,
        },
      })
      router.push(`/admin/miembros/${id}?ok=alta`)
    } catch (e) {
      if (e.estado === 409 && e.datos?.avisos?.length) setEstado({ enviando: false, error: null, avisos: e.datos.avisos })
      else setEstado({ enviando: false, error: e.message, avisos: null })
    }
  }

  const cuotaCent = Math.round(Number(String(cond.cuota).replace(',', '.')) * 100) || 0
  return (
    <Panel
      titulo="Nueva suscripción"
      sub="Alta a mano de un miembro. Las altas por la web llegan solas."
      acciones={<Boton variante="secundario" icono="izq" href="/admin/miembros">Miembros</Boton>}
      clase="mb-alta"
    >
      <form className="mb-alta__form" onSubmit={(e) => { e.preventDefault(); guardar(false) }}>
        <Tarjeta titulo="Plan" className="mb-bloque">
          <div className="mb-planes" role="group" aria-label="Plan">
            {Object.entries(PLANES).map(([id, p]) => (
              <button key={id} type="button" className="mb-plan" aria-pressed={f.plan === id} onClick={() => elegirPlan(id)}>
                <b>{p.nombre}</b>
                <span className="mb-plan__precio">{formatoEuros(p.cuotaCent)}/mes</span>
                <span className="mb-plan__texto">{textoCondiciones({ ...condicionesDePlan(id), horasPeriodo: p.horasPeriodo, avisoCancelacionH: PLAN_COMUN.avisoCancelacionH }).slice(0, 3).join(' · ')}</span>
              </button>
            ))}
          </div>
          <details className="mb-desplegable" open={cambiadas.length > 0 || undefined}>
            <summary>Condiciones especiales{cambiadas.length ? ` (cambiadas: ${cambiadas.length})` : ' (si se ha pactado algo distinto)'}</summary>
            <div className="mb-desplegable__cuerpo">
              <CondicionesPlan valor={cond} onCambio={setCond} />
              {cambiadas.length > 0 && (
                <div className="mb-botones"><Boton variante="texto" tam="peq" onClick={() => setCond(formularioDePlan(f.plan))}>Volver a las del plan {PLANES[f.plan].nombre}</Boton></div>
              )}
            </div>
          </details>
        </Tarjeta>

        <Tarjeta titulo="Quién" className="mb-bloque">
          <div className="adm-form">
            <label>Nombre<input required value={f.nombre} onChange={(e) => poner('nombre', e.target.value)} /></label>
            <label>Apellidos<input value={f.apellidos} onChange={(e) => poner('apellidos', e.target.value)} /></label>
            <label>Correo<input type="email" required value={f.email} onChange={(e) => poner('email', e.target.value)} /></label>
            <label>WhatsApp<input value={f.telefono} onChange={(e) => poner('telefono', e.target.value)} /></label>
            <label className="adm-check adm-ancho"><input type="checkbox" checked={f.quiereFactura} onChange={(e) => poner('quiereFactura', e.target.checked)} /> Quiere factura con sus datos (si no, se le hace la simplificada)</label>
            {f.quiereFactura && (
              <>
                <label className="adm-ancho">Nombre o razón social<input value={f.factura.nombre} onChange={(e) => poner('factura', { ...f.factura, nombre: e.target.value })} /></label>
                <label>NIF o CIF<input value={f.factura.nif} onChange={(e) => poner('factura', { ...f.factura, nif: e.target.value })} /></label>
                <label>Dirección<input value={f.factura.direccion} onChange={(e) => poner('factura', { ...f.factura, direccion: e.target.value })} /></label>
              </>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Cuándo y cómo paga" className="mb-bloque">
          <div className="adm-form">
            <label>Empieza el (día del primer cobro)<input type="date" required value={f.fechaInicio} onChange={(e) => { poner('fechaInicio', e.target.value); poner('primeraFecha', e.target.value > hoy ? hoy : e.target.value) }} /></label>
            <label>Cómo paga cada mes
              <select value={f.metodoHabitual} onChange={(e) => poner('metodoHabitual', e.target.value)}>
                {METODOS_CUOTA.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
              </select>
            </label>
            <p className="adm-ancho adm-nota">Cada mes va del {f.fechaInicio ? Number(f.fechaInicio.slice(8, 10)) : '…'} al día anterior del mes siguiente. Las horas que no use se pierden al acabar.</p>
            <label className="adm-check adm-ancho"><input type="checkbox" checked={f.mesPrueba} onChange={(e) => poner('mesPrueba', e.target.checked)} /> El primer mes es de prueba (si avisa antes del segundo cobro, se va sin más y se le devuelve la fianza)</label>
            {f.metodoHabitual === 'stripe' && (
              <>
                <label className="adm-ancho">Suscripción en Stripe (sub_…, opcional)<input value={f.cobroExternoRef} onChange={(e) => poner('cobroExternoRef', e.target.value)} placeholder="sub_…" /></label>
                <p className="adm-ancho adm-nota">Stripe cobra solo. Aquí solo se apunta: cada mes marca la cuota como pagada cuando veas el cobro en Stripe. Si se da de baja, hay que cancelarla también en Stripe.</p>
              </>
            )}
            <label className="adm-check adm-ancho"><input type="checkbox" checked={f.primeraPagada} onChange={(e) => poner('primeraPagada', e.target.checked)} /> La primera cuota ({formatoEuros(cuotaCent)}) ya está pagada</label>
            {f.primeraPagada && (
              <>
                {f.metodoHabitual !== 'stripe' && (
                  <label>Cómo
                    <select value={f.primeraMetodo} onChange={(e) => poner('primeraMetodo', e.target.value)}>
                      {METODOS_A_MANO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                    </select>
                  </label>
                )}
                <label>Cuándo<input type="date" max={hoy} value={f.primeraFecha} onChange={(e) => poner('primeraFecha', e.target.value)} /></label>
                <label className="adm-ancho">Referencia o enlace (opcional)<input value={f.primeraReferencia} onChange={(e) => poner('primeraReferencia', e.target.value)} placeholder="Concepto de la transferencia, n.º de cobro o enlace al recibo de Stripe" /></label>
              </>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Fianza" className="mb-bloque">
          <div className="adm-form">
            <label>Fianza
              <select value={f.fianzaEstado} onChange={(e) => poner('fianzaEstado', e.target.value)}>
                <option value="pendiente">Aún sin cobrar</option>
                <option value="cobrada">Ya cobrada</option>
                <option value="sin_fianza">Sin fianza</option>
              </select>
            </label>
            {f.fianzaEstado !== 'sin_fianza' && <label>Importe (€)<input inputMode="decimal" value={f.fianzaImporte} onChange={(e) => poner('fianzaImporte', e.target.value)} /></label>}
            {f.fianzaEstado === 'cobrada' && (
              <>
                <label>Cómo
                  <select value={f.fianzaMetodo} onChange={(e) => poner('fianzaMetodo', e.target.value)}>
                    {METODOS_A_MANO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                  </select>
                </label>
                <label>Cuándo<input type="date" max={hoy} value={f.fianzaFecha} onChange={(e) => poner('fianzaFecha', e.target.value)} /></label>
              </>
            )}
            <p className="adm-ancho adm-nota">La fianza no lleva factura: se devuelve al acabar si cumple la permanencia ({cond.permanenciaMeses || '…'} meses) y el estudio y el equipo están bien.</p>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Contrato y notas" className="mb-bloque">
          <div className="adm-form">
            <label className="adm-ancho">Enlace al contrato firmado aparte (Drive, opcional)<input value={f.contratoUrl} onChange={(e) => poner('contratoUrl', e.target.value)} placeholder="https://drive.google.com/…" /></label>
            <label className="adm-ancho">Notas del estudio<textarea value={f.notasInternas} onChange={(e) => poner('notasInternas', e.target.value)} placeholder="Solo las veis vosotros" /></label>
          </div>
          <p className="adm-nota">Si no tiene contrato firmado, desde su ficha puedes enviarle el de la web para que lo firme desde el móvil.</p>
        </Tarjeta>

        <Tarjeta titulo="Resumen" className="mb-bloque mb-alta__resumen">
          <p>
            <b>{PLANES[f.plan].nombre}</b> · {cond.cuota ? `${cond.cuota} €/mes` : 'sin cuota'} · {cond.horasPeriodo ? textoDuracion(Number(String(cond.horasPeriodo).replace(',', '.')), { corto: true }) : '…'} al mes · empieza el {esFecha(f.fechaInicio) ? textoFechaCorta(f.fechaInicio, { anio: true }) : '…'}{f.mesPrueba ? ' · primer mes de prueba' : ''}
            {cambiadas.length > 0 && ' · con condiciones especiales'}
          </p>
          {estado.avisos && (
            <Aviso tono="aviso" titulo="Revisa antes de guardar:">
              {estado.avisos.map((a) => <span key={a.codigo} className="mb-linea">· {a.texto}</span>)}
            </Aviso>
          )}
          {estado.error && <p className="mb-mensaje is-error" role="alert">{estado.error}</p>}
          <div className="mb-botones">
            {estado.avisos && <Boton disabled={estado.enviando} onClick={() => guardar(true)}>Guardar igualmente</Boton>}
            <Boton type="submit" variante={estado.avisos ? 'secundario' : 'primario'} disabled={estado.enviando}>{estado.enviando ? 'Guardando…' : 'Dar de alta'}</Boton>
          </div>
        </Tarjeta>
      </form>
    </Panel>
  )
}
