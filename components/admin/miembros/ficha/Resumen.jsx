// Ficha del miembro · las tres tarjetas de arriba: horas de este mes, cobro mensual, y contrato y fianza.
import { useState } from 'react'
import Link from 'next/link'
import { Tarjeta, Boton, Etiqueta, Datos } from '../../ui'
import { consecuenciasBaja, proximoCobro, finCaducidad } from '../../../../lib/suscripciones/reglas'
import { textoFechaCorta } from '../../../../lib/reservas/tiempo'
import { useAccion, Mensaje, Desplegable, METODOS, METODOS_A_MANO, h, fecha, fechaHoraCorta, caducidad, euros } from './comun'
import { Horas } from '../ListaMiembros'

// ---------- Horas de este mes ----------

export function HorasMes({ estado, resumenActual: r, resumenSiguiente, condiciones }) {
  if (estado === 'finalizada') {
    return (
      <Tarjeta titulo="Horas" className="mb-bloque">
        <p className="ui-t3">La suscripción ha terminado.</p>
      </Tarjeta>
    )
  }
  const detalle = [r.hechas > 0 && `${h(r.hechas)} hechas`, r.reservadas > 0 && `${h(r.reservadas)} reservadas`, r.canceladasTarde > 0 && `${h(r.canceladasTarde)} canceladas tarde (cuentan)`].filter(Boolean).join(' · ')
  return (
    <Tarjeta titulo={estado === 'por_empezar' ? 'Horas del primer mes' : 'Horas de este mes'} nota={r.texto} className="mb-bloque mb-horasmes">
      <p className="mb-grande">{h(r.usadas)} <small>de {h(r.horas)}</small></p>
      <Horas usadas={r.usadas} total={r.horas} />
      <p className="mb-pequeno">
        {detalle || 'Aún no ha reservado nada este mes.'}
        {r.restantes > 0 && r.diasParaCaducar >= 0 && <> Le quedan <b>{h(r.restantes)}</b>: lo que no use se pierde el {textoFechaCorta(r.ultimoDia)}{r.diasParaCaducar <= 7 ? ` (en ${r.diasParaCaducar} ${r.diasParaCaducar === 1 ? 'día' : 'días'})` : ''}.</>}
      </p>
      {resumenSiguiente && (
        <p className="mb-pequeno">Mes siguiente ({resumenSiguiente.texto}): {h(resumenSiguiente.horas)}{resumenSiguiente.usadas > 0 ? `, ya tiene ${h(resumenSiguiente.usadas)} reservadas` : ''}.</p>
      )}
      {condiciones?.length > 0 && <p className="mb-pequeno ui-t3">{condiciones.join(' · ')}.</p>}
    </Tarjeta>
  )
}

// ---------- Cobro mensual ----------

const ESTADO_PAGO = { pagado: 'Cobrado', fallido: 'Rechazado', iniciado: 'Sin confirmar' }

export function CobroMensual({ sus, cuotas, cobros, cobroDisponible, hoy }) {
  const [estado, ejecutar] = useAccion()
  const url = `/api/admin/suscripciones/${sus.id}`
  const prox = proximoCobro(sus, cuotas, hoy)
  const fin = sus.tarjeta?.caduca ? finCaducidad(sus.tarjeta.caduca) : null
  const siguiente = cuotas.find((c) => c.estado === 'pendiente' && c.importeCent > 0 && c.desde >= (prox || hoy))
  let como
  if (sus.cobroAuto) como = cobroDisponible ? 'Se cobra sola cada mes' : 'Automático, pero el TPV aún no tiene activado el cobro recurrente'
  else if (sus.cobroExterno === 'stripe') como = `Stripe le cobra cada mes${sus.cobroExternoRef ? ` (${sus.cobroExternoRef})` : ''}`
  else if (sus.cobroExterno) como = 'Cobro automático en la pasarela'
  else if (sus.cobroEnlace) como = 'Le llega un enlace de pago por correo cada mes'
  else como = `Se marca a mano cuando paga${sus.metodoHabitual ? ` (${(METODOS[sus.metodoHabitual] || sus.metodoHabitual).toLowerCase()})` : ''}`
  return (
    <Tarjeta titulo="Cobro mensual" className="mb-bloque">
      <Datos filas={[
        ['Tarjeta', sus.tarjeta ? (
          <>
            {sus.tarjeta.ultimos ? `···· ${sus.tarjeta.ultimos}` : 'Guardada'} · caduca {caducidad(sus.tarjeta.caduca)}
            {fin && prox && fin < prox && <> <Etiqueta tono="aviso">Caduca antes del próximo cobro</Etiqueta></>}
          </>
        ) : (sus.origen === 'web' || sus.cobroAuto ? 'Sin tarjeta guardada' : null)],
        ['Cómo se cobra', como],
        ['Próximo cobro', sus.cobroAuto ? (prox ? <>{fecha(prox, false)}{siguiente ? <> · <span className="ui-imp">{euros(siguiente.importeCent)}</span></> : null}</> : '—') : null],
      ]} />
      <div className="mb-botones">
        {sus.cobroAuto && (
          <Boton variante="secundario" tam="peq" disabled={estado.enviando}
            onClick={() => { if (window.confirm('¿Dejar de cobrar solo? Las cuotas siguientes habrá que marcarlas a mano (o mandar el enlace de pago).')) ejecutar(url, { accion: 'cobro_auto', activar: false }) }}>Dejar de cobrar</Boton>
        )}
        {!sus.cobroAuto && sus.tarjeta && cobroDisponible && (
          <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'cobro_auto', activar: true })}>Volver a cobrar solo</Boton>
        )}
      </div>
      {cobros.length > 0 && (
        <Desplegable titulo={`Intentos de cobro automático (${cobros.length})`}>
          <ul className="mb-historial">
            {cobros.map((x) => (
              <li key={x.pedido}>
                <time>{fechaHoraCorta(x.cuando)}</time>
                <span>Mes {x.periodo} · <span className="ui-imp">{euros(x.importeCent)}</span> · {ESTADO_PAGO[x.estado] || x.estado}{x.codigo && x.estado !== 'pagado' ? ` (código ${x.codigo})` : ''} · pedido {x.pedido}</span>
              </li>
            ))}
          </ul>
        </Desplegable>
      )}
      <Mensaje estado={estado} />
    </Tarjeta>
  )
}

// ---------- Contrato y fianza ----------

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
    <div className="mb-subbloque">
      <h3>Contrato</h3>
      {!contrato && (
        <>
          <p className="mb-pequeno">{sus.contratoUrl ? <>Firmado aparte · <a href={sus.contratoUrl} target="_blank" rel="noopener noreferrer" className="mb-enlace">abrir</a></> : 'Sin contrato en la web.'}</p>
          {sus.email && (
            <div className="mb-botones">
              <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, {})}>Enviarle el contrato para firmar</Boton>
            </div>
          )}
          <p className="mb-pequeno ui-t3">Le llega un correo con un enlace para rellenar sus datos y firmar desde el móvil.</p>
        </>
      )}
      {contrato && contrato.estado === 'pendiente' && (
        <>
          <p className="mb-pequeno">
            <Etiqueta tono="aviso" punto>Sin firmar</Etiqueta>
            {contrato.enviadoEn ? ` Enlace enviado el ${fechaHoraCorta(contrato.enviadoEn)}.` : ''}
            {contrato.recordadoEn ? ` Recordado el ${fechaHoraCorta(contrato.recordadoEn)}.` : ''}
          </p>
          <div className="mb-botones">
            <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, {})}>Reenviar el enlace</Boton>
            <Boton variante="texto" tam="peq" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar enlace'}</Boton>
          </div>
        </>
      )}
      {contrato && contrato.estado === 'firmado' && (
        <>
          <p className="mb-pequeno"><Etiqueta tono="bien" punto>Firmado</Etiqueta> el {fechaHoraCorta(contrato.firmadoEn)} · versión {contrato.version}</p>
          <div className="mb-botones">
            <Boton variante="secundario" tam="peq" icono="bajar" href={url} externo>Contrato en PDF</Boton>
          </div>
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
  const fueraDePlazo = sus.fianzaEstado === 'pendiente' && sus.fianzaLimite && sus.fianzaLimite < hoy
  let resumen
  if (sus.fianzaEstado === 'pendiente') {
    resumen = (
      <>
        <Etiqueta tono={fueraDePlazo ? 'mal' : 'aviso'} punto>{fueraDePlazo ? 'Fuera de plazo' : 'Pendiente'}</Etiqueta>{' '}
        <span className="ui-imp">{euros(sus.fianzaCent)}</span> por transferencia.
        {sus.fianzaLimite ? ` Plazo de 7 días: ${fueraDePlazo ? 'acabó' : 'hasta'} el ${fecha(sus.fianzaLimite)}.` : sus.contratoEstado === 'pendiente' ? ' El plazo de 7 días empieza al firmar el contrato.' : ''}
      </>
    )
  } else if (sus.fianzaEstado === 'cobrada') resumen = <><Etiqueta tono="bien" punto>Recibida</Etiqueta> <span className="ui-imp">{euros(sus.fianzaCent)}</span>{sus.fianzaMetodo ? ` por ${(METODOS[sus.fianzaMetodo] || sus.fianzaMetodo).toLowerCase()}` : ''}{sus.fianzaCobradaEn ? ` el ${fecha(sus.fianzaCobradaEn)}` : ''}.</>
  else if (sus.fianzaEstado === 'devuelta') resumen = <>Devuelta: <span className="ui-imp">{euros(sus.fianzaDevueltaCent ?? sus.fianzaCent)}</span> el {fecha(sus.fianzaResueltaEn)}.</>
  else if (sus.fianzaEstado === 'retenida') resumen = <>Os la quedasteis (<span className="ui-imp">{euros(sus.fianzaCent)}</span>) el {fecha(sus.fianzaResueltaEn)}.</>
  else resumen = 'Sin fianza.'
  return (
    <div className="mb-subbloque">
      <h3>Fianza</h3>
      <p className="mb-pequeno">{resumen}{sus.fianzaNota ? ` ${sus.fianzaNota}` : ''}</p>
      {['pendiente', 'sin_fianza'].includes(sus.fianzaEstado) && (
        <Desplegable titulo="Marcar como recibida">
          <div className="adm-form">
            <label>Importe (€)<input inputMode="decimal" value={f.euros} onChange={poner('euros')} /></label>
            <label>Cómo<select value={f.metodo} onChange={poner('metodo')}>{METODOS_A_MANO.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></label>
            <label>Cuándo<input type="date" max={hoy} value={f.fecha} onChange={poner('fecha')} /></label>
          </div>
          <div className="mb-botones">
            <Boton tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'cobrada', ...f })}>Guardar</Boton>
            {sus.fianzaEstado === 'pendiente' && <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'sin_fianza', nota: f.nota })}>No deja fianza</Boton>}
          </div>
        </Desplegable>
      )}
      {sus.fianzaEstado === 'cobrada' && sus.ultimoDia && (
        <>
          {recomendacion && <p className="mb-pequeno">{recomendacion === 'devolver' ? 'Según las condiciones, se le devuelve (si el estudio y el equipo están bien).' : 'No cumple la permanencia: según las condiciones, la pierde.'}</p>}
          <div className="adm-form">
            <label>Se devuelve (€)<input inputMode="decimal" value={f.euros} onChange={poner('euros')} /></label>
            <label>Fecha<input type="date" max={hoy} value={f.fecha} onChange={poner('fecha')} /></label>
            <label className="adm-ancho">Nota{recomendacion === 'retener' ? ' (obligatoria si os la quedáis)' : ''}<input value={f.nota} onChange={poner('nota')} placeholder="Si se devuelve solo una parte o os la quedáis, explica por qué" /></label>
          </div>
          <div className="mb-botones">
            <Boton variante={recomendacion === 'retener' ? 'secundario' : 'primario'} tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'devolver', ...f })}>Apuntar devuelta</Boton>
            <Boton variante={recomendacion === 'devolver' ? 'secundario' : 'primario'} tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'fianza', fianza: 'retener', nota: f.nota, fecha: f.fecha })}>Os la quedáis</Boton>
          </div>
        </>
      )}
      {sus.fianzaEstado === 'cobrada' && !sus.ultimoDia && <p className="mb-pequeno ui-t3">Se resuelve cuando se dé de baja.</p>}
      <Mensaje estado={estado} />
    </div>
  )
}

export function ContratoYFianza({ sus, contrato, hoy }) {
  return (
    <Tarjeta titulo="Contrato y fianza" className="mb-bloque">
      <Contrato sus={sus} contrato={contrato} />
      <Fianza sus={sus} hoy={hoy} />
    </Tarjeta>
  )
}

// Estado de una sesión del plan, como etiqueta
function estadoSesion(s) {
  if (s.estado === 'conflicto') return ['mal', 'Revisar pago']
  if (s.estado === 'cancelada') return ['gris', s.cuentaComoUsada ? 'Cancelada (cuenta)' : 'Cancelada']
  if (s.estado === 'caducada') return ['gris', 'Caducada']
  if (s.estado === 'pendiente') return ['aviso', 'Pagando…']
  if (s.esPlan && s.pagoEstado !== 'pagado') return ['aviso', 'Horas aparte sin pagar']
  return null
}

// Sesiones del mes (y las demás, plegadas)
export function Sesiones({ sesionesActual, otras, estado, susId }) {
  const fila = (s) => (
    <li key={s.id}>
      <Link href={`/admin/reserva/${s.id}`} className="mb-sesion">
        <span className="mb-sesion__raya" aria-hidden="true" />
        <span className="mb-sesion__texto">
          <b>{textoFechaCorta(s.fecha)} · {s.horaInicio}–{s.horaFin}</b>
          <small>{[s.horasPlanTexto, s.motivoCancelacion].filter(Boolean).join(' · ')}</small>
        </span>
        {estadoSesion(s) && <Etiqueta tono={estadoSesion(s)[0]}>{estadoSesion(s)[1]}</Etiqueta>}
        {s.importePlan && <span className="mb-sesion__importe ui-imp">{s.importePlan}</span>}
        <span className="mb-sesion__ver">Ver</span>
      </Link>
    </li>
  )
  return (
    <Tarjeta
      titulo="Sesiones"
      nota="Las de este mes"
      acciones={estado !== 'finalizada' ? <Boton variante="secundario" tam="peq" icono="mas" href={`/admin/anadir?tipo=reserva&suscripcion=${susId}`}>Reservar sesión</Boton> : null}
      className="mb-bloque"
    >
      {sesionesActual.length === 0 ? <p className="ui-t3">No tiene sesiones este mes.</p> : <ul className="mb-sesiones">{sesionesActual.map(fila)}</ul>}
      {otras.length > 0 && (
        <Desplegable titulo={`Otras sesiones (${otras.length})`}>
          <ul className="mb-sesiones">{[...otras].reverse().map(fila)}</ul>
        </Desplegable>
      )}
    </Tarjeta>
  )
}
