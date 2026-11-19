// PDF del contrato de suscripción firmado, con el mismo estilo limpio que las facturas.
// Lleva la firma dibujada de la persona, la fecha y hora de la firma, la versión del texto
// y la huella cifrada de la conexión (nunca la IP).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { LOGO_PNG_BASE64 } from '../facturas/logo.js'
import { contratoSecciones } from './contrato.js'
import { fechaMadrid, horaMadrid, textoFecha } from '../reservas/tiempo.js'

const NEGRO = rgb(0.14, 0.13, 0.12)
const GRIS = rgb(0.45, 0.43, 0.41)
const LINEA = rgb(0.85, 0.84, 0.82)
const A4 = [595.28, 841.89]
const IZQ = 56
const DER = 539
const ARRIBA = 785
const ABAJO = 70

// Las fuentes estándar del PDF solo tienen caracteres europeos occidentales
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

// contrato: { version, firmadoEn (ISO), huella, datos, firmaPng (base64) }
// c: condiciones de la suscripción; codigo: el de la suscripción
export async function pdfContrato({ c, codigo, contrato, estudio, iban }) {
  const firmadoEn = new Date(contrato.firmadoEn)
  const fecha = fechaMadrid(firmadoEn)
  const t = contratoSecciones({ c, persona: contrato.datos, codigo, fecha, estudio, iban })
  const doc = await PDFDocument.create()
  doc.setTitle(`Contrato de suscripción ${codigo}`)
  doc.setAuthor('AR Studio')
  doc.setCreator('AR Studio')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'))
  const firma = contrato.firmaPng ? await doc.embedPng(Buffer.from(contrato.firmaPng, 'base64')) : null

  let pagina
  let y
  const paginas = []
  const nueva = () => {
    pagina = doc.addPage(A4)
    paginas.push(pagina)
    y = ARRIBA
  }
  const escribir = (texto, x, yy, { tam = 9.5, fuente = normal, color = NEGRO, derecha = false } = {}) => {
    const s = seguro(fuente, texto)
    const ancho = fuente.widthOfTextAtSize(s, tam)
    pagina.drawText(s, { x: derecha ? x - ancho : x, y: yy, size: tam, font: fuente, color })
  }
  const partir = (texto, ancho, tam, fuente = normal) => {
    const lineas = []
    let actual = ''
    for (const p of seguro(fuente, texto).split(' ')) {
      const prueba = actual ? `${actual} ${p}` : p
      if (fuente.widthOfTextAtSize(prueba, tam) > ancho && actual) {
        lineas.push(actual)
        actual = p
      } else actual = prueba
    }
    if (actual) lineas.push(actual)
    return lineas
  }
  const sitio = (alto) => {
    if (y - alto < ABAJO) nueva()
  }
  const parrafo = (texto, { tam = 9.5, fuente = normal, color = NEGRO, sangria = 0, despues = 7, interlinea = 13 } = {}) => {
    for (const l of partir(texto, DER - IZQ - sangria, tam, fuente)) {
      sitio(interlinea)
      escribir(l, IZQ + sangria, y, { tam, fuente, color })
      y -= interlinea
    }
    y -= despues
  }

  // Cabecera
  nueva()
  escribir(t.titulo, IZQ, y - 8, { tam: 22, fuente: negrita })
  pagina.drawImage(logo, { x: DER - 54, y: y - 30, width: 54, height: 54 })
  y -= 30
  escribir(t.subtitulo, IZQ, y, { tam: 10, color: GRIS })
  y -= 26
  parrafo(t.lugarFecha)

  for (const parte of t.partes) {
    parrafo(parte.titulo, { fuente: negrita, despues: 3 })
    if (parte.texto) parrafo(parte.texto)
    for (const [k, v] of parte.lineas || []) {
      sitio(14)
      escribir(`${k}:`, IZQ, y, { fuente: negrita, tam: 9.5 })
      for (const [i, l] of partir(v, DER - IZQ - 120, 9.5).entries()) {
        if (i) {
          y -= 13
          sitio(13)
        }
        escribir(l, IZQ + 120, y)
      }
      y -= 14
    }
    y -= 6
  }
  parrafo(t.intro)

  for (const cl of t.clausulas) {
    sitio(40)
    parrafo(cl.titulo, { fuente: negrita, tam: 10.5, despues: 4 })
    for (const p of cl.parrafos) parrafo(p)
    for (const item of cl.lista || []) parrafo(`·  ${item}`, { sangria: 10, despues: 2 })
    if (cl.lista) y -= 5
  }
  parrafo(t.cierre)

  // Firmas
  sitio(150)
  y -= 6
  const col2 = 310
  escribir(t.firmas.estudio.titulo, IZQ, y, { fuente: negrita })
  escribir(t.firmas.persona.titulo, col2, y, { fuente: negrita })
  const alto = 70
  if (firma) {
    const escala = Math.min((DER - col2) / firma.width, alto / firma.height)
    pagina.drawImage(firma, { x: col2, y: y - 12 - firma.height * escala, width: firma.width * escala, height: firma.height * escala })
  }
  y -= 12 + alto + 8
  pagina.drawLine({ start: { x: IZQ, y }, end: { x: IZQ + 200, y }, thickness: 0.6, color: LINEA })
  pagina.drawLine({ start: { x: col2, y }, end: { x: DER, y }, thickness: 0.6, color: LINEA })
  y -= 14
  escribir(t.firmas.estudio.nombre, IZQ, y)
  escribir(t.firmas.persona.nombre || '', col2, y)
  y -= 13
  if (t.firmas.persona.documento) escribir(`DNI/NIE: ${t.firmas.persona.documento}`, col2, y)
  y -= 24
  parrafo(`Firmado electrónicamente por LA PERSONA SUSCRIPTORA el ${textoFecha(fecha).replace(/^[a-záéíóúñ]+, /i, '')} a las ${horaMadrid(firmadoEn)} (hora de Madrid) en la web de AR Studio. Versión del contrato: ${contrato.version}. Huella de la conexión: ${contrato.huella || '—'}.`, { tam: 8, color: GRIS })

  // Pie en todas las páginas
  paginas.forEach((pg, i) => {
    pg.drawLine({ start: { x: IZQ, y: 50 }, end: { x: DER, y: 50 }, thickness: 0.6, color: LINEA })
    const pie = seguro(normal, `AR Studio · Contrato de suscripción ${codigo} · versión ${contrato.version}`)
    pg.drawText(pie, { x: IZQ, y: 38, size: 8, font: normal, color: GRIS })
    const num = `${i + 1} / ${paginas.length}`
    pg.drawText(num, { x: DER - normal.widthOfTextAtSize(num, 8), y: 38, size: 8, font: normal, color: GRIS })
  })

  return Buffer.from(await doc.save())
}
