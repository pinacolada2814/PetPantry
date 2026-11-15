/* ═══════════════════════════════════════════════════════════
   Pet Pantry- pwa.js  (service worker registration)

   Loaded with defer on every page that is part of the app shell. 'sw.js' is
   resolved relative to the page, which on GitHub Pages gives /PetPantry/sw.js
   and so a worker scoped to the whole app.

   beforeinstallprompt is deliberately left alone: calling preventDefault() on
   it suppresses Chrome's own install affordance, and there is no in-app
   install button to hand it to yet.
═══════════════════════════════════════════════════════════ */

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Registered after load so it never competes with the first paint or the
  // auth check- the post-login path is the one place this app has had a
  // measurable lag problem before.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('[pwa] service worker registration failed:', err);
    });
  });
}
