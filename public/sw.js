/* ═══════════════════════════════════════════════════════════
   Pet Pantry – sw.js  (service worker: offline app shell)
   ═══════════════════════════════════════════════════════════

   Scope is the directory this file is served from — /PetPantry/ on GitHub
   Pages — which covers every page including /demo/. Every path below is
   relative, so the app keeps working if it ever moves to a custom domain.

   VERSION is the cache key, and it is STAMPED AT DEPLOY TIME — the workflow
   in .github/workflows/deploy.yml rewrites the line below with git's tree
   hash for public/, which changes exactly when something served changes.
   Nobody has to remember to bump it, and a release can't ship stale.

   The literal here is only what runs when you serve this directory yourself.
   Leave the line's shape alone: the deploy greps for it afterwards and fails
   the build if the rewrite didn't take.

   Activating a new version deletes every older cache, so the next load
   refetches the shell from the network.
═══════════════════════════════════════════════════════════ */

const VERSION = 'dev';
const SHELL_CACHE = `pp-shell-v${VERSION}`;
const VENDOR_CACHE = `pp-vendor-v${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, VENDOR_CACHE];

// The app shell: enough to open any page and render its chrome with no network.
// pm.html is deliberately absent — it is internal tooling, not product surface,
// and it is the largest page in the repo.
const SHELL = [
  './',
  'index.html',
  'app.html',
  'inventory.html',
  'meals.html',
  'pets.html',
  'profile.html',
  'offline.html',
  'styles.css',
  'app.js',
  'config.js',
  'pwa.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

// Third-party code the app shell genuinely needs to boot. app.js calls
// supabase.createClient() at the top level, so without the CDN bundle the
// whole script throws and every page renders blank — worth caching precisely
// so that an offline load fails gracefully instead of catastrophically.
const VENDOR_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Added one at a time rather than with addAll(), which rejects the whole
    // install if a single entry 404s and would leave the app with no worker.
    const results = await Promise.allSettled(
      SHELL.map(path => cache.add(new Request(path, { cache: 'reload' })))
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn('[sw] precache miss:', SHELL[i], r.reason);
    });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(n => n.startsWith('pp-') && !CURRENT_CACHES.includes(n))
        .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // ── Never cached, never intercepted ──────────────────────
  // Supabase carries the auth session and every quantity in the pantry. A
  // stale can-count presented as current is a correctness failure in the one
  // thing this app exists to get right, so these requests go straight to the
  // network and a failure surfaces as a failure.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Barcode lookups against Open Food Facts likewise pass through: a miss
  // should fall back to manual entry, not be replayed from an old cache.
  if (url.hostname.endsWith('openfoodfacts.org')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, req, SHELL_CACHE));
    return;
  }

  if (VENDOR_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(req, VENDOR_CACHE));
  }
});

/**
 * Pages: network first, so a fresh deploy is picked up on the next load and a
 * stale page never outlives a release. The cache is the offline fallback only.
 */
async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    // ignoreSearch so manifest shortcuts like meals.html?log=1 still match.
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || await cache.match('offline.html') || Response.error();
  }
}

/**
 * Same-origin assets: serve the cached copy at once and refresh it in the
 * background, which is what makes a cold open feel instant on kitchen wifi.
 * The refreshed copy is picked up on the following load; a VERSION bump is
 * what guarantees it, rather than leaving it to chance.
 */
function staleWhileRevalidate(event, req, cacheName) {
  return caches.open(cacheName).then(async cache => {
    const cached = await cache.match(req);
    const update = fetch(req)
      .then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    if (cached) {
      // Keep the worker alive until the background refresh settles.
      event.waitUntil(update);
      return cached;
    }
    return (await update) || Response.error();
  });
}

/** Versioned third-party bundles and fonts: immutable, so cache wins. */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    // Cross-origin responses without CORS are opaque (status 0); they still
    // replay correctly, and skipping them would mean never caching the CDN.
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}
