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
        self.assertLessEqual({'shared/catalogs/'+name for name in (
            'guidedControl1V5.json', 'guidedCisProgramV5.json', 'guidedSoc2V1.json', 'guidedSoc2.json', 'guidedIsoV2.json')},paths)
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
            for docker_path in ('backend/Dockerfile', 'deploy/RenderStaging.Dockerfile'):
                self.assertIn('COPY backend/fonts ./fonts', (root/docker_path).read_text())
                context=(root/(docker_path+'.dockerignore')).read_text().splitlines()
                self.assertIn('!backend/fonts', context)
                self.assertIn('!backend/fonts/**', context)
            shutil.copytree(root/'backend/fonts', backend/'fonts')
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
            script = """
import server, framework_catalog, framework_governance, iso_audit, framework_report_pdf, framework_reports
import guided_assessment, soc_guided_assessment, iso_guided_assessment
from pathlib import Path
from datetime import datetime, timezone
from routes.onboarding import BASELINE_CATALOG
for module in (server, framework_catalog, framework_governance, iso_audit, framework_report_pdf, framework_reports,
               guided_assessment, soc_guided_assessment, iso_guided_assessment):
    assert Path(module.__file__).resolve().parent == Path.cwd().resolve(), module.__name__
assert not list((Path.cwd().parent/'frontend').rglob('*.js'))
assert guided_assessment.current_version('1.1', upgraded=True) == 'cis-v8.1-control1-5'
assert guided_assessment.current_version('18.5', upgraded=True) == 'cis-v8.1-program-5'
assert 'brawndo-cis-pilot-1' in guided_assessment.VERSIONS
assert 'cis-v8.1-control1-4' in guided_assessment.VERSIONS
assert 'cis-v8.1-program-3' in guided_assessment.VERSIONS
assert soc_guided_assessment.CATALOG['version'] == 'soc2-omni-2'
assert 'soc2-omni-1' in soc_guided_assessment.VERSIONS
assert iso_guided_assessment.CATALOG['version'] == 'iso27001-omni-2'
assert 'iso27001-omni-1' in iso_guided_assessment.VERSIONS
assert BASELINE_CATALOG['policies']
assert framework_governance.SOC_GUIDANCE
assert len(framework_catalog.active_definitions('cis-ig1')) == 56
assert len(framework_catalog.CIS['requirements']) == 153
client = {'client_id': 'packaged', 'name': 'Packaged font test', 'framework_settings': {}}
rows = [{'framework_assessment_id': 'packaged:' + d['id'], 'client_id': 'packaged',
         'framework_key': 'cis-ig1', 'framework_version': framework_catalog.CIS['version'],
         'definition_id': d['id'], 'status': 'not_assessed'}
        for d in framework_catalog.active_definitions('cis-ig1')]
snapshot = framework_reports.build_snapshot(client, 'cis-ig1', rows, [], [],
    datetime.now(timezone.utc), '6m', ('packaged read start', 'packaged read end'), 'packaged read position')
assert framework_report_pdf.render_framework_report(snapshot, 'executive').startswith(b'%PDF')
"""
            # Keep configured third-party runtime dependencies, excluding this
            # checkout so application source cannot mask an incomplete package.
            dependencies=[path for path in os.environ.get('PYTHONPATH','').split(os.pathsep)
                          if path and not Path(path).resolve().is_relative_to(root)]
            result=subprocess.run([sys.executable,"-c", script],
                cwd=backend,env={**os.environ,"PYTHONPATH":os.pathsep.join([str(backend),*dependencies]),"MONGO_URL":"mongodb://127.0.0.1:1","DB_NAME":"runtime_import_smoke"},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
