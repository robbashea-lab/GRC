import {cisContext} from '../testUtils/cisExperience';
import {sharedClientPrograms, sharedExperienceEligible, sharedPresentationEligible} from './sharedExperience';
import {visualCorrectionSurface} from './visualCorrectionScope';
import {brawndoDemoCalendar} from './brawndoDemoCalendar';
import {brawndoDemoReviewsGate} from './brawndoDemoReviews';
import {brawndoDemoActionsGate} from './brawndoDemoActions';
import {brawndoDemoRisksGate} from './brawndoDemoRisks';
import {brawndoOnboardingGate} from './brawndoOnboarding';
import {additionalSectionChrome, additionalSectionSurface} from './brawndoAdditionalScope';
import {brawndoFullRecordEligible} from './brawndoFullRecord';

function contextFor(mode, framework = null, completed = false) {
  const context = cisContext(`arbitrary-new-${mode}-${framework || 'none'}`, 1, mode);
  const client = {
    client_id: context.currentClientId, name: 'Arbitrary new organization',
    status: completed ? 'active' : 'onboarding', cis_program: null, shared_programs: [],
    onboarding_baseline: {completed, requirements: framework ? {[framework]: 'applies'} : {}},
  };
  return {...context, currentClient: client, clients: [client]};
}

test.each(['demo', 'standard'].flatMap(mode => [
  [mode, 'untouched setup', null, false], [mode, 'saved General', null, true],
  [mode, 'HIPAA', 'hipaa', true], [mode, 'NIST', 'nist-csf-2', true], [mode, 'CMMC', 'cmmc', true],
]))('%s %s receives common appearance without gaining framework capability', (mode, _label, framework, completed) => {
  const context = contextFor(mode, framework, completed), before = JSON.stringify(context);
  expect(sharedClientPrograms(context.currentClient)).toEqual([]);
  expect(sharedExperienceEligible(context)).toBe(true);
  expect(sharedPresentationEligible(context)).toBe(true);
  for (const [pathname, gate, surface] of [
    ['/calendar', brawndoDemoCalendar, 'calendar'], ['/reviews', brawndoDemoReviewsGate, 'reviews'],
    ['/action-items', brawndoDemoActionsGate, 'actions'], ['/risks', brawndoDemoRisksGate, 'risks'],
  ]) {
    expect(gate({...context, pathname})).toBe(true);
    expect(visualCorrectionSurface({...context, pathname})).toBe(surface);
  }
  for (const [pathname, surface] of [
    ['/policies', 'policies'], ['/vendors', 'vendors'], ['/ai-governance', 'ai-governance'],
    ['/evidence', 'evidence'], ['/contacts', 'contacts'], ['/client-profile', 'profile'],
  ]) {
    expect(additionalSectionChrome({...context, pathname})).toBe(surface);
    expect(additionalSectionSurface({...context, pathname, loadedClientId: context.currentClientId})).toBe(surface);
    expect(additionalSectionSurface({...context, pathname, loadedClientId: 'foreign'})).toBeNull();
  }
  expect(brawndoOnboardingGate({...context, pathname: '/client-profile',
    loadedClientId: context.currentClientId, profileClientId: context.currentClientId,
    handoffClientId: context.currentClientId, nativeDraft: {completed: false, requirements: {}},
  })).toBe(true);
  // Common native drawers preserve General-GRC operations without granting a framework program.
  expect(brawndoFullRecordEligible({...context, pathname: '/risks', clientId: context.currentClientId})).toBe(true);
  expect(brawndoFullRecordEligible({...context, pathname: '/risks', clientId: 'foreign'})).toBe(false);
  expect(brawndoFullRecordEligible({...context, pathname: '/risks', clientId: context.currentClientId,
    record:{risk_id:'retained-foreign-risk',client_id:'foreign'}})).toBe(false);
  const retained={risk_id:'retained-native-risk',client_id:context.currentClientId,history:[{at:'2026-10-01',note:'Original native history'}]};
  const beforeRecord=JSON.stringify(retained);
  expect(brawndoFullRecordEligible({...context,pathname:'/risks',clientId:context.currentClientId,record:retained})).toBe(true);
  expect(JSON.stringify(retained)).toBe(beforeRecord);
  expect(sharedClientPrograms(context.currentClient)).toEqual([]);
  expect(JSON.stringify(context)).toBe(before);
});

test.each(['demo', 'standard'])('%s common appearance retains identity, error and stale-read guards', mode => {
  const context = contextFor(mode);
  for (const patch of [
    {user: null}, {user: {...context.user, role: 'unknown'}}, {authLoading: true}, {authError: 'denied'},
    {orgError: 'denied'}, {currentClient: null}, {clients: []},
    {routeClientId: 'foreign'}, {currentClient: {...context.currentClient, status: 'archived'}},
    {currentClient: {...context.currentClient, archived: true}},
    {user: {...context.user, workspace_mode: mode === 'demo' ? 'standard' : 'demo'}},
  ]) {
    const denied = {...context, ...patch};
    expect(sharedPresentationEligible(denied)).toBe(false);
    expect(brawndoDemoReviewsGate({...denied, pathname: '/reviews'})).toBe(false);
  }
  expect(brawndoDemoReviewsGate({...context, pathname: '/reviews', orgLoading: true})).toBe(false);
  expect(brawndoDemoReviewsGate({...context, pathname: '/reviews', loadedClientId: 'foreign'})).toBe(false);
  // Record-free retained chrome can survive the same bounded background refresh as before.
  expect(sharedPresentationEligible({...context, orgLoading: true, loadedClientId: null})).toBe(true);
  const onboarding = {...context, pathname: '/client-profile', loadedClientId: context.currentClientId,
    profileClientId: context.currentClientId, handoffClientId: context.currentClientId};
  for (const patch of [{loadedClientId: 'foreign'}, {profileClientId: 'foreign'},
    {handoffClientId: 'foreign'}, {hasError: true}, {orgLoading: true}]) {
    expect(brawndoOnboardingGate({...onboarding, ...patch})).toBe(false);
  }
  const reader = {...context, user: {...context.user, role: 'client_readonly'}};
  expect(brawndoDemoReviewsGate({...reader, pathname: '/reviews'})).toBe(true);
  expect(brawndoDemoActionsGate({...reader, pathname: '/action-items'})).toBe(false);
  expect(visualCorrectionSurface({...reader, pathname: '/action-items'})).toBeNull();
});

test.each(['demo', 'standard'])('%s General appearance follows authorized identity, not another remembered preference', mode => {
  const context = contextFor(mode);
  for (const selectedClientId of ['foreign', '', null]) {
    const current = {...context, selectedClientId};
    expect(sharedExperienceEligible(current)).toBe(true);
    expect(sharedPresentationEligible(current)).toBe(true);
    expect(brawndoDemoReviewsGate({...current, pathname:'/reviews'})).toBe(true);
  }
  expect(sharedClientPrograms(context.currentClient)).toEqual([]);
});
