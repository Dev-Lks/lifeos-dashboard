# ATLAS Hermes LifeOS

Personal operating dashboard for daily work: Atlas command center, tasks/projects, finance, routine, automations, schedule and knowledge.

## Local Dev

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install --prefix frontend
```

Run backend and frontend in two terminals:

```bash
LIFEOS_PASSWORD=lifeos LIFEOS_SESSION_SECRET=dev-secret python -m server.main
npm --prefix frontend run dev
```

Open http://localhost:5173. The default local password is `lifeos` if `LIFEOS_PASSWORD` is not set.

## Production / VPS

```bash
cp .env.example .env
# edit LIFEOS_PASSWORD and LIFEOS_SESSION_SECRET
docker compose up --build -d
```

Open http://SERVER_IP:8700. Persistent SQLite data is mounted at `./data:/data`.

## Important Env Vars

- `LIFEOS_PASSWORD`: password for the web app.
- `LIFEOS_SESSION_SECRET`: long random signing secret for the HttpOnly session cookie.
- `LIFEOS_DATA_DIR`: SQLite data directory. Local default is `./db`; Docker uses `/data`.
- `LIFEOS_ENABLE_SHELL`: keep `0` unless you explicitly want Atlas approval actions to run shell commands.
- `LIFEOS_ALLOWED_ORIGINS`: comma-separated dev origins for CORS. Production is same-origin.

## Commands

```bash
npm run lint
npm run test
npm run build
pytest
python -m server.main
```

## Structure

```text
server/                 FastAPI app, routers, domain modules, SQLite migrations
frontend/               Vite React TypeScript PWA
db/                     local SQLite data, gitignored
data/                   Docker bind-mounted data, gitignored
tests/                  portable backend and smoke tests
Dockerfile              multi-stage frontend/backend image
docker-compose.yml      VPS-ready service with healthcheck and volume
```
