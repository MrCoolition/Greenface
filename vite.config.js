import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { geography: ['./src/lib/maps.js'], react: ['react', 'react-dom'] } } } },
});
