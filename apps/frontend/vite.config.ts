import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import svgr from 'vite-plugin-svgr'

function getVendorChunkName(id: string) {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (
    id.includes('/@tanstack/react-router/') ||
    id.includes('/@tanstack/router-core/') ||
    id.includes('/@tanstack/history/')
  ) {
    return 'vendor-router'
  }

  if (
    id.includes('/@tanstack/react-query/') ||
    id.includes('/@tanstack/query-core/') ||
    id.includes('/@tanstack/react-router-ssr-query/')
  ) {
    return 'vendor-query'
  }

  if (id.includes('/recharts/') || id.includes('/d3-')) {
    return 'vendor-charts'
  }

  if (
    id.includes('/axios/') ||
    id.includes('/openapi-fetch/') ||
    id.includes('/openapi-react-query/')
  ) {
    return 'vendor-api'
  }

  if (id.includes('/dayjs/')) {
    return 'vendor-dayjs'
  }

  return undefined
}

const config = defineConfig(({ isSsrBuild }) => ({
  build: {
    sourcemap: true,
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks: getVendorChunkName,
          },
        },
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    svgr(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      'react-router-dom': fileURLToPath(
        new URL('./src/lib/router/react-router-dom-compat.tsx', import.meta.url)
      ),
    },
  },
}))

export default config
