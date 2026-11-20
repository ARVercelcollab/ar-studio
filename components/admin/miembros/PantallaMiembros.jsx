// Miembros: quién está con plan mensual, sus horas del mes, la cuota, cómo se cobra, el contrato
// y la fianza. En lista o en tablero (por estado). Arriba, lo que hay que hacer.
import Panel from '../Panel'
import { Boton, Conmutador, Totales, Vacio, Aviso } from '../ui'
import ListaMiembros from './ListaMiembros'
import TableroMiembros from './TableroMiembros'
import ParaHacer from './ParaHacer'
import { formatoEuros } from '../../../lib/reservas/config'

export const VISTAS = [
  ['activas', 'Activas'],
  ['sin_pagar', 'Sin pagar'],
  ['finalizadas', 'Terminadas'],
]

const enlace = (modo, vista) => {
  const q = new URLSearchParams()
  if (modo === 'tablero') q.set('modo', 'tablero')
  if (vista && vista !== 'activas') q.set('vista', vista)
  const s = q.toString()
  return `/admin/miembros${s ? `?${s}` : ''}`
}

const VACIOS = {
  activas: 'Todavía no hay nadie con plan mensual. Da de alta la primera suscripción con «Nueva suscripción».',
  sin_pagar: 'No hay cuotas sin pagar.',
  finalizadas: 'No hay suscripciones terminadas.',
}

export default function Miembros({ modo, vista, filas, cifras, tareas, hoy, ok }) {
  return (
    <Panel
      titulo="Miembros"
      sub="Planes mensuales: horas del mes, cuota, contrato y fianza."
      acciones={(
        <>
          <Conmutador
            etiqueta="Vista"
            valor={modo}
            opciones={[
              { valor: 'lista', texto: 'Lista', icono: 'lista', href: enlace('lista', vista) },
              { valor: 'tablero', texto: 'Tablero', icono: 'tablero', href: enlace('tablero') },
            ]}
          />
          <Boton href="/admin/miembros/nueva" icono="mas">Nueva suscripción</Boton>
        </>
      )}
    >
      {ok === 'borrada' && <Aviso tono="info">Suscripción borrada.</Aviso>}

      <Totales
        className="mb-totales"
        items={[
          { nombre: 'Miembros', valor: String(cifras.activas) },
          { nombre: 'Cuotas al mes (con IVA)', valor: formatoEuros(cifras.cuotasAlMesCent), importe: true },
          {
            nombre: 'Cuotas sin pagar',
            valor: cifras.cuotasSinPagar.n ? `${cifras.cuotasSinPagar.n} · ${formatoEuros(cifras.cuotasSinPagar.totalCent)}` : '0',
            tono: cifras.cuotasSinPagar.n ? 'mal' : undefined,
            importe: cifras.cuotasSinPagar.n > 0,
          },
          { nombre: 'Fianzas pendientes', valor: String(cifras.fianzasPendientes) },
        ]}
      />

      <ParaHacer tareas={tareas} />

      {modo === 'lista' && (
        <div className="mb-vistas">
          <Conmutador
            etiqueta="Qué miembros"
            valor={vista}
            opciones={VISTAS.map(([v, t]) => ({ valor: v, texto: t, href: enlace('lista', v) }))}
          />
        </div>
      )}

      {filas.length === 0 ? (
        <Vacio texto={VACIOS[vista]} accion={vista === 'activas' ? <Boton href="/admin/miembros/nueva" icono="mas">Nueva suscripción</Boton> : null} />
      ) : modo === 'tablero' ? (
        <TableroMiembros filas={filas} hoy={hoy} />
      ) : (
        <ListaMiembros filas={filas} hoy={hoy} />
      )}
    </Panel>
  )
}
