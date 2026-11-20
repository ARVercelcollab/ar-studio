// Reservas · Calendario: la semana con las reservas por horas, las sesiones de los miembros,
// lo que está sin pagar y los bloqueos. En el móvil, un día cada vez.
// Los datos los prepara cargarCalendario (components/admin/reservas/datos.js).
import Link from 'next/link'
import { useState } from 'react'
import Panel from '../Panel'
import { Boton, SelectorFlechas, Aviso, Vacio } from '../ui'
import { AccionesReservas } from './comun'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
export const ALTO_HORA = 44 // px por hora en la rejilla

const corta = (f) => {
  const [, m, d] = f.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

function Evento({ e, estilo }) {
  const contenido = (
    <>
      <b>{e.ini} {e.titulo}</b>
      <span>{e.sub}</span>
    </>
  )
  const cl = `rsv-evento rsv-evento--${e.tipo}`
  const etiqueta = `${e.ini}–${e.fin} · ${e.titulo} · ${e.sub}`
  if (!e.href) return <div className={cl} style={estilo} title={etiqueta}>{contenido}</div>
  return <Link href={e.href} className={cl} style={estilo} title={etiqueta} aria-label={etiqueta}>{contenido}</Link>
}

export default function VistaCalendario({ semana, dias, hoy, anterior, siguiente, horas, avisos, hayEventos }) {
  const enSemana = dias.some((d) => d.fecha === hoy)
  const [elegido, setElegido] = useState(enSemana ? hoy : dias[0].fecha)
  const diaElegido = dias.find((d) => d.fecha === elegido) || dias[0]

  return (
    <Panel
      titulo="Reservas"
      sub={`Semana del ${corta(dias[0].fecha)} al ${corta(dias[6].fecha)}`}
      acciones={<AccionesReservas />}
      clase="adm-reservas"
    >
      {avisos.length > 0 && (
        <Aviso tono="aviso" titulo="Falta por configurar:" className="rsv-aviso-config">{avisos.join(' · ')}</Aviso>
      )}

      <div className="rsv-barra">
        <div className="rsv-leyenda" aria-label="Leyenda">
          <span><i className="rsv-muestra rsv-muestra--horas" />Reserva por horas</span>
          <span><i className="rsv-muestra rsv-muestra--plan" />Sesión de miembro</span>
          <span><i className="rsv-muestra rsv-muestra--sinpagar" />Sin pagar</span>
          <span><i className="rsv-muestra rsv-muestra--bloqueo" />Bloqueo</span>
        </div>
        <div className="rsv-barra__semana">
          <SelectorFlechas texto={`${corta(dias[0].fecha)} – ${corta(dias[6].fecha)}`} anterior={anterior} siguiente={siguiente} etiqueta="Semana" />
          <Boton variante="secundario" href="/admin/reservas" aria-current={enSemana ? 'page' : undefined}>Hoy</Boton>
        </div>
      </div>

      {/* Ordenador: la semana entera */}
      <div className="rsv-semana" aria-label={`Reservas de la semana del ${corta(semana)}`} role="region">
        <div className="rsv-semana__cab" aria-hidden="true">
          <span className="rsv-semana__esquina" />
          {dias.map((d) => (
            <span key={d.fecha} className={`rsv-semana__dia${d.fecha === hoy ? ' es-hoy' : ''}${d.festivo ? ' es-festivo' : ''}`}>
              {d.nombre}<b>{d.numero}</b>{d.festivo && <small>Festivo</small>}
            </span>
          ))}
        </div>
        <div className="rsv-semana__cuerpo" style={{ '--alto-hora': `${ALTO_HORA}px`, '--horas': horas.length - 1 }}>
          <div className="rsv-semana__horas" aria-hidden="true">
            {horas.slice(0, -1).map((h) => <span key={h}>{h}</span>)}
          </div>
          {dias.map((d) => (
            <div key={d.fecha} className={`rsv-semana__col${d.fecha === hoy ? ' es-hoy' : ''}`} role="group" aria-label={`${d.nombre} ${d.numero}${d.festivo ? ' (festivo)' : ''}: ${d.eventos.length ? plural(d.eventos.length) : 'nada reservado'}`}>
              {d.eventos.map((e) => (
                <Evento key={e.clave} e={e} estilo={{ top: `${(e.desdeMin / 60) * ALTO_HORA}px`, height: `${Math.max(22, (e.duracionMin / 60) * ALTO_HORA - 3)}px` }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Móvil: tira de días y la lista del día elegido */}
      <div className="rsv-movil">
        <div className="rsv-dias" role="group" aria-label="Día">
          {dias.map((d) => (
            <button key={d.fecha} type="button" aria-pressed={d.fecha === elegido} onClick={() => setElegido(d.fecha)}>
              <span>{d.nombre}</span>
              <b>{d.numero}</b>
              {d.eventos.length > 0 ? <i className="rsv-dias__punto" aria-label={plural(d.eventos.length)} /> : <i className="rsv-dias__vacio" aria-hidden="true" />}
            </button>
          ))}
        </div>
        {diaElegido.eventos.length === 0 ? (
          <Vacio compacto icono="cal" texto={diaElegido.festivo ? 'Festivo: no hay nada reservado.' : 'No hay nada reservado este día.'} />
        ) : (
          <ul className="rsv-dia-lista">
            {diaElegido.eventos.map((e) => (
              <li key={e.clave}>
                {e.href ? (
                  <Link href={e.href} className={`rsv-fila-evento rsv-fila-evento--${e.tipo}`}>
                    <span className="rsv-fila-evento__hora">{e.ini}–{e.fin}</span>
                    <span><b>{e.titulo}</b><span className="ui-t3">{e.sub}</span></span>
                  </Link>
                ) : (
                  <div className={`rsv-fila-evento rsv-fila-evento--${e.tipo}`}>
                    <span className="rsv-fila-evento__hora">{e.ini}–{e.fin}</span>
                    <span><b>{e.titulo}</b><span className="ui-t3">{e.sub}</span></span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!hayEventos && (
        <p className="rsv-nota">No hay reservas ni bloqueos esta semana. <Link href="/admin/reservas/lista">Ver la lista</Link></p>
      )}
    </Panel>
  )
}

const plural = (n) => `${n} ${n === 1 ? 'cosa' : 'cosas'}`
