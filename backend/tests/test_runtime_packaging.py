"""Check explicit runtime catalog packaging without Docker or network access."""
from pathlib import Path
import ast
import unittest


class RuntimePackagingTests(unittest.TestCase):
    def test_backend_shared_catalogs_are_in_image_and_context(self):
        root=Path(__file__).resolve().parents[2]
        docker=(root/"backend/Dockerfile").read_text()
        context=(root/"backend/Dockerfile.dockerignore").read_text().splitlines()
        # Discover literal catalog references from application code. A hand-maintained
        # list can omit the same dependency as the Dockerfile and falsely pass.
        names=set()
        sources=list((root/"backend").glob("*.py"))+list((root/"backend/routes").glob("*.py"))
        for source in sources:
            for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
                if isinstance(node,ast.Constant) and isinstance(node.value,str) and node.value.endswith(".json"):
                    name=node.value.rsplit("/",1)[-1]
                    if (root/"frontend/src/lib"/name).is_file():
                        names.add(name)
        self.assertIn("managementRules.json",names)
        self.assertIn("onboardingHandoffFields.json",names)
        for name in names:
            path="frontend/src/lib/"+name
            self.assertTrue((root/path).is_file(),path)
            self.assertIn(path,docker,path)
            self.assertIn("!"+path,context,path)
        self.assertIn("COPY backend/routes ./routes",docker)
        self.assertIn("!backend/routes/*.json",context)
