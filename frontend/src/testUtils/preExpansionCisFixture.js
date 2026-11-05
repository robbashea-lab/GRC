import {buildLegacyDemoStore} from '../preview/store';
import {refreshCanonicalCisDemo} from '../preview/cisDemoRefresh';

// Staged constructor tests need source data that has not already been rebuilt.
// Default activation, native workflows and lifecycle gates must use seedStore.
export function preExpansionCisFixture(clock) {
  const db=buildLegacyDemoStore(clock);
  refreshCanonicalCisDemo(db,{clock,fresh:true});
  return db;
}
