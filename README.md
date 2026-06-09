# LifeOS v4

Personal operating system dashboard — FastAPI backend + React frontend.

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your LIFEOS_PASSWORD and LIFEOS_SESSION_SECRET

# 2. Install dependencies
pip install -r requirements.txt
cd frontend && npm ci && cd ..

# 3. Build frontend
npm --prefix frontend run build

# 4. Start server
python -m server.main
# → http://127.0.0.1:8700
```

## Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your LIFEOS_PASSWORD and LIFEOS_SESSION_SECRET
docker compose up --build -d
```

## Validate

```bash
pytest -q                    # backend tests
npm --prefix frontend run lint    # frontend lint
npm --prefix frontend run build   # frontend build
curl http://127.0.0.1:8700/api/health  # health check
```

## Architecture

```
├── server/                # FastAPI backend
│   ├── main.py            # Entry point
│   ├── app.py             # App + routes + auth
│   ├── config.py          # Env var configuration
│   ├── data.py            # Dashboard snapshot + agents
│   ├── finance.py         # Finance API
│   ├── kanban.py          # Tasks (SQLite board)
│   ├── routine.py         # Habits, journals
│   ├── content.py         # Content manager
│   ├── cron.py            # Schedule / cron
│   ├── lifeos.py          # Command center + automations
│   ├── right_hand.py      # Atlas — right-hand copilot
│   ├── sse.py             # Server-sent events
│   └── db.py              # Idempotent migrations
├── frontend/              # Vite + React + TypeScript
│   ├── src/
│   │   ├── App.tsx        # Routes + auth gate
│   │   ├── main.tsx       # Entry point
│   │   ├── components/
│   │   │   └── Layout.tsx
│   │   ├── pages/         # /, /work, /finance, /routine, /automations, /systems
│   │   └── styles/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Security

- All `/api/` routes and `/events` require a valid session cookie (HttpOnly)
- Login via `/api/auth/login` with `LIFEOS_PASSWORD`
- Shell actions disabled by default (`LIFEOS_ENABLE_SHELL=0`)
- Data persisted to `LIFEOS_DATA_DIR` (default: `./data/`)

## Atlas (Right-Hand Copilot)

Atlas works without Hermes CLI installed — falls back to local-only mode. Ask questions, approve actions, manage sessions. All mutating actions are approval-gated.
