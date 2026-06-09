"""SSE module — manager and broadcaster thread."""
import json
import queue
import threading
import time


class SSEManager:
    """Tracks connected SSE clients and broadcasts snapshots."""

    def __init__(self):
        self._clients: list[queue.Queue] = []
        self._lock = threading.Lock()

    def register(self) -> queue.Queue:
        q = queue.Queue(maxsize=64)
        with self._lock:
            self._clients.append(q)
        return q

    def unregister(self, q: queue.Queue):
        with self._lock:
            if q in self._clients:
                self._clients.remove(q)

    def broadcast(self, data: str):
        with self._lock:
            dead = []
            for q in self._clients:
                try:
                    q.put_nowait(data)
                except queue.Full:
                    dead.append(q)
            for q in dead:
                self._clients.remove(q)


sse_manager = SSEManager()


def broadcaster_thread():
    """Push snapshots to SSE clients every 2 seconds."""
    from .data import build_snapshot
    while True:
        try:
            snap = build_snapshot()
            payload = json.dumps(snap, default=str)
            sse_manager.broadcast(f"data: {payload}\n\n")
        except Exception:
            pass
        time.sleep(2)
