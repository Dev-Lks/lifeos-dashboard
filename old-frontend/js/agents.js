/* Agents — Life OS briefing cards */
import { escapeHtml } from './api.js';
import { badge, emptyState, statusBadge } from './components.js';

const AGENTS = [
  {id:'orchestrator',icon:'🤖',name:'Orchestrator',role:'Top-level coordination', action:'Route work'},
  {id:'scout',icon:'🔎',name:'Scout',role:'Research & intelligence', action:'Ask research'},
  {id:'scribe',icon:'✍️',name:'Scribe',role:'Writing & content', action:'Draft content'},
  {id:'reach',icon:'📡',name:'Reach',role:'Marketing & growth', action:'Plan campaign'},
  {id:'dev',icon:'⚙️',name:'Dev',role:'Development & automation', action:'Build system'}
];

export function renderAgentCards(d) {
  const el = document.getElementById('agentGridView');
  if (!el) return;
  if (!d || !d.agents) {
    el.innerHTML = emptyState('No agent telemetry', 'Agent cards appear when dashboard data loads.');
    return;
  }
  const mx = d.max_responses || 1;
  el.innerHTML = `
    <div class="life-header life-page-header">
      <div><div class="life-eyebrow">AgentOS Team</div><h2>Agents</h2><p>Status, roles, recent activity and quick handoff surfaces for Lucas’s five-agent system.</p></div>
      <div class="life-header-actions">${badge(`${d.agents.length} agents`, 'accent')}</div>
    </div>
    <div class="agent-grid-modern">
      ${d.agents.map(a => renderAgent(a, mx)).join('')}
    </div>`;
}

function renderAgent(a, mx) {
  const code = (a.code || a.name || '').toLowerCase();
  const ac = AGENTS.find(x => x.id === code) || {icon:'🤖', name:a.name, role:a.role, action:'Open'};
  const pct = mx > 0 ? Math.round((a.responses || 0) / mx * 100) : 0;
  return `<article class="agent-card agent-card-modern">
    <div class="agent-topline">
      <div class="agent-avatar">${ac.icon}</div>
      <div><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.role || ac.role)}</p></div>
      ${statusBadge(a.status || 'dormant', a.status === 'active')}
    </div>
    <div class="agent-last-action">
      <span>Latest action</span>
      <strong>${escapeHtml(a.last_task || 'No recent action logged')}</strong>
      <small>${escapeHtml(a.last_relative || '—')}</small>
    </div>
    <div class="agent-metrics-row">
      <div><span>Responses</span><strong>${escapeHtml(a.responses || 0)}</strong></div>
      <div><span>Success</span><strong>${escapeHtml(a.success_pct || '—')}%</strong></div>
      <div><span>Model</span><strong title="${escapeHtml(a.model || '—')}">${escapeHtml(a.model || '—')}</strong></div>
    </div>
    <div class="agent-bar"><div class="agent-bar-fill" style="width:${pct}%"></div></div>
    <div class="agent-actions-row">
      <button class="life-btn" onclick="document.querySelector('[data-tab=\\'content\\']')?.click()">Docs</button>
      <button class="life-btn life-btn-primary" onclick="document.querySelector('[data-tab=\\'tasks\\']')?.click()">${escapeHtml(ac.action)}</button>
    </div>
  </article>`;
}
