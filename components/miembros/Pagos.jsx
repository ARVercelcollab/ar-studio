// Pagos y facturas: las cuotas de cada mes (con su factura) y las horas aparte pagadas.
// Cuota: { id, periodo, desde, hasta, texto, importeCent, estado, chip?, estadoTexto?, factura: { id, numero } | null, enlacePago? }
// Factura de horas aparte: { id, numero, fecha, importeCent, concepto }
import { euros, estadoCuota, fechaCorta } from './formato'

const urlFactura = (f) => f.url || `/api/miembros/factura/${encodeURIComponent(f.id)}`

function Factura({ f }) {
  if (!f) return null
  return (
    <a className="mbr-enlace mbr-pago__factura" href={urlFactura(f)} target="_blank" rel="noopener noreferrer">
      Factura{f.numero ? ` ${f.numero}` : ''} <span className="mbr-sr">(PDF)</span>
    </a>
  )
}

export default function Pagos({ cuotas = [], facturasExtra = [] }) {
  const extras = facturasExtra || []
  return (
    <section className="mbr-tarjeta" aria-labelledby="mbr-pagos">
      <h2 id="mbr-pagos" className="mbr-tarjeta__titulo">Pagos y facturas</h2>
      {cuotas.length === 0 && extras.length === 0 ? (
        <p className="mbr-vacio">Aún no hay pagos.</p>
      ) : (
        <ul className="mbr-pagos">
          {cuotas.map((c) => {
            const e = estadoCuota(c)
            return (
              <li key={c.id ?? `${c.periodo}-${c.desde}`} className="mbr-pago">
                <div>
                  <p className="mbr-pago__que">Cuota · {c.texto || c.periodoTexto || `${fechaCorta(c.desde)} – ${fechaCorta(c.ultimoDia || c.hasta)}`}</p>
                  <p className="mbr-pago__det">
                    <span className={`mbr-etiqueta mbr-etiqueta--${e.tono}`}>{e.texto}</span>
                    <Factura f={c.factura} />
                    {c.enlacePago && <a className="mbr-boton mbr-boton--peq" href={c.enlacePago}>Pagar</a>}
                  </p>
                </div>
                <strong className="mbr-pago__importe">{c.importeTexto || euros(c.importeCent)}</strong>
              </li>
            )
          })}
          {extras.map((f) => (
            <li key={`f${f.id}`} className="mbr-pago">
              <div>
                <p className="mbr-pago__que">{f.concepto || 'Horas aparte'}{f.fechaTexto ? ` · ${f.fechaTexto}` : f.fecha ? ` · ${fechaCorta(f.fecha)}` : ''}</p>
                <p className="mbr-pago__det">
                  <span className="mbr-etiqueta mbr-etiqueta--bien">Pagada</span>
                  <Factura f={f} />
                </p>
              </div>
              <strong className="mbr-pago__importe">{f.importeTexto || euros(f.importeCent)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
