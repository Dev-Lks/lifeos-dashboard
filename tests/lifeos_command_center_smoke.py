#!/usr/bin/env python3
"""Self-cleaning smoke checks for Life OS Command Center intelligence."""
import json
import sys
from pathlib import Path

ROOT = Path('/root')
sys.path.insert(0, str(ROOT / 'hermes-dashboard'))

from server.db import get_conn, migrate_all  # noqa: E402
from server.kanban import create_board_task  # noqa: E402
from server.lifeos import (  # noqa: E402
    create_agent_action,
    create_automation,
    create_project,
    lifeos_command_center,
)

SMOKE_PREFIX = 'CC Smoke'


def cleanup():
    life = get_conn('life')
    try:
        auto_ids = [r['id'] for r in life.execute("SELECT id FROM automations WHERE name LIKE ?", (SMOKE_PREFIX + '%',)).fetchall()]
        if auto_ids:
            life.executemany('DELETE FROM automation_runs WHERE automation_id=?', [(i,) for i in auto_ids])
        life.execute("DELETE FROM automations WHERE name LIKE ?", (SMOKE_PREFIX + '%',))
        life.execute("DELETE FROM projects WHERE name LIKE ?", (SMOKE_PREFIX + '%',))
        life.execute("DELETE FROM agent_actions WHERE action_type LIKE ?", (SMOKE_PREFIX + '%',))
        life.commit()
    finally:
        life.close()

    board = get_conn('board')
    try:
        board.execute("DELETE FROM tasks WHERE title LIKE ?", (SMOKE_PREFIX + '%',))
        board.commit()
    finally:
        board.close()


def main():
    migrate_all()
    cleanup()

    project = create_project({
        'name': SMOKE_PREFIX + ' Project',
        'description': 'Project intentionally used by Command Center smoke test.',
        'status': 'active',
        'agent': 'dev',
        'priority': 'high',
    })
    task = create_board_task({
        'title': SMOKE_PREFIX + ' high priority task',
        'priority': 'high',
        'status': 'pending',
        'notes': 'Should appear in today focus.',
        'project_id': project['id'],
        'assignee': 'dev',
    })
    auto = create_automation({
        'name': SMOKE_PREFIX + ' reminder',
        'type': 'reminder',
        'schedule': 'daily 09:00',
        'owner_agent': 'orchestrator',
        'next_run_at': '2099-01-01T09:00:00+00:00',
        'config': {'message': 'review command center'},
    })
    action = create_agent_action({
        'agent_code': 'dev',
        'action_type': SMOKE_PREFIX + ' action',
        'status': 'queued',
        'params': {'task_id': task['id']},
    })

    cc = lifeos_command_center()
    required = {
        'today_focus',
        'active_projects',
        'agent_briefing',
        'upcoming_automations',
        'habits',
        'system_health',
        'activity_timeline',
        'recommendations',
    }
    missing = required - set(cc)
    assert not missing, f'missing command center keys: {sorted(missing)}'
    assert any(item.get('id') == task['id'] for item in cc['today_focus']), cc['today_focus']
    assert any(item.get('id') == project['id'] for item in cc['active_projects']), cc['active_projects']
    assert any(item.get('id') == auto['id'] for item in cc['upcoming_automations']), cc['upcoming_automations']
    assert 'dev' in cc['agent_briefing'], cc['agent_briefing']
    assert cc['agent_briefing']['dev']['queued'] >= 1, cc['agent_briefing']['dev']
    assert cc['system_health']['database'] == 'ok', cc['system_health']
    assert isinstance(cc['recommendations'], list) and cc['recommendations'], cc['recommendations']

    cleanup()
    print(json.dumps({'ok': True, 'command_center_keys': sorted(required), 'cleaned': True}))


if __name__ == '__main__':
    main()
