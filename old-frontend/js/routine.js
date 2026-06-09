/* ═══════════════════════════════════════
   ROUTINE TAB — Hábitos + Daily Log + Streaks + History
   ═══════════════════════════════════════ */

import { escapeHtml, showToast } from './api.js';

let selectedMood = null;

export function renderRoutine() {
  // Today's habits
  fetch('/api/routine/today').then(r => r.json()).then(data => {
    const habitsEl = document.getElementById('todayHabits');
    if (!habitsEl) return;
    if (!data.habits || !data.habits.length) {
      habitsEl.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:13px;text-align:center">Nenhum hábito criado ainda. Use o botão abaixo.</div>' +
        '<button class="tab-btn active" onclick="window.showAddHabit()" style="font-size:11px;margin-top:8px">+ Criar Hábito</button>';
    } else {
      const done = data.habits.filter(h => h.done_today).length;
      const total = data.habits.length;
      const progressEl = document.getElementById('todayProgress');
      if (progressEl) {
        progressEl.innerHTML =
          '<div style="margin-bottom:6px;font-size:12px;color:var(--text-secondary)">' + done + '/' + total + ' hábitos concluídos</div>' +
          '<div style="height:4px;background:var(--bg-elevated);border-radius:2px;overflow:hidden"><div style="height:100%;background:var(--accent);border-radius:2px;width:' + (total ? Math.round(done/total*100) : 0) + '%;transition:width .3s"></div></div>';
      }
      habitsEl.innerHTML = data.habits.map(h =>
        '<div class="habit-row">' +
        '<div class="habit-check' + (h.done_today ? ' done' : '') + '" onclick="window.toggleHabit(\'' + h.id + '\')"></div>' +
        '<span class="habit-name' + (h.done_today ? ' done' : '') + '">' + (h.icon || '✅') + ' ' + escapeHtml(h.name) + '</span>' +
        '<button class="tab-btn" onclick="window.deleteHabit(\'' + h.id + '\')" style="font-size:10px;color:var(--text-tertiary)">✕</button>' +
        '</div>'
      ).join('') +
      '<button class="tab-btn active" onclick="window.showAddHabit()" style="font-size:11px;margin-top:8px">+ Hábito</button>';
    }

    // Daily log
    const dl = data.daily_log || {};
    const moods = ['😢','😐','🙂','😊','🤩'];
    const selMood = dl.mood || 0;
    const dlForm = document.getElementById('dailyLogForm');
    if (dlForm) {
      dlForm.innerHTML =
        '<div class="daily-log-form">' +
        '<label style="font-size:12px;color:var(--text-secondary)">Humor:</label>' +
        '<div class="mood-picker">' +
        moods.map((m, i) => '<button class="mood-btn' + (selMood === i+1 ? ' active' : '') + '" onclick="window.selectMood(' + (i+1) + ')">' + m + '</button>').join('') +
        '</div>' +
        '<input id="dlFocus" placeholder="Foco do dia" value="' + escapeHtml(dl.focus || '') + '">' +
        '<textarea id="dlSummary" placeholder="Como foi o dia?" rows="2">' + escapeHtml(dl.summary || '') + '</textarea>' +
        '<button class="tab-btn active" onclick="window.saveDailyLog()" style="font-size:11px;align-self:flex-start">Salvar Daily Log</button>' +
        '</div>';
    }
  });

  // Streaks
  fetch('/api/routine/streaks').then(r => r.json()).then(streaks => {
    const el = document.getElementById('streakCards');
    if (!el) return;
    if (!streaks || !streaks.length) {
      el.innerHTML = '<div style="padding:20px;color:var(--text-tertiary);text-align:center">Complete hábitos para ver streaks</div>';
      return;
    }
    el.innerHTML = streaks.map(s =>
      '<div class="dream-card"><div class="dream-card-icon" style="font-size:28px">' + (s.icon || '✅') + '</div>' +
      '<div class="dream-card-value" style="font-size:18px">' + s.streak + ' 🔥</div>' +
      '<div class="dream-card-label">' + escapeHtml(s.name) + '</div></div>'
    ).join('');
  });

  // History
  fetch('/api/routine/history?days=7').then(r => r.json()).then(h => {
    const el = document.getElementById('habitHistory');
    if (!el) return;
    if (!h.habits || !h.habits.length) {
      el.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);text-align:center">Complete hábitos para ver o histórico</div>';
      return;
    }
    const dayNames = h.dates.map(d => {
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString('pt-BR', {weekday:'short'}).slice(0,3);
    });
    let html = '<div class="habit-grid" style="grid-template-columns:120px repeat(' + h.dates.length + ',1fr)">';
    html += '<div></div>' + dayNames.map(d => '<div class="habit-grid-header">' + d + '</div>').join('');
    h.habits.forEach(habit => {
      html += '<div class="habit-grid-label">' + (habit.icon || '') + ' ' + escapeHtml(habit.name) + '</div>';
      h.dates.forEach(d => {
        const done = habit.days[d];
        html += '<div class="habit-grid-cell ' + (done ? 'done' : 'miss') + '">' + (done ? '✓' : '·') + '</div>';
      });
    });
    html += '</div>';
    el.innerHTML = html;
  });
}

window.selectMood = function(v) {
  selectedMood = v;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.mood-btn');
  if (btns[v-1]) btns[v-1].classList.add('active');
};

window.saveDailyLog = function() {
  const data = { mood: selectedMood, focus: document.getElementById('dlFocus').value, summary: document.getElementById('dlSummary').value };
  fetch('/api/routine/daily-log', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})
    .then(() => { showToast('✅ Daily log salvo!'); renderRoutine(); })
    .catch(() => {});
};

window.toggleHabit = function(id) {
  fetch('/api/routine/habits/' + id + '/log', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({})})
    .then(() => renderRoutine())
    .catch(() => {});
};

window.deleteHabit = function(id) {
  fetch('/api/routine/habits/' + id, {method:'DELETE'})
    .then(() => renderRoutine())
    .catch(() => {});
};

window.showAddHabit = function() {
  const name = prompt('Nome do hábito (ex: Ler 20min):');
  if (!name) return;
  const icon = prompt('Ícone (emoji, ex: 📚):', '✅') || '✅';
  fetch('/api/routine/habits', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, icon, frequency:'daily'})})
    .then(() => renderRoutine())
    .catch(() => {});
};
