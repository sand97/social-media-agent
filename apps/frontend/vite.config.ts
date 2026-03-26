import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import svgr from 'vite-plugin-svgr'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    server: {
      port: 5173,
      allowedHosts: ((env.VITE_ALLOWED_HOST || '') as string).split(','),
    },
    plugins: [tailwindcss(), svgr(), react(), tsconfigPaths()],
  }
})
