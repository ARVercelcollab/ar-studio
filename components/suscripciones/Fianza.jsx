// Recuadro muy visible con los datos para transferir la fianza
import { useState } from 'react'
import { formatoEuros, FIANZA_PLAZO_DIAS } from '../../lib/reservas/config'
import { textoFechaCorta } from '../../lib/reservas/tiempo'

// limite: último día para hacerla ('AAAA-MM-DD'); sin él, se dice el plazo desde la firma
export default function FianzaTransferencia({ importeCent, iban, titular, codigo, limite = null }) {
  const [copiado, setCopiado] = useState(null)
  const copiar = async (que, valor) => {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(que)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setCopiado(null)
    }
  }
  const concepto = `Fianza ${codigo}`
  return (
    <div className="rsv-fianza">
      <h2>Haz ahora la transferencia de la fianza de {formatoEuros(importeCent)}</h2>
      <p>
        {limite ? <>Tienes hasta el <strong>{textoFechaCorta(limite)}</strong> ({FIANZA_PLAZO_DIAS} días desde la firma del contrato). </> : <>Tienes {FIANZA_PLAZO_DIAS} días desde que firmes el contrato. </>}
        Es el depósito de garantía que pide el contrato. No lleva IVA y se devuelve al terminar la suscripción si el estudio y el equipo quedan bien.
      </p>
      {iban ? (
        <dl>
          <dt>IBAN</dt>
          <dd>
            <strong className="rsv-fianza__iban">{iban}</strong>
            <button type="button" className="rsv-fianza__copiar" onClick={() => copiar('iban', iban.replace(/\s/g, ''))}>{copiado === 'iban' ? 'Copiado' : 'Copiar IBAN'}</button>
          </dd>
          {titular && <><dt>Titular</dt><dd>{titular}</dd></>}
          <dt>Importe</dt>
          <dd>{formatoEuros(importeCent)}</dd>
          <dt>Concepto</dt>
          <dd>
            <strong>{concepto}</strong>
            <button type="button" className="rsv-fianza__copiar" onClick={() => copiar('concepto', concepto)}>{copiado === 'concepto' ? 'Copiado' : 'Copiar'}</button>
          </dd>
        </dl>
      ) : (
        <p>Escríbenos por WhatsApp o contesta al correo de bienvenida y te pasamos el número de cuenta. Pon como concepto <strong>{concepto}</strong>.</p>
      )}
    </div>
  )
}
