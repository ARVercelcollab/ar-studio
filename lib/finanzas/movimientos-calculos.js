// Movimientos del panel: lo que no toca la base de datos (lo usan el servidor y las páginas).
// Convierte los cobros y gastos de servicio.js en «movimientos» de la lista, los filtra y suma.
// La consulta está en movimientos.js.

import { PLANES, METODOS_CUOTA } from '../reservas/config.js'
import * as C from './calculos.js'
import { TEXTO_FUENTE, METODOS_GASTO, METODOS_INGRESO, MESES_CORTOS } from './config.js'

// ---------- Colores y textos ----------

// Ingresos en marrón (y sus tonos), cuotas en verde azulado, Calendly en azul; las devoluciones, en arcilla
export const COLOR_FUENTE = {
  horas: '#4b3828', horas_aparte: '#6B5848', cuota: '#2F7D6D', calendly: '#5B7FB8', extras: '#B8895F',
  factura_manual: '#8A6A4F', fianza: '#A39A91', otro: '#A39A91',
}
export const COLOR_DEVOLUCION = '#B5654A'
// Gastos: un color por grupo (fijos azul, variables arena, material verde azulado)
export const COLOR_GRUPO = { fijo: '#5B7FB8', variable: '#B8895F', material: '#2F7D6D' }

const METODO_TEXTO = {
  ...Object.fromEntries(METODOS_CUOTA), ...Object.fromEntries(METODOS_INGRESO), ...Object.fromEntries(METODOS_GASTO),
  tarjeta: 'Tarjeta', stripe: 'Stripe', plan: 'Incluida en el plan', domiciliacion: 'Domiciliación', redsys: 'Tarjeta', addon: 'Tarjeta',
}
export const textoMetodo = (m) => (m ? METODO_TEXTO[m] || m.charAt(0).toUpperCase() + m.slice(1) : 'Sin indicar')

// Clases de factura. Cobros: completa (AR-W), simplificada (AR-S), manual (AR-M), stripe (la hace Stripe),
// rectificativa (devolución de algo ya facturado: hay que hacerla a mano), sin (falta), no_lleva (fianzas).
// Gastos: con (factura con el NIF del estudio), ticket (sin NIF), sin_iva (seguro, banco…), extranjero.
export const TEXTO_FACTURA = {
  completa: 'Factura completa', simplificada: 'Ticket', manual: 'Factura a mano', stripe: 'Stripe', rectificativa: 'Rectificativa pendiente',
  sin: 'Sin factura', no_lleva: 'No lleva', con: 'Con factura', ticket: 'Ticket sin NIF', sin_iva: 'No lleva IVA', extranjero: 'Empresa de fuera',
}
// Cuenta como «con factura» en el filtro
const CON_FACTURA = new Set(['completa', 'simplificada', 'manual', 'stripe', 'con', 'extranjero', 'sin_iva'])

const fechaCorta = (f) => {
  if (!f) return ''
  const [, m, d] = f.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

function facturaDeCobro(m) {
  if (m.sentido === 'devolucion') {
    if (m.rectificar) return { clase: 'rectificativa', codigo: m.factura, id: m.facturaId }
    return { clase: m.fuente === 'calendly' ? 'stripe' : 'sin', codigo: null, id: null }
  }
  if (m.fuente === 'fianza') return { clase: 'no_lleva', codigo: null, id: null }
  if (m.fuente === 'calendly') return { clase: 'stripe', codigo: null, id: null }
  if (m.fuente === 'factura_manual' || ((m.fuente === 'extras' || m.fuente === 'otro') && m.factura)) return { clase: 'manual', codigo: m.factura || m.ref || null, id: null }
  if (m.factura) return { clase: m.facturaTipo === 'simplificada' ? 'simplificada' : 'completa', codigo: m.factura, id: m.facturaId || null }
  if (m.metodo === 'stripe') return { clase: 'stripe', codigo: null, id: null }
  // Reservas y cuotas la llevan siempre (falta: aviso); lo apuntado a mano, solo si se hizo
  return { clase: 'sin', codigo: null, id: null, falta: ['horas', 'horas_aparte', 'cuota'].includes(m.fuente) }
}

function conceptoDeCobro(m) {
  const devo = m.sentido === 'devolucion'
  let base
  if (m.fuente === 'horas') base = m.fechaServicio ? `Reserva del ${fechaCorta(m.fechaServicio)}` : `Reserva ${m.ref}`
  else if (m.fuente === 'horas_aparte') base = m.fechaServicio ? `Horas aparte · sesión del ${fechaCorta(m.fechaServicio)}` : `Horas aparte ${m.ref}`
  else if (m.fuente === 'cuota') {
    const plan = PLANES[m.plan]?.nombre
    base = `Cuota${plan ? ` ${plan}` : ''}${m.periodo ? ` · mes ${m.periodo}` : ''}`
  } else base = m.texto
  return devo ? `Devolución · ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base
}

export function deCobro(m) {
  const devo = m.sentido === 'devolucion'
  const factura = facturaDeCobro(m)
  return {
    id: m.clave,
    fecha: m.fecha,
    tipo: devo ? 'devolucion' : 'cobro',
    entra: !devo,
    concepto: conceptoDeCobro(m),
    quien: m.fuente === 'calendly' ? 'Stripe · Calendly' : m.cliente || '',
    nif: m.nif || '',
    categoria: devo
      ? { clave: 'devolucion', nombre: 'Devoluciones', color: COLOR_DEVOLUCION, lado: 'entra' }
      : { clave: `f:${m.fuente}`, nombre: TEXTO_FUENTE[m.fuente] || 'Otros ingresos', color: COLOR_FUENTE[m.fuente] || '#A39A91', lado: 'entra' },
    fuente: m.fuente,
    metodo: textoMetodo(m.metodo),
    metodoClave: m.metodo || 'sin',
    factura: { ...factura, texto: TEXTO_FACTURA[factura.clase] },
    totalCent: m.totalCent,
    baseCent: m.baseCent,
    ivaCent: m.ivaCent,
    ivaPct: m.ivaPct ?? null,
    fechaServicio: m.fechaServicio || null,
    ref: m.ref || '',
    fijo: false,
    anulado: false,
    enlace: m.enlace || null,
    origen: m.origen || null,
    chip: m.chip || null,
  }
}

export function deGasto(g, hoy) {
  const clase = g.tipoFactura === 'nif' ? 'con' : g.tipoFactura
  return {
    id: `g${g.id}`,
    fecha: g.fecha,
    tipo: 'gasto',
    entra: false,
    concepto: g.concepto || g.categoria,
    quien: g.proveedor || '',
    nif: '',
    categoria: { clave: `c:${g.categoriaId}`, nombre: g.categoria, color: COLOR_GRUPO[g.grupo] || '#A39A91', lado: 'sale', grupo: g.grupo },
    metodo: textoMetodo(g.metodoPago),
    metodoClave: g.metodoPago || 'sin',
    factura: { clase, codigo: g.numFactura || null, id: null, texto: TEXTO_FACTURA[clase] || 'Con factura' },
    totalCent: g.totalCent,
    baseCent: g.baseCent,
    ivaCent: g.ivaCent,
    ivaPct: g.ivaPct ?? null,
    costeCent: C.costeGasto(g),
    retencionCent: g.retencionCent || 0,
    retencionPct: g.retencionPct || 0,
    proveedor: g.proveedor || '',
    numFactura: g.numFactura || '',
    enlaceFactura: g.enlace || null,
    nota: g.nota || '',
    fijo: Boolean(g.fijoId),
    porPagar: Boolean(g.fijoId && g.fecha > hoy && g.estado === 'apuntado'),
    editado: Boolean(g.editado),
    calendly: Boolean(g.calendlyMes),
    anulado: g.estado === 'anulado',
    enlace: `/admin/movimientos/gastos/${g.id}`,
    origen: { tipo: 'gasto', id: g.id },
  }
}

// Del más reciente al más antiguo
export const ordenar = (a, b) => (a.fecha === b.fecha ? (a.id < b.id ? 1 : -1) : a.fecha < b.fecha ? 1 : -1)

// Totales con IVA de una lista: Entra (cobros), Sale (devoluciones y gastos)
export function totalesDe(lista) {
  let entra = 0
  let sale = 0
  for (const m of lista) {
    if (m.anulado) continue
    if (m.entra) entra += m.totalCent
    else sale += m.totalCent
  }
  return { n: lista.filter((m) => !m.anulado).length, entraCent: entra, saleCent: sale, diferenciaCent: entra - sale }
}

// Filtros de la pantalla (los mismos en el servidor, para las pruebas, y en el navegador)
//   f: { q, tipo: 'todos'|'entra'|'sale'|'fijos', cat: 'todas'|clave, metodo: 'todos'|clave, factura: 'todas'|'completa'|'simplificada'|'con'|'sin'|'rectificativa', anulados }
export function filtrar(lista, f = {}) {
  const q = String(f.q || '').trim().toLowerCase()
  const qNum = q.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')
  return lista.filter((m) => {
    if (m.anulado && !f.anulados) return false
    if (f.tipo === 'entra' && !m.entra) return false
    if (f.tipo === 'sale' && m.entra) return false
    if (f.tipo === 'fijos' && !m.fijo) return false
    if (f.cat && f.cat !== 'todas' && m.categoria.clave !== f.cat) return false
    if (f.metodo && f.metodo !== 'todos' && m.metodoClave !== f.metodo) return false
    if (f.factura && f.factura !== 'todas') {
      const c = m.factura.clase
      if (f.factura === 'con' && !CON_FACTURA.has(c)) return false
      if (f.factura === 'sin' && CON_FACTURA.has(c)) return false
      if (['completa', 'simplificada', 'rectificativa'].includes(f.factura) && c !== f.factura) return false
    }
    if (q) {
      const texto = [m.concepto, m.quien, m.factura.codigo, m.ref, m.metodo, m.nif].filter(Boolean).join(' ').toLowerCase()
      const importe = (m.totalCent / 100).toFixed(2)
      if (!texto.includes(q) && !(qNum && /^\d+(\.\d{1,2})?$/.test(qNum) && importe.startsWith(qNum))) return false
    }
    return true
  })
}

// Meses que se pueden elegir en el selector (de «desde» a hoy, el más reciente primero)
export function mesesElegibles(desde, hoy) {
  const r = []
  for (let m = C.mesDe(hoy); m >= desde; m = C.sumarMesesMes(m, -1)) r.push(m)
  return r
}
