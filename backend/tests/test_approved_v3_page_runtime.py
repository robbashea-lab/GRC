"""Exercise the actual signed-in document with the frontend's DOM test runtime."""
from pathlib import Path
import shutil
import subprocess
import unittest

from approved_v3_page import native_document


FRONTEND = Path(__file__).resolve().parents[2] / 'frontend'


class ApprovedPageRuntimeTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node') and (FRONTEND / 'node_modules/jsdom').is_dir(),
                         'The approved page integration check requires the frontend test dependencies')
    def test_signed_in_document_storage_visibility_identity_and_save_lifecycle(self):
        document = native_document((FRONTEND / 'public/visual-preview.html').read_bytes())
        result = subprocess.run(
            [shutil.which('node'), 'scripts/qa/approved-v3-page-runtime.cjs'],
            cwd=FRONTEND, input=document, capture_output=True, timeout=60, check=False)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
