// Selector de periodo (mes, trimestre o año) que comparten el Inicio y Finanzas.
// Va en la URL (?p=2026-11 | 2026-T4 | 2026), así cada vista se puede enlazar.
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Segmento } from './Panel'
import { cambiarTipoPeriodo, leerPeriodo } from '../../lib/finanzas/calculos'

const NAV = {
  mes: ['Mes anterior', 'Mes siguiente'],
  trimestre: ['Trimestre anterior', 'Trimestre siguiente'],
  anio: ['Año anterior', 'Año siguiente'],
}

const TIPOS = [['mes', 'Mes'], ['trimestre', 'Trimestre'], ['anio', 'Año']]

// tipos: los botones que se ofrecen (el Inicio solo enseña Mes y Año)
export default function SelectorPeriodo({ periodo, hoy, ruta, extra = {}, tipos = ['mes', 'trimestre', 'anio'] }) {
  const router = useRouter()
  const href = (p) => ({ pathname: ruta, query: { ...extra, ...(p ? { p } : {}) } })
  const ir = (p) => router.push(href(p), undefined, { scroll: false })
  const actual = leerPeriodo(periodo.clave, hoy)
  const [antes, despues] = NAV[periodo.tipo]
  return (
    <div className="adm-periodo">
      <Segmento
        opciones={TIPOS.filter(([t]) => tipos.includes(t))}
        valor={periodo.tipo}
        onCambio={(t) => ir(cambiarTipoPeriodo(actual, t, hoy))}
      />
      <div className="adm-periodo__nav">
        {periodo.anterior
          ? <Link href={href(periodo.anterior)} scroll={false} className="adm-periodo__flecha" aria-label={antes}>‹</Link>
          : <span className="adm-periodo__flecha is-off" aria-hidden="true">‹</span>}
        <strong>{periodo.texto.charAt(0).toUpperCase() + periodo.texto.slice(1)}</strong>
        {periodo.siguiente
          ? <Link href={href(periodo.siguiente)} scroll={false} className="adm-periodo__flecha" aria-label={despues}>›</Link>
          : <span className="adm-periodo__flecha is-off" aria-hidden="true">›</span>}
        {periodo.contieneHoy ? <span className="adm-chip adm-chip--gris">en curso</span> : <Link href={href(null)} scroll={false} className="adm-enlace">Ir a hoy</Link>}
      </div>
    </div>
  )
}
