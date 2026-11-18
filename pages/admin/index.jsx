// Agenda del estudio
import Link from 'next/link'
import Panel, { chipEstado } from '../../components/admin/Panel'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { vistaAdmin } from '../../lib/admin/vista'
import { listarReservas, buscarReservas } from '../../lib/reservas/servicio'
import { madridAInstante, fechaMadrid, sumarDias, textoFecha } from '../../lib/reservas/tiempo'
import { formatoEuros } from '../../lib/reservas/config'
import { urlBase } from '../../lib/http'

const VISTAS = [
  ['proximas', 'Próximas'],
  ['pendientes', 'Sin pagar'],
  ['pasadas', 'Últimos 60 días'],
  ['canceladas', 'Canceladas'],
]

export default function Agenda({ vista, buscar, dias, cifras, calendario }) {
  return (
    <Panel titulo="Agenda" acciones={<Link href="/admin/nueva" className="adm-boton">+ Nueva reserva</Link>}>
      <div className="adm-cifras">
        <div><span>Hoy</span><strong>{cifras.hoy}</strong></div>
        <div><span>Próximos 7 días</span><strong>{cifras.semana}</strong></div>
        <div><span>Pagado (sesiones del mes)</span><strong>{cifras.mes}</strong></div>
        <div><span>Por revisar</span><strong>{cifras.revisar}</strong></div>
      </div>

      <div className="adm-filtros">
        {VISTAS.map(([v, t]) => (
          <Link key={v} href={`/admin?vista=${v}`} className={vista === v && !buscar ? 'is-activo' : ''}>{t}</Link>
        ))}
        <form method="GET" action="/admin">
          <input name="buscar" placeholder="Buscar nombre, correo, código…" defaultValue={buscar || ''} />
          <button type="submit" className="adm-boton adm-boton--claro">Buscar</button>
        </form>
      </div>

      {dias.length === 0 && <div className="adm-caja"><p>No hay reservas en esta vista.</p></div>}

      {dias.map(({ fecha, texto, reservas }) => (
        <section key={fecha} className="adm-dia">
          <h3>{texto}</h3>
          {reservas.map((r) => (
            <Link key={r.id} href={`/admin/reserva/${r.id}`} className="adm-fila">
              <span className="adm-fila__hora">{r.horaInicio} – {r.horaFin}</span>
              <span className="adm-fila__quien">
                {r.nombre} {r.apellidos}
                <small>{r.duracionHoras} h · {r.actividad || 'sin actividad'}{r.origen !== 'web' ? ` · ${r.origen}` : ''}{r.factura ? ' · pide factura' : ''}</small>
              </span>
              <span>{r.importe}</span>
              {chipEstado(r)}
            </Link>
          ))}
        </section>
      ))}

      {calendario && (
        <div className="adm-caja">
          <h2>Ver la agenda en Google Calendar</h2>
          <p>En Google Calendar: Otros calendarios → + → Desde URL, y pega esta dirección. No la compartas: da acceso a los nombres y teléfonos de los clientes.</p>
          <div className="adm-copiar"><input readOnly value={calendario} onFocus={(e) => e.target.select()} /></div>
        </div>
      )}
    </Panel>
  )
}

function agrupar(reservas) {
  const dias = []
  for (const r of reservas) {
    let d = dias.at(-1)
    if (!d || d.fecha !== r.fecha) dias.push((d = { fecha: r.fecha, texto: r.fechaTexto, reservas: [] }))
    d.reservas.push(r)
  }
  return dias
}

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const vista = VISTAS.some(([v]) => v === ctx.query.vista) ? ctx.query.vista : 'proximas'
  const buscar = typeof ctx.query.buscar === 'string' ? ctx.query.buscar.trim() : ''
  const hoy = fechaMadrid(new Date())
  const inicioHoy = madridAInstante(hoy, '00:00')
  const lejos = madridAInstante(sumarDias(hoy, 400), '00:00')

  let lista
  if (buscar) {
    lista = await buscarReservas(buscar)
  } else if (vista === 'pasadas') {
    lista = (await listarReservas({ desde: madridAInstante(sumarDias(hoy, -60), '00:00'), hasta: inicioHoy, estados: ['confirmada', 'conflicto'] })).reverse()
  } else if (vista === 'canceladas') {
    lista = (await listarReservas({ desde: madridAInstante(sumarDias(hoy, -90), '00:00'), hasta: lejos, estados: ['cancelada'] })).reverse()
  } else {
    lista = await listarReservas({ desde: inicioHoy, hasta: lejos, estados: ['pendiente', 'confirmada', 'conflicto'] })
    if (vista === 'pendientes') lista = lista.filter((r) => r.pagoEstado !== 'pagado' || r.estado === 'conflicto')
  }

  // Cifras
  const proximas = await listarReservas({ desde: inicioHoy, hasta: madridAInstante(sumarDias(hoy, 7), '00:00'), estados: ['confirmada'] })
  const [y, m] = hoy.split('-')
  const inicioMes = madridAInstante(`${y}-${m}-01`, '00:00')
  const delMes = await listarReservas({ desde: inicioMes, hasta: madridAInstante(sumarDias(`${y}-${m}-01`, 32).slice(0, 8) + '01', '00:00'), estados: ['confirmada', 'cancelada'] })
  const cobrado = delMes.filter((r) => r.pagoEstado !== 'pendiente').reduce((s, r) => s + r.precioCent - (r.reembolsoCent || 0), 0)
  const revisar = (await listarReservas({ desde: madridAInstante(sumarDias(hoy, -60), '00:00'), hasta: lejos, estados: ['conflicto'] })).length

  const token = process.env.CALENDARIO_TOKEN
  return {
    props: {
      vista,
      buscar,
      dias: agrupar(lista.map(vistaAdmin)).map((d) => ({ ...d, texto: d.fecha === hoy ? `Hoy · ${d.texto}` : d.texto })),
      cifras: {
        hoy: proximas.filter((r) => fechaMadrid(r.inicio) === hoy).length,
        semana: proximas.length,
        mes: formatoEuros(cobrado),
        revisar,
      },
      calendario: token && token.length >= 24 ? `${urlBase(ctx.req)}/api/admin/calendario?clave=${token}` : null,
      hoyTexto: textoFecha(hoy),
    },
  }
}
