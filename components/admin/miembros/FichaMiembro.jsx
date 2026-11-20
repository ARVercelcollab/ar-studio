// Ficha del miembro: arriba, sus horas de este mes, cómo se le cobra y el contrato y la fianza;
// debajo, sesiones y cuotas; y luego datos, condiciones, notas, baja e historial.
import Link from 'next/link'
import Panel from '../Panel'
import { Boton, Contacto, Etiqueta, Aviso, Icono } from '../ui'
import Cuotas from './ficha/Cuotas'
import { HorasMes, CobroMensual, ContratoYFianza, Sesiones } from './ficha/Resumen'
import { Datos, Condiciones, Notas, Baja, Historial, AreaMiembros } from './ficha/Bloques'
import { fecha, euros } from './ficha/comun'
import { ESTADOS_SUSCRIPCION } from '../../../lib/suscripciones/reglas'

const AVISOS = {
  alta: ['bien', 'Suscripción dada de alta.'],
  sesion: ['bien', 'Sesión reservada.'],
  sesion_sin_correo: ['mal', 'Sesión reservada, pero no se ha podido mandar el correo de confirmación: avísale por WhatsApp.'],
}
// «Cuota sin pagar: … (la del 18 nov, 199,00 €).» → «Es la del 18 nov, 199,00 €.»
const detalleImpago = (t) => {
  const m = /\(([^)]*)\)/.exec(t || '')
  return m ? `Es ${m[1]}.` : ''
}
const TONO_ESTADO = { activa: 'bien', baja_avisada: 'aviso', por_empezar: 'info', finalizada: 'gris' }

export default function FichaMiembro(p) {
  const { sus, estado, enPrueba, resumenActual, sesionesActual, resumenSiguiente, cuotas, sesiones, eventos, ultimoDiaPermanencia, hoy, emisorListo, ok } = p
  const nombre = `${sus.nombre} ${sus.apellidos || ''}`.trim()
  const otras = sesiones.filter((s) => !sesionesActual.some((x) => x.id === s.id))
  const origen = sus.origen === 'web' ? 'alta por la web' : sus.cobroExterno === 'stripe' ? 'venía de Stripe' : null
  const sub = [`Plan ${sus.planNombre}`, `${euros(sus.cuotaCent)} al mes`, `desde el ${fecha(sus.fechaInicio, false)}`, origen].filter(Boolean)
  const aviso = ok && AVISOS[ok]
  return (
    <Panel titulo={nombre} sinCabecera clase="mb-ficha">
      <div className="mb-cab">
        <Link href="/admin/miembros" className="mb-volver"><Icono nombre="izq" />Miembros</Link>
        <div className="mb-cab__fila">
          <div className="mb-cab__titulos">
            <h1>{nombre}</h1>
            <p>
              {sub.map((t, i) => <span key={t} className={i === 1 ? 'ui-imp' : undefined}>{i ? ' · ' : ''}{t}</span>)}
            </p>
            <p className="mb-cab__etiquetas">
              <Etiqueta tono={TONO_ESTADO[estado] || 'gris'} punto>{ESTADOS_SUSCRIPCION[estado]}</Etiqueta>
              {enPrueba && <Etiqueta tono="aviso">En prueba</Etiqueta>}
              <span className="ui-t3">Permanencia hasta el {fecha(ultimoDiaPermanencia)}</span>
            </p>
          </div>
          <div className="mb-cab__acciones">
            <Contacto telefono={sus.telefono} email={sus.email} nombre={sus.nombre} conCorreo />
            {estado !== 'finalizada' && <Boton href={`/admin/anadir?tipo=reserva&suscripcion=${sus.id}`} icono="mas">Reservar sesión</Boton>}
          </div>
        </div>
      </div>

      {aviso && <Aviso tono={aviso[0] === 'mal' ? 'mal' : 'info'}>{aviso[1]}</Aviso>}
      {p.impago && estado !== 'finalizada' && (
        <Aviso tono="mal" titulo="Cuota sin pagar: no puede usar el estudio hasta pagarla.">
          {detalleImpago(p.impago)} Sus sesiones siguen en la agenda: decide si las mantienes. Si al final no paga, pierde la fianza.
        </Aviso>
      )}

      <div className="mb-tres">
        <HorasMes estado={estado} resumenActual={resumenActual} resumenSiguiente={resumenSiguiente} condiciones={null} />
        <CobroMensual sus={sus} cuotas={cuotas} cobros={p.cobros} cobroDisponible={p.cobroDisponible} hoy={hoy} />
        <ContratoYFianza sus={sus} contrato={p.contrato} hoy={hoy} />
      </div>

      <div className="mb-dos">
        <Sesiones sesionesActual={sesionesActual} otras={otras} estado={estado} susId={sus.id} />
        <Cuotas cuotas={cuotas} sus={sus} emisorListo={emisorListo} facturasAuto={p.facturasAuto} hoy={hoy} cobroDisponible={p.cobroDisponible} />
      </div>

      <div className="mb-dos">
        <Datos sus={sus} />
        <Condiciones sus={sus} condiciones={p.condiciones} periodoActual={p.periodoActual} estado={estado} />
      </div>

      <div className="mb-dos">
        <Notas sus={sus} />
        <Baja sus={sus} sesiones={sesiones} hoy={hoy} estado={estado} puedeBorrarse={p.puedeBorrarse} />
      </div>

      <Historial eventos={eventos} />
      <AreaMiembros />
    </Panel>
  )
}
