/* ═══════════════════════════════════════
   TASKS (KANBAN) — Full rework: DnD, modal, filters, stats, archive
   ═══════════════════════════════════════ */

import { escapeHtml, relativeTime, apiGet, apiPatch, apiDelete, showToast } from './api.js';
import { badge, emptyState, loading } from './components.js';

let tasksCache = [];
let showArchived = false;
let filterTimer = null;

const AGENT_ICONS = {
  orchestrator: '🧠', scout: '🔍', scribe: '✍️', reach: '📡', dev: '🛠️',
};
const STATUS_LABEL = { pending: 'Pending', in_progress: 'In Progress', completed: 'Done' };
const STATUS_ORDER = { pending: 0, in_progress: 1, completed: 2 };
const STATUS_KEYS = ['pending', 'in_progress', 'completed'];

/* ── Public API ── */
let _setupDone = false;

export function fetchTasks() {
  if (!_setupDone) {
    setupFilters();
    _loadProjectFilter();
    _setupDone = true;
  }
  const s = document.getElementById('taskSearch');
  const a = document.getElementById('taskFilterAssignee');
  const p = document.getElementById('taskFilterPriority');
  const prj = document.getElementById('taskFilterProject');
  const params = new URLSearchParams();
  if (showArchived) params.set('archived', '1');
  if (s && s.value.trim()) params.set('search', s.value.trim());
  if (a && a.value) params.set('assignee', a.value);
  if (p && p.value) params.set('priority', p.value);
  if (prj && prj.value) params.set('project_id', prj.value);
  const grid = document.getElementById('kanbanGrid');
  if (grid) grid.innerHTML = loading('Loading tasks...');
  const qs = params.toString();
  apiGet('/api/board' + (qs ? '?' + qs : '')).then(t => {
    tasksCache = t || [];
    renderKanban();
    fetchStats();
  });
}

function fetchStats() {
  apiGet('/api/board/stats').then(stats => {
    if (!stats) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('taskTotalCount', stats.total);
    set('taskPendingCount', stats.pending);
    set('taskProgressCount', stats.in_progress);
    set('taskDoneCount', stats.completed);
    set('taskOverdueCount', stats.overdue);
  });
}

/* ── Filter / Search ── */

function applyFilters() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(fetchTasks, 200);
}

function setupFilters() {
  ['taskSearch', 'taskFilterAssignee', 'taskFilterPriority', 'taskFilterProject', 'taskSort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', applyFilters);
  });
  const searchInput = document.getElementById('taskSearch');
  if (searchInput) searchInput.addEventListener('input', applyFilters);
}

function _loadProjectFilter() {
  const sel = document.getElementById('taskFilterProject');
  if (!sel || sel.dataset.loaded) return;
  sel.dataset.loaded = '1';
  fetch('/api/projects').then(r => r.json()).then(projects => {
    if (Array.isArray(projects)) {
      projects.forEach(p => { sel.innerHTML += `<option value="${p.id}">${p.name}</option>`; });
    }
  });
}
  const archiveBtn = document.getElementById('taskShowArchived');
  if (archiveBtn) {
    archiveBtn.addEventListener('click', () => {
      showArchived = !showArchived;
      archiveBtn.textContent = showArchived ? '📦 Active' : '📦 Archived';
      archiveBtn.classList.toggle('active', showArchived);
      fetchTasks();
    });
  }

  const createBtn = document.getElementById('taskCreateBtn');
  if (createBtn) createBtn.addEventListener('click', () => window.showCreateTaskModal?.());

/* ── Kanban Render ── */

function renderKanban() {
  const el = document.getElementById('kanbanGrid');
  if (!el) return;

  // Sort
  const sortBy = (document.getElementById('taskSort')?.value) || 'created_desc';
  const sorted = [...tasksCache].sort(taskSorter(sortBy));

  // Group by status
  const cols = { pending: [], in_progress: [], completed: [] };
  sorted.forEach(t => { if (cols[t.status]) cols[t.status].push(t); });

  el.innerHTML = STATUS_KEYS.map(status => {
    const tasks = cols[status];
    const label = STATUS_LABEL[status];
    let html = `<div class="kanban-col" data-status="${status}" ondragover="window._onDragOver(event)" ondragleave="window._onDragLeave(event)" ondrop="window._onDrop(event,'${status}')">
      <div class="kanban-col-header"><span>●</span>${label}<span class="kanban-col-count">${tasks.length}</span></div>`;
    if (tasks.length === 0) {
      html += `<div class="kanban-empty">${emptyState(status === 'pending' ? 'Ready for a new task' : 'Nothing here yet', status === 'pending' ? 'Drop or create a task to start today’s work.' : 'Move cards here as work progresses.')}</div>`;
    } else {
      tasks.forEach(t => { html += renderTaskCard(t); });
    }
    if (status === 'pending') {
      html += '<button class="kanban-add-btn" onclick="window.showCreateTaskModal()">+ Add task</button>';
    }
    html += '</div>';
    return html;
  }).join('');
}

function taskSorter(sortBy) {
  return (a, b) => {
    switch (sortBy) {
      case 'created_asc': return (a.created_at || '').localeCompare(b.created_at || '');
      case 'priority': {
        const w = { high: 0, medium: 1, low: 2 };
        return (w[a.priority] ?? 1) - (w[b.priority] ?? 1);
      }
      case 'due_date': {
        const da = a.due_date || '9999-99-99';
        const db = b.due_date || '9999-99-99';
        return da.localeCompare(db);
      }
      case 'title': return (a.title || '').localeCompare(b.title || '');
      default: return (b.created_at || '').localeCompare(a.created_at || ''); // created_desc
    }
  };
}

function renderTaskCard(t) {
  const p = t.priority || 'medium';
  const dueDate = t.due_date ? new Date(t.due_date + 'T00:00:00') : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = dueDate && dueDate < today && t.status !== 'completed';
  const isDueToday = dueDate && dueDate.getTime() === today.getTime();
  let tags = [];
  try { tags = t.tags ? JSON.parse(t.tags) : []; } catch { tags = []; }

  const dueLabel = dueDate ? dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const dueVariant = isOverdue ? 'danger' : isDueToday ? 'warning' : 'muted';
  const assigneeIcon = t.assignee ? (AGENT_ICONS[t.assignee] || '👤') : '';
  const project = t.project_id || '';

  return `<div class="kanban-card kanban-card-modern" draggable="true" data-id="${t.id}"
       ondragstart="window._onDragStart(event)"
       ondragend="window._onDragEnd(event)"
       onclick="window.openTaskDetail('${t.id}')">
    <div class="kanban-card-header">
      <span class="kanban-card-title">${escapeHtml(t.title)}</span>
      ${badge(p, p === 'high' ? 'danger' : p === 'low' ? 'muted' : 'warning')}
    </div>
    ${t.notes ? `<div class="kanban-card-notes">${escapeHtml(t.notes)}</div>` : ''}
    <div class="kanban-card-badges">
      ${project ? badge('Project ' + project, 'accent') : ''}
      ${t.assignee ? badge(`${assigneeIcon} ${t.assignee}`, 'neutral') : ''}
      ${dueLabel ? badge('Due ' + dueLabel, dueVariant) : ''}
    </div>
    ${tags.length ? `<div class="kanban-card-tags">${tags.slice(0,4).map(tag => badge(tag, 'muted')).join('')}</div>` : ''}
    <div class="kanban-card-footer">
      <span class="kanban-card-time">${t.created_at ? relativeTime(t.created_at) : ''}</span>
      <div class="kanban-card-actions">
        ${t.status !== 'pending' ? `<button class="kanban-btn" onclick="event.stopPropagation(); window.moveTask('${t.id}',-1)">◀</button>` : ''}
        ${t.status !== 'completed' ? `<button class="kanban-btn" onclick="event.stopPropagation(); window.moveTask('${t.id}',1)">▶</button>` : ''}
        <button class="kanban-btn" onclick="event.stopPropagation(); window.archiveTask('${t.id}')" title="Archive">📦</button>
        <button class="kanban-btn" onclick="event.stopPropagation(); window.deleteTask('${t.id}')" title="Delete">✕</button>
      </div>
    </div>
  </div>`;
}

/* ── Drag & Drop ── */

window._onDragStart = function(e) {
  const card = e.target.closest('.kanban-card');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.id);
  card.classList.add('dragging');
};

window._onDragEnd = function(e) {
  e.target.closest('.kanban-card')?.classList.remove('dragging');
  document.querySelectorAll('.kanban-col.drag-over').forEach(c => c.classList.remove('drag-over'));
};

window._onDragOver = function(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};

window._onDragLeave = function(e) {
  e.currentTarget.classList.remove('drag-over');
};

window._onDrop = function(e, newStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const taskId = e.dataTransfer.getData('text/plain');
  const t = tasksCache.find(x => x.id === taskId);
  if (!t || t.status === newStatus) return;
  const dir = STATUS_ORDER[newStatus] - STATUS_ORDER[t.status];
  if (dir === 0) return;
  window.moveTask(taskId, dir);
};

/* ── Move / Archive / Delete ── */

window.moveTask = function(id, dir) {
  const t = tasksCache.find(x => x.id === id);
  if (!t) return;
  const idx = STATUS_ORDER[t.status] + dir;
  if (idx < 0 || idx > 2) return;
  const ns = STATUS_KEYS[idx];
  const os = t.status;
  t.status = ns;
  renderKanban();
  apiPatch('/api/board/' + id, { status: ns }).catch(() => { t.status = os; renderKanban(); });
};

window.archiveTask = function(id) {
  const t = tasksCache.find(x => x.id === id);
  if (!t) return;
  if (!confirm('Archive "' + t.title + '"?')) return;
  tasksCache = tasksCache.filter(x => x.id !== id);
  renderKanban();
  apiPatch('/api/board/' + id + '/archive').then(res => {
    if (res && res.error) { fetchTasks(); return; }
    fetchStats();
    showToast('Archived: ' + t.title);
  }).catch(() => fetchTasks());
};

window.deleteTask = function(id) {
  const t = tasksCache.find(x => x.id === id);
  if (!t) return;
  if (!confirm('Permanently delete "' + t.title + '"?')) return;
  tasksCache = tasksCache.filter(x => x.id !== id);
  renderKanban();
  apiDelete('/api/board/' + id).then(() => fetchStats()).catch(() => fetchTasks());
};

/* ── Task Detail Modal ── */

window.openTaskDetail = function(id) {
  const t = tasksCache.find(x => x.id === id);
  if (!t) return;
  let tags = [];
  try { tags = t.tags ? JSON.parse(t.tags) : []; } catch { tags = []; }

  const modal = document.createElement('div');
  modal.className = 'task-modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) window.closeModal(); };

  modal.innerHTML = `<div class="task-modal">
    <div class="task-modal-header">
      <h2>✏️ Edit Task</h2>
      <button class="task-modal-close" onclick="window.closeModal()">✕</button>
    </div>
    <label>Title</label>
    <input type="text" id="modalTitle" value="${escapeHtml(t.title)}" />
    <label>Notes</label>
    <textarea id="modalNotes" rows="4">${escapeHtml(t.notes || '')}</textarea>
    <label>Priority</label>
    <select id="modalPriority">
      <option value="low" ${t.priority === 'low' ? 'selected' : ''}>Low</option>
      <option value="medium" ${t.priority === 'medium' ? 'selected' : ''}>Medium</option>
      <option value="high" ${t.priority === 'high' ? 'selected' : ''}>High</option>
    </select>
    <label>Assignee</label>
    <select id="modalAssignee">
      <option value="">None</option>
      <option value="orchestrator" ${t.assignee === 'orchestrator' ? 'selected' : ''}>🧠 Orchestrator</option>
      <option value="scout" ${t.assignee === 'scout' ? 'selected' : ''}>🔍 Scout</option>
      <option value="scribe" ${t.assignee === 'scribe' ? 'selected' : ''}>✍️ Scribe</option>
      <option value="reach" ${t.assignee === 'reach' ? 'selected' : ''}>📡 Reach</option>
      <option value="dev" ${t.assignee === 'dev' ? 'selected' : ''}>🛠️ Dev</option>
    </select>
    <label>Due Date</label>
    <input type="date" id="modalDueDate" value="${t.due_date || ''}" />
    <label>Tags (comma-separated)</label>
    <input type="text" id="modalTags" value="${escapeHtml(tags.join(', '))}" placeholder="bug, urgent, design" />
    <label>Project</label>
    <select id="modalProject">
      <option value="">No project</option>
    </select>
    <div class="task-modal-actions">
      <button class="modal-btn-cancel" onclick="window.closeModal()">Cancel</button>
      <button class="modal-btn-primary" onclick="saveTaskDetail('${t.id}')">Save Changes</button>
    </div>
  </div>`;

  document.getElementById('taskModalContainer').innerHTML = '';
  document.getElementById('taskModalContainer').appendChild(modal);
  // Populate project selector
  fetch('/api/projects').then(r => r.json()).then(projects => {
    const sel = document.getElementById('modalProject');
    if (sel && Array.isArray(projects)) {
      projects.forEach(p => { sel.innerHTML += `<option value="${p.id}" ${t.project_id === p.id ? 'selected' : ''}>${p.name}</option>`; });
    }
  });
};

window.saveTaskDetail = function(id) {
  const title = document.getElementById('modalTitle').value.trim();
  if (!title) return;
  const data = {
    title,
    notes: document.getElementById('modalNotes').value.trim(),
    priority: document.getElementById('modalPriority').value,
    assignee: document.getElementById('modalAssignee').value,
    due_date: document.getElementById('modalDueDate').value || '',
    tags: JSON.stringify(
      document.getElementById('modalTags').value.split(',').map(s => s.trim()).filter(Boolean)
    ),
    project_id: document.getElementById('modalProject')?.value || '',
  };
  window.closeModal();
  // Optimistic update
  const t = tasksCache.find(x => x.id === id);
  if (t) {
    Object.assign(t, data);
    try { t.tags = data.tags; } catch {}
    renderKanban();
  }
  apiPatch('/api/board/' + id, data).then(res => {
    if (res && res.error) { fetchTasks(); return; }
    showToast('Saved: ' + title);
    fetchStats();
  }).catch(() => fetchTasks());
};

/* ── Create Task Modal ── */

window.showCreateTaskModal = function() {
  const modal = document.createElement('div');
  modal.className = 'task-modal-overlay';
  modal.onclick = (e) => { if (e.target === modal) window.closeModal(); };

  modal.innerHTML = `<div class="task-modal">
    <div class="task-modal-header">
      <h2>➕ New Task</h2>
      <button class="task-modal-close" onclick="window.closeModal()">✕</button>
    </div>
    <label>Title *</label>
    <input type="text" id="createTitle" placeholder="Task title..." autofocus />
    <label>Notes</label>
    <textarea id="createNotes" rows="3" placeholder="Optional notes..."></textarea>
    <label>Priority</label>
    <select id="createPriority">
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="low">Low</option>
    </select>
    <label>Assignee</label>
    <select id="createAssignee">
      <option value="">None</option>
      <option value="orchestrator">🧠 Orchestrator</option>
      <option value="scout">🔍 Scout</option>
      <option value="scribe">✍️ Scribe</option>
      <option value="reach">📡 Reach</option>
      <option value="dev">🛠️ Dev</option>
    </select>
    <label>Due Date</label>
    <input type="date" id="createDueDate" />
    <label>Tags (comma-separated)</label>
    <input type="text" id="createTags" placeholder="bug, urgent, design" />
    <label>Project</label>
    <select id="createProject">
      <option value="">No project</option>
    </select>
    <div class="task-modal-actions">
      <button class="modal-btn-cancel" onclick="window.closeModal()">Cancel</button>
      <button class="modal-btn-primary" onclick="submitCreateTask()">Create</button>
    </div>
  </div>`;

  document.getElementById('taskModalContainer').innerHTML = '';
  document.getElementById('taskModalContainer').appendChild(modal);
  setTimeout(() => document.getElementById('createTitle')?.focus(), 100);
  // Populate project selector
  fetch('/api/projects').then(r => r.json()).then(projects => {
    const sel = document.getElementById('createProject');
    if (sel && Array.isArray(projects)) {
      projects.forEach(p => { sel.innerHTML += `<option value="${p.id}">${p.name}</option>`; });
    }
  });
};

window.submitCreateTask = function() {
  const title = document.getElementById('createTitle').value.trim();
  if (!title) return;
  const data = {
    title,
    notes: document.getElementById('createNotes').value.trim(),
    priority: document.getElementById('createPriority').value,
    assignee: document.getElementById('createAssignee').value,
    due_date: document.getElementById('createDueDate').value || '',
    tags: JSON.stringify(
      document.getElementById('createTags').value.split(',').map(s => s.trim()).filter(Boolean)
    ),
    project_id: document.getElementById('createProject')?.value || '',
  };
  window.closeModal();
  // Optimistic add
  const dummy = { id: 'opt_' + Date.now(), title: data.title, status: 'pending', priority: data.priority, notes: data.notes, assignee: data.assignee, due_date: data.due_date, tags: data.tags, project_id: data.project_id, created_at: new Date().toISOString(), archived: false };
  tasksCache.unshift(dummy);
  renderKanban();
  fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()).then(res => {
    if (res && res.id) {
      const idx = tasksCache.findIndex(x => x.id === dummy.id);
      if (idx >= 0) tasksCache[idx] = res;
      renderKanban();
      showToast('Created: ' + title);
      fetchStats();
    } else {
      fetchTasks();
    }
  }).catch(() => fetchTasks());
};

/* ── helpers ── */

window.closeModal = function() {
  document.getElementById('taskModalContainer').innerHTML = '';
};