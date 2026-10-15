import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import textwrap
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stack_diagnostics import stack_watchdog


class StackDiagnosticsTests(unittest.TestCase):
    def test_actual_xdist_capture_retains_watchdog_output_and_test_failure(self):
        source_tests = Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory() as temporary:
            backend = Path(temporary) / 'backend'
            tests = backend / 'tests'
            tests.mkdir(parents=True)
            for name in ['conftest.py', 'pytest.ini']:
                shutil.copy2(source_tests.parent / name, backend / name)
            for name in ['stack_diagnostics.py', 'suite_registry.py']:
                shutil.copy2(source_tests / name, tests / name)
            (tests / 'suites.json').write_text(json.dumps({'offline': ['test_probe.py'], 'environment': []}), encoding='utf-8')
            (tests / 'test_probe.py').write_text(textwrap.dedent('''\
                import faulthandler
                import threading
                completed = threading.Event()
                actual_dump = faulthandler.dump_traceback

                def observe_dump(**kwargs):
                    actual_dump(**kwargs)
                    completed.set()

                faulthandler.dump_traceback = observe_dump

                def test_blocked_stack_probe():
                    assert completed.wait(5), 'watchdog did not dump'

                def test_following_quick_probe():
                    assert True

                def test_intentional_failure_probe():
                    assert False, 'original probe assertion'
                '''), encoding='utf-8')
            result = subprocess.run([sys.executable, '-m', 'pytest', str(tests), '-c', str(backend / 'pytest.ini'),
                                     '--basetemp', str(Path(temporary) / 'pytest-temp'), '--python-stack-timeout=.25', '-vv'],
                                    capture_output=True, text=True, timeout=30)
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, 1, output)
        self.assertIn('2 passed', output)
        self.assertIn('1 failed', output)
        self.assertIn('original probe assertion', output)
        markers = [line for line in output.splitlines() if '[python-stack-watchdog]' in line and 'diagnostic threshold' in line]
        blocked = [line for line in markers if '::test_blocked_stack_probe:' in line]
        self.assertEqual(len(blocked), 1, output)
        self.assertRegex(blocked[0], r'gw\d+ .*test_probe.py::test_blocked_stack_probe: 0\.25s diagnostic threshold')
        self.assertFalse(any('::test_following_quick_probe:' in line for line in markers), output)
        # The fixture includes failure reporting, which can exceed the threshold;
        # that failure may have its own one-shot dump, never a late blocked dump.
        failed = [line for line in markers if '::test_intentional_failure_probe:' in line]
        self.assertLessEqual(len(failed), 1, output)
        self.assertEqual(len(markers), len(blocked) + len(failed), output)
        self.assertIn('in test_blocked_stack_probe', output)
        self.assertIn('Current thread', output)
        self.assertIn('Thread ', output)

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
        with patch('stack_diagnostics.threading.Timer') as timer, patch('stack_diagnostics.faulthandler.dump_traceback', side_effect=OSError('sensitive detail')):
            with self.assertRaises(AssertionError) as caught:
                with stack_watchdog(60, 'suite::test_io', errors):
                    timer.call_args.args[1]()
                    raise failure
        self.assertIs(caught.exception, failure)
        self.assertIn('diagnostic unavailable (OSError)', errors.getvalue())
        self.assertNotIn('sensitive detail', errors.getvalue())


if __name__ == '__main__':
    unittest.main()
