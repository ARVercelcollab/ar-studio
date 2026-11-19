// Alta en un plan mensual: elige plan, deja sus datos y paga el primer mes en el TPV. El
// contrato no se enseña antes de pagar (menos fricción): junto al botón va el resumen de las
// condiciones. Después de pagar, firma el contrato en /contrato/<token>.
import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import { PLANES, PLAN_COMUN, formatoEuros, textoDuracion } from '../../lib/reservas/config'
import { irAlTpv, pedirJson } from '../../lib/reservas/navegador'

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

export default function Alta({ planInicial, cobroAuto }) {
  const [plan, setPlan] = useState(planInicial)
  const [d, setD] = useState({ nombre: '', apellidos: '', email: '', telefono: '' })
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
        <p className="rsv__intro">Elige tu plan y paga el primer mes. Justo después rellenas y firmas tu contrato aquí mismo, desde el móvil o el ordenador.</p>
        <div className="rsv__grid">
          <div>
            <section className="rsv__paso">
              <h2><span className="rsv__num">1</span> Elige tu plan</h2>
              <div className="rsv-alta__planes">
                {Object.entries(PLANES).map(([id, x]) => (
                  <button key={id} type="button" className={`rsv__duracion${plan === id ? ' is-activo' : ''}`} onClick={() => setPlan(id)}>
                    <span>{x.nombre}</span>
                    <strong>{formatoEuros(x.cuotaCent)}<small>/mes</small></strong>
                    <span>{h(x.horasPeriodo)} al mes · {textoSesiones(x)}</span>
                    <span className="rsv__finde">L–V de {x.franja[0]} a {x.franja[1]}</span>
                  </button>
                ))}
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
            <p className="rsv__seguro">
              {p ? `${formatoEuros(p.cuotaCent)} al mes (IVA incluido). ` : ''}Permanencia de {PLAN_COMUN.permanenciaMeses} meses.{' '}
              {cobroAuto ? 'Pagas con tarjeta y cada mes se cobra sola en esa tarjeta hasta que te des de baja.' : 'Los meses siguientes te llega un enlace de pago por correo.'}{' '}
              Fianza de {formatoEuros(PLAN_COMUN.fianzaCent)} por transferencia después, al firmar el contrato.{' '}
              Al pagar aceptas las <Link href="/condiciones" target="_blank">condiciones</Link> y la <Link href="/privacidad" target="_blank">privacidad</Link>.
            </p>
          </aside>
        </div>
      </main>
    </>
  )
}

export async function getServerSideProps({ query }) {
  const { reservasAbiertas } = await import('../../lib/http')
  if (!reservasAbiertas()) return { redirect: { destination: '/planmensual', permanent: false } }
  const { cobroAutomaticoActivo } = await import('../../lib/suscripciones/alta')
  const plan = typeof query.plan === 'string' && PLANES[query.plan] ? query.plan : null
  return { props: { planInicial: plan, cobroAuto: cobroAutomaticoActivo() } }
}
