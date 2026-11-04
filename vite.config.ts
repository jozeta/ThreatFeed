/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The Content-Security-Policy of the built site (GitHub Pages can't send headers, so it is a meta tag).
// Only scripts and fonts are locked to this origin. Feeds and article images come from any https site
// (directly, through the CORS proxies or a custom proxy), so connect-src and img-src stay open to https.
// React's style attributes and the TV boot style need 'unsafe-inline' for styles.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Build only: the dev server injects an inline script (React refresh) that this policy would block
const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
  ],
});

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/ThreatFeed/' : '/',
  plugins: [react(), contentSecurityPolicy()],
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
