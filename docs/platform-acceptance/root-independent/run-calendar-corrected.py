import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(r'C:\Users\RobbA\Documents\Codex\2026-10-11\platform-acceptance\integration')
OUT = Path(__file__).parent / 'calendar-corrected'
CASES = [
    'test_platform_ten_year_lifecycle.PlatformTenYearTests.test_calendar_date_only_boundaries',
    'test_platform_ten_year_lifecycle.PlatformTenYearTests.test_oracle_counts_and_new_york_date_only_boundaries',
]
env = os.environ.copy()
env.update({
    'PYTHONPATH': str(ROOT / 'backend/tests') + os.pathsep + str(ROOT / 'backend'),
    'PLATFORM_ACCEPTANCE_SCALE_MONGO': 'mongodb://127.0.0.1:58749',
    'PLATFORM_ACCEPTANCE_MONGO_URL': 'mongodb://127.0.0.1:58749',
    'PLATFORM_ACCEPTANCE_MONGO_URI': 'mongodb://127.0.0.1:58749/platform_acceptance_20261011_tenyear',
    'PLATFORM_ACCEPTANCE_SCALE_REPORT_DIR': str(OUT / 'scale'),
    'PLATFORM_ACCEPTANCE_REPORT_DIR': str(OUT / 'lifecycle'),
    'PYTHONIOENCODING': 'utf-8',
})
OUT.mkdir(parents=True, exist_ok=True)
command = [sys.executable, '-m', 'unittest', '-v', *CASES]
receipt = {
    'operator': 'root/non-author selected operational retest',
    'product': '28b806716024ec149af2ec5da621a5a618c669d5',
    'qa_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'cases': CASES,
    'boundaries': ['Real loopback Mongo with modeled ASGI subjects, not hosted permissions.', 'No authentication/recovery/account mutation methods selected.', 'No five-campaign rerun or ten-year independent execution claim.'],
    'sha256_lf_normalized': {},
}
for name in ('test_platform_scale_reliability.py', 'test_platform_iso_inventory.py', 'test_platform_ten_year_lifecycle.py'):
    value = (ROOT / 'backend/tests' / name).read_bytes().replace(b'\r\n', b'\n')
    receipt['sha256_lf_normalized'][name] = hashlib.sha256(value).hexdigest()
start = time.monotonic()
with (OUT / 'raw-unittest.log').open('wb') as log:
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=240)
receipt.update(exit_code=result.returncode, duration_seconds=time.monotonic()-start,
    log_sha256=hashlib.sha256((OUT / 'raw-unittest.log').read_bytes()).hexdigest())
(OUT / 'run-receipt.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'exit_code': result.returncode, 'duration_seconds': receipt['duration_seconds'], 'out': str(OUT)}))
raise SystemExit(result.returncode)
