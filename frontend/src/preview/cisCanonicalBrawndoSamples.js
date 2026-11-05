const CID = 'demo_brawndo';
const POLICY = {
  data: 'policy-data-classification-handling-policy', configuration: 'policy-configuration-management-policy',
  access: 'policy-access-control-identity-management-policy', vulnerability: 'policy-vulnerability-patch-management-policy',
  logging: 'policy-information-security-policy', recovery: 'policy-backup-restoration-policy',
  awareness: 'policy-security-awareness-training-policy', provider: 'policy-vendor-third-party-risk-management-policy',
  incident: 'policy-incident-response-policy'
};

// Release identities checked against official tables on 2026-11-02; this is a retained point sample, not a live latest-version claim.
// https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information
// https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel
// https://learn.microsoft.com/en-us/officeupdates/update-history-microsoft365-apps-by-date
const VERSION_SAMPLE_DAY = '2026-10-12';
const VERSION_PROFILE = Object.freeze({windows: 'Windows 11 Pro 25H2; build 26200.9457', edge: '155.0.4283.45',
  office: 'Current Channel 2609; build 20430.20146', server: 'Windows Server 2022 Standard; 21H2; build family 20348'});

const pad = value => String(value).padStart(2, '0');
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

function inventory(observed_at) {
  const rows = [];
  for (const [type, count, scope, subnet, macGroup, custodian] of [
    ['WIN', 55, 'Office', '192.0.2.', '01', 'Office team'],
    ['KIOSK', 10, 'Production', '198.51.100.', '02', 'Shift lead'],
    ['NET', 12, 'Site/warehouse', '203.0.113.', '03', 'IT lead'],
    ['VM', 2, 'Server', '192.0.2.', '04', 'ERP owner']
  ]) for (let index = 1; index <= count; index++) {
    const entity = 'BW-' + type + '-' + pad(index);
    const incomplete = type === 'KIOSK' && index <= 6;
    rows.push({observed_at, safeguards: '1.1' + (['WIN', 'KIOSK'].includes(type) ? '|3.6' : ''), scope,
      entity, source_file: 'assets.csv', asset_type: type,
      network_address: subnet + (type === 'VM' ? index + 100 : index),
      hardware_address: incomplete ? '' : '02:BA:00:' + macGroup + ':00:' + index.toString(16).padStart(2, '0').toUpperCase(),
      asset_owner: incomplete ? '' : custodian, authorized: 'yes',
      encryption: ['WIN', 'KIOSK'].includes(type) ? 'BitLocker:on' : 'not sampled',
      observed_value: 'Purchase and provider list match', result: incomplete ? 'partial' : 'recorded',
      exceptions: incomplete ? 'MAC and custodian missing' : '', owner_role: 'IT lead'});
  }
  return rows;
}

// Pure source authoring: no account, record, file-storage or live product operation occurs here.
export function brawndoOperatingSamples(dates) {
  if (!dates || !validDay(dates.anchor?.slice(0, 10)) || typeof dates.day !== 'function')
    throw new Error('Brawndo observations require the frozen scenario date model.');
  const observed = dates.day(-21);
  if (!validDay(observed) || observed < VERSION_SAMPLE_DAY || !validDay(dates.day(-10)) || !validDay(dates.day(-6)))
    throw new Error('Brawndo version observations require an anchor on or after 2026-11-02.');
  const row = (ids, entity, source_file, observed_value, {scope = 'Brawndo IT', result = 'observed', exceptions = '', owner_role = 'IT lead', offset = -21, day} = {}) =>
    ({observed_at: day || dates.day(offset), safeguards: ids.join('|'), scope, entity, source_file, observed_value, result, exceptions, owner_role});
  const artifact = (key, title, rows, policy_keys = []) => ({key, title: 'DEMO - SYNTHETIC: ' + title, rows,
    assessment_ids: [...new Set(rows.flatMap(item => item.safeguards.split('|')))].map(id => 'fw_' + CID + '_assessment_' + id), policy_keys});

  const software = [
    row(['2.1', '2.2', '7.3'], 'BW-WIN-01 / BW-KIOSK-07', 'software-register.csv',
      VERSION_PROFILE.windows + '; publisher=Microsoft; purpose=office/packaging; installed=65/65; entitlement=65 OEM Pro licenses; authorized=yes',
      {day: VERSION_SAMPLE_DAY, result: 'supported release and installed build recorded', exceptions: '25H2 Pro support ends 2027-10-12. A retained sample does not prove later patch deployment.'}),
    row(['2.1', '2.2', '7.3'], 'BW-VM-01 / BW-VM-02', 'software-register.csv',
      VERSION_PROFILE.server + '; publisher=Microsoft; purpose=ERP/production; installed=2 VMs; entitlement=provider-hosted Standard virtualization rights register',
      {day: VERSION_SAMPLE_DAY, result: 'supported server family recorded', exceptions: 'Client Intune rings do not patch these servers; provider server jobs are sampled separately.'}),
    row(['2.1', '2.2', '7.4', '9.1'], 'BW-WIN-01 / office application group', 'software-register.csv',
      'Microsoft 365 Apps for business / Outlook; ' + VERSION_PROFILE.office + '; publisher=Microsoft; purpose=office work; 55 installs; 65 Business Premium user entitlements; first-use register populated',
      {day: VERSION_SAMPLE_DAY, result: 'supported Current Channel build at the dated observation', exceptions: 'The October 6 build is a historical installed observation, not the latest version at a later assessment date.'}),
    row(['2.1', '2.2', '7.4', '9.1'], 'BW-WIN-01 / BW-KIOSK-07', 'software-register.csv',
      'Microsoft Edge Stable ' + VERSION_PROFILE.edge + '; publisher=Microsoft; purpose=business web/label portal; 65 installs; vendor no-cost license; automatic updates enabled',
      {day: VERSION_SAMPLE_DAY, result: 'October 8 release observed installed on October 12', exceptions: 'Later Edge updates require later installed-version evidence; this sample does not prove them.'}),
    row(['2.1', '2.2', '7.4'], 'BW-KIOSK-07 / label application group', 'software-register.csv',
      'Brawndo Label Client 4.8.2; publisher=fictional internal product team; purpose=retailer pallet labels; 10 installs/10 internal entitlements; package label-4.8.2.msi; first-use register populated',
      {result: '10/10 package receipts match installed 4.8.2', exceptions: 'The internal product, version and support record are fictional; no external vendor support is implied.'}),
    row(['2.1', '2.2', '7.4'], 'BW-VM-01 / ERP client group', 'software-register.csv',
      'Brawndo ERP Connector 6.2.4; publisher=fictional internal product team; purpose=order/dispatch synchronization; 12 named seats/12 entitlements; installed package ERP-6.2.4',
      {result: '12/12 authorized seats; server deployment receipt matches', exceptions: 'Fictional internal application support decision; no claim about a real ERP product.'}),
    row(['2.2'], 'RETIRED-LABEL-UTILITY', 'support-exceptions.csv',
      'Legacy label utility 2.0: current installs=0; prior exception EX-LABEL-02 retired; replacement package=label-4.8.2.msi; retained retirement receipt=RET-LABEL-02',
      {result: 'No current unsupported-label installation in the compared export'}),
    row(['2.3'], 'BW-WIN-18', 'software-removal.csv',
      'Case SW-TOOLBAR-01; title=Unapproved Sales Toolbar; removal exit code=0; post-removal installed-title matches=0; sales browser launch succeeds',
      {result: 'Removal and clean installed-title sample recorded', exceptions: 'The Action result is not an independent Finding validation.'}),
    row(['7.3'], 'Windows client update rings', 'client-update-results.csv',
      'Assigned=65; installed September baseline/OOB=65; pending restart=0; failed=0; pilot group=3; production group=62; installation receipts match device labels',
      {day: VERSION_SAMPLE_DAY, result: '65/65 automated client installation receipts at this sample date', exceptions: 'An observed monthly job is not the missing vulnerability-management process.'}),
    row(['7.3'], 'BW-VM-01 / BW-VM-02', 'server-patch-jobs.csv',
      'Jobs PATCH-ERP-09 and PATCH-PROD-09; automated=true; eligible servers=2; succeeded=2; failed=0; service checks ERP order-read=pass and production queue-read=pass',
      {result: 'Both provider server jobs have installation and post-restart service results'}),
    row(['7.4'], 'Office / kiosk application groups', 'application-jobs.csv',
      'Office automatic-update receipts=55/55; Edge receipts=65/65; Label Client package receipts=10/10; ERP Connector receipts=12/12; unhandled deployment failures=0',
      {result: 'Application-specific deployment receipts reconciled separately from OS jobs'}),
    row(['12.1'], 'BW-NET-01 through BW-NET-12', 'network-support-check.csv',
      'Support comparisons=12; hardware lifecycle exceptions=0; devices on provider approved stable release=12; replacement unit BW-NET-12 replaces RET-NET-01; post-change uplink loss=0/100 packets',
      {result: 'Active device support and approved-release comparison recorded', exceptions: 'The exact firmware versions are not supplied in this bounded sample; a generic Meraki brand does not prove release currency.', owner_role: 'Managed service provider lead'})
  ];

  const identity = [
    row(['3.2'], 'Sensitive-data locations', 'data-locations.csv',
      'PAYROLL=/sites/Finance/payroll; owner=Finance; Confidential. FORMULA=/production/recipes; owner=Production; Confidential. DELIVERY=/erp/dispatch; owner=Sales; Internal. LABEL-TEMP=BW-KIOSK-07/spool; owner=Operations; Internal.',
      {scope: 'Office, ERP and temporary production files', result: 'Four sampled locations trace to responsible teams', owner_role: 'Finance and operations lead'}),
    row(['3.3'], 'Payroll and formula access tests', 'access-results.csv',
      'finance-01 -> payroll=ALLOW; sales-01 -> payroll=DENY; operator-07 -> assigned recipe=ALLOW; sales-01 -> recipe=DENY; kiosk-operator -> ERP bank-change=DENY',
      {result: 'Five positive/negative checks match business permissions'}),
    row(['3.4'], 'Delivery archive and kiosk print files', 'retention-execution.csv',
      'Rule RET-DELIVERY=2 years; expired delivery export rows selected=18, deleted=18. Rule RET-LABEL=one shift; BW-KIOSK-07 expired files selected=7, deleted=7. Finance hold FIN-H01 retained 1 older record.',
      {result: 'Selected/deleted counts and one justified hold recorded', owner_role: 'Finance and operations lead'}),
    row(['3.5'], 'Retired drive RET-KIOSK-01 / confidential paper batch P-18', 'disposal-receipts.csv',
      'RET-KIOSK-01 failed drive: custody handovers=2; destruction receipt DEST-18; serial suffix demo-018. Paper P-18: sealed bins=1; transfer receipt PAPER-18; completed destruction acknowledgment present.',
      {result: 'Two media-specific completed custody/disposal trails', exceptions: 'Retired media is not an additional current asset.', owner_role: 'Finance and operations lead'}),
    row(['3.6'], 'BW-WIN-01 / BW-KIOSK-07', 'bitlocker-status.csv',
      'Both C: volumes: ProtectionStatus=On; VolumeStatus=FullyEncrypted; encryption=XTS-AES; fleet C: protection reports=65/65. Recovery-key custody: restricted support vault; authorized support retrieval metadata=1; sales access=DENY.',
      {result: 'Device/volume results and recovery-custody checks recorded', exceptions: 'No recovery-key values, passwords or vault secrets are included.'}),
    row(['5.1'], 'Quarterly account authorization', 'account-reconciliation.csv',
      'Active identities=72: employees65, dedicated administrators3, services4; authorized=72; missing owner/purpose/start-date fields=0; HR joiner/leaver differences=0; ERP and cloud exports both included.',
      {result: '72 active rows reconciled to HR and service-owner approvals', owner_role: 'HR coordinator'}),
    row(['5.2'], 'Cloud/ERP password rule and service vault metadata', 'credential-settings.csv',
      'Minimum length=16; regular/admin secrets distinct; service secrets independently generated=4/4; common kiosk password accounts=0; shared vault membership=3 named support administrators.',
      {result: 'Rules and custody metadata recorded without credential content'}),
    row(['5.3'], 'seasonal-operator-old', 'inactive-account-job.csv',
      'Last activity=' + dates.day(-70) + '; disabled=' + dates.day(-25) + '; elapsed inactive days=45; supported account state=disabled; subsequent sign-in=DENY',
      {result: '45-day threshold execution and denied sign-in recorded'}),
    row(['5.4'], 'it-daily-01 / it-admin-01', 'privileged-separation.csv',
      'it-daily-01 groups=OfficeUsers, no local Administrators; it-admin-01 groups=DeviceSupport; daily account attempted software install=DENY; privileged account email mailbox=none.',
      {result: 'Separate everyday and privileged identities have different effective access'}),
    row(['6.1'], 'warehouse-to-sales transfer MOVE-14', 'access-requests.csv',
      'Manager approval 09:05; SalesDispatch group added 09:20; ERP role=DeliveryRead; bank-detail edit check=DENY; prior ProductionOperator role removed 09:21.',
      {result: 'Provisioning follows approval and matches the requested business duties', owner_role: 'Department manager'}),
    row(['6.2'], 'temporary-driver-end LEAVE-08', 'revocation-results.csv',
      'Authorized end 16:00; cloud sign-in disabled16:00; ERP access removed16:00; VPN sessions revoked16:01; test sign-in16:05=DENY; retained audit references ID-08, ERP-08, VPN-08.',
      {result: 'Immediate event-driven revocation and denial sample recorded', owner_role: 'HR coordinator'}),
    row(['6.3'], 'Cloud MFA / supplier portal', 'mfa-enforcement.csv',
      'Cloud rule BP-Cloud-MFA: enabled; assigned employee65/admin3; excluded users=0; legacy password-only login=BLOCKED. Supplier portal purchase-01: second factor challenged, password-only attempt=DENY.',
      {result: 'Policy assignment and actual challenged/denied access samples recorded'}),
    row(['6.4'], 'Remote-access gateway / support-01', 'vpn-access-results.csv',
      'Named account + second factor: connection=ALLOW; same account without factor=DENY; direct external RDP to BW-VM-01=DENY; session scope=approved support subnet.',
      {result: 'Remote-network MFA and blocked bypass demonstrated in the fictional result'}),
    row(['6.5'], 'Admin gateway / cloud administrator', 'admin-mfa-results.csv',
      'Cloud admin factor challenge=required; device-admin gateway factor challenge=required; ordinary-user subnet -> device management=DENY; authorized privileged session -> HTTPS management=ALLOW.',
      {result: 'Both cloud and device administration use enforced privileged access paths'})
  ];

  const endpoint = [
    ...[-42, -35, -28, -21].map(offset => row(['1.2'], 'Weekly connection disposition / VISITOR-14', 'weekly-connections.csv',
      'Current approved assets=79; unknown visitor laptop=1; production access denied; visitor moved to guest network; unresolved unauthorized production connections=0; kiosk attribute exceptions tracked separately.',
      {offset, result: 'Connection observation and completed disposition recorded'})),
    row(['4.3'], 'BW-WIN-01 / BW-KIOSK-07', 'session-lock-results.csv',
      'Office policy=600s, observed lock=600s; kiosk policy=300s, observed lock=300s; resume without credentials=DENY; production application service state after lock=Running.',
      {result: 'Measured locking and continued service state recorded'}),
    row(['4.4'], 'BW-VM-01 / BW-VM-02', 'server-firewall-results.csv',
      'Host firewall enabled=2/2; unsolicited inbound default=Block; approved application source -> ERP service=ALLOW; guest subnet -> ERP service=DENY; admin ingress restricted to management gateway.',
      {result: 'Server host profile, explicit rule and negative connection results recorded'}),
    row(['4.5'], 'Office / kiosk firewall profiles', 'endpoint-firewall-results.csv',
      'Reports received=65; disabled host firewalls=0; Domain/Private/Public profiles enabled=65/65; BW-KIOSK-07 inbound RDP from warehouse user VLAN=DENY.',
      {result: 'Fleet host-profile coverage plus a kiosk negative-access observation'}),
    row(['4.6'], 'BW-NET-03 administration', 'management-protocol-results.csv',
      'Named provider session through admin gateway -> HTTPS443=ALLOW and SSH22=ALLOW; Telnet23=DENY; HTTP80 management=DENY; approved change CH-NET-16 has operator and settings backup.',
      {result: 'Encrypted management and disabled insecure protocol results recorded'}),
    row(['4.7'], 'BW-KIOSK-07 / BW-NET-03', 'default-account-check.csv',
      'Windows Guest=disabled; unused built-in administrator=disabled; network factory admin=disabled; named support identity present; vendor-required service identity purpose/custodian fields populated.',
      {result: 'Default-account state and controlled necessary-account metadata recorded'}),
    row(['8.2'], 'Windows / ERP / network source trace', 'log-collection-results.csv',
      'BW-WIN-01 event4625 source offset seq441 -> collector seq927; ERP bank-change audit seq211 -> archive seq211; BW-NET-03 admin-login seq72 -> receiver seq72; missing sources=0/3 sampled.',
      {result: 'Three traceable source/collector event pairs recorded'}),
    row(['8.3'], 'LOG-STORE-01', 'log-capacity-results.csv',
      'Allocated=512GiB; used=109.6GiB; free=402.4GiB; measured ingestion=1.1GiB/day; company retention=90days; alert threshold free<102.4GiB; controlled threshold test notification=received by provider.',
      {result: 'Capacity arithmetic and notification result recorded', exceptions: 'The 90-day retention choice is organizational context, not an extra IG1 retention minimum.'}),
    // Official test domain and REFUSED behavior: https://developers.cloudflare.com/cloudflare-one/traffic-controls/dns-policies/test-dns-filtering/
    row(['9.2'], 'BW-KIOSK-07 site DNS / BW-WIN-02 roaming DNS', 'dns-policy-results.csv',
      'Gateway policy BP-MALWARE: Block; query malware.testcategory.com -> REFUSED on both paths; allowed business-domain query -> NOERROR on both; managed client DNS mode=Gateway; bypass resolver check=blocked.',
      {result: 'Two DNS paths show a blocked official test domain and an allowed lookup', exceptions: 'DNS filtering only; HTTP/full-traffic inspection is not asserted.'}),
    row(['10.1'], 'BW-WIN-01 / BW-KIOSK-07 / BW-VM-01', 'antivirus-health.csv',
      'Engine reports=67/67; real-time protection active=67; disabled engines=0; harmless test case AV-T01 on BW-KIOSK-07: detection=EICAR test, action=quarantine, active threats afterward=0, support acknowledgment=AV-ACK-01.',
      {result: 'Fleet health and an actual fictional detection/quarantine response recorded', exceptions: 'The test payload itself is not included or executed.'}),
    row(['10.2'], 'Antimalware update group', 'signature-update-results.csv',
      'Automatic intelligence updates=true; reporting agents=67; maximum intelligence age=6h; BW-KIOSK-07 prior update error cleared by retry; retry exit=0; post-retry intelligence age=1h.',
      {result: 'Automatic settings, measured age and recovered-update result recorded'}),
    row(['10.3'], 'BW-WIN-01 / BW-KIOSK-07', 'removable-media-results.csv',
      'AutoRun=disabled; AutoPlay=disabled; controlled USB insertion: launched processes=0 on both devices; approved manual label import launched by operator=1; imported label count=20.',
      {result: 'Disabled automatic execution with a separate authorized business import recorded'})
  ];

  const recovery = [
    row(['11.1'], 'Recovery runbook RCV-2.0 sections 2-5', 'recovery-runbook-extract.csv',
      'Priority1 ERP/dispatch; priority2 production schedule/formulas; priority3 office archives. Targets chosen by company: ERP4h/dispatch8h/office48h. Scope=both VMs+workspace; operator=provider; internal authorizer=Operations; key custody=restricted vault.',
      {scope: 'ERP, dispatch, formulas and office records', result: 'Actual scoped recovery order, responsible roles and protection instructions recorded', owner_role: 'Operations lead'}),
    ...[-35, -28, -21].map(offset => row(['11.2'], 'ERP / production / workspace backup jobs', 'backup-job-results.csv',
      'Automated jobs: ERP54.2GiB/night=success; Production8.5GiB/night=success; Formula0.4GiB/day=success; M365Business20.0GiB/day=success; exported data files nonzero; last job manifest counts ERP8/Production12/Formula18/Workspace43.',
      {offset, result: 'Four nonzero automated dataset job results recorded', owner_role: 'Managed service provider lead'})),
    row(['11.2'], 'ERP backup failure and rerun BK-ERP-17', 'backup-retry-results.csv',
      'Night job result=failed at01:20; provider alert acknowledged01:29; credential-reference configuration corrected without exposing secret; rerun04:10=success; dispatch dependency check06:00=available.',
      {result: 'Failed job, alert response and successful rerun form a complete recorded case', owner_role: 'Managed service provider lead'}),
    row(['11.3'], 'Known recovery repositories', 'backup-protection-results.csv',
      'Encryption at rest=enabled; encrypted transport=enabled; named recovery administrators=2; office user read attempt=DENY; authorized recovery retrieval metadata=present; key access logs restricted.',
      {result: 'Encryption/access/custody observations recorded', exceptions: 'These values do not establish recovery-copy isolation; that assessment remains planned.', owner_role: 'Operations lead'})
  ];

  const workforce = [
    row(['14.1'], 'Core awareness register CORE-2026.1', 'awareness-register.csv',
      'Active staff=65; induction records=65; annual core attendance=65; late attendees followed up=2 and completed=2; content revision authorized; new starter SHIFT-65 induction completed before independent kiosk use.',
      {scope: 'Office, production and warehouse staff', result: 'Roster counts and a new-starter delivery observation recorded', exceptions: 'Core attendance does not establish the unassessed insecure-network topic.', owner_role: 'HR coordinator'}),
    row(['14.2'], 'PURCHASE-01 / social-engineering response', 'awareness-responses.csv',
      'Prompt: supplier email changes bank account under delivery pressure. Recorded answer: do not use reply details; call established supplier number; report message. Instructor rubric: identified impersonation and verified independently.',
      {result: 'Concrete scenario response met the recorded recognition criteria', owner_role: 'HR coordinator'}),
    row(['14.3'], 'SHIFT-07 / authentication response', 'awareness-responses.csv',
      'Prompt: unexpected MFA approval followed by shift handover. Recorded answer: deny unsolicited prompt, notify IT, sign out, next operator signs in individually; never share password/session.',
      {result: 'Recorded answer addresses MFA pressure and named-session handover', owner_role: 'HR coordinator'}),
    row(['14.4'], 'DISPATCH-02 / handling response', 'awareness-responses.csv',
      'Prompt: payroll attachment and recipe printout left at shift desk. Recorded answer: restrict payroll to Finance, correct recipient, lock kiosk, secure printout, use approved archive and locked disposal bin.',
      {result: 'Recorded storage/transfer/archive/disposal and clear-desk response', owner_role: 'HR coordinator'}),
    row(['14.5'], 'SALES-03 / accidental disclosure response', 'awareness-responses.csv',
      'Prompt: delivery sheet shared to a broad link and wrong autocomplete recipient. Recorded answer: revoke share, notify IT/owner, record affected information and recipients, request containment without concealing the error.',
      {result: 'Actual response identifies exposure cause and immediate containment/reporting', owner_role: 'HR coordinator'}),
    row(['14.6'], 'SHIFT-04 / incident recognition response', 'awareness-responses.csv',
      'Prompt: unusual packaging-screen ransom notice. Recorded answer: stop interaction, call published incident coordinator/backup, provide device/location/time/symptom, preserve observations rather than trying self-repair.',
      {result: 'Actual response recognizes and reports a potential incident', owner_role: 'HR coordinator'}),
    row(['14.7'], 'SHIFT-08 / missing update response', 'awareness-responses.csv',
      'Prompt: kiosk repeats restart-required and protection warning. Recorded answer: notify service desk with kiosk label and warning; agree maintenance handover with shift lead; do not disable update/protection agent.',
      {result: 'Actual response reports an automated-control failure through the support path', owner_role: 'HR coordinator'}),
    row(['17.1'], 'Incident personnel roster IR-ROLES-1.0', 'incident-roles.csv',
      'Primary coordinator=Operations lead; backup=IT lead; technical investigator=Electrolyte Managed IT; internal provider oversight=Operations lead; both internal roles acknowledged responsibilities.',
      {result: 'Primary, backup and retained internal oversight recorded', owner_role: 'Operations lead'}),
    row(['17.2'], 'Incident contact verification CONTACT-04', 'incident-contacts.csv',
      'Primary +1-202-555-0101; backup +1-202-555-0102; MSP +1-202-555-0103; insurer +1-202-555-0104. Controlled contact checks reached correct fictional role=4/4; offline contact-sheet copy found at warehouse desk.',
      {result: 'Four role-contact checks and an offline-access observation recorded', exceptions: 'Reserved fictional telephone numbers; contact verification is not an incident-response exercise.', owner_role: 'Operations lead'}),
    row(['17.3'], 'Workforce reporting instruction IR-REPORT-1.0', 'incident-reporting-result.csv',
      'Warehouse poster and intranet versions both1.0. Sample report: deviceBW-KIOSK-07, line2, observed09:14, suspicious screen. Reporting route=phone to primary/backup immediately; sample received09:18 with all four minimum fields.',
      {result: 'Published instructions and a usable completed reporting example recorded', exceptions: 'This illustrates IG1 reporting; no IG2 annual exercise is represented.', owner_role: 'Operations lead'})
  ];

  const governance = [
    row(['3.1'], 'Data process approved1.0 / production appendix2.1-draft', 'controlled-document-extract.csv',
      'Approved sections: Payroll owner=Finance, sensitivity=Confidential, handling=Finance-only site, retention=7years, disposal=controlled media method. Production appendix: temporary-print handoff owner field blank; handling instructions draft.',
      {result: 'Partial documented scope; production appendix is not approved', exceptions: 'Working access/retention controls do not complete the missing process content.', owner_role: 'GRC manager'}),
    row(['4.1'], 'Endpoint/server configuration process search', 'document-index-results.csv',
      'Controlled index search across endpoint/server process paths: maintained general process documents=0; working endpoint profiles=3; approved network-only runbook=1.0; general extension=draft.',
      {result: 'Known missing general configuration process', exceptions: 'Existing profiles are inputs; they are not a maintained configuration lifecycle.'}),
    row(['4.2'], 'Network Device Configuration Runbook1.0 / CH-NET-16', 'network-runbook-extract.csv',
      'Sections: named admin gateway, HTTPS/SSH only, pre-change settings backup, sponsor approval, post-change uplink check, annual/change maintenance. CH-NET-16: approval09:00, backup09:10, deployment09:30, uplink100/100 replies.',
      {result: 'Narrow approved process and completed network change have actual fields', owner_role: 'Managed service provider lead'}),
    row(['7.1'], 'Vulnerability-management process search', 'document-index-results.csv',
      'Maintained full-lifecycle procedure found=0; vendor advisory feed subscription=present; patch queue=present; remediation worksheet1.2=present; documented asset-wide intake/triage/exception lifecycle=absent.',
      {result: 'Known missing documented vulnerability-management process', exceptions: 'Neither patch receipts nor authenticated scans are claimed to satisfy 7.1; IG2 scanning is not imposed.'}),
    row(['7.2'], 'Remediation procedure1.2 / monthly cycle', 'remediation-cycle-results.csv',
      'Risk rubric: payroll/ERP exposure priority high; bounded label fault priority medium. Two production reprioritization entries lack decisions. Scheduled review due=' + dates.day(-7) + '; completion record=absent at observation ' + dates.day(-6) + '.',
      {offset: -6, result: 'Partial process with an actually missed monthly review', exceptions: 'Observed after the missed cycle; a future planned meeting does not complete the review.'}),
    row(['8.1'], 'Logging process LOG-PROC-2.0', 'logging-process-extract.csv',
      'Windows4624/4625 -> event collector; ERP financial-change audit -> restricted export; network admin events -> log receiver. Company retention90days; collection owner=provider; daily failure/alert triage; incident escalation=IT lead; annual/change review recorded.',
      {result: 'Actual source, collection, review, retention and accountability instructions recorded', exceptions: 'The organization-selected daily handling is not asserted as an extra IG1 manual Review mandate.'}),
    row(['15.1'], 'Provider inventory / aggregate annual reconciliation', 'provider-inventory-results.csv',
      'Relationships=15; active14/inactive1; classification populated15/15; enterprise contact populated15/15; procurement services matched15/15. Aggregate annual review due=' + dates.day(-12) + '; signed current reconciliation=absent at observation ' + dates.day(-10) + '.',
      {offset: -10, result: 'Inventory exists; aggregate annual maintenance is overdue', exceptions: 'Individual supplier assurance and contract work do not sign off the aggregate inventory.', owner_role: 'Procurement lead'})
  ];

  return [
    artifact('inventory', '79-asset register and encryption observations', inventory(observed)),
    artifact('software', 'Software, support and deployment observations', software),
    artifact('identity', 'Identity, data access and protection observations', identity, [POLICY.data, POLICY.access]),
    artifact('endpoint', 'Endpoint, DNS and logging observations', endpoint, [POLICY.logging]),
    artifact('recovery', 'Backup execution and protection observations', recovery, [POLICY.recovery]),
    artifact('workforce', 'Workforce learning and incident-reporting observations', workforce, [POLICY.awareness, POLICY.incident]),
    artifact('governance', 'Documented processes and unresolved maintenance observations', governance,
      [POLICY.data, POLICY.configuration, POLICY.vulnerability, POLICY.logging, POLICY.provider])
  ];
}
