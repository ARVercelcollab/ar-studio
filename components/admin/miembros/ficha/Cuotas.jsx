// Ficha del miembro · cuotas: una por periodo, con su estado, el cobro automático, la factura y
// las acciones (cobrar ahora, marcar pagada, enlace de pago, recordatorio, factura, editar…).
import { useEffect, useState } from 'react'
import { Tarjeta, Boton, Etiqueta } from '../../ui'
import { METODOS_CUOTA } from '../../../../lib/reservas/config'
import { TEXTOS_CHIP_CUOTA } from '../../../../lib/suscripciones/reglas'
import { useAccion, Mensaje, METODOS, h, fecha, fechaHoraCorta, euros } from './comun'

const TONO_CHIP = { pagada: 'bien', sin_pagar: 'aviso', atrasada: 'mal', proxima: 'gris', sin_cargo: 'gris', anulada: 'gris', devuelta: 'gris' }
const TEXTO_COBRO = {
  cobrando: 'Cobrando ahora en la tarjeta…', rechazado: 'El banco rechazó el cobro', agotado: 'Rechazado en todos los intentos',
  revisar: 'No sabemos si se cobró: míralo en el portal del TPV',
}

// Todo lo cobrado lleva factura: completa si ha dado sus datos y simplificada si no
const pagoDe = (sus, emisorListo, facturasAuto, hoy) => {
  const metodo = sus.metodoHabitual && METODOS[sus.metodoHabitual] ? sus.metodoHabitual : 'transferencia'
  return { metodo, fecha: hoy, referencia: '', emitirFactura: metodo !== 'stripe' && emisorListo && facturasAuto }
}
const edicionDe = (c) => ({ importe: (c.importeCent / 100).toFixed(2).replace('.', ','), horas: String(c.horas).replace('.', ','), nota: '' })
const facturaDe = (sus) => ({ nombre: sus.factura?.nombre || '', nif: sus.factura?.nif || '', direccion: sus.factura?.direccion || '' })
// «Referencia o enlace»: si es una dirección https, va como enlace (justificante)
const referenciaOEnlace = (v) => (/^https:\/\//i.test(String(v || '').trim()) ? { enlace: String(v).trim(), referencia: '' } : { referencia: v, enlace: '' })

function EstadoCuota({ c }) {
  if (c.estado === 'pendiente' && ['rechazado', 'agotado'].includes(c.cobroEstado)) return <Etiqueta tono="mal" punto>Rechazada</Etiqueta>
  if (c.estado === 'pendiente' && c.cobroEstado === 'revisar') return <Etiqueta tono="aviso" punto>Por revisar</Etiqueta>
  return <Etiqueta tono={TONO_CHIP[c.chip] || 'gris'} punto>{TEXTOS_CHIP_CUOTA[c.chip] || c.chip}</Etiqueta>
}

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
  const debe = cobrable && ['sin_pagar', 'atrasada'].includes(c.chip)

  // Detalle debajo del periodo
  let detalle = `${h(c.horasUsadas)} de ${h(c.horas)}${c.nota ? ` · ${c.nota}` : ''}`
  if (c.estado === 'pagada') detalle += ` · ${[METODOS[c.metodoPago] || c.metodoPago, c.pagadaEn ? fecha(c.pagadaEn, false) : null, c.referencia].filter(Boolean).join(' · ')}`
  if (c.estado === 'devuelta' && c.devueltaEn) detalle += ` · devuelta el ${fecha(c.devueltaEn, false)}`
  let cobro = null
  if (pendiente && c.cobroEstado) cobro = `${TEXTO_COBRO[c.cobroEstado]}${c.cobroEstado === 'rechazado' && c.cobroProximo ? ` · reintento el ${fecha(c.cobroProximo, false)}` : ''}${c.cobroError ? ` · ${c.cobroError}` : ''}`
  else if (pendiente && sus.cobroAuto && c.importeCent > 0) cobro = 'Se cobra sola en la tarjeta'

  return (
    <li className={`mb-cuota${debe ? ' es-debe' : ''}`}>
      <div className="mb-cuota__fila">
        <div className="mb-cuota__quien">
          <span className="mb-cuota__titulo">Mes {c.periodo} · {c.texto}</span>
          <span className="mb-cuota__sub">{detalle}</span>
          {cobro && <span className={`mb-cuota__cobro${['agotado', 'revisar'].includes(c.cobroEstado) ? ' is-mal' : ''}`}>{cobro}</span>}
          {c.enlace && <a href={c.enlace} target="_blank" rel="noopener noreferrer" className="mb-enlace">Ver justificante</a>}
        </div>
        <div className="mb-cuota__derecha">
          <span className={`mb-cuota__importe ui-imp${debe ? ' ui-mal' : ''}`}>{euros(c.importeCent)}</span>
          <EstadoCuota c={c} />
        </div>
      </div>
      <div className="mb-cuota__acciones">
        {cobrable && sus.cobroAuto && cobroDisponible && !['cobrando', 'revisar'].includes(c.cobroEstado) && c.desde <= hoy && (
          <Boton tam="peq" disabled={estado.enviando}
            onClick={() => { if (window.confirm(`¿Cobrar ahora ${euros(c.importeCent)} en la tarjeta ${sus.tarjeta?.ultimos ? `···· ${sus.tarjeta.ultimos}` : 'guardada'}?`)) hacer({ accion: 'cobrar_ahora' }) }}>Cobrar ahora</Boton>
        )}
        {cobrable && c.cobroEstado === 'revisar' && (
          <Boton variante="secundario" tam="peq" disabled={estado.enviando}
            onClick={() => { if (window.confirm('¿Has comprobado en el portal del TPV que este cobro NO se hizo? Si se cobró, usa «Marcar pagada».')) hacer({ accion: 'no_cobrado' }) }}>No se cobró</Boton>
        )}
        {cobrable && <Boton variante={sus.cobroAuto && cobroDisponible ? 'secundario' : 'primario'} tam="peq" aria-expanded={abierto === 'pagar'} onClick={() => alternar('pagar')}>Marcar pagada</Boton>}
        {cobrable && c.recordatorio && <Boton variante="secundario" tam="peq" icono="wa" href={c.recordatorio} externo>Recordar por WhatsApp</Boton>}
        {cobrable && sus.email && (
          <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => hacer({ accion: 'enlace_pago' })}
            title={c.avisoPagoEn ? `Enviado el ${fechaHoraCorta(c.avisoPagoEn)}` : 'Le llega un correo con un enlace para pagar con tarjeta o Bizum'}>
            {c.avisoPagoEn ? 'Reenviar enlace de pago' : 'Enviar enlace de pago'}
          </Boton>
        )}
        {c.factura && <Boton variante="secundario" tam="peq" icono="doc" href={`/api/admin/facturas/${c.factura.id}`} externo>{c.factura.simplificada ? 'Simplificada' : 'Factura'} {c.factura.codigo}</Boton>}
        {c.factura && <Boton variante="texto" tam="peq" disabled={estado.enviando} onClick={() => hacer({ accion: 'factura' })}>{c.factura.enviada ? 'Reenviar' : 'Enviar factura'}</Boton>}
        {(!c.factura || c.factura.simplificada) && c.estado === 'pagada' && c.importeCent > 0 && emisorListo && (
          <Boton variante="texto" tam="peq" aria-expanded={abierto === 'factura'} onClick={() => alternar('factura')}>{c.factura ? 'Hacer la completa' : 'Emitir factura'}</Boton>
        )}
        <Boton variante="texto" tam="peq" aria-expanded={abierto === 'mas'} onClick={() => alternar('mas')}>Más ▾</Boton>
      </div>

      {abierto && (
        <div className="mb-cuota__form">
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
              <div className="mb-botones">
                <Boton disabled={estado.enviando} onClick={() => hacer({ accion: 'pagada', ...pago, ...referenciaOEnlace(pago.referencia) })}>Guardar pago</Boton>
                <Boton variante="texto" onClick={() => setAbierto(null)}>Cancelar</Boton>
              </div>
            </>
          )}
          {abierto === 'factura' && (
            <>
              <p className="adm-nota">
                {c.factura ? `Con nombre, NIF y dirección se hace la factura completa, que sustituye a la simplificada ${c.factura.codigo}.` : 'Con nombre, NIF y dirección sale la factura completa. Si lo dejas vacío, sale la simplificada.'}
              </p>
              <div className="adm-form">
                <label className="adm-ancho">Nombre o razón social<input value={datosFactura.nombre} onChange={(e) => setDatosFactura({ ...datosFactura, nombre: e.target.value })} /></label>
                <label>NIF o CIF<input value={datosFactura.nif} onChange={(e) => setDatosFactura({ ...datosFactura, nif: e.target.value })} /></label>
                <label>Dirección<input value={datosFactura.direccion} onChange={(e) => setDatosFactura({ ...datosFactura, direccion: e.target.value })} /></label>
              </div>
              <div className="mb-botones">
                <Boton disabled={estado.enviando} onClick={() => hacer({ accion: 'factura', ...datosFactura })}>Emitir y enviar factura</Boton>
                <Boton variante="texto" onClick={() => setAbierto(null)}>Cancelar</Boton>
              </div>
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
                    <label className="adm-check adm-ancho"><input type="checkbox" checked={pausa} onChange={(e) => setPausa(e.target.checked)} /> Sin horas ese mes (pausa), si la anulas</label>
                  </div>
                  <div className="mb-botones">
                    <Boton tam="peq" disabled={estado.enviando} onClick={() => hacer({ accion: 'editar', ...edicion })}>Guardar cambios</Boton>
                    <Boton variante="peligro" tam="peq" disabled={estado.enviando} onClick={() => { if (window.confirm(pausa ? '¿Anular la cuota y quitarle las horas de ese periodo?' : '¿Anular la cuota? Mantiene sus horas de ese periodo.')) hacer({ accion: 'anular', pausa, nota: edicion.nota }) }}>Anular cuota</Boton>
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
                  <div className="mb-botones">
                    <Boton tam="peq" disabled={estado.enviando} onClick={() => hacer({ accion: 'editar', horas: edicion.horas, nota: edicion.nota })}>Guardar horas</Boton>
                    {!c.factura && <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Deshacer el pago? Vuelve a quedar pendiente.')) hacer({ accion: 'desmarcar' }) }}>Deshacer el pago</Boton>}
                    <Boton variante="peligro" tam="peq" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Apuntar que se le ha devuelto esta cuota? (la devolución se hace aparte, en el banco o en Stripe)')) hacer({ accion: 'devolver', nota: edicion.nota, fecha: devueltaEl || hoy }) }}>Se le ha devuelto</Boton>
                  </div>
                </>
              )}
              {!pendiente && c.estado !== 'pagada' && <p className="adm-nota">Esta cuota está {c.estado}. No hay nada más que hacer con ella.</p>}
            </>
          )}
        </div>
      )}
      <Mensaje estado={estado} />
    </li>
  )
}

export default function Cuotas({ cuotas, ...resto }) {
  return (
    <Tarjeta titulo="Cuotas" nota="La de cada mes aparece sola cuando empieza. Las de 0 € no se cobran ni se facturan." className="mb-bloque">
      {cuotas.length === 0 ? (
        <p className="ui-t3">Todavía no tiene cuotas.</p>
      ) : (
        <ul className="mb-cuotas">
          {[...cuotas].reverse().map((c) => <FilaCuota key={c.id} c={c} {...resto} />)}
        </ul>
      )}
    </Tarjeta>
  )
}
