// CSV para la gestoría (Excel en español): separador ';', coma decimal y fechas DD/MM/AAAA.
// Los textos que empiezan por = + - @ llevan ' delante para que Excel no los tome por fórmulas.

import { fechaDdMmAaaa } from '../reservas/tiempo.js'

export function textoCsv(v) {
  let t = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function numeroCsv(cent) {
  if (cent === null || cent === undefined || cent === '') return ''
  const neg = cent < 0
  const abs = Math.abs(Math.round(cent))
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export const fechaCsv = (f) => (f ? fechaDdMmAaaa(f) : '')

// columnas: [['Cabecera', (fila) => valor, 'texto' | 'numero' | 'crudo'], ...]
export function aCsv(columnas, filas) {
  const lineas = [columnas.map(([c]) => textoCsv(c)).join(';')]
  for (const f of filas) {
    lineas.push(columnas.map(([, valor, tipo = 'texto']) => {
      const v = valor(f)
      if (tipo === 'numero') return numeroCsv(v)
      if (tipo === 'crudo') return v === null || v === undefined ? '' : String(v)
      return textoCsv(v)
    }).join(';'))
  }
  return `${lineas.join('\r\n')}\r\n`
}
