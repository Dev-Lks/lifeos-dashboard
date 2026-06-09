/* ═══════════════════════════════════════
   SCHEDULE TAB — Cron Jobs Dashboard
   ═══════════════════════════════════════ */

import { escapeHtml, showToast } from './api.js';

const FREQ_ICONS = { daily: '🔄', weekly: '📅', monthly: '📆', one_shot: '⏰', other: '⚙️' };

const GROUPS = [
  { key: 'running_soon', label: '🔜 Running Soon (next 24h)', filter: j => _isSoon(j) },
  { key: 'daily',        label: '🔄 Daily',             filter: j => classifyFrequency(j.schedule) === 'daily' },
  { key: 'weekly',       label: '📅 Weekly',            filter: j => classifyFrequency(j.schedule) === 'weekly' },
  { key: 'monthly',      label: '📆 Monthly',           filter: j => classifyFrequency(j.schedule) === 'monthly' },
  { key: 'one_shot',     label: '⏰ One-shot',           filter: j => classifyFrequency(j.schedule) === 'one_shot' },
  { key: 'other',        label: '⚙️ Other',              filter: j => classifyFrequency(j.schedule) === 'other' },
];

/* ── Frequency classifier ── */

export function classifyFrequency(expr) {
  if (!expr || expr.toLowerCase().includes('once at') || expr.toLowerCase().startsWith('once')) return 'one_shot';
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'other';
  const [minute, hour, dom, month, dow] = parts;
  if (dow !== '*') return 'weekly';
  if (dom !== '*') return 'monthly';
  if (minute.startsWith('*/') || (minute === '*' && hour === '*')) return 'daily';
  if (minute === '0' && hour !== '*') return 'daily';
  return 'other';
}

function _isSoon(job) {
  const nr = (job.next_run || '').toLowerCase();
  return nr.includes('imminent') ||
    (nr.includes('in ') && (
      nr.includes('s') || nr.includes('m') ||
      (nr.includes('h') && !nr.includes('d'))
    )) ||
    nr.includes('tomorrow');
}

/* ── Main render ── */

export function renderSchedule(crons) {
  const el = document.getElementById('scheduleContent');
  if (!el) return;
  const jobs = crons || [];

  // Apply search + filters
  const searchVal = (document.getElementById('schedSearch')?.value || '').toLowerCase().trim();
  const ownerFilter = document.getElementById('schedFilterOwner')?.value || '';
  const freqFilter = document.getElementById('schedFilterFreq')?.value || '';

  let filtered = jobs;
  if (searchVal) {
    filtered = filtered.filter(j =>
      (j.name || '').toLowerCase().includes(searchVal) ||
      (j.command || '').toLowerCase().includes(searchVal) ||
      (j.description || '').toLowerCase().includes(searchVal)
    );
  }
  if (ownerFilter) {
    filtered = filtered.filter(j => (j.owner || 'system') === ownerFilter);
  }
  if (freqFilter) {
    filtered = filtered.filter(j => classifyFrequency(j.schedule) === freqFilter);
  }

  // Group
  let html = '';
  const seen = new Set();

  GROUPS.forEach(g => {
    const members = filtered.filter(j => !seen.has(j.name || j.command) && g.filter(j));
    if (!members.length) return;
    members.forEach(j => seen.add(j.name || j.command));
    html += `<div class="sched-group"><div class="sched-group-title">${g.label} <span class="sched-group-count">${members.length}</span></div>`;
    html += members.map(j => renderJobCard(j)).join('');
    html += '</div>';
  });

  if (!html) {
    html = `<div class="sched-empty">>_ no jobs match your filters</div>`;
  }

  el.innerHTML = html;

  // Render timeline
  renderSchedTimeline(jobs);
  // Render stats
  renderSchedStats();
}

/* ── Job card ── */

function renderJobCard(job) {
  const name = job.name || job.command || '—';
  const freq = classifyFrequency(job.schedule);
  const freqIcon = FREQ_ICONS[freq] || '⏰';
  const isSoon = _isSoon(job);
  const nr = job.next_run || '—';

  return `<div class="sched-card">
    <div class="sched-card-header">
      <span class="sched-card-name">${freqIcon} ${escapeHtml(typeof name === 'string' ? name : String(name))}</span>
      <span class="sched-owner-tag ${job.owner === 'hermes' ? 'owner-hermes' : 'owner-system'}">${job.owner || 'system'}</span>
    </div>
    <div class="sched-card-schedule">
      <span class="sched-human">${escapeHtml(job.description || '—')}</span>
      <span class="sched-cron">${job.schedule ? 'cron(' + escapeHtml(job.schedule) + ')' : 'once'}</span>
    </div>
    <div class="sched-card-next">
      <span class="sched-next-label ${isSoon ? 'sched-next-soon' : nr === '—' ? '' : ''}">📅 Next: ${escapeHtml(nr)}</span>
      ${job.source ? `<span class="sched-source-path">📂 ${escapeHtml(job.source.replace('/root/', '~/'))}</span>` : ''}
    </div>
    <div class="sched-card-actions">
      <button class="btn-cyber btn-cyber-ghost sched-run-btn" onclick="window.runJobNow('${escapeHtml(job.id || name)}')" style="font-size:10px;padding:4px 10px">▶ Run Now</button>
      <span class="sched-status-dot ${isSoon ? 'status-active' : 'status-idle'}"></span>
      <span class="sched-status-text">${isSoon ? 'running soon' : freq === 'one_shot' ? 'one-shot' : 'scheduled'}</span>
    </div>
  </div>`;
}

/* ── Stats ── */

export function renderSchedStats() {
  fetch('/api/crons/summary').then(r => r.json()).then(s => {
    if (!s) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('schedTotalJobs', s.total);
    set('schedTodayJobs', s.running_today);
    set('schedNextJob', s.next_job ? `${s.next_job.name} ${s.next_job.in}` : '—');
  }).catch(() => {});
}

/* ── Timeline ── */

export function renderSchedTimeline(jobs) {
  const track = document.getElementById('schedTimelineTrack');
  const hoursEl = document.getElementById('schedTimelineHours');
  if (!track || !hoursEl) return;

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Find jobs with next_run reference that we can position
  // Use jobs that have a cron expression to calculate hour
  const timedJobs = jobs.filter(j => {
    if (!j.schedule || classifyFrequency(j.schedule) !== 'daily') return false;
    const parts = j.schedule.trim().split(/\s+/);
    return parts.length === 5 && parts[0] === '0' && parts[1] !== '*';
  }).slice(0, 12); // max 12 dots

  // Hour markers
  hoursEl.innerHTML = ['00:00', '06:00', '12:00', '18:00', '23:59']
    .map(h => `<span>${h}</span>`).join('');

  if (!timedJobs.length) {
    track.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-tertiary);font-size:11px">>_ no daily scheduled jobs found</div>';
    return;
  }

  track.innerHTML = timedJobs.map(j => {
    const parts = j.schedule.trim().split(/\s+/);
    const hour = parseInt(parts[1]) || 0;
    const minute = parseInt(parts[0]) || 0;
    const pct = ((hour * 60 + minute) / (24 * 60)) * 100;
    const label = (j.name || j.command || '').slice(0, 18);
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return `<div class="sched-timeline-job" style="left:${Math.min(pct, 95)}%" title="${escapeHtml(label)} at ${time}" onclick="document.querySelector('[data-job-name=\\'${escapeHtml(j.name || '')}\\']')?.scrollIntoView({behavior:'smooth',block:'center'})">
      <span class="sched-timeline-dot"></span>
      <span class="sched-timeline-name">${escapeHtml(label)}</span>
    </div>`;
  }).join('');
}

/* ── Job controls ── */

window.runJobNow = function(id) {
  showToast(`▶ Running job ${escapeHtml(id)}...`);
  // Future: POST /api/crons/{id}/run
};

/* ── Filter handlers ── */

let filterTimer = null;

function applyFilters() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    // Fetch fresh cron data and re-render
    import('./api.js').then(({ apiGet }) => {
      apiGet('/api/crons').then(c => {
        if (c) renderSchedule(c);
      });
    });
  }, 200);
}

// Setup filters on first render
let _setupDone = false;

export function initSchedule() {
  if (_setupDone) return;
  _setupDone = true;
  ['schedSearch', 'schedFilterOwner', 'schedFilterFreq'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyFilters);
    if (el && el.tagName === 'SELECT') el.addEventListener('change', applyFilters);
  });
}
