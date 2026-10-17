import {cis, FRAMEWORKS} from './frameworks';
import {brawndoCisVisualGate, cisVisualRecordMatches} from './brawndoCisVisual';

function context() {
  const definitions = JSON.parse(JSON.stringify(cis.requirements.filter(row => row.implementation_group === 1)));
  const assessments = definitions.map(definition => ({framework_assessment_id: `native-${definition.id}`,
    definition_id: definition.id, client_id: 'demo_brawndo', framework_key: 'cis-ig1', framework_version: '8.1', status: 'not_assessed'}));
  return {
    trustedDemo: true, workspaceMode: 'demo', user: {user_id: 'demo_admin', role: 'super_admin', workspace_mode: 'demo'},
    authLoading: false, authError: null, orgLoading: false, orgError: null, error: null,
    pathname: '/compliance/cis-ig1', frameworkKey: 'cis-ig1', clientId: 'demo_brawndo',
    currentClientId: 'demo_brawndo', selectedClientId: 'demo_brawndo', routeClientId: 'demo_brawndo',
    currentClient: {client_id: 'demo_brawndo', name: 'Brawndo', status: 'active'}, clients: [{client_id: 'demo_brawndo'}],
    loadedScope: {clientId: 'demo_brawndo', frameworkKey: 'cis-ig1', userId: 'demo_admin',
      role: 'super_admin', workspaceMode: 'demo', userWorkspaceMode: 'demo', trustedDemo: true},
    data: {framework: {...FRAMEWORKS.find(row => row.key === 'cis-ig1')}, selected: true, configured: true,
      configuration: {implementation_group: 1}, active_definition_ids: definitions.map(row => row.id), definitions, assessments,
      implementation_position: {program_id: 'demo_brawndo:cis-ig1'}},
  };
}

test('only the complete trusted native Brawndo Explore IG1 context enables appearance', () => {
  const source = context();
  expect(source.data.definitions).toHaveLength(56);
  expect(brawndoCisVisualGate(source)).toBe(true);
  expect(brawndoCisVisualGate({...source, routeClientId: null})).toBe(true);
});

test.each([false, undefined, null, '', 'true', '?demo=true', 1, {}])('a URL or truthy value cannot establish trusted demo mode (%p)', trustedDemo => {
  expect(brawndoCisVisualGate({...context(), trustedDemo})).toBe(false);
});

test.each(['standard', 'authenticated', 'live', 'Demo', undefined, null])('workspace mode %p is outside Explore appearance', workspaceMode => {
  expect(brawndoCisVisualGate({...context(), workspaceMode})).toBe(false);
});

test.each([
  ['missing actor', source => { source.user = null; }],
  ['missing actor identity', source => { delete source.user.user_id; }],
  ['missing actor role', source => { delete source.user.role; }],
  ['signed-in actor', source => { source.user.workspace_mode = 'standard'; }],
  ['actor changed after load', source => { source.user.user_id = 'another-demo-actor'; }],
  ['same actor role changed after load', source => { source.user.role = 'client_grc_manager'; }],
  ['auth loading', source => { source.authLoading = true; }],
  ['auth error', source => { source.authError = new Error('Auth unavailable'); }],
  ['organization loading', source => { source.orgLoading = true; }],
  ['organization error', source => { source.orgError = new Error('Organization unavailable'); }],
  ['framework load error', source => { source.error = new Error('Framework unavailable'); }],
  ['foreign selected client', source => { source.selectedClientId = 'demo_dunder'; }],
  ['missing selected client', source => { source.selectedClientId = null; }],
  ['foreign explicit route client', source => { source.routeClientId = 'demo_dunder'; }],
  ['foreign resolved client', source => { source.clientId = 'demo_dunder'; }],
  ['foreign current client id', source => { source.currentClientId = 'demo_dunder'; }],
  ['foreign current client object', source => { source.currentClient.client_id = 'demo_dunder'; }],
  ['unauthorized client', source => { source.clients = [{client_id: 'demo_dunder', name: 'Brawndo'}]; }],
  ['missing client authorization list', source => { source.clients = null; }],
  ['inactive client', source => { source.currentClient.status = 'inactive'; }],
  ['unknown client state', source => { delete source.currentClient.status; }],
  ['archived boolean', source => { source.currentClient.archived = true; }],
  ['archived timestamp', source => { source.currentClient.archived_at = '2026-10-15'; }],
  ['missing loaded scope', source => { source.loadedScope = null; }],
  ['late foreign client response', source => { source.loadedScope.clientId = 'demo_dunder'; }],
  ['late foreign framework response', source => { source.loadedScope.frameworkKey = 'soc-2'; }],
  ['late foreign actor response', source => { source.loadedScope.userId = 'old-demo-actor'; }],
  ['late different role response', source => { source.loadedScope.role = 'contributor'; }],
  ['missing loaded role', source => { delete source.loadedScope.role; }],
  ['late different workspace mode response', source => { source.loadedScope.workspaceMode = 'standard'; }],
  ['missing loaded workspace mode', source => { delete source.loadedScope.workspaceMode; }],
  ['late different actor workspace mode response', source => { source.loadedScope.userWorkspaceMode = 'standard'; }],
  ['missing loaded actor workspace mode', source => { delete source.loadedScope.userWorkspaceMode; }],
  ['untrusted loaded response origin', source => { source.loadedScope.trustedDemo = false; }],
  ['truthy loaded response origin', source => { source.loadedScope.trustedDemo = 'true'; }],
  ['missing loaded response origin', source => { delete source.loadedScope.trustedDemo; }],
  ['different route', source => { source.pathname = '/risks'; }],
  ['different framework', source => { source.frameworkKey = 'soc-2'; }],
])('%s fails closed', (_name, mutate) => {
  const source = context(); mutate(source);
  expect(brawndoCisVisualGate(source)).toBe(false);
});

test.each(['Brawndo', 'demo_Brawndo', 'new-client', 'authenticated-brawndo', 'demo_dunder'])('a lookalike name cannot authorize client %s', clientId => {
  const source = context();
  Object.assign(source, {clientId, currentClientId: clientId, selectedClientId: clientId, routeClientId: clientId});
  source.currentClient = {client_id: clientId, name: 'Brawndo', status: 'active'};
  source.clients = [source.currentClient]; source.loadedScope.clientId = clientId;
  source.data.assessments.forEach(row => { row.client_id = clientId; });
  source.data.implementation_position.program_id = `${clientId}:cis-ig1`;
  expect(brawndoCisVisualGate(source)).toBe(false);
});

test.each([
  ['unselected program', data => { data.selected = false; }],
  ['unconfigured program', data => { data.configured = false; }],
  ['missing program configuration', data => { data.configuration = null; }],
  ['IG2 on the same route', data => { data.configuration.implementation_group = 2; }],
  ['IG3 on the same route', data => { data.configuration.implementation_group = 3; }],
  ['unvalidated group string', data => { data.configuration.implementation_group = '1'; }],
  ['foreign framework', data => { data.framework.key = 'soc-2'; }],
  ['different catalog version', data => { data.framework.version = '8.0'; }],
  ['missing current program identity', data => { data.implementation_position = null; }],
  ['foreign program identity', data => { data.implementation_position.program_id = 'demo_dunder:cis-ig1'; }],
  ['missing active scope', data => { data.active_definition_ids = null; }],
  ['incomplete active scope', data => { data.active_definition_ids.pop(); }],
  ['duplicated active scope', data => { data.active_definition_ids[1] = data.active_definition_ids[0]; }],
  ['higher-group active scope', data => { data.active_definition_ids.push('1.3'); }],
  ['foreign active definition', data => { data.active_definition_ids[0] = 'other'; }],
  ['missing definitions', data => { data.definitions = null; }],
  ['incomplete definitions', data => { data.definitions.pop(); }],
  ['duplicated definition', data => { data.definitions.push({...data.definitions[0]}); }],
  ['foreign definition version', data => { data.definitions[0].version = '8.0'; }],
  ['higher-group definition', data => { data.definitions[0].implementation_group = 2; }],
  ['missing assessments', data => { data.assessments = null; }],
  ['missing native assessment', data => { data.assessments.pop(); }],
  ['duplicated native assessment', data => { data.assessments.push({...data.assessments[0]}); }],
  ['foreign native client', data => { data.assessments[0].client_id = 'demo_dunder'; }],
  ['foreign native framework', data => { data.assessments[0].framework_key = 'soc-2'; }],
  ['foreign native version', data => { data.assessments[0].framework_version = '8.0'; }],
  ['missing native record id', data => { delete data.assessments[0].framework_assessment_id; }],
  ['invalid native record id type', data => { data.assessments[0].framework_assessment_id = 7; }],
  ['duplicated native record id', data => { data.assessments[1].framework_assessment_id = data.assessments[0].framework_assessment_id; }],
])('%s cannot enable scoped appearance', (_name, mutate) => {
  const source = context(); mutate(source.data);
  expect(brawndoCisVisualGate(source)).toBe(false);
});

test('gate reads retain native definitions, assessments and saved state unchanged', () => {
  const source = context(), before = JSON.stringify(source);
  expect(brawndoCisVisualGate(source)).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
});

function recordContext() {
  const record = context().data.assessments[0], originKey = 'canonical-demo-actor-origin';
  return {record, originKey, live: {configuration: {implementation_group: 1}, current: {...record},
    visualOrigin: {key: originKey, selected: true, configured: true, framework: {key: 'cis-ig1', version: '8.1'},
      programId: 'demo_brawndo:cis-ig1'}}};
}

test('native deep-record appearance requires matching record, program and originating context', () => {
  const {record, live, originKey} = recordContext();
  expect(cisVisualRecordMatches(record, live, originKey)).toBe(true);
  expect(cisVisualRecordMatches(null, live, originKey)).toBe(false);
  expect(cisVisualRecordMatches(record, null, originKey)).toBe(false);
  expect(cisVisualRecordMatches(record, live)).toBe(false);
  expect(cisVisualRecordMatches(record, live, null)).toBe(false);
  expect(cisVisualRecordMatches(record, live, '')).toBe(false);
  expect(cisVisualRecordMatches(record, live, 'changed-actor-role-or-mode-origin')).toBe(false);
});

test.each([
  ['foreign requested client', (record) => { record.client_id = 'demo_dunder'; }],
  ['foreign requested framework', (record) => { record.framework_key = 'soc-2'; }],
  ['foreign requested version', (record) => { record.framework_version = '8.0'; }],
  ['foreign loaded client', (_record, live) => { live.current.client_id = 'demo_dunder'; }],
  ['foreign loaded framework', (_record, live) => { live.current.framework_key = 'soc-2'; }],
  ['foreign loaded version', (_record, live) => { live.current.framework_version = '8.0'; }],
  ['different current record', (_record, live) => { live.current.framework_assessment_id = 'other-native-record'; }],
  ['missing current record', (_record, live) => { live.current = null; }],
  ['missing configuration', (_record, live) => { live.configuration = null; }],
  ['higher implementation group', (_record, live) => { live.configuration.implementation_group = 2; }],
  ['missing both record ids', (record, live) => { delete record.framework_assessment_id; delete live.current.framework_assessment_id; }],
  ['invalid both record id types', (record, live) => { record.framework_assessment_id = live.current.framework_assessment_id = 7; }],
  ['foreign safeguard catalog identity', (record, live) => { record.definition_id = live.current.definition_id = '99.9'; }],
  ['conflicting safeguard identity', (_record, live) => { live.current.definition_id = '1.2'; }],
  ['missing loaded visual origin', (_record, live) => { delete live.visualOrigin; }],
  ['missing loaded visual origin key', (_record, live) => { delete live.visualOrigin.key; }],
  ['changed loaded visual origin key', (_record, live) => { live.visualOrigin.key = 'earlier-actor-role-or-mode-origin'; }],
  ['unselected loaded program', (_record, live) => { live.visualOrigin.selected = false; }],
  ['truthy unvalidated selection', (_record, live) => { live.visualOrigin.selected = 'true'; }],
  ['unconfigured loaded program', (_record, live) => { live.visualOrigin.configured = false; }],
  ['truthy unvalidated configuration', (_record, live) => { live.visualOrigin.configured = 'true'; }],
  ['missing loaded framework', (_record, live) => { live.visualOrigin.framework = null; }],
  ['foreign loaded program framework', (_record, live) => { live.visualOrigin.framework.key = 'soc-2'; }],
  ['foreign loaded program catalog version', (_record, live) => { live.visualOrigin.framework.version = '8.0'; }],
  ['foreign loaded program identity', (_record, live) => { live.visualOrigin.programId = 'demo_dunder:cis-ig1'; }],
  ['missing loaded program identity', (_record, live) => { delete live.visualOrigin.programId; }],
])('deep-record guard rejects %s', (_name, mutate) => {
  const {record, live, originKey} = recordContext(); mutate(record, live);
  expect(cisVisualRecordMatches(record, live, originKey)).toBe(false);
});
