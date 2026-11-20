// «Pendiente ahora» del Inicio: cuatro tarjetas (Hoy en el estudio, Por cobrar, Miembros por
// resolver, IVA a apartar). Cada fila lleva a su ficha y, si hay teléfono, botones de llamar y WhatsApp.
import Link from 'next/link'
import { Icono, Contacto, EnlaceFlecha } from '../ui'
import { useEuros } from '../graficas'

const MAX = 3
const may = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const vezTexto = (n) => (n === 1 ? 'primera vez' : `${n}.ª vez`)

function TarjetaPend({ icono, titulo, cifra, resumen, aviso = false, pie, children }) {
  return (
    <article className={`ini-pend${aviso ? ' ini-pend--aviso' : ''}`}>
      <header className="ini-pend__cab">
        <span className="ini-pend__icono"><Icono nombre={icono} /></span>
        <h3 className="ini-pend__titulo">{titulo}</h3>
        <p className="ini-pend__cifra">{cifra}</p>
      </header>
      <p className="ini-pend__resumen">{resumen}</p>
      <div className="ini-pend__cuerpo">{children}</div>
      {pie && <footer className="ini-pend__pie">{pie}</footer>}
    </article>
  )
}

function Fila({ href, nombre, detalle, aparte, tonoDetalle, children }) {
  return (
    <li className="ini-pend__fila">
      <Link href={href} className="ini-pend__quien">
        <span className="ini-pend__nombre">{nombre}</span>
        {detalle && <span className={`ini-pend__detalle${tonoDetalle ? ` ini-pend__detalle--${tonoDetalle}` : ''}`}>{detalle}</span>}
        {aparte}
      </Link>
      {children}
    </li>
  )
}

const Vacio = ({ children }) => <p className="ini-pend__vacio"><Icono nombre="ok" />{children}</p>

function Hoy({ hoy, textoHoy }) {
  const lista = hoy.reservas
  return (
    <TarjetaPend
      icono="cal" titulo="Hoy en el estudio" cifra={String(hoy.n)} resumen={may(textoHoy)}
      pie={<EnlaceFlecha href="/admin/reservas">Ver las reservas</EnlaceFlecha>}
    >
      {lista.length === 0 ? (
        <Vacio>Hoy no hay nadie en el estudio.</Vacio>
      ) : (
        <ul className="ini-pend__lista">
          {lista.map((r) => {
            const que = r.esPlan ? 'sesión del plan' : (r.actividad || '').toLowerCase()
            return (
              <Fila
                key={r.id} href={`/admin/reserva/${r.id}`}
                nombre={<><span className="ini-pend__hora">{r.horaInicio}</span>{r.nombreCorto}</>}
                detalle={(
                  <>
                    {r.duracionTexto}
                    {que && ` · ${que}`}
                    {r.vez && <> · <span className={r.vez === 1 ? 'ini-vez ini-vez--nueva' : 'ini-vez'}>{vezTexto(r.vez)}</span></>}
                    {r.hecha && ' · hecha'}
                  </>
                )}
              >
                <Contacto telefono={r.telefono} nombre={r.nombre} />
              </Fila>
            )
          })}
        </ul>
      )}
      {hoy.n > lista.length && <p className="ini-pend__mas"><Link href="/admin/reservas">y {hoy.n - lista.length} más</Link></p>}
    </TarjetaPend>
  )
}

function PorCobrar({ porCobrar }) {
  const e = useEuros()
  const items = porCobrar.items
  return (
    <TarjetaPend
      icono="euro" titulo="Por cobrar" cifra={e(porCobrar.totalCent)} aviso={items.length > 0}
      resumen={items.length ? `${plural(items.length, 'cobro', 'cobros')} sin hacer` : 'Cuotas y reservas sin pagar'}
      pie={items.length > MAX ? <EnlaceFlecha href="/admin/miembros">Ver todos</EnlaceFlecha> : null}
    >
      {items.length === 0 ? (
        <Vacio>Nadie debe nada.</Vacio>
      ) : (
        <ul className="ini-pend__lista">
          {items.slice(0, MAX).map((x) => (
            <Fila
              key={x.clave} href={x.enlace} nombre={x.titulo} detalle={x.detalle}
              aparte={x.impago ? <span className="ini-pend__impago">No puede usar el estudio</span> : null}
            >
              <strong className="ini-pend__importe">{e(x.importeCent)}</strong>
            </Fila>
          ))}
        </ul>
      )}
    </TarjetaPend>
  )
}

function PorResolver({ porResolver }) {
  const items = porResolver.items
  return (
    <TarjetaPend
      icono="gente" titulo="Miembros por resolver" cifra={String(items.length)}
      resumen={items.length ? 'Contratos y fianzas pendientes' : 'Contratos y fianzas'}
      pie={<EnlaceFlecha href="/admin/miembros">Ver miembros</EnlaceFlecha>}
    >
      {items.length === 0 ? (
        <Vacio>Todos al día: contratos firmados y fianzas recibidas.</Vacio>
      ) : (
        <ul className="ini-pend__lista">
          {items.slice(0, MAX).map((x) => (
            <Fila key={x.clave} href={x.enlace} nombre={x.titulo} detalle={x.detalle} tonoDetalle={x.urgente ? 'mal' : null}>
              <Contacto telefono={x.telefono} nombre={x.titulo} />
            </Fila>
          ))}
        </ul>
      )}
      {items.length > MAX && <p className="ini-pend__mas"><Link href="/admin/miembros">y {items.length - MAX} más</Link></p>}
    </TarjetaPend>
  )
}

function Iva({ iva }) {
  const e = useEuros()
  if (!iva) return null
  const n = iva.trimestre.split('-T')[1]
  return (
    <TarjetaPend
      icono="pct" titulo="IVA a apartar" cifra={e(Math.max(0, iva.netoCent))}
      resumen={`${n}.º trimestre de ${iva.trimestre.slice(0, 4)} · estimación`}
      pie={<EnlaceFlecha href="/admin/impuestos">Ver impuestos</EnlaceFlecha>}
    >
      <dl className="ini-pend__cuenta">
        <div><dt>IVA que habéis cobrado</dt><dd>{e(iva.cobradoCent)}</dd></div>
        <div><dt>IVA que habéis pagado</dt><dd>{e(-iva.pagadoCent)}</dd></div>
      </dl>
      <p className="ini-pend__nota">
        {iva.netoCent < 0 ? 'Este trimestre sale a compensar: no hay que apartar nada.' : 'Ese dinero no es vuestro: guardadlo para Hacienda.'}
      </p>
    </TarjetaPend>
  )
}

export default function PendienteAhora({ d, textoHoy }) {
  return (
    <div className="ui-rejilla ui-rejilla--4 ini-pendiente">
      <Hoy hoy={d.hoyBloque} textoHoy={textoHoy} />
      <PorCobrar porCobrar={d.porCobrar} />
      <PorResolver porResolver={d.porResolver} />
      <Iva iva={d.ivaHoy} />
    </div>
  )
}
