/* Automations — create/run/manage personal Life OS automations */
import { apiGet, apiPost, apiPatch, apiDelete, escapeHtml, showToast, relativeTime } from './api.js';
import { badge, card, emptyState, loading, pageHeader, section, stat, statusBadge } from './components.js';

let automations = [];
let runs = [];

const TYPE_LABELS = {
  reminder: 'Reminder',
  recurring_task: 'Recurring Task',
  cron_job: 'Cron Job',
  agent_task: 'Agent Task',
  webhook: 'Webhook',
  manual: 'Manual Action',
};

export async function renderAutomations() {
  const root = document.getElementById('automationsContent');
  if (!root) return;
  root.innerHTML = loading('Loading automations...');
  const [list, recentRuns] = await Promise.all([
    apiGet('/api/automations'),
    apiGet('/api/automation-runs'),
  ]);
  automations = Array.isArray(list) ? list : [];
  runs = Array.isArray(recentRuns) ? recentRuns : [];
  render();
}

function render() {
  const root = document.getElementById('automationsContent');
  if (!root) return;
  const enabled = automations.filter(a=>a.enabled).length;
  root.innerHTML = `
    ${pageHeader({eyebrow:'Life OS systems', title:'Automations', body:'Create reminders, recurring tasks, cron wrappers, agent tasks, webhooks, and manual actions without editing code.', actions:'<button class="life-btn life-btn-primary" onclick="window.showAutomationForm()">+ New Automation</button>'})}
    <div class="life-stats-grid">
      ${stat('Automations', String(automations.length), 'total')}
      ${stat('Enabled', String(enabled), 'currently active')}
      ${stat('Runs', String(runs.length), 'recent history')}
    </div>
    <div id="automationFormMount"></div>
    <div class="automation-layout">
      <div class="automation-list">
        ${automations.length ? automations.map(renderAutomationCard).join('') : emptyState('No automations yet', 'Create your first Life OS automation from the button above.', '<button class="life-btn life-btn-primary" onclick="window.showAutomationForm()">Create automation</button>')}
      </div>
      <aside class="automation-runs">
        ${section('Run History', runs.length ? runs.slice(0,10).map(renderRun).join('') : emptyState('No runs yet', 'Use Run Now on an automation to create a run log.'), {subtitle:'Latest execution logs'})}
      </aside>
    </div>`;
}

function renderAutomationCard(a) {
  const type = TYPE_LABELS[a.type] || a.type;
  const status = statusBadge(a.enabled ? 'enabled' : 'disabled', a.enabled);
  const body = `
    <div class="automation-meta">
      ${badge(type,'accent')}${status}${a.owner_agent ? badge(a.owner_agent,'neutral') : ''}
    </div>
    <p class="automation-desc">${escapeHtml(configDescription(a))}</p>
    <div class="automation-schedule"><span>Frequency</span><strong>${escapeHtml(a.frequency || a.schedule || 'manual')}</strong></div>
    <div class="automation-schedule"><span>Last run</span><strong>${a.last_run_at ? relativeTime(a.last_run_at) : 'never'}</strong></div>
    <div class="automation-actions">
      <button class="life-btn life-btn-primary" onclick="window.runAutomationNow('${a.id}')">▶ Run Now</button>
      <button class="life-btn" onclick="window.showAutomationForm('${a.id}')">Edit</button>
      <button class="life-btn" onclick="window.toggleAutomation('${a.id}', ${a.enabled ? 'false' : 'true'})">${a.enabled ? 'Disable' : 'Enable'}</button>
      <button class="life-btn danger" onclick="window.deleteAutomation('${a.id}')">Delete</button>
    </div>`;
  return card(a.name, body, {icon:'⚙️'});
}

function configDescription(a) {
  const cfg = a.config || {};
  return cfg.message || cfg.prompt || cfg.url || cfg.task || a.schedule || 'Manual automation ready to run.';
}

function renderRun(r) {
  return `<div class="automation-run ${r.status}">
    <div><strong>${escapeHtml(r.status)}</strong><span>${escapeHtml(r.output || r.error || 'run logged')}</span></div>
    <small>${escapeHtml(relativeTime(r.started_at || r.finished_at || ''))}</small>
  </div>`;
}

window.showAutomationForm = function(id=null) {
  const mount = document.getElementById('automationFormMount');
  if (!mount) return;
  const editing = automations.find(a => a.id === id) || null;
  const cfg = editing?.config || {};
  const selected = (value, expected) => value === expected ? 'selected' : '';
  mount.innerHTML = `
    <form class="automation-form" id="automationForm">
      <div class="form-grid">
        <input name="name" placeholder="Automation name" required value="${escapeHtml(editing?.name || '')}">
        <select name="type">
          <option value="reminder" ${selected(editing?.type, 'reminder')}>Reminder</option>
          <option value="recurring_task" ${selected(editing?.type, 'recurring_task')}>Recurring Task</option>
          <option value="cron_job" ${selected(editing?.type, 'cron_job')}>Cron Job</option>
          <option value="agent_task" ${selected(editing?.type, 'agent_task')}>Agent Task</option>
          <option value="webhook" ${selected(editing?.type, 'webhook')}>Webhook</option>
          <option value="manual" ${selected(editing?.type || 'manual', 'manual')}>Manual Action</option>
        </select>
        <select name="frequency">
          <option value="daily" ${selected(editing?.frequency, 'daily')}>Daily</option>
          <option value="weekly" ${selected(editing?.frequency, 'weekly')}>Weekly</option>
          <option value="monthly" ${selected(editing?.frequency, 'monthly')}>Monthly</option>
          <option value="manual" ${selected(editing?.frequency || 'manual', 'manual')}>Manual</option>
          <option value="custom_cron" ${selected(editing?.frequency, 'custom_cron')}>Custom cron</option>
        </select>
        <input name="schedule" placeholder="Schedule or cron expression" value="${escapeHtml(editing?.schedule || '')}">
        <select name="owner_agent">
          <option value="dev" ${selected(editing?.owner_agent || 'dev', 'dev')}>Dev</option><option value="orchestrator" ${selected(editing?.owner_agent, 'orchestrator')}>Orchestrator</option><option value="scout" ${selected(editing?.owner_agent, 'scout')}>Scout</option><option value="scribe" ${selected(editing?.owner_agent, 'scribe')}>Scribe</option><option value="reach" ${selected(editing?.owner_agent, 'reach')}>Reach</option>
        </select>
      </div>
      <textarea name="message" placeholder="Message, prompt, webhook URL, or action details">${escapeHtml(cfg.message || cfg.prompt || cfg.url || cfg.task || '')}</textarea>
      <div class="form-actions"><button class="btn-cyber" type="submit">${editing ? 'Update Automation' : 'Save Automation'}</button><button class="btn-cyber btn-cyber-ghost" type="button" onclick="document.getElementById('automationFormMount').innerHTML=''">Cancel</button></div>
    </form>`;
  document.getElementById('automationForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.config = {message: payload.message};
    delete payload.message;
    const result = editing ? await apiPatch(`/api/automations/${editing.id}`, payload) : await apiPost('/api/automations', payload);
    if (result?.id) { showToast(editing ? 'Automation updated' : 'Automation created'); await renderAutomations(); }
    else showToast(editing ? 'Failed to update automation' : 'Failed to create automation');
  };
};

window.runAutomationNow = async function(id) {
  const run = await apiPost(`/api/automations/${id}/run`, {});
  if (run?.id) { showToast('Automation run completed'); await renderAutomations(); }
  else showToast('Automation run failed');
};

window.toggleAutomation = async function(id, enabled) {
  const result = await apiPatch(`/api/automations/${id}`, {enabled});
  if (result?.id) { showToast(enabled ? 'Automation enabled' : 'Automation disabled'); await renderAutomations(); }
  else showToast('Update failed');
};

window.deleteAutomation = async function(id) {
  if (!confirm('Delete this automation?')) return;
  const ok = await apiDelete(`/api/automations/${id}`);
  if (ok) { showToast('Automation deleted'); await renderAutomations(); }
  else showToast('Delete failed');
};
