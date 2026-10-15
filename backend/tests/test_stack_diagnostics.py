import io
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stack_diagnostics import stack_watchdog


class StackDiagnosticsTests(unittest.TestCase):
    def test_disabled_watchdog_creates_no_timer(self):
        with patch('stack_diagnostics.threading.Timer') as timer:
            with stack_watchdog(0, 'disabled'):
                pass
            timer.assert_not_called()

    def test_no_early_or_late_dump_and_exception_cleanup(self):
        failure = RuntimeError('original test failure')
        with patch('stack_diagnostics.threading.Timer') as timer, patch('stack_diagnostics.faulthandler.dump_traceback') as dump:
            with self.assertRaises(RuntimeError) as caught:
                with stack_watchdog(60, 'suite::test_failure', io.StringIO()):
                    dump.assert_not_called()
                    self.assertTrue(timer.return_value.daemon)
                    timer.return_value.start.assert_called_once_with()
                    raise failure
            self.assertIs(caught.exception, failure)
            timer.return_value.cancel.assert_called_once_with()
            timer.return_value.join.assert_called_once_with(timeout=1)
            timer.call_args.args[1]()
            dump.assert_not_called()

    def test_real_python_timer_writes_label_and_all_thread_stacks_once(self):
        completed = threading.Event()
        import faulthandler
        actual_dump = faulthandler.dump_traceback

        def observe(**kwargs):
            try:
                actual_dump(**kwargs)
            finally:
                completed.set()

        with tempfile.TemporaryFile(mode='w+') as output:
            with patch('stack_diagnostics.faulthandler.dump_traceback', side_effect=observe) as dump:
                with stack_watchdog(0.05, 'suite::test_saved_record', output):
                    self.assertTrue(completed.wait(5), 'watchdog callback did not complete')
                dump.assert_called_once_with(file=output, all_threads=True)
            output.seek(0)
            text = output.read()
        self.assertIn('suite::test_saved_record: 0.05s diagnostic threshold', text)
        self.assertIn('test_real_python_timer_writes_label_and_all_thread_stacks_once', text)
        self.assertIn('Thread', text)

    def test_diagnostic_error_reports_type_and_preserves_test_exception(self):
        errors = io.StringIO()
        failure = AssertionError('native assertion')
        with patch('stack_diagnostics.threading.Timer') as timer, patch('stack_diagnostics.faulthandler.dump_traceback', side_effect=OSError('sensitive detail')), patch('stack_diagnostics.sys.__stderr__', errors):
            with self.assertRaises(AssertionError) as caught:
                with stack_watchdog(60, 'suite::test_io', io.StringIO()):
                    timer.call_args.args[1]()
                    raise failure
        self.assertIs(caught.exception, failure)
        self.assertIn('diagnostic unavailable (OSError)', errors.getvalue())
        self.assertNotIn('sensitive detail', errors.getvalue())


if __name__ == '__main__':
    unittest.main()
