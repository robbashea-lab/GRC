"""Discover every classified offline suite with the existing pytest/xdist settings."""
from pathlib import Path
import sys
import pytest

if __name__ == "__main__":
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend.parent))
    sys.path.insert(0, str(backend))
    # conftest validates complete classification before importing any test module.
    raise SystemExit(pytest.main(["-c", str(backend / "pytest.ini"), "-q", "-m", "offline",
                                str(backend / "tests"), *sys.argv[1:]]))
