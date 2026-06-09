#!/usr/bin/env python3
"""Smoke checks for Atlas Right-Hand Agent context bundle."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.right_hand import right_hand_context, ask_right_hand  # noqa: E402


def main():
    ctx = right_hand_context()
    assert ctx['agent']['id'] == 'atlas', ctx.get('agent')
    assert ctx['agent']['owner'] == 'Lucas', ctx.get('agent')
    required = {'command_center', 'tasks', 'projects', 'automations', 'agent_actions', 'routine', 'finance'}
    missing = required - set(ctx)
    assert not missing, sorted(missing)
    assert 'stats' in ctx['tasks'], ctx['tasks']
    assert 'summary' in ctx['finance'], ctx['finance']

    hello = ask_right_hand('')
    assert hello['agent']['id'] == 'atlas', hello
    assert 'Atlas online' in hello['response'], hello
    print(json.dumps({'ok': True, 'agent': ctx['agent']['name'], 'context_keys': sorted(required)}))


if __name__ == '__main__':
    main()
