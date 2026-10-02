"""Explicit execution boundaries for every collected backend test module."""
import json
from pathlib import Path
from urllib.parse import urlsplit


def classified_suites(root=None):
    root = Path(root) if root is not None else Path(__file__).parent
    suites = json.loads((root / "suites.json").read_text(encoding="utf-8"))
    if set(suites) != {"offline", "environment"}:
        raise ValueError("Test registry must contain offline and environment categories")
    listed = [name for names in suites.values() for name in names]
    if len(listed) != len(set(listed)):
        raise ValueError("A test module is classified more than once")
    discovered = {path.relative_to(root).as_posix() for path in root.rglob("*.py")
                  if path.name.startswith("test_") or path.name.endswith("_test.py")}
    missing, stale = discovered - set(listed), set(listed) - discovered
    if missing or stale:
        details = []
        if missing:
            details.append("Unclassified tests: " + ", ".join(sorted(missing)))
        if stale:
            details.append("Missing classified tests: " + ", ".join(sorted(stale)))
        raise ValueError("; ".join(details) + ". Update backend/tests/suites.json after reviewing execution effects.")
    return {category: {root / name for name in names} for category, names in suites.items()}


def environment_url(value):
    parsed = urlsplit(value or "")
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in {"", "/"}):
        raise ValueError("--environment-url must explicitly name an HTTP(S) test server origin without credentials, path, query, or fragment")
    return value.rstrip("/")
