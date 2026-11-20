// Importar el CSV de Calendly: { csv, zona: 'madrid' | 'invitado', confirmar }
// Sin confirmar: solo el resumen (no toca nada). Con confirmar: importa (ver lib/reservas/calendly-importar.js).
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { analizarCsv, importarCsv, paraPantalla } from '../../../../lib/reservas/calendly-importar.js'

// El archivo llega como texto dentro del JSON (hasta 3 MB de CSV; Vercel corta a 4,5 MB)
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  const zona = b.zona === 'invitado' ? 'invitado' : 'madrid'
  if (!b.confirmar) {
    return res.status(200).json(paraPantalla(await analizarCsv(b.csv, { zona })))
  }
  res.status(200).json(await importarCsv(b.csv, { zona }))
}, { calendario: false })
