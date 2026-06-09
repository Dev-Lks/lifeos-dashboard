/* Command palette — Ctrl/Cmd+K Life OS navigation and quick actions */
import { escapeHtml, showToast } from './api.js';

const ACTIONS = [
  {label:'Home / Command Center', hint:'Go to overview', run:()=>window.switchTab('overview')},
  {label:'Agents', hint:'Agent status and handoffs', run:()=>window.switchTab('agents')},
  {label:'Tasks / Projects', hint:'Kanban board', run:()=>window.switchTab('tasks')},
  {label:'Automations', hint:'Create and run automations', run:()=>window.switchTab('automations')},
  {label:'Schedule', hint:'Cron jobs timeline', run:()=>window.switchTab('schedule')},
  {label:'Content / Knowledge', hint:'Docs and notes', run:()=>window.switchTab('content')},
  {label:'Dreams / Reflection', hint:'Dream log', run:()=>window.switchTab('dreams')},
  {label:'Finance', hint:'Transactions and goals', run:()=>window.switchTab('finances')},
  {label:'Routine', hint:'Habits and daily log', run:()=>window.switchTab('routine')},
  {label:'Projects', hint:'Projects and linked items', run:()=>window.switchTab('projects')},
  {label:'New Task', hint:'Open task creator', run:()=>{window.switchTab('tasks');setTimeout(()=>document.getElementById('taskCreateBtn')?.click(),350)}},
  {label:'New Automation', hint:'Open automation creator', run:()=>{window.switchTab('automations');setTimeout(()=>window.showAutomationForm?.(),350)}},
  {label:'New Project', hint:'Open project creator', run:()=>{window.switchTab('projects');setTimeout(()=>window._showProjectModal?.(),350)}},
  {label:'Search Projects', hint:'Find projects by name', run:()=>{window.switchTab('projects');setTimeout(()=>document.getElementById('projSearch')?.focus(),400)}},
  {label:'System Health JSON', hint:'Open /api/data', run:()=>window.open('/api/data','_blank')},
];

let mounted = false;

export function initCommandPalette() {
  if (mounted) return;
  mounted = true;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="cmdk-overlay" id="cmdkOverlay" aria-hidden="true">
      <div class="cmdk-panel">
        <input id="cmdkInput" placeholder="Search commands, tabs, quick actions..." autocomplete="off">
        <div class="cmdk-results" id="cmdkResults"></div>
      </div>
    </div>`);
  const overlay = document.getElementById('cmdkOverlay');
  const input = document.getElementById('cmdkInput');
  const results = document.getElementById('cmdkResults');

  function render(q='') {
    const query = q.toLowerCase().trim();
    const items = ACTIONS.filter(a => !query || a.label.toLowerCase().includes(query) || a.hint.toLowerCase().includes(query)).slice(0, 12);
    results.innerHTML = items.map((a,i)=>`<button class="cmdk-item" data-i="${i}"><span>${escapeHtml(a.label)}</span><small>${escapeHtml(a.hint)}</small></button>`).join('') || '<div class="cmdk-empty">No commands found</div>';
    results.querySelectorAll('.cmdk-item').forEach((btn,i)=>btn.onclick=()=>{close();items[i].run();});
  }
  function open() { overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); input.value=''; render(''); setTimeout(()=>input.focus(),20); }
  function close() { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); }

  input.addEventListener('input', ()=>render(input.value));
  input.addEventListener('keydown', e=>{
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') results.querySelector('.cmdk-item')?.click();
  });
  overlay.addEventListener('click', e=>{ if (e.target === overlay) close(); });
  document.addEventListener('keydown', e=>{
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    if (e.key === '?' && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) showToast('Shortcuts: 1-9 tabs, G command bar, Ctrl/Cmd+K palette, Esc close.');
  });
}
