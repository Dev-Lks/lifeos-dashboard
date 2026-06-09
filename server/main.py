"""LifeOS entry point — start the FastAPI server.

Usage:
    python -m server.main
    PORT=8700 python -m server.main
"""

import uvicorn
from server.config import PORT


def main():
    print(f"╔══════════════════════════════════════╗")
    print(f"║   LifeOS v4.0 — FastAPI + React     ║")
    print(f"║   http://127.0.0.1:{PORT}             ║")
    print(f"╚══════════════════════════════════════╝")
    uvicorn.run(
        "server.app:app",
        host="0.0.0.0",
        port=PORT,
        reload=True,
        reload_dirs=["server"],
        log_level="info",
    )


if __name__ == "__main__":
    main()
