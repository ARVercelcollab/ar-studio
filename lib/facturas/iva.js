// IVA de lo que cobra el estudio (funciones puras: las usan las facturas y Finanzas, también
// en el navegador)

export const IVA_PCT = 21

// Precio con IVA incluido -> base e IVA (en céntimos)
export function desglose(totalCent, ivaPct = IVA_PCT) {
  const base = Math.round((totalCent * 100) / (100 + ivaPct))
  return { baseCent: base, ivaCent: totalCent - base, totalCent }
}
