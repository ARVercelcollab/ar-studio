/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sin el indicador "N" de herramientas de desarrollo en la esquina
  devIndicators: false,
  // PGlite (Postgres local para desarrollo) y pg se cargan tal cual, sin empaquetar
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  images: {
    // Miniaturas de YouTube en la página del plan mensual
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com' }],
  },
  async redirects() {
    return [
      // La landing de membresías vivió en /membresias; conservamos la URL antigua
      { source: '/membresias', destination: '/planmensual', permanent: true },
      // Panel: las secciones cambiaron de nombre (20-11-2026). Los enlaces antiguos (correos,
      // favoritos) siguen funcionando. Lo más concreto va primero.
      { source: '/admin/agenda', destination: '/admin/reservas', permanent: true },
      { source: '/admin/suscripciones/:ruta*', destination: '/admin/miembros/:ruta*', permanent: true },
      { source: '/admin/finanzas/fijos', destination: '/admin/ajustes/fijos', permanent: true },
      { source: '/admin/finanzas/calendly', destination: '/admin/ajustes/calendly', permanent: true },
      { source: '/admin/finanzas/ingresos/:ruta*', destination: '/admin/movimientos/ingresos/:ruta*', permanent: true },
      { source: '/admin/finanzas/gastos/:ruta*', destination: '/admin/movimientos/gastos/:ruta*', permanent: true },
      { source: '/admin/finanzas', destination: '/admin/movimientos', permanent: true },
      { source: '/admin/google', destination: '/admin/ajustes/google', permanent: true },
      { source: '/admin/festivos', destination: '/admin/ajustes/festivos', permanent: true },
      { source: '/admin/bloqueos', destination: '/admin/ajustes/bloqueos', permanent: true },
    ]
  },
}

module.exports = nextConfig
