// Ajustes › Personas con acceso: quién entra en el panel con su correo y su contraseña. Dar acceso
// (le llega un correo para crear su contraseña), reenviar la invitación, cerrar sus sesiones,
// quitar el acceso y volver a darlo. Solo lo ve y lo usa quien puede dar acceso.
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import SubmenuAjustes from '../../../components/admin/ajustes/SubmenuAjustes'
import { Tarjeta, Boton, Aviso, Etiqueta, Vacio } from '../../../components/admin/ui'
import { redirigirSiNoAdmin, personaDeLaPeticion } from '../../../lib/admin/auth'
import { listarPersonas } from '../../../lib/admin/cuentas'
import { pedirJson } from '../../../lib/reservas/navegador'
import { fechaMadrid, horaMadrid, textoFechaCorta } from '../../../lib/reservas/tiempo'

const ESTADO = {
  activa: ['bien', 'Activa'],
  invitada: ['aviso', 'Invitación enviada'],
  sin_acceso: ['gris', 'Sin acceso'],
}

export default function Personas({ permiso, yo, compartida, personas }) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: '', email: '', puedeDarAcceso: false })
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [permisoAlVolver, setPermisoAlVolver] = useState({})

  async function accion(datos, { confirmar = null, limpiar = false } = {}) {
    if (confirmar && !window.confirm(confirmar)) return
    setError(null)
    setMensaje(null)
    setEnviando(true)
    try {
      const r = await pedirJson('/api/admin/personas', { method: 'POST', body: datos })
      setMensaje(r.mensaje)
      if (limpiar) setF({ nombre: '', email: '', puedeDarAcceso: false })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!permiso) {
    return (
      <Panel titulo="Personas con acceso" clase="adm-ajustes">
        <SubmenuAjustes />
        <Aviso tono="info">Solo quien puede dar acceso gestiona las personas del panel.</Aviso>
      </Panel>
    )
  }

  return (
    <Panel titulo="Personas con acceso" sub="Cada persona entra con su correo y su contraseña." clase="adm-ajustes">
      <SubmenuAjustes />
      <div className="adm-ajustes__pila">
        {compartida && (
          <Aviso tono="info" titulo="Ahora se entra con la contraseña compartida.">
            Da acceso a cada persona, empezando por ti: le llega un correo para crear su contraseña. En cuanto la primera la cree,
            se entrará con correo y contraseña y la compartida dejará de valer.
          </Aviso>
        )}
        {mensaje && <Aviso tono="bien" icono="ok">{mensaje}</Aviso>}
        {error && <Aviso tono="mal">{error}</Aviso>}

        <Tarjeta titulo="Dar acceso" nota="Le llega un correo para crear su contraseña. El enlace vale 72 horas.">
          <form onSubmit={(e) => { e.preventDefault(); accion({ accion: 'dar_acceso', ...f }, { limpiar: true }) }}>
            <div className="adm-form">
              <label>Nombre<input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required autoComplete="off" placeholder="Nombre y apellido" /></label>
              <label>Correo<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="off" inputMode="email" placeholder="nombre@correo.com" /></label>
              <label className="adm-check adm-ancho">
                <input type="checkbox" checked={f.puedeDarAcceso} onChange={(e) => setF({ ...f, puedeDarAcceso: e.target.checked })} /> Puede dar acceso a otras personas
              </label>
            </div>
            <div className="adm-ajustes__botones">
              <Boton type="submit" icono="mas" disabled={enviando || !f.nombre.trim() || !f.email.trim()}>Dar acceso</Boton>
            </div>
          </form>
        </Tarjeta>

        <Tarjeta titulo="Personas" tabla={personas.length > 0}>
          {personas.length === 0 ? <Vacio compacto texto="Aún no has dado acceso a nadie." /> : (
            <div className="ui-tabla-caja">
              <table className="ui-tabla adm-ajustes__tabla">
                <thead>
                  <tr>
                    <th scope="col">Persona</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Último acceso</th>
                    <th scope="col"><span className="ui-solo-lector">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p) => {
                    const [tono, texto] = ESTADO[p.estado]
                    const soyYo = p.id === yo
                    return (
                      <tr key={p.id}>
                        <td>
                          <b>{p.nombre}</b>{soyYo && <> <Etiqueta tono="marron">Tú</Etiqueta></>}
                          <br /><span className="ui-t3">{p.email}{p.puedeDarAcceso ? ' · puede dar acceso' : ''}</span>
                        </td>
                        <td>
                          <Etiqueta tono={tono} punto>{texto}</Etiqueta>
                          {p.estado === 'invitada' && p.invitacion && <><br /><span className="ui-t3">{p.invitacion}</span></>}
                        </td>
                        <td>{p.ultimoAcceso || '—'}</td>
                        <td className="der">
                          <span className="adm-ajustes__pies">
                            {p.estado === 'invitada' && (
                              <Boton variante="secundario" tam="peq" disabled={enviando} onClick={() => accion({ accion: 'reenviar', id: p.id })}>Reenviar invitación</Boton>
                            )}
                            {p.estado === 'activa' && (
                              <Boton
                                variante="secundario" tam="peq" disabled={enviando}
                                onClick={() => accion({ accion: 'cerrar_sesiones', id: p.id }, { confirmar: soyYo ? 'Se cerrará también esta sesión y tendrás que volver a entrar. ¿Seguro?' : `¿Cerrar las sesiones de ${p.nombre}? Tendrá que volver a entrar.` })}
                              >
                                Cerrar sus sesiones
                              </Boton>
                            )}
                            {p.estado !== 'sin_acceso' && !soyYo && (
                              <Boton
                                variante="secundario" tam="peq" disabled={enviando}
                                onClick={() => accion({ accion: 'cambiar_permiso', id: p.id, puedeDarAcceso: !p.puedeDarAcceso }, { confirmar: p.puedeDarAcceso ? `¿Quitar a ${p.nombre} el permiso de dar acceso a otras personas?` : `¿Permitir a ${p.nombre} dar acceso a otras personas? Podrá darlo y quitarlo como tú.` })}
                              >
                                {p.puedeDarAcceso ? 'Quitar permiso de dar acceso' : 'Permitir dar acceso'}
                              </Boton>
                            )}
                            {p.estado !== 'sin_acceso' && !soyYo && (
                              <Boton
                                variante="peligro" tam="peq" disabled={enviando}
                                onClick={() => accion({ accion: 'quitar', id: p.id }, { confirmar: `¿Quitar el acceso a ${p.nombre}? Saldrá del panel al momento.` })}
                              >
                                Quitar acceso
                              </Boton>
                            )}
                            {p.estado === 'sin_acceso' && (
                              <>
                                <label className="adm-check">
                                  <input type="checkbox" checked={Boolean(permisoAlVolver[p.id])} onChange={(e) => setPermisoAlVolver({ ...permisoAlVolver, [p.id]: e.target.checked })} /> Puede dar acceso
                                </label>
                                <Boton variante="secundario" tam="peq" disabled={enviando} onClick={() => accion({ accion: 'volver', id: p.id, puedeDarAcceso: Boolean(permisoAlVolver[p.id]) })}>Volver a dar acceso</Boton>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </Panel>
  )
}

const cuando = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return `${textoFechaCorta(fechaMadrid(d))}, ${horaMadrid(d)}`
}

export async function getServerSideProps(ctx) {
  const redir = await redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const yo = await personaDeLaPeticion(ctx.req)
  if (!yo?.puedeDarAcceso) return { props: { permiso: false, yo: yo?.id ?? null, compartida: Boolean(yo?.compartida), personas: [] } }
  const personas = (await listarPersonas()).map((p) => ({
    id: p.id, nombre: p.nombre, email: p.email, estado: p.estado, puedeDarAcceso: p.puedeDarAcceso,
    ultimoAcceso: cuando(p.ultimoAccesoEn),
    invitacion: p.invitacionEnviadaEn ? `Enviada el ${cuando(p.invitacionEnviadaEn)}` : null,
  }))
  return { props: { permiso: true, yo: yo.id, compartida: Boolean(yo.compartida), personas } }
}
