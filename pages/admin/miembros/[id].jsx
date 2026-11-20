// Ficha de un miembro (/admin/miembros/[id]). La pantalla está en components/admin/miembros/FichaMiembro.
import FichaMiembro from '../../../components/admin/miembros/FichaMiembro'
import { textoEvento } from '../../../components/admin/miembros/ficha/comun'
import { redirigirSiNoAdmin } from '../../../lib/admin/auth'
import { vistaAdmin, enlaceWhatsApp, fechaHoraTexto } from '../../../lib/admin/vista'
import { fichaSuscripcion } from '../../../lib/suscripciones/servicio'
import { textoPeriodo, textoRecordatorioCuota } from '../../../lib/suscripciones/reglas'
import { fechaMadrid } from '../../../lib/reservas/tiempo'
import { ErrorReserva } from '../../../lib/reservas/servicio'
import { emisor, facturasAutomaticas } from '../../../lib/facturas/servicio'

export default FichaMiembro

const iso = (v) => (v ? new Date(v).toISOString() : null)

export async function getServerSideProps(ctx) {
  const redir = redirigirSiNoAdmin(ctx)
  if (redir) return redir
  ctx.res.setHeader('Cache-Control', 'no-store')
  if (!/^\d+$/.test(String(ctx.params.id))) return { notFound: true }
  let ficha
  try {
    ficha = await fichaSuscripcion(ctx.params.id)
  } catch (e) {
    if (e instanceof ErrorReserva && e.estadoHttp === 404) return { notFound: true }
    throw e
  }
  const { sus } = ficha
  const iban = process.env.ESTUDIO_IBAN || null
  const { contratoDeSuscripcion, urlContrato, historialCobros, cobroAutomaticoActivo } = await import('../../../lib/suscripciones/alta')
  const { urlBase } = await import('../../../lib/http')
  const contrato = await contratoDeSuscripcion(sus.id)
  const sesion = (s) => vistaAdmin({ ...s, planSuscripcion: sus.plan })
  return {
    props: {
      sus,
      estado: ficha.estado,
      enPrueba: ficha.enPrueba,
      periodoActual: ficha.periodoActual,
      resumenActual: ficha.resumenActual,
      sesionesActual: ficha.sesionesActual.map(sesion),
      resumenSiguiente: ficha.resumenSiguiente,
      cuotas: ficha.cuotas.map((c) => ({
        ...c,
        texto: textoPeriodo(c),
        recordatorio: c.estado === 'pendiente' && c.importeCent > 0 ? enlaceWhatsApp(sus.telefono, textoRecordatorioCuota(sus, c, { iban })) : null,
      })),
      sesiones: ficha.sesiones.map(sesion),
      eventos: ficha.eventos.map((e) => ({ tipo: e.tipo, detalle: e.detalle, cuando: fechaHoraTexto(e.creadoEn), reservaId: e.reservaId, codigo: e.codigo, autor: e.autor }))
        .map((e) => ({ tipo: e.tipo, cuando: e.cuando, reservaId: e.reservaId ?? null, autor: e.autor ?? null, texto: textoEvento(e) || null })),
      ultimoDiaPermanencia: ficha.ultimoDiaPermanencia,
      // Área de miembros: último acceso y último enlace enviado (ISO o null)
      acceso: { ultimoEn: iso(ficha.acceso?.ultimoEn), enviadoEn: iso(ficha.acceso?.enviadoEn) },
      contrato: contrato ? { estado: contrato.estado, version: contrato.version, firmadoEn: contrato.firmadoEn, enviadoEn: contrato.enviadoEn, recordadoEn: contrato.recordadoEn, url: urlContrato(urlBase(ctx.req), contrato.token) } : null,
      puedeBorrarse: ficha.puedeBorrarse,
      impago: ficha.impago || null,
      cobros: await historialCobros(sus.id),
      cobroDisponible: cobroAutomaticoActivo(),
      condiciones: ficha.condiciones,
      hoy: fechaMadrid(new Date()),
      emisorListo: Boolean(emisor()),
      facturasAuto: Boolean(facturasAutomaticas()),
      ok: typeof ctx.query.ok === 'string' ? ctx.query.ok : null,
    },
  }
}
