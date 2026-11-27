"""Build and audit runner-local staging images; never start the application or publish images."""
import copy
from collections import Counter
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.76.2'
DOCKER = ['docker', '--host', 'unix:///var/run/docker.sock']
ARCHIVE_SHA = 'bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf'
ARCHIVE_URL = 'https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_Linux-64bit.tar.gz'
DOCKERFILE = 'deploy/RenderStaging.Dockerfile'
SOURCE_FILES = [DOCKERFILE, DOCKERFILE + '.dockerignore', '.github/workflows/release-verification.yml',
                '.github/scripts/audit_images.py', 'frontend/package.json', 'frontend/yarn.lock',
                'backend/requirements-runtime.txt']
NODE_INVENTORY = r'''
const fs=require('node:fs'), path=require('node:path');
const packages=[], visited=new Set();
function readPackage(folder) {
  const real=fs.realpathSync(folder), file=path.join(real,'package.json');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(typeof data.name!=='string'||!data.name||typeof data.version!=='string'||!data.version) throw new Error('Missing package identity: '+file);
  packages.push({name:data.name,version:data.version,path:folder,realpath:real});
  if(visited.has(real)) return;
  visited.add(real);
  const nested=path.join(real,'node_modules');
  if(fs.existsSync(nested)) readModules(nested);
}
function readModules(folder) {
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    if(entry.name.startsWith('.')||(!entry.isDirectory()&&!entry.isSymbolicLink())) continue;
    const target=path.join(folder,entry.name);
    if(entry.name.startsWith('@')) {
      for(const child of fs.readdirSync(target,{withFileTypes:true})) {
        if(!child.name.startsWith('.')&&(child.isDirectory()||child.isSymbolicLink())) readPackage(path.join(target,child.name));
      }
    } else readPackage(target);
  }
}
for(const folder of ['/app/frontend/node_modules','/usr/local/lib/node_modules']) readModules(folder);
const yarn=fs.realpathSync('/usr/local/bin/yarn');
readPackage(path.dirname(path.dirname(yarn)));
console.log(JSON.stringify({node:process.version,packages}));
'''


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def python_name(name):
    return re.sub(r'[-_.]+', '-', name).lower()


def validate_base_layers(image, base):
    base_layers, image_layers = base['RootFS']['Layers'], image['RootFS']['Layers']
    require(isinstance(base_layers, list) and base_layers and isinstance(image_layers, list), 'Base/image layers missing')
    require(image_layers[:len(base_layers)] == base_layers, 'Built image does not retain the captured base layer prefix')


def validate_reports(role, image_id, inspection, report, sbom, installed):
    require(role in ('final', 'frontend'), 'Unexpected image role')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', image_id), 'Invalid built image ID')
    require(inspection['Id'] == image_id and inspection['Os'] == 'linux'
            and inspection['Architecture'] == 'amd64', 'Docker image identity/platform mismatch')
    require(report['SchemaVersion'] == 2 and report['Trivy']['Version'] == VERSION, 'Unexpected scanner schema/version')
    require(report['ArtifactType'] == 'container_image' and report['Metadata']['ImageID'] == image_id,
            'Scan is not bound to the built container image')
    results = report['Results']
    require(any(row.get('Class') == 'os-pkgs' and row.get('Packages') for row in results), 'OS inventory missing')
    require(report['Metadata'].get('OS', {}).get('Family'), 'OS metadata missing')
    require(not any(row.get('ExperimentalModifiedFindings') for row in results), 'Modified/ignored findings are not admitted')
    packages = [pkg for row in results for pkg in row.get('Packages', [])]
    require(packages and installed, 'Package inventory is empty')
    require(sbom['bomFormat'] == 'CycloneDX' and sbom.get('specVersion'), 'Invalid CycloneDX document')
    component = sbom['metadata']['component']
    require(component['type'] == 'container', 'SBOM is not a container')
    properties = {row['name']: row['value'] for row in component.get('properties', [])}
    require(properties.get('aquasecurity:trivy:ImageID') == image_id, 'SBOM image identity mismatch')
    require(any(tool.get('group') == 'aquasecurity' and tool.get('name') == 'trivy' and tool.get('version') == VERSION
                for tool in sbom['metadata']['tools']['components']), 'SBOM tool provenance mismatch')
    components = sbom['components']
    require(components, 'SBOM components missing')
    purls = {row['purl'] for row in components if row.get('purl')}
    pairs = {(row.get('name'), row.get('version')) for row in components}
    for pkg in packages:
        purl = pkg.get('Identifier', {}).get('PURL')
        require(purl in purls if purl else (pkg['Name'], pkg['Version']) in pairs, 'JSON package missing from SBOM')
    normalize = python_name if role == 'final' else lambda value: value
    native = set()
    for pkg in installed:
        require(isinstance(pkg.get('name'), str) and pkg['name'] and isinstance(pkg.get('version'), str) and pkg['version'],
                'Installed package identity missing')
        native.add((normalize(pkg['name']), pkg['version']))
    required = {'fastapi', 'motor', 'pymongo'} if role == 'final' else {'axios', '@craco/craco', 'npm', 'yarn'}
    require(required <= {name for name, _ in native}, 'Expected installed runtime/build dependencies missing')
    language = set()
    for row in results:
        for pkg in row.get('Packages', []):
            purl = pkg.get('Identifier', {}).get('PURL', '')
            target = purl.startswith('pkg:pypi/') or row.get('Type') in ('python-pkg', 'pip') if role == 'final' else purl.startswith('pkg:npm/') or row.get('Type') in ('node-pkg', 'npm', 'yarn')
            if target:
                language.add((normalize(pkg['Name']), pkg['Version']))
    require(native <= language, 'Installed package names/versions missing from scanner inventory: ' + repr(sorted(native - language)))
    findings = [vuln for row in results for vuln in row.get('Vulnerabilities', [])]
    ids = {vuln['VulnerabilityID'] for vuln in findings}
    require(ids <= {row['id'] for row in sbom.get('vulnerabilities', [])}, 'Vulnerability IDs missing from SBOM')
    return {'installed_instances': len(installed), 'installed_name_versions': len(native), 'scanner_packages': len(packages),
            'sbom_components': len(components), 'finding_rows': len(findings), 'distinct_advisory_ids': len(ids),
            'finding_rows_by_severity': dict(Counter(row.get('Severity', 'UNKNOWN') for row in findings)),
            'findings_disposition': 'UNREVIEWED; instrumentation success is not risk acceptance'}


def validate_version(value):
    require(value['Version'] == VERSION, 'Unexpected executed scanner version')
    for name in ('VulnerabilityDB', 'JavaDB'):
        data = value.get(name)
        require(data is not None or name == 'JavaDB', 'Vulnerability database metadata missing')
        if data is None:
            continue
        require(type(data.get('Version')) is int and data['Version'] > 0, 'Invalid database version')
        for field in ('UpdatedAt', 'NextUpdate', 'DownloadedAt'):
            require(datetime.fromisoformat(data[field].replace('Z', '+00:00')).tzinfo is not None, 'Database timestamp lacks timezone')


def self_check():
    def fixture(role):
        names = ['fastapi', 'motor', 'pymongo'] if role == 'final' else ['axios', '@craco/craco', 'npm', 'yarn']
        native = [{'name': name, 'version': '1.0'} for name in names]
        image = 'sha256:' + ('1' if role == 'final' else '2') * 64
        kind = 'pypi' if role == 'final' else 'npm'
        packages = [{'Name': row['name'], 'Version': row['version'], 'Identifier': {'PURL': 'pkg:' + kind + '/' + row['name'] + '@1.0'}} for row in native]
        os_package = {'Name': 'libc6', 'Version': '2.0', 'Identifier': {'PURL': 'pkg:deb/debian/libc6@2.0'}}
        report = {'SchemaVersion': 2, 'Trivy': {'Version': VERSION}, 'ArtifactType': 'container_image',
                  'Metadata': {'ImageID': image, 'OS': {'Family': 'debian'}}, 'Results': [
                      {'Class': 'os-pkgs', 'Packages': [os_package]},
                      {'Class': 'lang-pkgs', 'Packages': packages, 'Vulnerabilities': [{'VulnerabilityID': 'CVE-TEST', 'Severity': 'HIGH'}]}]}
        sbom = {'bomFormat': 'CycloneDX', 'specVersion': '1.6', 'metadata': {'component': {'type': 'container', 'properties': [
                    {'name': 'aquasecurity:trivy:ImageID', 'value': image}]}, 'tools': {'components': [
                    {'group': 'aquasecurity', 'name': 'trivy', 'version': VERSION}]}},
                'components': [{'name': pkg['Name'], 'version': pkg['Version'], 'purl': pkg['Identifier']['PURL']} for pkg in [os_package] + packages],
                'vulnerabilities': [{'id': 'CVE-TEST'}]}
        return [role, image, {'Id': image, 'Os': 'linux', 'Architecture': 'amd64'}, report, sbom, native]
    checks = []
    for role in ('final', 'frontend'):
        validate_reports(*fixture(role))
        checks.append('valid_' + role)
    mutations = {
        'wrong_image': lambda v: v[3]['Metadata'].update(ImageID='wrong'),
        'wrong_platform': lambda v: v[2].update(Architecture='arm64'),
        'wrong_schema': lambda v: v[3].update(SchemaVersion=1),
        'wrong_scanner': lambda v: v[3]['Trivy'].update(Version='other'),
        'wrong_sbom_image': lambda v: v[4]['metadata']['component']['properties'][0].update(value='wrong'),
        'wrong_sbom_tool': lambda v: v[4]['metadata']['tools']['components'][0].update(version='other'),
        'empty_components': lambda v: v[4].update(components=[]),
        'missing_os_inventory': lambda v: v[3]['Results'][0].update(Packages=[]),
        'missing_os_metadata': lambda v: v[3]['Metadata'].update(OS={}),
        'missing_installed_package': lambda v: v[3]['Results'][1]['Packages'].pop(),
        'wrong_installed_version': lambda v: v[5][0].update(version='2.0'),
        'missing_sbom_package': lambda v: v[4]['components'].pop(),
        'missing_sbom_vulnerability': lambda v: v[4].update(vulnerabilities=[]),
        'modified_findings': lambda v: v[3]['Results'][0].update(ExperimentalModifiedFindings=[{}]),
        'empty_native_inventory': lambda v: v[5].clear(),
    }
    for name, change in mutations.items():
        value = copy.deepcopy(fixture('final'))
        change(value)
        try:
            validate_reports(*value)
        except (RuntimeError, KeyError, TypeError, ValueError):
            checks.append('reject_' + name)
        else:
            raise RuntimeError('Audit guard accepted invalid fixture: ' + name)
    value = fixture('final')
    value[5][0]['name'] = 'FastAPI'
    validate_reports(*value)
    checks.append('python_name_normalization')
    value = fixture('frontend')
    value[5][0]['name'] = 'Axios'
    try:
        validate_reports(*value)
    except RuntimeError:
        checks.append('node_names_remain_exact')
    else:
        raise RuntimeError('Node package names were normalized')
    value = fixture('final')
    value[3]['Results'][1]['Vulnerabilities'] = []
    value[4]['vulnerabilities'] = []
    require(validate_reports(*value)['finding_rows'] == 0, 'Zero-findings result was not preserved')
    checks.append('zero_findings_is_not_an_error_or_risk_waiver')
    validate_base_layers({'RootFS': {'Layers': ['base', 'application']}}, {'RootFS': {'Layers': ['base']}})
    checks.append('valid_base_layer_prefix')
    for label, base_layers, built_layers in [('foreign_base', ['base'], ['other']), ('missing_base_layers', [], ['application'])]:
        try:
            validate_base_layers({'RootFS': {'Layers': built_layers}}, {'RootFS': {'Layers': base_layers}})
        except RuntimeError:
            checks.append('reject_' + label)
        else:
            raise RuntimeError('Base layer provenance guard failed: ' + label)
    version = {'Version': VERSION, 'VulnerabilityDB': {'Version': 2, 'UpdatedAt': '2026-11-22T00:00:00Z',
                'NextUpdate': '2026-11-23T00:00:00Z', 'DownloadedAt': '2026-11-22T01:00:00Z'}}
    validate_version(version)
    for key in ('Version', 'VulnerabilityDB'):
        bad = copy.deepcopy(version)
        del bad[key]
        try:
            validate_version(bad)
        except (RuntimeError, KeyError, TypeError, ValueError):
            checks.append('reject_missing_' + key)
        else:
            raise RuntimeError('Version/DB provenance guard failed')
    print(json.dumps({'status': 'PASS_SOURCE_ONLY', 'checks': checks, 'count': len(checks), 'docker_or_scanner_executed': False}))


def main():
    require(sys.platform == 'linux' and platform.machine() == 'x86_64', 'Use the configured Linux x64 CI runner')
    env = {name: value for name, value in os.environ.items() if not name.startswith('TRIVY_')}
    for name in list(env):
        if name.startswith(('DOCKER_', 'BUILDX_', 'BUILDKIT_')):
            env.pop(name)
    env['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    require(head == env['GITHUB_SHA'], 'Checkout is not the event commit')
    require(not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip(), 'Checkout must be clean')
    temp = Path(env['RUNNER_TEMP'])
    out, tools, cache = (temp / name for name in ('governara-image-audit', 'governara-trivy-tool', 'governara-trivy-cache'))
    for path in (out, tools, cache):
        path.mkdir(exist_ok=False)
    docker_config = tools / 'docker-config'
    docker_config.mkdir()
    (docker_config / 'config.json').write_text('{}\n')
    env['DOCKER_CONFIG'] = str(docker_config)
    commands = []
    summary = {'status': 'RUNNING', 'commit': head, 'tree': subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=ROOT, text=True).strip(),
               'source_files': {name: digest(ROOT / name) for name in SOURCE_FILES}, 'images': {},
               'removed_trivy_environment_names': sorted(name for name in os.environ if name.startswith('TRIVY_')),
               'findings_disposition': 'UNREVIEWED; does not waive saved dependency findings or authorize deployment',
               'docker_endpoint': 'unix:///var/run/docker.sock', 'app_entrypoint_started': False,
               'registry_login_or_push': False, 'provider_secret_input': False}
    def write(name, value):
        (out / name).write_text(json.dumps(value, indent=2) + '\n')
    def run(args, name):
        record = {'argv': [str(arg) for arg in args], 'stdout': name, 'stderr': name + '.stderr'}
        commands.append(record)
        with (out / name).open('xb') as stdout, (out / (name + '.stderr')).open('xb') as stderr:
            result = subprocess.run(record['argv'], cwd=ROOT, env=env, stdout=stdout, stderr=stderr)
        record['exit_code'] = result.returncode
        write('commands.json', commands)
        require(result.returncode == 0, 'Build/audit command failed: ' + name)
        return (out / name).read_text()
    try:
        config, ignore = out / 'scanner-config.yaml', out / 'scanner-empty.ignore'
        config.write_text('{}\n')
        ignore.write_text('')
        archive = tools / 'trivy.tar.gz'
        run(['curl', '--disable', '--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--output', archive, ARCHIVE_URL], 'tool-download.log')
        require(digest(archive) == ARCHIVE_SHA, 'Scanner archive checksum differs')
        with tarfile.open(archive, 'r:gz') as bundle:
            member = bundle.getmember('trivy')
            require(member.isfile() and not member.issym() and not member.islnk(), 'Unexpected scanner archive member')
            with bundle.extractfile(member) as stream:
                (tools / 'trivy').write_bytes(stream.read())
        tool = tools / 'trivy'
        tool.chmod(0o755)
        prefix = [tool, '--config', config, '--cache-dir', cache]
        write('tool.json', {'version': VERSION, 'archive_url': ARCHIVE_URL, 'archive_sha256': digest(archive), 'binary_sha256': digest(tool)})
        bootstrap = json.loads(run(prefix + ['version', '--format', 'json'], 'scanner-bootstrap-version.json'))
        require(bootstrap['Version'] == VERSION, 'Downloaded scanner version differs')
        run(DOCKER + ['version', '--format', '{{json .}}'], 'docker-version.json')
        bases = [line.split()[1] for line in (ROOT / DOCKERFILE).read_text().splitlines() if line.startswith('FROM ')]
        require(bases == ['node:22-bookworm-slim', 'python:3.12-slim'], 'Review audit base/stage mapping after Dockerfile changes')
        base_inspections = []
        for number, base in enumerate(bases):
            run(DOCKER + ['pull', base], f'base-{number}-pull.log')
            inspection = json.loads(run(DOCKER + ['image', 'inspect', base], f'base-{number}.json'))
            require(len(inspection) == 1 and inspection[0].get('RepoDigests'), 'Pulled base digest missing')
            base_inspections.append(inspection[0])
        image_ids, base_ids = {}, {}
        for role in ('final', 'frontend'):
            command = DOCKER + ['build', '--pull=false', '--file', DOCKERFILE, '--iidfile', out / (role + '.id')]
            if role == 'frontend':
                command += ['--target', 'frontend']
            run(command + ['.'], role + '-build.log')
            image_id = (out / (role + '.id')).read_text().strip()
            require(re.fullmatch(r'sha256:[0-9a-f]{64}', image_id), 'Built image ID missing')
            image_ids[role] = image_id
            built = json.loads(run(DOCKER + ['image', 'inspect', image_id], role + '-inspect.json'))
            require(len(built) == 1, 'Ambiguous built image inspection')
            base = base_inspections[1 if role == 'final' else 0]
            validate_base_layers(built[0], base)
            base_ids[role] = base['Id']
        require(image_ids['final'] != image_ids['frontend'], 'Final and frontend roles resolved to one image')
        safety = DOCKER + ['run', '--rm', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--workdir', '/']
        run(safety + ['--entrypoint', 'python', image_ids['final'], '-m', 'pip', 'list', '--format=json', '--disable-pip-version-check'], 'final-installed.json')
        run(safety + ['--entrypoint', 'node', image_ids['frontend'], '-e', NODE_INVENTORY], 'frontend-installed.json')
        run(prefix + ['image', '--disable-telemetry', '--download-db-only'], 'database-download.log')
        database = cache / 'db/trivy.db'
        require(database.is_file(), 'Downloaded vulnerability database missing')
        database_hash = digest(database)
        for role, image_id in image_ids.items():
            raw, sbom = out / (role + '.trivy.json'), out / (role + '.cdx.json')
            run(prefix + ['image', '--image-src', 'docker', '--disable-telemetry', '--scanners', 'vuln', '--list-all-pkgs',
                          '--skip-db-update', '--ignorefile', ignore, '--show-suppressed', '--format', 'json', '--output', raw, image_id], role + '-scan.log')
            run(prefix + ['convert', '--ignorefile', ignore, '--show-suppressed', '--format', 'cyclonedx', '--output', sbom, raw], role + '-convert.log')
            inspection = json.loads((out / (role + '-inspect.json')).read_text())
            require(len(inspection) == 1, 'Ambiguous built image inspection')
            installed = json.loads((out / (role + '-installed.json')).read_text())
            if role == 'frontend':
                summary['frontend_node_version'] = installed['node']
                installed = installed['packages']
            summary['images'][role] = {'image_id': image_id, 'base_image_id': base_ids[role], 'base_layer_prefix_verified': True, **validate_reports(role, image_id, inspection[0], json.loads(raw.read_text()), json.loads(sbom.read_text()), installed)}
        require(digest(database) == database_hash, 'Vulnerability database changed between reports')
        version = json.loads(run(prefix + ['version', '--format', 'json'], 'scanner-version.json'))
        validate_version(version)
        summary['vulnerability_database_sha256'] = database_hash
        for directory in ('db', 'java-db'):
            metadata = cache / directory / 'metadata.json'
            if metadata.is_file():
                write(directory + '-metadata.json', json.loads(metadata.read_text()))
        require((out / 'db-metadata.json').is_file(), 'Raw vulnerability database metadata missing')
        require(summary['source_files'] == {name: digest(ROOT / name) for name in SOURCE_FILES}, 'Build source/lock drift')
        require(not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip(), 'Checkout changed during audit')
        summary['status'] = 'PASS_AUDIT_INSTRUMENTATION'
    except Exception as error:
        summary['status'] = 'FAIL_AUDIT_INSTRUMENTATION'
        summary['error'] = str(error)
        raise
    finally:
        write('summary.json', summary)
        write('commands.json', commands)
        (out / 'checksums.sha256').write_text(''.join(digest(path) + '  ' + path.name + '\n' for path in sorted(out.iterdir()) if path.is_file() and path.name != 'checksums.sha256'))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-check']:
        self_check()
    else:
        require(not sys.argv[1:], 'Only the explicit --self-check option is supported')
        main()