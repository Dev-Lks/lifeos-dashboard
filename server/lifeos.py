"""Life OS domain endpoints: automations, projects, agent actions, reviews, links."""
import json
import uuid
from datetime import datetime, timezone
from .db import get_conn, migrate_all, migrate_life
from .kanban import board_stats, list_board_tasks
from .routine import _habit_streaks, _today_status


def _id():
    return str(uuid.uuid4())[:8]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _loads(s, default=None):
    try:
        return json.loads(s or '{}')
    except Exception:
        return default if default is not None else {}


def _automation_row(row):
    if not row:
        return None
    d = dict(row)
    d['enabled'] = bool(d.get('enabled'))
    d['config'] = _loads(d.pop('config_json', '{}'))
    return d


def _project_row(row):
    if not row:
        return None
    d = dict(row)
    d['tags'] = d.get('tags', '')
    return d


def _action_row(row):
    if not row:
        return None
    d = dict(row)
    d['params'] = _loads(d.pop('params_json', '{}'))
    d['result'] = _loads(d.pop('result_json', '{}'))
    return d


def lifeos_summary():
    migrate_life()
    db = get_conn('life')
    try:
        auto_total = db.execute('SELECT COUNT(*) FROM automations').fetchone()[0]
        auto_enabled = db.execute('SELECT COUNT(*) FROM automations WHERE enabled=1').fetchone()[0]
        projects_active = db.execute("SELECT COUNT(*) FROM projects WHERE status!='done'").fetchone()[0]
        actions_recent = db.execute("SELECT COUNT(*) FROM agent_actions WHERE datetime(created_at) >= datetime('now','-7 days')").fetchone()[0]
        recent_runs = [dict(r) for r in db.execute('SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 5').fetchall()]
        return {
            'automations': {'total': auto_total, 'enabled': auto_enabled},
            'projects': {'active': projects_active},
            'agent_actions': {'recent_7d': actions_recent},
            'recent_runs': recent_runs,
        }
    finally:
        db.close()


def lifeos_command_center():
    """Return the compact Life OS command-center state for the Home tab.

    This intentionally combines existing domains into one decision surface rather
    than adding another heavy workflow system. The output is action-oriented:
    what to focus on, what looks stuck, what agents/automations need attention,
    and what the system recommends next.
    """
    migrate_all()
    now = datetime.now(timezone.utc)
    today = now.strftime('%Y-%m-%d')

    tasks = list_board_tasks({}) or []
    open_tasks = [t for t in tasks if t.get('status') not in ('done', 'completed') and not t.get('archived')]
    priority_rank = {'high': 0, 'medium': 1, 'low': 2}

    def task_score(task):
        due = task.get('due_date') or ''
        due_rank = 0 if due and due <= today else 1 if due else 2
        return (due_rank, priority_rank.get(task.get('priority', 'medium'), 1), task.get('created_at') or '')

    today_focus = sorted(open_tasks, key=task_score)[:5]

    life = get_conn('life')
    try:
        project_rows = life.execute("""
            SELECT * FROM projects
            WHERE status NOT IN ('done','completed','archived')
            ORDER BY
              CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              updated_at DESC,
              created_at DESC
            LIMIT 8
        """).fetchall()
        projects = [_project_row(r) for r in project_rows]

        project_task_counts = {}
        for task in open_tasks:
            pid = task.get('project_id') or ''
            if pid:
                project_task_counts[pid] = project_task_counts.get(pid, 0) + 1

        active_projects = []
        project_recommendations = []
        for p in projects:
            p['open_tasks'] = project_task_counts.get(p['id'], 0)
            stale = False
            try:
                updated = datetime.fromisoformat((p.get('updated_at') or '').replace('Z', '+00:00'))
                stale = (now - updated).days >= 7
            except Exception:
                stale = False
            p['stale'] = stale
            if stale:
                project_recommendations.append({
                    'type': 'project_intelligence',
                    'severity': 'medium',
                    'message': f"Project '{p['name']}' has no recent update. Review or replan it.",
                    'action': 'review_project',
                    'target_id': p['id'],
                })
            if p['open_tasks'] == 0:
                project_recommendations.append({
                    'type': 'project_intelligence',
                    'severity': 'low',
                    'message': f"Project '{p['name']}' has no open task. Add a next action or archive it.",
                    'action': 'add_next_task',
                    'target_id': p['id'],
                })
            active_projects.append(p)

        automations = [dict(r) for r in life.execute("""
            SELECT id, name, type, schedule, owner_agent, enabled, last_run_at, next_run_at, updated_at
            FROM automations
            WHERE enabled=1
            ORDER BY COALESCE(next_run_at, updated_at, created_at) ASC
            LIMIT 6
        """).fetchall()]
        for a in automations:
            a['enabled'] = bool(a.get('enabled'))

        actions = [_action_row(r) for r in life.execute("""
            SELECT * FROM agent_actions
            ORDER BY created_at DESC
            LIMIT 30
        """).fetchall()]

        agent_codes = ['orchestrator', 'scout', 'scribe', 'reach', 'dev']
        agent_briefing = {
            code: {'queued': 0, 'completed_7d': 0, 'recent_actions': [], 'status': 'idle'}
            for code in agent_codes
        }
        for action in actions:
            code = (action.get('agent_code') or 'dev').lower()
            agent_briefing.setdefault(code, {'queued': 0, 'completed_7d': 0, 'recent_actions': [], 'status': 'idle'})
            if action.get('status') in ('queued', 'running'):
                agent_briefing[code]['queued'] += 1
            if action.get('status') == 'completed':
                agent_briefing[code]['completed_7d'] += 1
            if len(agent_briefing[code]['recent_actions']) < 3:
                agent_briefing[code]['recent_actions'].append(action)
        for code, info in agent_briefing.items():
            if info['queued'] >= 3:
                info['status'] = 'overloaded'
            elif info['queued'] > 0:
                info['status'] = 'active'
            elif not info['recent_actions']:
                info['status'] = 'idle'
            else:
                info['status'] = 'available'

        recent_runs = [dict(r) for r in life.execute("""
            SELECT ar.*, a.name AS automation_name
            FROM automation_runs ar
            LEFT JOIN automations a ON a.id = ar.automation_id
            ORDER BY ar.started_at DESC
            LIMIT 10
        """).fetchall()]
    finally:
        life.close()

    try:
        habits = {
            'today': _today_status(),
            'streaks': _habit_streaks(),
        }
    except Exception as exc:
        habits = {'today': [], 'streaks': [], 'error': str(exc)}

    stats = board_stats()
    recommendations = []
    overdue = stats.get('overdue', 0) if isinstance(stats, dict) else 0
    if overdue:
        recommendations.append({
            'type': 'task_intelligence',
            'severity': 'high',
            'message': f'{overdue} task(s) are overdue. Replan or move them forward today.',
            'action': 'replan_overdue_tasks',
        })
    if len(open_tasks) > 8:
        recommendations.append({
            'type': 'focus_intelligence',
            'severity': 'medium',
            'message': 'Open-task load is high. Pick 3 today-focus items and defer the rest.',
            'action': 'trim_today_focus',
        })
    recommendations.extend(project_recommendations[:4])
    broken_runs = [r for r in recent_runs if r.get('status') == 'failed']
    if broken_runs:
        recommendations.append({
            'type': 'automation_intelligence',
            'severity': 'high',
            'message': f'{len(broken_runs)} recent automation run(s) failed. Inspect before adding new automations.',
            'action': 'inspect_failed_automations',
        })
    overloaded = [code for code, info in agent_briefing.items() if info['status'] == 'overloaded']
    if overloaded:
        recommendations.append({
            'type': 'agent_intelligence',
            'severity': 'medium',
            'message': 'Agent queue pressure detected: ' + ', '.join(overloaded),
            'action': 'rebalance_agent_queue',
        })
    if not recommendations:
        recommendations.append({
            'type': 'daily_system',
            'severity': 'low',
            'message': 'System is clear. Choose one high-leverage focus and execute.',
            'action': 'start_focus_block',
        })

    timeline = []
    for task in tasks[:5]:
        timeline.append({'type': 'task', 'label': task.get('title'), 'time': task.get('updated_at') or task.get('created_at'), 'status': task.get('status')})
    for run in recent_runs[:5]:
        timeline.append({'type': 'automation', 'label': run.get('automation_name') or run.get('automation_id'), 'time': run.get('started_at'), 'status': run.get('status')})
    for action in actions[:5]:
        timeline.append({'type': 'agent_action', 'label': action.get('action_type'), 'time': action.get('created_at'), 'status': action.get('status'), 'agent': action.get('agent_code')})
    timeline = sorted(timeline, key=lambda x: x.get('time') or '', reverse=True)[:12]

    return {
        'generated_at': now.isoformat(),
        'today_focus': today_focus,
        'active_projects': active_projects,
        'agent_briefing': agent_briefing,
        'upcoming_automations': automations,
        'habits': habits,
        'system_health': {
            'database': 'ok',
            'tasks': stats,
            'automations_enabled': len(automations),
            'recommendation_count': len(recommendations),
        },
        'activity_timeline': timeline,
        'recommendations': recommendations[:8],
    }


def list_automations():
    migrate_life()
    db = get_conn('life')
    try:
        rows = db.execute('SELECT * FROM automations ORDER BY enabled DESC, updated_at DESC, created_at DESC').fetchall()
        return [_automation_row(r) for r in rows]
    finally:
        db.close()


def get_automation(aid):
    migrate_life()
    db = get_conn('life')
    try:
        return _automation_row(db.execute('SELECT * FROM automations WHERE id=?', (aid,)).fetchone())
    finally:
        db.close()


def create_automation(data):
    migrate_life()
    aid = _id()
    now = _now()
    cfg = data.get('config', data.get('config_json', {}))
    if isinstance(cfg, str):
        cfg_json = cfg or '{}'
    else:
        cfg_json = json.dumps(cfg, ensure_ascii=False)
    atype = data.get('type') or 'manual'
    if atype == 'recurring task':
        atype = 'recurring_task'
    db = get_conn('life')
    try:
        db.execute("""
            INSERT INTO automations (id, name, type, schedule, frequency, config_json, enabled, owner_agent, next_run_at, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (
            aid,
            data.get('name') or 'Untitled automation',
            atype,
            data.get('schedule', ''),
            data.get('frequency', data.get('schedule', '')),
            cfg_json,
            1 if data.get('enabled', True) else 0,
            data.get('owner_agent') or data.get('owner') or 'dev',
            data.get('next_run_at'),
            now,
            now,
        ))
        db.commit()
        return get_automation(aid)
    finally:
        db.close()


def update_automation(aid, data):
    migrate_life()
    allowed = {'name', 'type', 'schedule', 'frequency', 'enabled', 'owner_agent', 'next_run_at'}
    sets, vals = [], []
    for key in allowed:
        if key in data:
            sets.append(f'{key}=?')
            vals.append(1 if key == 'enabled' and data[key] else 0 if key == 'enabled' else data[key])
    if 'config' in data or 'config_json' in data:
        cfg = data.get('config', data.get('config_json'))
        sets.append('config_json=?')
        vals.append(cfg if isinstance(cfg, str) else json.dumps(cfg, ensure_ascii=False))
    if not sets:
        return get_automation(aid)
    sets.append('updated_at=?')
    vals.append(_now())
    vals.append(aid)
    db = get_conn('life')
    try:
        cur = db.execute(f"UPDATE automations SET {', '.join(sets)} WHERE id=?", vals)
        db.commit()
        if cur.rowcount == 0:
            return {'error': 'not found'}
        return get_automation(aid)
    finally:
        db.close()


def delete_automation(aid):
    migrate_life()
    db = get_conn('life')
    try:
        cur = db.execute('DELETE FROM automations WHERE id=?', (aid,))
        db.commit()
        return cur.rowcount > 0
    finally:
        db.close()


def list_automation_runs(aid=None, limit=50):
    migrate_life()
    db = get_conn('life')
    try:
        if aid:
            rows = db.execute('SELECT * FROM automation_runs WHERE automation_id=? ORDER BY started_at DESC LIMIT ?', (aid, limit)).fetchall()
        else:
            rows = db.execute('SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT ?', (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


def run_automation(aid):
    migrate_life()
    auto = get_automation(aid)
    if not auto:
        return {'error': 'not found'}
    rid = _id()
    now = _now()
    output = f"Queued manual run for {auto['type']} automation: {auto['name']}"
    db = get_conn('life')
    try:
        db.execute("""
            INSERT INTO automation_runs (id, automation_id, started_at, finished_at, status, output, error)
            VALUES (?,?,?,?,?,?,?)
        """, (rid, aid, now, _now(), 'completed', output, ''))
        db.execute('UPDATE automations SET last_run_at=?, updated_at=? WHERE id=?', (_now(), _now(), aid))
        db.commit()
        return dict(db.execute('SELECT * FROM automation_runs WHERE id=?', (rid,)).fetchone())
    finally:
        db.close()


def list_projects():
    migrate_life()
    db = get_conn('life')
    try:
        return [_project_row(r) for r in db.execute('SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC').fetchall()]
    finally:
        db.close()


def get_project(pid):
    migrate_life()
    db = get_conn('life')
    try:
        return _project_row(db.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone())
    finally:
        db.close()


def create_project(data):
    migrate_life()
    pid = _id()
    now = _now()
    db = get_conn('life')
    try:
        db.execute("""
            INSERT INTO projects (id, name, description, status, agent, priority, due_date, tags, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (pid, data.get('name') or 'Untitled project', data.get('description', ''), data.get('status', 'active'), data.get('agent', ''), data.get('priority', 'medium'), data.get('due_date', ''), data.get('tags', ''), now, now))
        db.commit()
        return _project_row(db.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone())
    finally:
        db.close()


def update_project(pid, data):
    migrate_life()
    allowed = {'name', 'description', 'status', 'agent', 'priority', 'due_date', 'tags'}
    sets, vals = [], []
    for key in allowed:
        if key in data:
            sets.append(f'{key}=?')
            vals.append(data[key])
    if not sets:
        return {'error': 'no fields to update'}
    sets.append('updated_at=?')
    vals.extend([_now(), pid])
    db = get_conn('life')
    try:
        cur = db.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id=?", vals)
        db.commit()
        if cur.rowcount == 0:
            return {'error': 'not found'}
        return _project_row(db.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone())
    finally:
        db.close()


def delete_project(pid):
    migrate_life()
    db = get_conn('life')
    try:
        cur = db.execute('DELETE FROM projects WHERE id=?', (pid,))
        db.commit()
        return cur.rowcount > 0
    finally:
        db.close()


def list_agent_actions(agent=None, limit=50):
    migrate_life()
    db = get_conn('life')
    try:
        if agent:
            rows = db.execute('SELECT * FROM agent_actions WHERE agent_code=? ORDER BY created_at DESC LIMIT ?', (agent, limit)).fetchall()
        else:
            rows = db.execute('SELECT * FROM agent_actions ORDER BY created_at DESC LIMIT ?', (limit,)).fetchall()
        return [_action_row(r) for r in rows]
    finally:
        db.close()


def create_agent_action(data):
    migrate_life()
    rid = _id()
    params = data.get('params', data.get('params_json', {}))
    result = data.get('result', data.get('result_json', {}))
    db = get_conn('life')
    try:
        db.execute("""
            INSERT INTO agent_actions (id, agent_code, action_type, params_json, result_json, status, created_at, completed_at)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            rid,
            data.get('agent_code') or data.get('agent') or 'dev',
            data.get('action_type') or 'manual',
            params if isinstance(params, str) else json.dumps(params, ensure_ascii=False),
            result if isinstance(result, str) else json.dumps(result, ensure_ascii=False),
            data.get('status', 'queued'),
            _now(),
            data.get('completed_at'),
        ))
        db.commit()
        return _action_row(db.execute('SELECT * FROM agent_actions WHERE id=?', (rid,)).fetchone())
    finally:
        db.close()


def list_daily_reviews():
    migrate_life()
    db = get_conn('life')
    try:
        return [dict(r) for r in db.execute('SELECT * FROM daily_reviews ORDER BY date DESC LIMIT 90').fetchall()]
    finally:
        db.close()


def upsert_daily_review(data):
    migrate_life()
    rid = data.get('id') or _id()
    date = data.get('date') or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    now = _now()
    db = get_conn('life')
    try:
        db.execute("""
            INSERT INTO daily_reviews (id, date, mood, energy, focus_score, accomplishments, challenges, plan, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(date) DO UPDATE SET mood=excluded.mood, energy=excluded.energy, focus_score=excluded.focus_score,
              accomplishments=excluded.accomplishments, challenges=excluded.challenges, plan=excluded.plan, updated_at=excluded.updated_at
        """, (rid, date, data.get('mood'), data.get('energy'), data.get('focus_score'), data.get('accomplishments', ''), data.get('challenges', ''), data.get('plan', ''), now, now))
        db.commit()
        return dict(db.execute('SELECT * FROM daily_reviews WHERE date=?', (date,)).fetchone())
    finally:
        db.close()


def list_links(source_type=None, source_id=None):
    migrate_life()
    db = get_conn('life')
    try:
        if source_type and source_id:
            rows = db.execute('SELECT * FROM entity_links WHERE source_type=? AND source_id=? ORDER BY created_at DESC', (source_type, source_id)).fetchall()
        else:
            rows = db.execute('SELECT * FROM entity_links ORDER BY created_at DESC LIMIT 100').fetchall()
        return [dict(r) for r in rows]
    finally:
        db.close()


def create_link(data):
    migrate_life()
    lid = _id()
    db = get_conn('life')
    try:
        db.execute("""
            INSERT OR IGNORE INTO entity_links (id, source_type, source_id, target_type, target_id, relation, created_at)
            VALUES (?,?,?,?,?,?,?)
        """, (lid, data['source_type'], data['source_id'], data['target_type'], data['target_id'], data.get('relation', 'related'), _now()))
        db.commit()
        row = db.execute('SELECT * FROM entity_links WHERE source_type=? AND source_id=? AND target_type=? AND target_id=? AND relation=?', (data['source_type'], data['source_id'], data['target_type'], data['target_id'], data.get('relation', 'related'))).fetchone()
        return dict(row)
    finally:
        db.close()
