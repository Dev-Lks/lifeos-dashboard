"""Content module — list, get, save markdown files."""
from datetime import datetime, timezone
from pathlib import Path
from .config import CONTENT_DIR


def _is_safe_path(user_path):
    resolved = (CONTENT_DIR / user_path).resolve()
    return resolved.is_relative_to(CONTENT_DIR.resolve()), resolved


def list_content():
    if not CONTENT_DIR.exists():
        return []
    docs = []
    for md_file in sorted(CONTENT_DIR.rglob("*.md")):
        rel = md_file.relative_to(CONTENT_DIR)
        agent = rel.parts[0] if len(rel.parts) > 1 else "_root"
        title = md_file.stem.replace("-", " ").replace("_", " ").title()
        try:
            first_line = md_file.read_text(encoding="utf-8").split("\n")[0]
            if first_line.startswith("# "):
                title = first_line[2:].strip()
        except Exception:
            pass
        st = md_file.stat()
        docs.append({
            "agent": agent,
            "filename": str(rel),
            "title": title,
            "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            "size": st.st_size,
        })
    return docs


def get_content(path_param):
    safe, resolved = _is_safe_path(path_param)
    if not safe or not resolved.exists() or not resolved.is_file():
        return None
    try:
        content = resolved.read_text(encoding="utf-8")
        st = resolved.stat()
        return {
            "path": path_param,
            "content": content,
            "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            "size": st.st_size,
        }
    except Exception:
        return None


def save_content(path_param, content_text):
    safe, resolved = _is_safe_path(path_param)
    if not safe:
        return None
    try:
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.write_text(content_text, encoding="utf-8")
        st = resolved.stat()
        return {
            "path": path_param,
            "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            "size": st.st_size,
        }
    except Exception:
        return None
