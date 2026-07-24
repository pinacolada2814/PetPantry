
/* ═══════════════════════════════════════════════════════════
   Pet Pantry – app.js  (Supabase-backed data layer + utilities)
═══════════════════════════════════════════════════════════ */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function mapUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.user_metadata?.name || '', email: u.email, createdDate: u.created_at };
}

// ── Auth ─────────────────────────────────────────────────────
const Auth = {
  _user: null,

  async init() {
    const { data: { session } } = await sb.auth.getSession();
    this._user = mapUser(session?.user);
    sb.auth.onAuthStateChange((_event, session) => { this._user = mapUser(session?.user); });
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
    await sb.auth.signOut();
    this._user = null;
  }
};

// ── Store (Supabase-backed data access) ─────────────────────
const Store = {
  async list(table) {
    const { data, error } = await sb.from(table).select('*');
    if (error) { toast(error.message, 'danger'); return []; }
    return data || [];
  },
  async insert(table, row) {
    const { data, error } = await sb.from(table).insert({ ...row, userId: Auth.currentUser().id }).select().single();
    if (error) { toast(error.message, 'danger'); throw error; }
    return data;
  },
  async update(table, id, patch) {
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) { toast(error.message, 'danger'); throw error; }
    return data;
  },
  async remove(table, id) {
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
  const uid = Auth.currentUser().id;
  const blob = await resizeImageFile(file);
  const path = `${uid}/${foodItemId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) { toast(error.message, 'danger'); throw error; }
  const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function deleteFoodPhoto(url) {
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
