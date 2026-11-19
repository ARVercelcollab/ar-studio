// Alta en un plan mensual: elige plan, deja sus datos, lee las condiciones y el modelo de
// contrato y paga el primer mes en el TPV. Después firma el contrato en /contrato/<token>.
import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import { PLANES, PLAN_COMUN, formatoEuros, textoDuracion } from '../../lib/reservas/config'
import { irAlTpv, pedirJson } from '../../lib/reservas/navegador'
import { PLAZAS_LIBRES, textoPlazasPlan } from '../../lib/plazas'

function Campo({ etiqueta, error, ancho, children }) {
  return (
    <label className={`rsv__campo${error ? ' is-error' : ''}${ancho ? ' rsv__ancho' : ''}`}>
      <span>{etiqueta}</span>
      {children}
      {error && <span className="rsv__error">{error}</span>}
    </label>
  )
}

const h = (x) => textoDuracion(x)
function textoSesiones(p) {
  if (p.maxSesiones === 1) return `1 sesión de ${h(p.sesionMinH)}`
  if (p.duracionesH) return `sesiones de ${p.duracionesH.join(' u ')} horas`
  return `sesiones de ${p.sesionMinH} a ${p.sesionMaxH} horas`
}

export default function Alta({ planInicial }) {
  const [plan, setPlan] = useState(planInicial)
  const [d, setD] = useState({ nombre: '', apellidos: '', email: '', telefono: '', acepta: false })
  const [errores, setErrores] = useState({})
  const [aviso, setAviso] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const cambiar = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const p = plan ? PLANES[plan] : null

  const pagar = async () => {
    setAviso(null)
    const e = {}
    if (!plan) e.plan = 'Elige un plan.'
    if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre.'
    if (!d.apellidos.trim()) e.apellidos = 'Escribe tus apellidos.'
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(d.email.trim())) e.email = 'Revisa el correo.'
    if (d.telefono.replace(/\D/g, '').length < 9) e.telefono = 'Escribe un teléfono de contacto.'
    if (!d.acepta) e.acepta = 'Marca la casilla para seguir.'
    setErrores(e)
    if (Object.keys(e).length) return
    setEnviando(true)
    try {
      const r = await pedirJson('/api/suscripciones/alta', { method: 'POST', body: { plan, ...d, email: d.email.trim() } })
      irAlTpv(r.pago)
    } catch (err) {
      setEnviando(false)
      if (err.datos?.errores) setErrores(err.datos.errores)
      setAviso(err.message)
    }
  }

  return (
    <>
      <Head>
        <title>Hazte miembro | AR Studio</title>
        <meta name="description" content="Únete al plan mensual de AR Studio en Valencia: elige tu plan, paga el primer mes y firma tu contrato online." />
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rsv">
        <h1>Hazte miembro</h1>
        <p className="rsv__intro">Elige tu plan y paga el primer mes. Justo después firmas tu contrato aquí mismo, desde el móvil o el ordenador.</p>
        <div className="rsv__grid">
          <div>
            <section className="rsv__paso">
              <h2><span className="rsv__num">1</span> Elige tu plan</h2>
              <div className="rsv-alta__planes">
                {Object.entries(PLANES).map(([id, x]) => {
                  const libres = PLAZAS_LIBRES[id] ?? 0
                  return (
                    <button key={id} type="button" disabled={libres <= 0} className={`rsv__duracion${plan === id ? ' is-activo' : ''}`} onClick={() => setPlan(id)}>
                      <span>{x.nombre}</span>
                      <strong>{formatoEuros(x.cuotaCent)}<small>/mes</small></strong>
                      <span>{h(x.horasPeriodo)} al mes · {textoSesiones(x)}</span>
                      <span className="rsv__finde">L–V de {x.franja[0]} a {x.franja[1]} · {textoPlazasPlan(libres)}</span>
                    </button>
                  )
                })}
              </div>
              {errores.plan && <span className="rsv__error">{errores.plan}</span>}
            </section>

            <section className="rsv__paso">
              <h2><span className="rsv__num">2</span> Tus datos</h2>
              <div className="rsv__form">
                <Campo etiqueta="Nombre" error={errores.nombre}>
                  <input value={d.nombre} onChange={(e) => cambiar('nombre', e.target.value)} autoComplete="given-name" />
                </Campo>
                <Campo etiqueta="Apellidos" error={errores.apellidos}>
                  <input value={d.apellidos} onChange={(e) => cambiar('apellidos', e.target.value)} autoComplete="family-name" />
                </Campo>
                <Campo etiqueta="Correo electrónico" error={errores.email}>
                  <input type="email" value={d.email} onChange={(e) => cambiar('email', e.target.value)} autoComplete="email" inputMode="email" />
                </Campo>
                <Campo etiqueta="WhatsApp" error={errores.telefono}>
                  <input type="tel" value={d.telefono} onChange={(e) => cambiar('telefono', e.target.value)} autoComplete="tel" placeholder="+34" />
                </Campo>
              </div>
              <p className="rsv__nota">El contrato y la factura te llegan a este correo. El DNI y la dirección los pones al firmar el contrato.</p>
            </section>

            <section className="rsv__paso">
              <h2><span className="rsv__num">3</span> Antes de pagar</h2>
              <ul className="rsv-alta__lista">
                <li>Hoy pagas el <strong>primer mes{p ? ` (${formatoEuros(p.cuotaCent)}, IVA incluido)` : ''}</strong> con tarjeta o Bizum. Tu suscripción empieza hoy.</li>
                <li>Los meses siguientes te llega un <strong>enlace de pago por correo</strong> al empezar cada mes.</li>
                <li><strong>Permanencia mínima de {PLAN_COMUN.permanenciaMeses} meses.</strong> Las horas son de cada mes: las que no uses se pierden.</li>
                <li>Reservas tus sesiones con al menos {PLAN_COMUN.antelacionH} horas de antelación; si cancelas con menos de {PLAN_COMUN.avisoCancelacionH} horas, cuenta como usada.</li>
                <li><strong>Fianza de {formatoEuros(PLAN_COMUN.fianzaCent)}</strong> por transferencia al firmar el contrato (no se paga aquí). Se devuelve al terminar si el estudio queda bien; si te das de baja antes de los {PLAN_COMUN.permanenciaMeses} meses, se pierde.</li>
                <li>Léelo todo en el <Link href={`/planmensual/contrato${plan ? `?plan=${plan}` : ''}`} target="_blank">modelo de contrato</Link>, en las <Link href="/planmensual#condiciones" target="_blank">condiciones del plan mensual</Link> y en las <Link href="/condiciones" target="_blank">normas del estudio</Link>.</li>
              </ul>
              <label className="rsv__check">
                <input type="checkbox" checked={d.acepta} onChange={(e) => cambiar('acepta', e.target.checked)} />
                <span>He leído las condiciones y el modelo de contrato, y la <Link href="/privacidad" target="_blank">política de privacidad</Link>.</span>
              </label>
              {errores.acepta && <span className="rsv__error">{errores.acepta}</span>}
            </section>
          </div>

          <aside className="rsv__resumen">
            <h3>Tu suscripción</h3>
            <dl>
              <dt>Plan</dt>
              <dd>{p ? p.nombre : '—'}</dd>
              <dt>Horas</dt>
              <dd>{p ? `${h(p.horasPeriodo)} al mes` : '—'}</dd>
              <dt>Cada mes</dt>
              <dd>{p ? formatoEuros(p.cuotaCent) : '—'}</dd>
              <dt>Fianza</dt>
              <dd>{formatoEuros(PLAN_COMUN.fianzaCent)} (al firmar)</dd>
            </dl>
            <div className="rsv__total">
              <span>Hoy pagas</span>
              <strong>{p ? formatoEuros(p.cuotaCent) : '—'}</strong>
            </div>
            {aviso && <p className="rsv__alerta is-error">{aviso}</p>}
            <button type="button" className="rsv__boton" disabled={!p || enviando} onClick={pagar}>
              {enviando ? 'Abriendo el pago…' : p ? `Pagar ${formatoEuros(p.cuotaCent)}` : 'Pagar'}
            </button>
            <p className="rsv__seguro">Pagarás en la pasarela segura del banco. Después firmas tu contrato.</p>
          </aside>
        </div>
      </main>
    </>
  )
}

export async function getServerSideProps({ query }) {
  const { reservasAbiertas } = await import('../../lib/http')
  if (!reservasAbiertas()) return { redirect: { destination: '/planmensual', permanent: false } }
  const plan = typeof query.plan === 'string' && PLANES[query.plan] && (PLAZAS_LIBRES[query.plan] ?? 0) > 0 ? query.plan : null
  return { props: { planInicial: plan } }
}
