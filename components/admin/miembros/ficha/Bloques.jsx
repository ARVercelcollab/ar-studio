// Ficha del miembro · bloques de abajo: datos, condiciones, notas, baja, historial y área de miembros.
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { Tarjeta, Boton, Datos as ListaDatos, Aviso } from '../../ui'
import CondicionesPlan, { formularioDeCondiciones, formularioDePlan } from '../../CondicionesPlan'
import { enlaceWhatsApp } from '../../../../lib/admin/vista'
import { propuestaBaja, consecuenciasBaja, periodoNumero, textoPeriodo } from '../../../../lib/suscripciones/reglas'
import { PLANES, METODOS_CUOTA } from '../../../../lib/reservas/config'
import { useAccion, Mensaje, Desplegable, EVENTOS, METODOS, fecha, euros, fechaHoraCorta } from './comun'

// ---------- Datos ----------

const formularioDatos = (sus) => ({
  nombre: sus.nombre, apellidos: sus.apellidos || '', email: sus.email, telefono: sus.telefono || '',
  metodoHabitual: sus.metodoHabitual || '', cobroExternoRef: sus.cobroExternoRef || '', contratoUrl: sus.contratoUrl || '',
  quiereFactura: Boolean(sus.factura), factura: { nombre: sus.factura?.nombre || '', nif: sus.factura?.nif || '', direccion: sus.factura?.direccion || '' },
})

export function Datos({ sus }) {
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState(() => formularioDatos(sus))
  const [estado, ejecutar] = useAccion()
  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const wa = enlaceWhatsApp(sus.telefono)
  return (
    <Tarjeta
      titulo="Datos"
      acciones={!editando ? <Boton variante="texto" tam="peq" onClick={() => { setF(formularioDatos(sus)); setEditando(true) }}>Editar</Boton> : null}
      className="mb-bloque"
    >
      {!editando ? (
        <ListaDatos filas={[
          ['Código', sus.codigo],
          ['Correo', <a key="c" href={`mailto:${sus.email}`} className="mb-enlace">{sus.email}</a>],
          ['WhatsApp', wa ? <a key="w" href={wa} target="_blank" rel="noopener noreferrer" className="mb-enlace">{sus.telefono}</a> : '—'],
          ['Paga con', `${METODOS[sus.metodoHabitual] || '—'}${sus.cobroExterno === 'stripe' ? ` · cobro automático${sus.cobroExternoRef ? ` (${sus.cobroExternoRef})` : ''}` : ''}`],
          ['Facturas', sus.factura ? `${sus.factura.nombre} · ${sus.factura.nif} · ${sus.factura.direccion}` : 'Simplificadas (AR-S): no ha dado datos de empresa'],
          ['Contrato aparte', sus.contratoUrl ? <a key="k" href={sus.contratoUrl} target="_blank" rel="noopener noreferrer" className="mb-enlace">Abrir</a> : null],
          ['Alta', fecha(sus.creadoEn.slice(0, 10))],
        ]} />
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
            <label className="adm-ancho">Enlace al contrato firmado aparte<input value={f.contratoUrl} onChange={(e) => poner('contratoUrl', e.target.value)} placeholder="https://…" /></label>
            <label className="adm-check adm-ancho"><input type="checkbox" checked={f.quiereFactura} onChange={(e) => poner('quiereFactura', e.target.checked)} /> Quiere factura con sus datos (si no, se le hace la simplificada)</label>
            {f.quiereFactura && (
              <>
                <label className="adm-ancho">Nombre o razón social<input value={f.factura.nombre} onChange={(e) => poner('factura', { ...f.factura, nombre: e.target.value })} /></label>
                <label>NIF o CIF<input value={f.factura.nif} onChange={(e) => poner('factura', { ...f.factura, nif: e.target.value })} /></label>
                <label>Dirección<input value={f.factura.direccion} onChange={(e) => poner('factura', { ...f.factura, direccion: e.target.value })} /></label>
              </>
            )}
          </div>
          <div className="mb-botones">
            <Boton disabled={estado.enviando} onClick={async () => { const r = await ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'editar', ...f }); if (r) setEditando(false) }}>Guardar</Boton>
            <Boton variante="texto" onClick={() => setEditando(false)}>Cancelar</Boton>
          </div>
        </>
      )}
      <Mensaje estado={estado} />
    </Tarjeta>
  )
}

// ---------- Condiciones ----------

export function Condiciones({ sus, condiciones, periodoActual, estado: estadoSus }) {
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
    <Tarjeta titulo="Condiciones" nota={`Plan ${sus.planNombre}`} className="mb-bloque">
      <p className="mb-pequeno"><b className="ui-imp">{euros(sus.cuotaCent)} al mes</b> · {condiciones.join(' · ')}.</p>
      {sus.mesPrueba && <p className="mb-pequeno ui-t3">Primer mes de prueba.</p>}
      {estadoSus !== 'finalizada' && (
        <Desplegable titulo="Cambiar condiciones">
          <div className="adm-form">
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
          <p className="mb-pequeno ui-t3">La cuota y las horas cambian desde ese periodo (los de antes se quedan como estaban y las cuotas ya pagadas no se tocan). El horario, las duraciones, el máximo de sesiones y la antelación valen ya para las sesiones que se reserven a partir de ahora.</p>
          <div className="mb-botones">
            <Boton disabled={estado.enviando} onClick={() => ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'condiciones', plan, desdePeriodo: Number(desde), condiciones: form })}>Guardar condiciones</Boton>
          </div>
        </Desplegable>
      )}
      <Mensaje estado={estado} />
    </Tarjeta>
  )
}

// ---------- Notas ----------

export function Notas({ sus }) {
  const [notas, setNotas] = useState(sus.notasInternas)
  const [estado, ejecutar] = useAccion()
  return (
    <Tarjeta titulo="Notas del estudio" nota="Solo las veis vosotros" className="mb-bloque">
      <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Lo que conviene recordar de este miembro" aria-label="Notas del estudio" />
      <div className="mb-botones">
        <Boton variante="secundario" tam="peq" disabled={estado.enviando || notas === sus.notasInternas} onClick={() => ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'notas', notas })}>Guardar notas</Boton>
      </div>
      <Mensaje estado={estado} />
    </Tarjeta>
  )
}

// ---------- Baja ----------

export function Baja({ sus, sesiones, hoy, estado: estadoSus, puedeBorrarse }) {
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
      <Tarjeta titulo={estadoSus === 'finalizada' ? 'Terminada' : 'Se da de baja'} className="mb-bloque">
        <p className="mb-pequeno">Último día: <b>{fecha(sus.ultimoDia)}</b>{sus.bajaAvisadaEn ? ` · avisó el ${fecha(sus.bajaAvisadaEn)}` : ''}{sus.motivoBaja ? ` · ${sus.motivoBaja}` : ''}</p>
        {sus.cobroExterno && (
          <Aviso tono="aviso" titulo={`Cancela el cobro automático en ${sus.cobroExterno === 'stripe' ? 'Stripe' : 'la pasarela'}.`}>
            {sus.cobroExternoRef ? `Suscripción ${sus.cobroExternoRef}. ` : ''}Si no, le seguirán cobrando.
          </Aviso>
        )}
        <div className="mb-botones">
          {sus.cobroExterno && <Boton tam="peq" disabled={estado.enviando} onClick={() => ejecutar(url, { accion: 'cobro_externo_cancelado' })}>Ya está cancelado</Boton>}
          {estadoSus !== 'finalizada' && (
            <Boton variante="secundario" tam="peq" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Deshacer la baja? Sigue con la suscripción como antes.')) ejecutar(url, { accion: 'deshacer_baja' }) }}>Deshacer la baja</Boton>
          )}
        </div>
        <Mensaje estado={estado} />
      </Tarjeta>
    )
  }

  return (
    <Tarjeta titulo="Baja" className="mb-bloque">
      <Desplegable titulo="Ha avisado de que lo deja">
        <div className="adm-form">
          <label>Avisó el<input type="date" max={hoy} value={avisoEn} onChange={(e) => { setAvisoEn(e.target.value); setUltimoDia(null) }} /></label>
          <label>Último día<input type="date" min={sus.fechaInicio} value={dia} onChange={(e) => setUltimoDia(e.target.value)} /></label>
          <p className="adm-ancho adm-nota">
            {propuesta.motivo === 'prueba' ? 'Está en el mes de prueba: puede irse al final de este periodo.' : `Según el contrato, su último día es el ${fecha(propuesta.ultimoDia)} (periodo ${propuesta.ultimoPeriodo}).`}
            {ultimoDia && ultimoDia !== propuesta.ultimoDia && <> <button type="button" className="mb-enlace mb-enlace--boton" onClick={() => setUltimoDia(null)}>Volver a esa fecha</button></>}
          </p>
          <label className="adm-ancho">Motivo (opcional)<input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
          <label className="adm-check adm-ancho"><input type="checkbox" checked={cancelarSesiones} onChange={(e) => setCancelarSesiones(e.target.checked)} /> Cancelar las sesiones que tenga después de ese día</label>
        </div>
        {consecuencias && (
          <Aviso tono="info" titulo="Qué pasa:">
            {consecuencias.textos.map((t) => <span key={t} className="mb-linea">· {t}</span>)}
          </Aviso>
        )}
        {sus.cobroExterno && (
          <Aviso tono="aviso" titulo={`Paga con cobro automático (${sus.cobroExterno === 'stripe' ? 'Stripe' : 'pasarela'}).`}>
            Cancela también allí la suscripción{sus.cobroExternoRef ? ` ${sus.cobroExternoRef}` : ''} para que no le cobren más.
            <label className="adm-check mb-linea"><input type="checkbox" checked={stripeCancelado} onChange={(e) => setStripeCancelado(e.target.checked)} /> Ya lo he cancelado</label>
          </Aviso>
        )}
        <div className="mb-botones">
          <Boton disabled={estado.enviando || !dia} onClick={() => {
            const despues = sesiones.filter((x) => ['confirmada', 'pendiente', 'conflicto'].includes(x.estado) && x.fecha > dia).length
            const efecto = despues ? (cancelarSesiones ? ` Se cancelarán ${despues === 1 ? 'su sesión' : `sus ${despues} sesiones`} de después de ese día.` : ` Tiene ${despues === 1 ? 'una sesión' : `${despues} sesiones`} después de ese día.`) : ''
            if (window.confirm(`¿Apuntar la baja con último día el ${fecha(dia)}?${efecto} Las cuotas pendientes de después se quitan.`)) {
              ejecutar(url, { accion: 'baja', avisoEn, ultimoDia: dia, motivo, cancelarSesiones, cobroExternoCancelado: stripeCancelado })
            }
          }}>Apuntar la baja</Boton>
        </div>
      </Desplegable>
      {puedeBorrarse && (
        <Desplegable titulo="Borrar (solo si el alta fue un error)">
          <p className="mb-pequeno ui-t3">No tiene sesiones ni cuotas cobradas. Se borra del todo, sin dejar rastro.</p>
          <div className="mb-botones">
            <Boton variante="peligro" tam="peq" disabled={estado.enviando} onClick={() => { if (window.confirm('¿Borrar esta suscripción del todo?')) ejecutar(url, { accion: 'borrar' }, { despues: () => router.push('/admin/miembros?ok=borrada') }) }}>Borrar suscripción</Boton>
          </div>
        </Desplegable>
      )}
      <Mensaje estado={estado} />
    </Tarjeta>
  )
}

// ---------- Historial ----------

// Quién lo hizo, solo cuando no ha sido el estudio desde el panel
const AUTORES = { cliente: 'El miembro', miembro: 'El miembro' }

export function Historial({ eventos }) {
  const [todo, setTodo] = useState(false)
  const lista = [...eventos].reverse()
  const visibles = todo ? lista : lista.slice(0, 8)
  return (
    <Tarjeta titulo="Historial" nota="Todo lo que ha pasado con este miembro" className="mb-bloque">
      {lista.length === 0 ? <p className="ui-t3">Sin movimientos todavía.</p> : (
        <ul className="mb-historial">
          {visibles.map((e, i) => (
            <li key={i}>
              <time>{e.cuando}</time>
              <span>{EVENTOS[e.tipo] || e.tipo}{e.texto ? ` · ${e.texto}` : ''}{AUTORES[e.autor] ? ` · ${AUTORES[e.autor]}` : ''}{e.reservaId ? <> · <Link href={`/admin/reserva/${e.reservaId}`} className="mb-enlace">ver</Link></> : null}</span>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 8 && (
        <div className="mb-botones">
          <Boton variante="texto" tam="peq" onClick={() => setTodo(!todo)}>{todo ? 'Ver menos' : `Ver todo (${lista.length})`}</Boton>
        </div>
      )}
    </Tarjeta>
  )
}

// ---------- Área de miembros ----------

// Si ha entrado en su área (studioar.es/miembros) y reenviarle el enlace para entrar
// acceso: { ultimoEn, enviadoEn } (ISO o null)
export function AreaMiembros({ sus, acceso, estado: estadoSus }) {
  const [estado, ejecutar] = useAccion()
  const cuando = (iso) => (iso ? fechaHoraCorta(iso) : null)
  const ultimo = cuando(acceso?.ultimoEn)
  const enviado = cuando(acceso?.enviadoEn)
  const terminada = estadoSus === 'finalizada'
  return (
    <Tarjeta
      titulo="Área de miembros"
      nota="Entra con su correo en studioar.es/miembros: ve sus horas, reserva y cambia sus sesiones y descarga sus facturas"
      className="mb-bloque"
      acciones={!terminada && (
        <Boton variante="secundario" tam="peq" icono="correo" disabled={estado.enviando || !sus.email} onClick={() => ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'enviar_acceso' })}>
          {estado.enviando ? 'Enviando…' : 'Enviar enlace de acceso'}
        </Boton>
      )}
    >
      <ListaDatos filas={[
        ['Último acceso', ultimo || 'Aún no ha entrado'],
        ['Último enlace enviado', enviado ? `${enviado} · a ${sus.email}` : 'Ninguno'],
      ]} />
      {ultimo && (
        <div className="mb-botones">
          <Boton
            variante="texto"
            tam="peq"
            icono="salir"
            disabled={estado.enviando}
            onClick={() => { if (window.confirm('¿Cerrar su sesión en el área de miembros? Tendrá que pedir otro enlace para entrar.')) ejecutar(`/api/admin/suscripciones/${sus.id}`, { accion: 'cerrar_sesiones' }) }}
          >
            Cerrar su sesión en el área
          </Boton>
        </div>
      )}
      <Mensaje estado={estado} />
    </Tarjeta>
  )
}
