// Solo navegador: manda al cliente a la página de pago del TPV con el formulario firmado
export function irAlTpv(pago) {
  const form = document.createElement('form')
  form.method = pago.metodo || 'POST'
  form.action = pago.accion
  form.style.display = 'none'
  for (const [nombre, valor] of Object.entries(pago.campos || {})) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = nombre
    input.value = valor
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

export async function pedirJson(url, opciones = {}) {
  const res = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    body: opciones.body && typeof opciones.body !== 'string' ? JSON.stringify(opciones.body) : opciones.body,
  })
  let datos = null
  try {
    datos = await res.json()
  } catch {
    datos = null
  }
  if (!res.ok) {
    const e = new Error(datos?.mensaje || 'No se ha podido completar. Inténtalo de nuevo.')
    e.estado = res.status
    e.datos = datos
    throw e
  }
  return datos
}
