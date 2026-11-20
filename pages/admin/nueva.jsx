// «Nueva reserva» vive ahora en Añadir › Formulario › Reserva. Esta dirección se queda para los
// enlaces de antes (/admin/nueva?suscripcion=ID, ?modo=suscripcion…) y lleva allí con lo mismo.
export default function NuevaReserva() {
  return null
}

export async function getServerSideProps(ctx) {
  const q = new URLSearchParams()
  q.set('tipo', 'reserva')
  for (const [k, v] of Object.entries(ctx.query || {})) {
    if (k === 'tipo') continue
    if (typeof v === 'string') q.set(k, v)
  }
  return { redirect: { destination: `/admin/anadir?${q.toString()}`, permanent: false } }
}
