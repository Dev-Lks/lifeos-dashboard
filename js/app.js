/* ═══════════════════════════════════════
   APP — Init, Tab Switching, Activity Bar
   ═══════════════════════════════════════ */

 // Only always-needed modules stay as static imports
import { apiGet, showToast, toastedSet } from './api.js';
import { connectSSE, isSSEActive } from './sse.js';
import { renderHub, updateHubFromSSE } from './hub.js';
import { initCommandPalette } from './command-palette.js';

let lastData = null;
let cachedCrons = [];
let _animatingTab = false;

// ── Unload timers for tab data ──
const _unloadTimers = {};

function _scheduleUnload(name) {
  if (_unloadTimers[name]) clearTimeout(_unloadTimers[name]);
  if (name === 'overview') return;
  _unloadTimers[name] = setTimeout(() => {
    const panel = document.getElementById('panel-' + name);
    if (!panel || !panel.classList.contains('active')) {
      if (name === 'tasks') {
        const grid = document.getElementById('kanbanGrid');
        if (grid) grid.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);font-family:var(--font-body)">>_ unloaded. click Tasks to reload</div>';
      }
      if (name === 'content') {
        const preview = document.getElementById('contentPreview');
        if (preview) preview.innerHTML = '<p style="color:var(--text-tertiary);padding:40px;text-align:center;font-family:var(--font-body)">>_ unloaded. click Content to reload</p>';
      }
    }
    delete _unloadTimers[name];
  }, 300000);
}
window.addEventListener('focus', () => {
  Object.keys(_unloadTimers).forEach(k => { clearTimeout(_unloadTimers[k]); delete _unloadTimers[k]; });
});

function updateAll(d) {
  lastData = d;
  
  if (d.activity?.length) {
    const a = d.activity[0];
    const atEl = document.getElementById('activityText');
    const atTime = document.getElementById('activityTime');
    if (atEl) atEl.textContent = a.agent + ': ' + a.task;
    if (atTime) atTime.textContent = a.relative;
  } else {
    const atEl = document.getElementById('activityText');
    const atTime = document.getElementById('activityTime');
    if (atEl) atEl.textContent = 'Life OS operational';
    if (atTime) atTime.textContent = 'now';
  }
  
  if (document.getElementById('panel-overview')?.classList.contains('active')) {
    renderHub(d);
  }
  
  const agentsPanel = document.getElementById('panel-agents');
  if (agentsPanel?.classList.contains('active')) {
    import('./agents.js').then(m => m.renderAgentCards(d));
  }
  
  if (d.crons) cachedCrons = d.crons;
}

const TAB_ALIASES = { finance: 'finances', home: 'overview', automations: 'automations', projects: 'projects' };
function normalizeTabName(name) { return TAB_ALIASES[name] || name || 'overview'; }

function switchTab(name) {
  name = normalizeTabName(name);
  const titles = {overview:'Command Center', agents:'Agents', tasks:'Tasks', automations:'Automations', schedule:'Schedule', content:'Knowledge', dreams:'Dreams', finances:'Finance', routine:'Routine', projects:'Projects'};
  const pageTitle = document.getElementById('osPageTitle');
  if (pageTitle) pageTitle.textContent = titles[name] || name;
  if (_animatingTab) return;
  
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tabBtn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (tabBtn) tabBtn.classList.add('active');
  
  // Cancel unload timer for this tab
  if (_unloadTimers[name]) { clearTimeout(_unloadTimers[name]); delete _unloadTimers[name]; }
  
  // Close mobile nav
  const navTabs = document.getElementById('navTabs');
  if (navTabs) navTabs.classList.remove('open');
  
  const oldPanel = document.querySelector('.tab-panel.active');
  const newPanel = document.getElementById('panel-' + name);
  if (!newPanel) return;
  if (oldPanel === newPanel) { _renderTab(name); return; }
  
  _animatingTab = true;
  
  // Fade out old panel
  if (oldPanel) {
    oldPanel.classList.remove('active');
    // opacity transitions from 1 → 0 (CSS handles this)
  }
  
  // Show and fade in new panel
  newPanel.style.display = 'block';
  // Force reflow so browser registers opacity:0 before adding active
  void newPanel.offsetHeight;
  newPanel.classList.add('active');
  
  setTimeout(() => {
    _renderTab(name);
    _animatingTab = false;
    // Schedule unload
    _scheduleUnload(name);
    
    // Update URL
    if (!window._popstateActive) {
      const url = name === 'overview' ? '/' : '/' + name;
      history.pushState({tab: name}, '', url);
    }
  }, 350);
}

function _renderTab(name) {
  if (name === 'overview' && lastData) renderHub(lastData);
  if (name === 'agents') import('./agents.js').then(m => { if (lastData) m.renderAgentCards(lastData); }).catch(e => console.error('Failed to load module:', e));
  if (name === 'tasks') import('./tasks.js').then(m => m.fetchTasks()).catch(e => console.error('Failed to load module:', e));
  if (name === 'automations') import('./automations.js').then(m => m.renderAutomations()).catch(e => console.error('Failed to load module:', e));
  if (name === 'content') import('./content.js').then(m => m.loadContentDocs()).catch(e => console.error('Failed to load module:', e));
  if (name === 'schedule') {
    if (!cachedCrons.length) {
      apiGet('/api/crons').then(c => { cachedCrons = c || []; loadSchedule(); });
    } else {
      loadSchedule();
    }
    async function loadSchedule() {
      import('./schedule.js').then(m => {
        m.initSchedule();
        m.renderSchedule(cachedCrons);
        m.renderSchedStats();
      }).catch(e => console.error('Failed to load module:', e));
    }
    return;
  }
  if (name === 'finances') import('./finance.js').then(m => m.renderFinances()).catch(e => console.error('Failed to load module:', e));
  if (name === 'routine') import('./routine.js').then(m => m.renderRoutine()).catch(e => console.error('Failed to load module:', e));
  if (name === 'dreams') import('./dreams.js').then(m => m.renderDreamTab()).catch(e => console.error('Failed to load module:', e));
  if (name === 'projects') import('./projects.js').then(m => m.renderProjects()).catch(e => console.error('Failed to load module:', e));
}

window.switchTab = switchTab;

// ── History API ──
window.addEventListener('popstate', (e) => {
  const tab = normalizeTabName(e.state?.tab || location.pathname.slice(1) || 'overview');
  window._popstateActive = true;
  switchTab(tab);
  window._popstateActive = false;
});

// ── Keyboard navigation ──
document.addEventListener('keydown', (e) => {
  // Don't capture if typing in an input/textarea
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') {
      e.target.blur();
    }
    return;
  }
  
  switch (e.key) {
    case '1': switchTab('overview'); break;
    case '2': switchTab('agents'); break;
    case '3': switchTab('tasks'); break;
    case '4': switchTab('automations'); break;
    case '5': switchTab('schedule'); break;
    case '6': switchTab('content'); break;
    case '7': switchTab('dreams'); break;
    case '8': switchTab('finances'); break;
    case '9': switchTab('routine'); break;
    case '0': switchTab('projects'); break;
    case 'g': case 'G':
      // Focus command bar on hub
      if (document.getElementById('panel-overview')?.classList.contains('active')) {
        const inp = document.getElementById('hubCmdInput');
        if (inp) inp.focus();
      } else {
        switchTab('overview');
        setTimeout(() => { document.getElementById('hubCmdInput')?.focus(); }, 400);
      }
      break;
    case 'Escape':
      // Close any open forms
      document.querySelectorAll('[id$="Form"]').forEach(f => { if (f.style.display !== 'none') f.style.display = 'none'; });
      break;
  }
});

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  window.__lifeImports = { showToast };
  initCommandPalette();

  // Mobile nav toggle
  const mobileToggle = document.getElementById('mobileToggle');
  const navTabs = document.getElementById('navTabs');
  if (mobileToggle && navTabs) {
    mobileToggle.addEventListener('click', () => {
      navTabs.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav')) {
        navTabs.classList.remove('open');
      }
    });
  }
  
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
  // Detect initial tab from URL
  const initialTab = normalizeTabName(location.pathname.slice(1) || 'overview');
  
  // Initial data fetch — always fetch before any tab switch
  apiGet('/api/data').then(d => {
    if (d) {
      updateAll(d);
      renderHub(d);
      if (d.crons) cachedCrons = d.crons;
    }
    // Only switch tab AFTER data is loaded (fixes race condition)
    if (initialTab !== 'overview') {
      switchTab(initialTab);
    }
  });
  
  // Connect SSE (after data is loaded, SSE handles updates)
  connectSSE((data) => {
    updateAll(data);
    updateHubFromSSE(data);
  }, () => {
    // SSE onerror fallback — refetch data
    apiGet('/api/data').then(d => {
      if (d) {
        updateAll(d);
        renderHub(d);
        if (d.crons) cachedCrons = d.crons;
      }
    });
  });
  
  // Preload tasks
  const preload = () => import('./tasks.js');
  if ('requestIdleCallback' in window) requestIdleCallback(preload, {timeout: 3000});
  else setTimeout(preload, 2000);
  
  console.log('🚀 Hermes Dashboard v3.2 loaded');
});
