import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // Cible des navigateurs modernes pour résoudre l'erreur "top-level await"
    target: 'es2022' 
  },
  plugins: [react()],
})
