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
    from .data import _vps_stats
    while True:
        try:
            snap = build_snapshot()
            vps = _vps_stats()
            snap["health"] = {
                "cpu_percent": vps.get("cpu_pct", 0),
                "memory": {
                    "percent_used": vps.get("mem_pct", 0),
                    "used_mb": vps.get("mem_used_mb", 0),
                    "total_mb": vps.get("mem_total_mb", 0),
                },
                "disk": {
                    "percent_used": vps.get("disk_pct", 0),
                    "used_gb": vps.get("disk_used_gb", 0),
                    "total_gb": vps.get("disk_total_gb", 0),
                },
            }
            payload = json.dumps(snap, default=str)
            sse_manager.broadcast(f"data: {payload}\n\n")
        except Exception:
            pass
        time.sleep(2)
