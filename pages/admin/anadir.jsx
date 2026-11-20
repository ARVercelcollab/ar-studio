// Añadir: «Escribirlo | Formulario», como en Gartalia. Se puede añadir una reserva (por horas o una
// sesión de un miembro), un gasto, otro ingreso, el cobro de una cuota o unas horas bloqueadas.
// «Escribirlo» lo entiende un programa de palabras clave (lib/admin/interprete.js), sin IA: siempre
// enseña lo que ha entendido y solo guarda al pulsar «Guardar».
//   /admin/anadir?tipo=reserva&nombre=&apellidos=&email=&telefono=   (desde la ficha de un cliente)
//   /admin/anadir?tipo=reserva&suscripcion=ID                         (sesión de un miembro)
//   /admin/anadir?tipo=gasto&categoria=ID · ?tipo=ingreso · ?tipo=cuota · ?tipo=bloqueo
import PantallaAnadir, { TIPOS } from '../../components/admin/anadir/Pantalla'
import { redirigirSiNoAdmin } from '../../lib/admin/auth'
import { fechaMadrid } from '../../lib/reservas/tiempo'
import { listarFestivos } from '../../lib/reservas/servicio'
import { opcionesParaReservar } from '../../lib/suscripciones/servicio'
import { datosFormularioGasto, reservasParaIngreso } from '../../lib/finanzas/servicio'
import { cuotasPendientes, clientesConocidos, resumenDelMes } from '../../lib/admin/anadir'
import { facturasAutomaticas } from '../../lib/facturas/servicio'

export default PantallaAnadir

// ---------- Datos ----------

const texto = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  const hoy = fechaMadrid(new Date())
  const q = ctx.query || {}
  const [miembros, datosGasto, reservasIngreso, cuotas, clientes, festivos, mes] = await Promise.all([
    opcionesParaReservar(),
    datosFormularioGasto(),
    reservasParaIngreso({ hoy }),
    cuotasPendientes(hoy),
    clientesConocidos(),
    listarFestivos(),
    resumenDelMes(hoy),
  ])

  // Lo que llega por la dirección
  const tipo = TIPOS.includes(q.tipo) ? q.tipo : q.modo === 'suscripcion' || q.suscripcion ? 'reserva' : null
  const inicial = {}
  if (tipo === 'reserva') {
    const sus = /^\d+$/.test(String(q.suscripcion || '')) ? Number(q.suscripcion) : null
    if (sus != null && miembros.some((m) => m.id === sus)) Object.assign(inicial, { modo: 'suscripcion', susId: sus })
    else if (q.modo === 'suscripcion') inicial.modo = 'suscripcion'
    for (const k of ['nombre', 'apellidos', 'email', 'telefono']) if (texto(q[k])) inicial[k] = texto(q[k])
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.fecha || ''))) inicial.fecha = q.fecha
  }
  if (tipo === 'gasto' && /^\d+$/.test(String(q.categoria || ''))) {
    const c = Number(q.categoria)
    if (datosGasto.categorias.some((x) => x.id === c)) inicial.categoriaId = c
  }
  const ok = typeof q.ok === 'string' && /^(gasto|ingreso):\d+$/.test(q.ok) ? q.ok : null

  return {
    props: JSON.parse(JSON.stringify({
      hoy,
      miembros,
      datosGasto,
      reservasIngreso,
      cuotas,
      clientes,
      festivos: festivos.map((f) => f.fecha),
      mes,
      facturas: facturasAutomaticas(),
      entrada: { tipo, inicial, ok },
    })),
  }
}
