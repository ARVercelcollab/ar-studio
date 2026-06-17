/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/membresias', destination: '/membresias/index.html' },
    ]
  },
}

module.exports = nextConfig
