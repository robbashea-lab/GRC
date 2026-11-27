"""Discover every classified offline suite with the existing pytest/xdist settings."""
from pathlib import Path
import faulthandler
import json
import sys
import threading
import pytest


class WorkerLossObserver:
    def __init__(self):
        self.timers = []

    @pytest.hookimpl(optionalhook=True)
    def pytest_testnodedown(self, node, error):
        if error is None:
            return
        gateway = node.gateway
        # execnet 2.1.2 exposes its owned local subprocess via private _io.popen.
        process = getattr(getattr(gateway, '_io', None), 'popen', None) if getattr(getattr(gateway, 'spec', None), 'popen', False) else None

        def capture(phase, scheduling_error=None):
            data = {'phase': phase, 'worker': gateway.id, 'error_type': type(error).__name__}
            if scheduling_error is not None:
                data['deferred_capture'] = {'unavailable': scheduling_error}
            try:
                data.update(pid=process.pid, returncode=process.poll())
            except (AttributeError, OSError) as unavailable:
                data['worker_process'] = {'unavailable': type(unavailable).__name__ if process is not None else 'non-Popen gateway'}
            for label, path, prefixes in (
                ('controller_memory', '/proc/self/status', ('VmRSS:', 'VmHWM:')),
                ('cgroup_memory_events_root', '/sys/fs/cgroup/memory.events', ())):
                try:
                    values = [line for line in Path(path).read_text().splitlines() if not prefixes or line.startswith(prefixes)]
                    data[label] = values or {'unavailable': 'empty telemetry'}
                except OSError as unavailable:
                    data[label] = {'unavailable': type(unavailable).__name__}
            try:
                faulthandler.dump_traceback(file=sys.__stderr__, all_threads=True)
                data['controller_stack'] = 'dumped'
            except (AttributeError, OSError, RuntimeError, ValueError) as unavailable:
                data['controller_stack'] = {'unavailable': type(unavailable).__name__}
            try:
                print('[worker-loss-observer] ' + json.dumps(data), file=sys.stderr, flush=True)
            except (OSError, ValueError):
                pass  # Unavailable diagnostics must not replace pytest's exit result.

        capture('callback')
        try:
            timer = threading.Timer(5, capture, args=('deferred',))
            timer.daemon = True
            timer.start()
            self.timers.append(timer)
        except (RuntimeError, OSError) as unavailable:
            capture('deferred_unavailable', type(unavailable).__name__)

    def close(self):
        for timer in self.timers:
            timer.cancel()


if __name__ == "__main__":
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend.parent))
    sys.path.insert(0, str(backend))
    # conftest validates complete classification before importing any test module.
    observer = WorkerLossObserver()
    try:
        raise SystemExit(pytest.main(["-c", str(backend / "pytest.ini"), "-q", "-m", "offline",
                                    str(backend / "tests"), *sys.argv[1:]], plugins=[observer]))
    finally:
        observer.close()
