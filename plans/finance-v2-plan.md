# Finance Dashboard v2 — Real-Life Personal Finance

> **Para Dev:** Implementar feature a feature. Ordem importa — começar pelas APIs, depois frontend.

**Goal:** Transformar a tab Finanças de um CRUD básico de transações num dashboard financeiro pessoal completo, inspirado em apps como Mobills, Organizze e YNAB.

**Tech Stack:** Python 3 stdlib + sqlite3 (backend), Vanilla JS ES modules (frontend), já existente em `/root/hermes-dashboard/`.

---

## Principais mudanças (visão geral)

| Funcionalidade | Estado atual | Novo estado |
|---|---|---|
| Transações | Create, Delete (sem editar) | CRUD completo: Criar, Editar, Excluir, Buscar |
| Budgets | Por categoria/mês (upsert) | Por categoria/mês com % usado, alerta visual |
| Gastos por categoria | Bar chart horizontal | Donut chart + ranking + meta % |
| Tendência mensal | ❌ Não existe | Line chart últimos 12 meses |
| Receitas vs Despesas | Só no summary do mês | Gráfico comparativo mensal |
| Transações recorrentes | ❌ Não existe | Assinaturas, contas fixas, salário |
| Metas de economia | ❌ Não existe | Savings goals com progresso |
| Comparativo mês anterior | ❌ Não existe | Cards: "vs mês passado" |
| Export CSV | ❌ Não existe | Botão exportar transações do mês |
| BRL formatting | ❌ Não (só toFixed) | R$ 1.234,56 formatado |

---

## Task 1: API — Editar transação (PATCH)

**Objetivo:** Adicionar endpoint PATCH para editar transações existentes.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/server/finance.py`
- Modificar: `/root/agent-mission-control/server.py`

**Step 1: Adicionar `_update_transaction` em finance.py**

```python
def _update_transaction(tid, data):
    try:
        db = _life_conn()
        sets = []
        params = []
        for key in ("date", "type", "category", "amount", "description"):
            if key in data:
                sets.append(f"{key} = ?")
                params.append(data[key])
        if not sets:
            db.close()
            return {"error": "no fields to update"}
        params.append(tid)
        db.execute(f"UPDATE transactions SET {', '.join(sets)} WHERE id = ?", params)
        db.commit()
        cur = db.execute("SELECT * FROM transactions WHERE id = ?", (tid,))
        row = cur.fetchone()
        db.close()
        if row:
            return dict(row)
        return {"error": "not found"}
    except Exception as e:
        return {"error": str(e)}
```

**Step 2: Adicionar rota PATCH em server.py**

No `do_PATCH` do Handler, adicionar:
```python
# ── Finance PATCH ──
if len(parts) >= 5 and parts[1] == "api" and parts[2] == "finance" and parts[3] == "transactions":
    tid = parts[4]
    result = _update_transaction(tid, body)
    if "error" not in result:
        self._handle_json(result)
    else:
        self._handle_json(result, 404)
    return
```

**Step 3: Adicionar import** `_update_transaction` no topo de server.py.

---

## Task 2: API — Tendência mensal (GET /api/finance/trends)

**Objetivo:** Endpoint que retorna income/expense/balance dos últimos N meses para gráfico de linha.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/server/finance.py`
- Modificar: `/root/agent-mission-control/server.py`

**Step 1: Adicionar `_monthly_trends`**

```python
def _monthly_trends(months=12):
    """Retorna {months: [{month, income, expense, balance}, ...]}"""
    try:
        db = _life_conn()
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc)
        results = []
        for i in range(months - 1, -1, -1):
            first = today.replace(day=1) - timedelta(days=i * 30)
            month_str = first.strftime("%Y-%m")
            cur = db.execute(
                "SELECT type, COALESCE(SUM(amount),0) as total FROM transactions WHERE strftime('%Y-%m', date) = ? GROUP BY type",
                (month_str,)
            )
            totals = {r['type']: float(r['total']) for r in cur.fetchall()}
            income = totals.get('income', 0)
            expense = totals.get('expense', 0)
            results.append({
                "month": month_str,
                "income": income,
                "expense": expense,
                "balance": income - expense,
            })
        db.close()
        return results
    except Exception as e:
        return {"error": str(e)}
```

**Step 2: Adicionar rota GET**

```python
if path == "/api/finance/trends":
    from urllib.parse import parse_qs
    qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
    months = int(qs.get("months", [12])[0])
    self._handle_json(_monthly_trends(months))
    return
```

**Step 3: Import** `_monthly_trends` no server.py.

---

## Task 3: API — Transações recorrentes

**Objetivo:** Gerir despesas/receitas que se repetem (assinaturas, aluguel, salário).

**Arquivos:**
- Modificar: `/root/hermes-dashboard/server/finance.py`
- Modificar: `/root/agent-mission-control/server.py`

**Step 1: Adicionar tabela no `_life_init`**

```sql
CREATE TABLE IF NOT EXISTS recurring (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    category TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 0),
    description TEXT DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('weekly','monthly','yearly')),
    day INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Adicionar helpers CRUD**

```python
def _list_recurring():
    try:
        db = _life_conn()
        cur = db.execute("SELECT * FROM recurring WHERE active=1 ORDER BY day, category")
        rows = [dict(r) for r in cur.fetchall()]
        db.close()
        return rows
    except Exception as e:
        return {"error": str(e)}

def _create_recurring(data):
    try:
        rid = str(uuid.uuid4())[:8]
        db = _life_conn()
        db.execute(
            "INSERT INTO recurring (id, type, category, amount, description, frequency, day) VALUES (?,?,?,?,?,?,?)",
            (rid, data['type'], data['category'], float(data['amount']), data.get('description',''), data.get('frequency','monthly'), int(data.get('day', 1)))
        )
        db.commit()
        cur = db.execute("SELECT * FROM recurring WHERE id = ?", (rid,))
        row = dict(cur.fetchone())
        db.close()
        return row
    except Exception as e:
        return {"error": str(e)}

def _delete_recurring(rid):
    # Soft delete — marca como inativo
    try:
        db = _life_conn()
        db.execute("UPDATE recurring SET active=0 WHERE id=?", (rid,))
        db.commit()
        db.close()
        return True
    except Exception:
        return False
```

**Step 3: Adicionar rotas GET/POST/DELETE em server.py**.

---

## Task 4: API — Metas de economia (Savings Goals)

**Objetivo:** Permitir criar metas (ex: "R$ 2000 para viagem em Dezembro") com progresso.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/server/finance.py`
- Modificar: `/root/agent-mission-control/server.py`

**Step 1: Adicionar tabela**

```sql
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target REAL NOT NULL CHECK(target > 0),
    current REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    icon TEXT DEFAULT '🎯',
    color TEXT DEFAULT '#8b5cf6',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Adicionar CRUD** (list, create, update_current, delete).

**Step 3: Adicionar rotas** GET/POST/PATCH/DELETE.

---

## Task 5: API — Comparativo mês anterior

**Objetivo:** Endpoint que retorna diff % entre mês atual e anterior.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/server/finance.py`
- Modificar: `/root/agent-mission-control/server.py`

```python
def _month_comparison(current_month):
    """Retorna {expense_change_pct, income_change_pct} vs mês anterior."""
    from datetime import datetime
    try:
        y, m = current_month.split('-')
        ym = int(y); mm = int(m)
        if mm == 1:
            prev_month = f"{ym-1}-12"
        else:
            prev_month = f"{ym}-{mm-1:02d}"
        
        current = _month_summary(current_month)
        previous = _month_summary(prev_month)
        
        def pct_change(curr, prev):
            if prev == 0: return 0 if curr == 0 else 100
            return round((curr - prev) / prev * 100, 1)
        
        return {
            "current_month": current_month,
            "previous_month": prev_month,
            "expense_change_pct": pct_change(current.get('expense',0), previous.get('expense',0)),
            "income_change_pct": pct_change(current.get('income',0), previous.get('income',0)),
            "current_expense": current.get('expense',0),
            "previous_expense": previous.get('expense',0),
        }
    except Exception as e:
        return {"error": str(e)}
```

Rota: `GET /api/finance/compare?month=2026-06`

---

## Task 6: API — Export CSV

**Objetivo:** Endpoint que retorna transações do mês como CSV.

**Arquivos:**
- Modificar: `/root/agent-mission-control/server.py`

```python
if path == "/api/finance/export":
    from urllib.parse import parse_qs
    qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
    month = qs.get("month", [None])[0]
    txs = _list_transactions(month)
    import csv, io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date","type","category","amount","description"])
    for t in txs:
        writer.writerow([t['date'], t['type'], t['category'], t['amount'], t.get('description','')])
    csv_data = output.getvalue()
    self.send_response(200)
    self.send_header("Content-Type", "text/csv")
    self.send_header("Content-Disposition", f'attachment; filename="financas-{month or "all"}.csv"')
    self.send_header("Content-Length", str(len(csv_data)))
    self.end_headers()
    self.wfile.write(csv_data.encode())
    return
```

---

## Task 7: Frontend — Edit transaction (inline)

**Objetivo:** Clicar numa transação para editá-la inline.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`

**Mudanças:**
1. No `renderTransactionList`, cada tx-row ganha um clique para `window.startEditTransaction(t.id)`
2. `startEditTransaction(id)` — transforma a linha num formulário inline (date, type, category, amount, desc)
3. `saveEditTransaction(id)` — faz PATCH para `/api/finance/transactions/{id}`
4. `cancelEditTransaction(id)` — volta ao estado anterior

**UI:**
```javascript
window.startEditTransaction = function(id) {
  const t = currentTransactions.find(x => x.id === id);
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
```

---

## Task 8: Frontend — Donut chart de categorias

**Objetivo:** Substituir as barras horizontais por um donut chart SVG.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`
- Modificar: `/root/hermes-dashboard/css/styles.css`

**Mudanças:**
1. Na `renderFinances()`, depois de carregar o summary, gerar SVG donut
2. Usar stroke-dasharray + stroke-dashoffset para criar arcos
3. Adicionar legenda ao lado

```javascript
function renderDonutChart(byCategory) {
  const el = document.getElementById('financeCategoryChart');
  if (!el) return;
  if (!byCategory || !byCategory.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary)">Nenhum gasto neste mês</div>';
    return;
  }
  
  const total = byCategory.reduce((sum, c) => sum + c.total, 0);
  if (total === 0) return;
  
  const size = 160;
  const cx = size / 2, cy = size / 2;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  
  const colors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
  
  let cumulative = 0;
  let svgArcs = '';
  const segments = byCategory.slice(0, 8); // max 8 segments
  
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
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="22" font-weight="700" font-family="var(--font-mono)">R$ ${total.toFixed(0)}</text>
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
            <span style="font-family:var(--font-mono);color:var(--text-tertiary);width:60px;text-align:right">R$ ${c.total.toFixed(0)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}
```

---

## Task 9: Frontend — Trend chart SVG (receitas vs despesas)

**Objetivo:** Gráfico de linhas mostrando evolução mensal.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`

**Mudanças:**
1. No `renderFinances()`, fazer fetch a `/api/finance/trends?months=12`
2. Renderizar SVG com duas linhas (income em verde, expense em vermelho) + eixo X/Y

---

## Task 10: Frontend — Transações recorrentes UI

**Objetivo:** Nova secção "🔄 Recorrentes" com lista de contas fixas + atalho para adicionar.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`
- Modificar opcionalmente: `/root/index.html` (adicionar container no panel-finances)

**UI:**
```html
<div class="section" style="margin-top:16px">
  <div class="section-title">🔄 Recorrentes</div>
  <div id="recurringList"></div>
</div>
```

Cada item mostra: ícone, descrição, valor, dia do vencimento, toggle ativo/inativo, botão "Lançar agora" que cria uma transação com a data de hoje.

---

## Task 11: Frontend — Savings Goals UI

**Objetivo:** Cards de metas com progresso visual.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`

Cada goal é um card com:
- Nome + ícone
- Barra de progresso (current / target)
- Valor atual / meta
- Deadline (se tiver)
- Botão "Adicionar valor" (abre prompt para adicionar ao current)

---

## Task 12: Frontend — Comparativo vs mês anterior

**Objetivo:** Mostrar "vs mês passado" nos cards de summary.

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`

No summary grid, adicionar seta indicadora:
```
Despesas: R$ 1.200  ↓ 15% vs mês passado  (verde se caiu)
Receitas: R$ 3.000  ↑ 8% vs mês passado   (verde se subiu)
```

---

## Task 13: Frontend — BRL formatting helper

**Objetivo:** Formatar valores no padrão brasileiro (R$ 1.234,56).

**Arquivos:**
- Modificar: `/root/hermes-dashboard/js/finance.js`

```javascript
function formatBRL(value) {
  return 'R$ ' + value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
```

Usar em todo o finance.js.

---

## Task 14: Frontend — Export CSV button

**Objetivo:** Botão "Exportar CSV" no cabeçalho da tab Finanças.

```javascript
window.exportCSV = function() {
  const month = getFinanceMonth();
  window.open('/api/finance/export?month=' + month, '_blank');
};
```

Adicionar no HTML da finance tab.

---

## Estratégia de implementação

1. **Fazer Tasks 1-6 primeiro** (backend APIs) — são independentes entre si
2. **Restart do servidor** após todas as APIs
3. **Fazer Tasks 7-14** (frontend) — dependem das APIs
4. **Testar** cada feature à medida que é implementada

## Validação final

1. `curl -s http://localhost:8700/api/finance/trends | head -c 200` → JSON com 12 meses
2. `curl -s http://localhost:8700/api/finance/compare?month=2026-06` → diff %
3. `curl -s http://localhost:8700/api/finance/recurring` → array (pode ser vazio)
4. `curl -s http://localhost:8700/api/finance/goals` → array (pode ser vazio)
5. Abrir dashboard → Finanças → donut chart visível, trend chart, edit inline funcional
6. Export CSV → faz download de ficheiro
