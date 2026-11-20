// Tu plan: condiciones, contrato, tarjeta guardada y «Escríbenos» (baja o cambios).
import { useState } from 'react'
import { pedirJson } from '../../lib/reservas/navegador'
import { ESTUDIO } from '../../lib/reservas/config'
import { lineas, fechaCorta, whatsapp } from './formato'

const caducidad = (aamm) => (aamm && /^\d{4}$/.test(aamm) ? `${aamm.slice(2)}/${aamm.slice(0, 2)}` : aamm || '')

function Escribenos({ nombre, plan }) {
  const [tipo, setTipo] = useState('consulta')
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState({ enviando: false, ok: null, error: null })
  const enviar = async (e) => {
    e.preventDefault()
    if (texto.trim().length < 3 || estado.enviando) return
    setEstado({ enviando: true, ok: null, error: null })
    try {
      const r = await pedirJson('/api/miembros/mensaje', { method: 'POST', body: { tipo, texto: texto.trim() } })
      setTexto('')
      setEstado({ enviando: false, ok: r?.mensaje || 'Mensaje enviado. Te contestamos lo antes posible.', error: null })
    } catch (err) {
      setEstado({ enviando: false, ok: null, error: err.message })
    }
  }
  const saludo = `Hola, soy ${nombre || ''}${plan ? ` (plan ${plan})` : ''}. `
  return (
    <form className="mbr-escribenos" onSubmit={enviar}>
      <h3>¿Quieres darte de baja o cambiar algo? Escríbenos</h3>
      <fieldset className="mbr-chips">
        <legend className="mbr-sr">Qué quieres</legend>
        {[['consulta', 'Cambiar algo o preguntar'], ['baja', 'Darme de baja']].map(([id, t]) => (
          <label key={id} className={`mbr-chip${tipo === id ? ' is-activo' : ''}`}>
            <input type="radio" name="tipo-mensaje" value={id} checked={tipo === id} onChange={() => setTipo(id)} />
            {t}
          </label>
        ))}
      </fieldset>
      {tipo === 'baja' && <p className="mbr-nota">Te contestamos con tu último día según tu contrato y lo que pasa con la fianza. No se da de baja hasta que te lo confirmemos.</p>}
      <label className="mbr-campo">
        <span>Tu mensaje</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} required />
      </label>
      {estado.error && <p className="mbr-aviso mbr-aviso--mal" role="alert">{estado.error}</p>}
      {estado.ok && <p className="mbr-aviso mbr-aviso--bien" role="status">{estado.ok}</p>}
      <div className="mbr-fila">
        <button type="submit" className="mbr-boton mbr-boton--peq" disabled={estado.enviando || texto.trim().length < 3}>{estado.enviando ? 'Enviando…' : 'Enviar'}</button>
        <a className="mbr-enlace" href={whatsapp(saludo)} target="_blank" rel="noopener noreferrer">O por WhatsApp ({ESTUDIO.whatsappVisible})</a>
      </div>
    </form>
  )
}

export default function TuPlan({ miembro = {}, suscripcion = {}, contrato = null, tarjeta = null, cobroAutomatico = false }) {
  const condiciones = lineas(suscripcion.condiciones)
  return (
    <section className="mbr-tarjeta" aria-labelledby="mbr-plan">
      <h2 id="mbr-plan" className="mbr-tarjeta__titulo">Tu plan{suscripcion.planNombre ? ` ${suscripcion.planNombre}` : ''}</h2>
      {suscripcion.ultimoDia && <p className="mbr-aviso mbr-aviso--info">Tu último día es el <strong>{fechaCorta(suscripcion.ultimoDia, true)}</strong>.</p>}
      {condiciones.length > 0 && (
        <ul className="mbr-condiciones">
          {condiciones.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}

      <dl className="mbr-datos">
        <div>
          <dt>Contrato</dt>
          <dd>
            {contrato?.firmado || contrato?.estado === 'firmado' ? (
              <>
                Firmado{contrato.firmadoEn ? ` el ${fechaCorta(String(contrato.firmadoEn).slice(0, 10), true)}` : ''}
                {' · '}
                <a className="mbr-enlace" href={contrato.url || '/api/miembros/contrato'} target="_blank" rel="noopener noreferrer">Descargar (PDF)</a>
              </>
            ) : contrato?.enlaceFirmar ? (
              <a className="mbr-boton mbr-boton--peq" href={contrato.enlaceFirmar}>Firmar el contrato</a>
            ) : (
              'Lo tiene el estudio. Si lo necesitas, pídenoslo.'
            )}
          </dd>
        </div>
        <div>
          <dt>Pago de la cuota</dt>
          <dd>
            {tarjeta?.ultimos ? <>Tarjeta ···· {tarjeta.ultimos}{tarjeta.caduca ? ` (caduca ${caducidad(tarjeta.caduca)})` : ''}</> : 'Sin tarjeta guardada'}
            {cobroAutomatico ? <span className="mbr-nota mbr-nota--linea">Se cobra sola cada mes.</span> : <span className="mbr-nota mbr-nota--linea">Te avisamos por correo cuando toca pagar.</span>}
          </dd>
        </div>
      </dl>

      <Escribenos nombre={miembro.nombre} plan={suscripcion.planNombre} />
    </section>
  )
}
