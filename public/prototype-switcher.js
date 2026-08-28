/* ═══════════════════════════════════════════════════════════
   PROTOTYPE SWITCHER — THROWAWAY CODE, NOT PRODUCTION.

   A floating bottom bar for flipping between UI variants that are
   gated on a ?variant= search param. Shared by any prototype on
   any page; it holds no design opinions of its own.

   Inert unless served from localhost, so a stray merge can never
   show this bar to a real user on GitHub Pages.
═══════════════════════════════════════════════════════════ */

const PrototypeSwitcher = (() => {

  // The static-site equivalent of `process.env.NODE_ENV !== 'production'`.
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', ''];
  function enabled() { return LOCAL_HOSTS.includes(location.hostname); }

  function readVariant(variants) {
    const key = new URLSearchParams(location.search).get('variant');
    return variants.some(v => v.key === key) ? key : variants[0].key;
  }

  function writeVariant(key) {
    const url = new URL(location.href);
    url.searchParams.set('variant', key);
    history.replaceState(null, '', url);   // shareable + reload-stable
  }

  function injectStyles() {
    if (document.getElementById('protoSwitcherStyles')) return;
    const s = document.createElement('style');
    s.id = 'protoSwitcherStyles';
    s.textContent = `
      .proto-switcher {
        position: fixed; left: 50%; transform: translateX(-50%);
        bottom: 5.25rem; z-index: 400;
        display: flex; align-items: stretch; gap: 0;
        background: #17111f; color: #fff;
        border: 2px solid #3d2f52; border-radius: 999px;
        box-shadow: 0 6px 28px rgba(0,0,0,.42);
        font-family: var(--font, system-ui, sans-serif);
        font-size: .8rem; overflow: hidden;
        max-width: calc(100vw - 1.5rem);
      }
      @media (min-width: 768px) { .proto-switcher { bottom: 1.25rem; } }
      /* Keep the floating bar from permanently covering the end of the page. */
      body.proto-active .page-content { padding-bottom: 10rem; }
      @media (min-width: 768px) { body.proto-active .page-content { padding-bottom: 6rem; } }
      .proto-switcher button {
        background: none; border: none; color: #fff;
        padding: .55rem .9rem; font-size: 1rem; line-height: 1;
        cursor: pointer; transition: background .15s ease;
      }
      .proto-switcher button:hover  { background: #2c2140; }
      .proto-switcher button:focus-visible { outline: 2px solid #c084fc; outline-offset: -3px; }
      .proto-switcher .ps-label {
        display: flex; flex-direction: column; justify-content: center;
        padding: .3rem .5rem; min-width: 8.5rem; text-align: center;
        border-left: 1px solid #3d2f52; border-right: 1px solid #3d2f52;
      }
      .proto-switcher .ps-name  { font-weight: 800; letter-spacing: .01em; white-space: nowrap;
                                  overflow: hidden; text-overflow: ellipsis; }
      .proto-switcher .ps-count { font-size: .64rem; color: #a894c4; font-weight: 700;
                                  letter-spacing: .09em; text-transform: uppercase; }
    `;
    document.head.appendChild(s);
  }

  /**
   * variants: [{ key, name }]
   * onChange: (key) => void — called once on mount, then on every switch.
   */
  function mount({ variants, onChange }) {
    if (!enabled()) return null;
    injectStyles();

    let current = readVariant(variants);
    const idx = () => variants.findIndex(v => v.key === current);

    const bar = document.createElement('div');
    bar.className = 'proto-switcher';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Prototype variant switcher');
    bar.innerHTML = `
      <button type="button" data-dir="-1" aria-label="Previous variant">‹</button>
      <span class="ps-label">
        <span class="ps-name"></span>
        <span class="ps-count"></span>
      </span>
      <button type="button" data-dir="1" aria-label="Next variant">›</button>
    `;
    document.body.appendChild(bar);
    document.body.classList.add('proto-active');

    const nameEl  = bar.querySelector('.ps-name');
    const countEl = bar.querySelector('.ps-count');

    function paint() {
      const v = variants[idx()];
      nameEl.textContent  = `${v.key} · ${v.name}`;
      countEl.textContent = `variant ${idx() + 1} / ${variants.length}`;
    }

    function go(delta) {
      current = variants[(idx() + delta + variants.length) % variants.length].key;
      writeVariant(current);
      paint();
      onChange(current);
    }

    bar.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => go(Number(b.dataset.dir))));

    document.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = document.activeElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1);
    });

    writeVariant(current);
    paint();
    onChange(current);
    return { current: () => current };
  }

  return { enabled, mount, readVariant };
})();
