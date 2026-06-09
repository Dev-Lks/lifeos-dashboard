#!/usr/bin/env python3
"""Hermes Mission Control v3 — Modular Dashboard Server."""

import http.server
import json
import os
import sys
import threading
import queue
import socketserver
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(BASE_DIR))  # so we can import server.*

# Import modular components
from server.data import build_snapshot, _recent_activity
from server.kanban import (
    list_board_tasks, create_board_task, update_board_task, delete_board_task,
    get_board_task, archive_board_task, board_stats, init_board_db,
)
from server.content import list_content, get_content, save_content
from server.cron import cron_jobs
from server.finance import _list_transactions, _create_transaction, _delete_transaction, _month_summary, _upsert_budget, _update_transaction, _monthly_trends, _list_recurring, _create_recurring, _delete_recurring, _list_goals, _create_goal, _update_goal, _delete_goal, _month_comparison
from server.routine import _list_habits, _create_habit, _delete_habit, _log_habit, _today_status, _save_daily_log, _habit_streaks, _habit_history
from server.sse import sse_manager, broadcaster_thread
from server.db import migrate_all
from server.lifeos import (
    lifeos_summary, lifeos_command_center,
    list_automations, get_automation, create_automation, update_automation,
    delete_automation, run_automation, list_automation_runs,
    list_projects, create_project, update_project, delete_project, get_project,
    list_agent_actions, create_agent_action,
    list_daily_reviews, upsert_daily_review,
    list_links, create_link,
)
from server.right_hand import (
    right_hand_context, ask_right_hand, init_atlas_db,
    list_atlas_sessions, get_atlas_session, create_atlas_session, delete_atlas_session,
    list_atlas_approvals, execute_atlas_action, reject_atlas_action,
)


class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        path = self.path.split("?")[0]
        from urllib.parse import parse_qs, unquote
        from datetime import timezone as tz

        # SSE endpoint
        if path == "/events":
            self._handle_sse()
            return

        # JSON data snapshot (polling fallback)
        if path == "/api/data":
            self._handle_json(build_snapshot())
            return

        # Raw agent logs
        if path == "/api/data/agent_logs":
            self._handle_json(_recent_activity(50))
            return

        # Cron jobs (Schedule tab)
        if path == "/api/crons":
            self._handle_json(cron_jobs())
            return

        # Cron jobs summary
        if path == "/api/crons/summary":
            from server.cron import cron_summary
            self._handle_json(cron_summary())
            return

        # Health check
        if path == "/api/health":
            self._handle_json({"ok": True, "time": datetime.now(timezone.utc).isoformat()})
            return

        # Life OS summary + domain APIs
        if path == "/api/lifeos/summary":
            self._handle_json(lifeos_summary())
            return

        if path == "/api/lifeos/command-center":
            self._handle_json(lifeos_command_center())
            return

        if path == "/api/right-hand/context":
            self._handle_json(right_hand_context())
            return

        if path == "/api/right-hand/sessions":
            self._handle_json(list_atlas_sessions())
            return

        if path == "/api/right-hand/approvals":
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            self._handle_json(list_atlas_approvals(qs.get("status", [None])[0]))
            return

        parts = path.split("/")
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "right-hand" and parts[3] == "sessions":
            session = get_atlas_session(parts[4])
            self._handle_json(session if session else {"error": "not found"}, 200 if session else 404)
            return

        if path == "/api/automations":
            self._handle_json(list_automations())
            return

        if path == "/api/automation-runs":
            self._handle_json(list_automation_runs())
            return

        if path == "/api/projects":
            self._handle_json(list_projects())
            return

        if path == "/api/agent-actions":
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            self._handle_json(list_agent_actions(qs.get("agent", [None])[0]))
            return

        if path == "/api/daily-reviews":
            self._handle_json(list_daily_reviews())
            return

        if path == "/api/entity-links":
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            self._handle_json(list_links(qs.get("source_type", [None])[0], qs.get("source_id", [None])[0]))
            return

        parts = path.split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "projects":
            proj = get_project(parts[3])
            self._handle_json(proj if proj else {"error": "not found"}, 200 if proj else 404)
            return

        if len(parts) == 5 and parts[1] == "api" and parts[2] == "projects" and parts[4] == "tasks":
            all_tasks = list_board_tasks({"project_id": parts[3]})
            self._handle_json(all_tasks)
            return

        if len(parts) == 4 and parts[1] == "api" and parts[2] == "automations":
            automation = get_automation(parts[3])
            self._handle_json(automation if automation else {"error": "not found"}, 200 if automation else 404)
            return

        if len(parts) == 5 and parts[1] == "api" and parts[2] == "automations" and parts[4] == "runs":
            self._handle_json(list_automation_runs(parts[3]))
            return

        # Board API — list with filters
        if path == "/api/board":
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1]) if "?" in self.path else {}
            def _first(vals, default=""):
                return vals[0] if vals else default
            params = {
                "search": _first(qs.get("search")),
                "assignee": _first(qs.get("assignee")),
                "priority": _first(qs.get("priority")),
                "tag": _first(qs.get("tag")),
                "archived": _first(qs.get("archived")),
            }
            self._handle_json(list_board_tasks(params))
            return

        # Board stats
        if path == "/api/board/stats":
            self._handle_json(board_stats())
            return

        # Board single task
        parts = path.split("/")
        if len(parts) >= 4 and parts[1] == "api" and parts[2] == "board" and len(parts) == 4:
            task_id = parts[3]
            task = get_board_task(task_id)
            if task:
                self._handle_json(task)
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # Content API — list all docs
        if path == "/api/content":
            self._handle_json(list_content())
            return

        # Content API — get a single doc
        if path.startswith("/api/content/get"):
            from urllib.parse import parse_qs, unquote
            qs = self.path.split("?")[1] if "?" in self.path else ""
            params = parse_qs(qs)
            doc_paths = params.get("path", [])
            doc_path = unquote(doc_paths[0]) if doc_paths else ""
            if not doc_path:
                self._handle_json({"error": "missing ?path="}, 400)
                return
            doc = get_content(doc_path)
            if doc:
                self._handle_json(doc)
            else:
                self._handle_json({"error": "not found or access denied"}, 404)
            return

        # ── Finance API ──
        if path == "/api/finance/transactions":
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            month = qs.get("month", [None])[0]
            self._handle_json(_list_transactions(month))
            return

        if path.startswith("/api/finance/summary"):
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            month = qs.get("month", [None])[0]
            if not month:
                month = datetime.now(tz.utc).strftime("%Y-%m")
            self._handle_json(_month_summary(month))
            return

        if path == "/api/finance/budgets":
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            month = qs.get("month", [None])[0]
            if not month:
                month = datetime.now(tz.utc).strftime("%Y-%m")
            from server.finance import _life_conn
            try:
                db = _life_conn()
                cur = db.execute("SELECT * FROM budgets WHERE month = ?", (month,))
                rows = [dict(r) for r in cur.fetchall()]
                db.close()
                self._handle_json(rows)
            except Exception:
                self._handle_json([])
            return

        # ── Finance Trends ──
        if path == "/api/finance/trends":
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            months = int(qs.get("months", [12])[0])
            self._handle_json(_monthly_trends(months))
            return

        # ── Finance Recurring ──
        if path == "/api/finance/recurring":
            self._handle_json(_list_recurring())
            return

        # ── Finance Goals ──
        if path == "/api/finance/goals":
            self._handle_json(_list_goals())
            return

        # ── Finance Compare ──
        if path == "/api/finance/compare":
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            month = qs.get("month", [None])[0]
            if not month:
                month = datetime.now(tz.utc).strftime("%Y-%m")
            self._handle_json(_month_comparison(month))
            return

        # ── Finance Export CSV ──
        if path == "/api/finance/export":
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            month = qs.get("month", [None])[0]
            txs = _list_transactions(month)
            import csv, io
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["date","type","category","amount","description"])
            for t in txs:
                writer.writerow([t['date'], t['type'], t['category'], t['amount'], t.get('description','')])
            csv_data = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Disposition", f'attachment; filename="financas-{month or "all"}.csv"')
            self.send_header("Content-Length", str(len(csv_data)))
            self.end_headers()
            self.wfile.write(csv_data.encode())
            return

        # ── Routine API ──
        if path == "/api/routine/habits":
            self._handle_json(_list_habits())
            return

        if path == "/api/routine/today":
            self._handle_json(_today_status())
            return

        if path == "/api/routine/streaks":
            self._handle_json(_habit_streaks())
            return

        if path.startswith("/api/routine/history"):
            from urllib.parse import parse_qs
            qs = parse_qs(self.path.split("?")[1] if "?" in self.path else "")
            days = int(qs.get("days", [7])[0])
            self._handle_json(_habit_history(days))
            return

        # Serve static files from repo root
        if path.startswith("/hermes-dashboard/"):
            local_path = BASE_DIR / path[len("/hermes-dashboard/"):]
            if local_path.exists() and local_path.is_file():
                self._serve_file(local_path)
                return

        # SPA fallback — serve index.html for tab routes
        if not path.startswith("/api/") and not path.startswith("/hermes-dashboard/"):
            ext = os.path.splitext(path)[1]
            if not ext:
                self._serve_file(BASE_DIR / "index.html")
                return

        # Static files
        super().do_GET()

    def _handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        q = sse_manager.register()
        try:
            snap = build_snapshot()
            self.wfile.write(f"data: {json.dumps(snap, default=str)}\n\n".encode())
            self.wfile.flush()

            while True:
                try:
                    data = q.get(timeout=30)
                    self.wfile.write(data.encode())
                    self.wfile.flush()
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            sse_manager.unregister(q)

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}

        if path == "/api/board":
            task = create_board_task(body)
            if task:
                self._handle_json(task, 201)
            else:
                self._handle_json({"error": "create failed"}, 500)
            return

        if path == "/api/content/save":
            doc_path = body.get("path", "")
            content_text = body.get("content", "")
            if not doc_path:
                self._handle_json({"error": "missing path"}, 400)
                return
            result = save_content(doc_path, content_text)
            if result:
                self._handle_json(result)
            else:
                self._handle_json({"error": "save failed or access denied"}, 500)
            return

        # Atlas — Right-Hand Agent with Life OS context, history, and approval queue
        if path == "/api/right-hand/sessions":
            result = create_atlas_session(body.get("title"))
            self._handle_json(result, 201 if result else 500)
            return

        if path == "/api/right-hand/ask":
            msg = body.get("message", "")
            result = ask_right_hand(msg, body.get("session_id"))
            self._handle_json(result, 200 if result else 500)
            return

        parts = path.split("/")
        if len(parts) == 6 and parts[1] == "api" and parts[2] == "right-hand" and parts[3] == "approvals" and parts[5] == "execute":
            result = execute_atlas_action(parts[4])
            self._handle_json(result, 200 if "error" not in result else 400)
            return

        if len(parts) == 6 and parts[1] == "api" and parts[2] == "right-hand" and parts[3] == "approvals" and parts[5] == "reject":
            result = reject_atlas_action(parts[4])
            self._handle_json(result, 200 if result.get("ok") else 400)
            return

        # Chat — proxy to Hermes CLI
        if path == "/api/chat":
            msg = body.get("message", "")
            if not msg:
                self._handle_json({"error": "missing message"}, 400)
                return
            import subprocess
            try:
                result = subprocess.run(
                    ["hermes", "chat", "-q", msg, "-Q"],
                    capture_output=True, text=True, timeout=120
                )
                reply = result.stdout.strip()
                for head in ["Query:", "Initializing agent...", "────────────────────────────────────────"]:
                    if reply.startswith(head):
                        reply = reply.replace(head, "", 1).strip()
                lines = [l.strip() for l in reply.split("\n") if l.strip() and "╭" not in l and "╰" not in l and "│" not in l]
                clean = "\n".join(lines[-5:]).strip()
                self._handle_json({
                    "response": clean or reply,
                    "exit_code": result.returncode
                })
            except subprocess.TimeoutExpired:
                self._handle_json({"response": "Timed out waiting for Hermes.", "exit_code": -1})
            except Exception as e:
                self._handle_json({"response": f"Error: {str(e)}", "exit_code": -1})
            return

        # Life OS POST APIs
        if path == "/api/automations":
            result = create_automation(body)
            self._handle_json(result, 201 if result and "error" not in result else 400)
            return

        if path == "/api/projects":
            result = create_project(body)
            self._handle_json(result, 201 if result and "error" not in result else 400)
            return

        if path == "/api/agent-actions":
            result = create_agent_action(body)
            self._handle_json(result, 201 if result and "error" not in result else 400)
            return

        if path == "/api/daily-reviews":
            result = upsert_daily_review(body)
            self._handle_json(result, 201 if result and "error" not in result else 400)
            return

        if path == "/api/entity-links":
            result = create_link(body)
            self._handle_json(result, 201 if result and "error" not in result else 400)
            return

        parts = path.split("/")
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "automations" and parts[4] == "run":
            result = run_automation(parts[3])
            self._handle_json(result, 404 if result.get("error") else 200)
            return

        # ── Finance POST ──
        if path == "/api/finance/transactions":
            result = _create_transaction(body)
            code = 201 if "id" in result else 500
            self._handle_json(result, code)
            return

        if path == "/api/finance/budgets":
            _upsert_budget(body)
            self._handle_json({"ok": True})
            return

        # ── Finance Recurring POST ──
        if path == "/api/finance/recurring":
            result = _create_recurring(body)
            code = 201 if "id" in result else 500
            self._handle_json(result, code)
            return

        # ── Finance Goals POST ──
        if path == "/api/finance/goals":
            result = _create_goal(body)
            code = 201 if "id" in result else 500
            self._handle_json(result, code)
            return

        # ── Routine POST ──
        if path == "/api/routine/habits":
            result = _create_habit(body)
            code = 201 if "id" in result else 500
            self._handle_json(result, code)
            return

        if path.startswith("/api/routine/habits/") and path.endswith("/log"):
            parts = path.split("/")
            if len(parts) == 6:
                hid = parts[4]
                result = _log_habit(hid, body.get("date"), body.get("completed", True))
                self._handle_json(result)
                return

        if path == "/api/routine/daily-log":
            result = _save_daily_log(body)
            self._handle_json(result)
            return

        self.send_error(404)

    def do_PATCH(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length > 0 else {}

        parts = path.split("/")
        # Life OS PATCH APIs
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "automations":
            result = update_automation(parts[3], body)
            self._handle_json(result, 200 if "error" not in result else 404)
            return

        if len(parts) == 4 and parts[1] == "api" and parts[2] == "projects":
            result = update_project(parts[3], body)
            self._handle_json(result, 200 if "error" not in result else 404)
            return

        # Board PATCH — update fields
        if len(parts) >= 4 and parts[1] == "api" and parts[2] == "board" and len(parts) == 4:
            task_id = parts[3]
            task = update_board_task(task_id, body)
            if task:
                self._handle_json(task)
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # Board PATCH — archive
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "board" and parts[4] == "archive":
            task_id = parts[3]
            task = archive_board_task(task_id)
            if task:
                self._handle_json(task)
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # ── Finance PATCH: edit transaction ──
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "finance" and parts[3] == "transactions":
            tid = parts[4]
            result = _update_transaction(tid, body)
            if "error" not in result:
                self._handle_json(result)
            else:
                self._handle_json(result, 404)
            return

        # ── Finance PATCH: update goal ──
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "finance" and parts[3] == "goals":
            gid = parts[4]
            result = _update_goal(gid, body)
            if "error" not in result:
                self._handle_json(result)
            else:
                self._handle_json(result, 404)
            return

        self.send_error(404)

    def do_DELETE(self):
        path = self.path.split("?")[0]
        parts = path.split("/")
        # Life OS DELETE APIs
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "right-hand" and parts[3] == "sessions":
            if delete_atlas_session(parts[4]):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        if len(parts) == 4 and parts[1] == "api" and parts[2] == "automations":
            if delete_automation(parts[3]):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        if len(parts) == 4 and parts[1] == "api" and parts[2] == "projects":
            if delete_project(parts[3]):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        if len(parts) >= 4 and parts[1] == "api" and parts[2] == "board":
            task_id = parts[3]
            if delete_board_task(task_id):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # ── Finance DELETE ──
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "finance" and parts[3] == "transactions":
            tid = parts[4]
            if _delete_transaction(tid):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # ── Finance DELETE recurring ──
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "finance" and parts[3] == "recurring":
            rid = parts[4]
            if _delete_recurring(rid):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # ── Finance DELETE goal ──
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "finance" and parts[3] == "goals":
            gid = parts[4]
            if _delete_goal(gid):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        # ── Routine DELETE ──
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "routine" and parts[3] == "habits":
            hid = parts[4]
            if _delete_habit(hid):
                self._handle_json({"ok": True})
            else:
                self._handle_json({"error": "not found"}, 404)
            return

        self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _handle_json(self, data, code=200):
        body = json.dumps(data, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, filepath):
        ext = filepath.suffix.lower()
        CONTENT_TYPES = {
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.html': 'text/html',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        }
        ctype = CONTENT_TYPES.get(ext, 'application/octet-stream')
        try:
            data = filepath.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_error(404)

    def log_message(self, format, *args):
        pass  # suppress default logging


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Handle requests in separate threads so SSE doesn't block."""
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8700

    # Init database (create/migrate)
    migrate_all()
    init_board_db()
    init_atlas_db()

    # Start broadcaster thread
    t = threading.Thread(target=broadcaster_thread, daemon=True)
    t.start()

    server = ThreadedHTTPServer(("0.0.0.0", port), Handler)
    print(f"Mission Control server running on port {port}")
    print(f"  SSE:      http://127.0.0.1:{port}/events")
    print(f"  Data:     http://127.0.0.1:{port}/api/data")
    print(f"  Dashboard: http://127.0.0.1:{port}/")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    from server.main import main as fastapi_main

    fastapi_main()
