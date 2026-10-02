"""Default discovery is offline; environment tests require an explicit target."""
import os
from pathlib import Path
import sys

import pytest

BACKEND = Path(__file__).parent
TESTS = BACKEND / "tests"
sys.path.insert(0, str(BACKEND.parent))
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(TESTS))
from suite_registry import classified_suites, environment_url  # noqa: E402


def pytest_addoption(parser):
    group = parser.getgroup("GRC test environment")
    group.addoption("--run-environment-tests", action="store_true", default=False,
                    help="Allow tests that mutate the explicitly selected test server")
    group.addoption("--environment-url", default=None,
                    help="Explicit HTTP(S) origin of the isolated test server")


def pytest_configure(config):
    try:
        outside = [path.relative_to(BACKEND).as_posix() for path in BACKEND.rglob("*.py")
                   if (path.name.startswith("test_") or path.name.endswith("_test.py"))
                   and not path.is_relative_to(TESTS)]
        if outside:
            raise ValueError("Backend tests must live under backend/tests and be classified: " + ", ".join(sorted(outside)))
        config.grc_suites = classified_suites(TESTS)
        if config.getoption("--run-environment-tests"):
            config.grc_original_backend_url = os.environ.get("REACT_APP_BACKEND_URL")
            os.environ["REACT_APP_BACKEND_URL"] = environment_url(config.getoption("--environment-url"))
        elif config.getoption("--environment-url"):
            raise ValueError("--environment-url requires --run-environment-tests")
        else:
            selected = {Path(str(arg).split("::", 1)[0]).resolve() for arg in config.args}
            if selected & config.grc_suites["environment"]:
                raise ValueError("Environment tests require --run-environment-tests and --environment-url; the default run is offline")
    except (ValueError, OSError) as error:
        raise pytest.UsageError(str(error)) from error
    config.addinivalue_line("markers", "offline: isolated in-process test without an external target")
    config.addinivalue_line("markers", "environment: may mutate the explicitly selected test server")


def pytest_unconfigure(config):
    if hasattr(config, "grc_original_backend_url"):
        previous = config.grc_original_backend_url
        if previous is None:
            os.environ.pop("REACT_APP_BACKEND_URL", None)
        else:
            os.environ["REACT_APP_BACKEND_URL"] = previous


def pytest_ignore_collect(collection_path, config):
    return (Path(collection_path) in config.grc_suites["environment"]
            and not config.getoption("--run-environment-tests"))


def pytest_collection_modifyitems(config, items):
    for item in items:
        category = "environment" if Path(item.path) in config.grc_suites["environment"] else "offline"
        item.add_marker(getattr(pytest.mark, category))
