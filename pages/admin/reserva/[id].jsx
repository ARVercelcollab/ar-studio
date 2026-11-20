// Ficha de una reserva con sus acciones
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel from '../../../components/admin/Panel'
import SesionPlan from '../../../components/admin/SesionPlan'
import { Tarjeta, Datos, Boton, Contacto, Etiqueta, Aviso } from '../../../components/admin/ui'
import { EtiquetaEstado, EtiquetaFactura } from '../../../components/admin/reservas/comun'
import { vecesDeReservas } from '../../../lib/reservas/clientes'
import { textoVez } from '../../../lib/reservas/clientes-vista'
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

export default function FichaReserva({ r, sus, cuentaPorRegla, pagos, eventos, enlaceCliente, factura, emisorListo, cobrosDia, hoy, cliente }) {
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
  const formularioFactura = (texto, boton) => (
    <>
      {texto && <p className="adm-nota rsv-texto-bloque">{texto}</p>}
      <div className="adm-form">
        <label className="adm-ancho">Nombre o razón social<input value={datosFactura.nombre} onChange={(e) => setDatosFactura({ ...datosFactura, nombre: e.target.value })} /></label>
        <label>NIF o CIF<input value={datosFactura.nif} onChange={(e) => setDatosFactura({ ...datosFactura, nif: e.target.value })} /></label>
        <label className="adm-ancho">Dirección<input value={datosFactura.direccion} onChange={(e) => setDatosFactura({ ...datosFactura, direccion: e.target.value })} /></label>
      </div>
      <div className="rsv-pie-acciones"><Boton disabled={eFactura.enviando} onClick={() => accionFactura({ accion: 'factura', ...datosFactura }, '')}>{boton}</Boton></div>
    </>
  )

  const puedeCobrarse = r.pagoEstado !== 'pagado' && r.estado !== 'cancelada'
  const nombre = `${r.nombre} ${r.apellidos}`.trim()
  const origenTexto = r.esPlan ? 'sesión de la suscripción' : r.origen === 'web' ? 'reservada en la web' : r.origen === 'manual' ? 'apuntada a mano' : 'desde Calendly'
  const importeTexto = r.esPlan && !r.precioCent
    ? (r.horasExtra > 0 ? `Incluida en la suscripción (${textoDuracion(r.horasExtra, { corto: true })} aparte, de regalo)` : 'Incluida en la suscripción')
    : <><span className="ui-imp">{r.importe}</span>{r.esPlan ? ' (horas aparte)' : ''} · {r.pagoTexto}{r.metodoPago && r.metodoPago !== 'plan' ? ` (${r.metodoPago})` : ''}{r.reembolso ? <> · devuelto <span className="ui-imp">{r.reembolso}</span></> : ''}</>

  return (
    <Panel
      titulo={nombre}
      sub={`${r.fechaTexto}, de ${r.horaInicio} a ${r.horaFin} · ${r.duracionTexto} · ${r.codigo}`}
      clase="adm-reservas"
      acciones={(
        <>
          <Boton variante="secundario" href="/admin/reservas" icono="izq">Reservas</Boton>
          {cliente && <Boton variante="secundario" href={`/admin/reservas/clientes?c=${encodeURIComponent(cliente.clave)}`} icono="persona">Su ficha de cliente</Boton>}
          {sus && <Boton variante="secundario" href={`/admin/miembros/${sus.id}`} icono="gente">Su suscripción</Boton>}
        </>
      )}
    >
      {r.esPlan && sus?.impago && ['pendiente', 'confirmada'].includes(r.estado) && <Aviso tono="mal">{sus.impago}</Aviso>}
      {r.estado === 'conflicto' && (
        <Aviso tono="mal" titulo="Pago en revisión.">Ha llegado el pago pero la hora chocaba con otra reserva o el importe no cuadraba. Habla con el cliente y muévela a una hora libre, o cancélala y devuelve el dinero desde el TPV.</Aviso>
      )}

      <div className="rsv-ficha-reserva">
        <div className="rsv-ficha-reserva__col">
          <Tarjeta titulo={<span className="rsv-titulo-estado">{r.fechaTexto}, {r.horaInicio} – {r.horaFin} <EtiquetaEstado r={r} /></span>}>
            <div className="rsv-cliente-linea">
              <div>
                <b>{nombre}</b>
                {cliente && (
                  <span className="ui-t3">
                    {cliente.vez ? `Es su ${textoVez(cliente.vez)}` : 'Reserva cancelada'} · {cliente.total} {cliente.total === 1 ? 'reserva' : 'reservas'} en total ·{' '}
                    <Link href={`/admin/reservas/clientes?c=${encodeURIComponent(cliente.clave)}`}>ver su ficha</Link>
                  </span>
                )}
              </div>
              <Contacto telefono={r.telefono} email={r.email} nombre={r.nombre} conCorreo />
            </div>
            <Datos filas={[
              ['Reserva', <>{r.codigo} · {origenTexto}{r.esPlan && sus ? <> · <Link href={`/admin/miembros/${sus.id}`}>{sus.planNombre} ({sus.codigo})</Link></> : null}</>],
              ['Duración', `${r.duracionTexto} · ${r.tipoDia === 'finde' ? 'fin de semana o festivo' : 'entre semana'}`],
              r.esPlan ? ['Horas del plan', `${r.horasPlanTexto}${r.estado === 'cancelada' ? (r.cuentaComoUsada ? ' · cancelada, pero cuenta como usada' : ' · cancelada, no cuenta') : ''}`] : ['', null],
              ['Importe', importeTexto],
              ['Correo', r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'],
              ['WhatsApp', r.telefono || '—'],
              ['Actividad', r.actividad || '—'],
              ['Fondos', r.fondos],
              ['Equipo', r.equipo.length ? r.equipo.join(', ') : 'Nada'],
              ['Datos de factura', r.factura ? `${r.factura.nombre} · ${r.factura.nif} · ${r.factura.direccion}` : 'No los ha dado (lleva factura simplificada)'],
              ['Comentarios', r.comentarios || '—'],
              r.motivoCancelacion ? ['Motivo', r.motivoCancelacion] : ['', null],
              ['Página del cliente', <a key="p" href={enlaceCliente} target="_blank" rel="noopener noreferrer">Abrir</a>],
            ]} />
            <div className="rsv-cobros-dia">
              <h3>Cobros del día</h3>
              {cobrosDia.length === 0 && <p className="ui-t3 rsv-peq">Ninguno (fondos, equipo…).</p>}
              {cobrosDia.map((x) => <p key={x.id} className="rsv-peq">{x.sentido === 'devolucion' ? 'Devolución: ' : ''}{x.concepto} · <span className="ui-imp">{(x.totalCent / 100).toFixed(2).replace('.', ',')} €</span> (<Link href={`/admin/movimientos/ingresos/${x.id}`}>ver</Link>)</p>)}
              <Boton variante="texto" tam="peq" icono="mas" href={`/admin/movimientos/ingresos/nuevo?reserva=${r.id}`}>Apuntar un cobro del día</Boton>
            </div>
          </Tarjeta>

          <Tarjeta titulo={<label htmlFor="rsv-notas-reserva">Notas internas</label>} nota="Solo las ve el estudio.">
            <textarea id="rsv-notas-reserva" className="ui-control rsv-notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Lo que conviene saber de esta reserva" />
            <Mensaje estado={eNotas} />
            <div className="rsv-pie-acciones">
              <Boton variante="secundario" disabled={eNotas.enviando} onClick={() => accionNotas({ accion: 'notas', notas }, 'Notas guardadas.')}>Guardar notas</Boton>
            </div>
          </Tarjeta>

          {!r.esPlan && (
            <Tarjeta titulo="Pagos con tarjeta" nota="Las devoluciones se hacen desde el portal del TPV con el número de pedido." tabla={pagos.length > 0}>
              {pagos.length === 0 ? <p className="ui-t3 rsv-peq">Ninguno (reserva apuntada a mano o pagada por otra vía).</p> : (
                <div className="ui-tabla-caja">
                  <table className="ui-tabla">
                    <thead><tr><th scope="col">Pedido</th><th scope="col">TPV</th><th scope="col" className="der">Importe</th><th scope="col">Estado</th><th scope="col">Fecha</th></tr></thead>
                    <tbody>
                      {pagos.map((p) => (
                        <tr key={p.pedido}><td>{p.pedido}</td><td>{p.proveedor}</td><td className="der ui-imp">{p.importe}</td><td>{p.estado}{p.codigoRespuesta ? ` (${p.codigoRespuesta})` : ''}</td><td>{p.creadoEn}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>
          )}

          <Tarjeta titulo="Historial">
            <ul className="rsv-historial">
              {eventos.map((e, i) => (
                <li key={i}><time>{e.cuando}</time><span>{EVENTOS[e.tipo] || e.tipo}{e.texto ? ` · ${e.texto}` : ''}</span></li>
              ))}
            </ul>
          </Tarjeta>
        </div>

        <div className="rsv-ficha-reserva__col">
          <Tarjeta titulo="Factura" acciones={factura ? <EtiquetaFactura factura={{ codigo: factura.codigo, tipo: factura.simplificada ? 'simplificada' : 'completa' }} /> : null}>
            {r.origen === 'calendly' ? (
              <p>Se cobró por Calendly: su factura está en Stripe.</p>
            ) : r.esPlan && !r.precioCent && !factura ? (
              <p>Incluida en la suscripción: no lleva factura propia. Se factura la cuota del mes desde <Link href={sus ? `/admin/miembros/${sus.id}` : '/admin/miembros'}>su ficha</Link>.</p>
            ) : factura ? (
              <>
                <p>{factura.simplificada ? 'Factura simplificada (ticket) ' : 'Factura '}{factura.codigo} · <span className="ui-imp">{factura.total}</span>{factura.enviadaEn ? ` · enviada a ${factura.enviadaA}` : ' · sin enviar'}</p>
                {factura.sustituye && <p className="ui-t3 rsv-peq">Sustituye a la factura simplificada {factura.sustituye}.</p>}
                <div className="rsv-pie-acciones">
                  <Boton variante="secundario" href={`/api/admin/facturas/${factura.id}`} externo icono="doc">Ver PDF</Boton>
                  {r.email && <Boton variante="secundario" disabled={eFactura.enviando} onClick={() => accionFactura({ accion: 'factura' }, 'Reenviada.')} icono="correo">Reenviar al cliente</Boton>}
                </div>
                {factura.simplificada && r.pagoEstado === 'pagado' && (
                  <div className="rsv-separado">
                    {formularioFactura('¿Pide la factura con sus datos? Con nombre, NIF y dirección se hace la completa, que sustituye a esta simplificada.', r.email ? 'Hacer la completa y enviarla' : 'Hacer la completa')}
                  </div>
                )}
              </>
            ) : !emisorListo ? (
              <p>Faltan los datos de quien factura en Vercel (FACTURA_EMISOR_NOMBRE, FACTURA_EMISOR_NIF y FACTURA_EMISOR_DIRECCION).</p>
            ) : r.pagoEstado === 'pendiente' ? (
              <p>Saldrá sola al marcarla como pagada: {r.factura ? 'la completa, con los datos que ha dado' : 'la simplificada, porque no ha dado datos de facturación'}.</p>
            ) : r.pagoEstado !== 'pagado' ? (
              <p>Tiene una devolución apuntada: si hace falta factura, hazla a mano por lo que se ha cobrado de verdad.</p>
            ) : !['confirmada', 'cancelada'].includes(r.estado) ? (
              <p>Resuelve antes la reserva (confírmala en una hora libre o cancélala).</p>
            ) : (
              formularioFactura('Con nombre, NIF y dirección sale la factura completa. Si lo dejas vacío, sale la simplificada.', r.email ? 'Emitir y enviar factura' : 'Emitir factura')
            )}
            <Mensaje estado={eFactura} />
          </Tarjeta>

          {!r.esPlan && r.estado === 'cancelada' && r.pagoEstado === 'pagado' && !r.reembolso && (
            <Tarjeta titulo="Reactivar" tono="aviso">
              <p>Esta reserva está cancelada pero pagada. Si el cliente sigue viniendo, reactívala (se comprueba que la hora siga libre); si no, devuelve el pago desde el TPV.</p>
              <Mensaje estado={eReactivar} />
              <div className="rsv-pie-acciones"><Boton disabled={eReactivar.enviando} onClick={() => accionReactivar({ accion: 'reactivar' }, 'Reserva reactivada.')}>Reactivar reserva</Boton></div>
            </Tarjeta>
          )}

          {puedeCobrarse && (
            <Tarjeta titulo={r.esPlan ? 'Marcar las horas aparte como pagadas' : 'Marcar como pagada'}>
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
                <p className="adm-nota" style={{ alignSelf: 'end' }}>Vacío = hoy. Cuenta en Movimientos el día del cobro.</p>
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={pago.enviarCorreo} onChange={(e) => setPago({ ...pago, enviarCorreo: e.target.checked })} /> Mandarle el correo de confirmación y la factura</label>}
              </div>
              <Mensaje estado={ePago} />
              <div className="rsv-pie-acciones"><Boton disabled={ePago.enviando} onClick={() => accionPago({ accion: 'pagada', ...pago }, 'Marcada como pagada.')} icono="check">Marcar pagada</Boton></div>
            </Tarjeta>
          )}

          {r.esPlan && r.estado === 'confirmada' && sus && (
            <Tarjeta titulo="Cambiar día u hora">
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
            </Tarjeta>
          )}

          {!r.esPlan && ['confirmada', 'conflicto'].includes(r.estado) && (
            <Tarjeta titulo={r.estado === 'conflicto' ? 'Confirmar en una hora libre' : 'Cambiar día u hora'} nota="El precio no cambia. Se comprueba que no choque con otra reserva ni con un bloqueo.">
              <div className="adm-form">
                <label>Día<input type="date" value={mover.fecha} onChange={(e) => setMover({ ...mover, fecha: e.target.value })} /></label>
                <label>Desde<input type="time" step="900" value={mover.desde} onChange={(e) => setMover({ ...mover, desde: e.target.value })} /></label>
                <label>Hasta<input type="time" step="900" value={mover.hasta} onChange={(e) => setMover({ ...mover, hasta: e.target.value })} /></label>
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={mover.enviarCorreo} onChange={(e) => setMover({ ...mover, enviarCorreo: e.target.checked })} /> Avisar al cliente por correo</label>}
              </div>
              <Mensaje estado={eMover} />
              <div className="rsv-pie-acciones"><Boton disabled={eMover.enviando} onClick={() => accionMover({ accion: 'mover', ...mover }, r.estado === 'conflicto' ? 'Reserva confirmada.' : 'Reserva movida.')}>{r.estado === 'conflicto' ? 'Confirmar reserva' : 'Mover reserva'}</Boton></div>
            </Tarjeta>
          )}

          {r.estado !== 'cancelada' && (
            <Tarjeta titulo="Cancelar">
              {factura && <Aviso tono="aviso">Tiene la factura {factura.codigo}: si devuelves dinero, hay que hacer una factura rectificativa (de momento, a mano).</Aviso>}
              {r.esPlan && (
                <p className="rsv-peq rsv-texto-bloque">
                  {r.pasada ? 'La sesión ya ha pasado: según las condiciones, cuenta como usada.' : cuentaPorRegla ? `Faltan menos de ${sus.avisoCancelacionH} h: según las condiciones, cuenta como usada.` : `Faltan más de ${sus ? sus.avisoCancelacionH : 48} h: según las condiciones, no cuenta y recupera las horas.`}
                  {r.pagoEstado === 'pagado' && r.precioCent > 0 && ` Tenía ${r.importe} de horas aparte pagadas: ${cuentaPorRegla ? 'con menos de 48 h no se devuelven, salvo que lo acordéis' : 'se le devuelven'} (la devolución se hace aparte, en el banco o el TPV).`}
                </p>
              )}
              {!r.esPlan && r.pagoEstado === 'pagado' && <p className="rsv-peq rsv-texto-bloque">Hoy, según las condiciones, le corresponde el {r.reembolsoHoyPct} % ({formatoEuros(Math.round((r.precioCent * r.reembolsoHoyPct) / 100))}). Cambia el importe si acordáis otra cosa. La devolución hay que hacerla después en el TPV.</p>}
              <div className="adm-form">
                <label className="adm-ancho">Motivo<input value={cancel.motivo} onChange={(e) => setCancel({ ...cancel, motivo: e.target.value })} /></label>
                {r.esPlan && <label className="adm-check adm-ancho"><input type="checkbox" checked={cancel.cuentaComoUsada ?? cuentaPorRegla} onChange={(e) => setCancel({ ...cancel, cuentaComoUsada: e.target.checked })} /> Cuenta como usada (gasta sus horas del plan)</label>}
                {r.pagoEstado === 'pagado' && r.precioCent > 0 && <label>Se devuelve (€){r.esPlan ? ' de las horas aparte' : ''}<input inputMode="decimal" value={cancel.reembolso} onChange={(e) => setCancel({ ...cancel, reembolso: e.target.value })} /></label>}
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={cancel.enviarCorreo} onChange={(e) => setCancel({ ...cancel, enviarCorreo: e.target.checked })} /> Avisar al cliente por correo</label>}
              </div>
              <Mensaje estado={eCancel} />
              <div className="rsv-pie-acciones">
                <Boton variante="peligro" disabled={eCancel.enviando} onClick={() => { if (window.confirm('¿Cancelar esta reserva? La hora queda libre.')) accionCancel({ accion: 'cancelar', ...cancel }, 'Reserva cancelada.') }}>Cancelar reserva</Boton>
              </div>
            </Tarjeta>
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
  const [pagos, eventos, factura, sus, veces] = await Promise.all([pagosDeReserva(reserva.id), eventosDeReserva(reserva.id), facturaDeReserva(reserva.id), suscripcionCorta(reserva.suscripcionId), vecesDeReservas([reserva.id])])
  const vez = veces.get(reserva.id)
  return {
    props: {
      r: vistaAdmin(reserva),
      sus,
      cuentaPorRegla: Boolean(sus && reserva.origen === 'plan' && cancelacionCuenta(sus, reserva, new Date())),
      cobrosDia: await ingresosDeReserva(reserva.id),
      hoy: fechaMadrid(new Date()),
      factura: factura ? { id: factura.id, codigo: factura.codigo, total: formatoEuros(factura.totalCent), enviadaEn: factura.enviadaEn, enviadaA: factura.enviadaA, simplificada: factura.simplificada, sustituye: factura.sustituye?.codigo || null } : null,
      emisorListo: Boolean(emisor()),
      cliente: vez ? { clave: vez.clave, vez: vez.vez, total: vez.total } : null,
      enlaceCliente: `${urlBase(ctx.req)}/reserva/${reserva.token}`,
      pagos: pagos.map((p) => ({ pedido: p.pedido, proveedor: p.proveedor, importe: formatoEuros(p.importeCent), estado: p.estado, codigoRespuesta: p.codigoRespuesta, creadoEn: fechaHoraTexto(p.creadoEn) })),
      eventos: eventos.map((e) => ({ tipo: e.tipo, cuando: fechaHoraTexto(e.creadoEn), texto: textoEvento(e) || null })),
    },
  }
}
