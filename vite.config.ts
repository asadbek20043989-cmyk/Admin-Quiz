import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Three separate entry points: the admin Mini App (/), the Super Admin window (/owner.html)
// and the public certificate page (/cert.html). The admin bundle contains NO Super Admin code.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        owner: resolve(__dirname, 'owner.html'),
        cert: resolve(__dirname, 'cert.html'),
      },
    },
  },
});
