// Avisos de arriba del área: cuota sin pagar, contrato por firmar, fianza por transferir,
// cobro rechazado, tarjeta que caduca… Cada aviso: { tipo, texto, enlace?, … }.
import { useState } from 'react'
import Link from 'next/link'
import { euros, fechaCorta } from './formato'

function Copiar({ valor, etiqueta = 'Copiar' }) {
  const [hecho, setHecho] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor)
      setHecho(true)
      setTimeout(() => setHecho(false), 2000)
    } catch {
      setHecho(false)
    }
  }
  return (
    <button type="button" className="mbr-copiar" onClick={copiar} aria-live="polite">
      {hecho ? 'Copiado' : etiqueta}
    </button>
  )
}

// Datos para transferir la fianza
function Fianza({ aviso }) {
  const importe = aviso.importeCent ?? aviso.fianzaCent
  const concepto = aviso.concepto || (aviso.codigo ? `Fianza ${aviso.codigo}` : 'Fianza')
  return (
    <section className="mbr-aviso mbr-aviso--fianza" aria-labelledby="mbr-fianza-titulo">
      <h2 id="mbr-fianza-titulo">{aviso.titulo || `Falta la fianza${importe ? ` de ${euros(importe)}` : ''}`}</h2>
      <p>
        {aviso.texto || 'Es el depósito de garantía del contrato. Se hace por transferencia y se devuelve al terminar si el estudio y el equipo quedan bien.'}
        {aviso.limite && <> Tienes hasta el <strong>{fechaCorta(aviso.limite)}</strong>.</>}
      </p>
      {aviso.iban ? (
        <dl className="mbr-fianza">
          <div>
            <dt>IBAN</dt>
            <dd><strong className="mbr-fianza__iban">{aviso.iban}</strong><Copiar valor={String(aviso.iban).replace(/\s/g, '')} etiqueta="Copiar IBAN" /></dd>
          </div>
          {aviso.titular && <div><dt>Titular</dt><dd>{aviso.titular}</dd></div>}
          {(aviso.importeTexto || importe != null) && <div><dt>Importe</dt><dd>{aviso.importeTexto || euros(importe)}</dd></div>}
          <div>
            <dt>Concepto</dt>
            <dd><strong>{concepto}</strong><Copiar valor={concepto} /></dd>
          </div>
        </dl>
      ) : aviso.texto ? null : (
        <p>Escríbenos y te pasamos el número de cuenta. Pon como concepto <strong>{concepto}</strong>.</p>
      )}
    </section>
  )
}

const TONOS = { impago: 'mal', cobro: 'mal', cobro_fallido: 'mal', contrato: 'aviso', tarjeta: 'info', fianza: 'aviso' }
const BOTONES = { impago: 'Pagar la cuota', cobro: 'Pagar la cuota', cobro_fallido: 'Pagar la cuota', contrato: 'Firmar el contrato', tarjeta: 'Ver' }

function Enlace({ href, children, principal }) {
  const cl = principal ? 'mbr-boton mbr-boton--peq' : 'mbr-enlace'
  if (/^https?:/.test(href)) return <a className={cl} href={href}>{children}</a>
  return <Link className={cl} href={href}>{children}</Link>
}

export default function Avisos({ avisos = [] }) {
  if (!avisos.length) return null
  return (
    <div className="mbr-avisos">
      {avisos.map((a, i) => {
        if (a.tipo === 'fianza') return <Fianza key={`fianza${i}`} aviso={a} />
        const tono = a.tono || TONOS[a.tipo] || 'aviso'
        return (
          <div key={`${a.tipo}${i}`} className={`mbr-aviso mbr-aviso--${tono}`} role={tono === 'mal' ? 'alert' : 'status'}>
            <div>
              {a.titulo && <p className="mbr-aviso__titulo">{a.titulo}</p>}
              <p>{a.texto}</p>
            </div>
            {a.enlace && <Enlace href={a.enlace} principal={tono === 'mal' || a.tipo === 'contrato'}>{a.boton || BOTONES[a.tipo] || 'Ver'}</Enlace>}
          </div>
        )
      })}
    </div>
  )
}
