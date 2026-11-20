// Clientes: lo que no toca la base de datos (clave de cada cliente, filtros, cifras y textos).
// Lo usan el servidor (lib/reservas/clientes.js) y las páginas del panel en el navegador.

export function claveCliente({ email, telefono }) {
  const e = String(email || '').trim().toLowerCase()
  if (e) return `e:${e}`
  const t = String(telefono || '').replace(/[^0-9]/g, '')
  if (t.length >= 6) return `t:${t.slice(-9)}`
  return null
}

export function claveValida(clave) {
  return typeof clave === 'string' && /^(e:.{3,200}|t:[0-9]{6,9})$/.test(clave)
}

export function cifrasDeClientes(lista, { periodo = 'todo' } = {}) {
  const base = periodo === 'anio' ? lista.filter((c) => c.anio > 0) : lista
  const cuenta = (c) => (periodo === 'anio' ? c.anio : c.total)
  const conReservas = base.filter((c) => cuenta(c) > 0)
  return {
    clientes: base.length,
    nuevosMes: lista.filter((c) => c.nuevo).length,
    repitenPct: conReservas.length ? Math.round((conReservas.filter((c) => cuenta(c) >= 2).length / conReservas.length) * 100) : 0,
    reservasPorCliente: conReservas.length ? Math.round((conReservas.reduce((s, c) => s + cuenta(c), 0) / conReservas.length) * 10) / 10 : 0,
  }
}

const quitarTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Filtros y orden de la vista Clientes (iguales en el servidor y en el navegador)
export function filtrarClientes(lista, { q = '', periodo = 'todo', tipo = 'todos', orden = 'reservas' } = {}) {
  const texto = quitarTildes(q.trim())
  const cifrasTexto = q.replace(/[^0-9]/g, '')
  const cuenta = (c) => (periodo === 'anio' ? c.anio : c.total)
  const l = lista.filter((c) => {
    if (periodo === 'anio' && c.anio === 0 && !(c.miembro && c.nuevo)) return false
    if (tipo === 'repiten' && !c.repite) return false
    if (tipo === 'nuevos' && !c.nuevo) return false
    if (tipo === 'miembros' && !c.miembro) return false
    if (!texto) return true
    if (quitarTildes(`${c.nombre} ${c.apellidos} ${c.email}`).includes(texto)) return true
    return cifrasTexto.length >= 3 && String(c.telefono).replace(/[^0-9]/g, '').includes(cifrasTexto)
  })
  const nombre = (c) => `${c.nombre} ${c.apellidos}`
  const ORDENES = {
    reservas: (a, b) => cuenta(b) - cuenta(a) || String(b.ultima || '').localeCompare(String(a.ultima || '')),
    ultima: (a, b) => String(b.proxima || b.ultima || '').localeCompare(String(a.proxima || a.ultima || '')),
    pagado: (a, b) => b.pagadoCent - a.pagadoCent,
    nombre: (a, b) => nombre(a).localeCompare(nombre(b), 'es'),
  }
  return l.sort(ORDENES[orden] || ORDENES.reservas)
}

// «1.ª vez», «primera vez», «10.ª vez»
export function textoVez(vez) {
  if (!vez) return null
  return vez === 1 ? 'primera vez' : `${vez}.ª vez`
}
