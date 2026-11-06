import {brawndoArtifactModel} from './cisCanonicalBrawndoModel';
import {initechArtifactModel} from './cisCanonicalInitechModel';
import {krustyArtifactModel} from './cisCanonicalKrustyModel';
import {brawndoArtifactSpecs, brawndoArtifactSpecsFromModel} from './cisCanonicalBrawndoBooks';
import {initechArtifactSpecs, initechArtifactSpecsFromModel} from './cisCanonicalInitechBooks';
import {krustyArtifactSpecs, krustyArtifactSpecsFromModel} from './cisCanonicalKrustyBooks';

const {createHash} = require('crypto');
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sources = [
  ['Brawndo', brawndoArtifactModel, brawndoArtifactSpecs, brawndoArtifactSpecsFromModel],
  ['Initech', initechArtifactModel, initechArtifactSpecs, initechArtifactSpecsFromModel],
  ['Krusty', krustyArtifactModel, krustyArtifactSpecs, krustyArtifactSpecsFromModel],
];
const anchors = ['2026-11-04T00:00:00.000Z', '2030-05-15T00:00:00.000Z'];

function freezeSource(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeSource);
  return Object.freeze(value);
}

afterEach(() => jest.useRealTimers());

describe.each(sources)('%s fresh construction formatter', (_name, model, immutableBooks, fromModel) => {
  test.each(anchors)('reads a frozen source without mutation and retains all immutable book fields at %s', anchor => {
    jest.useFakeTimers().setSystemTime(new Date(anchor));
    const source = model(anchor);
    const before = fingerprint(source);
    freezeSource(source);
    const actual = fromModel(anchor, source);
    const expected = immutableBooks(anchor);
    expect(actual).toEqual(expected);
    expect(fingerprint(actual)).toBe(fingerprint(expected));
    expect(fingerprint(source)).toBe(before);
  }, 30000);

  test('rejects mismatched or missing anchors before using source records', () => {
    const source = {dates: {anchor: anchors[0]}};
    for (const anchor of ['', null, anchors[1]]) {
      expect(() => fromModel(anchor, source)).toThrow(/same frozen source anchor/);
    }
    expect(() => fromModel(anchors[0], null)).toThrow(/same frozen source anchor/);
    expect(() => fromModel(anchors[0], {})).toThrow(/same frozen source anchor/);
  });
});
