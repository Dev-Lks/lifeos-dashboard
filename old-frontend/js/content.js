/* ═══════════════════════════════════════
   CONTENT TAB — Docs Sidebar + Preview + Edit
   ═══════════════════════════════════════ */

import { escapeHtml } from './api.js';

let contentDocs = [];
let selectedDoc = null;
let editMode = false;

export function loadContentDocs() {
  fetch('/api/content').then(r => r.json()).then(docs => {
    contentDocs = docs || []; renderContentSidebar();
    if (!selectedDoc && contentDocs.length) selectDoc(contentDocs[0]);
  }).catch(() => {});
}

function renderContentSidebar() {
  const el = document.getElementById('contentSidebar');
  if (!el) return;
  const order = ['orchestrator','scout','scribe','reach','dev']; const groups = {};
  contentDocs.forEach(d => { if (!groups[d.agent]) groups[d.agent] = []; groups[d.agent].push(d); });
  let html = '';
  order.forEach(agent => {
    if (!groups[agent] || !groups[agent].length) return;
    html += '<div class="content-group"><div class="content-group-header">' + agent + '</div>';
    groups[agent].forEach(d => {
      const sel = selectedDoc && selectedDoc.filename === d.filename ? ' active' : '';
      html += '<div class="content-doc' + sel + '" onclick="window.selectDocByFilename(\'' + d.filename + '\')"><div>' + escapeHtml(d.title) + '</div></div>';
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

window.selectDocByFilename = function(fn) {
  const d = contentDocs.find(x => x.filename === fn); if (d) selectDoc(d);
};

function selectDoc(doc) {
  selectedDoc = doc; editMode = false; renderContentSidebar(); renderContentPanel();
}

function renderContentPanel() {
  const el = document.getElementById('contentPreview');
  if (!el) return;
  if (!selectedDoc) { el.innerHTML = '<p style="color:var(--text-tertiary);padding:40px;text-align:center;font-family:var(--font-body)">>_ select a document from the sidebar</p>'; return; }
  const d = selectedDoc;
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">' +
    '<div style="font-size:16px;font-weight:600">' + escapeHtml(d.title) + '</div>' +
    '<div style="display:flex;gap:8px;align-items:center"><span style="font-size:11px;color:var(--text-secondary)">' + (d.modified_at ? new Date(d.modified_at).toLocaleDateString() : '') + '</span>' +
    '<button class="tab-btn" onclick="window.enterEdit()" style="font-size:11px;padding:4px 10px">Edit</button></div></div>' +
    '<div id="contentView"></div>';
  if (!d._rawContent) {
    fetch('/api/content/get?path=' + encodeURIComponent(d.filename)).then(r => r.json()).then(full => {
      d._rawContent = full.content || ''; const cv = document.getElementById('contentView'); if (cv) cv.innerHTML = renderMarkdown(d._rawContent);
    }).catch(() => {});
  } else { const cv = document.getElementById('contentView'); if (cv) cv.innerHTML = renderMarkdown(d._rawContent); }
}

function renderMarkdown(md) {
  if (!md) return '<p style="color:var(--text-secondary)">Empty document.</p>';
  let h = escapeHtml(md);
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^#### (.+)$/gm, '<h4>$1</h4>'); h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>'); h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>'); h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // ── Tables ──
  // Convert markdown tables before paragraph wrapping
  // Detect blocks of consecutive lines starting with |
  const tableRegex = /^\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+/gm;
  h = h.replace(tableRegex, function(match) {
    const rows = match.trim().split('\n');
    let html = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">';
    
    // Determine if there's a separator row (header)
    let headerRow = null;
    let bodyStart = 1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].match(/^\|[-| :]+\|$/)) {
        if (i > 0) headerRow = rows.slice(0, i);
        bodyStart = i + 1;
        break;
      }
    }
    
    function parseRow(rowStr) {
      return rowStr
        .replace(/^\||\|$/g, '')  // Remove leading/trailing pipes
        .split(/(?<!\\)\|/)       // Split on pipe (not escaped)
        .map(c => c.trim());
    }
    
    // Header
    if (headerRow && headerRow.length) {
      const cells = parseRow(headerRow[0]);
      html += '<thead><tr>';
      cells.forEach(c => { html += '<th style="padding:8px 12px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-secondary);font-weight:600;text-align:left;white-space:nowrap">' + c + '</th>'; });
      html += '</tr></thead>';
    }
    
    // Body
    html += '<tbody>';
    for (let i = bodyStart; i < rows.length; i++) {
      if (!rows[i].match(/^\|.+\|$/)) continue;
      const cells = parseRow(rows[i]);
      html += '<tr>';
      cells.forEach((c, ci) => {
        html += '<td style="padding:6px 12px;border:1px solid var(--border);color:var(--text-secondary)' + (ci === 0 ? ';white-space:nowrap' : '') + '">' + c + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  });

  const lines = h.split('\n'); let out = '', inPara = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('<h') || line.startsWith('<pre') || line.startsWith('<ul') || line.startsWith('<li') || line.startsWith('<blockquote') || line.startsWith('<div') || line.startsWith('<table') || line.startsWith('</div') || line.startsWith('</table')) {
      if (inPara) { out += '</p>'; inPara = false; } out += line;
    } else { if (!inPara) { out += '<p>'; inPara = true; } out += line + ' '; }
  }
  if (inPara) out += '</p>'; return out;
}

window.enterEdit = function() {
  if (!selectedDoc || !selectedDoc._rawContent) return;
  editMode = true;
  const el = document.getElementById('contentPreview');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
    '<div style="font-size:14px;font-weight:600">Editing: ' + escapeHtml(selectedDoc.title) + '</div>' +
    '<div style="display:flex;gap:6px"><button class="tab-btn" onclick="window.cancelEdit()" style="font-size:11px">Cancel</button>' +
    '<button class="tab-btn active" onclick="window.saveDoc()" style="font-size:11px">Save</button></div></div>' +
    '<textarea class="content-editor" id="contentEditor">' + escapeHtml(selectedDoc._rawContent) + '</textarea>';
};

window.cancelEdit = function() { editMode = false; renderContentPanel(); };

window.saveDoc = function() {
  const ta = document.getElementById('contentEditor'); if (!ta || !selectedDoc) return;
  const nc = ta.value;
  fetch('/api/content/save', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:selectedDoc.filename, content:nc})})
    .then(r => r.json()).then(res => {
      if (res.error) { alert('Save failed: ' + res.error); return; }
      selectedDoc._rawContent = nc; selectedDoc.modified_at = res.modified_at; editMode = false; renderContentPanel();
    }).catch(() => alert('Save failed: network error'));
};
