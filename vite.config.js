import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // ON AJOUTE CETTE SECTION 'build'
  build: {
    // On cible des navigateurs plus modernes qui comprennent le "top-level await"
    target: 'es2022' 
  },
  plugins: [react()],
})
