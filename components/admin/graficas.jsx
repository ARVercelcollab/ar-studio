// Gráficas e iconos del Inicio del panel, sin librerías y sin medir nada en JavaScript:
// las barras van en porcentajes y variables CSS, así se ven bien desde el primer pintado.

import Link from 'next/link'
import { createContext, useContext, useState } from 'react'
import { euros, escalaBonita, textoMes } from '../../lib/finanzas/calculos'

// ---------- Importes (con «Ocultar importes») ----------

export const ImportesOcultos = createContext(false)

// Céntimos redondeados a euros enteros (en céntimos). Un beneficio que se enseña se calcula
// con los dos importes ya redondeados, así cuadra con lo que se lee: 123 € − 46 € = 77 €
export const aEuros = (cent) => (cent === null || cent === undefined ? cent : Math.round(cent / 100) * 100)

// En el Inicio, euros sin céntimos (las cifras con céntimos están en Finanzas).
// signo: «+344 €» en los positivos
export function useEuros() {
  const oculto = useContext(ImportesOcultos)
  return (cent, { signo = false } = {}) => {
    if (cent === null || cent === undefined) return euros(cent)
    if (oculto) return '••• €'
    const redondo = aEuros(cent)
    return `${signo && redondo > 0 ? '+' : ''}${euros(redondo)}`
  }
}

// Eje: «2.000 €», «12 mil €». El tope decide el formato, igual para las tres marcas
function eurosEje(cent, topeCent) {
  const e = Math.round(cent / 100)
  if (e === 0 || Math.round(topeCent / 100) < 10000) return euros(e * 100)
  return `${String(Math.round(e / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} mil €`
}

const may = (t) => t.charAt(0).toUpperCase() + t.slice(1)

// ---------- Iconos (trazos de 24 × 24) ----------

const ICONOS = {
  sube: <path d="M12 19V5M6 11l6-6 6 6" />,
  baja: <path d="M12 5v14M6 13l6 6 6-6" />,
  flecha: <path d="M9 6l6 6-6 6" />,
  error: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></>,
  aviso: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  persona: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  ojo: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  ojoNo: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
}

export function Icono({ nombre }) {
  return <svg className="adm-inicio__ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONOS[nombre]}</svg>
}

// ---------- Barra horizontal ----------

// partes: [[porcentaje, tipo], …] una detrás de otra. Los lectores de pantalla se la saltan:
// el texto de al lado ya dice lo mismo.
export function Medidor({ partes }) {
  return (
    <div className="adm-inicio__medidor" aria-hidden="true">
      {partes.map(([pct, tipo]) => (
        <i key={tipo} className={`es-${tipo}${pct > 0 ? '' : ' es-cero'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      ))}
    </div>
  )
}

// ---------- Ingresos y gastos por mes ----------

export const EN_MOVIL = 6 // en el móvil, solo los últimos 6 meses
const MARCAS = [1, 0.5, 0] // líneas del eje: el tope, la mitad y el cero

// meses: los del gráfico que ya tienen cuentas (ni los de antes del panel ni los que no han llegado)
// mesPeriodo: el mes elegido arriba, si se mira un mes; hrefMes(mes): enlace para ir a ese mes
export function GraficoMeses({ meses, mesPeriodo, hrefMes, hoy }) {
  const e = useEuros()
  const oculto = useContext(ImportesOcultos)
  const [fijado, setFijado] = useState(meses.some((m) => m.mes === mesPeriodo) ? mesPeriodo : meses.at(-1).mes)
  const [encima, setEncima] = useState(null) // el mes bajo el ratón o con el foco (manda mientras dura)
  const visto = meses.find((m) => m.mes === (encima || fijado))
  // Escala propia para el móvil (sus 6 meses) y para el resto; el CSS elige una u otra
  const tope = (ms) => escalaBonita(Math.max(0, ...ms.flatMap((m) => [m.facturacionCent, m.gastosCent]))).topeCent
  const topes = { ancho: tope(meses), movil: tope(meses.slice(-EN_MOVIL)) }
  const nombre = (m) => may(m.mes.slice(0, 4) === hoy.slice(0, 4) ? textoMes(m.mes, { soloNombre: true }) : m.texto)
  const enCurso = (m) => m.estado === 'en_curso'
  const beneficio = (m) => aEuros(m.facturacionCent) - aEuros(m.gastosCent)
  const b = beneficio(visto)
  return (
    <>
      {/* Sin aria-live: cada mes ya lleva sus cifras en la etiqueta y están en la tabla de abajo */}
      <div className="adm-inicio__lectura">
        <p className="adm-inicio__lectura-mes">
          <span>{nombre(visto)}{enCurso(visto) && ' · en curso'}</span>
          {visto.mes !== mesPeriodo && <Link href={hrefMes(visto.mes)} scroll={false} className="adm-inicio__enlace">Ver ese mes<Icono nombre="flecha" /></Link>}
        </p>
        <div><span className="adm-inicio__etq"><i className="adm-inicio__muestra es-ing" />Ingresos</span><strong>{e(visto.facturacionCent)}</strong></div>
        <div><span className="adm-inicio__etq"><i className="adm-inicio__muestra es-gas" />Gastos</span><strong>{e(visto.gastosCent)}</strong></div>
        <div><span className="adm-inicio__etq">Beneficio</span><strong className={oculto ? '' : b < 0 ? 'es-neg' : b > 0 ? 'es-pos' : ''}>{e(b, { signo: true })}</strong></div>
        {visto.faltaCalendly && (
          <p className="adm-inicio__lectura-aviso"><Icono nombre="aviso" />Falta apuntar Calendly · <Link href={`/admin/finanzas/calendly?mes=${visto.mes}`}>Apuntarlo</Link></p>
        )}
      </div>

      <div className="adm-inicio__grafica" style={{ '--tope-ancho': topes.ancho, '--tope-movil': topes.movil }}>
        <div className="adm-inicio__eje" aria-hidden="true">
          {MARCAS.map((f) => (
            <span key={f} style={{ '--f': f }}>
              {!oculto && <><b className="es-ancho">{eurosEje(topes.ancho * f, topes.ancho)}</b><b className="es-movil">{eurosEje(topes.movil * f, topes.movil)}</b></>}
            </span>
          ))}
        </div>
        <div className="adm-inicio__lienzo" role="group" aria-label="Meses" onPointerLeave={(ev) => { if (ev.pointerType === 'mouse') setEncima(null) }}>
          {MARCAS.map((f) => <i key={f} className={`adm-inicio__rej${f ? '' : ' es-base'}`} style={{ '--f': f }} />)}
          {meses.map((m, i) => (
            <button
              key={m.mes}
              type="button"
              className={`adm-inicio__mes${enCurso(m) ? ' es-curso' : ''}${m.mes === visto.mes ? ' is-sel' : ''}${i < meses.length - EN_MOVIL ? ' es-antiguo' : ''}`}
              aria-pressed={m.mes === fijado}
              aria-label={`${may(m.texto)}${enCurso(m) ? ', en curso' : ''}: ingresos ${e(m.facturacionCent)}, gastos ${e(m.gastosCent)}`}
              onPointerEnter={(ev) => { if (ev.pointerType === 'mouse') setEncima(m.mes) }}
              // Con el teclado, el foco solo enseña el mes; Intro o espacio lo eligen
              onFocus={() => setEncima(m.mes)}
              onBlur={() => setEncima(null)}
              onClick={() => setFijado(m.mes)}
            >
              <span className="adm-inicio__barras">
                <i className={`es-ing${m.facturacionCent > 0 ? '' : ' es-cero'}`} style={{ '--v': Math.max(0, m.facturacionCent) }} />
                <i className={`es-gas${m.gastosCent > 0 ? '' : ' es-cero'}`} style={{ '--v': Math.max(0, m.gastosCent) }} />
              </span>
              <span className="adm-inicio__mes-etq">{m.corto}{enCurso(m) && <small>en curso</small>}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Las mismas cifras en una tabla, para lectores de pantalla */}
      <div className="adm-solo-lector">
        <table>
          <caption>Ingresos y gastos por mes, sin IVA</caption>
          <thead><tr><th scope="col">Mes</th><th scope="col">Ingresos</th><th scope="col">Gastos</th><th scope="col">Beneficio</th></tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes}>
                <th scope="row">{may(m.texto)}{enCurso(m) && ' (en curso)'}</th>
                <td>{e(m.facturacionCent)}</td>
                <td>{e(m.gastosCent)}</td>
                <td>{e(beneficio(m), { signo: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
