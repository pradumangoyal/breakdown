import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Pre-bundle everything up front so Vite never re-optimises mid-session
  // (that can briefly serve two copies of React: "Invalid hook call").
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'zustand', 'immer', 'd3-zoom', 'd3-selection', 'exceljs', 'mind-elixir'],
  },
});
