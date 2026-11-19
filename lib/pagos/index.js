// Elige el TPV con PAGOS_PROVEEDOR: 'redsys', 'addon' o 'simulado'.
// Para pasar de uno a otro basta con cambiar las variables de entorno: las
// reservas, el panel y los correos no dependen del TPV.

import { redsys } from './redsys.js'
import { addon } from './addon.js'
import { simulado } from './simulado.js'
import { baseDeProduccion } from '../db/index.js'

const PROVEEDORES = { redsys, addon, simulado }

export function proveedorPorId(id) {
  const p = PROVEEDORES[id]
  if (!p) throw new Error(`TPV desconocido: ${id}`)
  return p
}

// Un TPV de pruebas (simulado o en modo pruebas) nunca puede confirmar reservas en la web
// de producción ni en una base de datos marcada como de producción.
export async function comprobarProveedor(proveedor) {
  if (!proveedor.esDePrueba()) return proveedor
  if (process.env.VERCEL_ENV === 'production' || (await baseDeProduccion())) {
    throw new Error(`El TPV ${proveedor.nombre} está en modo pruebas y esta es la base de datos de producción`)
  }
  return proveedor
}

export function proveedorActivo() {
  const id = process.env.PAGOS_PROVEEDOR || (process.env.VERCEL_ENV === 'production' ? '' : 'simulado')
  if (!id) throw new Error('Falta PAGOS_PROVEEDOR (redsys o addon)')
  return proveedorPorId(id)
}

// Cobro mensual automático con la tarjeta guardada: solo si el TPV lo sabe hacer y está
// activado (REDSYS_COBRO_RECURRENTE=1; Comercia tiene que activar el «pago por referencia»)
export function cobroRecurrente(proveedor) {
  return typeof proveedor?.cobrarMit === 'function' && process.env.REDSYS_COBRO_RECURRENTE === '1'
}
