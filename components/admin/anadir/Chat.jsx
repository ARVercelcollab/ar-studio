// «Escribirlo»: el estudio dice lo que quiere añadir con sus palabras; el panel enseña lo que ha
// entendido («He entendido esto») y solo guarda al pulsar «Guardar». Sin inteligencia artificial:
// lo entiende lib/admin/interprete.js con palabras clave.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Boton, Datos, Icono } from '../ui'
import { interpretar, EJEMPLOS, euros } from '../../../lib/admin/interprete'
import { guardarReserva, guardarGasto, guardarIngreso, guardarCuota, guardarBloqueo } from './guardar'

let contador = 0
const nuevoId = () => `m${++contador}`

function Respuesta({ m, contexto, mes, onElegir, onGuardar, onCorregir }) {
  const r = m.r
  if (r.tipo === 'pregunta') {
    if (!mes) return <p>Ahora no puedo calcular el mes. Míralo en el Inicio.</p>
    return (
      <>
        <p>
          En {mes.texto}, de momento, han entrado <b className="ui-num ui-imp">{euros(mes.ingresosCent)}</b> y han salido{' '}
          <b className="ui-num ui-imp">{euros(mes.gastosCent)}</b> en gastos. Beneficio:{' '}
          <b className={`ui-num ui-imp ${mes.beneficioCent < 0 ? 'ui-mal' : 'ui-bien'}`}>{euros(mes.beneficioCent)}</b>
          {mes.deCada100 != null && mes.ingresosCent > 0 ? ` (de cada 100 € que entran, se quedan ${mes.deCada100} €)` : ''}. Sin IVA, con lo apuntado hasta hoy.
        </p>
        <p className="adm-anadir__mas"><Link href="/admin">Ver el Inicio</Link> · <Link href="/admin/movimientos">Ver los movimientos</Link></p>
      </>
    )
  }
  if (r.tipo === 'nada') {
    return (
      <>
        <p>{r.mensaje}</p>
        <div className="adm-anadir__botones"><Boton variante="secundario" tam="peq" onClick={() => onCorregir(m)}>Abrir el formulario</Boton></div>
      </>
    )
  }
  const guardado = m.estado === 'guardado'
  return (
    <>
      <p className="adm-anadir__entendido">He entendido esto:</p>
      <div className="adm-anadir__caja">
        <Datos filas={r.filas} />
        {r.opciones && !guardado && (
          <div className="adm-anadir__opciones">
            <p>¿Quién es?</p>
            {r.opciones.map((o) => (
              <button key={o.etiqueta} type="button" className="ui-chip" onClick={() => onElegir(m, o.persona)}>{o.etiqueta}</button>
            ))}
          </div>
        )}
        {r.faltan.length > 0 && (
          <p className="adm-anadir__falta"><Icono nombre="aviso" />Falta {r.faltan.join(', ')}.</p>
        )}
        {r.avisos.map((a) => <p key={a} className="adm-anadir__aviso">{a}</p>)}
        {r.revisar && <p className="adm-anadir__aviso">{r.revisar}</p>}
        {m.error && <p className="adm-anadir__error" role="alert">{m.error}</p>}
        {guardado ? (
          <p className="adm-anadir__hecho" role="status">
            <Icono nombre="ok" />Guardado.{m.mensaje ? ` ${m.mensaje}` : ''}{' '}
            {m.enlace && <Link href={m.enlace}>Verlo</Link>}
          </p>
        ) : (
          <div className="adm-anadir__botones">
            {r.listo && !r.revisar && (
              <Boton icono="check" tam="peq" disabled={m.estado === 'guardando'} onClick={() => onGuardar(m)}>{m.estado === 'guardando' ? 'Guardando…' : 'Guardar'}</Boton>
            )}
            <Boton variante={r.listo && !r.revisar ? 'secundario' : 'primario'} tam="peq" onClick={() => onCorregir(m)}>
              {r.listo && !r.revisar ? 'Corregir en el formulario' : 'Seguir en el formulario'}
            </Boton>
          </div>
        )}
      </div>
    </>
  )
}

export default function Chat({ contexto, mes, facturas, onAnadido, onCorregir }) {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const final = useRef(null)
  const entrada = useRef(null)

  useEffect(() => {
    if (mensajes.length) final.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [mensajes])

  const cambiar = (id, cambios) => setMensajes((l) => l.map((x) => (x.id === id ? { ...x, ...cambios } : x)))

  function enviar(frase) {
    const t = String(frase ?? texto).trim()
    if (!t) return
    const r = interpretar(t, contexto)
    setMensajes((l) => [...l, { id: nuevoId(), de: 'yo', texto: t }, { id: nuevoId(), de: 'panel', frase: t, r, estado: 'pendiente' }])
    setTexto('')
    entrada.current?.focus()
  }

  const elegir = (m, persona) => cambiar(m.id, { r: interpretar(m.frase, contexto, persona), persona, error: null })

  async function guardar(m) {
    cambiar(m.id, { estado: 'guardando', error: null })
    const c = m.r.campos
    try {
      let hecho
      if (m.r.tipo === 'reserva') hecho = await guardarReserva(c)
      else if (m.r.tipo === 'gasto') hecho = await guardarGasto(c, contexto.categorias.find((x) => x.id === c.categoriaId))
      else if (m.r.tipo === 'ingreso') hecho = await guardarIngreso(c)
      else if (m.r.tipo === 'cuota') hecho = await guardarCuota(c, { nombre: contexto.miembros.find((x) => x.id === c.susId)?.nombre || '', facturas })
      else if (m.r.tipo === 'bloqueo') hecho = await guardarBloqueo(c)
      cambiar(m.id, { estado: 'guardado', enlace: hecho.enlace, mensaje: hecho.mensaje || null })
      onAnadido(hecho)
    } catch (e) {
      cambiar(m.id, { estado: 'pendiente', error: e.message })
    }
  }

  return (
    <section className="ui-tarjeta adm-anadir__chat" aria-label="Escribirlo">
      <div className="adm-anadir__mensajes" aria-live="polite">
        <div className="adm-anadir__burbuja adm-anadir__burbuja--panel">
          <p><b>Dime qué quieres añadir</b>, como se lo dirías a una persona: una reserva, un gasto, el cobro de una cuota o unas horas bloqueadas. Te enseño lo que he entendido y, si está bien, lo guardas.</p>
        </div>
        {mensajes.map((m) => (m.de === 'yo' ? (
          <div key={m.id} className="adm-anadir__burbuja adm-anadir__burbuja--yo"><p>{m.texto}</p></div>
        ) : (
          <div key={m.id} className="adm-anadir__burbuja adm-anadir__burbuja--panel">
            <Respuesta m={m} contexto={contexto} mes={mes} onElegir={elegir} onGuardar={guardar} onCorregir={(x) => onCorregir(x.r, x.frase)} />
          </div>
        )))}
        <div ref={final} />
      </div>
      <div className="adm-anadir__ejemplos">
        <span>Prueba con:</span>
        {EJEMPLOS.slice(0, 4).map((e) => (
          <button key={e.frase} type="button" className="ui-chip" onClick={() => enviar(e.frase)}>{e.frase}</button>
        ))}
      </div>
      <form className="adm-anadir__escribir" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <label htmlFor="anadir-texto" className="ui-solo-lector">Escribe lo que quieres añadir</label>
        <input id="anadir-texto" ref={entrada} className="ui-control" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe aquí" autoComplete="off" />
        <button type="submit" className="adm-anadir__enviar" aria-label="Enviar" disabled={!texto.trim()}><Icono nombre="sube" /></button>
      </form>
    </section>
  )
}
