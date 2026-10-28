/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/ThreatFeed/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
