// Resumen de Ajustes (la parte que se ve). Los datos los prepara pages/admin/ajustes/index.jsx.
import Link from 'next/link'
import Panel from '../Panel'
import { Tarjeta, Etiqueta, EnlaceFlecha, Datos, Aviso, Icono } from '../ui'
import { DURACIONES, REGLAS, HORARIO, PLANES, PLAN_COMUN, PLAN_HORA_EXTRA_CENT, FIANZA_PLAZO_DIAS, textoDuracion } from '../../../lib/reservas/config'

const SECCIONES = [
  ['precios', 'Precios y reglas'], ['planes', 'Planes'], ['fijos', 'Gastos fijos'], ['google', 'Google Calendar'],
  ['calendly', 'Calendly'], ['festivos', 'Festivos'], ['bloqueos', 'Bloqueos'],
]
// 96,80 € · 5.157 € (con punto de miles también en las de cuatro cifras)
export const euro = (cent) => {
  const c = Math.abs(Math.round(cent))
  const ent = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${cent < 0 ? '−' : ''}${ent}${c % 100 ? `,${String(c % 100).padStart(2, '0')}` : ''} €`
}
// Precio sin IVA de un importe con IVA del 21 % (6050 → «50 €»)
const sinIva = (cent) => euro(Math.round(cent / 1.21))

function franja(p) {
  return `L–V de ${p.franja[0]} a ${p.franja[1]}`
}

function textoSesiones(p) {
  if (p.duracionesH && p.duracionesH.length === 1) return `${p.maxSesiones === 1 ? '1 sesión' : 'sesiones'} de ${p.duracionesH[0]} h`
  if (p.duracionesH) return `sesiones de ${p.duracionesH.join(' u ')} h${p.maxSesiones ? ` (hasta ${p.maxSesiones} al mes)` : ''}`
  return `sesiones de ${p.sesionMinH} a ${p.sesionMaxH} h`
}

export default function ResumenAjustes({ fijos, alMesCent, google, calendly, festivos, bloqueos }) {
  return (
    <Panel titulo="Ajustes" sub="Precios, planes, gastos fijos y conexiones." clase="adm-ajustes">
      <nav className="adm-ajustes__saltos" aria-label="Ir a">
        {SECCIONES.map(([id, t]) => <a key={id} href={`#${id}`} className="adm-ajustes__chip">{t}</a>)}
      </nav>

      <div className="adm-ajustes__rejilla">
        <div className="adm-ajustes__columna">
          <Tarjeta id="precios" titulo="Precios y reglas" nota="Precios con IVA. Los que se cobran en la web por horas." tabla>
            <div className="ui-tabla-caja">
              <table className="ui-tabla adm-ajustes__precios">
                <thead><tr><th scope="col">Duración</th><th scope="col" className="der">Entre semana</th><th scope="col" className="der">Finde y festivos</th></tr></thead>
                <tbody>
                  {DURACIONES.map((d) => (
                    <tr key={d.horas}>
                      <th scope="row">{textoDuracion(d.horas)}</th>
                      <td className="der ui-num">{euro(d.laborable)}</td>
                      <td className={`der ui-num${d.finde == null ? ' ui-t3' : ''}`}>{d.finde == null ? 'No se vende' : euro(d.finde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="adm-ajustes__datos">
              <Datos filas={[
                ['Horario', HORARIO.laborable.abre === HORARIO.finde.abre && HORARIO.laborable.cierra === HORARIO.finde.cierra ? `De ${HORARIO.laborable.abre} a ${HORARIO.laborable.cierra}, todos los días` : `Entre semana de ${HORARIO.laborable.abre} a ${HORARIO.laborable.cierra}; finde de ${HORARIO.finde.abre} a ${HORARIO.finde.cierra}`],
                ['Entre reservas', `${REGLAS.margenEntreReservasMin} minutos para preparar el estudio`],
                ['Antelación', `${REGLAS.antelacionMinimaHoras} horas en la web (miembros: ${PLAN_COMUN.antelacionH} horas)`],
                ['Mientras paga', `La hora se guarda ${REGLAS.minutosRetencionPago} minutos`],
                ['Horas aparte', `Miembros, el mismo día: ${sinIva(PLAN_HORA_EXTRA_CENT.laborable).replace(' €', '')} €/h + IVA (finde ${sinIva(PLAN_HORA_EXTRA_CENT.finde).replace(' €', '')} €/h + IVA). Con antelación, el precio de la web`],
              ]} />
              <p className="adm-ajustes__pie"><Icono nombre="info" />Para cambiar precios u horarios hay que tocar el programa (lib/reservas/config.js): pídelo y se cambia en un momento.</p>
            </div>
          </Tarjeta>

          <Tarjeta id="planes" titulo="Planes" nota="Los de la web (/planmensual). A quien ya es miembro, sus condiciones se le cambian en su ficha.">
            <ul className="adm-ajustes__lista">
              {Object.entries(PLANES).map(([id, p]) => (
                <li key={id}>
                  <span><b>{p.nombre} · {textoDuracion(p.horasPeriodo)} al mes</b><small>{textoSesiones(p)} · {franja(p)}</small></span>
                  <span className="ui-num">{euro(p.cuotaCent)}/mes</span>
                </li>
              ))}
            </ul>
            <Datos filas={[
              ['Permanencia', `${PLAN_COMUN.permanenciaMeses} meses`],
              ['Fianza', `${euro(PLAN_COMUN.fianzaCent)} por transferencia, ${FIANZA_PLAZO_DIAS} días desde la firma`],
              ['Cancelar', `Con menos de ${PLAN_COMUN.avisoCancelacionH} horas, la sesión cuenta como usada`],
              ['Si no paga', 'No puede usar el estudio hasta pagar; si al final no paga, pierde la fianza'],
            ]} />
          </Tarjeta>

          <Tarjeta id="fijos" titulo="Gastos fijos" nota="Se apuntan solos cada mes en Movimientos. Los que cambian de importe (luz, agua) se corrigen al llegar la factura." pie={<EnlaceFlecha href="/admin/ajustes/fijos">Gestionar los gastos fijos</EnlaceFlecha>}>
            {fijos.length === 0 ? (
              <p className="ui-t3 adm-ajustes__vacio">Aún no hay gastos fijos. Añade el alquiler, internet, la luz, el agua, Aquaservice o la alarma.</p>
            ) : (
              <>
                <ul className="adm-ajustes__lista">
                  {fijos.map((f) => (
                    <li key={f.id}>
                      <span><b>{f.concepto}</b><small>{f.texto}</small></span>
                      <span className="ui-num">{f.importe}</span>
                    </li>
                  ))}
                </ul>
                <p className="adm-ajustes__total">Fijos al mes: <b className="ui-num ui-imp">{euro(alMesCent)}</b> con IVA</p>
              </>
            )}
          </Tarjeta>
        </div>

        <div className="adm-ajustes__columna">
          <Tarjeta id="google" titulo="Google Calendar" pie={<EnlaceFlecha href="/admin/ajustes/google">{google.conectado ? 'Ver la conexión' : 'Conectar'}</EnlaceFlecha>}>
            <div className="adm-ajustes__estado">
              <span className="adm-ajustes__icono"><Icono nombre="cal" /></span>
              <span>
                <b>{google.conectado ? 'Conectado' : !google.configurado ? 'Falta preparar la conexión' : google.revocado ? 'Google ha cortado la conexión' : 'Sin conectar'}</b>
                <small>{google.conectado ? `${google.calendarioNombre ? `Calendario «${google.calendarioNombre}»` : 'Calendario principal'}${google.cuenta ? ` de ${google.cuenta}` : ''}` : !google.configurado ? 'Hay que crear el permiso en Google Cloud (ver la guía).' : 'Entra con la cuenta del estudio y pulsa «Permitir».'}</small>
              </span>
              {google.conectado && (google.errores > 0 ? <Etiqueta tono="mal" punto>{google.errores} sin pasar</Etiqueta> : google.pendientes > 0 ? <Etiqueta tono="aviso" punto>{google.pendientes} pendientes</Etiqueta> : <Etiqueta tono="bien" punto>Al día</Etiqueta>)}
            </div>
            <p className="adm-ajustes__texto">Cada reserva entra al momento con nombre, teléfono, qué van a hacer, importe y si está pagada. Si se mueve o se cancela, se actualiza sola.</p>
          </Tarjeta>

          <Tarjeta id="calendly" titulo="Calendly" nota={calendly.sigue ? 'Mientras se siga usando, lo cobrado se apunta una vez al mes. Aparece en Movimientos.' : calendly.hasta ? `Se cobró por Calendly hasta ${calendly.hasta}.` : 'No se cobra por Calendly.'} pie={<EnlaceFlecha href="/admin/ajustes/calendly">Apuntar un mes</EnlaceFlecha>}>
            {calendly.falta && <Aviso tono="aviso" titulo={`Falta apuntar ${calendly.falta}.`}>Copia lo cobrado del informe de Stripe.</Aviso>}
            {calendly.meses.length === 0 ? (
              <p className="ui-t3 adm-ajustes__vacio">Todavía no hay ningún mes apuntado.</p>
            ) : (
              <ul className="adm-ajustes__lista">
                {calendly.meses.map((m) => (
                  <li key={m.mes}>
                    <span><b>{m.texto}</b>{m.devueltoCent > 0 && <small>Devuelto {euro(m.devueltoCent)}</small>}</span>
                    <span className="ui-num ui-imp">{euro(m.cobradoCent)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta id="festivos" titulo="Festivos" nota="Se reservan como fin de semana: mínimo 4 horas y precio de finde." pie={<EnlaceFlecha href="/admin/ajustes/festivos">Añadir o quitar festivos</EnlaceFlecha>}>
            {festivos.length === 0 ? <p className="ui-t3 adm-ajustes__vacio">No hay festivos apuntados.</p> : (
              <ul className="adm-ajustes__lista">
                {festivos.map((x) => <li key={x.fecha}><span><b>{x.texto}</b><small>{x.nombre}</small></span></li>)}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta id="bloqueos" titulo="Bloqueos" nota="Horas en las que nadie puede reservar (grabaciones propias, vacaciones…)." pie={<span className="adm-ajustes__pies"><EnlaceFlecha href="/admin/ajustes/bloqueos">Ver todos</EnlaceFlecha><Link href="/admin/anadir?tipo=bloqueo" className="ui-enlace-flecha">Bloquear unas horas<Icono nombre="der" /></Link></span>}>
            {bloqueos.length === 0 ? <p className="ui-t3 adm-ajustes__vacio">No hay ningún bloqueo próximo.</p> : (
              <ul className="adm-ajustes__lista">
                {bloqueos.map((b) => <li key={b.id}><span><b>{b.desde}</b><small>Hasta {b.hasta}{b.motivo ? ` · ${b.motivo}` : ''}</small></span></li>)}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </Panel>
  )
}

