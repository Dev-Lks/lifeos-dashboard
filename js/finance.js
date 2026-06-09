/* ═══════════════════════════════════════
   FINANCES TAB v2 — Transações + Gráficos + Recorrentes + Metas
   ═══════════════════════════════════════ */

import { escapeHtml } from './api.js';

let financeMonth = null;
const CATEGORIES = ['alimentação','transporte','moradia','lazer','saúde','educação','assinaturas','salário','freela','outros'];

// ── Memoization cache ──
const cache = { trends: null, compare: {} };
function invalidateCache() {
  cache.trends = null;
  cache.compare = {};
}


// ── Task 13: BRL formatting helper ──
function formatBRL(value) {
  return 'R$ ' + value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function getFinanceMonth() {
  if (!financeMonth) {
    const d = new Date();
    financeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  return financeMonth;
}

window.prevFinanceMonth = function() {
  const [y, m] = getFinanceMonth().split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  financeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  renderFinances();
};

window.nextFinanceMonth = function() {
  const [y, m] = getFinanceMonth().split('-').map(Number);
  const d = new Date(y, m, 1);
  financeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  renderFinances();
};

// ── Main render ──
export function renderFinances() {
  const month = getFinanceMonth();
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [y, m] = month.split('-').map(Number);
  const monthEl = document.getElementById('financeMonth');
  if (monthEl) monthEl.textContent = '💰 Finanças — ' + monthNames[m-1] + ' ' + y;

  // Summary + Donut + Compare
  fetch('/api/finance/summary?month=' + month).then(r => r.json()).then(s => {
    const grid = document.getElementById('financeSummaryGrid');
    if (!grid) return;

    // Fetch comparison data (cached per month)
    const renderCompare = (cmp) => {
      const expPct = cmp && cmp.expense_change_pct !== undefined ? cmp.expense_change_pct : null;
      const incPct = cmp && cmp.income_change_pct !== undefined ? cmp.income_change_pct : null;

      const expBadge = expPct !== null
        ? (expPct > 0
            ? '<span class="compare-badge compare-up">↑' + expPct + '%</span>'
            : expPct < 0
              ? '<span class="compare-badge compare-down">↓' + Math.abs(expPct) + '%</span>'
              : '<span class="compare-badge" style="color:var(--text-tertiary)">→ 0%</span>')
        : '';

      const incBadge = incPct !== null
        ? (incPct > 0
            ? '<span class="compare-badge compare-down">↑' + incPct + '%</span>'
            : incPct < 0
              ? '<span class="compare-badge compare-up">↓' + Math.abs(incPct) + '%</span>'
              : '<span class="compare-badge" style="color:var(--text-tertiary)">→ 0%</span>')
        : '';

      // Task 12: Comparison indicators in summary cards
      grid.innerHTML =
        '<div class="stat-card"><div class="stat-card-value" style="color:var(--success)">' + formatBRL(s.income) + '<span class="compare-badge" style="font-size:14px">' + incBadge + '</span></div><div class="stat-card-label">Receitas vs mês passado</div></div>' +
        '<div class="stat-card"><div class="stat-card-value">' + formatBRL(s.expense) + expBadge + '</div><div class="stat-card-label">Despesas vs mês passado</div></div>' +
        '<div class="stat-card"><div class="stat-card-value" style="color:' + (s.balance >= 0 ? 'var(--success)' : 'var(--error)') + '">' + formatBRL(s.balance) + '</div><div class="stat-card-label">Saldo</div></div>' +
        '<div class="stat-card"><div class="stat-card-value">' + (s.by_category ? s.by_category.length : 0) + '</div><div class="stat-card-label">Categorias</div></div>';
    };

    // Use cache if available, else fetch
    if (cache.compare[month]) {
      renderCompare(cache.compare[month]);
    } else {
      fetch('/api/finance/compare?month=' + month).then(r => r.json()).then(cmp => {
        cache.compare[month] = cmp;
        renderCompare(cmp);
      }).catch(() => {
        renderCompare(null);
      });
    }

    // Task 8: Donut chart
    renderDonutChart(s.by_category || []);
  });

  // Task 9: Trend chart (cached)
  if (cache.trends) {
    renderTrendChart(cache.trends);
  } else {
    fetch('/api/finance/trends?months=12').then(r => r.json()).then(trendData => {
      cache.trends = trendData;
      renderTrendChart(trendData);
    }).catch(() => {});
  }

  // Transactions
  fetch('/api/finance/transactions?month=' + month).then(r => r.json()).then(txs => {
    window.currentTransactions = txs || [];
    const el = document.getElementById('transactionList');
    if (!el) return;
    renderTransactionList(txs, el);
  });

  // Task 10: Recurring
  fetch('/api/finance/recurring').then(r => r.json()).then(data => {
    const el = document.getElementById('recurringList');
    if (!el) return;
    if (!data || !data.length) {
      el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:12px;font-family:var(--font-body)">>_ no recurring transactions</div>';
      return;
    }
    el.innerHTML = data.map(r => {
      const freqLabel = {weekly:'semanal', monthly:'mensal', yearly:'anual'};
      const typeIcon = r.type === 'income' ? '💰' : '💸';
      return '<div class="recurring-row">' +
        '<span class="recurring-icon">' + typeIcon + '</span>' +
        '<span class="recurring-desc">' + escapeHtml(r.description || r.category) + '</span>' +
        '<span class="recurring-amount" style="color:' + (r.type === 'income' ? 'var(--success)' : 'var(--text-primary)') + '">' + formatBRL(r.amount) + '</span>' +
        '<span class="recurring-day">Dia ' + r.day + '</span>' +
        '<span class="recurring-freq">' + (freqLabel[r.frequency] || r.frequency) + '</span>' +
        '<button class="recurring-launch" onclick="window.launchRecurring(\'' + r.id + '\')">Lançar</button>' +
        '<button class="recurring-del" onclick="window.deleteRecurring(\'' + r.id + '\')">✕</button>' +
        '</div>';
    }).join('');
  }).catch(() => {});

  // Task 11: Goals
  fetch('/api/finance/goals').then(r => r.json()).then(data => {
    const el = document.getElementById('goalsList');
    if (!el) return;
    if (!data || !data.length) {
      el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:12px;font-family:var(--font-body)">>_ no savings goals</div>';
      return;
    }
    el.innerHTML = data.map(g => {
      const pct = g.target > 0 ? Math.min(Math.round(g.current / g.target * 100), 100) : 0;
      const deadlineStr = g.deadline ? ' até ' + g.deadline : '';
      const color = g.color || '#8b5cf6';
      return '<div class="goal-card">' +
        '<div class="goal-card-header">' +
        '<span class="goal-card-icon">' + (g.icon || '🎯') + '</span>' +
        '<span class="goal-card-name">' + escapeHtml(g.name) + '</span>' +
        '<span class="goal-card-deadline">' + deadlineStr + '</span>' +
        '</div>' +
        '<div class="goal-bar-track"><div class="goal-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
        '<div class="goal-bar-text">' +
        '<span>' + formatBRL(g.current) + ' / ' + formatBRL(g.target) + '</span>' +
        '<span>' + pct + '%</span>' +
        '</div>' +
        '<div class="goal-actions">' +
        '<button style="background:var(--accent-muted);color:var(--accent-hover)" onclick="window.addToGoal(\'' + g.id + '\')">+ Adicionar</button>' +
        '<button style="background:var(--bg-hover);color:var(--text-secondary)" onclick="window.deleteGoal(\'' + g.id + '\')">Excluir</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }).catch(() => {});
}

// ── Task 7: Edit transaction inline ──
window.startEditTransaction = function(id) {
  const t = (window.currentTransactions || []).find(x => x.id === id);
  if (!t) return;
  const el = document.querySelector(`[data-txid="${id}"]`);
  if (!el) return;
  el.innerHTML = `
    <form onsubmit="event.preventDefault(); window.saveEditTransaction('${id}')" style="display:flex;gap:4px;flex-wrap:wrap;width:100%">
      <input type="date" value="${t.date}" id="edit-date-${id}" style="width:120px;padding:3px 6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:11px">
      <select id="edit-type-${id}" style="padding:3px 6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:11px">
        <option value="expense" ${t.type==='expense'?'selected':''}>💸 Gasto</option>
        <option value="income" ${t.type==='income'?'selected':''}>💰 Receita</option>
      </select>
      <select id="edit-cat-${id}" style="padding:3px 6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:11px">
        ${CATEGORIES.map(c => '<option value="' + c + '" ' + (t.category===c?'selected':'') + '>' + c + '</option>').join('')}
      </select>
      <input type="number" value="${t.amount}" id="edit-amount-${id}" step="0.01" style="width:90px;padding:3px 6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:11px">
      <input type="text" value="${escapeHtml(t.description||'')}" id="edit-desc-${id}" placeholder="Descrição" style="flex:1;min-width:80px;padding:3px 6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:11px">
      <button type="submit" style="padding:3px 8px;border:none;border-radius:4px;background:var(--accent);color:#fff;font-size:11px;cursor:pointer">💾</button>
      <button type="button" onclick="window.renderFinances()" style="padding:3px 8px;border:none;border-radius:4px;background:var(--bg-hover);color:var(--text-secondary);font-size:11px;cursor:pointer">✕</button>
    </form>
  `;
};

window.saveEditTransaction = function(id) {
  const data = {
    date: document.getElementById('edit-date-' + id).value,
    type: document.getElementById('edit-type-' + id).value,
    category: document.getElementById('edit-cat-' + id).value,
    amount: parseFloat(document.getElementById('edit-amount-' + id).value),
    description: document.getElementById('edit-desc-' + id).value,
  };
  fetch('/api/finance/transactions/' + id, {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  }).then(() => { invalidateCache(); renderFinances(); }).catch(() => {});
};

// ── Task 8: Donut chart SVG ──
function renderDonutChart(byCategory) {
  const el = document.getElementById('financeCategoryChart');
  if (!el) return;
  if (!byCategory || !byCategory.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary)">Nenhum gasto neste mês</div>';
    return;
  }

  // Filter only expenses
  const expenses = byCategory.filter(c => c.total > 0);
  if (!expenses.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary)">Nenhum gasto neste mês</div>';
    return;
  }

  const total = expenses.reduce((sum, c) => sum + c.total, 0);
  if (total === 0) return;

  const size = 160;
  const cx = size / 2, cy = size / 2;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;

  const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];

  let cumulative = 0;
  let svgArcs = '';
  const segments = expenses.slice(0, 8); // max 8 segments

  segments.forEach((c, i) => {
    const pct = c.total / total;
    const offset = circumference * (1 - cumulative);
    const length = circumference * pct;
    const color = colors[i % colors.length];
    svgArcs += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="20" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset .5s"/>`;
    cumulative += pct;
  });

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${svgArcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="22" font-weight="700" font-family="var(--font-mono)">${formatBRL(total).replace('R$ ','')}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">total</text>
      </svg>
      <div style="flex:1;min-width:120px">
        ${segments.map((c, i) => {
          const pct = Math.round(c.total / total * 100);
          const color = colors[i % colors.length];
          return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <span style="flex:1;color:var(--text-secondary)">${escapeHtml(c.category)}</span>
            <span style="font-family:var(--font-mono);color:var(--text-primary)">${pct}%</span>
            <span style="font-family:var(--font-mono);color:var(--text-tertiary);width:60px;text-align:right">${formatBRL(c.total)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Task 9: Trend chart SVG (receitas vs despesas, 12 meses) ──
function renderTrendChart(trendData) {
  const el = document.getElementById('financeTrendChart');
  if (!el || !trendData || trendData.error) return;

  const width = 600, height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...trendData.map(d => Math.max(d.income, d.expense, d.balance)));

  function xPos(i) { return padding.left + (i / (trendData.length - 1 || 1)) * chartW; }
  function yPos(val) { return padding.top + chartH - (val / maxVal) * chartH; }

  function buildLine(data, key) {
    return data.map((d, i) => (i === 0 ? 'M' : 'L') + xPos(i) + ',' + yPos(d[key])).join(' ');
  }

  const incomeLine = buildLine(trendData, 'income');
  const expenseLine = buildLine(trendData, 'expense');

  // Month labels (every 3 months)
  let monthLabels = '';
  trendData.forEach((d, i) => {
    if (i % 3 === 0 || i === trendData.length - 1) {
      const parts = d.month.split('-');
      const label = parts[0].slice(2) + '/' + parts[1];
      monthLabels += `<text x="${xPos(i)}" y="${height - 5}" text-anchor="middle" fill="var(--text-tertiary)" font-size="9" font-family="var(--font-mono)">${label}</text>`;
    }
  });

  // Y axis labels
  let yLabels = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const val = (maxVal / steps) * i;
    const y = yPos(val);
    yLabels += `<text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" fill="var(--text-tertiary)" font-size="9" font-family="var(--font-mono)">${Math.round(val)}</text>`;
    yLabels += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
  }

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <svg width="100%" viewBox="0 0 ${width} ${height}" style="max-width:${width}px">
        ${yLabels}
        ${monthLabels}
        <path d="${incomeLine}" fill="none" stroke="var(--success)" stroke-width="2" stroke-linejoin="round"/>
        <path d="${expenseLine}" fill="none" stroke="var(--error)" stroke-width="2" stroke-linejoin="round"/>
        <!-- legend -->
        <circle cx="${padding.left}" cy="${padding.top - 8}" r="4" fill="var(--success)"/>
        <text x="${padding.left + 10}" y="${padding.top - 4}" fill="var(--text-secondary)" font-size="10">Receitas</text>
        <circle cx="${padding.left + 80}" cy="${padding.top - 8}" r="4" fill="var(--error)"/>
        <text x="${padding.left + 90}" y="${padding.top - 4}" fill="var(--text-secondary)" font-size="10">Despesas</text>
      </svg>
    </div>
  `;
}

// ── Transaction list render ──
function renderTransactionList(txs, el) {
  if (!txs || !txs.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-family:var(--font-body)">>_ no transactions this month</div>';
    return;
  }
  el.innerHTML = txs.map(t => {
    const d = new Date(t.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
    const cls = t.type === 'income' ? 'tx-income' : 'tx-expense';
    const prefix = t.type === 'income' ? '+' : '-';
    return '<div class="tx-row" data-txid="' + t.id + '" onclick="window.startEditTransaction(\'' + t.id + '\')" style="cursor:pointer">' +
      '<span class="tx-date">' + dateStr + '</span>' +
      '<span class="tx-cat">' + escapeHtml(t.category) + '</span>' +
      '<span class="tx-desc">' + escapeHtml(t.description) + '</span>' +
      '<span class="tx-amount ' + cls + '">' + prefix + ' ' + formatBRL(parseFloat(t.amount)) + '</span>' +
      '<button class="tx-del" onclick="event.stopPropagation(); window.deleteTransaction(\'' + t.id + '\')">✕</button>' +
      '</div>';
  }).join('');
}

window.deleteTransaction = function(id) {
  fetch('/api/finance/transactions/' + id, {method:'DELETE'})
    .then(() => { invalidateCache(); renderFinances(); })
    .catch(() => {});
};

// ── Add transaction form ──
window.showAddTransaction = function() {
  const el = document.getElementById('addTxForm');
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  const today = new Date().toISOString().slice(0,10);
  el.style.display = 'block';
  el.innerHTML = '<div class="add-tx-row">' +
    '<input type="date" id="txDate" value="' + today + '" style="width:140px">' +
    '<select id="txType"><option value="expense">💸 Gasto</option><option value="income">💰 Receita</option></select>' +
    '<select id="txCategory">' + CATEGORIES.map(c => '<option value="' + c + '">' + c + '</option>').join('') + '</select>' +
    '<input type="number" id="txAmount" placeholder="Valor" step="0.01" style="width:100px">' +
    '<input type="text" id="txDesc" placeholder="Descrição" style="flex:1;min-width:120px">' +
    '<button class="btn-cyber btn-cyber-ghost" onclick="window.submitTransaction()" style="font-size:11px">Salvar</button>' +
    '<button class="btn-cyber btn-cyber-ghost" onclick="document.getElementById(\'addTxForm\').style.display=\'none\'" style="font-size:11px">Cancelar</button>' +
    '</div>';
};

window.submitTransaction = function() {
  const data = {
    date: document.getElementById('txDate').value,
    type: document.getElementById('txType').value,
    category: document.getElementById('txCategory').value,
    amount: parseFloat(document.getElementById('txAmount').value),
    description: document.getElementById('txDesc').value,
  };
  if (!data.amount || data.amount <= 0) return;
  fetch('/api/finance/transactions', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  }).then(() => {
    document.getElementById('addTxForm').style.display = 'none';
    invalidateCache();
    renderFinances();
  }).catch(() => {});
};

// ── Task 10: Recurring UI ──
window.showAddRecurring = function() {
  const el = document.getElementById('addRecurringForm');
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '<div class="add-tx-row">' +
    '<select id="recType"><option value="expense">💸 Gasto</option><option value="income">💰 Receita</option></select>' +
    '<select id="recCategory">' + CATEGORIES.map(c => '<option value="' + c + '">' + c + '</option>').join('') + '</select>' +
    '<input type="number" id="recAmount" placeholder="Valor" step="0.01" style="width:100px">' +
    '<input type="text" id="recDesc" placeholder="Descrição" style="flex:1;min-width:120px">' +
    '<select id="recFreq"><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="yearly">Anual</option></select>' +
    '<input type="number" id="recDay" placeholder="Dia" min="1" max="31" value="1" style="width:60px">' +
    '<button class="btn-cyber btn-cyber-ghost" onclick="window.submitRecurring()" style="font-size:11px">Salvar</button>' +
    '<button class="btn-cyber btn-cyber-ghost" onclick="document.getElementById(\'addRecurringForm\').style.display=\'none\'" style="font-size:11px">Cancelar</button>' +
    '</div>';
};

window.submitRecurring = function() {
  const data = {
    type: document.getElementById('recType').value,
    category: document.getElementById('recCategory').value,
    amount: parseFloat(document.getElementById('recAmount').value),
    description: document.getElementById('recDesc').value,
    frequency: document.getElementById('recFreq').value,
    day: parseInt(document.getElementById('recDay').value) || 1,
  };
  if (!data.amount || data.amount <= 0) return;
  fetch('/api/finance/recurring', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  }).then(() => {
    document.getElementById('addRecurringForm').style.display = 'none';
    invalidateCache();
    renderFinances();
  }).catch(() => {});
};

window.launchRecurring = function(id) {
  fetch('/api/finance/recurring').then(r => r.json()).then(list => {
    const rec = list.find(x => x.id === id);
    if (!rec) return;
    const today = new Date().toISOString().slice(0,10);
    const data = {
      date: today,
      type: rec.type,
      category: rec.category,
      amount: rec.amount,
      description: (rec.description || rec.category) + ' (recorrente)',
    };
    fetch('/api/finance/transactions', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
    }).then(() => { invalidateCache(); renderFinances(); }).catch(() => {});
  }).catch(() => {});
};

window.deleteRecurring = function(id) {
  fetch('/api/finance/recurring/' + id, {method:'DELETE'})
    .then(() => { invalidateCache(); renderFinances(); })
    .catch(() => {});
};

// ── Task 11: Goals UI ──
window.showAddGoal = function() {
  const el = document.getElementById('addGoalForm');
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '<div class="add-tx-row">' +
    '<input type="text" id="goalName" placeholder="Nome da meta" style="flex:1;min-width:120px">' +
    '<input type="number" id="goalTarget" placeholder="Meta (R$)" step="0.01" style="width:100px">' +
    '<input type="number" id="goalCurrent" placeholder="Inicial (R$)" step="0.01" style="width:100px" value="0">' +
    '<input type="date" id="goalDeadline" style="width:140px">' +
    '<input type="text" id="goalIcon" placeholder="Ícone" style="width:50px" value="🎯">' +
    '<button class="btn-cyber btn-cyber-ghost" onclick="window.submitGoal()" style="font-size:11px">Salvar</button>' +
    '<button class="btn-cyber btn-cyber-ghost" onclick="document.getElementById(\'addGoalForm\').style.display=\'none\'" style="font-size:11px">Cancelar</button>' +
    '</div>';
};

window.submitGoal = function() {
  const data = {
    name: document.getElementById('goalName').value,
    target: parseFloat(document.getElementById('goalTarget').value),
    current: parseFloat(document.getElementById('goalCurrent').value) || 0,
    deadline: document.getElementById('goalDeadline').value || null,
    icon: document.getElementById('goalIcon').value || '🎯',
  };
  if (!data.name || !data.target || data.target <= 0) return;
  fetch('/api/finance/goals', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  }).then(() => {
    document.getElementById('addGoalForm').style.display = 'none';
    invalidateCache();
    renderFinances();
  }).catch(() => {});
};

window.addToGoal = function(id) {
  const val = prompt('Quanto deseja adicionar? (R$)');
  if (!val) return;
  const amount = parseFloat(val);
  if (amount <= 0) return;
  // We need to get current value first
  fetch('/api/finance/goals').then(r => r.json()).then(list => {
    const goal = list.find(g => g.id === id);
    if (!goal) return;
    const newCurrent = (parseFloat(goal.current) || 0) + amount;
    fetch('/api/finance/goals/' + id, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({current: newCurrent})
    }).then(() => { invalidateCache(); renderFinances(); }).catch(() => {});
  }).catch(() => {});
};

window.deleteGoal = function(id) {
  if (!confirm('Excluir esta meta?')) return;
  fetch('/api/finance/goals/' + id, {method:'DELETE'})
    .then(() => { invalidateCache(); renderFinances(); })
    .catch(() => {});
};

// ── Task 14: Export CSV button ──
window.exportCSV = function() {
  const month = getFinanceMonth();
  window.open('/api/finance/export?month=' + month, '_blank');
};
