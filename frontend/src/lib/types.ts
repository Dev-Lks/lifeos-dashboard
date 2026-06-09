export type Status = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  title: string;
  status: Status;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
  created_at?: string;
  updated_at?: string;
  due_date?: string;
  assignee?: string;
  tags?: string;
  archived?: boolean;
  project_id?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  agent?: string;
  priority?: string;
  due_date?: string;
  tags?: string;
  open_tasks?: number;
  stale?: boolean;
}

export interface Automation {
  id: string;
  name: string;
  type: string;
  schedule?: string;
  frequency?: string;
  owner_agent?: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  config?: Record<string, unknown>;
}

export interface Habit {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  done_today?: boolean;
  streak?: number;
}

export interface CommandCenter {
  today_focus: Task[];
  active_projects: Project[];
  upcoming_automations: Automation[];
  habits: { today?: { habits?: Habit[] }; streaks?: Habit[] };
  system_health: Record<string, any>;
  activity_timeline: Array<{ type: string; label: string; time?: string; status?: string; agent?: string }>;
  recommendations: Array<{ message: string; severity: string; action?: string }>;
  agent_briefing: Record<string, { queued: number; completed_7d: number; status: string }>;
}

export interface AtlasContext {
  agent: { name: string; role: string; capabilities: string[] };
  command_center: CommandCenter;
  finance?: { month: string; summary: FinanceSummary };
  shell_enabled?: boolean;
}

export interface FinanceSummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  by_category: Array<{ category: string; total: number; budget?: number; budget_pct?: number }>;
}
