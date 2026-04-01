import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.karrotmarket.com',
      },
      {
        protocol: 'https',
        hostname: '**.daangn.com',
      },
    ],
  },
}

export default nextConfig
