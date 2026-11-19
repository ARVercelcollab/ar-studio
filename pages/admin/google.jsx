// Google Calendar: conectar la cuenta del estudio para que cada reserva aparezca al momento
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { estadoGoogle, listarCalendarios } from '../../lib/google/calendario'
import { pedirJson } from '../../lib/reservas/navegador'

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

export default function Google({ estado, calendarios, errorCalendarios, mensaje, error }) {
  const router = useRouter()
  const [cal, setCal] = useState(estado.calendarioId || 'primary')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(mensaje ? { ok: true, texto: mensaje } : error ? { ok: false, texto: error } : null)

  async function accion(datos, textoOk) {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await pedirJson('/api/admin/google', { method: 'POST', body: datos })
      const res = r.resumen
      let texto = textoOk
      if (res && res.hecho === false && res.mensaje) texto = `No se pudo terminar: ${res.mensaje}`
      else if (res && res.quedan) texto += ` Quedan ${res.quedan} por pasar: vuelve a pulsar «Volver a sincronizar».`
      setAviso({ ok: !(res && res.hecho === false) && !(res && res.errores), texto: res && res.errores ? `${texto} ${plural(res.errores, 'evento ha fallado', 'eventos han fallado')}.` : texto })
      router.replace('/admin/google', undefined, { scroll: false })
    } catch (e) {
      setAviso({ ok: false, texto: e.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Panel titulo="Google Calendar">
      <div className="adm-caja">
        <p>
          Cada reserva confirmada (de la web, del panel y las sesiones de los planes) y cada bloqueo aparecen al momento en el
          calendario de Google del estudio, con los datos que rellenó el cliente: nombre, WhatsApp, correo, qué va a hacer,
          fondos, equipo, comentarios, horas, importe y si está pagada. Si se mueve o se cancela, el calendario se actualiza solo.
        </p>
        <p className="adm-notas">
          Las reservas de Calendly no se copian: Calendly ya las pone en el calendario. Quien vea ese calendario verá los datos
          de los clientes, así que no lo compartas fuera del estudio.
        </p>
      </div>

      {aviso && <p className={`adm-mensaje${aviso.ok ? '' : ' is-error'}`}>{aviso.texto}</p>}

      {!estado.configurado ? (
        <div className="adm-avisos">
          <strong>Falta preparar la conexión</strong>
          Hay que crear un «cliente OAuth» en Google Cloud y poner GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel (los pasos
          están en RESERVAS.md, apartado «Google Calendar»). Después, aquí aparecerá el botón para conectar.
        </div>
      ) : !estado.conectado ? (
        <div className="adm-caja">
          {estado.revocado && (
            <div className="adm-avisos">
              <strong>Google ha cortado la conexión</strong>
              Se quitó el permiso desde la cuenta de Google o caducó. Vuelve a conectar: no se duplica nada.
            </div>
          )}
          <p>Entra con la cuenta de Google del estudio y pulsa «Permitir». Solo hace falta una vez.</p>
          <form method="GET" action="/api/admin/google/conectar" style={{ marginTop: 12 }}>
            <button type="submit" className="adm-boton">Conectar Google Calendar</button>
          </form>
          {estado.pendientes > 0 && <p className="adm-notas">{plural(estado.pendientes, 'reserva o bloqueo espera', 'reservas o bloqueos esperan')} a que conectes para pasar al calendario.</p>}
        </div>
      ) : (
        <>
          <div className="adm-caja">
            <p>Conectado con <strong>{estado.cuenta || 'la cuenta de Google'}</strong>.</p>
            <form
              className="adm-form"
              style={{ marginTop: 12 }}
              onSubmit={(e) => {
                e.preventDefault()
                accion({ accion: 'calendario', id: cal }, 'Calendario guardado: las reservas van ahora a ese calendario.')
              }}
            >
              <label>
                Calendario donde van las reservas
                {calendarios ? (
                  <select value={cal} onChange={(e) => setCal(e.target.value)} disabled={ocupado}>
                    {calendarios.map((c) => (
                      <option key={c.id} value={c.principal ? 'primary' : c.id}>{c.nombre}{c.principal ? ' (principal)' : ''}</option>
                    ))}
                  </select>
                ) : (
                  <span>{estado.calendarioNombre || 'Calendario principal'}</span>
                )}
              </label>
              {calendarios && (
                <p style={{ alignSelf: 'end' }}>
                  <button type="submit" className="adm-boton adm-boton--claro" disabled={ocupado || cal === (estado.calendarioId || 'primary')}>Guardar</button>
                </p>
              )}
            </form>
            {errorCalendarios && <p className="adm-notas">No se pudo cargar la lista de calendarios: {errorCalendarios}</p>}
          </div>

          <div className="adm-caja">
            {estado.errores > 0 ? (
              <div className="adm-avisos">
                <strong>{plural(estado.errores, 'evento no ha llegado', 'eventos no han llegado')} a Google</strong>
                {estado.ultimoError}
              </div>
            ) : estado.pendientes > 0 ? (
              <p>{plural(estado.pendientes, 'reserva o bloqueo está', 'reservas o bloqueos están')} pendientes de pasar al calendario.</p>
            ) : (
              <p>Todo está al día en el calendario.</p>
            )}
            <p style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="adm-boton" disabled={ocupado} onClick={() => accion({ accion: 'sincronizar' }, 'Calendario sincronizado.')}>
                {ocupado ? 'Un momento…' : 'Volver a sincronizar'}
              </button>
              <button
                type="button"
                className="adm-boton adm-boton--claro"
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm('¿Desconectar Google Calendar? Los eventos que ya están se quedan en el calendario, pero los cambios nuevos no llegarán.')) {
                    accion({ accion: 'desconectar' }, 'Google Calendar desconectado.')
                  }
                }}
              >
                Desconectar
              </button>
            </p>
          </div>
        </>
      )}
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  const estado = await estadoGoogle()
  let calendarios = null
  let errorCalendarios = null
  if (estado.conectado) {
    try {
      calendarios = await listarCalendarios()
    } catch (e) {
      errorCalendarios = e.message
    }
  }
  const q = ctx.query || {}
  return {
    props: {
      estado,
      calendarios,
      errorCalendarios,
      mensaje: q.conectado ? 'Google Calendar conectado. Las reservas ya van al calendario.' : null,
      error: typeof q.error === 'string' ? q.error.slice(0, 200) : null,
    },
  }
}
