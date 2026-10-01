import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  server: { port: 5173, strictPort: true },
  // The spreadsheet library (~940 kB) is its own chunk, loaded only when you download an .xlsx.
  build: { chunkSizeWarningLimit: 1000 },
  // Pre-bundle everything up front so Vite never re-optimises mid-session
  // (that can briefly serve two copies of React: "Invalid hook call").
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'zustand', 'immer', 'd3-zoom', 'd3-selection', 'exceljs'],
  },
});
