// Funzionamento senza rete: i file dell'app vengono dalla cache, i progetti dalla copia locale (archivio.js).
const VERSIONE = 'mpm-0.16.0';
const FILE = ['./', 'index.html', 'stile.css', 'manifest.webmanifest', 'icona.svg',
  'js/app.js', 'js/archivio.js', 'js/cassetti.js', 'js/modelli.js', 'js/controlli.js', 'js/disegni.js', 'js/esporta.js', 'js/montaggio.js', 'js/sagome.js', 'js/disegno2d.js', 'js/lingua.js', 'js/lingue/en.js', 'js/lingue/fr.js', 'js/lingue/de.js', 'js/lingue/es.js', 'js/distinta.js', 'js/esempi.js', 'js/ferramenta.js', 'js/spesa.js', 'js/unioni.js', 'js/geometria.js', 'js/materiali.js', 'js/modello.js', 'js/taglio.js', 'js/vista3d.js',
  'vendor/three.module.js', 'vendor/three.core.js', 'vendor/OrbitControls.js', 'vendor/TransformControls.js', 'vendor/manifold.js', 'vendor/manifold.wasm'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // Prima la rete (così gli aggiornamenti arrivano subito), poi la cache se non c'è rete.
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(e.request, copia)); return r; })
    .catch(() => caches.match(e.request)));
});
