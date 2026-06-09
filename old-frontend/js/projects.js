/* Projects tab — Life OS project management with progress, linked items, filters */
import { escapeHtml, apiGet, showToast } from './api.js';
import { badge, emptyState, loading, pageHeader, section, statusBadge, card, stat } from './components.js';

const AGENTS = [
  {id:'orchestrator',icon:'🧠',name:'Orchestrator'},
  {id:'scout',icon:'🔍',name:'Scout'},
  {id:'scribe',icon:'✍️',name:'Scribe'},
  {id:'reach',icon:'📡',name:'Reach'},
  {id:'dev',icon:'⚙️',name:'Dev'},
];

let _projects = [];
let _allTasks = [];
let _autos = [];
let _docs = [];
let _filters = { search:'', status:'', agent:'' };

export function renderProjects() {
  const panel = document.getElementById('panel-projects');
  if (!panel) return;
  panel.innerHTML = loading('Loading projects...');
  Promise.all([
    apiGet('/api/projects'),
    apiGet('/api/board?archived=0'),
    apiGet('/api/automations'),
  ]).then(([projects, tasks, autos]) => {
    _projects = Array.isArray(projects) ? projects : [];
    _allTasks = Array.isArray(tasks) ? tasks : [];
    _autos = Array.isArray(autos) ? autos : [];
    _buildUI();
  });
}

function _buildUI() {
  const panel = document.getElementById('panel-projects');
  if (!panel) return;
  const filtered = _applyFilters();
  panel.innerHTML = `
    ${pageHeader({eyebrow:'Portfolio', title:'Projects', body:'Organize work into projects. Link tasks, automations, docs, and agents.', actions:`<button class="life-btn life-btn-primary" onclick="window._showProjectModal()">+ New Project</button>`})}
    ${_buildFilterBar()}
    <div class="projects-grid" id="projectsGrid">
      ${filtered.length ? filtered.map(p => _buildProjectCard(p)).join('') : emptyState('No projects yet', 'Create your first project to start organizing work.', '<button class="life-btn life-btn-primary" onclick="window._showProjectModal()">+ New Project</button>')}
    </div>
    <div id="projectModalContainer"></div>
  `;
}

function _buildFilterBar() {
  const statuses = [
    ['', 'All status'],
    ['active', 'Active'],
    ['paused', 'Paused'],
    ['completed', 'Completed'],
    ['archived', 'Archived'],
  ];
  const agentOpts = [['', 'All agents'], ...AGENTS.map(a => [a.id, a.name])];
  return `<div class="life-toolbar">
    <input type="text" id="projSearch" class="life-input" placeholder="Search projects..." value="${escapeHtml(_filters.search)}" oninput="_handleProjFilter()">
    <select id="projStatusFilter" class="life-select" onchange="_handleProjFilter()">
      ${statuses.map(([v,label]) => `<option value="${v}"${_filters.status===v?' selected':''}>${label}</option>`).join('')}
    </select>
    <select id="projAgentFilter" class="life-select" onchange="_handleProjFilter()">
      ${agentOpts.map(([v,label]) => `<option value="${v}"${_filters.agent===v?' selected':''}>${label}</option>`).join('')}
    </select>
  </div>`;
}

function _applyFilters() {
  return _projects.filter(p => {
    if (_filters.search && !`${p.name} ${p.description}`.toLowerCase().includes(_filters.search)) return false;
    if (_filters.status && p.status !== _filters.status) return false;
    if (_filters.agent && p.agent !== _filters.agent) return false;
    return true;
  });
}

function _buildProjectCard(p) {
  const projTasks = _allTasks.filter(t => t.project_id === p.id);
  const total = projTasks.length;
  const done = projTasks.filter(t => t.status === 'completed').length;
  const pct = total ? Math.round((done/total)*100) : 0;
  const projAutos = _autos.filter(a => a.config?.project_id === p.id || a.config?.project === p.id);
  const agentMeta = AGENTS.find(a => a.id === p.agent);
  const statusVariant = {active:'success', paused:'warning', completed:'muted', archived:'neutral'}[p.status] || 'neutral';
  const statusIcon = {active:'●', paused:'⏸', completed:'✓', archived:'📦'}[p.status] || '●';

  const metaHTML = `
    ${statusBadge(`${statusIcon} ${p.status}`, p.status==='active')}
    ${p.agent ? badge((agentMeta?.icon||'🤖')+' '+p.agent, 'neutral') : ''}
    ${p.due_date ? badge('📅 '+p.due_date, 'muted') : ''}
    ${p.tags ? p.tags.split(',').filter(Boolean).map(t => badge(t.trim(), 'accent')).join('') : ''}
  `;

  const body = `
    ${p.description ? `<p class="life-card-desc">${escapeHtml(p.description)}</p>` : ''}
    <div class="project-progress">
      <div class="project-progress-bar"><div class="project-progress-fill" style="width:${pct}%"></div></div>
      <span>${done}/${total} tasks (${pct}%)</span>
    </div>
    <div class="project-linked-row">
      ${projAutos.length ? `<span class="life-badge life-badge-info">⚡ ${projAutos.length} automations</span>` : ''}
    </div>
    <div class="project-actions">
      <button class="life-btn life-btn-sm" onclick="window._showProjectLinks('${p.id}')">🔗 Linked Items</button>
      <button class="life-btn life-btn-sm" onclick="window._editProject('${p.id}')">✏️ Edit</button>
      <button class="life-btn life-btn-sm" style="color:var(--error)" data-delete-id="${p.id}" onclick="window._deleteProject(this.dataset.deleteId)">🗑 Delete</button>
    </div>
    <div class="project-linked-items" id="links-${p.id}" style="display:none"></div>
  `;

  return card(p.name, body, {icon:'📁', className:'project-card', meta:metaHTML});
}

// ── Filter handler (exposed globally for inline oninput/onchange) ──
window._handleProjFilter = function() {
  _filters.search = (document.getElementById('projSearch')?.value || '').toLowerCase().trim();
  _filters.status = document.getElementById('projStatusFilter')?.value || '';
  _filters.agent = document.getElementById('projAgentFilter')?.value || '';
  _buildUI();
};

// ── Project Modal (create) ──
window._showProjectModal = function(editId) {
  const p = editId ? _projects.find(x => x.id === editId) : null;
  const formHTML = `
    <div class="life-modal-overlay" id="projModalOverlay" onclick="if(event.target===this)window._closeProjModal()">
      <div class="life-modal">
        <h3>${p ? 'Edit Project' : 'New Project'}</h3>
        <div class="life-modal-body">
          <label>Name</label>
          <input class="life-input" id="projName" value="${escapeHtml(p?.name || '')}" placeholder="Project name">
          <label>Description</label>
          <textarea class="life-input" id="projDesc" rows="2" placeholder="Brief description...">${escapeHtml(p?.description || '')}</textarea>
          <label>Status</label>
          <select class="life-select" id="projStatus">
            ${['active','paused','completed','archived'].map(s => `<option value="${s}"${p?.status===s?' selected':''}>${s}</option>`).join('')}
          </select>
          <label>Agent (optional)</label>
          <select class="life-select" id="projAgent">
            <option value="">None</option>
            ${AGENTS.map(a => `<option value="${a.id}"${p?.agent===a.id?' selected':''}>${a.icon} ${a.name}</option>`).join('')}
          </select>
          <label>Tags (comma separated)</label>
          <input class="life-input" id="projTags" value="${escapeHtml(p?.tags || '')}" placeholder="life, dashboard, automation">
        </div>
        <div class="life-modal-actions">
          <button class="life-btn" onclick="window._closeProjModal()">Cancel</button>
          <button class="life-btn life-btn-primary" onclick="window._submitProject('${editId || ''}')">${p ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('projectModalContainer').innerHTML = formHTML;
};

window._closeProjModal = function() {
  document.getElementById('projectModalContainer').innerHTML = '';
};

window._submitProject = function(editId) {
  const name = document.getElementById('projName')?.value?.trim();
  if (!name) return showToast('Name is required.');
  const data = {
    name,
    description: document.getElementById('projDesc')?.value?.trim() || '',
    status: document.getElementById('projStatus')?.value || 'active',
    agent: document.getElementById('projAgent')?.value || '',
    tags: document.getElementById('projTags')?.value?.trim() || '',
  };
  const method = editId ? 'PATCH' : 'POST';
  const url = editId ? `/api/projects/${editId}` : '/api/projects';
  fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})
    .then(r => r.json())
    .then(result => {
      if (result.error) { showToast(result.error); return; }
      showToast(editId ? 'Project updated' : 'Project created');
      _closeProjModal();
      renderProjects();
    })
    .catch(() => showToast('Failed to save project.'));
};

// ── Edit / Delete ──
window._editProject = function(id) { window._showProjectModal(id); };

window._deleteProject = function(id) {
  const proj = _projects.find(x => x.id === id);
  const name = proj?.name || 'this project';
  if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
  fetch(`/api/projects/${id}`, {method:'DELETE'})
    .then(r => r.json())
    .then(result => {
      if (result.ok) { showToast('Project deleted'); renderProjects(); }
      else showToast(result.error || 'Delete failed');
    })
    .catch(() => showToast('Failed to delete project.'));
};

// ── Linked Items ──
window._showProjectLinks = function(pid) {
  const el = document.getElementById('links-' + pid);
  if (!el) return;
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.innerHTML = loading('Loading links...');
  el.style.display = 'block';
  Promise.all([
    fetch(`/api/entity-links?source_type=project&source_id=${pid}`).then(r => r.json()),
    fetch(`/api/projects/${pid}/tasks`).then(r => r.json()),
  ]).then(([links, tasks]) => {
    const linkList = Array.isArray(links) ? links : [];
    const taskList = Array.isArray(tasks) ? tasks : [];
    const linkedTasks = linkList.filter(l => l.target_type === 'task');
    const linkedAutos = linkList.filter(l => l.target_type === 'automation');
    const linkedDocs = linkList.filter(l => l.target_type === 'doc' || l.target_type === 'content');
    const linkedAgents = linkList.filter(l => l.target_type === 'agent');

    // Also show tasks with project_id set directly
    const directTasks = taskList.filter(t => !linkedTasks.some(l => l.target_id === t.id));

    el.innerHTML = `
      <div class="life-section life-section-sm">
        <div class="life-section-head">
          <div class="life-section-title">Linked Items</div>
          <button class="life-btn life-btn-sm" onclick="window._showLinkForm('${pid}')">+ Add Link</button>
        </div>
        <div class="linked-groups">
          ${_linkedGroup('Tasks', linkedTasks, directTasks, 'task', pid, '📋')}
          ${_linkedGroup('Automations', linkedAutos, [], 'automation', pid, '⚡')}
          ${_linkedGroup('Docs', linkedDocs, [], 'doc', pid, '📄')}
          ${_linkedGroup('Agents', linkedAgents, [], 'agent', pid, '🤖')}
        </div>
      </div>
      <div id="linkForm-${pid}"></div>
    `;
  });
};

function _linkedGroup(label, links, extraItems, type, pid, icon) {
  const allItems = [...links.map(l => ({id:l.target_id, label:l.relation||'linked', isLink:true})), ...extraItems.map(t => ({id:t.id, label:t.title, isLink:false}))];
  const total = allItems.length;
  return `<div class="linked-group">
    <div class="linked-group-header">${icon} ${label} <span class="life-badge life-badge-neutral">${total}</span></div>
    ${total ? allItems.map(item => `<div class="linked-row">
      <span>${escapeHtml(item.label)}</span>
      ${item.isLink ? `<span style="font-size:10px;color:var(--text-tertiary)">${escapeHtml(item.id)}</span>` : `<span class="life-badge life-badge-info">via project_id</span>`}
    </div>`).join('') : '<div class="linked-row" style="color:var(--text-tertiary)">None</div>'}
  </div>`;
}

// ── Link creation form ──
window._showLinkForm = function(pid) {
  const el = document.getElementById('linkForm-' + pid);
  if (!el) return;
  el.innerHTML = `
    <div class="life-section life-section-sm" style="margin-top:8px">
      <div class="life-section-head"><div class="life-section-title">New Link</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <select id="linkType-${pid}" class="life-select" style="min-width:120px">
          <option value="task">Task</option>
          <option value="automation">Automation</option>
          <option value="doc">Doc</option>
          <option value="agent">Agent</option>
        </select>
        <input class="life-input" id="linkId-${pid}" placeholder="Target ID (e.g. task id)" style="flex:1;min-width:140px">
        <input class="life-input" id="linkLabel-${pid}" placeholder="Label (optional)" style="max-width:140px">
        <button class="life-btn life-btn-primary" onclick="window._submitLink('${pid}')">Link</button>
      </div>
    </div>`;
};

window._submitLink = function(pid) {
  const type = document.getElementById(`linkType-${pid}`)?.value || 'task';
  const targetId = document.getElementById(`linkId-${pid}`)?.value?.trim();
  if (!targetId) return showToast('Target ID is required.');
  const relation = document.getElementById(`linkLabel-${pid}`)?.value?.trim() || 'related';
  fetch('/api/entity-links', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({source_type:'project', source_id:pid, target_type:type, target_id:targetId, relation})
  })
    .then(r => r.json())
    .then(result => {
      if (result.id) { showToast('Link created'); window._showProjectLinks(pid); }
      else showToast(result.error || 'Failed to create link');
    })
    .catch(() => showToast('Failed to create link.'));
};
