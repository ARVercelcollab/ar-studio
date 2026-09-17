/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // La landing de membresías vivió en /membresias; conservamos la URL antigua
      { source: '/membresias', destination: '/planmensual', permanent: true },
    ]
  },
}

module.exports = nextConfig
