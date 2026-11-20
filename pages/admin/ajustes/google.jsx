// Ajustes › Google Calendar: conectar la cuenta del estudio para que cada reserva aparezca al momento
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import SubmenuAjustes from '../../../components/admin/ajustes/SubmenuAjustes'
import { Tarjeta, Boton, Aviso, Etiqueta, Icono } from '../../../components/admin/ui'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { estadoGoogle, listarCalendarios } from '../../../lib/google/calendario'
import { pedirJson } from '../../../lib/reservas/navegador'

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
      router.replace('/admin/ajustes/google', undefined, { scroll: false })
    } catch (e) {
      setAviso({ ok: false, texto: e.message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Panel titulo="Google Calendar" sub="Que cada reserva salga en el calendario del estudio." clase="adm-ajustes">
      <SubmenuAjustes />
      <div className="adm-ajustes__pila">
        {aviso && <p className={`adm-mensaje${aviso.ok ? '' : ' is-error'}`} role={aviso.ok ? 'status' : 'alert'}>{aviso.texto}</p>}

        {!estado.configurado ? (
          <Aviso tono="aviso" titulo="Falta preparar la conexión.">
            Hay que crear un «cliente OAuth» en Google Cloud con la cuenta del estudio y poner GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en
            Vercel (los pasos están en la guía de Google Calendar). Después, aquí aparecerá el botón para conectar.
          </Aviso>
        ) : !estado.conectado ? (
          <Tarjeta titulo="Conectar Google Calendar">
            {estado.revocado && (
              <Aviso tono="mal" titulo="Google ha cortado la conexión.">Se quitó el permiso desde la cuenta de Google o caducó. Vuelve a conectar: no se duplica nada.</Aviso>
            )}
            <p className="adm-ajustes__texto">Entra con la cuenta de Google del estudio y pulsa «Permitir». Solo hace falta una vez.</p>
            <form method="GET" action="/api/admin/google/conectar" className="adm-ajustes__botones">
              <Boton type="submit" icono="cal">Conectar Google Calendar</Boton>
            </form>
            {estado.pendientes > 0 && <p className="adm-ajustes__texto">{plural(estado.pendientes, 'reserva o bloqueo espera', 'reservas o bloqueos esperan')} a que conectes para pasar al calendario.</p>}
          </Tarjeta>
        ) : (
          <>
            <Tarjeta titulo="Conexión">
              <div className="adm-ajustes__estado">
                <span className="adm-ajustes__icono"><Icono nombre="cal" /></span>
                <span>
                  <b>Conectado</b>
                  <small>Con {estado.cuenta || 'la cuenta de Google'}</small>
                </span>
                {estado.errores > 0 ? <Etiqueta tono="mal" punto>{estado.errores} sin pasar</Etiqueta> : estado.pendientes > 0 ? <Etiqueta tono="aviso" punto>{estado.pendientes} pendientes</Etiqueta> : <Etiqueta tono="bien" punto>Al día</Etiqueta>}
              </div>
              <form
                className="adm-form adm-ajustes__calendario"
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
                    <Boton type="submit" variante="secundario" disabled={ocupado || cal === (estado.calendarioId || 'primary')}>Guardar</Boton>
                  </p>
                )}
              </form>
              {errorCalendarios && <p className="adm-ajustes__texto ui-mal">No se pudo cargar la lista de calendarios: {errorCalendarios}</p>}
            </Tarjeta>

            <Tarjeta titulo="Lo que hay en el calendario">
              {estado.errores > 0 ? (
                <Aviso tono="mal" titulo={`${plural(estado.errores, 'evento no ha llegado', 'eventos no han llegado')} a Google.`}>{estado.ultimoError}</Aviso>
              ) : estado.pendientes > 0 ? (
                <p className="adm-ajustes__texto">{plural(estado.pendientes, 'reserva o bloqueo está', 'reservas o bloqueos están')} pendientes de pasar al calendario.</p>
              ) : (
                <p className="adm-ajustes__texto">Todo está al día en el calendario.</p>
              )}
              <div className="adm-ajustes__botones">
                <Boton icono="movs" disabled={ocupado} onClick={() => accion({ accion: 'sincronizar' }, 'Calendario sincronizado.')}>
                  {ocupado ? 'Un momento…' : 'Volver a sincronizar'}
                </Boton>
                <Boton
                  variante="secundario"
                  disabled={ocupado}
                  onClick={() => {
                    if (window.confirm('¿Desconectar Google Calendar? Los eventos que ya están se quedan en el calendario, pero los cambios nuevos no llegarán.')) {
                      accion({ accion: 'desconectar' }, 'Google Calendar desconectado.')
                    }
                  }}
                >
                  Desconectar
                </Boton>
              </div>
            </Tarjeta>
          </>
        )}

        <Tarjeta titulo="Qué aparece en el calendario">
          <p className="adm-ajustes__texto">
            Cada reserva confirmada (de la web, del panel y las sesiones de los planes) y cada bloqueo aparecen al momento en el
            calendario de Google del estudio, con los datos que rellenó el cliente: nombre, WhatsApp, correo, qué va a hacer,
            fondos, equipo, comentarios, horas, importe y si está pagada. Si se mueve o se cancela, el calendario se actualiza solo.
          </p>
          <p className="adm-ajustes__texto ui-t3">
            Las reservas de Calendly no se copian: Calendly ya las pone en el calendario. Quien vea ese calendario verá los datos
            de los clientes, así que no lo compartas fuera del estudio.
          </p>
        </Tarjeta>
      </div>
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
