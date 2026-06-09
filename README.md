# Hermes LifeOS Dashboard

Personal dashboard for Lucas — modular, self-hosted, single-page app with finance tracking, task management, routines, agent monitoring, and system health.

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 server.py
```

Then open http://localhost:8700

## Structure

```
├── server.py          # Python HTTP server (entry point)
├── index.html         # SPA shell
├── css/styles.css     # All styles
├── js/                # Frontend JS modules
│   ├── app.js         # Router + init
│   ├── hub.js         # Overview tab
│   ├── finance.js     # Finance tab
│   ├── tasks.js       # Tasks tab
│   ├── schedule.js    # Schedule tab
│   ├── routine.js     # Routine tab
│   ├── agents.js      # Agents tab
│   ├── dreams.js      # Dreams tab
│   ├── content.js     # Content tab
│   └── ...
├── server/            # Python backend modules
│   ├── data.py        # Dashboard data snapshot
│   ├── finance.py     # Finance API
│   ├── cron.py        # Schedule/cron API
│   ├── kanban.py      # Tasks board API
│   ├── routine.py     # Habits/Routine API
│   ├── db.py          # Database migration
│   └── ...
├── db/                # SQLite databases (gitignored)
├── plans/             # Design docs
└── tests/             # Smoke tests
```

## VPS (production)

Systemd service runs on port 8700. See `start.sh`.
