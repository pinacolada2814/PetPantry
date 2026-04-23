
/* ═══════════════════════════════════════════════════════════
   Pet Pantry – app.js  (localStorage "database" + utilities)
═══════════════════════════════════════════════════════════ */

// ── DB helpers ──────────────────────────────────────────────
const DB = {
  get(key)       { try { return JSON.parse(localStorage.getItem('pp_' + key)) || []; } catch { return []; } },
  set(key, val)  { localStorage.setItem('pp_' + key, JSON.stringify(val)); },
  getObj(key)    { try { return JSON.parse(localStorage.getItem('pp_' + key)) || {}; } catch { return {}; } },
  setObj(key, v) { localStorage.setItem('pp_' + key, JSON.stringify(v)); },
};

// ── Auth ─────────────────────────────────────────────────────
const Auth = {
  currentUser() { return DB.getObj('current_user'); },
  login(user)   { DB.setObj('current_user', user); },
  logout()      { localStorage.removeItem('pp_current_user'); },
  isLoggedIn()  { return !!DB.getObj('current_user').id; },
  require()     {
    if (!Auth.isLoggedIn()) { window.location.href = 'index.html'; return false; }
    return true;
  }
};

// ── UUID ─────────────────────────────────────────────────────
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
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
function nowISO() { return new Date().toISOString().slice(0, 16); }

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
