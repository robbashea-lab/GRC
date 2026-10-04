"""Read-only CIS Navigator membership/text comparison; no workbook dependency."""
import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_reference(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(t.text or '' for t in item.findall('.//s:t', NS))
                       for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        rows = []
        for name in archive.namelist():
            if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name):
                continue
            for row in ET.fromstring(archive.read(name)).findall('.//s:sheetData/s:row', NS):
                values = {}
                for cell in row.findall('s:c', NS):
                    value = cell.find('s:v', NS)
                    text = value.text or '' if value is not None else ''.join(t.text or '' for t in cell.findall('.//s:t', NS))
                    if cell.get('t') == 's':
                        text = strings[int(text)]
                    values[re.sub(r'\d', '', cell.get('r'))] = text
                if re.fullmatch(r'\d+\.\d+', values.get('B', '')):
                    rows.append({'id': values['B'], 'control': int(values['A']),
                                 'title': values['C'], 'group': int(values['E']),
                                 'description': values['F'], 'cell': f'{name}!F{row.get("r")}'})
        return rows


def normalize(text):
    return ' '.join(text.replace('’', "'").replace('–', '-').split())


def compare(path):
    root = Path(__file__).resolve().parents[2]
    load = lambda name: json.loads((root / 'shared/catalogs' / name).read_text(encoding='utf-8'))
    catalog = load('cisIG1.json')
    guidance = load('operatorGuidance/cisAssessmentGuidance.json')['requirements']
    guide = load('operatorGuidance/cisRequirementGuide.json')['requirements']
    criteria = load('operatorGuidance/cisAssessmentCriteria.json')['requirements']
    reference = read_reference(path)
    current = {row['id']: row for row in catalog['requirements']}
    matrix = []
    corrections = {
        '1.4': 'Restore all DHCP/IPAM sources and weekly use of logs.',
        '3.8': 'Tie internal/provider flows to the data management process.',
        '3.11': 'Align title capitalization with supplied reference.',
        '11.1': 'Separate optional backup procedures from recovery-process minimum.',
        '12.2': 'Keep segmentation, least privilege, availability and policy/design visible.',
        '12.7': 'Remove remote-only scope restriction from requirement explanation.',
        '15.4': 'Expose contract consistency with provider policy and annual review.',
    }
    for source in reference:
        ident = source['id']
        row = current.get(ident, {})
        matrix.append({'id': ident, 'group': source['group'], 'source_cell': source['cell'],
                       'title': row.get('title'), 'control': row.get('control'),
                       'control_name': row.get('control_name'),
                       'control_match': row.get('control') == source['control'],
                       'group_match': row.get('implementation_group') == source['group'],
                       'title_match': normalize(row.get('title', '')) == normalize(source['title']),
                       'official_text_match': row.get('official_text_mode') == 'LICENSED_TEXT' and row.get('official_text') == source['description'],
                       'description_verbatim': normalize(row.get('guidance', '')) == normalize(source['description']),
                       'guidance_parts': sorted(guidance.get(ident, {})),
                       'guide_parts': sorted(guide.get(ident, {})),
                       'criterion_ids': [c['id'] for c in criteria.get(ident, {}).get('criteria', [])],
                       'authored_summary': row.get('guidance'),
                       'source_timing_explanation': row.get('source_cadence'),
                       'review_questions': guidance.get(ident, {}).get('review'),
                       'evidence_examples': guidance.get(ident, {}).get('evidence'),
                       'requirement_guide': guide.get(ident),
                       'content_review': corrections.get(ident, 'Reviewed; no demonstrated correction required.'),
                       'review_plans': [p['key'] for p in catalog['review_plans'] if ident in p['safeguards']]})
    populations = []
    for group in [1, 2, 3]:
        expected = {r['id'] for r in reference if r['group'] <= group}
        actual = {r['id'] for r in catalog['requirements'] if r['implementation_group'] <= group}
        populations.append({'group': group, 'expected': len(expected), 'actual': len(actual),
                            'missing': sorted(expected - actual), 'unexpected': sorted(actual - expected)})
    return {'workbook_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'reference_rows': len(reference), 'catalog_rows': len(catalog['requirements']),
            'reference_duplicates': [k for k, v in Counter(r['id'] for r in reference).items() if v > 1],
            'catalog_duplicates': [k for k, v in Counter(r['id'] for r in catalog['requirements']).items() if v > 1],
            'populations': populations, 'released_groups': catalog['available_implementation_groups'],
            'matrix': sorted(matrix, key=lambda r: (r['group'], tuple(map(int, r['id'].split('.')))))}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.workbook)
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'matrix'}, indent=2))
    print('Title mismatches:', [r['id'] for r in result['matrix'] if not r['title_match']])
    invalid = (result['reference_rows'] != 153 or result['catalog_rows'] != 153
               or result['reference_duplicates'] or result['catalog_duplicates']
               or any(p['missing'] or p['unexpected'] for p in result['populations'])
               or any(not all(r[k] for k in ('control_match', 'group_match', 'title_match', 'official_text_match')) for r in result['matrix']))
    raise SystemExit(1 if invalid else 0)
