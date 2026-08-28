/* ═══════════════════════════════════════════════════════════
   PROTOTYPE — THROWAWAY CODE, NOT PRODUCTION.

   QUESTION: what should the log-a-meal flow look like?

   Four options for the log-a-meal flow — the current design as a
   baseline plus three structurally different takes — rendered on the
   existing meals.html route, switchable via ?variant=.

     ?variant=current  the shipped modal form, unchanged (control)
     ?variant=A        Tap grid        — pet row + food tiles, two taps, no form
     ?variant=B        Guided sheet    — one question per screen, thumb-zone wizard
     ?variant=C        Routine timeline— confirm predicted meals instead of composing them

   SANDBOXED: while a variant is active, Store is swapped for an
   in-memory clone. Nothing reaches Supabase or localStorage. Reload
   to reset. Inert unless served from localhost.

   Delete this file, prototype-switcher.js, and the two <script> tags
   in meals.html when the question is answered.
═══════════════════════════════════════════════════════════ */

(() => {
if (!PrototypeSwitcher.enabled()) return;

/* ── In-memory sandbox ──────────────────────────────────────── */

const clone = o => JSON.parse(JSON.stringify(o));

const Sandbox = {
  data: null,
  async seed() {
    const [pets, food_items, inventory, meal_logs] = await Promise.all([
      Store.list('pets'), Store.list('food_items'),
      Store.list('inventory'), Store.list('meal_logs')
    ]);
    this.data = clone({ pets, food_items, inventory, meal_logs });
  },
  install() {
    const d = this.data;
    Store.list   = async t => clone(d[t] || []);
    Store.insert = async (t, row) => {
      const r = { id: crypto.randomUUID(), ...row, userId: 'prototype' };
      (d[t] = d[t] || []).push(r); return clone(r);
    };
    Store.update = async (t, id, patch) => {
      const r = (d[t] || []).find(x => x.id === id);
      if (!r) throw new Error('not found');
      Object.assign(r, patch); return clone(r);
    };
    Store.remove = async (t, id) => { d[t] = (d[t] || []).filter(x => x.id !== id); };
  }
};

/* ── Shared reads (infrastructure, not layout — each variant is
      free to throw out every bit of markup below) ─────────────── */

// One entry per FOOD, not per inventory batch. Batches are sorted
// soonest-expiry-first; `primary` is the FIFO default target.
async function foodChoices() {
  const [foods, invs] = await Promise.all([Store.list('food_items'), Store.list('inventory')]);
  return foods.map(food => {
    const mine = invs
      .filter(i => i.foodItemId === food.id)
      .sort((a, b) => {
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        return new Date(a.expirationDate) - new Date(b.expirationDate);
      });
    const tracked = mine.filter(i => i.inventoryNumber !== null && i.inventoryNumber !== '');
    return {
      food,
      invs: mine,
      primary: mine[0] || null,
      untracked: tracked.length === 0,
      stock: tracked.reduce((s, i) => s + Number(i.inventoryNumber || 0), 0)
    };
  }).filter(c => c.untracked || c.stock > 0);
}

function stockChip(c) {
  if (c.untracked) return `<span class="pp-chip pp-chip-mute">not tracked</span>`;
  const tone = c.stock <= 2 ? 'pp-chip-warn' : 'pp-chip-ok';
  const batches = c.invs.length > 1 ? ` · ${c.invs.length} batches` : '';
  return `<span class="pp-chip ${tone}">${c.stock} left${batches}</span>`;
}

function expiryNote(inv) {
  if (!inv || !inv.expirationDate) return '';
  const days = Math.round((new Date(inv.expirationDate) - new Date()) / 86400000);
  if (days < 0)  return `<span class="pp-exp pp-exp-bad">expired</span>`;
  if (days < 30) return `<span class="pp-exp pp-exp-soon">use in ${days}d</span>`;
  return '';
}

function servingOf(food) {
  return food.sizeNum ? `${food.sizeNum} ${food.sizeUnit || ''}`.trim() : '';
}

function swatch(food) {
  return food.color || 'hsl(270 60% 92%)';
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── Shared write (a stub: in-memory only) ──────────────────── */

let _lastLoggedId = null;

async function logMeal({ petId, inv, food, amount = 1, catRating = null, note = '', when = null }) {
  const row = await Store.insert('meal_logs', {
    dateTime: (when || new Date()).toISOString(),
    petId,
    inventoryTableId: inv ? inv.id : null,
    foodLabel: `${food.brand} ${food.name}`,
    size: servingOf(food),
    amount: Number(amount),
    catRating: catRating ? Number(catRating) : null,
    note,
    createdDate: new Date().toISOString()
  });
  _lastLoggedId = row.id;
  if (inv && inv.inventoryNumber !== null && inv.inventoryNumber !== '') {
    await Store.update('inventory', inv.id,
      { inventoryNumber: Math.max(0, Number(inv.inventoryNumber) - Number(amount)) });
  }
  return row;
}

async function undoLast() {
  if (!_lastLoggedId) return;
  const log = (await Store.list('meal_logs')).find(l => l.id === _lastLoggedId);
  if (!log) return;
  if (log.inventoryTableId) {
    const inv = (await Store.list('inventory')).find(i => i.id === log.inventoryTableId);
    if (inv && inv.inventoryNumber !== null && inv.inventoryNumber !== '') {
      await Store.update('inventory', inv.id,
        { inventoryNumber: Number(inv.inventoryNumber) + Number(log.amount || 0) });
    }
  }
  await Store.remove('meal_logs', _lastLoggedId);
  _lastLoggedId = null;
}

// Every variant calls this after a write, so the effect on BOTH the
// meal list and the pantry is visible without leaving the page.
async function afterWrite(msg, { undo = false } = {}) {
  await renderMeals();
  await renderStatePanel();
  if (undo) toastUndo(msg); else toast(msg, 'success');
}

/* ── Undo toast (used by the variants that log in one tap) ───── */

function toastUndo(msg) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast success pp-toast-undo';
  t.innerHTML = `<span>${esc(msg)}</span>`;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pp-undo-btn'; btn.textContent = 'Undo';
  btn.addEventListener('click', async () => {
    t.remove();
    await undoLast();
    await renderMeals(); await renderStatePanel();
    toast('Undone', 'warning');
  });
  t.appendChild(btn);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

/* ── State panel: after every action, show the full relevant state ── */

async function renderStatePanel() {
  const el = document.getElementById('protoState');
  if (!el) return;
  const [invs, foods, logs] = await Promise.all([
    Store.list('inventory'), Store.list('food_items'), Store.list('meal_logs')
  ]);
  const rows = invs.map(i => {
    const f = foods.find(x => x.id === i.foodItemId);
    const qty = (i.inventoryNumber === null || i.inventoryNumber === '')
      ? '<em>untracked</em>' : `<strong>${i.inventoryNumber}</strong>`;
    const exp = i.expirationDate ? fmtDate(i.expirationDate) : 'no expiry';
    return `<tr><td>${esc(f ? f.brand + ' ' + f.name : '—')}</td><td>${exp}</td><td style="text-align:right">${qty}</td></tr>`;
  }).join('');
  el.querySelector('.pp-state-body').innerHTML = `
    <p class="pp-state-note">${logs.length} meal log${logs.length === 1 ? '' : 's'} · in-memory only</p>
    <table class="pp-state-table"><thead><tr><th>Inventory batch</th><th>Expires</th><th style="text-align:right">Qty</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">no inventory</td></tr>'}</tbody></table>`;
}

/* ── Prototype-only styles ──────────────────────────────────── */

function injectStyles() {
  if (document.getElementById('protoMealStyles')) return;
  const s = document.createElement('style');
  s.id = 'protoMealStyles';
  s.textContent = `
    .pp-banner {
      background: repeating-linear-gradient(45deg,#17111f,#17111f 12px,#241a33 12px,#241a33 24px);
      color:#fff; font-weight:800; font-size:.76rem; letter-spacing:.04em;
      padding:.5rem .9rem; border-radius:var(--radius-sm); margin-bottom:1rem;
      display:flex; gap:.5rem; align-items:center; flex-wrap:wrap;
    }
    .pp-banner code { background:rgba(255,255,255,.14); padding:.1rem .35rem; border-radius:4px; font-size:.72rem; }

    .pp-chip { display:inline-block; font-size:.68rem; font-weight:800; padding:.12rem .45rem;
               border-radius:99px; letter-spacing:.02em; }
    .pp-chip-ok   { background:hsl(145 60% 94%); color:hsl(145 60% 28%); }
    .pp-chip-warn { background:hsl(38 90% 92%);  color:hsl(38 90% 30%); }
    .pp-chip-mute { background:var(--surface2);  color:var(--text-muted); }
    .pp-exp { font-size:.66rem; font-weight:800; margin-left:.3rem; }
    .pp-exp-soon { color:hsl(38 90% 38%); }
    .pp-exp-bad  { color:var(--danger); }

    .pp-undo-btn { margin-left:.7rem; background:rgba(255,255,255,.22); color:#fff; border:none;
                   border-radius:99px; padding:.18rem .6rem; font-weight:800; font-size:.74rem; cursor:pointer; }
    .pp-toast-undo { display:flex; align-items:center; }

    .pp-state { margin-top:1.5rem; border:1px dashed var(--border); border-radius:var(--radius);
                background:var(--surface); }
    .pp-state > summary { cursor:pointer; padding:.6rem .9rem; font-weight:800; font-size:.78rem;
                          color:var(--text-muted); letter-spacing:.04em; text-transform:uppercase; }
    .pp-state-body { padding:0 .9rem .9rem; }
    .pp-state-note { font-size:.76rem; color:var(--text-muted); margin:0 0 .5rem; }
    .pp-state-table { width:100%; border-collapse:collapse; font-size:.78rem; }
    .pp-state-table th { text-align:left; font-size:.66rem; text-transform:uppercase; letter-spacing:.05em;
                         color:var(--text-muted); border-bottom:1px solid var(--border); padding:.3rem 0; }
    .pp-state-table td { padding:.3rem 0; border-bottom:1px solid var(--surface2); }

    /* ── Variant A: tap grid ── */
    .vA-pets { display:flex; gap:.6rem; overflow-x:auto; padding:.2rem 0 .6rem; }
    .vA-pet { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:.3rem;
              background:none; border:none; cursor:pointer; padding:0; width:64px; }
    .vA-pet .vA-face { width:56px; height:56px; border-radius:50%; display:grid; place-items:center;
                       font-size:1.5rem; background:var(--primary-l); border:3px solid transparent;
                       transition:all var(--transition); }
    .vA-pet[aria-pressed="true"] .vA-face { border-color:var(--primary); background:#fff;
                                            box-shadow:var(--shadow-md); transform:scale(1.04); }
    .vA-pet span.vA-name { font-size:.72rem; font-weight:700; color:var(--text-muted); }
    .vA-pet[aria-pressed="true"] span.vA-name { color:var(--primary-d); }
    .vA-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:.6rem; }
    @media (min-width:600px) { .vA-grid { grid-template-columns:repeat(3,1fr); } }
    .vA-tile { position:relative; text-align:left; background:var(--surface); border:1.5px solid var(--border);
               border-radius:var(--radius); padding:.7rem .7rem .6rem; cursor:pointer; min-height:104px;
               display:flex; flex-direction:column; gap:.25rem; transition:all var(--transition); }
    .vA-tile:hover { border-color:var(--primary); transform:translateY(-2px); box-shadow:var(--shadow); }
    .vA-tile:active { transform:scale(.97); }
    .vA-tile.vA-flash { animation:vAflash .5s ease; }
    @keyframes vAflash { 0%{background:hsl(145 60% 92%);} 100%{background:var(--surface);} }
    .vA-swatch { width:100%; height:6px; border-radius:99px; margin-bottom:.15rem; }
    .vA-brand { font-size:.66rem; font-weight:800; color:var(--text-muted); text-transform:uppercase;
                letter-spacing:.05em; }
    .vA-name  { font-size:.84rem; font-weight:700; line-height:1.25; }
    .vA-foot  { margin-top:auto; display:flex; align-items:center; gap:.3rem; flex-wrap:wrap; }
    .vA-other { border-style:dashed; align-items:center; justify-content:center; text-align:center;
                color:var(--text-muted); font-weight:700; font-size:.82rem; }
    .vA-rate { display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; background:var(--primary-l);
               border-radius:var(--radius); padding:.55rem .75rem; margin:.75rem 0 0; }
    .vA-rate strong { font-size:.8rem; }
    .vA-rate button { background:#fff; border:1.5px solid var(--border); border-radius:99px; cursor:pointer;
                      padding:.2rem .5rem; font-size:.9rem; }
    .vA-rate button:hover { border-color:var(--primary); }

    /* ── Variant B: guided sheet ── */
    .vB-launch { width:100%; padding:1rem; font-size:1rem; font-weight:800; border:none;
                 border-radius:var(--radius); background:var(--primary); color:#fff; cursor:pointer;
                 box-shadow:var(--shadow-md); }
    .vB-sheet { position:fixed; inset:0; z-index:350; background:rgba(30,20,51,.45);
                display:flex; align-items:flex-end; }
    .vB-panel { background:var(--surface); width:100%; max-height:92vh; display:flex; flex-direction:column;
                border-radius:var(--radius) var(--radius) 0 0; animation:vBup .22s ease; }
    @media (min-width:768px) { .vB-sheet { align-items:center; justify-content:center; }
                               .vB-panel { max-width:460px; border-radius:var(--radius); } }
    @keyframes vBup { from { transform:translateY(26px); opacity:.4; } to { transform:none; opacity:1; } }
    .vB-head { display:flex; align-items:center; gap:.6rem; padding:.85rem 1rem .5rem; }
    .vB-head button { background:none; border:none; font-size:1.15rem; cursor:pointer; color:var(--text-muted); }
    .vB-dots { display:flex; gap:.3rem; margin-left:auto; margin-right:auto; }
    .vB-dot { width:7px; height:7px; border-radius:50%; background:var(--border); }
    .vB-dot.on { background:var(--primary); width:20px; }
    .vB-q { padding:.2rem 1rem .6rem; font-size:1.25rem; font-weight:800; }
    .vB-body { padding:0 1rem 1rem; overflow-y:auto; flex:1; }
    .vB-opt { width:100%; display:flex; align-items:center; gap:.75rem; text-align:left; cursor:pointer;
              background:var(--surface); border:1.5px solid var(--border); border-radius:var(--radius);
              padding:.85rem .9rem; margin-bottom:.5rem; font-size:.95rem; font-weight:700;
              transition:all var(--transition); }
    .vB-opt:hover { border-color:var(--primary); background:var(--primary-l); }
    .vB-opt .vB-dotcol { width:12px; height:34px; border-radius:99px; flex:0 0 auto; }
    .vB-opt small { display:block; font-weight:600; font-size:.74rem; color:var(--text-muted); margin-top:.15rem; }
    .vB-step { display:flex; align-items:center; justify-content:center; gap:1rem; margin:1.2rem 0; }
    .vB-step button { width:56px; height:56px; border-radius:50%; border:1.5px solid var(--border);
                      background:var(--surface); font-size:1.6rem; cursor:pointer; }
    .vB-step button:hover { border-color:var(--primary); }
    .vB-amt { font-size:2.6rem; font-weight:900; min-width:4rem; text-align:center; }
    .vB-unit { text-align:center; color:var(--text-muted); font-size:.85rem; font-weight:700; margin-top:-.6rem; }
    .vB-quick { display:flex; gap:.4rem; justify-content:center; flex-wrap:wrap; margin-top:.8rem; }
    .vB-quick button { border:1.5px solid var(--border); background:var(--surface); border-radius:99px;
                       padding:.35rem .8rem; font-weight:700; font-size:.82rem; cursor:pointer; }
    .vB-quick button:hover { border-color:var(--primary); }
    .vB-stars { display:flex; gap:.35rem; justify-content:center; margin:.5rem 0 1rem; }
    .vB-stars button { font-size:1.9rem; background:none; border:none; cursor:pointer; filter:grayscale(1); opacity:.4; }
    .vB-stars button.on { filter:none; opacity:1; transform:scale(1.1); }
    .vB-foot { border-top:1px solid var(--border); padding:.75rem 1rem; display:flex; gap:.5rem; }
    .vB-foot .vB-primary { flex:1; padding:.85rem; border:none; border-radius:var(--radius-sm);
                           background:var(--primary); color:#fff; font-weight:800; font-size:.95rem; cursor:pointer; }
    .vB-foot .vB-primary[disabled] { background:var(--border); color:var(--text-muted); cursor:not-allowed; }
    .vB-foot .vB-skip { padding:.85rem 1rem; border:1.5px solid var(--border); border-radius:var(--radius-sm);
                        background:var(--surface); font-weight:700; cursor:pointer; }

    /* ── Variant C: routine timeline ── */
    .vC-head { display:flex; align-items:baseline; gap:.6rem; margin-bottom:.15rem; }
    .vC-head h2 { font-size:1.05rem; font-weight:800; }
    .vC-head span { font-size:.78rem; color:var(--text-muted); font-weight:700; }
    .vC-bar { height:6px; border-radius:99px; background:var(--surface2); overflow:hidden; margin:.5rem 0 1rem; }
    .vC-bar i { display:block; height:100%; background:var(--primary); transition:width .3s ease; }
    .vC-line { position:relative; padding-left:1.5rem; }
    .vC-line::before { content:''; position:absolute; left:6px; top:.4rem; bottom:.4rem; width:2px;
                       background:var(--border); }
    .vC-slot { position:relative; margin-bottom:.7rem; }
    .vC-slot::before { content:''; position:absolute; left:-1.5rem; top:1.1rem; width:14px; height:14px;
                       border-radius:50%; background:var(--surface); border:2.5px solid var(--border); }
    .vC-slot.done::before { background:var(--success); border-color:var(--success); }
    .vC-card { background:var(--surface); border:1.5px solid var(--border); border-radius:var(--radius);
               padding:.75rem .85rem; display:flex; align-items:center; gap:.75rem; }
    .vC-slot.done .vC-card { background:var(--surface2); border-style:dashed; }
    .vC-when { font-size:.68rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em;
               color:var(--text-muted); }
    .vC-who  { font-size:.95rem; font-weight:800; }
    .vC-what { font-size:.79rem; color:var(--text-muted); font-weight:600; }
    .vC-fed  { margin-left:auto; flex:0 0 auto; border:none; border-radius:99px; cursor:pointer;
               background:var(--success); color:#fff; font-weight:800; font-size:.85rem; padding:.6rem 1.05rem; }
    .vC-fed:hover { filter:brightness(1.07); }
    .vC-donetag { margin-left:auto; font-size:.78rem; font-weight:800; color:var(--success); }
    .vC-swap { background:none; border:none; color:var(--primary); font-weight:800; font-size:.72rem;
               cursor:pointer; padding:0; margin-top:.2rem; }
    .vC-picker { margin-top:.5rem; display:grid; gap:.35rem; }
    .vC-picker button { text-align:left; border:1.5px solid var(--border); background:var(--surface);
                        border-radius:var(--radius-sm); padding:.5rem .6rem; font-size:.82rem;
                        font-weight:700; cursor:pointer; }
    .vC-picker button:hover { border-color:var(--primary); }
    .vC-else { width:100%; margin-top:.4rem; padding:.8rem; border:1.5px dashed var(--border);
               border-radius:var(--radius); background:none; color:var(--text-muted); font-weight:700;
               cursor:pointer; }
    .vC-empty { font-size:.85rem; color:var(--text-muted); padding:.5rem 0 1rem; }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════════
   VARIANT A — "Tap grid"
   Inline on the page, no modal, no form. Pick the cat, tap the food,
   it's logged: time = now, amount = 1, batch = soonest expiry (FIFO).
   Rating and notes become an OPTIONAL follow-up on the thing you just
   logged, rather than fields you fill before you're allowed to save.
   Primary affordance: direct manipulation.
═══════════════════════════════════════════════════════════ */

async function mountA(root) {
  const pets = await Store.list('pets');
  let petId = pets.length ? pets[0].id : null;

  root.innerHTML = `
    <section aria-label="Quick log">
      <div class="vA-pets" id="vAPets" role="group" aria-label="Which cat is eating"></div>
      <div class="vA-grid" id="vAGrid"></div>
      <div id="vARate"></div>
    </section>`;

  const petsEl = root.querySelector('#vAPets');
  const gridEl = root.querySelector('#vAGrid');
  const rateEl = root.querySelector('#vARate');

  function paintPets() {
    if (!pets.length) { petsEl.innerHTML = `<p class="vC-empty">Add a pet first →</p>`; return; }
    petsEl.innerHTML = pets.map(p => `
      <button type="button" class="vA-pet" data-pet="${p.id}" aria-pressed="${p.id === petId}">
        <span class="vA-face">${p.gender === 'M' ? '🐈' : '🐈‍⬛'}</span>
        <span class="vA-name">${esc(p.name)}</span>
      </button>`).join('');
    petsEl.querySelectorAll('[data-pet]').forEach(b =>
      b.addEventListener('click', () => { petId = b.dataset.pet; paintPets(); paintGrid(); }));
  }

  async function paintGrid() {
    const [choices, logs] = await Promise.all([foodChoices(), Store.list('meal_logs')]);
    const invs = await Store.list('inventory');

    // Most-recently-fed-to-this-cat first: the tile you want is usually
    // the one you used last time.
    const lastUsed = new Map();
    logs.filter(l => l.petId === petId)
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        .forEach(l => {
          const inv = invs.find(i => i.id === l.inventoryTableId);
          if (inv) lastUsed.set(inv.foodItemId, new Date(l.dateTime).getTime());
        });
    choices.sort((a, b) => (lastUsed.get(b.food.id) || 0) - (lastUsed.get(a.food.id) || 0));

    gridEl.innerHTML = choices.map((c, i) => `
      <button type="button" class="vA-tile" data-i="${i}" ${petId ? '' : 'disabled'}>
        <span class="vA-swatch" style="background:${esc(swatch(c.food))}"></span>
        <span class="vA-brand">${esc(c.food.brand)}</span>
        <span class="vA-name">${esc(c.food.name)}</span>
        <span class="vA-foot">${stockChip(c)}${expiryNote(c.primary)}</span>
      </button>`).join('')
      + `<button type="button" class="vA-tile vA-other" id="vAOther">＋<br/>Something else</button>`;

    gridEl.querySelectorAll('[data-i]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = choices[Number(btn.dataset.i)];
        const pet = pets.find(p => p.id === petId);
        btn.classList.add('vA-flash');
        await logMeal({ petId, inv: c.primary, food: c.food, amount: 1 });
        await afterWrite(`${pet.name} fed · ${c.food.brand}`, { undo: true });
        paintRating(c, pet);
        paintGrid();
      });
    });
    gridEl.querySelector('#vAOther').addEventListener('click', () => openMealModal());
  }

  function paintRating(c, pet) {
    const id = _lastLoggedId;
    rateEl.innerHTML = `
      <div class="vA-rate">
        <strong>How was the ${esc(c.food.brand)}, ${esc(pet.name)}?</strong>
        ${[1,2,3,4,5].map(n => `<button type="button" data-r="${n}" aria-label="${n} stars">⭐${n}</button>`).join('')}
      </div>`;
    rateEl.querySelectorAll('[data-r]').forEach(b =>
      b.addEventListener('click', async () => {
        await Store.update('meal_logs', id, { catRating: Number(b.dataset.r) });
        rateEl.innerHTML = '';
        await afterWrite('Rating saved');
      }));
    setTimeout(() => { if (rateEl.firstElementChild) rateEl.innerHTML = ''; }, 12000);
  }

  paintPets();
  await paintGrid();
}

/* ═══════════════════════════════════════════════════════════
   VARIANT B — "Guided sheet"
   A bottom sheet that asks ONE question per screen with targets big
   enough for a thumb, auto-advancing on each answer. Steps appear only
   when they're actually a decision: the pet step is skipped for a
   single-cat household, the batch step only when a food has more than
   one batch. "Log it now" lights up as soon as the record is valid, so
   you can bail out before the optional steps.
   Primary affordance: a sequence, not a form.
═══════════════════════════════════════════════════════════ */

async function mountB(root) {
  root.innerHTML = `<button type="button" class="vB-launch" id="vBLaunch">🐱 &nbsp;Feed a cat</button>`;
  root.querySelector('#vBLaunch').addEventListener('click', openSheet);

  async function openSheet() {
    const [pets, choices] = await Promise.all([Store.list('pets'), foodChoices()]);
    if (!pets.length) { toast('Add a pet first', 'danger'); return; }

    const draft = { pet: pets.length === 1 ? pets[0] : null, choice: null, inv: null, amount: 1, rating: null, note: '' };

    const sheet = document.createElement('div');
    sheet.className = 'vB-sheet';
    sheet.innerHTML = `
      <div class="vB-panel" role="dialog" aria-modal="true" aria-label="Log a meal">
        <div class="vB-head">
          <button type="button" id="vBBack" aria-label="Back">‹</button>
          <span class="vB-dots" id="vBDots"></span>
          <button type="button" id="vBClose" aria-label="Close">✕</button>
        </div>
        <h2 class="vB-q" id="vBQ"></h2>
        <div class="vB-body" id="vBBody"></div>
        <div class="vB-foot">
          <button type="button" class="vB-primary" id="vBGo" disabled>Log it now</button>
          <button type="button" class="vB-skip" id="vBNext">Next ›</button>
        </div>
      </div>`;
    document.body.appendChild(sheet);

    const q = sheet.querySelector('#vBQ'), body = sheet.querySelector('#vBBody');
    const dots = sheet.querySelector('#vBDots'), go = sheet.querySelector('#vBGo');
    const nextBtn = sheet.querySelector('#vBNext');
    const close = () => sheet.remove();
    sheet.querySelector('#vBClose').addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });

    // Only ask what's actually a question.
    function steps() {
      const list = [];
      if (pets.length > 1) list.push('pet');
      list.push('food');
      if (draft.choice && draft.choice.invs.length > 1) list.push('batch');
      list.push('amount', 'rating');
      return list;
    }
    let at = 0;

    function paint() {
      const list = steps();
      at = Math.max(0, Math.min(at, list.length - 1));
      const step = list[at];
      dots.innerHTML = list.map((_, i) => `<span class="vB-dot ${i === at ? 'on' : ''}"></span>`).join('');
      sheet.querySelector('#vBBack').style.visibility = at === 0 ? 'hidden' : 'visible';
      go.disabled = !(draft.pet && draft.choice);
      nextBtn.textContent = at === list.length - 1 ? 'Done ›' : 'Next ›';

      if (step === 'pet') {
        q.textContent = "Who's eating?";
        body.innerHTML = pets.map(p => `
          <button type="button" class="vB-opt" data-pet="${p.id}">
            <span class="vB-dotcol" style="background:var(--primary-l)"></span>
            <span>${esc(p.name)}<small>${esc(p.breed || 'cat')}${p.age ? ' · ' + esc(p.age) : ''}</small></span>
          </button>`).join('');
        body.querySelectorAll('[data-pet]').forEach(b => b.addEventListener('click', () => {
          draft.pet = pets.find(p => p.id === b.dataset.pet); at++; paint();
        }));

      } else if (step === 'food') {
        q.textContent = `What's ${draft.pet ? draft.pet.name : 'it'} having?`;
        body.innerHTML = choices.map((c, i) => `
          <button type="button" class="vB-opt" data-food="${i}">
            <span class="vB-dotcol" style="background:${esc(swatch(c.food))}"></span>
            <span>${esc(c.food.name)}<small>${esc(c.food.brand)} · ${c.untracked ? 'not tracked' : c.stock + ' left'}${c.primary && c.primary.expirationDate ? ' · exp ' + fmtDate(c.primary.expirationDate) : ''}</small></span>
          </button>`).join('') || `<p class="vC-empty">Nothing in the pantry.</p>`;
        body.querySelectorAll('[data-food]').forEach(b => b.addEventListener('click', () => {
          draft.choice = choices[Number(b.dataset.food)];
          draft.inv = draft.choice.primary;
          draft.amount = 1;
          at++; paint();
        }));

      } else if (step === 'batch') {
        q.textContent = 'Which one are you opening?';
        body.innerHTML = draft.choice.invs.map((inv, i) => `
          <button type="button" class="vB-opt" data-batch="${i}">
            <span class="vB-dotcol" style="background:${esc(swatch(draft.choice.food))}"></span>
            <span>${inv.expirationDate ? 'Expires ' + fmtDate(inv.expirationDate) : 'No expiry date'}
              <small>${inv.inventoryNumber === null || inv.inventoryNumber === '' ? 'not tracked' : inv.inventoryNumber + ' left'}${i === 0 ? ' · oldest' : ''}</small></span>
          </button>`).join('');
        body.querySelectorAll('[data-batch]').forEach(b => b.addEventListener('click', () => {
          draft.inv = draft.choice.invs[Number(b.dataset.batch)]; at++; paint();
        }));

      } else if (step === 'amount') {
        const unit = servingOf(draft.choice.food);
        q.textContent = 'How much?';
        body.innerHTML = `
          <div class="vB-step">
            <button type="button" id="vBMinus" aria-label="Less">−</button>
            <span class="vB-amt" id="vBAmt">${draft.amount}</span>
            <button type="button" id="vBPlus" aria-label="More">+</button>
          </div>
          <p class="vB-unit">${unit ? `× ${esc(unit)} ${esc(draft.choice.food.type === 'Dry' ? 'serving' : 'can')}` : 'servings'}</p>
          <div class="vB-quick">
            ${[0.5, 1, 1.5, 2, 3].map(n => `<button type="button" data-q="${n}">${n}</button>`).join('')}
          </div>`;
        const amtEl = body.querySelector('#vBAmt');
        const set = n => { draft.amount = Math.max(0.5, Math.round(n * 2) / 2); amtEl.textContent = draft.amount; };
        body.querySelector('#vBMinus').addEventListener('click', () => set(draft.amount - 0.5));
        body.querySelector('#vBPlus').addEventListener('click', () => set(draft.amount + 0.5));
        body.querySelectorAll('[data-q]').forEach(b =>
          b.addEventListener('click', () => { set(Number(b.dataset.q)); at++; paint(); }));

      } else {
        q.textContent = 'How did it go?';
        body.innerHTML = `
          <div class="vB-stars" id="vBStars">
            ${[1,2,3,4,5].map(n => `<button type="button" data-r="${n}" aria-label="${n} stars">⭐</button>`).join('')}
          </div>
          <textarea class="form-control" id="vBNote" rows="2" placeholder="Anything to note…">${esc(draft.note)}</textarea>`;
        const paintStars = () => body.querySelectorAll('[data-r]').forEach(b =>
          b.classList.toggle('on', Number(b.dataset.r) <= (draft.rating || 0)));
        body.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => {
          draft.rating = Number(b.dataset.r); paintStars();
        }));
        body.querySelector('#vBNote').addEventListener('input', e => { draft.note = e.target.value; });
        paintStars();
      }
    }

    sheet.querySelector('#vBBack').addEventListener('click', () => { at--; paint(); });
    nextBtn.addEventListener('click', () => {
      if (at === steps().length - 1) { commit(); return; }
      at++; paint();
    });
    go.addEventListener('click', commit);

    async function commit() {
      if (!draft.pet || !draft.choice) { toast('Pick a cat and a food', 'danger'); return; }
      await logMeal({
        petId: draft.pet.id, inv: draft.inv, food: draft.choice.food,
        amount: draft.amount, catRating: draft.rating, note: draft.note
      });
      close();
      await afterWrite(`${draft.pet.name} fed · ${draft.choice.food.brand}`, { undo: true });
    }

    paint();
  }
}

/* ═══════════════════════════════════════════════════════════
   VARIANT C — "Routine timeline"
   Built on the observation that feeding is a ROUTINE: the same cat,
   the same food, at roughly the same times every day. So instead of
   asking you to compose a record from scratch, it predicts today's
   meals from your history and asks you to confirm them. The common
   case is one tap on "Fed"; deviations get an inline "not this" swap.
   Primary affordance: confirming a guess, not filling a form.
═══════════════════════════════════════════════════════════ */

const BUCKETS = [
  { key: 'morning', label: 'Morning',   from: 0,  to: 11, icon: '🌅' },
  { key: 'midday',  label: 'Midday',    from: 11, to: 16, icon: '☀️' },
  { key: 'evening', label: 'Evening',   from: 16, to: 24, icon: '🌙' }
];
const bucketOf = h => BUCKETS.find(b => h >= b.from && h < b.to) || BUCKETS[2];

async function mountC(root) {
  let openPicker = null;   // slot id whose food-swap picker is open

  async function paint() {
    const [pets, logs, invs, choices] = await Promise.all([
      Store.list('pets'), Store.list('meal_logs'), Store.list('inventory'), foodChoices()
    ]);
    const foods = await Store.list('food_items');

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const recent = logs.filter(l => (new Date() - new Date(l.dateTime)) < 21 * 86400000);

    // Derive one slot per (pet, bucket) that the history shows a habit for.
    const slots = [];
    pets.forEach(pet => {
      const mine = recent.filter(l => l.petId === pet.id);
      BUCKETS.forEach(b => {
        const inBucket = mine.filter(l => bucketOf(new Date(l.dateTime).getHours()).key === b.key);
        if (!inBucket.length) return;
        const tally = {};
        inBucket.forEach(l => { tally[l.inventoryTableId || 'none'] = (tally[l.inventoryTableId || 'none'] || 0) + 1; });
        const topInvId = Object.keys(tally).sort((x, y) => tally[y] - tally[x])[0];
        const inv  = invs.find(i => i.id === topInvId) || null;
        const food = inv ? foods.find(f => f.id === inv.foodItemId) : null;
        const last = inBucket.sort((x, y) => new Date(y.dateTime) - new Date(x.dateTime))[0];
        const hour = new Date(last.dateTime).getHours();
        const amount = Number(last.amount || 1);
        slots.push({
          id: `${pet.id}-${b.key}`, pet, bucket: b, hour, inv, food, amount,
          fallbackLabel: last.foodLabel,
          done: logs.some(l => l.petId === pet.id && new Date(l.dateTime) >= startOfToday &&
                               bucketOf(new Date(l.dateTime).getHours()).key === b.key),
          doneLog: logs.find(l => l.petId === pet.id && new Date(l.dateTime) >= startOfToday &&
                                  bucketOf(new Date(l.dateTime).getHours()).key === b.key)
        });
      });
      // A cat with no history at all still needs a way in.
      if (!slots.some(s => s.pet.id === pet.id)) {
        const c = choices[0];
        slots.push({
          id: `${pet.id}-new`, pet, bucket: BUCKETS[bucketOf(new Date().getHours()).key === 'morning' ? 0 : 2],
          hour: new Date().getHours(), inv: c ? c.primary : null, food: c ? c.food : null,
          amount: 1, fallbackLabel: '', done: false, doneLog: null, guessed: true
        });
      }
    });
    slots.sort((a, b) => a.hour - b.hour || a.pet.name.localeCompare(b.pet.name));

    const doneCount = slots.filter(s => s.done).length;
    const pct = slots.length ? Math.round(doneCount / slots.length * 100) : 0;
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    root.innerHTML = `
      <section aria-label="Today's feeding routine">
        <div class="vC-head"><h2>${esc(dayName)}</h2>
          <span>${doneCount} of ${slots.length} logged</span></div>
        <div class="vC-bar"><i style="width:${pct}%"></i></div>
        ${slots.length ? `<div class="vC-line">${slots.map(s => slotHtml(s)).join('')}</div>`
                       : `<p class="vC-empty">No feeding history yet — log a couple of meals and today's routine will show up here.</p>`}
        <button type="button" class="vC-else" id="vCElse">＋ Log something off-routine</button>
      </section>`;

    root.querySelector('#vCElse').addEventListener('click', () => openMealModal());

    root.querySelectorAll('[data-fed]').forEach(btn => btn.addEventListener('click', async () => {
      const s = slots.find(x => x.id === btn.dataset.fed);
      if (!s.food) { openMealModal(); return; }
      const when = new Date(); when.setHours(s.hour, 0, 0, 0);
      if (when > new Date()) when.setTime(Date.now());
      await logMeal({ petId: s.pet.id, inv: s.inv, food: s.food, amount: s.amount, when });
      openPicker = null;
      await afterWrite(`${s.pet.name}'s ${s.bucket.label.toLowerCase()} meal logged`, { undo: true });
      await paint();
    }));

    root.querySelectorAll('[data-swap]').forEach(btn => btn.addEventListener('click', async () => {
      openPicker = openPicker === btn.dataset.swap ? null : btn.dataset.swap;
      await paint();
    }));

    root.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', async () => {
      const [slotId, idx] = btn.dataset.pick.split('|');
      const s = slots.find(x => x.id === slotId);
      const c = choices[Number(idx)];
      const when = new Date(); when.setHours(s.hour, 0, 0, 0);
      if (when > new Date()) when.setTime(Date.now());
      await logMeal({ petId: s.pet.id, inv: c.primary, food: c.food, amount: s.amount, when });
      openPicker = null;
      await afterWrite(`${s.pet.name} had ${c.food.brand} instead`, { undo: true });
      await paint();
    }));

    function slotHtml(s) {
      const time = new Date(); time.setHours(s.hour, 0, 0, 0);
      const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const label = s.food ? `${s.food.brand} ${s.food.name}` : (s.fallbackLabel || 'pick a food');
      const stars = s.doneLog && s.doneLog.catRating ? ' ' + '⭐'.repeat(Number(s.doneLog.catRating)) : '';
      return `
        <div class="vC-slot ${s.done ? 'done' : ''}">
          <div class="vC-card">
            <div>
              <div class="vC-when">${s.bucket.icon} ${esc(s.bucket.label)} · usually ${timeStr}</div>
              <div class="vC-who">${esc(s.pet.name)}</div>
              <div class="vC-what">${esc(label)}${s.amount !== 1 ? ` · ${s.amount}×` : ''}${s.guessed ? ' (guess)' : ''}</div>
              ${s.done ? '' : `<button type="button" class="vC-swap" data-swap="${s.id}">not this — pick another →</button>`}
            </div>
            ${s.done
              ? `<span class="vC-donetag">Fed ✓${stars}</span>`
              : `<button type="button" class="vC-fed" data-fed="${s.id}">Fed ✓</button>`}
          </div>
          ${openPicker === s.id ? `<div class="vC-picker">${choices.map((c, i) => `
            <button type="button" data-pick="${s.id}|${i}">${esc(c.food.brand)} ${esc(c.food.name)}
              <span style="float:right;color:var(--text-muted);font-weight:600">${c.untracked ? 'not tracked' : c.stock + ' left'}</span>
            </button>`).join('')}</div>` : ''}
        </div>`;
    }
  }

  await paint();
}

/* ═══════════════════════════════════════════════════════════
   Variant "current" — the shipped design, untouched. Kept in the
   cycle as a control: a variant only wins if it beats this.
═══════════════════════════════════════════════════════════ */

async function mountCurrent(root) {
  root.innerHTML = '';
  document.querySelector('.fab').style.display = '';   // the existing affordance
}

/* ── Registry + mount plumbing ──────────────────────────────── */

const VARIANTS = [
  { key: 'current', name: 'Current (baseline)', mount: mountCurrent },
  { key: 'A',       name: 'Tap grid',           mount: mountA },
  { key: 'B',       name: 'Guided sheet',       mount: mountB },
  { key: 'C',       name: 'Routine timeline',   mount: mountC }
];

(async () => {
  if (!(await Auth.require())) return;

  await Sandbox.seed();
  Sandbox.install();
  injectStyles();

  const main = document.querySelector('.page-content');
  const header = main.querySelector('.page-header');

  const banner = document.createElement('div');
  banner.className = 'pp-banner';
  banner.innerHTML = `🧪 PROTOTYPE — “what should logging a meal look like?” ·
    in-memory sandbox, nothing is saved · switch with <code>?variant=</code> or ← →`;
  header.after(banner);

  const mount = document.createElement('div');
  mount.id = 'protoMount';
  banner.after(mount);

  const state = document.createElement('details');
  state.className = 'pp-state';
  state.id = 'protoState';
  state.innerHTML = `<summary>Sandbox state</summary><div class="pp-state-body"></div>`;
  main.appendChild(state);

  let active = null;
  PrototypeSwitcher.mount({
    variants: VARIANTS.map(({ key, name }) => ({ key, name })),
    onChange: async key => {
      // Tear down whatever the last variant put on the page.
      document.querySelectorAll('.vB-sheet').forEach(el => el.remove());
      mount.innerHTML = '';
      closeModal('mealModal');
      document.querySelector('.fab').style.display = key === 'current' ? '' : 'none';
      active = VARIANTS.find(v => v.key === key);
      await active.mount(mount);
      await renderMeals();
      await renderStatePanel();
    }
  });
})();

})();
