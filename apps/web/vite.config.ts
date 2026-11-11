import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Content Security Policy for the built app: code, data and connections only
 * from the app's own address. If someone ever slips a script or a link into a
 * pattern, the browser refuses to run it or to send the user's data elsewhere.
 * Only for the build: the dev server needs inline scripts for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'lecals-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
})

export default defineConfig({
  // Relative base: the build works from any folder or sub-path.
  base: './',
  plugins: [react(), csp()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
})
