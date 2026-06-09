import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["LIFEOS_PASSWORD"] = "test-password"
os.environ["LIFEOS_SESSION_SECRET"] = "test-secret-with-enough-entropy"
os.environ["LIFEOS_ENABLE_SHELL"] = "0"
os.environ["LIFEOS_DATA_DIR"] = tempfile.mkdtemp(prefix="lifeos-test-")

from fastapi.testclient import TestClient  # noqa: E402

from server.app import app  # noqa: E402


def login(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"password": "test-password"})
    assert response.status_code == 200, response.text


def test_auth_and_health():
    with TestClient(app) as client:
      health = client.get("/api/health")
      assert health.status_code == 200
      assert health.json()["ok"] is True

      blocked = client.get("/api/data")
      assert blocked.status_code == 401
      blocked_events = client.get("/events")
      assert blocked_events.status_code == 401

      login(client)
      session = client.get("/api/auth/session")
      assert session.json()["authenticated"] is True


def test_tasks_finance_and_atlas_fallback(monkeypatch):
    monkeypatch.setenv("PATH", "")
    with TestClient(app) as client:
        login(client)

        task = client.post("/api/board", json={"title": "Pytest portable task", "priority": "high"})
        assert task.status_code == 200
        task_body = task.json()
        assert task_body["id"]

        updated = client.patch(f"/api/board/{task_body['id']}", json={"status": "completed"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "completed"

        tx = client.post("/api/finance/transactions", json={
            "date": "2026-06-01",
            "type": "expense",
            "category": "tests",
            "amount": 12.5,
            "description": "pytest smoke",
        })
        assert tx.status_code == 200
        summary = client.get("/api/finance/summary?month=2026-06")
        assert summary.status_code == 200
        assert summary.json()["expense"] >= 12.5

        atlas = client.post("/api/right-hand/ask", json={"message": "/task add Test fallback action"})
        assert atlas.status_code == 200
        body = atlas.json()
        assert body["fallback"] == "missing_hermes_cli"
        assert body["actions"]
