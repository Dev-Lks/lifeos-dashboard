/* ═══════════════════════════════════════
   DREAMS TAB
   ═══════════════════════════════════════ */

import { escapeHtml } from './api.js';

export function renderDreamTab() {
  const dreams = JSON.parse(localStorage.getItem('_dreams') || '[]');
  const statsEl = document.getElementById('dreamStatsGrid');
  const entriesEl = document.getElementById('dreamEntries');
  if (!statsEl || !entriesEl) return;

  if (!dreams.length) {
    statsEl.innerHTML = '<div class="dream-empty">No dreams recorded yet.</div>';
    entriesEl.innerHTML = ''; return;
  }
  const total = dreams.length;
  statsEl.innerHTML = '<div class="dream-card"><div class="dream-card-icon">💭</div><div class="dream-card-value">' + total + '</div><div class="dream-card-label">Total Dreams</div></div>';
  entriesEl.innerHTML = '';
  dreams.slice(0, 10).forEach(d => {
    entriesEl.innerHTML += '<div class="dream-entry-card"><div style="font-size:12px;color:var(--text-primary)"><strong>' + escapeHtml(d.title || 'Dream') + '</strong></div><div style="font-size:11px;color:var(--text-secondary)">' + d.date + '</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + escapeHtml(d.raw_text) + '</div></div>';
  });
}
