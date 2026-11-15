import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync } from 'node:fs'

// Schreibt beim Build einen kleinen Service Worker mit der Liste aller Dateien,
// damit die App nach dem ersten Laden komplett offline läuft.
function offlinePlugin(): Plugin {
  return {
    name: 'puzzlestube-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      // alles aus public gehört dazu, von den Galeriefotos aber nur die kleinen Vorschauen.
      // Die großen Fotos kommen erst in den Speicher, wenn man sie einmal geöffnet hat.
      const extra = ['./', ...(readdirSync('public', { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => `${d.parentPath}/${d.name}`.split('\\').join('/').replace(/^public\//, '')).filter((f) => !f.startsWith('galerie/') || f.endsWith('-k.jpg')))]
      const version = Date.now().toString(36)
      const source = `const CACHE = 'puzzlestube-${version}';
const FILES = ${JSON.stringify([...extra, ...files])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && url.pathname.includes('/galerie/')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./')))
  );
});
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), offlinePlugin()],
  server: { port: 5183, strictPort: true },
  build: { chunkSizeWarningLimit: 1200 },
})
