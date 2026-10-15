"""Best-effort test diagnostics; the CI job budget enforces the hard time limit."""
from contextlib import contextmanager
import faulthandler
import sys
import threading


@contextmanager
def stack_watchdog(seconds, label, stream=None):
    if not seconds:
        yield
        return
    destination = sys.__stderr__ if stream is None else stream
    active = threading.Event()
    active.set()

    def dump():
        if not active.is_set():
            return
        try:
            print(f"[python-stack-watchdog] {label}: {seconds}s diagnostic threshold", file=destination, flush=True)
            # Python callbacks hold the GIL on CI's CPython 3.12. A native hang
            # holding the GIL may prevent this callback from producing a dump.
            faulthandler.dump_traceback(file=destination, all_threads=True)
        except (OSError, ValueError, RuntimeError) as error:
            try:
                print(f"[python-stack-watchdog] {label}: diagnostic unavailable ({type(error).__name__})", file=sys.__stderr__, flush=True)
            except (OSError, ValueError):
                pass  # No usable diagnostic stream; preserve the test outcome.

    timer = threading.Timer(seconds, dump)
    timer.daemon = True
    timer.start()
    try:
        yield
    finally:
        active.clear()
        timer.cancel()
        timer.join(timeout=1)
