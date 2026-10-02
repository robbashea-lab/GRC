"""Classification fails closed before a new or mistyped suite can be omitted."""
import json
from pathlib import Path
import tempfile
import unittest

from suite_registry import classified_suites, environment_url


class SuiteRegistryTests(unittest.TestCase):
    def test_repository_has_no_unclassified_or_duplicate_tests(self):
        suites = classified_suites()
        self.assertIn(Path(__file__), suites["offline"])
        self.assertTrue(suites["environment"])
        self.assertFalse(suites["offline"] & suites["environment"])

    def test_unknown_file_is_not_silently_omitted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "suites.json").write_text(json.dumps({"offline": [], "environment": []}))
            (root / "test_new.py").write_text("raise RuntimeError('must not import')")
            with self.assertRaisesRegex(ValueError, "Unclassified tests: test_new.py"):
                classified_suites(root)

    def test_deleted_and_multiply_classified_files_are_errors(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = root / "suites.json"
            manifest.write_text(json.dumps({"offline": ["test_deleted.py"], "environment": []}))
            with self.assertRaisesRegex(ValueError, "Missing classified tests"):
                classified_suites(root)
            manifest.write_text(json.dumps({"offline": ["test_deleted.py"], "environment": ["test_deleted.py"]}))
            with self.assertRaisesRegex(ValueError, "more than once"):
                classified_suites(root)

    def test_environment_origin_is_explicit_and_cannot_contain_secrets(self):
        self.assertEqual(environment_url("http://127.0.0.1:4180/"), "http://127.0.0.1:4180")
        for value in (None, "", "example.test", "file:///tmp/test", "https://user:secret@example.test",
                      "https://example.test/api", "https://example.test?token=secret", "https://example.test#secret"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                environment_url(value)
