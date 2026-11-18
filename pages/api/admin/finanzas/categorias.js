// Categorías de gasto
import { rutaAdmin } from '../../../../lib/admin/api.js'
import { crearCategoria, editarCategoria, mostrarCategoria } from '../../../../lib/finanzas/servicio.js'

export default rutaAdmin(async (req, res) => {
  const b = req.body || {}
  switch (b.accion) {
    case 'crear': {
      const r = await crearCategoria(b)
      return res.status(200).json({ ok: true, id: r.id, mensaje: 'Categoría guardada.' })
    }
    case 'editar':
      await editarCategoria(b.id, b)
      return res.status(200).json({ ok: true, mensaje: 'Categoría guardada.' })
    case 'ocultar':
    case 'mostrar':
      await mostrarCategoria(b.id, b.accion === 'mostrar')
      return res.status(200).json({ ok: true, mensaje: b.accion === 'mostrar' ? 'Vuelve a salir al apuntar.' : 'Ya no sale al apuntar.' })
    default:
      return res.status(400).json({ error: 'accion', mensaje: 'Acción desconocida.' })
  }
})
