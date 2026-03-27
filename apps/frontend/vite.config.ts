import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import svgr from 'vite-plugin-svgr'

function includesAny(id: string, markers: string[]) {
  return markers.some((marker) => id.includes(marker))
}

function getVendorChunkName(id: string) {
  if (!id.includes('node_modules')) {
    return undefined
  }

  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('/scheduler/')
  ) {
    return 'vendor-react'
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

  if (
    id.includes('/@ant-design/icons/') ||
    id.includes('/@ant-design/icons-svg/')
  ) {
    return 'vendor-antd-icons'
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

  if (id.includes('/@babel/runtime/')) {
    return 'vendor-babel'
  }

  if (
    includesAny(id, [
      '/antd/es/app/',
      '/antd/es/config-provider/',
      '/antd/es/avatar/',
      '/antd/es/layout/',
      '/antd/es/menu/',
      '/antd/es/modal/',
      '/antd/es/skeleton/',
      '/antd/es/spin/',
      '/antd/es/theme/',
      '/antd/es/style/',
      '/antd/es/_util/',
      '/antd/es/grid/',
    ]) ||
    id.includes('/@ant-design/fast-color/')
  ) {
    return 'vendor-antd-shell'
  }

  if (
    includesAny(id, [
      '/antd/es/date-picker/',
      '/antd/es/input/',
      '/antd/es/form/',
      '/antd/es/select/',
      '/antd/es/upload/',
      '/antd/es/steps/',
      '/antd/es/tabs/',
      '/antd/es/progress/',
      '/antd/es/radio/',
      '/antd/es/input-number/',
      '/antd/es/checkbox/',
      '/antd/es/slider/',
      '/antd/es/calendar/',
    ])
  ) {
    return 'vendor-antd-forms'
  }

  if (
    includesAny(id, [
      '/antd/es/typography/',
      '/antd/es/button/',
      '/antd/es/card/',
      '/antd/es/image/',
      '/antd/es/alert/',
      '/antd/es/tag/',
      '/antd/es/empty/',
      '/antd/es/dropdown/',
      '/antd/es/tooltip/',
      '/antd/es/popover/',
      '/antd/es/message/',
      '/antd/es/notification/',
      '/antd/es/space/',
      '/antd/es/segmented/',
    ])
  ) {
    return 'vendor-antd-content'
  }

  if (
    includesAny(id, [
      '/rc-menu/',
      '/rc-motion/',
      '/rc-dialog/',
      '/rc-notification/',
      '/rc-overflow/',
      '/rc-dropdown/',
      '/rc-tooltip/',
      '/@rc-component/portal/',
      '/@rc-component/trigger/',
      '/@ant-design/cssinjs',
      '/@ant-design/colors/',
      '/stylis/',
      '/@emotion/hash/',
      '/@emotion/unitless/',
      '/rc-resize-observer/',
    ])
  ) {
    return 'vendor-antd-rc-shell'
  }

  if (
    includesAny(id, [
      '/rc-picker/',
      '/rc-select/',
      '/rc-field-form/',
      '/rc-tabs/',
      '/rc-slider/',
      '/rc-virtual-list/',
      '/rc-upload/',
      '/rc-input-number/',
      '/rc-input/',
      '/rc-textarea/',
      '/rc-segmented/',
      '/rc-progress/',
      '/rc-steps/',
      '/rc-checkbox/',
      '/rc-pagination/',
      '/@rc-component/async-validator/',
      '/@rc-component/mini-decimal/',
      '/@rc-component/util/',
    ])
  ) {
    return 'vendor-antd-rc-forms'
  }

  if (id.includes('/rc-image/')) {
    return 'vendor-antd-rc-media'
  }

  if (id.includes('/rc-util/')) {
    return 'vendor-antd-rc-shared'
  }

  if (id.includes('/antd/')) {
    return 'vendor-antd-core'
  }

  if (id.includes('/rc-') || id.includes('/@rc-component/')) {
    return 'vendor-antd-rc'
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
