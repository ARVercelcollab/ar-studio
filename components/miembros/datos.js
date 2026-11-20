// Área de miembros · pasa lo que devuelven datosArea() y datosReservar() (lib/miembros/area.js)
// a la forma que pintan las pantallas. Acepta también la forma de la página de muestra, así
// un campo de más o de menos no rompe nada.

const lista = (x) => (Array.isArray(x) ? x : [])

export function deArea(d = {}) {
  const tarjeta = d.tarjeta || null
  const contrato = d.contrato || null
  return {
    miembro: d.miembro || { nombre: d.nombre || '', email: d.email || '' },
    suscripcion: d.suscripcion || {},
    periodo: d.periodo || null,
    siguientePeriodo: d.siguientePeriodo || null,
    proximas: lista(d.proximas ?? d.sesiones?.proximas),
    pasadas: lista(d.pasadas ?? d.sesiones?.pasadas),
    avisos: lista(d.avisos).map((a) => {
      const t = a.transferencia || {}
      return {
        ...a,
        boton: a.boton || a.textoEnlace || null,
        iban: a.iban ?? t.iban ?? null,
        titular: a.titular ?? t.titular ?? null,
        importeTexto: a.importeTexto ?? t.importeTexto ?? null,
        concepto: a.concepto ?? t.concepto ?? null,
      }
    }),
    cuotas: lista(d.cuotas).map((c) => ({ ...c, texto: c.texto || c.periodoTexto })),
    facturasExtra: lista(d.facturasExtra?.length ? d.facturasExtra : d.facturasSesiones ?? d.facturas),
    contrato: contrato ? { ...contrato, firmado: contrato.firmado ?? contrato.estado === 'firmado' } : null,
    tarjeta,
    cobroAutomatico: Boolean(d.cobroAutomatico ?? tarjeta?.cobroAutomatico),
  }
}

// Duraciones: [4] o [{ horas: 4, texto: '4 h' }] -> [{ horas, texto }]
function duraciones(x) {
  const vistas = new Set()
  return lista(x)
    .map((v) => (typeof v === 'object' ? { horas: Number(v.horas), texto: v.texto || null } : { horas: Number(v), texto: null }))
    .filter((v) => v.horas > 0 && !vistas.has(v.horas) && vistas.add(v.horas))
    .sort((a, b) => a.horas - b.horas)
}

export function deReservar(d = {}) {
  const sus = { ...d, ...(d.suscripcion || {}) }
  const dur = duraciones(d.duraciones || sus.duraciones)
  const porDefecto = d.cambiando?.horas ?? d.duracionPorDefecto ?? null
  return {
    planNombre: sus.planNombre || null,
    franjaDesde: sus.franjaDesde || null,
    franjaHasta: sus.franjaHasta || null,
    antelacionH: sus.antelacionH || null,
    duraciones: dur,
    horasIniciales: dur.length === 1 ? dur[0].horas : dur.some((x) => x.horas === Number(porDefecto)) ? Number(porDefecto) : null,
    primerDia: d.primerDia || d.desde || null,
    ultimoDia: d.ultimoDia || d.hasta || null,
    periodos: lista(d.periodos),
    cambiando: d.cambiando || null,
    puedeReservar: (d.puedeReservar ?? sus.puedeReservar) !== false,
    motivoNoReservar: d.motivoNoReservar ?? sus.motivoNoReservar ?? null,
  }
}
