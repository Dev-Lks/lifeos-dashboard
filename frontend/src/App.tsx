import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Command,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  Moon,
  NotebookText,
  Plus,
  RefreshCcw,
  Shield,
  Sparkles,
  Terminal,
  X
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api, money, relative, shortDate } from './lib/api';
import type { AtlasContext, Automation, CommandCenter, FinanceSummary, Habit, Project, Status, Task } from './lib/types';

const nav = [
  { to: '/', label: 'Atlas', icon: Home },
  { to: '/work', label: 'Work', icon: FolderKanban },
  { to: '/finance', label: 'Finance', icon: CircleDollarSign },
  { to: '/routine', label: 'Routine', icon: CheckCircle2 },
  { to: '/automations', label: 'Automations', icon: RefreshCcw },
  { to: '/systems', label: 'Systems', icon: Terminal }
];

const statusLabels: Record<Status, string> = {
  pending: 'Inbox',
  in_progress: 'Doing',
  completed: 'Done'
};

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ');
}

function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ authenticated: boolean }>('/api/auth/session'),
    retry: false
  });
}

function LoginPage() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useMutation({
    mutationFn: () => api.post('/api/auth/login', { password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
    onError: () => setError('Senha incorreta ou sessão indisponível.')
  });

  return (
    <main className="login-screen">
      <section className="login-panel cyber-panel">
        <div className="brand-mark">A</div>
        <p className="eyebrow">Secure personal operating system</p>
        <h1 className="glitch-title" data-text="ATLAS">ATLAS</h1>
        <p className="muted">Entre para acessar tarefas, finanças, rotina, automações e o operador Atlas.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <label htmlFor="password">Senha LifeOS</label>
          <input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="LIFEOS_PASSWORD"
          />
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" disabled={login.isPending}>
            <Shield size={18} /> {login.isPending ? 'Validando' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const title = nav.find((item) => item.to === location.pathname)?.label || 'LifeOS';
  const logout = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      queryClient.setQueryData(['session'], { authenticated: false });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      navigate('/');
    }
  });

  return (
    <div className="app-shell">
      <aside className={cx('sidebar', open && 'open')}>
        <div className="sidebar-brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>ATLAS</strong>
            <span>LifeOS daily ops</span>
          </div>
          <button className="icon-button mobile-only" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <nav>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => cx('nav-item', isActive && 'active')}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>secure session</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">Lucas command surface</p>
            <h1>{title}</h1>
          </div>
          <button className="ghost-button" onClick={() => logout.mutate()}>
            <LogOut size={16} /> Sair
          </button>
        </header>
        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <article className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function Section({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="cyber-panel section">
      <header className="section-head">
        <div>
          <span className="section-title">
            {icon} {title}
          </span>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Severity({ value }: { value?: string }) {
  return <span className={cx('badge', value === 'high' && 'danger', value === 'medium' && 'warning')}>{value || 'low'}</span>;
}

function DashboardPage() {
  const context = useQuery({
    queryKey: ['atlas-context'],
    queryFn: () => api.get<AtlasContext>('/api/right-hand/context'),
    refetchInterval: 30000
  });
  const cc = context.data?.command_center;

  return (
    <div className="dashboard-grid">
      <AtlasConsole context={context.data} />
      <div className="side-stack">
        <CommandBriefing cc={cc} finance={context.data?.finance?.summary} />
        <ApprovalQueue />
      </div>
    </div>
  );
}

function CommandBriefing({ cc, finance }: { cc?: CommandCenter; finance?: FinanceSummary }) {
  const habits = cc?.habits?.today?.habits || [];
  const completed = habits.filter((habit) => habit.done_today).length;
  return (
    <div className="briefing-grid">
      <StatCard label="Focus tasks" value={cc?.today_focus?.length || 0} hint="prioridade de hoje" />
      <StatCard label="Projects" value={cc?.active_projects?.length || 0} hint="ativos" />
      <StatCard label="Habits" value={`${completed}/${habits.length || 0}`} hint="hoje" />
      <StatCard label="Balance" value={money(finance?.balance || 0)} hint="mes atual" />
      <Section title="Today's Focus" icon={<Command size={16} />}>
        <div className="list-stack">
          {(cc?.today_focus || []).slice(0, 6).map((task) => (
            <div className="list-row" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <small>{task.assignee || 'unassigned'} · {shortDate(task.due_date)}</small>
              </div>
              <Severity value={task.priority} />
            </div>
          ))}
          {!cc?.today_focus?.length ? <p className="empty">Sem foco pendente. Escolha uma alavanca e execute.</p> : null}
        </div>
      </Section>
      <Section title="Recommendations" icon={<Sparkles size={16} />}>
        <div className="list-stack">
          {(cc?.recommendations || []).slice(0, 5).map((rec, index) => (
            <div className="list-row" key={`${rec.message}-${index}`}>
              <div>
                <strong>{rec.action || 'next_action'}</strong>
                <small>{rec.message}</small>
              </div>
              <Severity value={rec.severity} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function AtlasConsole({ context }: { context?: AtlasContext }) {
  const [sessionId, setSessionId] = useState<string | null>(localStorage.getItem('atlasSessionId'));
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<Array<{ role: 'user' | 'atlas'; text: string }>>([
    { role: 'atlas', text: 'Atlas online. Me diga o que precisa operar hoje.' }
  ]);
  const queryClient = useQueryClient();
  const ask = useMutation({
    mutationFn: (text: string) => api.post<{ response: string; session_id: string; actions?: unknown[] }>('/api/right-hand/ask', { message: text, session_id: sessionId }),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      localStorage.setItem('atlasSessionId', data.session_id);
      setLog((items) => [...items, { role: 'atlas', text: data.response || 'Sem resposta.' }]);
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => setLog((items) => [...items, { role: 'atlas', text: 'Atlas indisponivel agora. Contexto local e aprovacoes seguem ativos.' }])
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setLog((items) => [...items, { role: 'user', text }]);
    setMessage('');
    ask.mutate(text);
  }

  const suggestions = ['/task add Revisar prioridades de hoje', 'briefing do sistema', 'criar projeto LifeOS v4', 'concluir task <id>'];

  return (
    <section className="atlas-console cyber-panel">
      <div className="atlas-hero">
        <div className="brand-mark large">A</div>
        <div>
          <p className="eyebrow">Right-hand operator</p>
          <h2 className="glitch-title small" data-text="Atlas">Atlas</h2>
          <p>{context?.agent?.role || 'Context-aware system operator'}</p>
        </div>
        <span className={cx('badge', context?.shell_enabled ? 'warning' : '')}>{context?.shell_enabled ? 'shell armed' : 'shell locked'}</span>
      </div>
      <div className="chip-row">
        {suggestions.map((item) => (
          <button key={item} className="chip" onClick={() => setMessage(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="chat-log">
        {log.map((item, index) => (
          <div key={`${item.role}-${index}`} className={cx('chat-message', item.role === 'user' && 'user')}>
            <small>{item.role === 'user' ? 'Lucas' : 'Atlas'}</small>
            <p>{item.text}</p>
          </div>
        ))}
        {ask.isPending ? <div className="thinking">Atlas analisando contexto...</div> : null}
      </div>
      <form className="console-form" onSubmit={submit}>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Comando, pergunta ou acao para aprovar..." />
        <button className="primary-button">
          <ChevronRight size={18} /> Enviar
        </button>
      </form>
    </section>
  );
}

function ApprovalQueue() {
  const queryClient = useQueryClient();
  const approvals = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get<Array<any>>('/api/right-hand/approvals?status=pending'),
    refetchInterval: 15000
  });
  const execute = useMutation({
    mutationFn: (id: string) => api.post(`/api/right-hand/approvals/${id}/execute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] })
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/api/right-hand/approvals/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvals'] })
  });
  return (
    <Section title="Approval Queue" icon={<Shield size={16} />}>
      <div className="list-stack">
        {(approvals.data || []).map((item) => (
          <div className="approval-card" key={item.id}>
            <strong>{item.summary || item.action_type}</strong>
            <small>{item.action_type} · risk {item.risk}</small>
            <pre>{JSON.stringify(item.payload, null, 2)}</pre>
            <div className="button-row">
              <button className="primary-button compact" onClick={() => execute.mutate(item.id)}>Executar</button>
              <button className="ghost-button compact" onClick={() => reject.mutate(item.id)}>Rejeitar</button>
            </div>
          </div>
        ))}
        {!approvals.data?.length ? <p className="empty">Nenhuma acao pendente.</p> : null}
      </div>
    </Section>
  );
}

function WorkPage() {
  const [taskFilter, setTaskFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ['tasks', taskFilter, showArchived],
    queryFn: () => api.get<Task[]>(`/api/board?search=${encodeURIComponent(taskFilter)}&archived=${showArchived ? '1' : ''}`)
  });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/api/projects') });
  const updateTask = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Task> }) => api.patch(`/api/board/${id}`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const status = event.over?.id as Status | undefined;
    if (status) updateTask.mutate({ id, payload: { status } });
  }

  const grouped = useMemo(() => {
    const base: Record<Status, Task[]> = { pending: [], in_progress: [], completed: [] };
    for (const task of tasks.data || []) base[task.status || 'pending'].push(task);
    return base;
  }, [tasks.data]);

  return (
    <div className="work-grid">
      <section className="cyber-panel section work-main">
        <header className="section-head">
          <div>
            <p className="eyebrow">Tasks and projects</p>
            <span className="section-title">Daily execution board</span>
          </div>
          <div className="toolbar">
            <input value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} placeholder="Buscar task..." />
            <button className="ghost-button compact" onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Ativas' : 'Arquivadas'}</button>
          </div>
        </header>
        <TaskCreator projects={projects.data || []} />
        <DndContext onDragEnd={onDragEnd}>
          <div className="kanban-board">
            {(Object.keys(statusLabels) as Status[]).map((status) => (
              <TaskColumn key={status} status={status} tasks={grouped[status]} onUpdate={(id, payload) => updateTask.mutate({ id, payload })} />
            ))}
          </div>
        </DndContext>
      </section>
      <section className="cyber-panel section">
        <header className="section-head">
          <span className="section-title">Projects</span>
        </header>
        <ProjectCreator />
        <div className="list-stack">
          {(projects.data || []).map((project) => (
            <article className="project-card" key={project.id}>
              <strong>{project.name}</strong>
              <small>{project.description || 'sem descricao'}</small>
              <div className="button-row">
                <span className="badge">{project.priority || 'medium'}</span>
                <span className="badge">{project.status || 'active'}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function TaskCreator({ projects }: { projects: Project[] }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/api/board', { title, priority: 'medium', status: 'pending', project_id: projectId }),
    onSuccess: () => {
      setTitle('');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
  return (
    <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nova task..." />
      <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
        <option value="">Sem projeto</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <button className="primary-button compact"><Plus size={16} /> Criar</button>
    </form>
  );
}

function ProjectCreator() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/api/projects', { name, status: 'active', priority: 'medium' }),
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });
  return (
    <form className="inline-form stacked" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Novo projeto..." />
      <button className="primary-button compact"><Plus size={16} /> Projeto</button>
    </form>
  );
}

function TaskColumn({ status, tasks, onUpdate }: { status: Status; tasks: Task[]; onUpdate: (id: string, payload: Partial<Task>) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cx('kanban-column', isOver && 'over')}>
      <header>
        <strong>{statusLabels[status]}</strong>
        <span>{tasks.length}</span>
      </header>
      {tasks.map((task) => <TaskCard key={task.id} task={task} onUpdate={onUpdate} />)}
    </div>
  );
}

function TaskCard({ task, onUpdate }: { task: Task; onUpdate: (id: string, payload: Partial<Task>) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article ref={setNodeRef} style={style} className={cx('task-card', isDragging && 'dragging')} {...listeners} {...attributes}>
      <div className="task-title">
        <strong>{task.title}</strong>
        <Severity value={task.priority} />
      </div>
      {task.notes ? <p>{task.notes}</p> : null}
      <small>{task.assignee || 'unassigned'} · {shortDate(task.due_date)}</small>
      <div className="button-row">
        {task.status !== 'completed' ? <button className="ghost-button compact" onClick={() => onUpdate(task.id, { status: 'completed' })}>Done</button> : null}
        <button className="ghost-button compact" onClick={() => onUpdate(task.id, { archived: true })}>Archive</button>
      </div>
    </article>
  );
}

function FinancePage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ['finance-summary', month], queryFn: () => api.get<FinanceSummary>(`/api/finance/summary?month=${month}`) });
  const transactions = useQuery({ queryKey: ['transactions', month], queryFn: () => api.get<any[]>(`/api/finance/transactions?month=${month}`) });
  const trends = useQuery({ queryKey: ['trends'], queryFn: () => api.get<any[]>('/api/finance/trends?months=12') });
  const [tx, setTx] = useState({ type: 'expense', category: 'outros', amount: '', description: '' });
  const create = useMutation({
    mutationFn: () => api.post('/api/finance/transactions', { ...tx, amount: Number(tx.amount), date: `${month}-01` }),
    onSuccess: () => {
      setTx({ type: 'expense', category: 'outros', amount: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });
  const cats = summary.data?.by_category || [];

  return (
    <div className="finance-grid">
      <section className="cyber-panel section">
        <header className="section-head">
          <div>
            <p className="eyebrow">Money radar</p>
            <span className="section-title">Finance</span>
          </div>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </header>
        <div className="stats-row">
          <StatCard label="Receita" value={money(summary.data?.income || 0)} />
          <StatCard label="Despesa" value={money(summary.data?.expense || 0)} />
          <StatCard label="Saldo" value={money(summary.data?.balance || 0)} />
        </div>
        <div className="chart-card">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trends.data || []}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" />
              <XAxis dataKey="month" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip contentStyle={{ background: '#12121a', border: '1px solid #2a2a3a' }} />
              <Area dataKey="income" stroke="#00ff88" fill="#00ff8824" />
              <Area dataKey="expense" stroke="#ff3366" fill="#ff336624" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="cyber-panel section">
        <header className="section-head"><span className="section-title">Categories</span></header>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={cats} dataKey="total" nameKey="category" innerRadius={48} outerRadius={82}>
              {cats.map((_, index) => <Cell key={index} fill={['#00ff88', '#00d4ff', '#ff00ff', '#ffb347', '#ff3366'][index % 5]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: '#12121a', border: '1px solid #2a2a3a' }} />
          </PieChart>
        </ResponsiveContainer>
        <form className="inline-form stacked" onSubmit={(event) => { event.preventDefault(); if (tx.amount) create.mutate(); }}>
          <select value={tx.type} onChange={(event) => setTx({ ...tx, type: event.target.value })}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <input value={tx.category} onChange={(event) => setTx({ ...tx, category: event.target.value })} placeholder="categoria" />
          <input value={tx.amount} onChange={(event) => setTx({ ...tx, amount: event.target.value })} type="number" step="0.01" placeholder="valor" />
          <input value={tx.description} onChange={(event) => setTx({ ...tx, description: event.target.value })} placeholder="descricao" />
          <button className="primary-button compact">Adicionar</button>
        </form>
      </section>
      <section className="cyber-panel section finance-list">
        <header className="section-head"><span className="section-title">Transactions</span></header>
        <div className="list-stack">
          {(transactions.data || []).map((item) => (
            <div className="list-row" key={item.id}>
              <div><strong>{item.description || item.category}</strong><small>{item.category} · {shortDate(item.date)}</small></div>
              <span className={cx('money', item.type === 'income' && 'income')}>{money(item.amount)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RoutinePage() {
  const queryClient = useQueryClient();
  const today = useQuery({ queryKey: ['routine-today'], queryFn: () => api.get<{ habits: Habit[]; daily_log?: any }>('/api/routine/today') });
  const streaks = useQuery({ queryKey: ['streaks'], queryFn: () => api.get<Habit[]>('/api/routine/streaks') });
  const history = useQuery({ queryKey: ['habit-history'], queryFn: () => api.get<any>('/api/routine/history?days=7') });
  const [habitName, setHabitName] = useState('');
  const createHabit = useMutation({
    mutationFn: () => api.post('/api/routine/habits', { name: habitName }),
    onSuccess: () => {
      setHabitName('');
      queryClient.invalidateQueries({ queryKey: ['routine-today'] });
      queryClient.invalidateQueries({ queryKey: ['streaks'] });
    }
  });
  const toggleHabit = useMutation({
    mutationFn: (id: string) => api.post(`/api/routine/habits/${id}/log`, { completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-today'] });
      queryClient.invalidateQueries({ queryKey: ['streaks'] });
      queryClient.invalidateQueries({ queryKey: ['habit-history'] });
    }
  });

  return (
    <div className="routine-grid">
      <Section title="Today" icon={<CheckCircle2 size={16} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (habitName.trim()) createHabit.mutate(); }}>
          <input value={habitName} onChange={(event) => setHabitName(event.target.value)} placeholder="Novo habito..." />
          <button className="primary-button compact">Criar</button>
        </form>
        <div className="habit-grid">
          {(today.data?.habits || []).map((habit) => (
            <button key={habit.id} className={cx('habit-card', habit.done_today && 'done')} onClick={() => toggleHabit.mutate(habit.id)}>
              <strong>{habit.name}</strong>
              <small>{habit.done_today ? 'feito hoje' : 'pendente'}</small>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Streaks" icon={<Activity size={16} />}>
        <div className="stats-row">
          {(streaks.data || []).map((habit) => <StatCard key={habit.id} label={habit.name} value={habit.streak || 0} hint="dias" />)}
        </div>
      </Section>
      <Section title="Last 7 Days" icon={<CalendarClock size={16} />}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={(history.data?.habits || []).map((habit: any) => ({ name: habit.name, done: Object.values(habit.days || {}).filter(Boolean).length }))}>
            <CartesianGrid stroke="rgba(255,255,255,.08)" />
            <XAxis dataKey="name" stroke="#6b7280" />
            <YAxis stroke="#6b7280" />
            <Tooltip contentStyle={{ background: '#12121a', border: '1px solid #2a2a3a' }} />
            <Bar dataKey="done" fill="#00ff88" />
          </BarChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
}

function AutomationsPage() {
  const queryClient = useQueryClient();
  const automations = useQuery({ queryKey: ['automations'], queryFn: () => api.get<Automation[]>('/api/automations') });
  const runs = useQuery({ queryKey: ['automation-runs'], queryFn: () => api.get<any[]>('/api/automation-runs') });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/api/automations', { name, type: 'manual', frequency: 'manual', config: { message: name } }),
    onSuccess: () => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    }
  });
  const run = useMutation({
    mutationFn: (id: string) => api.post(`/api/automations/${id}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs'] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    }
  });
  const toggle = useMutation({
    mutationFn: (item: Automation) => api.patch(`/api/automations/${item.id}`, { enabled: !item.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] })
  });

  return (
    <div className="automation-grid">
      <Section title="Automations" icon={<RefreshCcw size={16} />}>
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova automacao manual..." />
          <button className="primary-button compact">Criar</button>
        </form>
        <div className="card-grid">
          {(automations.data || []).map((item) => (
            <article className="project-card" key={item.id}>
              <strong>{item.name}</strong>
              <small>{item.type} · {item.frequency || item.schedule || 'manual'}</small>
              <div className="button-row">
                <button className="primary-button compact" onClick={() => run.mutate(item.id)}>Run</button>
                <button className="ghost-button compact" onClick={() => toggle.mutate(item)}>{item.enabled ? 'Disable' : 'Enable'}</button>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section title="Run History" icon={<Activity size={16} />}>
        <div className="list-stack">
          {(runs.data || []).slice(0, 12).map((runItem) => (
            <div className="list-row" key={runItem.id}>
              <div><strong>{runItem.status}</strong><small>{runItem.output || runItem.error || 'run logged'}</small></div>
              <span className="badge">{relative(runItem.started_at)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function SystemsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<any>('/api/health'), refetchInterval: 15000 });
  const crons = useQuery({ queryKey: ['crons'], queryFn: () => api.get<any[]>('/api/crons') });
  const content = useQuery({ queryKey: ['content'], queryFn: () => api.get<any[]>('/api/content') });
  const data = health.data;
  return (
    <div className="systems-grid">
      <Section title="System Health" icon={<BrainCircuit size={16} />}>
        <div className="stats-row">
          <StatCard label="CPU" value={`${data?.health?.cpu_percent || 0}%`} />
          <StatCard label="RAM" value={`${data?.health?.memory?.percent_used || 0}%`} />
          <StatCard label="Disk" value={`${data?.health?.disk?.percent_used || 0}%`} />
        </div>
      </Section>
      <Section title="Agents" icon={<Bot size={16} />}>
        <p className="empty">Agent telemetry permanece conectado ao snapshot legado e aparece no Atlas briefing.</p>
      </Section>
      <Section title="Schedule" icon={<CalendarClock size={16} />}>
        <div className="list-stack">
          {(crons.data || []).slice(0, 8).map((job, index) => (
            <div className="list-row" key={`${job.name}-${index}`}>
              <div><strong>{job.name || job.command}</strong><small>{job.description || job.schedule}</small></div>
              <span className="badge">{job.owner}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Knowledge" icon={<NotebookText size={16} />}>
        <div className="list-stack">
          {(content.data || []).slice(0, 8).map((doc) => (
            <div className="list-row" key={doc.filename}>
              <div><strong>{doc.title}</strong><small>{doc.filename}</small></div>
              <span className="badge">{doc.agent}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Dreams" icon={<Moon size={16} />}>
        <p className="empty">Dreams continuam como modulo local; esta tela reserva o espaco para persistencia em backend.</p>
      </Section>
    </div>
  );
}

function AppRoutes() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/work" element={<WorkPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/routine" element={<RoutinePage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/systems" element={<SystemsPage />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  const session = useSession();
  if (session.isLoading) {
    return <div className="boot-screen"><Terminal size={28} /> Inicializando LifeOS...</div>;
  }
  if (!session.data?.authenticated) {
    return <LoginPage />;
  }
  return <AppRoutes />;
}
