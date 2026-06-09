"""SSE module — manager and broadcaster for FastAPI."""

import asyncio
import json
import threading
import time


class SSEManager:
    """Tracks connected SSE clients and broadcasts snapshots."""

    def __init__(self):
        self._clients: list[asyncio.Queue] = []
        self._lock = threading.Lock()

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=64)
        with self._lock:
            self._clients.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        with self._lock:
            if q in self._clients:
                self._clients.remove(q)

    def broadcast(self, data: str):
        with self._lock:
            dead = []
            for q in self._clients:
                try:
                    q.put_nowait(data)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._clients.remove(q)


sse_manager = SSEManager()


def start_broadcaster():
    """Push snapshots to SSE clients every 2 seconds (runs in background thread)."""
    from .data import build_snapshot

    def _loop():
        while True:
            try:
                snap = build_snapshot()
                payload = f"data: {json.dumps(snap, default=str)}\n\n"
                sse_manager.broadcast(payload)
            except Exception:
                pass
            time.sleep(2)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
    return t
