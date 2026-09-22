"""Check explicit runtime catalog packaging without Docker or network access."""
from pathlib import Path
import unittest


class RuntimePackagingTests(unittest.TestCase):
    def test_backend_shared_catalogs_are_in_image_and_context(self):
        root=Path(__file__).resolve().parents[2]
        docker=(root/"backend/Dockerfile").read_text()
        context=(root/"backend/Dockerfile.dockerignore").read_text().splitlines()
        for name in ["grcRules.json","aiGovernanceCatalog.json","frameworkDefinitions.json",
                     "cisIG1.json","evidenceSources.json","onboardingHandoffFields.json"]:
            path="frontend/src/lib/"+name
            self.assertTrue((root/path).is_file(),path)
            self.assertIn(path,docker,path)
            self.assertIn("!"+path,context,path)
        self.assertIn("COPY backend/routes ./routes",docker)
        self.assertIn("!backend/routes/*.json",context)
