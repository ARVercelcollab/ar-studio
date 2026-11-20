// Ficha de una suscripción: horas del periodo, sesiones, cuotas, fianza, condiciones y baja
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import Panel, { Chip, ChipCuota, BarraHoras, chipEstado } from '../../../components/admin/Panel'
import CondicionesPlan, { formularioDeCondiciones, formularioDePlan } from '../../../components/admin/CondicionesPlan'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { vistaAdmin, enlaceWhatsApp, fechaHoraTexto } from '../../../lib/admin/vista'
import { fichaSuscripcion } from '../../../lib/suscripciones/servicio'
import {
  ESTADOS_SUSCRIPCION, propuestaBaja, consecuenciasBaja, periodoNumero, textoPeriodo, textoRecordatorioCuota, proximoCobro, finCaducidad,
} from '../../../lib/suscripciones/reglas'
import { PLANES, METODOS_CUOTA, formatoEuros, textoDuracion } from '../../../lib/reservas/config'
import { fechaMadrid, horaMadrid, textoFechaCorta } from '../../../lib/reservas/tiempo'
import { pedirJson } from '../../../lib/reservas/navegador'
import { ErrorReserva } from '../../../lib/reservas/servicio'
import { emisor, facturasAutomaticas } from '../../../lib/facturas/servicio'

const h = (x) => textoDuracion(x, { corto: true })
const METODOS = Object.fromEntries(METODOS_CUOTA)
const METODOS_A_MANO = METODOS_CUOTA.filter(([id]) => id !== 'stripe')
const fecha = (f, anio = true) => (f ? textoFechaCorta(f, { anio }) : '—')
const fechaHoraCorta = (iso) => `${textoFechaCorta(fechaMadrid(iso), { anio: false })}, ${horaMadrid(iso)}`

const EVENTOS = {
  alta: 'Alta', editada: 'Datos cambiados', condiciones: 'Condiciones cambiadas', cuota_pagada: 'Cuota pagada',
  cuota_desmarcada: 'Pago de cuota deshecho', cuota_editada: 'Cuota cambiada', cuota_anulada: 'Cuota anulada',
  cuota_devuelta: 'Cuota devuelta', cobro_enlazado: 'Cobro enlazado', cobro_sin_cuota: 'Cobro sin cuota (revisar)',
  baja: 'Baja apuntada', baja_deshecha: 'Baja deshecha', cobro_externo_cancelado: 'Cobro automático cancelado', fianza: 'Fianza',
  creada: 'Sesión reservada', movida: 'Sesión movida', cancelada: 'Sesión cancelada', pagada_a_mano: 'Horas aparte pagadas',
  factura_emitida: 'Factura emitida', factura_enviada: 'Factura enviada', factura_fallida: 'Fallo con la factura',
  correos_confirmacion: 'Correo de confirmación', correo_fallido: 'Fallo al enviar un correo', recordatorio: 'Recordatorio enviado',
  solicitud_cliente: 'Pide un cambio', alta_web: 'Alta por la web (primer mes pagado)', contrato_firmado: 'Contrato firmado',
  contrato_enviado: 'Enlace del contrato enviado', contrato_recordado: 'Recordatorio del contrato', enlace_cuota: 'Enlace de pago enviado',
  pago_revisar: 'Pago que revisar', tarjeta_guardada: 'Tarjeta guardada para los cobros', tarjeta_no_guardada: 'El banco no guardó la tarjeta',
  cobro_intento: 'Cobro automático', cobro_rechazado: 'Cobro rechazado por el banco', cobro_agotado: 'Cobro rechazado (sin más intentos)',
  cobro_revisar: 'Cobro sin confirmar (revisar)', cobro_no_cobrado: 'Cobro comprobado: no se cobró', cobro_activado: 'Cobro automático activado',
  cobro_desactivado: 'Cobro automático parado',
}
const FIANZA_ACCION = { cobrada: 'cobrada', devolver: 'devuelta', retener: 'retenida', sin_fianza: 'sin fianza' }
const TEXTO_COBRO = {
  cobrando: 'Cobrando ahora en la tarjeta…', rechazado: 'El banco rechazó el cobro', agotado: 'Rechazado en todos los intentos',
  revisar: 'No sabemos si se cobró: míralo en el portal del TPV',
}
const ESTADO_PAGO = { pagado: 'Cobrado', fallido: 'Rechazado', iniciado: 'Sin confirmar' }
const caducidad = (aamm) => (aamm ? `${aamm.slice(2)}/${aamm.slice(0, 2)}` : '—')

function textoEvento(e) {
  const d = e.detalle || {}
  const partes = []
  if (e.codigo) partes.push(e.codigo)
  if (d.periodo) partes.push(`periodo ${d.periodo}`)
  if (e.tipo === 'cuota_pagada' && d.metodo) partes.push(METODOS[d.metodo] || d.metodo)
  if (e.tipo === 'cuota_pagada' && d.proveedor) partes.push(d.proveedor)
  if (e.tipo === 'cuota_anulada' && d.pausa) partes.push('sin horas (pausa)')
  if (e.tipo === 'creada' && d.horasPlan != null) partes.push(`${h(d.horasPlan)} del plan${d.horasExtra ? ` + ${h(d.horasExtra)} aparte` : ''}`)
  if (e.tipo === 'cancelada') partes.push(d.cuentaComoUsada ? 'cuenta como usada' : 'no cuenta', d.motivo)
  if (e.tipo === 'baja') partes.push(`último día ${fecha(d.ultimoDia)}`, d.motivo)
  if (e.tipo === 'condiciones' && d.desdePeriodo) partes.push(`desde el periodo ${d.desdePeriodo}`)
  if (e.tipo === 'fianza') partes.push(FIANZA_ACCION[d.accion] || d.accion, d.importeCent ? formatoEuros(d.importeCent) : null, d.nota)
  if (e.tipo === 'factura_enviada') partes.push(`${d.codigo} a ${d.a}`)
  if (e.tipo === 'factura_emitida') partes.push(d.codigo)
  if (e.tipo === 'pago_revisar') partes.push(d.motivo === 'duplicado' ? 'pago repetido' : d.motivo === 'sin_cuota' ? 'la cuota ya no estaba pendiente' : 'importe distinto', d.pedido ? `pedido ${d.pedido}` : null)
  if (e.tipo === 'alta_web' && d.pedido) partes.push(`pedido ${d.pedido}`)
  if (e.tipo === 'tarjeta_guardada' && d.ultimos) partes.push(`···· ${d.ultimos}`)
  if (e.tipo === 'cobro_intento') partes.push(`intento ${d.intento}`, d.pedido ? `pedido ${d.pedido}` : null)
  if (['cobro_rechazado', 'cobro_agotado'].includes(e.tipo)) partes.push(d.codigo ? `código ${d.codigo}` : null, d.proximo ? `reintento el ${fecha(d.proximo, false)}` : null)
  if (e.tipo === 'cobro_revisar') partes.push(d.error === 'cortado' ? 'se cortó a medias' : d.error)
  if (e.tipo === 'cuota_pagada' && d.automatico) partes.push('cobro automático')
  if (e.tipo === 'correo_fallido' || e.tipo === 'factura_fallida') partes.push(d.error)
  if (d.nota && e.tipo !== 'fianza') partes.push(d.nota)
  return partes.filter(Boolean).join(' · ')
}

function useAccion() {
  const router = useRouter()
  const [estado, setEstado] = useState({ enviando: false, mensaje: null, error: false })
  async function ejecutar(url, datos, { despues } = {}) {
    setEstado({ enviando: true, mensaje: null, error: false })
    try {
      const r = await pedirJson(url, { method: 'POST', body: datos })
      if (despues) return despues(r)
      setEstado({ enviando: false, mensaje: r?.mensaje || 'Hecho.', error: false })
      router.replace(router.asPath, undefined, { scroll: false })
      return r
    } catch (e) {
      setEstado({ enviando: false, mensaje: e.message, error: true })
      return null
    }
  }
  return [estado, ejecutar]
}

function Mensaje({ estado }) {
  if (!estado.mensaje) return null
  return <p className={`adm-mensaje${estado.error ? ' is-error' : ''}`}>{estado.mensaje}</p>
}

// ---------- Cuotas ----------

// Todo lo cobrado lleva factura: completa si ha dado sus datos y simplificada si no
const pagoDe = (sus, emisorListo, facturasAuto, hoy) => {
  const metodo = sus.metodoHabitual && METODOS[sus.metodoHabitual] ? sus.metodoHabitual : 'transferencia'
  return { metodo, fecha: hoy, referencia: '', emitirFactura: metodo !== 'stripe' && emisorListo && facturasAuto }
}
const edicionDe = (c) => ({ importe: (c.importeCent / 100).toFixed(2).replace('.', ','), horas: String(c.horas).replace('.', ','), nota: '' })
const facturaDe = (sus) => ({ nombre: sus.factura?.nombre || '', nif: sus.factura?.nif || '', direccion: sus.factura?.direccion || '' })
// «Referencia o enlace»: si es una dirección https, va como enlace (justificante)
const referenciaOEnlace = (v) => (/^https:\/\//i.test(String(v || '').trim()) ? { enlace: String(v).trim(), referencia: '' } : { referencia: v, enlace: '' })

function FilaCuota({ c, sus, emisorListo, facturasAuto, hoy, cobroDisponible }) {
  const [abierto, setAbierto] = useState(null) // 'pagar' | 'mas' | 'factura'
  const [pago, setPago] = useState(() => pagoDe(sus, emisorListo, facturasAuto, hoy))
  const [edicion, setEdicion] = useState(() => edicionDe(c))
  const [pausa, setPausa] = useState(false)
  const [devueltaEl, setDevueltaEl] = useState(hoy)
  const [datosFactura, setDatosFactura] = useState(() => facturaDe(sus))
  // Si cambian los datos de partida con el formulario abierto (otra acción de la ficha), se ponen al día
  const fuente = `${c.importeCent}|${c.horas}|${JSON.stringify(sus.factura || null)}`
  useEffect(() => {
    setEdicion((e) => ({ ...edicionDe(c), nota: e.nota }))
    setDatosFactura(facturaDe(sus))
  }, [fuente]) // eslint-disable-line react-hooks/exhaustive-deps
  const [estado, ejecutar] = useAccion()
  const url = `/api/admin/cuotas/${c.id}`
  const alternar = (que) => {
    if (abierto === que) return setAbierto(null)
    // Cada vez que se abre, con los datos de ahora (pueden haber cambiado tras otra acción)
    setPago(pagoDe(sus, emisorListo, facturasAuto, hoy))
    setEdicion(edicionDe(c))
    setPausa(false)
    setDatosFactura(facturaDe(sus))
    return setAbierto(que)
  }
  const hacer = async (datos) => {
    const r = await ejecutar(url, datos)
    if (r) setAbierto(null)
  }
  const pendiente = c.estado === 'pendiente'
  const cobrable = pendiente && c.importeCent > 0

  return (
    <>
      <tr>
        <td>
          {c.periodo}. {c.texto}
          <small style={{ display: 'block', color: '#8a7a6c' }}>{h(c.horasUsadas)} de {h(c.horas)}{c.nota ? ` · ${c.nota}` : ''}</small>
        </td>
        <td>{formatoEuros(c.importeCent)}</td>
        <td>
          <ChipCuota chip={c.chip} />
          {c.estado === 'pagada' && (
            <small style={{ display: 'block', color: '#8a7a6c' }}>
              {METODOS[c.metodoPago] || c.metodoPago || ''}{c.pagadaEn ? ` · ${fecha(c.pagadaEn, false)}` : ''}{c.referencia ? ` · ${c.referencia}` : ''}
              {c.enlace && <> · <a href={c.enlace} target="_blank" rel="noopener noreferrer" className="adm-enlace">justificante</a></>}
            </small>
          )}
          {c.estado === 'devuelta' && c.devueltaEn && <small style={{ display: 'block', color: '#8a7a6c' }}>Devuelta el {fecha(c.devueltaEn, false)}</small>}
          {pendiente && c.cobroEstado && <small style={{ display: 'block', color: c.cobroEstado === 'rechazado' ? '#8a7a6c' : '#a33' }}>{TEXTO_COBRO[c.cobroEstado]}{c.cobroEstado === 'rechazado' && c.cobroProximo ? ` · reintento el ${fecha(c.cobroProximo, false)}` : ''}{c.cobroError ? ` · ${c.cobroError}` : ''}</small>}
          {pendiente && !c.cobroEstado && sus.cobroAuto && c.importeCent > 0 && <small style={{ display: 'block', color: '#8a7a6c' }}>Se cobra sola en la tarjeta</small>}
        </td>
        <td>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {cobrable && sus.cobroAuto && cobroDisponible && !['cobrando', 'revisar'].includes(c.cobroEstado) && c.desde <= hoy && (
              <button type="button" className="adm-boton adm-mini" disabled={estado.enviando}
                onClick={() => { if (window.confirm(`¿Cobrar ahora ${formatoEuros(c.importeCent)} en la tarjeta ${sus.tarjeta?.ultimos ? `···· ${sus.tarjeta.ultimos}` : 'guardada'}?`)) hacer({ accion: 'cobrar_ahora' }) }}>Cobrar ahora</button>
            )}
            {cobrable && c.cobroEstado === 'revisar' && (
              <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando}
                onClick={() => { if (window.confirm('¿Has comprobado en el portal del TPV que este cobro NO se hizo? Si se cobró, usa «Marcar pagada».')) hacer({ accion: 'no_cobrado' }) }}>No se cobró</button>
            )}
            {cobrable && <button type="button" className="adm-boton adm-mini" onClick={() => alternar('pagar')}>Marcar pagada</button>}
            {cobrable && c.recordatorio && <a className="adm-boton adm-boton--claro adm-mini" href={c.recordatorio} target="_blank" rel="noopener noreferrer">Recordar por WhatsApp</a>}
            {cobrable && sus.email && <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => hacer({ accion: 'enlace_pago' })} title={c.avisoPagoEn ? `Enviado el ${fechaHoraCorta(c.avisoPagoEn)}` : 'Le llega un correo con un enlace para pagar con tarjeta o Bizum'}>{c.avisoPagoEn ? 'Reenviar enlace de pago' : 'Enviar enlace de pago'}</button>}
            {c.factura && <a className="adm-boton adm-boton--claro adm-mini" href={`/api/admin/facturas/${c.factura.id}`} target="_blank" rel="noopener noreferrer">{c.factura.simplificada ? 'Simplificada' : 'Factura'} {c.factura.codigo}</a>}
            {c.factura && <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => hacer({ accion: 'factura' })}>{c.factura.enviada ? 'Reenviar' : 'Enviar factura'}</button>}
            {(!c.factura || c.factura.simplificada) && c.estado === 'pagada' && c.importeCent > 0 && emisorListo && (
              <button type="button" className="adm-boton adm-boton--claro adm-mini" onClick={() => alternar('factura')}>{c.factura ? 'Hacer la completa' : 'Emitir factura'}</button>
            )}
            <button type="button" className="adm-boton adm-boton--claro adm-mini" onClick={() => alternar('mas')}>Más ▾</button>
          </div>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={4} style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="adm-cuota-form">
              {abierto === 'pagar' && (
                <>
                  <div className="adm-form">
                    <label>Cómo ha pagado
                      <select value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value, emitirFactura: e.target.value === 'stripe' ? false : pago.emitirFactura })}>
                        {METODOS_CUOTA.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                      </select>
                    </label>
                    <label>Cuándo<input type="date" max={hoy} value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} /></label>
                    <label className="adm-ancho">Referencia o enlace (opcional)<input value={pago.referencia} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} placeholder="Concepto, n.º de cobro, o el enlace al recibo de Stripe" /></label>
                    {c.importeCent === 0 ? null : emisorListo ? (
                      <label className="adm-check adm-ancho"><input type="checkbox" checked={pago.emitirFactura} onChange={(e) => setPago({ ...pago, emitirFactura: e.target.checked })} /> Emitir y enviarle la {sus.factura ? 'factura con sus datos' : 'factura simplificada (no ha dado sus datos de facturación)'}{pago.metodo === 'stripe' ? ' (si Stripe ya se la manda, déjalo sin marcar)' : ''}</label>
                    ) : (
                      <p className="adm-ancho adm-nota">Para emitir facturas faltan los datos de quien factura en Vercel.</p>
                    )}
                  </div>
                  <p style={{ marginTop: 10 }}>
                    <button type="button" className="adm-boton" disabled={estado.enviando} onClick={() => hacer({ accion: 'pagada', ...pago, ...referenciaOEnlace(pago.referencia) })}>Guardar pago</button>
                  </p>
                </>
              )}
              {abierto === 'factura' && (
                <>
                  <p className="adm-nota" style={{ marginBottom: 8 }}>
                    {c.factura ? `Con nombre, NIF y dirección se hace la factura completa, que sustituye a la simplificada ${c.factura.codigo}.` : 'Con nombre, NIF y dirección sale la factura completa. Si lo dejas vacío, sale la simplificada.'}
                  </p>
                  <div className="adm-form">
                    <label className="adm-ancho">Nombre o razón social<input value={datosFactura.nombre} onChange={(e) => setDatosFactura({ ...datosFactura, nombre: e.target.value })} /></label>
                    <label>NIF o CIF<input value={datosFactura.nif} onChange={(e) => setDatosFactura({ ...datosFactura, nif: e.target.value })} /></label>
                    <label>Dirección<input value={datosFactura.direccion} onChange={(e) => setDatosFactura({ ...datosFactura, direccion: e.target.value })} /></label>
                  </div>
                  <p style={{ marginTop: 10 }}>
                    <button type="button" className="adm-boton" disabled={estado.enviando} onClick={() => hacer({ accion: 'factura', ...datosFactura })}>Emitir y enviar factura</button>
                  </p>
                </>
              )}
              {abierto === 'mas' && (
                <>
                  {pendiente && (
                    <>
                      <div className="adm-form">
                        <label>Importe (€)<input inputMode="decimal" value={edicion.importe} onChange={(e) => setEdicion({ ...edicion, importe: e.target.value })} /></label>
                        <label>Horas del periodo<input inputMode="decimal" value={edicion.horas} onChange={(e) => setEdicion({ ...edicion, horas: e.target.value })} /></label>
                        <label className="adm-ancho">Nota (por qué)<input value={edicion.nota} onChange={(e) => setEdicion({ ...edicion, nota: e.target.value })} placeholder="Ej.: descuento por…, horas de regalo…" /></label>
                      </div>
                      <div className="adm-acciones">
                        <button type="button" className="adm-boton adm-mini" disabled={estado.enviando} onClick={() => hacer({ accion: 'editar', ...edicion })}>Guardar cambios</button>
                        <label className="adm-check" style={{ fontSize: '0.85rem', fontWeight: 300, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input type="checkbox" checked={pausa} onChange={(e) => setPausa(e.target.checked)} style={{ accentColor: '#4b3828' }} /> sin horas ese mes (pausa)
                        </label>
                        <button type="button" className="adm-boton adm-boton--peligro adm-mini" disabled={estado.enviando} onClick={() => { if (window.confirm(pausa ? '¿Anular la cuota y quitarle las horas de ese periodo?' : '¿Anular la cuota? Mantiene sus horas de ese periodo.')) hacer({ accion: 'anular', pausa, nota: edicion.nota }) }}>Anular cuota</button>
                      </div>
                    </>
                  )}
                  {c.estado === 'pagada' && (
                    <>
                      <div className="adm-form">
                        <label className="adm-ancho">Horas del periodo<input inputMode="decimal" value={edicion.horas} onChange={(e) => setEdicion({ ...edicion, horas: e.target.value })} /></label>
                        <label>Nota<input value={edicion.nota} onChange={(e) => setEdicion({ ...edicion, nota: e.target.value })} /></label>
                        <label>Devuelta el (si se devuelve)<input type="date" min={c.pagadaEn || undefined} max={hoy} value={devueltaEl} onChange={(e) => setDevueltaEl(e.target.value)} /></label>
                      </div>
                      <div className="adm-acciones">
                        <button type="button" className="adm-boton adm-mini" disabled={estado.enviando} onClick={() => hacer({ accion: 'editar', horas: edicion.horas, nota: edicion.nota })}>Guardar horas</button>
                        {!c.factura && <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Deshacer el pago? Vuelve a quedar pendiente.')) hacer({ accion: 'desmarcar' }) }}>Deshacer el pago</button>}
                        <button type="button" className="adm-boton adm-boton--peligro adm-mini" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Apuntar que se le ha devuelto esta cuota? (la devolución se hace aparte, en el banco o en Stripe)')) hacer({ accion: 'devolver', nota: edicion.nota, fecha: devueltaEl || hoy }) }}>Se le ha devuelto</button>
                      </div>
                    </>
                  )}
                  {!pendiente && c.estado !== 'pagada' && <p className="adm-nota">Esta cuota está {c.estado}. No hay nada más que hacer con ella.</p>}
                </>
              )}
              <Mensaje estado={estado} />
            </div>
          </td>
        </tr>
      )}
      {!abierto && estado.mensaje && (
        <tr><td colSpan={4} style={{ borderTop: 'none', paddingTop: 0 }}><Mensaje estado={estado} /></td></tr>
      )}
    </>
  )
}

// ---------- Columna derecha ----------

const formularioDatos = (sus) => ({
  nombre: sus.nombre, apellidos: sus.apellidos || '', email: sus.email, telefono: sus.telefono || '',
  metodoHabitual: sus.metodoHabitual || '', cobroExternoRef: sus.cobroExternoRef || '', contratoUrl: sus.contratoUrl || '',
  quiereFactura: Boolean(sus.factura), factura: { nombre: sus.factura?.nombre || '', nif: sus.factura?.nif || '', direccion: sus.factura?.direccion || '' },
})

function Datos({ sus }) {
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState(() => formularioDatos(sus))
  const [estado, ejecutar] = useAccion()
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const wa = enlaceWhatsApp(sus.telefono)
  return (
    <div className="adm-caja">
      <h2>Datos</h2>
      {!editando ? (
        <>
          <dl className="adm-datos">
            <dt>Código</dt><dd>{sus.codigo}</dd>
            <dt>Correo</dt><dd><a href={`mailto:${sus.email}`}>{sus.email}</a></dd>
            <dt>WhatsApp</dt><dd>{wa ? <a href={wa} target="_blank" rel="noopener noreferrer">{sus.telefono}</a> : '—'}</dd>
            <dt>Paga con</dt><dd>{METODOS[sus.metodoHabitual] || '—'}{sus.cobroExterno === 'stripe' ? ` · cobro automático${sus.cobroExternoRef ? ` (${sus.cobroExternoRef})` : ''}` : ''}</dd>
            <dt>Datos de factura</dt><dd>{sus.factura ? `${sus.factura.nombre} · ${sus.factura.nif} · ${sus.factura.direccion}` : 'No los ha dado (sus cuotas llevan factura simplificada)'}</dd>
            <dt>Contrato</dt><dd>{sus.contratoUrl ? <a href={sus.contratoUrl} target="_blank" rel="noopener noreferrer">Abrir</a> : '—'}</dd>
            <dt>Alta</dt><dd>{fecha(sus.creadoEn.slice(0, 10))}</dd>
          </dl>
          <p style={{ marginTop: 12 }}><button type="button" className="adm-boton adm-boton--claro" onClick={() => { setF(formularioDatos(sus)); setEditando(true) }}>Editar datos</button></p>
        </>
      ) : (
        <>
          <div className="adm-form">
            <label>Nombre<input value={f.nombre} onChange={(e) => poner('nombre', e.target.value)} /></label>
            <label>Apellidos<input value={f.apellidos} onChange={(e) => poner('apellidos', e.target.value)} /></label>
            <label>Correo<input type="email" value={f.email} onChange={(e) => poner('email', e.target.value)} /></label>
            <label>WhatsApp<input value={f.telefono} onChange={(e) => poner('telefono', e.target.value)} /></label>
            <label className="adm-ancho">Cómo paga cada mes
              <select value={f.metodoHabitual} onChange={(e) => poner('metodoHabitual', e.target.value)}>
                <option value="">Sin indicar</option>
                {METODOS_CUOTA.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
              </select>
            </label>
            {f.metodoHabitual === 'stripe' && <label className="adm-ancho">Suscripción en Stripe (sub_…)<input value={f.cobroExternoRef} onChange={(e) => poner('cobroExternoRef', e.target.value)} /></label>}
            <label className="adm-ancho">Enlace al contrato<input value={f.contratoUrl} onChange={(e) => poner('contratoUrl', e.target.value)} placeholder="https://…" /></label>
            <label className="adm-check adm-ancho"><input type="checkbox" checked={f.quiereFactura} onChange={(e) => poner('quiereFactura', e.target.checked)} /> Quiere factura con sus datos (si no, se le hace la simplificada)</label>
            {f.quiereFactura && (
              <>
                <label className="adm-ancho">Nombre o razón social<input value={f.factura.nombre} onChange={(e) => poner('factura', { ...f.factura, nombre: e.target.value })} /></label>
                <label>NIF o CIF<input value={f.factura.nif} onChange={(e) => poner('factura', { ...f.factura, nif: e.target.value })} /></label>
                <label>Dirección<input value={f.factura.direccion} onChange={(e) => poner('factura', { ...f.factura, direccion: e.target.value })} /></label>
              </>
            )}
          </div>
          <div className="adm-acciones">
            <button type="button" className="adm-boton" disabled={estado.enviando} onClick={async () => { const r = await ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'editar', ...f }); if (r) setEditando(false) }}>Guardar</button>
            <button type="button" className="adm-boton adm-boton--claro" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </>
      )}
      <Mensaje estado={estado} />
    </div>
  )
}

function Condiciones({ sus, condiciones, periodoActual, estado: estadoSus }) {
  const opciones = [0, 1, 2].map((i) => periodoNumero(sus, periodoActual.numero + i)).filter((p) => !sus.ultimoDia || p.desde <= sus.ultimoDia)
  const [form, setForm] = useState(() => formularioDeCondiciones(sus))
  const [plan, setPlan] = useState(sus.plan)
  // Por defecto, desde el periodo siguiente (el actual ya está en marcha)
  const [desde, setDesde] = useState(() => String((opciones[1] || opciones[0] || periodoActual).numero))
  const [estado, ejecutar] = useAccion()
  const elegirPlan = (v) => {
    const tocado = JSON.stringify(form) !== JSON.stringify(formularioDeCondiciones(sus))
    if (tocado && !window.confirm(`¿Poner las condiciones del plan ${PLANES[v].nombre}? Se pierden los cambios que has escrito.`)) return
    setPlan(v)
    // Del plan nuevo se toma lo suyo (cuota, horas, sesiones, horario); lo del contrato se queda
    setForm(v === sus.plan ? formularioDeCondiciones(sus) : {
      ...formularioDePlan(v),
      antelacionH: form.antelacionH, permanenciaMeses: form.permanenciaMeses, renovacionMeses: form.renovacionMeses, preavisoDias: form.preavisoDias,
    })
  }
  return (
    <div className="adm-caja">
      <h2>Condiciones · {sus.planNombre}</h2>
      <p style={{ fontSize: '0.92rem' }}><strong style={{ fontWeight: 400 }}>{formatoEuros(sus.cuotaCent)} al mes</strong> · {condiciones.join(' · ')}.</p>
      {sus.mesPrueba && <p className="adm-nota">Primer mes de prueba.</p>}
      {estadoSus !== 'finalizada' && (
        <details>
          <summary>Cambiar condiciones</summary>
          <div className="adm-form" style={{ marginBottom: 12 }}>
            <label>Plan
              <select value={plan} onChange={(e) => elegirPlan(e.target.value)}>
                {Object.entries(PLANES).map(([id, p]) => <option key={id} value={id}>{p.nombre}</option>)}
              </select>
            </label>
            <label>A partir del periodo
              <select value={desde} onChange={(e) => setDesde(e.target.value)}>
                {opciones.map((p) => <option key={p.numero} value={p.numero}>{p.numero}. {textoPeriodo(p)}{p.numero === periodoActual.numero ? ' (el actual)' : ''}</option>)}
              </select>
            </label>
          </div>
          <CondicionesPlan valor={form} onCambio={setForm} />
          <p className="adm-nota" style={{ marginTop: 8 }}>La cuota y las horas cambian desde ese periodo (los de antes se quedan como estaban y las cuotas ya pagadas no se tocan). El horario, las duraciones, el máximo de sesiones y la antelación valen ya para las sesiones que se reserven a partir de ahora.</p>
          <p style={{ marginTop: 10 }}>
            <button type="button" className="adm-boton" disabled={estado.enviando} onClick={() => ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'condiciones', plan, desdePeriodo: Number(desde), condiciones: form })}>Guardar condiciones</button>
          </p>
        </details>
      )}
      <Mensaje estado={estado} />
    </div>
  )
}

function Contrato({ sus, contrato }) {
  const [estado, ejecutar] = useAccion()
  const [copiado, setCopiado] = useState(false)
  const url = `/api/admin/contratos/${sus.id}`
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(contrato.url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }
  return (
    <div className="adm-caja">
      <h2>Contrato</h2>
      {!contrato && (
        <>
          <p>{sus.contratoUrl ? 'Tiene el contrato enlazado en sus datos.' : 'Sin contrato en la web.'}</p>
          {sus.email && (
            <p className="adm-acciones">
              <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => ejecutar(url, {})}>Enviarle el contrato para firmar</button>
            </p>
          )}
          <p className="adm-nota">Le llega un correo con un enlace para rellenar sus datos y firmar desde el móvil.</p>
        </>
      )}
      {contrato && contrato.estado === 'pendiente' && (
        <>
          <p><Chip tipo="aviso">Pendiente de firmar</Chip>{contrato.enviadoEn ? <span className="adm-nota"> · enlace enviado el {fechaHoraCorta(contrato.enviadoEn)}</span> : null}{contrato.recordadoEn ? <span className="adm-nota"> · recordado el {fechaHoraCorta(contrato.recordadoEn)}</span> : null}</p>
          <p className="adm-acciones">
            <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => ejecutar(url, {})}>Reenviar el enlace</button>
            <button type="button" className="adm-boton adm-boton--claro adm-mini" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
          </p>
        </>
      )}
      {contrato && contrato.estado === 'firmado' && (
        <>
          <p><Chip tipo="ok">Firmado</Chip> <span className="adm-nota">el {fechaHoraCorta(contrato.firmadoEn)} · versión {contrato.version}</span></p>
          <p className="adm-acciones"><a className="adm-boton adm-boton--claro adm-mini" href={url} target="_blank" rel="noopener noreferrer">Descargar el PDF</a></p>
        </>
      )}
      <Mensaje estado={estado} />
    </div>
  )
}

function CobroMensual({ sus, cuotas, cobros, cobroDisponible, hoy }) {
  const [estado, ejecutar] = useAccion()
  const url = `/api/admin/suscripciones/${sus.id}`
  const prox = proximoCobro(sus, cuotas, hoy)
  const fin = sus.tarjeta?.caduca ? finCaducidad(sus.tarjeta.caduca) : null
  if (!sus.tarjeta && !sus.cobroAuto && sus.origen !== 'web') return null
  return (
    <div className="adm-caja">
      <h2>Cobro mensual</h2>
      <dl className="adm-datos">
        <dt>Tarjeta</dt>
        <dd>{sus.tarjeta ? <>Tarjeta guardada {sus.tarjeta.ultimos ? `···· ${sus.tarjeta.ultimos}` : ''} (caduca {caducidad(sus.tarjeta.caduca)}){fin && prox && fin < prox ? <> <Chip tipo="aviso">Caduca antes del próximo cobro</Chip></> : null}</> : 'Sin tarjeta guardada'}</dd>
        <dt>Cobro</dt>
        <dd>{sus.cobroAuto ? (cobroDisponible ? 'Se cobra sola cada mes' : 'Automático, pero el TPV no tiene activado el cobro recurrente') : sus.cobroEnlace ? 'Con enlace de pago por correo cada mes' : 'Parado: las cuotas se marcan a mano'}</dd>
        {sus.cobroAuto && <><dt>Próximo cobro</dt><dd>{prox ? fecha(prox) : '—'}</dd></>}
      </dl>
      <p className="adm-acciones">
        {sus.cobroAuto && (
          <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando}
            onClick={() => { if (window.confirm('¿Dejar de cobrar solo? Las cuotas siguientes habrá que marcarlas a mano (o mandar el enlace de pago).')) ejecutar(url, { accion: 'cobro_auto', activar: false }) }}>Dejar de cobrar</button>
        )}
        {!sus.cobroAuto && sus.tarjeta && cobroDisponible && (
          <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'cobro_auto', activar: true })}>Volver a cobrar solo</button>
        )}
      </p>
      {cobros.length > 0 && (
        <>
          <p className="adm-nota">Intentos de cobro automático</p>
          <ul className="adm-historial">
            {cobros.map((x) => (
              <li key={x.pedido}>
                <time>{fechaHoraCorta(x.cuando)}</time>
                <span>Periodo {x.periodo} · {formatoEuros(x.importeCent)} · {ESTADO_PAGO[x.estado] || x.estado}{x.codigo && x.estado !== 'pagado' ? ` (código ${x.codigo})` : ''} · pedido {x.pedido}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Mensaje estado={estado} />
    </div>
  )
}

function Fianza({ sus, hoy }) {
  const [f, setF] = useState({ euros: (sus.fianzaCent / 100).toFixed(2).replace('.', ','), metodo: 'transferencia', fecha: hoy, nota: '' })
  const [estado, ejecutar] = useAccion()
  const url = `/api/admin/suscripciones/${sus.id}`
  const recomendacion = sus.ultimoDia ? consecuenciasBaja(sus, sus.ultimoDia, sus.bajaAvisadaEn).fianza : null
  const poner = (k) => (e) => setF({ ...f, [k]: e.target.value })
  let resumen
  if (sus.fianzaEstado === 'pendiente') resumen = `Sin cobrar (${formatoEuros(sus.fianzaCent)}).${sus.fianzaLimite ? ` Plazo para la transferencia: hasta el ${fecha(sus.fianzaLimite)}${sus.fianzaLimite < hoy ? ' (ya ha pasado)' : ''}.` : ''}`
  else if (sus.fianzaEstado === 'cobrada') resumen = `Cobrada: ${formatoEuros(sus.fianzaCent)}${sus.fianzaMetodo ? ` por ${(METODOS[sus.fianzaMetodo] || sus.fianzaMetodo).toLowerCase()}` : ''}${sus.fianzaCobradaEn ? ` el ${fecha(sus.fianzaCobradaEn)}` : ''}.`
  else if (sus.fianzaEstado === 'devuelta') resumen = `Devuelta: ${formatoEuros(sus.fianzaDevueltaCent ?? sus.fianzaCent)} el ${fecha(sus.fianzaResueltaEn)}.`
  else if (sus.fianzaEstado === 'retenida') resumen = `Os la quedasteis (${formatoEuros(sus.fianzaCent)}) el ${fecha(sus.fianzaResueltaEn)}.`
  else resumen = 'Sin fianza.'
  return (
    <div className="adm-caja">
      <h2>Fianza</h2>
      <p>{resumen}{sus.fianzaNota ? ` ${sus.fianzaNota}` : ''}</p>
      {['pendiente', 'sin_fianza'].includes(sus.fianzaEstado) && (
        <details>
          <summary>Marcar como cobrada</summary>
          <div className="adm-form">
            <label>Importe (€)<input inputMode="decimal" value={f.euros} onChange={poner('euros')} /></label>
            <label>Cómo<select value={f.metodo} onChange={poner('metodo')}>{METODOS_A_MANO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></label>
            <label>Cuándo<input type="date" max={hoy} value={f.fecha} onChange={poner('fecha')} /></label>
          </div>
          <div className="adm-acciones">
            <button type="button" className="adm-boton adm-mini" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'cobrada', ...f })}>Guardar</button>
            {sus.fianzaEstado === 'pendiente' && <button type="button" className="adm-boton adm-boton--claro adm-mini" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'sin_fianza', nota: f.nota })}>No deja fianza</button>}
          </div>
        </details>
      )}
      {sus.fianzaEstado === 'cobrada' && sus.ultimoDia && (
        <>
          {recomendacion && <p className="adm-notas">{recomendacion === 'devolver' ? 'Según las condiciones, se le devuelve (si el estudio y el equipo están bien).' : 'No cumple la permanencia: según las condiciones, la pierde.'}</p>}
          <div className="adm-form">
            <label>Se devuelve (€)<input inputMode="decimal" value={f.euros} onChange={poner('euros')} /></label>
            <label>Fecha<input type="date" max={hoy} value={f.fecha} onChange={poner('fecha')} /></label>
            <label className="adm-ancho">Nota{recomendacion === 'retener' ? ' (obligatoria si os la quedáis)' : ''}<input value={f.nota} onChange={poner('nota')} placeholder="Si se devuelve solo una parte o os la quedáis, explica por qué" /></label>
          </div>
          <div className="adm-acciones">
            <button type="button" className={`adm-boton adm-mini${recomendacion === 'retener' ? ' adm-boton--claro' : ''}`} disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'devolver', ...f })}>Apuntar devuelta</button>
            <button type="button" className={`adm-boton adm-mini${recomendacion === 'devolver' ? ' adm-boton--claro' : ''}`} disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'retener', nota: f.nota, fecha: f.fecha })}>Os la quedáis</button>
          </div>
        </>
      )}
      {sus.fianzaEstado === 'cobrada' && !sus.ultimoDia && <p className="adm-nota">Se resuelve cuando se dé de baja.</p>}
      <Mensaje estado={estado} />
    </div>
  )
}

function Notas({ sus }) {
  const [notas, setNotas] = useState(sus.notasInternas)
  const [estado, ejecutar] = useAccion()
  return (
    <div className="adm-caja">
      <h2>Notas internas</h2>
      <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Solo las ve el estudio" />
      <p style={{ marginTop: 10 }}><button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando} onClick={() => ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'notas', notas })}>Guardar notas</button></p>
      <Mensaje estado={estado} />
    </div>
  )
}

function Baja({ sus, sesiones, hoy, estado: estadoSus, puedeBorrarse }) {
  const router = useRouter()
  const [avisoEn, setAvisoEn] = useState(hoy)
  const propuesta = useMemo(() => propuestaBaja(sus, avisoEn || hoy), [sus, avisoEn, hoy])
  const [ultimoDia, setUltimoDia] = useState(null) // null = el que toca según el contrato
  const [motivo, setMotivo] = useState('')
  const [cancelarSesiones, setCancelarSesiones] = useState(true)
  const [stripeCancelado, setStripeCancelado] = useState(false)
  const [estado, ejecutar] = useAccion()
  const url = `/api/admin/suscripciones/${sus.id}`
  const dia = ultimoDia || propuesta.ultimoDia
  const consecuencias = useMemo(() => (dia && dia >= sus.fechaInicio ? consecuenciasBaja(sus, dia, avisoEn) : null), [sus, dia, avisoEn])

  if (sus.ultimoDia) {
    return (
      <div className="adm-caja">
        <h2>{estadoSus === 'finalizada' ? 'Terminada' : 'Se da de baja'}</h2>
        <p>Último día: <strong style={{ fontWeight: 400 }}>{fecha(sus.ultimoDia)}</strong>{sus.bajaAvisadaEn ? ` · avisó el ${fecha(sus.bajaAvisadaEn)}` : ''}{sus.motivoBaja ? ` · ${sus.motivoBaja}` : ''}</p>
        {sus.cobroExterno && (
          <div className="adm-avisos">
            <strong>Cancela el cobro automático en {sus.cobroExterno === 'stripe' ? 'Stripe' : 'la pasarela'}</strong>
            {sus.cobroExternoRef ? `Suscripción ${sus.cobroExternoRef}. ` : ''}Si no, le seguirán cobrando.
            <div className="adm-acciones"><button type="button" className="adm-boton adm-mini" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'cobro_externo_cancelado' })}>Ya está cancelado</button></div>
          </div>
        )}
        {estadoSus !== 'finalizada' && (
          <div className="adm-acciones">
            <button type="button" className="adm-boton adm-boton--claro" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Deshacer la baja? Sigue con la suscripción como antes.')) ejecutar(url, { accion: 'deshacer_baja' }) }}>Deshacer la baja</button>
          </div>
        )}
        <Mensaje estado={estado} />
      </div>
    )
  }

  return (
    <div className="adm-caja">
      <h2>Baja</h2>
      <details>
        <summary>Ha avisado de que lo deja</summary>
        <div className="adm-form">
          <label>Avisó el<input type="date" max={hoy} value={avisoEn} onChange={(e) => { setAvisoEn(e.target.value); setUltimoDia(null) }} /></label>
          <label>Último día<input type="date" min={sus.fechaInicio} value={dia} onChange={(e) => setUltimoDia(e.target.value)} /></label>
          <p className="adm-ancho adm-nota">
            {propuesta.motivo === 'prueba' ? 'Está en el mes de prueba: puede irse al final de este periodo.' : `Según el contrato, su último día es el ${fecha(propuesta.ultimoDia)} (periodo ${propuesta.ultimoPeriodo}).`}
            {ultimoDia && ultimoDia !== propuesta.ultimoDia && <> <button type="button" className="adm-enlace" onClick={() => setUltimoDia(null)}>Volver a esa fecha</button></>}
          </p>
          <label className="adm-ancho">Motivo (opcional)<input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
          <label className="adm-check adm-ancho"><input type="checkbox" checked={cancelarSesiones} onChange={(e) => setCancelarSesiones(e.target.checked)} /> Cancelar las sesiones que tenga después de ese día</label>
        </div>
        {consecuencias && (
          <div className="adm-avisos">
            <strong>Qué pasa</strong>
            {consecuencias.textos.map((t) => <div key={t}>· {t}</div>)}
          </div>
        )}
        {sus.cobroExterno && (
          <div className="adm-avisos">
            <strong>Paga con cobro automático ({sus.cobroExterno === 'stripe' ? 'Stripe' : 'pasarela'})</strong>
            Cancela también allí la suscripción{sus.cobroExternoRef ? ` ${sus.cobroExternoRef}` : ''} para que no le cobren más.
            <label className="adm-check" style={{ display: 'flex', gap: 8, marginTop: 8 }}><input type="checkbox" checked={stripeCancelado} onChange={(e) => setStripeCancelado(e.target.checked)} style={{ accentColor: '#4b3828' }} /> Ya lo he cancelado</label>
          </div>
        )}
        <p style={{ marginTop: 10 }}>
          <button type="button" className="adm-boton" disabled={estado.enviando || !dia} onClick={() => {
            const despues = sesiones.filter((x) => ['confirmada', 'pendiente', 'conflicto'].includes(x.estado) && x.fecha > dia).length
            const efecto = despues ? (cancelarSesiones ? ` Se cancelarán ${despues === 1 ? 'su sesión' : `sus ${despues} sesiones`} de después de ese día.` : ` Tiene ${despues === 1 ? 'una sesión' : `${despues} sesiones`} después de ese día.`) : ''
            if (window.confirm(`¿Apuntar la baja con último día el ${fecha(dia)}?${efecto} Las cuotas pendientes de después se quitan.`)) {
              ejecutar(url, { accion: 'baja', avisoEn, ultimoDia: dia, motivo, cancelarSesiones, cobroExternoCancelado: stripeCancelado })
            }
          }}>Apuntar la baja</button>
        </p>
      </details>
      {puedeBorrarse && (
        <details>
          <summary>Borrar (solo si el alta fue un error)</summary>
          <p className="adm-nota">No tiene sesiones ni cuotas cobradas. Se borra del todo, sin dejar rastro.</p>
          <p style={{ marginTop: 8 }}>
            <button type="button" className="adm-boton adm-boton--peligro adm-mini" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Borrar esta suscripción del todo?')) ejecutar(url, { accion: 'borrar' }, { despues: () => router.push('/admin/miembros?ok=borrada') }) }}>Borrar suscripción</button>
          </p>
        </details>
      )}
      <Mensaje estado={estado} />
    </div>
  )
}

// ---------- Página ----------

function FilaSesion({ s }) {
  return (
    <Link href={`/admin/reserva/${s.id}`} className="adm-fila adm-fila--plan">
      <span className="adm-fila__hora">{textoFechaCorta(s.fecha)}</span>
      <span className="adm-fila__quien">
        {s.horaInicio} – {s.horaFin}
        <small>{s.horasPlanTexto}{s.motivoCancelacion ? ` · ${s.motivoCancelacion}` : ''}</small>
      </span>
      <span>{s.importePlan}</span>
      {chipEstado(s)}
    </Link>
  )
}

export default function FichaSuscripcion(p) {
  const { sus, estado, enPrueba, resumenActual, sesionesActual, resumenSiguiente, cuotas, sesiones, eventos, ultimoDiaPermanencia, hoy, emisorListo, ok } = p
  const otras = sesiones.filter((s) => !sesionesActual.some((x) => x.id === s.id))
  const avisos = {
    alta: 'Suscripción dada de alta.',
    sesion: 'Sesión reservada.',
    sesion_sin_correo: 'Sesión reservada, pero no se ha podido mandar el correo de confirmación: avísale por WhatsApp.',
  }
  return (
    <Panel
      titulo={`${sus.nombre} ${sus.apellidos || ''}`.trim()}
      acciones={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/miembros" className="adm-boton adm-boton--claro">← Suscripciones</Link>
          {estado !== 'finalizada' && <Link href={`/admin/nueva?suscripcion=${sus.id}`} className="adm-boton">+ Reservar sesión</Link>}
        </div>
      )}
    >
      {ok && avisos[ok] && <p className={`adm-mensaje${ok === 'sesion_sin_correo' ? ' is-error' : ''}`}>{avisos[ok]}</p>}
      {p.impago && estado !== 'finalizada' && <p className="adm-mensaje is-error">{p.impago} Sus sesiones siguen en la agenda: decide si las mantienes.</p>}
      <p style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip tipo="plan">{sus.planNombre}</Chip>
        <Chip tipo={estado === 'activa' ? 'ok' : estado === 'baja_avisada' ? 'aviso' : 'gris'}>{ESTADOS_SUSCRIPCION[estado]}</Chip>
        {enPrueba && <Chip tipo="aviso">En prueba</Chip>}
        <span className="adm-nota" style={{ marginLeft: 6 }}>Desde el {fecha(sus.fechaInicio)} · permanencia hasta el {fecha(ultimoDiaPermanencia)}</span>
      </p>

      <div className="adm-dos">
        <div>
          {estado !== 'finalizada' && (
            <div className="adm-caja">
              <h2>{estado === 'por_empezar' ? `Primer periodo · ${resumenActual.texto}` : `Este periodo · ${resumenActual.texto}`}</h2>
              <p className="adm-grande">Le quedan {h(resumenActual.restantes)} de {h(resumenActual.horas)}</p>
              <BarraHoras usadas={resumenActual.usadas} total={resumenActual.horas} conTexto={false} />
              <p className="adm-nota" style={{ marginTop: 8 }}>
                {[resumenActual.hechas > 0 && `${h(resumenActual.hechas)} hechas`, resumenActual.reservadas > 0 && `${h(resumenActual.reservadas)} reservadas`, resumenActual.canceladasTarde > 0 && `${h(resumenActual.canceladasTarde)} canceladas tarde (cuentan)`].filter(Boolean).join(' · ') || 'Aún no ha reservado nada este periodo.'}
                {resumenActual.restantes > 0 && resumenActual.diasParaCaducar >= 0 && ` Lo que no use se pierde el ${textoFechaCorta(resumenActual.ultimoDia)}${resumenActual.diasParaCaducar <= 7 ? ` (en ${resumenActual.diasParaCaducar} ${resumenActual.diasParaCaducar === 1 ? 'día' : 'días'})` : ''}.`}
              </p>
              {sesionesActual.length > 0 && <div style={{ marginTop: 12 }}>{sesionesActual.map((s) => <FilaSesion key={s.id} s={s} />)}</div>}
              {resumenSiguiente && (
                <p className="adm-nota" style={{ marginTop: 12 }}>
                  Siguiente periodo ({resumenSiguiente.texto}): {h(resumenSiguiente.horas)}{resumenSiguiente.usadas > 0 ? `, ya tiene ${h(resumenSiguiente.usadas)} reservadas` : ''}.
                </p>
              )}
            </div>
          )}

          <div className="adm-caja">
            <h2>Cuotas</h2>
            <div className="adm-scroll">
              <table className="adm-tabla adm-tabla--cuotas">
                <thead><tr><th>Periodo</th><th>Importe</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {[...cuotas].reverse().map((c) => <FilaCuota key={c.id} c={c} sus={sus} emisorListo={emisorListo} facturasAuto={p.facturasAuto} hoy={hoy} cobroDisponible={p.cobroDisponible} />)}
                </tbody>
              </table>
            </div>
            <p className="adm-nota" style={{ marginTop: 10 }}>La cuota de cada periodo aparece sola cuando empieza. Las de 0 € no se cobran ni se facturan.</p>
          </div>

          {otras.length > 0 && (
            <div className="adm-caja">
              <details>
                <summary>Otras sesiones ({otras.length})</summary>
                {[...otras].reverse().map((s) => <FilaSesion key={s.id} s={s} />)}
              </details>
            </div>
          )}

          <div className="adm-caja">
            <h2>Historial</h2>
            <ul className="adm-historial">
              {[...eventos].reverse().map((e, i) => (
                <li key={i}>
                  <time>{e.cuando}</time>
                  <span>{EVENTOS[e.tipo] || e.tipo}{e.texto ? ` · ${e.texto}` : ''}{e.reservaId ? <> · <Link href={`/admin/reserva/${e.reservaId}`} className="adm-enlace">ver</Link></> : null}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <Baja sus={sus} sesiones={sesiones} hoy={hoy} estado={estado} puedeBorrarse={p.puedeBorrarse} />
          <Contrato sus={sus} contrato={p.contrato} />
          <CobroMensual sus={sus} cuotas={cuotas} cobros={p.cobros} cobroDisponible={p.cobroDisponible} hoy={hoy} />
          <Fianza sus={sus} hoy={hoy} />
          <Condiciones sus={sus} condiciones={p.condiciones} periodoActual={p.periodoActual} estado={estado} />
          <Datos sus={sus} />
          <Notas sus={sus} />
        </div>
      </div>
    </Panel>
  )
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  if (!/^\d+$/.test(String(ctx.params.id))) return { notFound: true }
  let ficha
  try {
    ficha = await fichaSuscripcion(ctx.params.id)
  } catch (e) {
    if (e instanceof ErrorReserva && e.estadoHttp === 404) return { notFound: true }
    throw e
  }
  const { sus } = ficha
  const iban = process.env.ESTUDIO_IBAN || null
  const { contratoDeSuscripcion, urlContrato, historialCobros, cobroAutomaticoActivo } = await import('../../../lib/suscripciones/alta')
  const { urlBase } = await import('../../../lib/http')
  const contrato = await contratoDeSuscripcion(sus.id)
  const sesion = (s) => vistaAdmin({ ...s, planSuscripcion: sus.plan })
  return {
    props: {
      sus,
      estado: ficha.estado,
      enPrueba: ficha.enPrueba,
      periodoActual: ficha.periodoActual,
      resumenActual: ficha.resumenActual,
      sesionesActual: ficha.sesionesActual.map(sesion),
      resumenSiguiente: ficha.resumenSiguiente,
      cuotas: ficha.cuotas.map((c) => ({
        ...c,
        texto: textoPeriodo(c),
        recordatorio: c.estado === 'pendiente' && c.importeCent > 0 ? enlaceWhatsApp(sus.telefono, textoRecordatorioCuota(sus, c, { iban })) : null,
      })),
      sesiones: ficha.sesiones.map(sesion),
      eventos: ficha.eventos.map((e) => ({ tipo: e.tipo, detalle: e.detalle, cuando: fechaHoraTexto(e.creadoEn), reservaId: e.reservaId, codigo: e.codigo }))
        .map((e) => ({ tipo: e.tipo, cuando: e.cuando, reservaId: e.reservaId ?? null, texto: textoEvento(e) || null })),
      ultimoDiaPermanencia: ficha.ultimoDiaPermanencia,
      contrato: contrato ? { estado: contrato.estado, version: contrato.version, firmadoEn: contrato.firmadoEn, enviadoEn: contrato.enviadoEn, recordadoEn: contrato.recordadoEn, url: urlContrato(urlBase(ctx.req), contrato.token) } : null,
      puedeBorrarse: ficha.puedeBorrarse,
      impago: ficha.impago || null,
      cobros: await historialCobros(sus.id),
      cobroDisponible: cobroAutomaticoActivo(),
      condiciones: ficha.condiciones,
      hoy: fechaMadrid(new Date()),
      emisorListo: Boolean(emisor()),
      facturasAuto: Boolean(facturasAutomaticas()),
      ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null,
    },
  }
}
