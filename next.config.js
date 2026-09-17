/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Miniaturas de YouTube en la página del plan mensual
    remotePatterns: [{ protocol: 'https', hostname: 'i.ytimg.com' }],
  },
  async redirects() {
    return [
      // La landing de membresías vivió en /membresias; conservamos la URL antigua
      { source: '/membresias', destination: '/planmensual', permanent: true },
    ]
  },
}

module.exports = nextConfig
