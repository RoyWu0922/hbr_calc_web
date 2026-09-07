import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { allowedHosts: ['afsgtool.top', '.afsgtool.top', '106.55.39.223', 'localhost'] },
  preview: { allowedHosts: ['afsgtool.top', '.afsgtool.top', '106.55.39.223', 'localhost'] },
  // base defaults to '/'. GitHub Pages overrides via --base /hbr_calc_web/
})
