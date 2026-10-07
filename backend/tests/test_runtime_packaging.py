"""Check explicit runtime catalog packaging without Docker or network access."""
from pathlib import Path
import ast
import os
import shutil
import subprocess
import sys
import tempfile
import unittest


class RuntimePackagingTests(unittest.TestCase):
    def test_render_password_policy_imports_from_packaged_files(self):
        root = Path(__file__).resolve().parents[2]
        docker = (root/'deploy/RenderStaging.Dockerfile').read_text()
        context = (root/'deploy/RenderStaging.Dockerfile.dockerignore').read_text().splitlines()
        with tempfile.TemporaryDirectory() as temporary:
            image = Path(temporary)
            shutil.copy2(root/'backend/password_policy.py', image/'password_policy.py')
            if ('COPY backend/common_passwords.txt ./' in docker
                    and '!backend/common_passwords.txt' in context):
                shutil.copy2(root/'backend/common_passwords.txt', image/'common_passwords.txt')
            result = subprocess.run([sys.executable, '-c',
                "import password_policy; assert 'password' in password_policy.BLOCKED"],
                cwd=image, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_backend_shared_catalogs_are_in_image_and_context(self):
        root=Path(__file__).resolve().parents[2]
        docker=(root/"backend/Dockerfile").read_text()
        context=(root/"backend/Dockerfile.dockerignore").read_text().splitlines()
        # Discover literal catalog references from application code. A hand-maintained
        # list can omit the same dependency as the Dockerfile and falsely pass.
        paths=set()
        sources=list((root/"backend").glob("*.py"))+list((root/"backend/routes").glob("*.py"))
        for source in sources:
            for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
                if isinstance(node,ast.Constant) and isinstance(node.value,str) and node.value.endswith(".json"):
                    for directory in ("","shared/catalogs","frontend/src/lib"):
                        candidate=root/directory/node.value
                        if candidate.is_file():
                            paths.add(candidate.relative_to(root).as_posix())
        self.assertIn("frontend/src/lib/managementRules.json",paths)
        self.assertIn("shared/catalogs/onboardingHandoffFields.json",paths)
        self.assertIn("shared/catalogs/operatorGuidance/socAssessmentGuidance.json",paths)
        for path in paths:
            self.assertTrue((root/path).is_file(),path)
            if path.startswith("shared/catalogs/"):
                self.assertIn("COPY shared/catalogs /app/shared/catalogs",docker)
                self.assertIn("!shared/catalogs/**",context)
            else:
                self.assertIn(path,docker,path)
                self.assertIn("!"+path,context,path)
        self.assertIn("COPY backend/routes ./routes",docker)

    def test_runtime_imports_from_packaged_catalogs_without_frontend_application_code(self):
        root=Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as temporary:
            image=Path(temporary)
            backend=image/"backend";backend.mkdir()
            for source in (root/"backend").glob("*.py"):
                shutil.copy2(source,backend/source.name)
            self.assertIn('COPY backend/common_passwords.txt ./', (root/'backend/Dockerfile').read_text())
            self.assertIn('!backend/common_passwords.txt', (root/'backend/Dockerfile.dockerignore').read_text())
            shutil.copy2(root/'backend/common_passwords.txt', backend/'common_passwords.txt')
            shutil.copytree(root/"backend/routes",backend/"routes",ignore=shutil.ignore_patterns("__pycache__"))
            shutil.copytree(root/"shared/catalogs",image/"shared/catalogs")
            # Keep the remaining domain JSON dependencies exactly as Docker packages
            # them; no React source tree is available to mask a missing shared file.
            for line in (root/"backend/Dockerfile").read_text().splitlines():
                parts=line.split()
                if len(parts)==3 and parts[0]=="COPY" and parts[1].startswith("frontend/"):
                    destination=image/parts[2].removeprefix("/app/")
                    destination.parent.mkdir(parents=True,exist_ok=True)
                    shutil.copy2(root/parts[1],destination)
            result=subprocess.run([sys.executable,"-c",
                "import server, framework_catalog, framework_governance, iso_audit; "
                "from routes.onboarding import BASELINE_CATALOG; "
                "assert BASELINE_CATALOG['policies']; "
                "assert framework_governance.SOC_GUIDANCE; "
                "assert len(framework_catalog.active_definitions('cis-ig1')) == 56; assert len(framework_catalog.CIS['requirements']) == 153"],
                cwd=backend,env={**os.environ,"PYTHONPATH":str(backend),"MONGO_URL":"mongodb://127.0.0.1:1","DB_NAME":"runtime_import_smoke"},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
