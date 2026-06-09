#!/usr/bin/env python3
"""Self-cleaning smoke checks for Life OS backend modules."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.db import get_conn, migrate_all, table_names  # noqa: E402
from server.lifeos import (  # noqa: E402
    list_automations,
    create_automation,
    run_automation,
    list_projects,
    create_project,
    list_agent_actions,
    create_agent_action,
)


def cleanup():
    db = get_conn('life')
    try:
        ids = [r['id'] for r in db.execute("SELECT id FROM automations WHERE name='Smoke Reminder'").fetchall()]
        if ids:
            db.executemany('DELETE FROM automation_runs WHERE automation_id=?', [(i,) for i in ids])
        db.execute("DELETE FROM automations WHERE name='Smoke Reminder'")
        db.execute("DELETE FROM projects WHERE name='Smoke Project'")
        db.execute("DELETE FROM agent_actions WHERE action_type='smoke'")
        db.commit()
    finally:
        db.close()


def main():
    migrate_all()
    cleanup()
    tables = set(table_names('life'))
    required = {'automations', 'automation_runs', 'projects', 'agent_actions', 'daily_reviews', 'entity_links'}
    missing = required - tables
    assert not missing, f'missing tables: {sorted(missing)}'

    auto = create_automation({
        'name': 'Smoke Reminder',
        'type': 'reminder',
        'schedule': 'daily',
        'owner_agent': 'dev',
        'config': {'message': 'smoke'},
    })
    assert auto.get('id'), auto
    assert any(a['id'] == auto['id'] for a in list_automations())

    run = run_automation(auto['id'])
    assert run.get('status') == 'completed', run

    project = create_project({'name': 'Smoke Project', 'agent': 'dev', 'status': 'active'})
    assert project.get('id'), project
    assert any(p['id'] == project['id'] for p in list_projects())

    action = create_agent_action({'agent_code': 'dev', 'action_type': 'smoke', 'params': {'ok': True}})
    assert action.get('id'), action
    assert any(a['id'] == action['id'] for a in list_agent_actions())

    cleanup()
    print(json.dumps({'ok': True, 'cleaned': True, 'tables_checked': sorted(required)}))


if __name__ == '__main__':
    main()
