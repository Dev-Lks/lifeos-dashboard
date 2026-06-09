"""Central SQLite helpers and idempotent migrations for Hermes Life OS."""
import sqlite3
from pathlib import Path
from typing import Iterable
from .config import BOARD_DB, LIFE_DB

DBS = {
    'board': BOARD_DB,
    'life': LIFE_DB,
}


def get_conn(name='life'):
    path = DBS[name]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path))
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA foreign_keys=ON')
    return db


def table_names(name='life'):
    db = get_conn(name)
    try:
        return [r['name'] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
    finally:
        db.close()


def column_names(db, table):
    return {r[1] for r in db.execute(f'PRAGMA table_info({table})').fetchall()}


def add_column_if_missing(db, table, column, definition):
    if column not in column_names(db, table):
        db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')


def migrate_all():
    migrate_board()
    migrate_life()


def migrate_board():
    db = get_conn('board')
    try:
        db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                priority TEXT DEFAULT 'medium',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
        """)
        for col, definition in [
            ('due_date', "TEXT DEFAULT ''"),
            ('assignee', "TEXT DEFAULT ''"),
            ('tags', "TEXT DEFAULT '[]'"),
            ('archived', 'INTEGER DEFAULT 0'),
            ('project_id', "TEXT DEFAULT ''"),
        ]:
            add_column_if_missing(db, 'tasks', col, definition)
        db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)')
        db.commit()
    finally:
        db.close()


def migrate_life():
    db = get_conn('life')
    try:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('income','expense')),
                category TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount >= 0),
                description TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS budgets (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                monthly_limit REAL NOT NULL CHECK(monthly_limit > 0),
                month TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(category, month)
            );
            CREATE TABLE IF NOT EXISTS habits (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT DEFAULT '',
                frequency TEXT NOT NULL DEFAULT 'daily' CHECK(frequency IN ('daily','weekly')),
                color TEXT DEFAULT '#8b5cf6',
                icon TEXT DEFAULT '✅',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS habit_logs (
                id TEXT PRIMARY KEY,
                habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(habit_id, date)
            );
            CREATE TABLE IF NOT EXISTS daily_logs (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL UNIQUE,
                mood INTEGER CHECK(mood BETWEEN 1 AND 5),
                focus TEXT DEFAULT '',
                summary TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
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
            CREATE TABLE IF NOT EXISTS automations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('reminder','recurring_task','cron_job','agent_task','webhook','manual')),
                schedule TEXT DEFAULT '',
                frequency TEXT DEFAULT '',
                config_json TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                owner_agent TEXT DEFAULT 'dev',
                last_run_at TEXT,
                next_run_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS automation_runs (
                id TEXT PRIMARY KEY,
                automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                finished_at TEXT,
                status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
                output TEXT DEFAULT '',
                error TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT DEFAULT 'active',
                agent TEXT DEFAULT '',
                priority TEXT DEFAULT 'medium',
                due_date TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS agent_actions (
                id TEXT PRIMARY KEY,
                agent_code TEXT NOT NULL,
                action_type TEXT NOT NULL,
                params_json TEXT NOT NULL DEFAULT '{}',
                result_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'queued',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS daily_reviews (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL UNIQUE,
                mood INTEGER,
                energy INTEGER,
                focus_score INTEGER,
                accomplishments TEXT DEFAULT '',
                challenges TEXT DEFAULT '',
                plan TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS entity_links (
                id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                relation TEXT DEFAULT 'related',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(source_type, source_id, target_type, target_id, relation)
            );
            CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
            CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
            CREATE INDEX IF NOT EXISTS idx_hl_date ON habit_logs(date);
            CREATE INDEX IF NOT EXISTS idx_hl_habit ON habit_logs(habit_id);
            CREATE INDEX IF NOT EXISTS idx_automations_enabled ON automations(enabled);
            CREATE INDEX IF NOT EXISTS idx_automation_runs_auto ON automation_runs(automation_id, started_at);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
            CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent_code, created_at);
            CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_type, source_id);
        """)
        # Migration: add tags to projects if missing
        add_column_if_missing(db, 'projects', 'tags', "TEXT DEFAULT ''")
        db.commit()
    finally:
        db.close()
