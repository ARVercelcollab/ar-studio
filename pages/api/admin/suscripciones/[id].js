// Acciones sobre una suscripción
import { rutaAdmin, centimos } from '../../../../lib/admin/api.js'
import * as SUS from '../../../../lib/suscripciones/servicio.js'
import { correoConfirmacion } from '../../../../lib/reservas/correos.js'
import { urlReserva } from '../../../../lib/reservas/flujo.js'
import { urlBase } from '../../../../lib/http.js'
import { textoDuracion } from '../../../../lib/reservas/config.js'
import { registrarEvento } from '../../../../lib/reservas/servicio.js'

const numero = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

export default rutaAdmin(async (req, res) => {
  const id = req.query.id
  const b = req.body || {}
  switch (b.accion) {
    case 'comprobar':
      return res.status(200).json(await SUS.comprobarSesion(id, { fecha: b.fecha, desde: b.desde, hasta: b.hasta, horasPlan: b.horasPlan ?? null, excluirId: b.excluirId || null }))
    case 'reservar': {
      const { reserva, resumen } = await SUS.crearSesionPlan(id, {
        fecha: b.fecha, desde: b.desde, hasta: b.hasta, horasPlan: b.horasPlan ?? null,
        precioExtraCent: centimos(b.precioExtra), extraPagado: Boolean(b.extraPagado), extraMetodo: b.extraMetodo,
        fondos: b.fondos, notasInternas: b.notasInternas, avisosAceptados: b.avisosAceptados || [],
      })
      let mensaje = `Sesión reservada. Le quedan ${textoDuracion(resumen.restantes, { corto: true })} este periodo.`
      let correoFallido = false
      if (b.enviarCorreo && reserva.email) {
        try {
          await correoConfirmacion(reserva, { urlReserva: urlReserva(urlBase(req), reserva) })
        } catch (e) {
          correoFallido = true
          mensaje += ' No se pudo mandar el correo de confirmación.'
          await registrarEvento(reserva.id, 'correo_fallido', { error: String(e.message || e) }, { suscripcionId: reserva.suscripcionId, autor: 'panel' }).catch(() => {})
        }
      }
      return res.status(200).json({ id: reserva.id, mensaje, correoFallido })
    }
    case 'editar':
      await SUS.editarSuscripcion(id, {
        nombre: b.nombre, apellidos: b.apellidos, email: b.email, telefono: b.telefono,
        factura: b.quiereFactura ? b.factura : null, metodoHabitual: b.metodoHabitual, cobroExternoRef: b.cobroExternoRef,
        contratoUrl: b.contratoUrl,
      })
      return res.status(200).json({ ok: true, mensaje: 'Datos guardados.' })
    case 'condiciones': {
      const c = b.condiciones || {}
      const r = await SUS.cambiarCondiciones(id, {
        plan: b.plan, cuotaCent: centimos(c.cuota), horasPeriodo: numero(c.horasPeriodo), duracionesH: c.duracionesH,
        sesionMinH: numero(c.sesionMinH), sesionMaxH: numero(c.sesionMaxH), maxSesiones: c.maxSesiones === '' ? null : numero(c.maxSesiones),
        franjaDesde: c.franjaDesde, franjaHasta: c.franjaHasta, antelacionH: numero(c.antelacionH),
        permanenciaMeses: numero(c.permanenciaMeses), renovacionMeses: numero(c.renovacionMeses), preavisoDias: numero(c.preavisoDias),
      }, { desdePeriodo: b.desdePeriodo })
      const pagadas = r.cuotasPagadasSinTocar.length ? ` Las cuotas ya pagadas (periodo ${r.cuotasPagadasSinTocar.join(', ')}) no se han tocado.` : ''
      return res.status(200).json({ ok: true, mensaje: `Condiciones cambiadas.${pagadas}` })
    }
    case 'baja': {
      const r = await SUS.darDeBaja(id, {
        avisoEn: b.avisoEn, ultimoDia: b.ultimoDia, motivo: b.motivo, cancelarSesiones: b.cancelarSesiones !== false,
        cobroExternoCancelado: Boolean(b.cobroExternoCancelado),
      })
      const partes = ['Baja apuntada.']
      if (r.sesionesCanceladas.length) partes.push(`Se han cancelado ${r.sesionesCanceladas.length} ${r.sesionesCanceladas.length === 1 ? 'sesión' : 'sesiones'}.`)
      if (r.sesionesConExtraPagado.length) partes.push(`Devuélvele las horas aparte de ${r.sesionesConExtraPagado.join(', ')}.`)
      if (r.cuotasPagadasDespues.length) partes.push(`Tiene cuotas pagadas después de su último día (periodo ${r.cuotasPagadasDespues.map((c) => c.periodo).join(', ')}): devuélvelas a mano.`)
      return res.status(200).json({ ok: true, mensaje: partes.join(' ') })
    }
    case 'deshacer_baja':
      await SUS.deshacerBaja(id)
      return res.status(200).json({ ok: true, mensaje: 'Baja deshecha. Las sesiones canceladas hay que reservarlas de nuevo.' })
    case 'cobro_externo_cancelado':
      await SUS.marcarCobroExternoCancelado(id)
      return res.status(200).json({ ok: true, mensaje: 'Apuntado: el cobro automático está cancelado.' })
    case 'fianza':
      await SUS.resolverFianza(id, { accion: b.fianza, importeCent: centimos(b.euros), metodo: b.metodo, fecha: b.fecha, nota: b.nota })
      return res.status(200).json({ ok: true, mensaje: 'Fianza actualizada.' })
    case 'notas':
      await SUS.guardarNotasSuscripcion(id, b.notas)
      return res.status(200).json({ ok: true, mensaje: 'Notas guardadas.' })
    case 'borrar':
      await SUS.borrarSuscripcion(id)
      return res.status(200).json({ ok: true, borrada: true })
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
})
