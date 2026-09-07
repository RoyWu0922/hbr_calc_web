import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { allowedHosts: ['afsgtool.top', '.afsgtool.top', '106.55.39.223', 'localhost'], proxy: { '/api': 'http://127.0.0.1:8123' } },
  preview: { allowedHosts: ['afsgtool.top', '.afsgtool.top', '106.55.39.223', 'localhost'], proxy: { '/api': 'http://127.0.0.1:8123' } },
  // base defaults to '/'. GitHub Pages overrides via --base /hbr_calc_web/
})
