/* ═══════════════════════════════════════
   ATLAS HUB — Primary Interface v2.1
   Dynamic, voice-ready, real-time system hub
   ═══════════════════════════════════════ */

import { apiGet, escapeHtml, showToast, toastedSet } from './api.js';
import { connectSSE } from './sse.js';

let atlasContext = null;
let healthCache = null;
let _voiceActive = false;
let _recognition = null;

function el(id) { return document.getElementById(id); }

/* ═══════ INFO PANEL RENDERING ═══════ */

function renderInfoFocus(ctx) {
  const list = el('infoFocusList');
  if (!list) return;
  const focus = ctx?.command_center?.today_focus || [];
  if (!focus.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--atlas-text-tertiary);padding:4px 0">No focus items — all clear ✨</div>';
    return;
  }
  list.innerHTML = focus.slice(0, 6).map(t => `
    <div class="atlas-focus-item">
      <div class="atlas-focus-dot ${t.priority || 'medium'}"></div>
      <span class="atlas-focus-text">${escapeHtml(t.title)}</span>
      <span class="atlas-focus-badge ${t.status || 'pending'}">${(t.status || 'pending').replace('_', ' ')}</span>
    </div>
  `).join('');
}

function renderInfoAgents(ctx) {
  const list = el('infoAgentList');
  if (!list) return;
  const agents = ctx?.command_center?.agent_briefing || {};
  const agentNames = { orchestrator: 'Orchestrator', scout: 'Scout', scribe: 'Scribe', reach: 'Reach', dev: 'Dev' };
  const icons = { orchestrator: '🤖', scout: '🔎', scribe: '✍️', reach: '📡', dev: '⚙️' };
  
  let html = '';
  for (const [key, a] of Object.entries(agentNames)) {
    const info = agents[key] || {};
    const status = info.status || 'idle';
    const queued = info.queued || 0;
    const completed7d = info.completed_7d || 0;
    html += `<div class="atlas-agent-row">
      <span style="font-size:14px;flex-shrink:0">${icons[key] || ''}</span>
      <div class="atlas-agent-dot ${status}"></div>
      <span class="atlas-agent-name">${a}</span>
      <span class="atlas-agent-queued">${queued > 0 ? queued + ' queued' : status}${completed7d ? ' · ' + completed7d + '/7d' : ''}</span>
    </div>`;
  }
  list.innerHTML = html;
}

async function renderInfoHealth(ctx) {
  const cpuEl = el('healthCPU');
  const ramEl = el('healthRAM');
  const diskEl = el('healthDisk');
  const dbEl = el('healthDB');
  if (!cpuEl) return;

  // Try to get real health data from /api/data
  let cpu = '—', ram = '—', disk = '—', db = 'ok';
  
  if (!healthCache) {
    try {
      const snap = await apiGet('/api/data');
      if (snap?.health) {
        healthCache = snap.health;
        cpu = (snap.health.cpu_percent ?? '—') + '%';
        ram = (snap.health.memory?.percent_used ?? '—') + '%';
        disk = (snap.health.disk?.percent_used ?? '—') + '%';
        
        // Color coding
        cpuEl.style.color = snap.health.cpu_percent > 80 ? 'var(--error)' : snap.health.cpu_percent > 50 ? 'var(--warning)' : '';
        ramEl.style.color = snap.health.memory?.percent_used > 80 ? 'var(--error)' : snap.health.memory?.percent_used > 50 ? 'var(--warning)' : '';
        diskEl.style.color = snap.health.disk?.percent_used > 80 ? 'var(--error)' : snap.health.disk?.percent_used > 50 ? 'var(--warning)' : '';
      }
    } catch {}
  } else {
    cpu = healthCache.cpu_percent ? healthCache.cpu_percent + '%' : '—';
    ram = healthCache.memory?.percent_used ? healthCache.memory.percent_used + '%' : '—';
    disk = healthCache.disk?.percent_used ? healthCache.disk.percent_used + '%' : '—';
  }
  
  const health = ctx?.system_health || {};
  db = health.database || 'ok';
  
  cpuEl.textContent = cpu;
  ramEl.textContent = ram;
  diskEl.textContent = disk;
  if (dbEl) dbEl.textContent = db;
}

function renderInfoFinance(ctx) {
  const totalEl = el('financeTotal');
  const budgetEl = el('financeBudget');
  const barEl = el('financeBar');
  const catEl = el('financeCategory');
  
  if (!totalEl) return;
  
  const finance = ctx?.finance?.summary;
  if (!finance) {
    totalEl.textContent = 'R$ 0,00';
    return;
  }
  
  const expense = finance.expense || 0;
  const budget = finance.by_category?.[0]?.budget || 1200;
  const pct = finance.by_category?.[0]?.budget_pct || 0;
  
  totalEl.textContent = `R$ ${expense.toFixed(2)}`;
  budgetEl.textContent = `R$ ${budget.toFixed(2)}`;
  
  if (barEl) {
    barEl.style.width = Math.min(pct, 100) + '%';
    barEl.style.background = pct > 80 ? 'var(--error)' : pct > 50 ? 'var(--warning)' : 'var(--atlas-accent)';
  }
  
  if (catEl && finance.by_category?.[0]) {
    catEl.textContent = `${finance.by_category[0].category}: R$ ${finance.by_category[0].total?.toFixed(2) || '0,00'}`;
  }
}

function renderInfoHabits(ctx) {
  const st = el('habitStatus');
  if (!st) return;
  const habits = ctx?.routine?.today?.habits || [];
  if (habits.length) {
    const h = habits[0];
    st.textContent = h.done_today ? '✅ feito hoje!' : 'não feito hoje';
    st.style.color = h.done_today ? 'var(--atlas-accent)' : 'var(--atlas-text-tertiary)';
  }
}

/* ═══════ ACTIVITY FEED ═══════ */

function renderActivityFeed(data) {
  const feedEl = el('atlasActivityFeed');
  if (!feedEl) return;
  
  const timeline = data?.activity_timeline || [];
  if (!timeline.length) {
    feedEl.innerHTML = '<div style="font-size:12px;color:var(--atlas-text-tertiary);padding:4px 0">No recent activity</div>';
    return;
  }
  
  feedEl.innerHTML = timeline.slice(0, 6).map(a => {
    const statusColor = a.status === 'completed' ? 'var(--atlas-accent)' : a.status === 'failed' ? 'var(--error)' : 'var(--warning)';
    const icon = a.status === 'completed' ? '✓' : a.status === 'failed' ? '✕' : '○';
    const time = a.time ? new Date(a.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04)">
      <span style="color:${statusColor};font-weight:700;flex-shrink:0">${icon}</span>
      <span style="flex:1;color:var(--atlas-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.label)}</span>
      <span style="color:var(--atlas-text-tertiary);font-size:11px;flex-shrink:0">${time}</span>
    </div>`;
  }).join('');
}

function renderInfoPanel(ctx) {
  if (!ctx) return;
  renderInfoFocus(ctx);
  renderInfoAgents(ctx);
  renderInfoHealth(ctx);
  renderInfoFinance(ctx);
  renderInfoHabits(ctx);
}

/* ═══════ VOICE INPUT (Web Speech API) ═══════ */

function setupVoiceButton() {
  const btn = el('atlasVoiceBtn');
  if (!btn) return;
  
  // Check if browser supports SpeechRecognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    btn.disabled = true;
    btn.title = 'Voice input not supported in this browser';
    return;
  }
  
  btn.disabled = false;
  btn.title = '🎤 Voice input — click to speak';
  
  _recognition = new SpeechRecognition();
  _recognition.continuous = false;
  _recognition.interimResults = false;
  _recognition.lang = 'pt-BR'; // Lucas speaks Portuguese
  
  _recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = el('atlasInput');
    if (input) {
      input.value = transcript;
      input.focus();
      // Auto-submit after brief delay
      setTimeout(() => {
        const form = el('atlasForm');
        if (form) form.requestSubmit();
      }, 300);
    }
    _voiceActive = false;
    btn.classList.remove('active');
    btn.textContent = '🎤';
    showToast('🎤 Ouvido: "' + transcript + '"');
  };
  
  _recognition.onerror = (event) => {
    _voiceActive = false;
    btn.classList.remove('active');
    btn.textContent = '🎤';
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast('🎤 Voice error: ' + event.error);
    }
  };
  
  _recognition.onend = () => {
    _voiceActive = false;
    btn.classList.remove('active');
    btn.textContent = '🎤';
  };
  
  btn.addEventListener('click', () => {
    if (_voiceActive) {
      _recognition.stop();
      _voiceActive = false;
      btn.classList.remove('active');
      btn.textContent = '🎤';
      return;
    }
    
    try {
      _recognition.start();
      _voiceActive = true;
      btn.classList.add('active');
      btn.textContent = '🔴';
      showToast('🎤 Ouvindo... fale agora');
    } catch (e) {
      showToast('🎤 Voice error: ' + e.message);
    }
  });
}

/* ═══════ TTS FEEDBACK — Atlas speaks ═══════ */

function pulseAtlasAvatar() {
  const avatar = document.querySelector('.atlas-hero-avatar');
  if (!avatar) return;
  avatar.style.animation = 'none';
  void avatar.offsetHeight;
  avatar.style.animation = 'atlasSpeakPulse 0.6s ease-out';
  
  // Add the keyframe if not exists
  if (!document.getElementById('atlasSpeakStyle')) {
    const style = document.createElement('style');
    style.id = 'atlasSpeakStyle';
    style.textContent = `
      @keyframes atlasSpeakPulse {
        0% { transform: scale(1); box-shadow: 0 0 24px rgba(0,229,160,0.25); }
        50% { transform: scale(1.12); box-shadow: 0 0 48px rgba(0,229,160,0.5); }
        100% { transform: scale(1); box-shadow: 0 0 24px rgba(0,229,160,0.25); }
      }
    `;
    document.head.appendChild(style);
  }
}

function speakText(text) {
  if (!window.speechSynthesis) return;
  
  // Only speak if browser TTS is available (user will integrate real TTS later)
  pulseAtlasAvatar();
  
  // Strip markdown for speech
  const clean = text
    .replace(/\*\*/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[*•-]\s*/g, '')
    .replace(/\n+/g, '. ');
  
  // Dispatch custom event that external TTS system can hook into
  window.dispatchEvent(new CustomEvent('atlas-speak', {
    detail: { text: clean, raw: text }
  }));
  
  // Also try browser native TTS as fallback
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 200));
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      // Reset avatar after speaking
      setTimeout(() => {
        const avatar = document.querySelector('.atlas-hero-avatar');
        if (avatar) avatar.style.animation = '';
      }, 200);
    };
    window.speechSynthesis.speak(utterance);
  }
}

// Listen for Atlas responses and pulse avatar
window.addEventListener('atlas-response', (e) => {
  if (e.detail?.text) {
    speakText(e.detail.text);
  }
});

/* ═══════ SSE CONNECTION ═══════ */

function onSSEData(data) {
  if (data?.command_center || data?.system_health) {
    renderInfoPanel(data);
  }
  if (data?.activity_timeline) {
    renderActivityFeed(data);
  }
  // Update activity bar
  if (data?.activity_timeline?.length) {
    const a = data.activity_timeline[0];
    const atEl = el('activityText');
    const atTime = el('activityTime');
    if (atEl) atEl.textContent = a.label.slice(0, 60);
    if (atTime) atTime.textContent = a.time ? new Date(a.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
  }
  // Refresh health on SSE
  healthCache = null;
}

/* ═══════ TAB SWITCHING ═══════ */

function switchToTab(name) {
  const hub = el('atlasHub');
  const contentArea = el('tabContentArea');
  const title = el('osPageTitle');
  const titles = {overview:'Atlas', agents:'Agents', tasks:'Tasks', automations:'Automations', schedule:'Schedule', content:'Knowledge', dreams:'Dreams', finances:'Finance', routine:'Routine', projects:'Projects'};
  
  if (name === 'overview' || !name) {
    if (hub) hub.style.display = 'flex';
    if (contentArea) { contentArea.classList.remove('visible'); contentArea.style.display = 'none'; }
    if (title) title.textContent = 'Atlas';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector('.tab-btn[data-tab="overview"]');
    if (btn) btn.classList.add('active');
    const statusEl = el('statusLabel');
    if (statusEl) statusEl.textContent = 'Atlas active';
    // Show info panel
    const infoPanel = el('atlasInfoPanel');
    if (infoPanel) infoPanel.style.display = 'flex';
    return;
  }
  
  if (hub) hub.style.display = 'none';
  if (contentArea) { contentArea.style.display = 'flex'; contentArea.classList.add('visible'); }
  
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');
  if (title) title.textContent = titles[name] || name;
  
  const statusEl = el('statusLabel');
  if (statusEl) statusEl.textContent = titles[name] || name;
  
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = el('panel-' + name);
  if (panel) panel.classList.add('active');
  
  // Hide info panel on sub-tabs
  const infoPanel = el('atlasInfoPanel');
  if (infoPanel) infoPanel.style.display = 'none';
  
  // Trigger app.js tab switching for data loading
  window.dispatchEvent(new CustomEvent('tab-switched', {detail: {tab: name}}));
  
  if (name === 'tasks') {
    window.dispatchEvent(new CustomEvent('tab-switched', {detail: {tab: name}}));
  }
  if (name === 'agents') {
    import('./agents.js').then(m => m.renderAgentCards());
  }
}

/* ═══════ INTEGRATION WITH right-hand-agent ═══════ */

function watchAtlasMessages() {
  const chat = el('atlasChat');
  if (!chat) return;
  
  const observer = new MutationObserver(() => {
    const empty = chat.querySelector('.atlas-empty-state');
    if (empty && chat.children.length > 1) {
      empty.style.display = 'none';
    }
    // Auto-scroll on new messages
    chat.scrollTop = chat.scrollHeight;
  });
  observer.observe(chat, { childList: true });
}

/* ═══════ INFO PANEL TOGGLE (mobile) ═══════ */

function setupInfoToggle() {
  const toggle = el('infoPanelToggle');
  const panel = el('atlasInfoPanel');
  if (!toggle || !panel) return;
  
  toggle.addEventListener('click', () => {
    panel.classList.toggle('mobile-visible');
    const isVisible = panel.classList.contains('mobile-visible');
    toggle.textContent = isVisible ? '✕ Info' : '📊 Info';
    toggle.style.background = isVisible ? 'rgba(0,229,160,0.15)' : '';
  });
}

/* ═══════ SYSTEM OVERRIDE — atlas-hub takes over tab switching ═══════ */

function overrideAppTabSwitch() {
  // Intercept app.js switchTab to use our Atlas-centric version
  const origSwitchTab = window.switchTab;
  if (origSwitchTab) {
    window._origAppSwitchTab = origSwitchTab;
    window.switchTab = function(name) {
      switchToTab(name);
      // Still call app.js for data loading, but only for sub-tabs
      if (name !== 'overview') {
        window._origAppSwitchTab(name);
      }
    };
  }
}

/* ═══════ BOOT ═══════ */

async function bootAtlasHub() {
  setupInfoToggle();
  setupVoiceButton();
  watchAtlasMessages();
  overrideAppTabSwitch();
  
  // Load initial context
  const ctx = await apiGet('/api/right-hand/context');
  if (ctx) {
    atlasContext = ctx;
    renderInfoPanel(ctx);
    renderActivityFeed(ctx);
  }
  
  // Also load activity from /api/data
  try {
    const snap = await apiGet('/api/data');
    if (snap?.activity_timeline) renderActivityFeed(snap);
  } catch {}
  
  // Connect to SSE for live updates
  connectSSE(onSSEData);
  
  // Expose tab switching globally
  window.switchToTab = switchToTab;
  
  // Bind sidebar tab clicks
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchToTab(btn.dataset.tab);
    });
  });
  
  // Check mobile screen
  if (window.innerWidth <= 1100) {
    const toggle = el('infoPanelToggle');
    if (toggle) toggle.style.display = 'block';
  }
  
  // Periodic context refresh (30s)
  setInterval(async () => {
    try {
      const ctx = await apiGet('/api/right-hand/context');
      if (ctx) {
        atlasContext = ctx;
        renderInfoPanel(ctx);
      }
      // Also refresh snapshot data for health
      const snap = await apiGet('/api/data');
      if (snap) {
        healthCache = snap.health || null;
        if (snap.activity_timeline) renderActivityFeed(snap);
      }
    } catch {}
  }, 30000);
  
  // Mobile resize listener
  window.addEventListener('resize', () => {
    const toggle = el('infoPanelToggle');
    if (!toggle) return;
    toggle.style.display = window.innerWidth <= 1100 ? 'block' : 'none';
  });
  
  // Voice-ready indicator: show toast confirming Web Speech availability
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    console.log('🎤 Voice input ready (Web Speech API)');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAtlasHub);
} else {
  bootAtlasHub();
}

// Load right-hand-agent for Atlas chat
import('./right-hand-agent.js').then(mod => {
  window.__atlasAsk = mod.askAtlas;
});
