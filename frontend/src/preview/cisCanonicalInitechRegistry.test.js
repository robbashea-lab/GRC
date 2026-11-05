import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {CIS_CANONICAL_SCENARIO_REVISION,canonicalArtifactDefinition} from './cisCanonicalArtifactBooks';
import * as sourceBooks from './cisCanonicalInitechBooks';

test.each(['record-books-0','record-books-01','record-books-33','safeguards-1','operating-inventory','constructor'])
('an unknown Initech book key %s is rejected before source construction', key => {
  const source = jest.spyOn(sourceBooks,'initechArtifactSpecs');
  try {
    expect(canonicalArtifactDefinition({kind:'scenario_book',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,
      scenario_revision:CIS_CANONICAL_SCENARIO_REVISION,client_id:'demo_initech',anchor:'2026-11-02T00:00:00.000Z',key})).toBeNull();
    expect(source).not.toHaveBeenCalled();
  } finally {source.mockRestore();}
});
