// Miembros · tablero: una columna por estado (contrato por firmar → fianza → al día → cuota sin
// pagar → baja). El estado sale de los datos, así que no se arrastra: cada tarjeta abre la ficha.
import Link from 'next/link'
import { COLUMNAS, columnaDe, detalleTablero, alMes } from './estado'
import { textoDuracion } from '../../../lib/reservas/config'

const h = (x) => textoDuracion(x, { corto: true }).replace(/ h$/, '')

export default function TableroMiembros({ filas, hoy }) {
  const porColumna = Object.fromEntries(COLUMNAS.map(([c]) => [c, []]))
  for (const f of filas) porColumna[columnaDe(f)].push(f)
  // La de bajas solo sale si hay alguien dándose de baja
  const columnas = COLUMNAS.filter(([c]) => c !== 'baja' || porColumna.baja.length)
  return (
    <>
      <p className="mb-tablero__nota">Cada miembro está en la columna que le toca según sus datos. Toca una tarjeta para abrir su ficha.</p>
      <div className="mb-tablero" style={{ '--columnas': columnas.length }}>
        {columnas.map(([c, titulo]) => (
          <section key={c} className={`mb-columna mb-columna--${c}`} aria-label={titulo}>
            <h2 className="mb-columna__titulo">{titulo}<span className={`mb-columna__n${porColumna[c].length ? ' es-alguno' : ''}`}>{porColumna[c].length}</span></h2>
            {porColumna[c].length === 0 && <p className="mb-columna__vacia">Nadie</p>}
            {porColumna[c].map((f) => (
              <Link key={f.id} href={`/admin/miembros/${f.id}`} className="mb-tarjeta">
                <span className="mb-tarjeta__nombre">{f.nombre}</span>
                <span className="mb-tarjeta__sub">
                  {f.planNombre} · {f.estado === 'finalizada' ? 'terminada' : `${h(f.horas - f.restantes)} de ${h(f.horas)} h`} · <span className="ui-imp">{alMes(f)}</span>
                </span>
                <span className="mb-tarjeta__detalle">{detalleTablero(f, c, hoy)}</span>
              </Link>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
