// Ficha lateral de un cliente: datos, cifras, lo que suele hacer, próximas reservas, historial y
// las notas del estudio (se guardan en la base de datos).
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Ficha, FichaBloque, Datos, Boton, Contacto, Etiqueta } from '../ui'
import { EtiquetasCliente, EtiquetaFactura, fechaCorta, mesAnio, euros, plural, horasTexto, diaDe, hrefNuevaReserva } from './comun'
import { pedirJson } from '../../../lib/reservas/navegador'

function FilaReserva({ r, hoy }) {
  const dia = diaDe(r.inicio)
  return (
    <li className="rsv-lista-res__fila">
      <div className="rsv-lista-res__crece">
        <b>{fechaCorta(dia, { anio: true })} · {horasTexto(r.horas)}</b>
        <span className="ui-t3">{r.actividad || 'Reserva'}{r.fondos ? ` · ${r.fondos}` : ''}</span>
        <span className="rsv-etiquetas">
          {r.origen === 'calendly' ? <Etiqueta tono="borde">Calendly</Etiqueta> : r.factura ? <EtiquetaFactura factura={r.factura} /> : null}
          {r.estado === 'cancelada' && <Etiqueta tono="borde">Cancelada</Etiqueta>}
          {r.estado === 'conflicto' && <Etiqueta tono="mal" punto>Revisar pago</Etiqueta>}
          {r.estado !== 'cancelada' && r.pagoEstado === 'pendiente' && r.precioCent > 0 && <Etiqueta tono="aviso" punto>Sin pagar</Etiqueta>}
          {r.estado !== 'cancelada' && dia >= hoy && r.pagoEstado !== 'pendiente' && <Etiqueta tono="marron" punto>Reservada</Etiqueta>}
        </span>
      </div>
      <span className="ui-imp ui-num rsv-lista-res__importe">{r.incluida ? <span className="ui-t3">Incluida</span> : r.importada ? <span className="ui-t3" title="Cobrada por Calendly (Stripe)">Calendly</span> : euros(r.pagoEstado === 'pendiente' ? r.precioCent : r.pagadoCent)}</span>
      <Link href={`/admin/reserva/${r.id}`} className="ui-boton ui-boton--texto ui-boton--peq" aria-label={`Ver la reserva del ${fechaCorta(dia, { anio: true })}`}>Ver</Link>
    </li>
  )
}

function Notas({ c }) {
  const [notas, setNotas] = useState(c.notas)
  const [guardadas, setGuardadas] = useState(c.notas)
  const [estado, setEstado] = useState({ enviando: false, texto: null, error: false })
  useEffect(() => {
    setNotas(c.notas)
    setGuardadas(c.notas)
    setEstado({ enviando: false, texto: null, error: false })
  }, [c.clave, c.notas])
  const cambiada = notas !== guardadas
  async function guardar() {
    setEstado({ enviando: true, texto: null, error: false })
    try {
      const r = await pedirJson('/api/admin/clientes/notas', { method: 'POST', body: { clave: c.clave, notas } })
      setGuardadas(r.notas)
      setNotas(r.notas)
      setEstado({ enviando: false, texto: r.mensaje, error: false })
    } catch (e) {
      setEstado({ enviando: false, texto: e.message, error: true })
    }
  }
  return (
    <FichaBloque titulo={<label htmlFor="rsv-notas-cliente">Notas del estudio</label>}>
      <textarea id="rsv-notas-cliente" className="ui-control rsv-notas" rows={3} value={notas} maxLength={4000}
        onChange={(e) => setNotas(e.target.value)} placeholder="Lo que conviene recordar de esta persona (solo lo ve el estudio)" />
      <div className="rsv-notas__pie">
        <Boton variante="secundario" tam="peq" disabled={estado.enviando || !cambiada} onClick={guardar}>{estado.enviando ? 'Guardando…' : 'Guardar notas'}</Boton>
        {estado.texto && <span className={estado.error ? 'ui-mal' : 'ui-t3'} role="status">{estado.texto}</span>}
      </div>
    </FichaBloque>
  )
}

export default function FichaCliente({ c, hoy, onCerrar }) {
  if (!c) return <Ficha abierta={false} />
  const nombre = `${c.nombre} ${c.apellidos}`.trim()
  const maxAct = c.actividades.length ? c.actividades[0][1] : 1
  const pide = [...c.fondos, ...c.equipo]
  const sub = [c.desde ? `Cliente desde ${mesAnio(diaDe(c.desde))}` : null, c.total ? plural(c.total, 'reserva', 'reservas') : 'sin reservas aún'].filter(Boolean).join(' · ')
  return (
    <Ficha abierta titulo={nombre || 'Cliente'} sub={sub} onCerrar={onCerrar} ancho={500}>
      <div className="rsv-etiquetas rsv-ficha-etiquetas">
        <EtiquetasCliente c={c} enlazar />
        {c.deCalendly > 0 && <Etiqueta tono="borde">{c.deCalendly} por Calendly</Etiqueta>}
      </div>
      <div className="rsv-ficha-acciones">
        <Contacto telefono={c.telefono} email={c.email} nombre={c.nombre} conCorreo />
        {c.miembro
          ? <Boton tam="peq" icono="mas" href={`/admin/miembros/${c.miembro.id}`}>Reservar sesión del plan</Boton>
          : <Boton tam="peq" icono="mas" href={hrefNuevaReserva(c)}>Nueva reserva para este cliente</Boton>}
      </div>

      <Datos filas={[
        ['Correo', c.email || '—'],
        ['WhatsApp', c.telefono || '—'],
        ['Facturación', c.factura
          ? <>{c.factura.nombre}<br /><span className="ui-t3">NIF {c.factura.nif}{c.factura.direccion ? ` · ${c.factura.direccion}` : ''}</span></>
          : <span className="ui-t3">No ha pedido factura con sus datos: se le hace el ticket (AR-S).</span>],
      ]} />

      <div className="rsv-mini-cifras">
        <div><span>Reservas este año</span><b>{c.anio}</b></div>
        <div><span>Reservas en total</span><b>{c.total}</b></div>
        <div><span>Horas en total</span><b>{horasTexto(c.horas)}</b></div>
        <div><span>Pagado en total</span><b className="ui-imp">{euros(c.pagadoCent, { decimales: false })}</b>{c.cuotas > 0 && <small>con {plural(c.cuotas, 'cuota', 'cuotas')} del plan</small>}</div>
        <div><span>Media por reserva</span><b className="ui-imp">{c.mediaCent ? euros(c.mediaCent, { decimales: false }) : '—'}</b></div>
        <div><span>Primera y última</span><b className="rsv-mini-cifras__fechas">{c.primera ? fechaCorta(diaDe(c.primera), { anio: true }) : '—'}<br />{c.ultima ? fechaCorta(diaDe(c.ultima), { anio: true }) : '—'}</b></div>
      </div>

      <FichaBloque titulo="Qué suele hacer">
        {c.actividades.length ? (
          <ul className="rsv-barras">
            {c.actividades.map(([a, n]) => (
              <li key={a}>
                <span>{a}</span>
                <span className="rsv-barras__medidor" aria-hidden="true"><i style={{ width: `${(n / maxAct) * 100}%` }} /></span>
                <b>{plural(n, 'vez', 'veces')}</b>
              </li>
            ))}
          </ul>
        ) : <p className="ui-t3 rsv-peq">Aún nada.</p>}
        {pide.length > 0 && <p className="ui-t2 rsv-peq rsv-pide">Suele pedir: {pide.map(([x, n]) => `${x} (${n})`).join(' · ')}</p>}
      </FichaBloque>

      <FichaBloque titulo="Próximas reservas">
        {c.proximas.length
          ? <ul className="rsv-lista-res">{c.proximas.map((r) => <FilaReserva key={r.id} r={r} hoy={hoy} />)}</ul>
          : <p className="ui-t3 rsv-peq">No tiene ninguna reservada.</p>}
      </FichaBloque>

      <FichaBloque titulo="Historial">
        {c.historial.length
          ? <ul className="rsv-lista-res">{c.historial.map((r) => <FilaReserva key={r.id} r={r} hoy={hoy} />)}</ul>
          : <p className="ui-t3 rsv-peq">Aún no ha venido al estudio.</p>}
      </FichaBloque>

      <Notas c={c} />
    </Ficha>
  )
}
