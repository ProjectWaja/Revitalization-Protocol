import type { NextConfig } from 'next'
import { join } from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '..'),
  serverExternalPackages: ['viem'],
}

export default nextConfig
