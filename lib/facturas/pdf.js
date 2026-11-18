// PDF de una factura, con el mismo diseño que las facturas manuales (serie AR-M)

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { LOGO_PNG_BASE64 } from './logo.js'
import { textoFecha } from '../reservas/tiempo.js'

const NEGRO = rgb(0.14, 0.13, 0.12)
const GRIS = rgb(0.45, 0.43, 0.41)
const LINEA = rgb(0.85, 0.84, 0.82)
const A4 = [595.28, 841.89]
const IZQ = 50
const DER = 545

// Las fuentes estándar del PDF solo tienen caracteres europeos occidentales: el resto
// se aproxima (sin tildes raras) o se cambia por "?" para que la factura salga siempre.
function seguro(fuente, texto) {
  let r = ''
  for (const c of String(texto ?? '')) {
    try {
      fuente.encodeText(c)
      r += c
    } catch {
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '')
      try {
        fuente.encodeText(base)
        r += base
      } catch {
        r += '?'
      }
    }
  }
  return r
}

// Euros siempre con dos decimales
function eur(cent) {
  return (cent / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fechaLarga(fecha) {
  return textoFecha(fecha).replace(/^[a-záéíóúñ]+, /i, '')
}

export async function pdfFactura(f) {
  const doc = await PDFDocument.create()
  doc.setTitle(`Factura ${f.codigo}`)
  doc.setAuthor(f.emisor.nombre)
  doc.setCreator('AR Studio')
  const pagina = doc.addPage(A4)
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'))

  const escribir = (texto, x, y, { tam = 10, fuente = normal, color = NEGRO, derecha = false } = {}) => {
    const t = seguro(fuente, texto)
    const ancho = fuente.widthOfTextAtSize(t, tam)
    pagina.drawText(t, { x: derecha ? x - ancho : x, y, size: tam, font: fuente, color })
  }
  const partir = (texto, ancho, tam, fuente = normal) => {
    const palabras = seguro(fuente, texto).split(' ')
    const lineas = []
    let actual = ''
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p
      if (fuente.widthOfTextAtSize(prueba, tam) > ancho && actual) {
        lineas.push(actual)
        actual = p
      } else actual = prueba
    }
    if (actual) lineas.push(actual)
    return lineas
  }
  const raya = (y, x1 = IZQ, x2 = DER, grosor = 0.6, color = LINEA) =>
    pagina.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: grosor, color })

  // Cabecera
  escribir('Factura', IZQ, 760, { tam: 26, fuente: negrita })
  pagina.drawImage(logo, { x: DER - 60, y: 735, width: 60, height: 60 })
  let y = 722
  for (const [k, v] of [['Número de factura', f.codigo], ['Fecha de emisión', fechaLarga(f.fechaEmision)], ['Fecha del servicio', fechaLarga(f.fechaServicio)]]) {
    escribir(k, IZQ, y, { fuente: negrita })
    escribir(v, IZQ + 115, y)
    y -= 16
  }

  // Emisor y cliente
  const col2 = 320
  y = 640
  escribir(f.emisor.nombre, IZQ, y, { fuente: negrita })
  escribir('Facturar a', col2, y, { fuente: negrita })
  const izq = [`NIF: ${f.emisor.nif}`, ...f.emisor.direccion]
  const der = [f.cliente.nombre, `NIF/CIF: ${f.cliente.nif}`, ...partir(f.cliente.direccion, DER - col2, 10), f.cliente.email].filter(Boolean)
  for (let i = 0; i < Math.max(izq.length, der.length); i++) {
    if (izq[i]) escribir(izq[i], IZQ, y - 16 * (i + 1))
    if (der[i]) escribir(der[i], col2, y - 16 * (i + 1))
  }
  y = y - 16 * (Math.max(izq.length, der.length) + 1) - 24

  // Conceptos
  const cCant = 395
  const cPrecio = 475
  escribir('Descripción', IZQ, y, { tam: 8.5, color: GRIS })
  escribir('Cant.', cCant, y, { tam: 8.5, color: GRIS, derecha: true })
  escribir('Precio unitario', cPrecio, y, { tam: 8.5, color: GRIS, derecha: true })
  escribir('Importe', DER, y, { tam: 8.5, color: GRIS, derecha: true })
  y -= 8
  raya(y, IZQ, DER, 1, NEGRO)
  y -= 18
  for (const l of f.lineas) {
    const lineas = partir(l.descripcion, cCant - IZQ - 40, 10)
    escribir(l.cantidad, cCant, y, { derecha: true })
    escribir(eur(l.precioUnitarioCent), cPrecio, y, { derecha: true })
    escribir(eur(l.importeCent), DER, y, { derecha: true })
    for (const t of lineas) {
      escribir(t, IZQ, y)
      y -= 14
    }
    if (l.detalle) {
      escribir(l.detalle, IZQ, y, { tam: 8.5, color: GRIS })
      y -= 14
    }
    y -= 6
    raya(y)
    y -= 22
  }

  // Totales
  const tIzq = 320
  for (const [k, v, fuerte] of [['Base imponible', eur(f.baseCent)], [`IVA (${f.ivaPct}%)`, eur(f.ivaCent)], ['Total', eur(f.totalCent), true]]) {
    escribir(k, tIzq, y, { fuente: fuerte ? negrita : normal, tam: fuerte ? 11 : 10 })
    escribir(v, DER, y, { fuente: fuerte ? negrita : normal, tam: fuerte ? 11 : 10, derecha: true })
    y -= 8
    if (!fuerte) raya(y, tIzq, DER)
    y -= 18
  }

  // Pie
  raya(60)
  escribir('AR Studio · studioar.es', IZQ, 46, { tam: 8.5, color: GRIS })
  escribir(`${f.codigo} · ${eur(f.totalCent)}`, DER, 46, { tam: 8.5, color: GRIS, derecha: true })

  return Buffer.from(await doc.save())
}

