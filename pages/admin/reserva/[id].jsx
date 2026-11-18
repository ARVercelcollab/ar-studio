// Ficha de una reserva con sus acciones
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel, { chipEstado } from '../../../components/admin/Panel'
import SesionPlan from '../../../components/admin/SesionPlan'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { vistaAdmin, fechaHoraTexto } from '../../../lib/admin/vista'
import { reservaPorId, pagosDeReserva, eventosDeReserva } from '../../../lib/reservas/servicio'
import { formatoEuros, textoDuracion } from '../../../lib/reservas/config'
import { pedirJson } from '../../../lib/reservas/navegador'
import { urlBase } from '../../../lib/http'
import { facturaDeReserva, emisor } from '../../../lib/facturas/servicio'
import { suscripcionCorta } from '../../../lib/suscripciones/servicio'
import { cancelacionCuenta } from '../../../lib/suscripciones/reglas'
import { ingresosDeReserva } from '../../../lib/finanzas/servicio'
import { fechaMadrid } from '../../../lib/reservas/tiempo'

const EVENTOS = {
  creada: 'Creada',
  reintento_pago: 'Nuevo intento de pago',
  pago_fallido: 'Pago rechazado o cancelado',
  pagada: 'Pago recibido del TPV',
  pagada_a_mano: 'Marcada como pagada',
  correos_confirmacion: 'Correos de confirmación enviados',
  correo_fallido: 'Fallo al enviar un correo',
  movida: 'Cambiada de fecha u hora',
  cancelada: 'Cancelada',
  recordatorio: 'Recordatorio enviado',
  solicitud_cliente: 'El cliente pide un cambio',
  reactivada: 'Reactivada',
  factura_emitida: 'Factura emitida',
  factura_enviada: 'Factura enviada',
  factura_fallida: 'Fallo con la factura',
}

function useAccion(id) {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: false, mensaje: null, error: false })
  async function ejecutar(datos, textoOk) {
    setEstado({ enviando: true, mensaje: null, error: false })
    try {
      const r = await pedirJson(`/api/admin/reservas/${id}`, { method: 'POST', body: datos })
      setEstado({ enviando: false, mensaje: [textoOk, r?.mensaje].filter(Boolean).join(' '), error: false })
      router.replace(router.asPath, undefined, { scroll: false })
    } catch (e) {
      setEstado({ enviando: false, mensaje: e.message, error: true })
    }
  }
  return [estado, ejecutar]
}

function Mensaje({ estado }) {
  if (!estado.mensaje) return null
  return <p className={`adm-mensaje${estado.error ? ' is-error' : ''}`}>{estado.mensaje}</p>
}

export default function FichaReserva({ r, sus, cuentaPorRegla, pagos, eventos, enlaceCliente, factura, emisorListo, cobrosDia, hoy }) {
  const router = useRouter()
  const [movida, setMovida] = useState(null)
  const [pago, setPago] = useState({ metodo: 'transferencia', enviarCorreo: false, fecha: '' })
  const [mover, setMover] = useState({ fecha: r.fecha, desde: r.horaInicio, hasta: r.horaFin, enviarCorreo: true })
  // Sesiones del plan: cuentaComoUsada = null mientras no se toque la casilla, y entonces decide
  // el servidor con la hora exacta de cancelar (regla de las 48 h)
  const reembolsoInicial = r.esPlan
    ? (r.pagoEstado === 'pagado' && r.precioCent > 0 && !cuentaPorRegla ? (r.precioCent / 100).toFixed(2) : '0')
    : r.pagoEstado === 'pagado' ? ((r.precioCent * r.reembolsoHoyPct) / 10000).toFixed(2) : '0'
  const [cancel, setCancel] = useState({ motivo: '', reembolso: reembolsoInicial, enviarCorreo: true, cuentaComoUsada: null })
  const [notas, setNotas] = useState(r.notasInternas)
  const [ePago, accionPago] = useAccion(r.id)
  const [eMover, accionMover] = useAccion(r.id)
  const [eCancel, accionCancel] = useAccion(r.id)
  const [eNotas, accionNotas] = useAccion(r.id)
  const [eFactura, accionFactura] = useAccion(r.id)
  const [eReactivar, accionReactivar] = useAccion(r.id)
  const [datosFactura, setDatosFactura] = useState({ nombre: r.factura?.nombre || '', nif: r.factura?.nif || '', direccion: r.factura?.direccion || '' })

  const puedeCobrarse = r.pagoEstado !== 'pagado' && r.estado !== 'cancelada'
  const telefono = (r.telefono || '').replace(/[^0-9]/g, '')

  return (
    <Panel
      titulo={`${r.nombre} ${r.apellidos}`}
      acciones={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/agenda" className="adm-boton adm-boton--claro">← Agenda</Link>
          {sus && <Link href={`/admin/suscripciones/${sus.id}`} className="adm-boton adm-boton--claro">Su suscripción</Link>}
        </div>
      )}
    >
      <div className="adm-dos">
        <div>
          <div className="adm-caja">
            <h2>{r.fechaTexto}, {r.horaInicio} – {r.horaFin} {chipEstado(r)}</h2>
            <dl className="adm-datos">
              <dt>Reserva</dt><dd>{r.codigo} · {r.esPlan ? <>sesión de la suscripción{sus ? <> <Link href={`/admin/suscripciones/${sus.id}`}>{sus.planNombre} ({sus.codigo})</Link></> : null}</> : r.origen === 'web' ? 'reservada en la web' : r.origen === 'manual' ? 'apuntada a mano' : 'desde Calendly'}</dd>
              <dt>Duración</dt><dd>{r.duracionTexto} · {r.tipoDia === 'finde' ? 'fin de semana o festivo' : 'entre semana'}</dd>
              {r.esPlan && (<><dt>Horas del plan</dt><dd>{r.horasPlanTexto}{r.estado === 'cancelada' ? (r.cuentaComoUsada ? ' · cancelada, pero cuenta como usada' : ' · cancelada, no cuenta') : ''}</dd></>)}
              <dt>Importe</dt><dd>{r.esPlan && !r.precioCent ? (r.horasExtra > 0 ? `Incluida en la suscripción (${textoDuracion(r.horasExtra, { corto: true })} aparte, de regalo)` : 'Incluida en la suscripción') : <>{r.importe}{r.esPlan ? ' (horas aparte)' : ''} · {r.pagoTexto}{r.metodoPago && r.metodoPago !== 'plan' ? ` (${r.metodoPago})` : ''}{r.reembolso ? ` · devuelto ${r.reembolso}` : ''}</>}</dd>
              <dt>Correo</dt><dd>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</dd>
              <dt>WhatsApp</dt><dd>{telefono ? <a href={`https://wa.me/${telefono}`} target="_blank" rel="noopener noreferrer">{r.telefono}</a> : '—'}</dd>
              <dt>Actividad</dt><dd>{r.actividad || '—'}</dd>
              <dt>Fondos</dt><dd>{r.fondos}</dd>
              <dt>Equipo</dt><dd>{r.equipo.length ? r.equipo.join(', ') : 'Nada'}</dd>
              <dt>Factura</dt><dd>{r.factura ? `${r.factura.nombre} · ${r.factura.nif} · ${r.factura.direccion}` : 'No la pide'}</dd>
              <dt>Comentarios</dt><dd>{r.comentarios || '—'}</dd>
              {r.motivoCancelacion && (<><dt>Motivo</dt><dd>{r.motivoCancelacion}</dd></>)}
              <dt>Página del cliente</dt><dd><a href={enlaceCliente} target="_blank" rel="noopener noreferrer">Abrir</a></dd>
              <dt>Cobros del día</dt>
              <dd>
                {cobrosDia.map((x) => <span key={x.id} style={{ display: 'block' }}>{x.sentido === 'devolucion' ? 'Devolución: ' : ''}{x.concepto} · {(x.totalCent / 100).toFixed(2).replace('.', ',')} € (<Link href={`/admin/finanzas/ingresos/${x.id}`}>ver</Link>)</span>)}
                <Link href={`/admin/finanzas/ingresos/nuevo?reserva=${r.id}`}>Apuntar un cobro del día (fondos, equipo…)</Link>
              </dd>
            </dl>
          </div>

          <div className="adm-caja">
            <h2>Notas internas</h2>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Solo las ve el estudio" />
            <Mensaje estado={eNotas} />
            <p style={{ marginTop: 10 }}>
              <button type="button" className="adm-boton adm-boton--claro" disabled={eNotas.enviando} onClick={() => accionNotas({ accion: 'notas', notas }, 'Notas guardadas.')}>Guardar notas</button>
            </p>
          </div>

          {!r.esPlan && <div className="adm-caja">
            <h2>Pagos con tarjeta</h2>
            {pagos.length === 0 ? <p>Ninguno (reserva apuntada a mano o pagada por otra vía).</p> : (
              <table className="adm-tabla">
                <thead><tr><th>Pedido</th><th>TPV</th><th>Importe</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.pedido}><td>{p.pedido}</td><td>{p.proveedor}</td><td>{p.importe}</td><td>{p.estado}{p.codigoRespuesta ? ` (${p.codigoRespuesta})` : ''}</td><td>{p.creadoEn}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ marginTop: 10, fontSize: '0.85rem' }}>Las devoluciones se hacen desde el portal del TPV con el número de pedido.</p>
          </div>}

          <div className="adm-caja">
            <h2>Historial</h2>
            <ul className="adm-historial">
              {eventos.map((e, i) => (
                <li key={i}><time>{e.cuando}</time><span>{EVENTOS[e.tipo] || e.tipo}{e.texto ? ` · ${e.texto}` : ''}</span></li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          {r.estado === 'conflicto' && (
            <div className="adm-caja">
              <h2>Pago en revisión</h2>
              <p>Ha llegado el pago pero la hora chocaba con otra reserva o el importe no cuadraba. Habla con el cliente y muévela a una hora libre (abajo), o cancélala y devuelve el dinero desde el TPV.</p>
            </div>
          )}

          <div className="adm-caja">
            <h2>Factura</h2>
            {r.origen === 'calendly' ? (
              <p>Se cobró por Calendly: su factura está en Stripe.</p>
            ) : r.esPlan && !r.precioCent && !factura ? (
              <p>Incluida en la suscripción: no lleva factura propia. Se factura la cuota del mes desde <Link href={sus ? `/admin/suscripciones/${sus.id}` : '/admin/suscripciones'} className="adm-enlace">su ficha</Link>.</p>
            ) : factura ? (
              <>
                <p>{factura.codigo} · {factura.total}{factura.enviadaEn ? ` · enviada a ${factura.enviadaA}` : ' · sin enviar'}</p>
                <p style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a className="adm-boton adm-boton--claro" href={`/api/admin/facturas/${factura.id}`} target="_blank" rel="noopener noreferrer">Ver PDF</a>
                  {r.email && <button type="button" className="adm-boton adm-boton--claro" disabled={eFactura.enviando} onClick={() => accionFactura({ accion: 'factura' }, 'Reenviada.')}>Reenviar al cliente</button>}
                </p>
              </>
            ) : !emisorListo ? (
              <p>Faltan los datos de quien factura en Vercel (FACTURA_EMISOR_NOMBRE, FACTURA_EMISOR_NIF y FACTURA_EMISOR_DIRECCION).</p>
            ) : r.pagoEstado === 'pendiente' ? (
              <p>Se podrá emitir cuando esté pagada{r.factura ? '; como la ha pedido, saldrá sola al marcarla como pagada con el correo' : ''}.</p>
            ) : r.pagoEstado !== 'pagado' ? (
              <p>Tiene una devolución apuntada: si hace falta factura, hazla a mano por lo que se ha cobrado de verdad.</p>
            ) : !['confirmada', 'cancelada'].includes(r.estado) ? (
              <p>Resuelve antes la reserva (confírmala en una hora libre o cancélala).</p>
            ) : (
              <>
                <div className="adm-form">
                  <label className="adm-ancho">Nombre o razón social<input value={datosFactura.nombre} onChange={(e) => setDatosFactura({ ...datosFactura, nombre: e.target.value })} /></label>
                  <label>NIF o CIF<input value={datosFactura.nif} onChange={(e) => setDatosFactura({ ...datosFactura, nif: e.target.value })} /></label>
                  <label className="adm-ancho">Dirección<input value={datosFactura.direccion} onChange={(e) => setDatosFactura({ ...datosFactura, direccion: e.target.value })} /></label>
                </div>
                <p style={{ marginTop: 12 }}><button type="button" className="adm-boton" disabled={eFactura.enviando} onClick={() => accionFactura({ accion: 'factura', ...datosFactura }, '')}>{r.email ? 'Emitir y enviar factura' : 'Emitir factura'}</button></p>
              </>
            )}
            <Mensaje estado={eFactura} />
          </div>

          {!r.esPlan && r.estado === 'cancelada' && r.pagoEstado === 'pagado' && !r.reembolso && (
            <div className="adm-caja">
              <h2>Reactivar</h2>
              <p>Esta reserva está cancelada pero pagada. Si el cliente sigue viniendo, reactívala (se comprueba que la hora siga libre); si no, devuelve el pago desde el TPV.</p>
              <Mensaje estado={eReactivar} />
              <p style={{ marginTop: 12 }}><button type="button" className="adm-boton" disabled={eReactivar.enviando} onClick={() => accionReactivar({ accion: 'reactivar' }, 'Reserva reactivada.')}>Reactivar reserva</button></p>
            </div>
          )}

          {puedeCobrarse && (
            <div className="adm-caja">
              <h2>{r.esPlan ? 'Marcar las horas aparte como pagadas' : 'Marcar como pagada'}</h2>
              <div className="adm-form">
                <label className="adm-ancho">Cómo ha pagado
                  <select value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })}>
                    <option value="transferencia">Transferencia</option>
                    <option value="bizum">Bizum</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta (datáfono)</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label>Cobrada el<input type="date" max={hoy} value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} /></label>
                <p className="adm-nota" style={{ alignSelf: 'end' }}>Vacío = hoy. Cuenta en Finanzas el día del cobro.</p>
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={pago.enviarCorreo} onChange={(e) => setPago({ ...pago, enviarCorreo: e.target.checked })} /> Mandarle el correo de confirmación{r.factura ? ' y la factura' : ''}</label>}
              </div>
              <Mensaje estado={ePago} />
              <p style={{ marginTop: 12 }}><button type="button" className="adm-boton" disabled={ePago.enviando} onClick={() => accionPago({ accion: 'pagada', ...pago }, 'Marcada como pagada.')}>Marcar pagada</button></p>
            </div>
          )}

          {r.esPlan && r.estado === 'confirmada' && sus && (
            <div className="adm-caja">
              <h2>Cambiar día u hora</h2>
              {movida && <p className={`adm-mensaje${movida.error ? ' is-error' : ''}`}>{movida.texto}</p>}
              <SesionPlan
                susId={sus.id}
                accion="mover"
                reservaId={r.id}
                excluirId={r.id}
                textoBoton="Mover sesión"
                inicial={{ fecha: r.fecha, desde: r.horaInicio, hasta: r.horaFin, horasPlan: r.horasPlan, horasExtra: r.horasExtra, precioCent: r.precioCent }}
                datosExtra={{ enviarCorreo: mover.enviarCorreo }}
                onHecho={(res) => {
                  setMovida({ texto: ['Sesión movida.', res?.mensaje].filter(Boolean).join(' '), error: Boolean(res?.correoFallido) })
                  router.replace(router.asPath, undefined, { scroll: false })
                }}
              >
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={mover.enviarCorreo} onChange={(e) => setMover({ ...mover, enviarCorreo: e.target.checked })} /> Avisarle por correo</label>}
              </SesionPlan>
            </div>
          )}

          {!r.esPlan && ['confirmada', 'conflicto'].includes(r.estado) && (
            <div className="adm-caja">
              <h2>{r.estado === 'conflicto' ? 'Confirmar en una hora libre' : 'Cambiar día u hora'}</h2>
              <div className="adm-form">
                <label>Día<input type="date" value={mover.fecha} onChange={(e) => setMover({ ...mover, fecha: e.target.value })} /></label>
                <label>Desde<input type="time" step="900" value={mover.desde} onChange={(e) => setMover({ ...mover, desde: e.target.value })} /></label>
                <label>Hasta<input type="time" step="900" value={mover.hasta} onChange={(e) => setMover({ ...mover, hasta: e.target.value })} /></label>
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={mover.enviarCorreo} onChange={(e) => setMover({ ...mover, enviarCorreo: e.target.checked })} /> Avisar al cliente por correo</label>}
              </div>
              <p style={{ fontSize: '0.82rem', marginTop: 8 }}>El precio no cambia. Se comprueba que no choque con otra reserva ni con un bloqueo.</p>
              <Mensaje estado={eMover} />
              <p style={{ marginTop: 12 }}><button type="button" className="adm-boton" disabled={eMover.enviando} onClick={() => accionMover({ accion: 'mover', ...mover }, r.estado === 'conflicto' ? 'Reserva confirmada.' : 'Reserva movida.')}>{r.estado === 'conflicto' ? 'Confirmar reserva' : 'Mover reserva'}</button></p>
            </div>
          )}

          {r.estado !== 'cancelada' && (
            <div className="adm-caja">
              <h2>Cancelar</h2>
              {factura && <p className="adm-mensaje is-error" style={{ marginTop: 0 }}>Tiene la factura {factura.codigo}: si devuelves dinero, hay que hacer una factura rectificativa (de momento, a mano).</p>}
              {r.esPlan && (
                <p style={{ fontSize: '0.85rem', marginBottom: 10 }}>
                  {r.pasada ? 'La sesión ya ha pasado: según las condiciones, cuenta como usada.' : cuentaPorRegla ? `Faltan menos de ${sus.avisoCancelacionH} h: según las condiciones, cuenta como usada.` : `Faltan más de ${sus ? sus.avisoCancelacionH : 48} h: según las condiciones, no cuenta y recupera las horas.`}
                  {r.pagoEstado === 'pagado' && r.precioCent > 0 && ` Tenía ${r.importe} de horas aparte pagadas: ${cuentaPorRegla ? 'con menos de 48 h no se devuelven, salvo que lo acordéis' : 'se le devuelven'} (la devolución se hace aparte, en el banco o el TPV).`}
                </p>
              )}
              {!r.esPlan && r.pagoEstado === 'pagado' && <p style={{ fontSize: '0.85rem', marginBottom: 10 }}>Hoy, según las condiciones, le corresponde el {r.reembolsoHoyPct} % ({formatoEuros(Math.round((r.precioCent * r.reembolsoHoyPct) / 100))}). Cambia el importe si acordáis otra cosa. La devolución hay que hacerla después en el TPV.</p>}
              <div className="adm-form">
                <label className="adm-ancho">Motivo<input value={cancel.motivo} onChange={(e) => setCancel({ ...cancel, motivo: e.target.value })} /></label>
                {r.esPlan && <label className="adm-check adm-ancho"><input type="checkbox" checked={cancel.cuentaComoUsada ?? cuentaPorRegla} onChange={(e) => setCancel({ ...cancel, cuentaComoUsada: e.target.checked })} /> Cuenta como usada (gasta sus horas del plan)</label>}
                {r.pagoEstado === 'pagado' && r.precioCent > 0 && <label>Se devuelve (€){r.esPlan ? ' de las horas aparte' : ''}<input inputMode="decimal" value={cancel.reembolso} onChange={(e) => setCancel({ ...cancel, reembolso: e.target.value })} /></label>}
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={cancel.enviarCorreo} onChange={(e) => setCancel({ ...cancel, enviarCorreo: e.target.checked })} /> Avisar al cliente por correo</label>}
              </div>
              <Mensaje estado={eCancel} />
              <p style={{ marginTop: 12 }}>
                <button type="button" className="adm-boton adm-boton--peligro" disabled={eCancel.enviando} onClick={() => { if (window.confirm('¿Cancelar esta reserva? La hora queda libre.')) accionCancel({ accion: 'cancelar', ...cancel }, 'Reserva cancelada.') }}>Cancelar reserva</button>
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}

function textoEvento(e) {
  const d = e.detalle || {}
  if (e.tipo === 'pagada_a_mano') return d.metodo
  if (e.tipo === 'cancelada') return [d.motivo, d.reembolsoCent ? `devolución ${formatoEuros(d.reembolsoCent)}` : null].filter(Boolean).join(' · ')
  if (e.tipo === 'solicitud_cliente') return `${d.tipo === 'cancelar' ? 'cancelar' : 'cambiar'}${d.mensaje ? `: «${d.mensaje}»` : ''}`
  if (e.tipo === 'pago_fallido') return d.codigo ? `código ${d.codigo}` : ''
  if (e.tipo === 'pagada' && d.aviso && d.aviso !== 'confirmada') return `aviso: ${d.aviso}`
  if (e.tipo === 'movida' && d.antes) return `antes ${fechaHoraTexto(d.antes.inicio)}`
  if (e.tipo === 'correo_fallido' || e.tipo === 'factura_fallida') return d.error
  if (e.tipo === 'factura_emitida') return d.codigo
  if (e.tipo === 'factura_enviada') return `${d.codigo} a ${d.a}`
  return ''
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const reserva = await reservaPorId(ctx.params.id)
  if (!reserva) return { notFound: true }
  const [pagos, eventos, factura, sus] = await Promise.all([pagosDeReserva(reserva.id), eventosDeReserva(reserva.id), facturaDeReserva(reserva.id), suscripcionCorta(reserva.suscripcionId)])
  return {
    props: {
      r: vistaAdmin(reserva),
      sus,
      cuentaPorRegla: Boolean(sus && reserva.origen === 'plan' && cancelacionCuenta(sus, reserva, new Date())),
      cobrosDia: await ingresosDeReserva(reserva.id),
      hoy: fechaMadrid(new Date()),
      factura: factura ? { id: factura.id, codigo: factura.codigo, total: formatoEuros(factura.totalCent), enviadaEn: factura.enviadaEn, enviadaA: factura.enviadaA } : null,
      emisorListo: Boolean(emisor()),
      enlaceCliente: `${urlBase(ctx.req)}/reserva/${reserva.token}`,
      pagos: pagos.map((p) => ({ pedido: p.pedido, proveedor: p.proveedor, importe: formatoEuros(p.importeCent), estado: p.estado, codigoRespuesta: p.codigoRespuesta, creadoEn: fechaHoraTexto(p.creadoEn) })),
      eventos: eventos.map((e) => ({ tipo: e.tipo, cuando: fechaHoraTexto(e.creadoEn), texto: textoEvento(e) || null })),
    },
  }
}
