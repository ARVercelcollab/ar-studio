// Elige el TPV con PAGOS_PROVEEDOR: 'redsys', 'addon' o 'simulado'.
// Para pasar de uno a otro basta con cambiar las variables de entorno: las
// reservas, el panel y los correos no dependen del TPV.

import { redsys } from './redsys.js'
import { addon } from './addon.js'
import { simulado } from './simulado.js'

const PROVEEDORES = { redsys, addon, simulado }

export function proveedorPorId(id) {
  const p = PROVEEDORES[id]
  if (!p) throw new Error(`TPV desconocido: ${id}`)
  return p
}

export function proveedorActivo() {
  const id = process.env.PAGOS_PROVEEDOR || (process.env.VERCEL_ENV === 'production' ? '' : 'simulado')
  if (!id) throw new Error('Falta PAGOS_PROVEEDOR (redsys o addon)')
  return proveedorPorId(id)
}
