# Manual Test Checklist — Hermes Mission Control Life OS

## Server health

- [ ] `GET /api/health` returns HTTP 200 and `{ ok: true }`.
- [ ] `GET /` loads dashboard HTML.
- [ ] `GET /automations` loads dashboard HTML through SPA fallback.
- [ ] `GET /events` opens SSE stream.

## Existing tabs regression

- [ ] Home renders Agent Pulse, Quick Actions, System Health, Activity Chart, Recent Activity.
- [ ] Agents tab renders all 5 agents.
- [ ] Tasks tab fetches existing tasks and can open create form.
- [ ] Schedule tab renders cron jobs and summary stats.
- [ ] Content tab lists docs and preview works.
- [ ] Dreams tab renders existing empty/state content.
- [ ] Finance tab renders summary, transactions, recurring, goals.
- [ ] Routine tab renders habits, daily log, streaks, history.

## Automations tab

- [ ] Click `Automations` nav button.
- [ ] Empty state appears when no automations exist.
- [ ] `+ New Automation` opens form.
- [ ] Create reminder automation with name, schedule, owner, message.
- [ ] New automation card appears.
- [ ] `Run Now` creates a recent run and updates last run.
- [ ] Disable/Enable toggles status badge.
- [ ] Delete removes card.

## Command palette

- [ ] `Ctrl+K` / `Cmd+K` opens palette.
- [ ] Searching `automation` shows Automations and New Automation.
- [ ] Enter on Automations switches tab.
- [ ] `?` key shows shortcut help toast.

## API checks

- [ ] `GET /api/lifeos/summary`
- [ ] `GET /api/automations`
- [ ] `POST /api/automations`
- [ ] `PATCH /api/automations/{id}`
- [ ] `POST /api/automations/{id}/run`
- [ ] `GET /api/automations/{id}/runs`
- [ ] `DELETE /api/automations/{id}`
- [ ] `GET /api/projects`
- [ ] `POST /api/projects`
- [ ] `GET /api/agent-actions`
- [ ] `POST /api/agent-actions`
- [ ] `GET /api/daily-reviews`
- [ ] `POST /api/daily-reviews`
- [ ] `GET /api/entity-links`
- [ ] `POST /api/entity-links`

## Browser console

- [ ] No JavaScript module import errors.
- [ ] No unhandled promise rejections when opening Automations.
- [ ] No 404 for `/hermes-dashboard/js/automations.js`, `/components.js`, or `/command-palette.js`.
