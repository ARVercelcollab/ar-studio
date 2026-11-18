// Ficha de una reserva con sus acciones
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import Panel, { chipEstado } from '../../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { vistaAdmin, fechaHoraTexto } from '../../../lib/admin/vista'
import { reservaPorId, pagosDeReserva, eventosDeReserva } from '../../../lib/reservas/servicio'
import { formatoEuros } from '../../../lib/reservas/config'
import { pedirJson } from '../../../lib/reservas/navegador'
import { urlBase } from '../../../lib/http'

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
}

function useAccion(id) {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: false, mensaje: null, error: false })
  async function ejecutar(datos, textoOk) {
    setEstado({ enviando: true, mensaje: null, error: false })
    try {
      await pedirJson(`/api/admin/reservas/${id}`, { method: 'POST', body: datos })
      setEstado({ enviando: false, mensaje: textoOk, error: false })
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

export default function FichaReserva({ r, pagos, eventos, enlaceCliente }) {
  const [pago, setPago] = useState({ metodo: 'transferencia', enviarCorreo: false })
  const [mover, setMover] = useState({ fecha: r.fecha, hora: r.horaInicio, horas: r.duracionHoras, enviarCorreo: true })
  const [cancel, setCancel] = useState({ motivo: '', reembolso: r.pagoEstado === 'pagado' ? ((r.precioCent * r.reembolsoHoyPct) / 10000).toFixed(2) : '0', enviarCorreo: true })
  const [notas, setNotas] = useState(r.notasInternas)
  const [ePago, accionPago] = useAccion(r.id)
  const [eMover, accionMover] = useAccion(r.id)
  const [eCancel, accionCancel] = useAccion(r.id)
  const [eNotas, accionNotas] = useAccion(r.id)

  const activa = ['confirmada', 'pendiente', 'conflicto'].includes(r.estado)
  const telefono = (r.telefono || '').replace(/[^0-9]/g, '')

  return (
    <Panel titulo={`${r.nombre} ${r.apellidos}`} acciones={<Link href="/admin" className="adm-boton adm-boton--claro">← Agenda</Link>}>
      <div className="adm-dos">
        <div>
          <div className="adm-caja">
            <h2>{r.fechaTexto}, {r.horaInicio} – {r.horaFin} {chipEstado(r)}</h2>
            <dl className="adm-datos">
              <dt>Reserva</dt><dd>{r.codigo} · {r.origen === 'web' ? 'reservada en la web' : r.origen === 'manual' ? 'apuntada a mano' : 'desde Calendly'}</dd>
              <dt>Duración</dt><dd>{r.duracionHoras} h · {r.tipoDia === 'finde' ? 'fin de semana o festivo' : 'entre semana'}</dd>
              <dt>Importe</dt><dd>{r.importe} · {r.pagoTexto}{r.metodoPago ? ` (${r.metodoPago})` : ''}{r.reembolso ? ` · devuelto ${r.reembolso}` : ''}</dd>
              <dt>Correo</dt><dd>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</dd>
              <dt>WhatsApp</dt><dd>{telefono ? <a href={`https://wa.me/${telefono}`} target="_blank" rel="noopener noreferrer">{r.telefono}</a> : '—'}</dd>
              <dt>Actividad</dt><dd>{r.actividad || '—'}</dd>
              <dt>Fondos</dt><dd>{r.fondos}</dd>
              <dt>Equipo</dt><dd>{r.equipo.length ? r.equipo.join(', ') : 'Nada'}</dd>
              <dt>Factura</dt><dd>{r.factura ? `${r.factura.nombre} · ${r.factura.nif} · ${r.factura.direccion}` : 'No la pide'}</dd>
              <dt>Comentarios</dt><dd>{r.comentarios || '—'}</dd>
              {r.motivoCancelacion && (<><dt>Motivo</dt><dd>{r.motivoCancelacion}</dd></>)}
              <dt>Página del cliente</dt><dd><a href={enlaceCliente} target="_blank" rel="noopener noreferrer">Abrir</a></dd>
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

          <div className="adm-caja">
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
          </div>

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
          {activa && r.pagoEstado !== 'pagado' && (
            <div className="adm-caja">
              <h2>Marcar como pagada</h2>
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
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={pago.enviarCorreo} onChange={(e) => setPago({ ...pago, enviarCorreo: e.target.checked })} /> Mandarle el correo de confirmación</label>}
              </div>
              <Mensaje estado={ePago} />
              <p style={{ marginTop: 12 }}><button type="button" className="adm-boton" disabled={ePago.enviando} onClick={() => accionPago({ accion: 'pagada', ...pago }, 'Marcada como pagada.')}>Marcar pagada</button></p>
            </div>
          )}

          {r.estado === 'confirmada' && (
            <div className="adm-caja">
              <h2>Cambiar día u hora</h2>
              <div className="adm-form">
                <label>Día<input type="date" value={mover.fecha} onChange={(e) => setMover({ ...mover, fecha: e.target.value })} /></label>
                <label>Hora de inicio<input type="time" step="1800" value={mover.hora} onChange={(e) => setMover({ ...mover, hora: e.target.value })} /></label>
                <label>Horas<input type="number" min="1" max="14" value={mover.horas} onChange={(e) => setMover({ ...mover, horas: e.target.value })} /></label>
                {r.email && <label className="adm-check adm-ancho"><input type="checkbox" checked={mover.enviarCorreo} onChange={(e) => setMover({ ...mover, enviarCorreo: e.target.checked })} /> Avisar al cliente por correo</label>}
              </div>
              <p style={{ fontSize: '0.82rem', marginTop: 8 }}>El precio no cambia. Se comprueba que no choque con otra reserva ni con un bloqueo.</p>
              <Mensaje estado={eMover} />
              <p style={{ marginTop: 12 }}><button type="button" className="adm-boton" disabled={eMover.enviando} onClick={() => accionMover({ accion: 'mover', ...mover }, 'Reserva movida.')}>Mover reserva</button></p>
            </div>
          )}

          {r.estado !== 'cancelada' && (
            <div className="adm-caja">
              <h2>Cancelar</h2>
              {r.pagoEstado === 'pagado' && <p style={{ fontSize: '0.85rem', marginBottom: 10 }}>Hoy, según las condiciones, le corresponde el {r.reembolsoHoyPct} % ({formatoEuros(Math.round((r.precioCent * r.reembolsoHoyPct) / 100))}). Cambia el importe si acordáis otra cosa. La devolución hay que hacerla después en el TPV.</p>}
              <div className="adm-form">
                <label className="adm-ancho">Motivo<input value={cancel.motivo} onChange={(e) => setCancel({ ...cancel, motivo: e.target.value })} /></label>
                {r.pagoEstado === 'pagado' && <label>Se devuelve (€)<input inputMode="decimal" value={cancel.reembolso} onChange={(e) => setCancel({ ...cancel, reembolso: e.target.value })} /></label>}
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
  if (e.tipo === 'correo_fallido') return d.error
  return ''
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const reserva = await reservaPorId(ctx.params.id)
  if (!reserva) return { notFound: true }
  const [pagos, eventos] = await Promise.all([pagosDeReserva(reserva.id), eventosDeReserva(reserva.id)])
  return {
    props: {
      r: vistaAdmin(reserva),
      enlaceCliente: `${urlBase(ctx.req)}/reserva/${reserva.token}`,
      pagos: pagos.map((p) => ({ pedido: p.pedido, proveedor: p.proveedor, importe: formatoEuros(p.importeCent), estado: p.estado, codigoRespuesta: p.codigoRespuesta, creadoEn: fechaHoraTexto(p.creadoEn) })),
      eventos: eventos.map((e) => ({ tipo: e.tipo, cuando: fechaHoraTexto(e.creadoEn), texto: textoEvento(e) || null })),
    },
  }
}
