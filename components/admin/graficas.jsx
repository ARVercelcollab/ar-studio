// Importes del panel con «Ocultar importes»: el contexto que comparte todo el panel (lo da el
// armazón, components/admin/Panel.jsx) y el formato de euros sin céntimos de las cifras grandes.

import { createContext, useContext } from 'react'
import { euros } from '../../lib/finanzas/calculos'

export const ImportesOcultos = createContext(false)

// Céntimos redondeados a euros enteros (en céntimos). Un beneficio que se enseña se calcula
// con los dos importes ya redondeados, así cuadra con lo que se lee: 123 € − 46 € = 77 €
export const aEuros = (cent) => (cent === null || cent === undefined ? cent : Math.round(cent / 100) * 100)

// Euros sin céntimos (las cifras con céntimos están en Movimientos).
// signo: «+344 €» en los positivos
export function useEuros() {
  const oculto = useContext(ImportesOcultos)
  return (cent, { signo = false } = {}) => {
    if (cent === null || cent === undefined) return euros(cent)
    if (oculto) return '••• €'
    const redondo = aEuros(cent)
    return `${signo && redondo > 0 ? '+' : ''}${euros(redondo)}`
  }
}
