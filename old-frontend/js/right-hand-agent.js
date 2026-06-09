/* Atlas — System Operator panel v2.1
   Dynamic suggestions, TTS-ready, system-aware */
import { apiGet, apiPost, escapeHtml, showToast, toastedSet } from './api.js';

let atlasContext = null;
let atlasBusy = false;
let atlasSessionId = localStorage.getItem('atlasSessionId') || null;
let _lastResponse = null;

function el(id) { return document.getElementById(id) || {textContent: '', classList: {toggle:()=>{}, add:()=>{}, remove:()=>{}}, style: {}, dataset: {}}; }

function safeText(id, text) {
  const e = document.getElementById(id);
  if (e) e.textContent = text;
}

function renderMarkdown(md='') {
  let s = escapeHtml(md);
  const codeBlocks = [];
  s = s.replace(/```([\s\S]*?)```/g, (_, code) => {
    const token = `@@CODE${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return token;
  });
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^#\s+(.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, match => `<ul>${match.replace(/\n/g,'')}</ul>`);
  s = s.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/\n{2,}/g, '</p><p>');
  s = `<p>${s.replace(/\n/g, '<br>')}</p>`;
  s = s.replace(/<p>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<\/p>/g, '</ul>');
  codeBlocks.forEach((block, i) => { s = s.replace(`@@CODE${i}@@`, block); });
  return s;
}

function addMsg(text, who='agent', opts={}) {
  const chat = el('atlasChat');
  if (!chat || !chat.appendChild) return null;
  const empty = chat.querySelector('.atlas-empty-state');
  if (empty) empty.style.display = 'none';
  
  const div = document.createElement('div');
  div.className = `atlas-msg atlas-msg-${who}`;
  div.style.cssText = `max-width:100%;padding:12px 16px;border-radius:14px;font-size:13px;line-height:1.6;animation:msgFadeIn 0.2s ease;`;
  if (who === 'user') {
    div.style.cssText += `background:rgba(0,229,160,0.10);border:1px solid rgba(0,229,160,0.18);align-self:flex-end;color:var(--atlas-text)`;
  } else {
    div.style.cssText += `background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);align-self:flex-start;color:var(--atlas-text)`;
  }
  div.innerHTML = opts.markdown === false ? escapeHtml(text).replace(/\n/g, '<br>') : renderMarkdown(text);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

if (!document.getElementById('atlasMsgStyle')) {
  const style = document.createElement('style');
  style.id = 'atlasMsgStyle';
  style.textContent = `@keyframes msgFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(style);
}

const ATLAS_ACTIONS = [
  {label: '📋 Briefing do sistema', intent: 'briefing'},
  {label: '🎯 Prioridades agora', intent: 'priorities'},
  {label: '⚡ Health check', intent: 'health'},
  {label: '💰 Resumo financeiro', intent: 'finance'},
  {label: '✅ Marcar leitura de hoje', intent: 'habit'},
  {label: '📝 New task', intent: 'task'},
];

function setStatus(text) {
  safeText('atlasHubStatus', text);
  safeText('atlasStatus', text);
}

function showThinkingIndicator(show) {
  const bar = el('atlasThinkingBar');
  if (!bar || !bar.classList) return;
  bar.classList.toggle('visible', show);
  if (show) {
    const label = el('atlasThinkingLabel');
    if (label) label.textContent = 'Atlas está pensando...';
    // Pulse the avatar while thinking
    const avatar = document.querySelector('.atlas-hero-avatar');
    if (avatar) {
      avatar.style.transition = 'transform 0.3s';
      avatar.style.transform = 'scale(0.95)';
      avatar.style.opacity = '0.8';
    }
  } else {
    const avatar = document.querySelector('.atlas-hero-avatar');
    if (avatar) {
      avatar.style.transform = 'scale(1)';
      avatar.style.opacity = '1';
    }
  }
}

function refreshSuggestions(ctx) {
  const box = el('atlasSuggestions');
  if (!box || !box.appendChild) return;
  
  const cc = ctx?.command_center || {};
  const focus = cc.today_focus || [];
  const recs = cc.recommendations || [];
  const pendingTasks = focus.filter(t => t.status === 'pending').length;
  const inProgressTasks = focus.filter(t => t.status === 'in_progress').length;
  
  // Build dynamic suggestions based on actual system state
  const dynamic = [];
  
  // Always have briefing
  dynamic.push('📋 Briefing operacional do sistema');
  
  if (pendingTasks > 0) {
    dynamic.push(`🎯 Tenho ${pendingTasks} tasks pendentes — priorize para mim`);
  }
  if (inProgressTasks > 0) {
    dynamic.push(`🔄 ${inProgressTasks} tasks em andamento — status?`);
  }
  if (recs.length > 0) {
    dynamic.push(`💡 ${recs[0].message}`);
  }
  
  // Finance-aware
  const finance = ctx?.finance?.summary;
  if (finance && finance.expense > 0) {
    dynamic.push('💰 Resumo financeiro do mês');
  }
  
  // Habit-aware
  const habits = ctx?.routine?.today?.habits || ctx?.habits?.today;
  if (habits && !habits.done_today) {
    dynamic.push('✅ Marcar leitura de hoje');
  }
  
  // Always add system-level options
  const base = [
    'Criar task: Revisar dashboard semanal',
    'O que devo delegar para os agentes?',
    'Sugira automações úteis',
  ];
  
  const items = [...new Set([...dynamic, ...base])].slice(0, 8);
  
  box.innerHTML = items.map(x => `<button type="button" class="atlas-chip" data-suggestion="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join('');
  box.querySelectorAll('.atlas-chip').forEach(btn => btn.onclick = () => {
    const input = el('atlasInput');
    if (input && input.value !== undefined) {
      input.value = btn.textContent;
      input.focus();
      // Auto-resize
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
  });
}

async function ensureSession() {
  if (atlasSessionId) return atlasSessionId;
  const s = await apiPost('/api/right-hand/sessions', {title:'Atlas chat'});
  if (s?.id) {
    atlasSessionId = s.id;
    localStorage.setItem('atlasSessionId', atlasSessionId);
  }
  return atlasSessionId;
}

async function refreshAtlas() {
  setStatus('Reading full system context...');
  atlasContext = await apiGet('/api/right-hand/context');
  if (!atlasContext) { setStatus('Atlas context unavailable'); return; }
  const cc = atlasContext.command_center || {};
  const tasks = cc.today_focus?.length || 0;
  const projects = cc.active_projects?.length || 0;
  const recs = cc.recommendations?.length || 0;
  const pending = (cc.today_focus || []).filter(t => t.status === 'pending').length;
  setStatus(`Ready · ${tasks} focus (${pending} pending) · ${projects} projects · ${recs} signals`);
  refreshSuggestions(atlasContext);
}

async function askAtlas(message) {
  if (atlasBusy) return;
  atlasBusy = true;
  await ensureSession();
  addMsg(message, 'user', {markdown:false});
  showThinkingIndicator(true);
  setStatus('Atlas is thinking...');
  const res = await apiPost('/api/right-hand/ask', {message, session_id: atlasSessionId});
  showThinkingIndicator(false);
  if (!res) {
    addMsg('**Erro:** não consegui alcançar o endpoint do Atlas.', 'agent');
    setStatus('Atlas endpoint error'); atlasBusy = false; return;
  }
  if (res.session_id) { atlasSessionId = res.session_id; localStorage.setItem('atlasSessionId', atlasSessionId); }
  
  const responseText = res.response || 'No response.';
  addMsg(responseText, 'agent');
  _lastResponse = responseText;
  
  // Dispatch event for TTS / avatar pulse
  window.dispatchEvent(new CustomEvent('atlas-response', {
    detail: { text: responseText, actions: res.actions || [] }
  }));
  
  if (res.actions?.length) {
    addMsg(`**⚠️ Aprovação necessária:** ${res.actions.length} ação(ões) aguardando.\n\nUse \`/approve\` ou \`/reject\` para gerenciar.`, 'agent');
  }
  await refreshAtlas();
  setStatus(res.exit_code === 0 || res.exit_code === undefined ? 'Atlas ready' : `Code ${res.exit_code}`);
  atlasBusy = false;
}

function bindAtlas() {
  const form = el('atlasForm');
  const input = el('atlasInput');
  const sendBtn = el('atlasSendBtn');
  
  if (form && input && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', e => {
      e.preventDefault();
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      input.style.height = 'auto';
      askAtlas(msg);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }
  
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (form) form.requestSubmit();
    });
  }
  
  window.addEventListener('focus', () => {
    if (!atlasContext) refreshAtlas();
  });
}

async function bootAtlas() {
  bindAtlas();
  await refreshAtlas();
  window.askAtlas = askAtlas;
  window.refreshAtlas = refreshAtlas;
}

document.addEventListener('DOMContentLoaded', bootAtlas);
