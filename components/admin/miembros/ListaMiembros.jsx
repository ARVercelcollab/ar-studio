// Miembros · lista: horas del mes, cuota, cobro, contrato, fianza y lo que paga al mes.
// En el móvil cada fila es una tarjeta (Tabla lista).
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Tabla, Celda, Etiqueta, Icono } from '../ui'
import { textoDuracion } from '../../../lib/reservas/config'
import { ESTADOS_SUSCRIPCION } from '../../../lib/suscripciones/reglas'
import { estadoCuota, estadoCobro, estadoContrato, estadoFianza, fechaCorta, alMes } from './estado'

const h = (x) => textoDuracion(x, { corto: true }).replace(/ h$/, '')

export function Horas({ usadas, total, terminada }) {
  if (terminada) return <span className="mb-horas__texto">—</span>
  const pct = total > 0 ? Math.min(100, Math.round((usadas / total) * 100)) : 0
  return (
    <span className="mb-horas">
      <span className="mb-horas__pista" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      <span className="mb-horas__texto">{h(usadas)} de {h(total)} h</span>
    </span>
  )
}

function Estado({ e }) {
  if (!e) return <span className="ui-t3">—</span>
  return <Etiqueta tono={e.tono} punto={e.tono !== 'borde'} title={e.title}>{e.texto}</Etiqueta>
}

export default function ListaMiembros({ filas, hoy }) {
  const router = useRouter()
  return (
    <Tabla
      lista
      titulo="Miembros"
      className="mb-tabla"
      columnas={[
        { texto: 'Miembro' }, { texto: 'Horas del mes' }, { texto: 'Cuota' }, { texto: 'Cobro' },
        { texto: 'Contrato' }, { texto: 'Fianza' }, { texto: 'Al mes', der: true },
      ]}
    >
      {filas.map((f) => {
        const cuota = estadoCuota(f)
        const cobro = estadoCobro(f)
        const terminada = f.estado === 'finalizada'
        const partes = [`Plan ${f.planNombre}`, f.fechaInicio ? `desde ${fechaCorta(f.fechaInicio)}` : null, f.origen === 'web' ? 'alta por la web' : null]
        return (
          <tr key={f.id} className="ui-fila" onClick={(e) => { if (!e.target.closest('a, button')) router.push(`/admin/miembros/${f.id}`) }}>
            <td className="m-principal">
              <Celda
                principal={<Link href={`/admin/miembros/${f.id}`} className="mb-nombre">{f.nombre}</Link>}
                sub={(
                  <>
                    {partes.filter(Boolean).join(' · ')}
                    {f.enPrueba && <Etiqueta tono="aviso">En prueba</Etiqueta>}
                    {f.estado !== 'activa' && <Etiqueta tono={f.estado === 'baja_avisada' ? 'aviso' : 'gris'}>{ESTADOS_SUSCRIPCION[f.estado]}{f.ultimoDia ? ` · ${fechaCorta(f.ultimoDia)}` : ''}</Etiqueta>}
                  </>
                )}
              />
            </td>
            <td className="m-fila">
              {terminada ? <span className="ui-t3">Terminó el {fechaCorta(f.ultimoDia)}</span> : <Horas usadas={f.horas - f.restantes} total={f.horas} />}
            </td>
            <td className="m-fila">
              <Estado e={cuota} />
              {(f.debe || f.cuota) && (
                <span className="ui-tabla__sub">
                  <span className="ui-imp">{f.debe ? f.debe.importe : f.cuota.importe}</span>
                  {f.sinPagar > 1 ? ` · ${f.sinPagar} sin pagar` : ''}
                  {f.debe && f.cobroEstado === 'rechazado' && f.cobroProximo ? ` · reintento ${fechaCorta(f.cobroProximo)}` : ''}
                </span>
              )}
            </td>
            <td className="m-fila">
              <span className="mb-cobro">
                {cobro.tarjeta && <><Icono nombre="tarjeta" />{cobro.tarjeta}</>}
                {!cobro.tarjeta && cobro.texto}
              </span>
              <span className="ui-tabla__sub">{cobro.tarjeta ? cobro.sub || cobro.texto : cobro.sub}</span>
            </td>
            <td className="m-fila"><Estado e={estadoContrato(f)} /></td>
            <td className="m-fila"><Estado e={estadoFianza(f, hoy)} /></td>
            <td className="m-derecha der">
              <span className="mb-almes ui-imp">{alMes(f)}</span>
              <span className="ui-tabla__sub">al mes</span>
            </td>
          </tr>
        )
      })}
    </Tabla>
  )
}
