// Pantalla «Añadir» (la parte que se ve). Los datos los prepara pages/admin/anadir.jsx.
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import Panel from '../Panel'
import { Conmutador, Icono } from '../ui'
import { FormularioGasto, FormularioIngreso } from '../Finanzas'
import Chat from './Chat'
import FormReserva from './FormReserva'
import { FormCuota, FormBloqueo } from './FormCuota'
import { useAnadidos, aTexto } from './guardar'
import { EJEMPLOS } from '../../../lib/admin/interprete'

const PESTANAS = [
  { valor: 'reserva', texto: 'Reserva', icono: 'cal' },
  { valor: 'gasto', texto: 'Gasto', icono: 'euro' },
  { valor: 'ingreso', texto: 'Otro ingreso', icono: 'movs' },
  { valor: 'cuota', texto: 'Cobro de cuota', icono: 'tarjeta' },
  { valor: 'bloqueo', texto: 'Bloqueo', icono: 'candado' },
]
export const TIPOS = PESTANAS.map((p) => p.valor)

const cuando = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
}

export default function PantallaAnadir({ hoy, miembros, datosGasto, reservasIngreso, cuotas, clientes, festivos, mes, facturas, entrada }) {
  const router = useRouter()
  const [vista, setVista] = useState(entrada.tipo ? 'formulario' : 'escribirlo')
  // El formulario abierto y con qué viene relleno (de la dirección o de «Corregir en el formulario»)
  const [form, setForm] = useState({ pestana: entrada.tipo || 'reserva', inicial: entrada.inicial, vez: 0 })
  const [anadidos, anadir] = useAnadidos()

  // Al volver de guardar un gasto (?ok=gasto:ID), sale en «Añadido desde el panel»
  useEffect(() => {
    if (!entrada.ok) return
    const [que, id] = entrada.ok.split(':')
    if (que === 'gasto' && id) anadir({ texto: 'Gasto apuntado', enlace: `/admin/movimientos/gastos/${id}` })
    router.replace({ pathname: '/admin/anadir', query: { tipo: 'gasto' } }, undefined, { shallow: true, scroll: false })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const contexto = useMemo(() => ({
    hoy,
    categorias: datosGasto.categorias,
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.nombre })),
    clientes,
    cuotas,
    festivos,
  }), [hoy, datosGasto, miembros, clientes, cuotas, festivos])

  const abrirFormulario = (pestana, inicial = {}) => {
    setForm((f) => ({ pestana, inicial, vez: f.vez + 1 }))
    setVista('formulario')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // «Corregir en el formulario»: abre la pestaña de lo entendido con sus datos puestos
  function corregir(r) {
    if (!r || r.tipo === 'nada' || r.tipo === 'pregunta') return abrirFormulario(form.pestana, {})
    abrirFormulario(r.tipo, r.campos)
  }

  return (
    <Panel
      titulo="Añadir"
      sub="Dilo con tus palabras o rellena el formulario."
      clase="adm-anadir"
      acciones={(
        <Conmutador etiqueta="Cómo añadir" valor={vista} onCambio={setVista} opciones={[{ valor: 'escribirlo', texto: 'Escribirlo' }, { valor: 'formulario', texto: 'Formulario' }]} />
      )}
    >
      <div className="adm-anadir__rejilla">
        <div className="adm-anadir__principal">
          {vista === 'escribirlo' ? (
            <Chat contexto={contexto} mes={mes} facturas={facturas} onAnadido={anadir} onCorregir={corregir} />
          ) : (
            <section className="ui-tarjeta adm-anadir__form" aria-label="Formulario">
              <div className="adm-anadir__pestanas">
                <Conmutador etiqueta="Qué quieres añadir" valor={form.pestana} onCambio={(p) => setForm((f) => ({ pestana: p, inicial: {}, vez: f.vez + 1 }))} opciones={PESTANAS} />
              </div>
              <Formulario
                key={`${form.pestana}-${form.vez}`}
                pestana={form.pestana}
                inicial={form.inicial || {}}
                hoy={hoy}
                miembros={miembros}
                datosGasto={datosGasto}
                reservasIngreso={reservasIngreso}
                cuotas={cuotas}
                facturas={facturas}
                onAnadido={anadir}
              />
            </section>
          )}
        </div>

        <aside className="adm-anadir__lado">
          <section className="ui-tarjeta">
            <div className="ui-tarjeta__cab"><div><h2>Cómo decírselo</h2></div></div>
            <ul className="adm-anadir__como">
              {EJEMPLOS.map((e) => (
                <li key={e.frase}><span>{e.que}</span>«{e.frase}»</li>
              ))}
            </ul>
          </section>
          <section className="ui-tarjeta">
            <div className="ui-tarjeta__cab"><div><h2>Añadido desde el panel</h2></div></div>
            {anadidos.length === 0 ? (
              <p className="ui-t3 adm-anadir__nada">Todavía no has añadido nada desde aquí.</p>
            ) : (
              <ul className="adm-anadir__hechos">
                {anadidos.map((a) => (
                  <li key={`${a.cuando}-${a.texto}`}>
                    <Icono nombre="ok" />
                    <span>{a.enlace ? <a href={a.enlace}>{a.texto}</a> : a.texto}<small>{cuando(a.cuando)}</small></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="adm-anadir__nota">
            <Icono nombre="info" />
            <p><b>Cómo funciona.</b> «Escribirlo» lo entiende un programa sencillo de palabras clave, sin inteligencia artificial. Siempre te enseña lo que ha entendido antes de guardar; si algo no cuadra, ábrelo en el formulario.</p>
          </div>
        </aside>
      </div>
    </Panel>
  )
}

function Formulario({ pestana, inicial, hoy, miembros, datosGasto, reservasIngreso, cuotas, facturas, onAnadido }) {
  if (pestana === 'reserva') return <FormReserva miembros={miembros} hoy={hoy} inicial={inicial} onAnadido={onAnadido} />
  if (pestana === 'gasto') return <div className="adm-anadir__legado"><FormularioGasto datos={datosGasto} hoy={hoy} volver="/admin/anadir?tipo=gasto" inicial={inicialGasto(inicial, datosGasto, hoy)} categoriaInicial={inicial.categoriaId || null} /></div>
  if (pestana === 'ingreso') return <div className="adm-anadir__legado"><FormularioIngreso hoy={hoy} reservas={reservasIngreso} inicial={inicialIngreso(inicial, hoy)} /></div>
  if (pestana === 'cuota') return <FormCuota cuotas={cuotas} hoy={hoy} facturas={facturas} inicial={inicial} onAnadido={onAnadido} />
  return <FormBloqueo inicial={inicial} onAnadido={onAnadido} />
}

// Lo entendido en «Escribirlo», con la forma que espera el formulario de gasto
function inicialGasto(c, datos, hoy) {
  if (!c || c.importeCent == null) return null
  const cat = datos.categorias.find((x) => x.id === c.categoriaId)
  if (!cat) return null
  return {
    categoriaId: cat.id, importeEs: 'pagado', importe: aTexto(c.importeCent), fecha: c.fecha && c.fecha <= hoy ? c.fecha : hoy,
    concepto: c.concepto || '', proveedor: '', numFactura: '', tipoFactura: cat.tipoFactura, ivaPct: cat.ivaPct ?? 21, iva: '',
    retencionPct: cat.retencionPct ?? 0, metodoPago: c.metodoPago || '', enlace: '', nota: '',
  }
}

function inicialIngreso(c, hoy) {
  if (!c || c.importeCent == null) return null
  return {
    tipo: c.tipo || 'otro', sentido: 'cobro', fecha: c.fecha && c.fecha <= hoy ? c.fecha : hoy, concepto: c.concepto || '', importe: aTexto(c.importeCent),
    ivaPct: 21, iva: '', reservaId: '', facturaRef: '', clienteNombre: '', clienteNif: '', metodoPago: c.metodoPago || '', enlace: '', nota: '',
  }
}

