// Guardar lo que ha entendido «Escribirlo» con las mismas rutas del panel que usan los formularios.
// Cada función devuelve { texto, enlace } para «Añadido desde el panel».
import { useCallback, useEffect, useState } from 'react'
import { pedirJson } from '../../../lib/reservas/navegador'
import { euros } from '../../../lib/admin/interprete'

const clave = (sufijo) => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${sufijo}`)

// 3200 → '32,00' (lo que entienden los formularios)
export const aTexto = (cent) => (cent == null ? '' : (cent / 100).toFixed(2).replace('.', ','))

const METODO = { tarjeta: 'tarjeta', bizum: 'Bizum', efectivo: 'efectivo', transferencia: 'transferencia', domiciliacion: 'recibo domiciliado', stripe: 'Stripe', otro: 'otro medio' }

export async function guardarReserva(c) {
  const r = await pedirJson('/api/admin/reservas/nueva', {
    method: 'POST',
    body: {
      fecha: c.fecha, desde: c.desde, hasta: c.hasta, nombre: c.nombre, apellidos: c.apellidos, email: c.email, telefono: c.telefono,
      actividad: c.actividad || 'Fotos', fondos: 'no', equipo: [], comentarios: '', precio: '', pagado: false,
      metodoPago: 'transferencia', pagadoEn: '', notasInternas: '', enviarCorreo: false,
    },
  })
  return { texto: `Reserva de ${`${c.nombre} ${c.apellidos}`.trim()} · ${c.desde}–${c.hasta}`, enlace: `/admin/reserva/${r.id}`, mensaje: r.mensaje }
}

export async function guardarGasto(c, categoria) {
  if (!categoria) throw new Error('Elige la categoría en el formulario.')
  if (categoria.retencionPct > 0) throw new Error('Este tipo de gasto lleva retención: revísalo en el formulario.')
  const conIva = ['nif', 'ticket'].includes(categoria.tipoFactura)
  const r = await pedirJson('/api/admin/finanzas/gastos/nuevo', {
    method: 'POST',
    body: {
      categoriaId: categoria.id, importeEs: 'pagado', importe: aTexto(c.importeCent), fecha: c.fecha, concepto: c.concepto, proveedor: '', numFactura: '',
      tipoFactura: categoria.tipoFactura, ivaPct: conIva ? categoria.ivaPct ?? 21 : null, iva: '', retencionPct: 0, metodoPago: c.metodoPago || '',
      enlace: '', nota: '', clave: clave('gasto'),
    },
  })
  return { texto: `Gasto · ${r.concepto} · ${euros(r.totalCent)}`, enlace: `/admin/movimientos/gastos/${r.id}`, mensaje: r.mensaje }
}

export async function guardarIngreso(c) {
  const r = await pedirJson('/api/admin/finanzas/ingresos/nuevo', {
    method: 'POST',
    body: {
      tipo: c.tipo, sentido: 'cobro', fecha: c.fecha, concepto: c.concepto, importe: aTexto(c.importeCent), ivaPct: 21, iva: '', reservaId: '',
      facturaRef: '', clienteNombre: '', clienteNif: '', metodoPago: c.metodoPago || '', enlace: '', nota: '', clave: clave('ingreso'),
    },
  })
  return { texto: `Ingreso · ${r.concepto} · ${euros(r.totalCent)}`, enlace: `/admin/movimientos/ingresos/${r.id}`, mensaje: r.mensaje }
}

export async function guardarCuota(c, { nombre, facturas }) {
  const r = await pedirJson(`/api/admin/cuotas/${c.cuotaId}`, {
    method: 'POST',
    body: { accion: 'pagada', metodo: c.metodo, fecha: c.fecha, emitirFactura: Boolean(facturas) && c.metodo !== 'stripe' },
  })
  return { texto: `Cuota de ${nombre} · pagada por ${METODO[c.metodo] || c.metodo}`, enlace: `/admin/miembros/${c.susId}`, mensaje: r.mensaje }
}

export async function guardarBloqueo(c) {
  await pedirJson('/api/admin/bloqueos', { method: 'POST', body: { accion: 'crear', fecha: c.fecha, fechaFin: c.fechaFin || '', desde: c.desde, hasta: c.hasta, motivo: c.motivo || '' } })
  return { texto: `Bloqueo · ${c.fecha.split('-').reverse().join('/')}${c.fechaFin ? ` al ${c.fechaFin.split('-').reverse().join('/')}` : ''}, ${c.desde}–${c.hasta}`, enlace: '/admin/ajustes/bloqueos' }
}

// «Añadido desde el panel»: lo guardado en esta sesión del navegador (solo para verlo, no cuenta para nada)
const LLAVE = 'adm-anadidos'
export function useAnadidos() {
  const [lista, setLista] = useState([])
  useEffect(() => {
    try {
      setLista(JSON.parse(window.sessionStorage.getItem(LLAVE) || '[]'))
    } catch {
      setLista([])
    }
  }, [])
  const anadir = useCallback((item) => {
    setLista((l) => {
      const nueva = [{ ...item, cuando: new Date().toISOString() }, ...l.filter((x) => !(x.enlace && x.enlace === item.enlace && x.texto === item.texto))].slice(0, 12)
      try {
        window.sessionStorage.setItem(LLAVE, JSON.stringify(nueva))
      } catch {
        // sin sessionStorage (modo privado): solo se ve hasta recargar
      }
      return nueva
    })
  }, [])
  return [lista, anadir]
}
