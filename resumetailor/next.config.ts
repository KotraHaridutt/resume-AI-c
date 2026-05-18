// next.config.ts — FINAL VERSION (merge of both)
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Prevents pdf-parse from being bundled by webpack (needs Node.js fs module)
  serverExternalPackages: ['pdf-parse-fork'],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevents react-pdf from being bundled in the server build
      // react-pdf uses browser APIs (canvas, etc.) not available server-side
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        '@react-pdf/renderer',
        'canvas',
      ]
    }
    return config
  },

  // Turbopack config (Next.js 16 uses Turbopack by default)
  turbopack: {},
}

export default nextConfig