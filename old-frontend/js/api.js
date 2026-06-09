/* ═══════════════════════════════════════
   API HELPERS — Hermes Dashboard
   ═══════════════════════════════════════ */

export function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function relativeTime(iso) {
  try {
    const d = new Date(iso.replace('Z','+00:00'));
    const s = (new Date() - d) / 1000;
    if (s < 60) return s < 5 ? 'now' : Math.round(s) + 's ago';
    if (s < 3600) return Math.round(s/60) + 'm ago';
    if (s < 86400) return Math.round(s/60/60) + 'h ago';
    return Math.round(s/86400) + 'd ago';
  } catch { return '—'; }
}

export async function apiGet(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function apiPost(url, data) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    return await r.json();
  } catch { return null; }
}

export async function apiPatch(url, data) {
  try {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    return await r.json();
  } catch { return null; }
}

export async function apiDelete(url) {
  try {
    const r = await fetch(url, {method: 'DELETE'});
    return r.ok;
  } catch { return false; }
}

export function showToast(msg) {
  const c = document.getElementById('toasts');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<span>' + escapeHtml(msg) + '</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>';
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-out');
    setTimeout(() => t.remove(), 600);
  }, 6000);
}

// Track dedup for SSE toasts
export const toastedSet = new Set();
