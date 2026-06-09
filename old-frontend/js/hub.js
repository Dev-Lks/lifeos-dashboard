/* Home — Life OS Command Center */
import { escapeHtml, apiGet, showToast, toastedSet } from './api.js';
import { badge, emptyState, loading, metricRow, section, stat, statusBadge } from './components.js';

const AGENTS = [
  {id:'orchestrator',icon:'🤖',name:'Orchestrator',role:'Coordination'},
  {id:'scout',icon:'🔎',name:'Scout',role:'Research'},
  {id:'scribe',icon:'✍️',name:'Scribe',role:'Writing'},
  {id:'reach',icon:'📡',name:'Reach',role:'Growth'},
  {id:'dev',icon:'⚙️',name:'Dev',role:'Builds'},
];

let hubHydrated = false;
let hubHydrating = false;
let cachedCommandCenter = null;
let cachedCommandCenterAt = 0;
const COMMAND_CENTER_TTL_MS = 45000;

export function renderHub(data) {
  _renderCmdBar();
  _renderHero(data);
  _renderQuickActions();
  _renderSystemHealth(data);
  _renderAgentBriefing(data);
  _renderRecentFeed(data);
  _hydrateLifeSections({silent: hubHydrated});
}

function _renderCmdBar() {
  const el = document.getElementById('hubCmdBar');
  if (!el) return;
  el.innerHTML = `
    <span class="hub-cmd-mark">⌘</span>
    <input type="text" id="hubCmdInput" placeholder="Command Center — type agents, tasks, automations, routine, finance..." autocomplete="off">
    <span class="hub-cmd-hint">Ctrl K</span>
  `;
  const input = document.getElementById('hubCmdInput');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    const cmd = input.value.trim().toLowerCase();
    input.value = '';
    const routes = {agents:'agents',agent:'agents',tasks:'tasks',kanban:'tasks',automations:'automations',automation:'automations',auto:'automations',schedule:'schedule',cron:'schedule',finance:'finances',finances:'finances',money:'finances',routine:'routine',habits:'routine',content:'content',docs:'content',dreams:'dreams',dream:'dreams',projects:'projects',project:'projects'};
    if (routes[cmd]) document.querySelector(`[data-tab="${routes[cmd]}"]`)?.click();
    else if (cmd === 'status') showToast('🟢 Life OS operational');
    else showToast(`Unknown command: ${cmd}. Try Ctrl+K.`);
  });
}

function _renderHero(data) {
  const pulse = document.getElementById('hubPulse');
  if (!pulse) return;
  const date = new Date().toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'});
  const activeAgents = (data?.agents || []).filter(a => a.status === 'active').length;
  const auto = data?.lifeos?.automations || {total:0, enabled:0};
  pulse.innerHTML = `
    <div class="command-hero">
      <div>
        <div class="life-eyebrow">${escapeHtml(date)} · Personal Mission Control</div>
        <h1>Today’s Command Center</h1>
        <p>Focus, agents, automations, tasks and daily systems in one calm operating layer.</p>
      </div>
      <div class="command-hero-stats">
        ${stat('Agents active', String(activeAgents), 'live pulse')}
        ${stat('Automations', String(auto.enabled || 0), `${auto.total || 0} total`)}
        ${stat('System success', `${data?.integrity_pct || 100}%`, 'agent logs')}
      </div>
    </div>`;
}

function _renderQuickActions() {
  const el = document.getElementById('hubActions');
  if (!el) return;
  const actions = [
    ['+ New Task', "document.querySelector('[data-tab=\\'tasks\\']').click(); setTimeout(() => document.querySelector('.kanban-add-btn')?.click(), 150)"],
    ['+ Automation', "document.querySelector('[data-tab=\\'automations\\']').click(); setTimeout(() => window.showAutomationForm?.(), 300)"],
    ['+ Transaction', "document.querySelector('[data-tab=\\'finances\\']').click(); setTimeout(() => window.showAddTransaction?.(), 250)"],
    ['+ Habit', "document.querySelector('[data-tab=\\'routine\\']').click(); setTimeout(() => window.showAddHabit?.(), 250)"],
  ];
  el.innerHTML = actions.map(([label, on]) => `<button class="hub-action-btn life-action-tile" onclick="${on}"><span>${escapeHtml(label)}</span><small>quick action</small></button>`).join('');
}

function _renderSystemHealth(data) {
  const el = document.getElementById('hubHealth');
  if (!el) return;
  const vps = data?.vps || {};
  el.innerHTML = `
    ${metricRow('CPU', `${vps.cpu_pct || 0}%`)}
    ${metricRow('Memory', `${vps.mem_pct || 0}%`)}
    ${metricRow('Disk', `${vps.disk_pct || 0}%`)}
    ${metricRow('Sessions', String(data?.sessions?.count || 0))}
    ${metricRow('Uptime', data?.gateway?.uptime_seconds ? Math.floor(data.gateway.uptime_seconds/86400)+'d' : '—')}
  `;
}

function _renderAgentBriefing(data) {
  const chart = document.getElementById('hubChart');
  if (!chart) return;
  const agents = data?.agents || [];
  chart.innerHTML = agents.map(a => {
    const meta = AGENTS.find(x => x.id === a.code || x.name === a.name) || {icon:'🤖', role:a.role};
    return `<div class="agent-brief-row">
      <div class="agent-brief-icon">${meta.icon}</div>
      <div><strong>${escapeHtml(a.name)}</strong><span>${escapeHtml(a.last_task || a.role || meta.role || 'Ready')}</span></div>
      ${statusBadge(a.status || 'dormant', a.status === 'active')}
    </div>`;
  }).join('') || emptyState('No agent activity yet', 'Agent briefing appears here after the first activity log.');
}

function _renderRecentFeed(data) {
  const el = document.getElementById('hubFeed');
  if (!el) return;
  const activity = data?.activity || [];
  el.innerHTML = activity.length ? activity.slice(0, 8).map(a =>
    `<div class="hub-feed-item life-feed-item">
      ${badge((a.agent || 'agent').toUpperCase(), a.status === 'completed' ? 'success' : 'neutral')}
      <span class="hub-feed-text">${escapeHtml(a.task || '')}</span>
      <span class="hub-feed-time">${escapeHtml(a.relative || '')}</span>
    </div>`
  ).join('') : emptyState('No recent activity', 'Completed agent work will appear here.');
}

async function _hydrateLifeSections(opts={}) {
  const tips = document.getElementById('hubTips');
  if (!tips) return;
  const silent = Boolean(opts.silent);
  const now = Date.now();
  const cacheFresh = cachedCommandCenter && (now - cachedCommandCenterAt < COMMAND_CENTER_TTL_MS);
  if (cacheFresh) {
    _renderLifeSections(cachedCommandCenter, tips);
    return;
  }
  if (hubHydrating) return;
  hubHydrating = true;
  if (!silent && !hubHydrated) tips.innerHTML = loading('Loading Command Center intelligence...');
  const cc = await apiGet('/api/lifeos/command-center');
  hubHydrating = false;
  if (!cc) {
    if (!hubHydrated) tips.innerHTML = emptyState('Command Center unavailable', 'Backend intelligence endpoint did not respond.');
    return;
  }
  cachedCommandCenter = cc;
  cachedCommandCenterAt = Date.now();
  _renderLifeSections(cc, tips);
}

function _renderLifeSections(cc, tips) {
  const recommendations = cc.recommendations || [];
  const focus = cc.today_focus || [];
  const projects = cc.active_projects || [];
  const agents = cc.agent_briefing || {};
  const automations = cc.upcoming_automations || [];
  const habits = cc.habits?.today?.habits || cc.habits?.today || [];
  const timeline = cc.activity_timeline || [];

  tips.innerHTML = `
    <div class="command-grid-4 life-command-center">
      ${section('Today Focus', focus.length ? focus.map(t => `<div class="focus-item"><strong>${escapeHtml(t.title)}</strong><span>${badge(t.priority || 'medium', priorityVariant(t.priority))}${t.assignee ? badge(t.assignee, 'neutral') : ''}${t.due_date ? badge(t.due_date, 'muted') : ''}</span></div>`).join('') : emptyState('No active tasks', "Create one task to define today's focus."), {subtitle:'Top tasks selected from priority and due dates'})}
      ${section('Active Projects', projects.length ? projects.slice(0,5).map(p => `<div class="focus-item" style="cursor:pointer" onclick="window.switchTab('projects')"><strong>📁 ${escapeHtml(p.name)}</strong><span>${badge(`${p.open_tasks || 0} tasks`, 'neutral')}${p.stale ? badge('stale', 'warning') : statusBadge(p.status || 'active', true)}</span></div>`).join('') : emptyState('No active projects', 'Create a project to organize work.'), {subtitle:'Project hubs and next-action pressure'})}
      ${section('Agent Briefing', Object.entries(agents).map(([code, info]) => `<div class="focus-item"><strong>${agentIcon(code)} ${escapeHtml(code)}</strong><span>${statusBadge(info.status || 'idle', ['active','available'].includes(info.status))}${info.queued ? badge(`${info.queued} queued`, info.queued > 2 ? 'warning' : 'accent') : ''}</span></div>`).join('') || emptyState('No agent state', 'Agent actions will appear here.'), {subtitle:'Idle, active, overloaded, or available'})}
      ${section('Upcoming Automations', automations.length ? automations.map(a => `<div class="focus-item"><strong>⚙️ ${escapeHtml(a.name)}</strong><span>${badge(a.owner_agent || 'system', 'neutral')}${badge(a.schedule || a.type || 'manual', 'accent')}</span></div>`).join('') : emptyState('No enabled automations', 'Create one automation to reduce manual work.'), {subtitle:'Enabled low-code systems'})}
      ${section('Habits', habits.length ? habits.slice(0,6).map(h => `<div class="focus-item"><strong>${escapeHtml(h.icon || '✅')} ${escapeHtml(h.name)}</strong><span>${statusBadge(h.done_today || h.completed ? 'done' : 'pending', h.done_today || h.completed)}</span></div>`).join('') : emptyState('No habits yet', 'Add daily habits in Routine.'), {subtitle:'Routine consistency surface'})}
      ${section('Recommendations', recommendations.length ? recommendations.map(r => `<div class="focus-item rec-${escapeHtml(r.severity || 'low')}"><strong>${severityIcon(r.severity)} ${escapeHtml(r.message)}</strong><span>${badge(r.type || 'system', r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warning' : 'neutral')}</span></div>`).join('') : emptyState('No recommendations', 'System is clear.'), {subtitle:'Actions proposed by Life OS intelligence'})}
      ${section('System Health', `<div class="focus-item"><strong>Database</strong><span>${statusBadge(cc.system_health?.database || 'unknown', cc.system_health?.database === 'ok')}</span></div><div class="focus-item"><strong>Open tasks</strong><span>${badge(String(cc.system_health?.tasks?.total || 0), 'neutral')}</span></div><div class="focus-item"><strong>Recommendations</strong><span>${badge(String(cc.system_health?.recommendation_count || 0), 'accent')}</span></div>`, {subtitle:'Only operational signals'})}
      ${section('Activity Timeline', timeline.length ? timeline.slice(0,8).map(x => `<div class="focus-item"><strong>${timelineIcon(x.type)} ${escapeHtml(x.label || 'event')}</strong><span>${badge(x.status || x.type, 'neutral')}</span></div>`).join('') : emptyState('No activity timeline', 'Tasks, automations, and agents will appear here.'), {subtitle:'Recent system movement'})}
    </div>`;
  hubHydrated = true;
}

function agentIcon(code) { return {orchestrator:'🤖', scout:'🔎', scribe:'✍️', reach:'📡', dev:'⚙️'}[code] || '🤖'; }
function severityIcon(level) { return level === 'high' ? '🚨' : level === 'medium' ? '⚠️' : '💡'; }
function timelineIcon(type) { return type === 'automation' ? '⚙️' : type === 'agent_action' ? '🤖' : '✓'; }
function priorityWeight(p) { return {high:0, medium:1, low:2}[p] ?? 1; }
function priorityVariant(p) { return p === 'high' ? 'danger' : p === 'low' ? 'muted' : 'warning'; }

export function updateHubFromSSE(data) {
  if (!document.getElementById('panel-overview')?.classList.contains('active')) return;
  _renderSystemHealth(data);
  _renderAgentBriefing(data);
  _renderRecentFeed(data);
  if (data?.activity?.length) {
    const r = data.activity[0];
    if (r.status === 'completed') {
      const key = r.agent + ':' + r.task + ':' + r.time;
      if (!toastedSet.has(key)) {
        toastedSet.add(key);
        showToast(r.agent + ' completed: ' + r.task);
      }
    }
  }
}
