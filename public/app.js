
/* ═══════════════════════════════════════════════════════════
   Pet Pantry – app.js  (Supabase-backed data layer + utilities)
═══════════════════════════════════════════════════════════ */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function mapUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.user_metadata?.name || '', email: u.email, createdDate: u.created_at };
}

// ── Demo mode (no account — sample data lives in localStorage only) ─
const DEMO_MODE_KEY = 'pp_demo_mode';
const DEMO_DATA_KEY = 'pp_demo_data';
const DEMO_USER = { id: 'demo-user', name: 'Demo Cat Parent', email: 'demo@petpantry.app', createdDate: '2026-01-01T00:00:00.000Z' };

function isDemoMode() { return localStorage.getItem(DEMO_MODE_KEY) === '1'; }

function seedDemoData() {
  const now = new Date().toISOString();
  const uid = DEMO_USER.id;
  const dayMs = 86400000;
  const isoDate = offsetDays => new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);

  const petFenty   = { id: crypto.randomUUID(), userId: uid, name: 'Fenty', gender: 'F', age: '4 years', breed: 'American Curl', createdDate: now, lastModifiedDate: now };
  const petBiscuit = { id: crypto.randomUUID(), userId: uid, name: 'Biscuit', gender: 'M', age: '2 years', breed: 'Domestic Shorthair', createdDate: now, lastModifiedDate: now };

  const foodWeruva   = { id: crypto.randomUUID(), userId: uid, brand: 'Weruva', name: 'Cats in the Kitchen Grain-Free Pate', type: 'Wet', sizeNum: 3, sizeUnit: 'oz', proteins: ['Chicken'], color: '#f9a8d4', purchased: 'Chewy', photos: [], createdDate: now, lastModifiedDate: now };
  const foodTiki     = { id: crypto.randomUUID(), userId: uid, brand: 'Tiki Cat', name: 'Luau Original', type: 'Wet', sizeNum: 2.8, sizeUnit: 'oz', proteins: ['Tuna', 'Chicken'], color: '#bae6fd', purchased: 'Petco', photos: [], createdDate: now, lastModifiedDate: now };
  const foodOrijen   = { id: crypto.randomUUID(), userId: uid, brand: 'Orijen', name: 'Six Fish', type: 'Dry', sizeNum: 4, sizeUnit: 'lb', proteins: ['Fish'], color: '#bbf7d0', purchased: 'Amazon', photos: [], createdDate: now, lastModifiedDate: now };
  const foodHomemade = { id: crypto.randomUUID(), userId: uid, brand: 'home-made', name: 'Chicken & Rice Mix', type: 'Wet', sizeNum: null, sizeUnit: null, proteins: ['Chicken'], color: '', purchased: '', photos: [], createdDate: now, lastModifiedDate: now };

  const invWeruvaExpiring = { id: crypto.randomUUID(), userId: uid, foodItemId: foodWeruva.id, expirationDate: isoDate(12), inventoryNumber: 4 };
  const invWeruvaFresh    = { id: crypto.randomUUID(), userId: uid, foodItemId: foodWeruva.id, expirationDate: isoDate(90), inventoryNumber: 10 };
  const invTiki           = { id: crypto.randomUUID(), userId: uid, foodItemId: foodTiki.id, expirationDate: isoDate(45), inventoryNumber: 6 };
  const invOrijen         = { id: crypto.randomUUID(), userId: uid, foodItemId: foodOrijen.id, expirationDate: isoDate(200), inventoryNumber: 2 };
  const invHomemade       = { id: crypto.randomUUID(), userId: uid, foodItemId: foodHomemade.id, expirationDate: null, inventoryNumber: null };

  const mealLogs = [
    { id: crypto.randomUUID(), userId: uid, dateTime: new Date(Date.now() - 1 * dayMs).toISOString(), petId: petFenty.id, inventoryTableId: invWeruvaFresh.id, foodLabel: 'Weruva Cats in the Kitchen Grain-Free Pate', size: '3 oz', amount: 1, catRating: 5, note: 'Devoured it', createdDate: now },
    { id: crypto.randomUUID(), userId: uid, dateTime: new Date(Date.now() - 1 * dayMs - 8 * 3600000).toISOString(), petId: petBiscuit.id, inventoryTableId: invTiki.id, foodLabel: 'Tiki Cat Luau Original', size: '2.8 oz', amount: 1, catRating: 4, note: '', createdDate: now },
    { id: crypto.randomUUID(), userId: uid, dateTime: new Date(Date.now() - 2 * dayMs).toISOString(), petId: petFenty.id, inventoryTableId: invHomemade.id, foodLabel: 'home-made Chicken & Rice Mix', size: '', amount: 1, catRating: 5, note: 'Log-only, no inventory tracked', createdDate: now }
  ];

  return {
    pets: [petFenty, petBiscuit],
    food_items: [foodWeruva, foodTiki, foodOrijen, foodHomemade],
    inventory: [invWeruvaExpiring, invWeruvaFresh, invTiki, invOrijen, invHomemade],
    meal_logs: mealLogs
  };
}

function saveDemoData(data) { localStorage.setItem(DEMO_DATA_KEY, JSON.stringify(data)); }

function loadDemoData() {
  try {
    const raw = localStorage.getItem(DEMO_DATA_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through and reseed on corrupt data */ }
  const seeded = seedDemoData();
  saveDemoData(seeded);
  return seeded;
}

function resetDemoData() { saveDemoData(seedDemoData()); }

function exitDemoMode() {
  localStorage.removeItem(DEMO_MODE_KEY);
  localStorage.removeItem(DEMO_DATA_KEY);
}

// ── Auth ─────────────────────────────────────────────────────
const Auth = {
  _user: null,

  async init() {
    if (isDemoMode()) { this._user = DEMO_USER; return this._user; }
    const { data: { session } } = await sb.auth.getSession();
    this._user = mapUser(session?.user);
    sb.auth.onAuthStateChange((_event, session) => { if (!isDemoMode()) this._user = mapUser(session?.user); });
    return this._user;
  },

  currentUser() { return this._user || {}; },
  isLoggedIn()  { return !!this._user; },

  async require() {
    if (!this._user) await this.init();
    if (!this._user) { window.location.href = 'app.html'; return false; }
    return true;
  },

  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    this._user = mapUser(data.user);
    return {};
  },

  async register(name, email, password) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return { error: error.message };
    if (!data.session) return { needsConfirm: true };
    this._user = mapUser(data.user);
    return {};
  },

  async logout() {
    if (isDemoMode()) { exitDemoMode(); this._user = null; return; }
    await sb.auth.signOut();
    this._user = null;
  },

  async updateProfile({ name, email, password }) {
    if (isDemoMode()) {
      this._user = { ...this._user, name, email };
      return {};
    }
    const patch = { data: { name } };
    if (email !== this.currentUser().email) patch.email = email;
    if (password) patch.password = password;
    const { data, error } = await sb.auth.updateUser(patch);
    if (error) return { error: error.message };
    this._user = mapUser(data.user);
    return {};
  }
};

// ── Store (Supabase-backed data access, or local demo data) ─
const Store = {
  async list(table) {
    if (isDemoMode()) return loadDemoData()[table] || [];
    const { data, error } = await sb.from(table).select('*');
    if (error) { toast(error.message, 'danger'); return []; }
    return data || [];
  },
  async insert(table, row) {
    if (isDemoMode()) {
      const data = loadDemoData();
      const newRow = { id: crypto.randomUUID(), ...row, userId: Auth.currentUser().id };
      data[table].push(newRow);
      saveDemoData(data);
      return newRow;
    }
    const { data, error } = await sb.from(table).insert({ ...row, userId: Auth.currentUser().id }).select().single();
    if (error) { toast(error.message, 'danger'); throw error; }
    return data;
  },
  async update(table, id, patch) {
    if (isDemoMode()) {
      const data = loadDemoData();
      const idx = data[table].findIndex(r => r.id === id);
      if (idx === -1) { toast('Not found', 'danger'); throw new Error('Not found'); }
      data[table][idx] = { ...data[table][idx], ...patch };
      saveDemoData(data);
      return data[table][idx];
    }
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) { toast(error.message, 'danger'); throw error; }
    return data;
  },
  async remove(table, id) {
    if (isDemoMode()) {
      const data = loadDemoData();
      data[table] = (data[table] || []).filter(r => r.id !== id);
      saveDemoData(data);
      return;
    }
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { toast(error.message, 'danger'); throw error; }
  }
};

// ── Photo storage (Supabase Storage) ────────────────────────
const PHOTO_BUCKET = 'food-photos';

function resizeImageFile(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not process image')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadFoodPhoto(foodItemId, file) {
  const blob = await resizeImageFile(file);
  if (isDemoMode()) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const uid = Auth.currentUser().id;
  const path = `${uid}/${foodItemId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) { toast(error.message, 'danger'); throw error; }
  const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function deleteFoodPhoto(url) {
  if (isDemoMode() || url.startsWith('data:')) return;
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  await sb.storage.from(PHOTO_BUCKET).remove([path]);
}

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ── Date helpers ─────────────────────────────────────────────
function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function today() { return new Date().toISOString().slice(0, 10); }

// Formats a Date/ISO-string as "YYYY-MM-DDTHH:mm" in LOCAL time, for <input type="datetime-local">.
function toLocalInputValue(d) {
  d = d instanceof Date ? d : new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nowISO() { return toLocalInputValue(new Date()); }

function expClass(dateStr) {
  if (!dateStr) return 'ok';
  const diff = (new Date(dateStr) - new Date()) / 86400000;
  if (diff < 0)  return 'past';
  if (diff < 30) return 'soon';
  return 'ok';
}
function expLabel(dateStr) {
  if (!dateStr) return 'No Exp';
  const diff = Math.round((new Date(dateStr) - new Date()) / 86400000);
  if (diff < 0)  return 'Expired';
  if (diff === 0) return 'Today';
  return `${diff}d left`;
}

// ── Debounce ─────────────────────────────────────────────────
function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ── Modal helpers (focus-managed) ───────────────────────────
// Tracks open modals so Escape/Tab apply to the topmost one, and restores
// focus to whatever triggered the modal when it closes.
const _modalStack = [];
const _modalTriggers = {};

function _focusableEls(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  _modalTriggers[id] = document.activeElement;
  modal.classList.add('open');
  _modalStack.push(id);
  const focusables = _focusableEls(modal);
  (focusables[0] || modal).focus({ preventScroll: true });
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  const idx = _modalStack.indexOf(id);
  if (idx !== -1) _modalStack.splice(idx, 1);
  const trigger = _modalTriggers[id];
  if (trigger && trigger.focus) trigger.focus({ preventScroll: true });
  delete _modalTriggers[id];
}

document.addEventListener('keydown', e => {
  if (!_modalStack.length) return;
  const topId = _modalStack[_modalStack.length - 1];
  const modal = document.getElementById(topId);
  if (!modal) return;
  if (e.key === 'Escape') { e.preventDefault(); closeModal(topId); return; }
  if (e.key === 'Tab') {
    const focusables = _focusableEls(modal);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});

// ── Confirm modal (replaces bare confirm()) ─────────────────
// Returns a Promise<boolean>. Reuses one dialog, states real consequences
// instead of a generic browser prompt, and is keyboard/focus-managed via
// the same openModal/closeModal machinery as every other modal.
function confirmModal({ title = 'Are you sure?', message = '', confirmLabel = 'Delete', danger = true } = {}) {
  return new Promise(resolve => {
    let wrap = document.getElementById('impConfirmModal');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.id = 'impConfirmModal';
      wrap.innerHTML = `
        <div class="modal" style="max-width:400px" role="dialog" aria-modal="true" aria-labelledby="impConfirmTitle" aria-describedby="impConfirmMsg">
          <div class="modal-header"><h2 id="impConfirmTitle"></h2></div>
          <p id="impConfirmMsg" style="color:var(--text-muted);font-size:.9rem;line-height:1.5"></p>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" id="impConfirmCancel">Cancel</button>
            <button type="button" class="btn" id="impConfirmOk"></button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
    }
    wrap.querySelector('#impConfirmTitle').textContent = title;
    wrap.querySelector('#impConfirmMsg').textContent = message;
    const okBtn = wrap.querySelector('#impConfirmOk');
    okBtn.textContent = confirmLabel;
    okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    const cancelBtn = wrap.querySelector('#impConfirmCancel');

    function cleanup(result) {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeModal('impConfirmModal');
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    openModal('impConfirmModal');
  });
}

// ── Sign out ─────────────────────────────────────────────────
// Demo sessions never see a sign-in/create-account screen: exiting demo
// goes straight back to the landing page instead of app.html.
async function signOut(e) {
  if (e) e.preventDefault();
  const wasDemo = isDemoMode();
  await Auth.logout();
  window.location.href = wasDemo ? 'index.html' : 'app.html';
}

// ── Nav highlight ─────────────────────────────────────────────
function highlightNav(pageId) {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === pageId);
  });
}

// ── Render user chip ──────────────────────────────────────────
function renderUserChip() {
  const u = Auth.currentUser();
  document.querySelectorAll('.nav-user-name').forEach(el => { el.textContent = u.name || ''; });
  document.querySelectorAll('.nav-user-avatar').forEach(el => {
    el.textContent = (u.name || '?')[0].toUpperCase();
  });
}

// ── Demo mode banner ─────────────────────────────────────────
// Injected on every page that loads app.js and has the app shell (not the
// landing page or sign-in page), so it shows up automatically on any new
// protected page added later without extra wiring.
function injectDemoBanner() {
  if (!isDemoMode() || !document.querySelector('.app-shell') || document.getElementById('demoBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'demoBanner';
  bar.className = 'demo-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `
    <span>🐾 Demo Mode — nothing here is saved to an account, changes stay on this device.</span>
    <button type="button" class="db-btn" id="demoResetBtn">Reset Demo Data</button>
  `;
  document.body.insertBefore(bar, document.body.firstChild);
  document.getElementById('demoResetBtn').addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Reset demo data?',
      message: 'This restores the original sample pets, food, and meals, and discards any changes made in this demo session.',
      confirmLabel: 'Reset',
      danger: false
    });
    if (!ok) return;
    resetDemoData();
    toast('Demo data reset', 'success');
    window.location.reload();
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectDemoBanner);
} else {
  injectDemoBanner();
}
