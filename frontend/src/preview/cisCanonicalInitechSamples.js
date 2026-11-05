import {INITECH_SCENARIO_PROFILE} from './cisCanonicalInitechContent';

const CID = 'demo_initech';
const SCOPE = 'Fictional Initech invoicing, settlement-reference and support services';
const SAMIR = 'Samir Nagheenanajar — Infrastructure, identity and recovery lead';
const MICHAEL = 'Michael Bolton — Engineering lead';
const PETER = 'Peter Gibbons — Program coordinator / service owner';
const NINA = 'Nina — Workforce communications and awareness coordinator';
const TOM = 'Tom Smykowski — Vendor / business relationship owner';

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value+'T00:00:00.000Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === value;
}

// Pure fictional source rows, not uploaded files, native saves or independent
// verification. The later book builder owns packing and the combined file budget.
export function initechOperatingSamples(dates) {
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor || '')
    || !validDay(dates.anchor.slice(0,10)) || typeof dates.day !== 'function' || typeof dates.month !== 'function'
    || dates.day(0) !== dates.anchor.slice(0,10)) throw new Error('Initech samples require the frozen UTC scenario date model.');
  const origin = dates.month(-24), cutoff = dates.day(-2), observed = dates.day(-7);
  if (![origin, cutoff, observed, dates.month(-1)].every(validDay) || origin < '2024-06-25'
    || !(origin < observed && observed <= cutoff && cutoff < dates.day(0)))
    throw new Error('Initech sample dates must follow the v8.1 release and precede the assessment cutoff.');
  const row = (ids, entity, source_file, observed_value, {owner_role = SAMIR, scope = SCOPE,
    activity = 'manual operating activity', cadence_or_trigger = 'on use / relevant change', result = 'recorded fictional observation',
    exceptions = '', day = observed} = {}) => ({observed_at:day, safeguards:ids.join('|'), scope, entity, source_file,
    observed_value, result, exceptions, owner_role, activity, cadence_or_trigger,
    source_classification:activity === 'assessment plan only' ? 'fictional_assessment_plan'
      : activity === 'documented process excerpt' ? 'fictional_process_excerpt' : 'fictional_operating_sample',
    basis:activity === 'assessment plan only' ? 'Preparation only; no operating execution or implementation judgment.'
      : 'Explicit fictional CIS v8.1 scenario sample; not independent verification, a native save or an uploaded-file claim.'});
  const process = (ids, entity, value, options = {}) => row(ids, entity, 'process-excerpts.csv', value,
    {activity:'documented process excerpt', cadence_or_trigger:'annual and significant change', ...options});
  const artifact = (key, title, rows) => ({key, title:'DEMO - SYNTHETIC: '+title, rows,
    assessment_ids:[...new Set(rows.flatMap(item => item.safeguards.split('|')))].map(id => 'fw_'+CID+'_assessment_'+id)});
  const fleet = INITECH_SCENARIO_PROFILE.asset_scope;

  const inventory = [
    row(['1.1'], 'IN-LAP-001–132 / IN-PHN-01–08', 'asset-reconciliation.csv',
      'Managed laptops='+fleet.managed_laptops+'; managed phones='+fleet.managed_phones+'; enrollment rows match asset labels, serial/MAC, owner, department and connection authorization; laptop132/132 and phone8/8 ownership matches.',
      {day:dates.month(-1), cadence_or_trigger:'full inventory six-monthly; changes reconciled between reviews'}),
    row(['1.1'], 'IN-CLD-01–26 / IN-NET-01–12', 'asset-reconciliation.csv',
      'Cloud workloads='+fleet.cloud_workloads+'; network devices='+fleet.network_devices+'; allocated name/address and accountable service owner present26/26 and12/12; terminated workload TEMP-OLD is retained as retired, not counted current.',
      {day:dates.month(-1), cadence_or_trigger:'full inventory six-monthly'}),
    row(['1.1'], 'Office access / provider connection register', 'asset-reconciliation.csv',
      'Office access controller IN-DOOR-01, printer IN-PRINT-01 and regularly connected provider support device SUP-01 have separate authorized connection entries; facilities and provider extracts reconciled, not silently omitted from the laptop count.',
      {day:dates.month(-1), owner_role:'Milton Waddams — Asset / facilities liaison', cadence_or_trigger:'full inventory six-monthly',
        exceptions:'The four counted managed populations are not claimed to be the entire connected-asset denominator.'}),
    ...[-28,-21,-14,-7].map(offset => row(['1.2','1.4'], 'Weekly lease / unauthorized-asset disposition', 'weekly-address-reconciliation.csv',
      'Office DHCP, VPN allocation and cloud IPAM feeds=3/3 reconciled; lease IN-LAP-084 address change updates inventory; visitor VIS-09 has no authorization, production connection=DENY, guest-only disposition retained; unresolved unauthorized connections=0.',
      {day:dates.day(offset), cadence_or_trigger:'weekly'})),
    ...[-9,-8,-7].map(offset => row(['1.3'], 'Daily active discovery DISC-IN', 'discovery-executions.csv',
      'Authorized office/cloud ranges=4; completed=4; reachable managed endpoint/workload/network records=170; remote disconnected endpoints reconciled from enrollment rather than falsely reported scanned; new unknown devices=0; execution exit=0.',
      {day:dates.day(offset), activity:'automated operating job', cadence_or_trigger:'daily',
        exceptions:'An offline endpoint is not called an actively scanned target; its inventory entry remains in scope.'})),
    row(['2.1','2.4'], 'Endpoint / workload software discovery', 'software-inventory.csv',
      'Automatic agents report132 laptops and26 cloud workloads; phone software feed8/8; register stores publisher, title, first-use, purpose and owner. Initech Invoice Client4.6.2:132 installs/132 internal entitlements; Settlement Worker3.4.1:1 workload.',
      {activity:'automated inventory with manual reconciliation', cadence_or_trigger:'automatic collection; full licensed inventory six-monthly',
        exceptions:'Named internal products and versions are fictional; they make no claim about an external publisher release.'}),
    row(['2.2'], 'Monthly support comparison SUP-IN', 'software-support.csv',
      'Authorized product families=8; supported=8; expired unsupported installations=0; support-notice references reconciled8/8. Settlement Worker dependencies pass release-time support checks; separate library and recurring component-register gaps remain open.',
      {cadence_or_trigger:'monthly', exceptions:'A scoped fictional support comparison is not live verification of real publishers.'}),
    row(['2.3'], 'Unapproved export utility SW-REMOVE-03', 'software-removal.csv',
      'Monthly installed/approved delta identifies utility on IN-LAP-044; execution blocked, uninstall exit=0, rescan matches=0; user service check=pass; no blanket exception or approved-list expansion.',
      {cadence_or_trigger:'monthly'}),
    row(['2.5','2.6'], 'Release execution / worker library controls', 'execution-policy.csv',
      'Approved Invoice Client4.6.2 and signed production image admit=ALLOW; unapproved executable=DENY. Managed service unapproved library=DENY; Settlement Worker writable extension path loads test library=ALLOW, exception LIB-WORKER-01 remains.',
      {cadence_or_trigger:'reassess at least six-monthly', result:'partial library enforcement; application allowlisting operates',
        exceptions:'No denied worker-library retest or completed remediation is invented.'}),
    ...[-2,-1].map(month => row(['7.3','7.4'], 'Monthly OS / application deployment results', 'deployment-jobs.csv',
      'OS jobs:132 laptops+26 workloads assigned,158 succeeded,0 unresolved failures. Application jobs:Invoice Client132/132 and service packages26/26 installed; initial host retry1 succeeded after restart; OS and application receipts remain separate.',
      {day:dates.month(month), activity:'automated operating job', cadence_or_trigger:'at least monthly'})),
    row(['9.1'], 'Browser / email release-policy comparison', 'client-version-comparison.csv',
      'Managed browser/email clients:installed-versus-permitted release comparisons132/132 match retained publisher-target export; unauthorized client launch=DENY; update failures0; automatic update enabled132/132.',
      {cadence_or_trigger:'latest supported vendor releases; monitored updates',
        exceptions:'This scoped synthetic comparison omits real publisher version numbers and is not independent proof of real-world release currency.'})
  ];

  const dataConfiguration = [
    process(['3.1','3.7'], 'Data process approved2.0 / classification schedule',
      'Owners:invoice/settlement=Peter, personnel=workforce lead, support=service owner. Classes=Public/Internal/Confidential/Restricted; schedule defines minimum/maximum retention, holds and media-specific disposal. Approved2.0 remains separate from pending2.1 export appendix.', {owner_role:PETER}),
    row(['3.2'], 'Sensitive store register DATA-IN', 'data-store-register.csv',
      'INV-DB invoicing=Confidential/Peter; SETTLE-REF service=Restricted/Peter; NEW-EXPORT known store=Restricted/Peter; HR-DOC personnel=Restricted/workforce lead; SUPPORT-ATTACH=Confidential/service owner; backup locations cross-referenced.',
      {owner_role:PETER, cadence_or_trigger:'inventory at least annually; change intake'}),
    row(['3.3'], 'Support / engineering / service access checks', 'data-access-results.csv',
      'Support role -> assigned support case=ALLOW, personnel file=DENY; engineering -> synthetic test store=ALLOW, production settlement bulk read=DENY; approved service role -> settlement references=ALLOW; database grants trace to owner requests.'),
    row(['3.4'], 'Lifecycle jobs / minimum-retention hold', 'retention-execution.csv',
      'Organization-selected invoice minimum24months/maximum84months:premature deletion attempt1=BLOCKED; expired rows44 selected/44 deleted. Support maximum24months:18 selected/18 removed. Authorized holdH-01 protects2 older rows; hold owner and release condition recorded.',
      {owner_role:PETER, activity:'automated lifecycle job with hold review', cadence_or_trigger:'configured lifecycle execution',
        exceptions:'Durations are fictional organization choices, not CIS-mandated periods.'}),
    row(['3.5'], 'IN-LAP-OLD-07 / expired export EXP-11', 'disposal-results.csv',
      'Retirement custody2 handovers; authorized cryptographic erasure receiptERASE-07 and device post-check=blank. Expired exportEXP-11 deletion selected7/removed7; archive move alone not accepted. Paper batchP-04 has final destruction acknowledgment.',
      {owner_role:'Milton Waddams — Asset / facilities liaison'}),
    row(['3.6'], 'Laptop / phone encryption coverage', 'device-encryption.csv',
      'Managed laptops132/132 volumes encrypted/protection on; phones8/8 device encryption enforced; suspended devices0. Recovery custody restricted to named administrators; ordinary support-role recovery read=DENY; key values excluded.'),
    row(['3.8'], 'Settlement export change FLOW-NEW', 'data-flow-gap.csv',
      'Established invoice/support/provider diagrams present; NEW-EXPORT store and encrypted transfer known. Pending2.1 diagram recipient=missing, purpose=missing, return path=missing; Peter/Samir documentation handoff remains open.',
      {owner_role:PETER, cadence_or_trigger:'annual and significant change', result:'partial data-flow documentation',
        exceptions:'Known inventory, topology and encrypted transport do not complete the missing flow purpose/recipient detail.'}),
    row(['3.9'], 'Diagnostic removable media DIAG-02', 'media-encryption-gap.csv',
      'Permitted diagnostic export copied to driveDIAG-02; data encryption=absent; second synthetic workstation reads contents without authorized decryption. Automatic scanning and endpoint encryption operate separately; media remediation not performed.',
      {result:'not implemented: removable-data encryption', exceptions:'Fictional data only; no real files or unsafe payload included.'}),
    row(['3.10','3.11','3.12'], 'Sensitive service / storage boundaries', 'sensitive-data-boundaries.csv',
      'User/service/provider/backup test plaintext connections=DENY4/4; encrypted routes=ALLOW4/4. INV-DB and SETTLE-REF at-rest encryption=on; key admin restricted. Public-content role -> Restricted store=DENY; nonproduction data=synthetic only.'),
    process(['4.1','4.2'], 'Secure baseline processes CFG2.0 / NET2.0',
      'Endpoint/phone/server/application/office-device classes have provisioning, settings owner, deviation and change steps. Network process separately requires named encrypted administration, permitted services, logging and rollback configuration; annual/change review retained.'),
    row(['4.3','4.10'], 'IN-LAP-021 / IN-PHN-03 effective profiles', 'portable-device-results.csv',
      'Laptop idle lock600s,phone120s; ordinary user extension=DENY. Local failure lockout:laptop10 attempts,phone10; supported fleet profiles assigned132/132 and8/8. Inactivity and failed-authentication locks are separate measurements.'),
    row(['4.4','4.5'], 'Cloud server / remote endpoint host filtering', 'host-firewall-results.csv',
      'Supported workload firewalls26/26 enabled; endpoint profiles132/132 default drop unsolicited traffic. App role -> required database port=ALLOW; guest -> database=DENY; remote laptop unsolicited ingress=DENY; ordinary user disable=DENY.'),
    row(['4.6','4.7'], 'Named administration / provisioning defaults', 'management-default-results.csv',
      'Privileged gateway -> encrypted console=ALLOW; plaintext management=DENY; CH-31 owner/backup/rollback recorded. Unused factory/local defaults disabled; retained necessary service default restricted and independently credentialed; no shared password supplied.'),
    row(['4.8'], 'Production / endpoint role manifest', 'service-minimization.csv',
      'Server role manifest permits3 service listeners; sample/demo application removed,post-change installed matches0; unused remote-management service disabled. Endpoint package delta removes unnecessary trial plugin; permitted services match business roles.'),
    row(['4.9'], 'Network trusted-resolver reconciliation', 'resolver-settings.csv',
      'Device exports12/12 point to approved internal resolvers; cloud network resolver policy attached; arbitrary public/default resolver attempts=DENY; drift findings0; configuration references contain no public customer addresses.'),
    row(['4.11'], 'Disposable simulated lost-device case WIPE-QA', 'remote-wipe-exercise.csv',
      'Administrator role authorized; ordinary role command=DENY. Synthetic enrolled-device target QA-WIPE receives enterprise-data removal command,confirmed complete; approval/confirmation fields retained; production workforce devices not wiped.',
      {cadence_or_trigger:'loss, theft or end-of-engagement decision'})
  ];

  const identityEndpoint = [
    row(['5.1','5.5'], 'Quarterly account authorization / service metadata', 'account-reconciliation.csv',
      'Active accounts166=workforce148+dedicated admins6+services12; continuing authorization166/166 confirmed with custodian/department/start/stop fields. Richer service register10/12 purpose/review-date complete; BATCH-EXPORT and BATCH-REPORT both authorized but missing purpose/review metadata.',
      {cadence_or_trigger:'quarterly', result:'all-account authorization recorded; service-register metadata partial',
        exceptions:'Do not invent the two absent purpose or earlier register-review dates.'}),
    row(['5.2','5.4'], 'Ordinary / administrative / service separation', 'identity-settings.csv',
      'Workforce and6 administrator identities use distinct issuance references; services12/12 have target-specific generated secret references. Daily engineering role admin operation=DENY; dedicated admin role authorized operation=ALLOW; privileged mailbox absent; secret values excluded.'),
    row(['5.3'], 'Dormant identity OLD-SUPPORT', 'inactive-account-results.csv',
      'Last use='+dates.day(-80)+'; disable='+dates.day(-35)+'; inactivity45days; effective disabled state retained for attribution; synthetic sign-in after disable=DENY; failed disable queue0.',
      {cadence_or_trigger:'45-day inactivity threshold where supported'}),
    row(['5.6','6.7'], 'Directory joiner / group change SYNC-24', 'central-identity-results.csv',
      'Directory change -> support application,source repository and cloud role mapping synchronized3/3; old support privilege removed; resulting disallowed case access=DENY; new approved case access=ALLOW. Local service exceptions remain inventoried, not unmanaged workforce stores.'),
    process(['6.1','6.2'], 'Grant / immediate revocation procedure ACCESS2.0',
      'Hire/move request requires Peter/service-owner approval before Samir provisions. Effective termination/revocation event disables directory,revokes sessions and reconciles connected services immediately; failed removal escalates; disabled identities preserve audit attribution.'),
    row(['6.1','6.2'], 'MOVE-12 / LEAVE-09', 'access-lifecycle-results.csv',
      'MOVE-12 approval09:00,requested support role effective09:12,old finance role removed09:12. LEAVE-09 effective16:00,directory/app disable16:00,VPN sessions revoked16:00,test16:02=DENY; event/request references retained.',
      {cadence_or_trigger:'hire/role change; immediate termination/revocation'}),
    row(['6.3','6.4','6.5'], 'Application / network / privileged MFA', 'authentication-results.csv',
      'Exposed support and engineering applications:password-only=DENY,approved factors=ALLOW; remote network without factor=DENY; cloud and provider admin consoles without factor=DENY. Coverage inventory contains each route; remote VPN is not substituted for web-app MFA.'),
    row(['6.6'], 'Authentication / authorization inventory AUTH-IN', 'authentication-system-register.csv',
      'Directory authenticates workforce; application roles authorize cases; VPN/AAA controls network; cloud IAM controls workloads; provider console controls delegated admin. Five system classes include owner,hosting and decision responsibility; annual reconciliation5/5.',
      {cadence_or_trigger:'at least annual inventory review'}),
    row(['9.2','9.3'], 'Office / remote / server protective web paths', 'web-policy-results.csv',
      'Controlled harmless test names in reserved .test namespace:malicious-category lookup=BLOCKED onsite/remote; approved business lookup=ALLOW. URL policy denied synthetic prohibited path across office,remote and server egress; bypass resolver route=DENY.',
      {exceptions:'Fictional policy-test records, not a claim that a real public .test service was contacted.'}),
    row(['9.4','9.6'], 'Client add-ons / attachment restrictions', 'messaging-policy-results.csv',
      'Unauthorized browser extension and email plugin disabled2/2; approved set retained. Harmless prohibited executable attachment rejected before mailbox delivery; permitted text attachment delivered; file-type handling remains separate from anti-malware scanning.'),
    row(['9.5'], 'Enterprise fictional sending domains', 'mail-authentication-gap.csv',
      'initech.example and notify.initech.example:authorized SPF present,DKIM signing test=valid; DMARC TXT policy absent,DMARC verification absent,alignment deployment not completed. Sender inventory retained for planned rollout.',
      {result:'partial: SPF/DKIM present; DMARC not implemented', exceptions:'Reserved example domains; no DNS query or mail delivery performed.'}),
    row(['10.1','10.2','10.6'], 'Central protection fleet / update retry', 'protection-health.csv',
      'Laptop132+workload26 supported agents active158/158; mobile8/8 platform-equivalent protections enforced. Signature updates automatic,max reported age4h; one stale laptop retry exit0,post-retry age1h. Named central management roles reconcile policy/health and disconnected queue0.',
      {activity:'automated protection / centrally managed health'}),
    row(['10.3','10.4'], 'Removable media controlled attachment', 'media-protection-results.csv',
      'AutoRun=disabled,AutoPlay=disabled; harmless attached medium automatic launch count0; automatic protection scan triggered without user request,scan complete,no detection. Encryption absent on DIAG-02 remains a separate known failure.',
      {activity:'automated device protection', exceptions:'No malware, executable payload or actual customer file is included.'}),
    row(['10.5','10.7'], 'Supported exploit / behavior protections', 'exploit-behavior-results.csv',
      'Supported execution/memory protections enabled for laptop/server roles; baseline deviations0. Approved harmless behavior scenario HB-03 emits process-chain alert,central case records host and disposition; signatures alone not called behavior monitoring.',
      {exceptions:'Fictional configuration and harmless validation result; no attack code executed.'})
  ];

  const vulnerabilityLogging = [
    process(['7.1','7.2'], 'Vulnerability lifecycle / monthly remediation process',
      'Scope=endpoints,workloads,network,dependencies; discovery/advisory intake -> owner/triage -> risk-priority,target rationale,exception and retest. Annual/change7.1 documentation retained; monthly7.2 review records support exposure high versus internal low and unresolved owner follow-up.',
      {owner_role:MICHAEL, cadence_or_trigger:'7.1 annual/change;7.2 at least monthly'}),
    ...[-3,-1].map(month => row(['7.5'], 'Internal authenticated / unauthenticated scans', 'internal-scan-results.csv',
      'Inventoried reachable targets170; authenticated eligible endpoint/workload158/158 succeed; unauthenticated endpoint/workload/network170/170 examined. First credential failure1 retried successfully; finding references enter remediation queue; disconnected devices separately reconciled.',
      {day:dates.month(month), activity:'automated operating job', cadence_or_trigger:'at least quarterly; both scan perspectives'})),
    ...[-2,-1].map(month => row(['7.6','7.7'], 'External exposure / monthly corrective cycle', 'external-scan-remediation.csv',
      'Public exposure inventory6 endpoints,scanned6/6,failed targets0. Weakness VULN-24 prioritized by exposed service,configuration fix deployed,retest absent header finding=0; residual lower-priority work remains open with owner,not silently marked closed.',
      {day:dates.month(month), owner_role:MICHAEL, activity:'automated scan and manual remediation', cadence_or_trigger:'at least monthly',
        exceptions:'Monthly scans are not the qualified annual penetration test.'})),
    process(['8.1'], 'Audit process LOG2.0',
      'Identity,endpoint,application,database,network and provider event classes have collection destination,owner,review/failure route and retention. Samir examines logs weekly; urgent alerts handled between reviews; annual/change documentation review is not log examination.'),
    row(['8.2','8.5','8.9'], 'Source -> collector detailed event trace', 'audit-event-trace.csv',
      'IN-LAP-021 auth seq481 -> central481; invoice-change seq913 -> central913; network admin seq211 -> central211. Fields source,actor,date/time,src/dst and action populated; payload/secrets excluded; supported source delivery3/3,central access ordinary role=DENY.'),
    row(['8.3','8.10'], 'Central store / local buffers / oldest events', 'log-retention-capacity.csv',
      'Central1TiB allocated,358GiB used,666GiB free; ingest3GiB/day,configured retention120days; all sampled source buffers forward without loss. Retrieved retained event dated'+dates.day(-100)+'; earliest-delete guard90days; threshold test alert acknowledged.',
      {exceptions:'120days is organization-selected; the source minimum remains90days.'}),
    row(['8.4'], 'Endpoint / server / network time', 'time-sync-results.csv',
      'Effective sources TIME-A and TIME-B configured on supported endpoint/server/network roles; measured offsets18ms,22ms,11ms; disconnected source test uses alternate; drift alert routed; displayed local clock alone not accepted.'),
    row(['8.6','8.7','8.8'], 'Resolver / URL / harmless command audit', 'specialized-audit-events.csv',
      'Resolver query q511 from IN-LAP-021 -> collector511; managed gateway request r315 -> central315,query payload suppressed; harmless command inventory-status event cmd81 -> central81 with actor/parent/time. Supported/appropriate collection sources reconciled,not every encrypted payload claimed.'),
    ...[-28,-21,-14,-7].map(offset => row(['8.11'], 'Weekly performed audit-log examination', 'weekly-log-examination.csv',
      'Sources examined:identity,privileged changes,service access,endpoint alerts; anomalous disabled-account retries3 traced to stale scheduled job,job corrected,follow-up retries0; reviewer Samir records scope,case LOG-17 and disposition; no annual document meeting substituted.',
      {day:dates.day(offset), cadence_or_trigger:'at least weekly', result:'performed log examination with scoped disposition'}))
  ];

  const networkRecovery = [
    row(['12.1'], 'Network device support/version comparison', 'network-support-results.csv',
      'Active devices12/12 supported; effective-version identifiers reconciled to retained approved release register12/12,unsupported0; bridge device included. Update CH-NET-08 post-change connectivity100/100; monthly review result retained.',
      {cadence_or_trigger:'at least monthly', exceptions:'No unverified claim about the current release number of a real network product.'}),
    process(['12.2','12.4'], 'Topology NET2.0 / architecture change CH-BRIDGE',
      'Diagram includes workforce,production,management,provider and settlement bridge; approved least-privilege paths and redundant service routes trace to effective topology. Annual/change diagram maintained; missing export recipient/purpose remains a separate3.8 issue.'),
    row(['12.3','12.5','12.6','12.7'], 'Management / AAA / remote access trace', 'network-access-results.csv',
      'Named admin gateway -> HTTPS/SSH=ALLOW; insecure management/communication protocols=DENY. VPN authentication precedes enterprise route; unauthenticated access=DENY. Session NET-41 central authentication=pass,role authorization=NetworkRead,audit sequence retained.',
      {exceptions:'Secure network protocols have no broad operational-exception bypass in this sample.'}),
    row(['13.1','13.2'], 'Correlated alert / host sensor validation', 'host-alert-results.csv',
      'Identity repeated-denial event+host harmless behavior event -> correlated case ALERT-31 with host,actor,service/time; supported host sensors158/158 healthy,validation event reaches central case; analyst disposition recorded.',
      {exceptions:'Host and correlation observations do not establish unassessed network IDS coverage.'}),
    row(['13.4','13.5'], 'Segment filtering / remote-device posture', 'boundary-posture-results.csv',
      'Workforce -> settlement database=DENY; approved application service -> required database port=ALLOW; bridge unnecessary egress=DENY. Compliant remote endpoint=normal access; stale protection/update posture=restricted remediation only,even after valid user MFA.'),
    row(['13.6'], 'Central flow collector source reconciliation', 'flow-collection-gap.csv',
      'Network devices12:established source arrivals11,settlement bridge arrivals0; bridge supported export disabled. Ordinary bridge audit events and explicit filtering present; missing flow src/dst records cannot support its central review/alerting.',
      {result:'partial network-flow collection', exceptions:'No completed bridge export,arrival validation or network-IDS judgment is invented.'}),
    process(['11.1'], 'Recovery2.0 scoped priorities / protection',
      'Company targets:invoicing4h,settlement exchange8h,support24h; Peter authorizes priority,Samir operates. Scope covers26 workloads,enterprise documents and configuration; backup encryption/access and dependency ordering documented; quarterly restore execution remains unassessed.', {owner_role:PETER}),
    ...[-9,-8,-7].map(offset => row(['11.2'], 'Nightly service backup / weekly enterprise scope', 'backup-job-results.csv',
      'Automated nightly invoice84GiB,settlement18GiB,support36GiB datasets nonzero,succeeded3/3; workload configurations26/26 covered. Weekly endpoint/configuration scope132 laptops+8 phones+12 network configs covered152/152; excluded assets0; one prior failed object retried,final failed0.',
      {day:dates.day(offset), activity:'automated operating job', cadence_or_trigger:'nightly service data; other in-scope assets at least weekly',
        exceptions:'Backup execution is not a performed restore test or proof of business recovery.'})),
    row(['11.3','11.4'], 'Recovery data access / isolated copy', 'recovery-protection.csv',
      'Backup at-rest/transport encryption on; named recovery administrators2; ordinary support read=DENY. Isolated-copy inventory available; production admin cannot alter protected copy=DENY; independent custody transfer recorded; no restore performed by this observation.',
      {exceptions:'Maintained isolated copies do not establish quarterly restore-test execution or outcome.'})
  ];

  const workforceProviders = [
    row(['14.1'], 'Awareness roster / content maintenance', 'workforce-learning.csv',
      'Workforce148; hire induction148/148,current annual core completion148/148; late completions2 followed through; current content review covers changed settlement workflow. New starter SUPPORT-148 completed instruction before independent access.',
      {owner_role:NINA, cadence_or_trigger:'at hire and annually; content annual/change'}),
    row(['14.2','14.3'], 'SUPPORT-21 social engineering / authentication exercise', 'learning-responses.csv',
      'Prompt:urgent supplier bank-change request plus unsolicited MFA prompt. Recorded answer:verify via established contact,deny unsolicited factor,report attempts,use distinct credentials/own session. Rubric recognition+independent verification+reporting met.', {owner_role:NINA}),
    row(['14.4','14.5'], 'FINANCE-12 handling / accidental disclosure exercise', 'learning-responses.csv',
      'Prompt:wrong-recipient payroll share and diagnostic export. Answer:revoke share,notify owner/IT,preserve recipient/details,restricted approved storage,documented retention/disposal; do not put sensitive exports on unencrypted media. Clear-screen/desk steps included.',
      {owner_role:NINA, exceptions:'Training does not remediate the separately open3.9 encryption defect.'}),
    row(['14.6','14.7','14.8'], 'REMOTE-44 incident / failed tool / home-network exercise', 'learning-responses.csv',
      'Answer:report unusual sign-in and stopped protection with device/time/symptom via published route; do not disable tooling; use protected enterprise access,change home-router default administration,avoid untrusted public-network transfer. Instructor checks all three topics.', {owner_role:NINA}),
    row(['14.9'], 'Role-to-skills delivery matrix', 'role-skills-results.csv',
      'Developer36 secure-code exercise complete; infrastructure6 investigation/recovery lesson complete; support18 sensitive-case handling complete; provider owners5 contract/security classification lesson complete. All fictional role roster entries reconciled to delivered material.',
      {owner_role:NINA, cadence_or_trigger:'organization-selected schedule and changing duties', exceptions:'14.9 has no independently imposed numeric interval; developer annual16.9 duty remains separate.'}),
    row(['15.1','15.3'], 'Provider inventory / annual classification', 'provider-classification.csv',
      'Known relationships15=active14+inactive1; enterprise contact15/15; procurement/services matched15/15. Hosting high:service/data dependency; messaging medium:business communications; low-exposure design tool low; retired provider no live access; rationales and change review retained.',
      {owner_role:TOM, cadence_or_trigger:'annual and significant change'}),
    process(['15.2'], 'Provider lifecycle policy2.0',
      'Tom maintains inventory,classifies exposure,assigns assessment/monitoring responsibility and requires decommissioning controls; Bill approves organizational decisions. Policy annual/change review retained; organization-selected annual active-vendor Reviews are not called IG3-only15.5.', {owner_role:TOM}),
    row(['15.4'], 'Executed contract gap comparison CONTRACT-IN', 'provider-contract-gaps.csv',
      'Annual check compares executed hosting/messaging/support agreements with required incident,information-protection and service-exit terms; missing terms confirmed; proposed amendment unsigned. Tom/Bill follow-up open; lifecycle policy and complete inventory do not insert clauses.',
      {owner_role:TOM, cadence_or_trigger:'at least annual contract-security check', result:'partial: annual gap check performed; executed security terms missing',
        exceptions:'No draft amendment is represented as executed or contract remediation complete.'})
  ];

  const developmentResponse = [
    process(['16.1','16.2','16.6'], 'Development / vulnerability intake / severity processes',
      'Design,coding,training,third-party handling and tests are release activities. Public synthetic intake security@initech.example -> Michael -> severity/owner/timing -> fix/retest. Severity matrix blocks exposed high-impact unresolved defects; documented annual/change maintenance retained.', {owner_role:MICHAEL}),
    row(['16.2','16.3'], 'Reported vulnerability APP-24 / causal review', 'application-vulnerability.csv',
      'Report received09:00,analysis10:10,owner10:20; missing object-ownership check identified; fix adds server ownership validation,retest tenant-A into tenant-B object=DENY. Root cause:shared service bypassed helper; prevention adds ownership regression,not merely ticket closure.',
      {owner_role:MICHAEL, cadence_or_trigger:'report/analysis event'}),
    row(['16.4','16.5'], 'Current/planned component register / worker exception', 'component-review-gap.csv',
      'Monthly component-risk review covers4/5 builds; Settlement Worker current/planned component list incomplete,review absent. Its release-time trusted-source/version/support selection checks remain present; writable library search path tracked separately under2.6.',
      {owner_role:MICHAEL, cadence_or_trigger:'component evaluation at least monthly', result:'partial component inventory/evaluation',
        exceptions:'Release selection does not fabricate missing monthly worker evaluation or planned-component records.'}),
    row(['16.5','16.7'], 'Controlled dependency / deployment hardening checks', 'release-hardening-results.csv',
      'Invoice release4.6.2 and worker3.4.1 packages have controlled-source digest and vulnerability/support check; untrusted registry admission=DENY. Database/web/container templates restrict admin,enable audit/encryption and omit unused listeners; application deploy weakens baseline0 checks.', {owner_role:MICHAEL}),
    row(['16.8'], 'Production / nonproduction separation', 'environment-isolation.csv',
      'Separate account,secret references,network and data stores; developer role -> production data=DENY; test pipeline -> production secret read=DENY; approved signed artifact promotion=ALLOW; integration/staging contain synthetic data only.', {owner_role:MICHAEL}),
    row(['16.9'], 'Developer annual secure-code delivery', 'developer-learning.csv',
      'Development/review/release roster36; annual secure-code completion36/36; language-specific input validation,ownership/authz and query exercise recorded; new release maintainer practical review completed; generic workforce attendance not substituted.',
      {owner_role:MICHAEL, day:dates.month(-4), cadence_or_trigger:'at least annually'}),
    row(['16.10','16.11'], 'Invoice change DESIGN-31 / vetted security services', 'secure-design-results.csv',
      'Trust boundary documented; server validates every object operation,untrusted fields schema checked,minimal service ports. Identity/authorization via vetted services,encryption via maintained module,audit via shared collector; no custom crypto or copied credentials; review records use/configuration decisions.', {owner_role:MICHAEL}),
    process(['17.1','17.2','17.3'], 'Incident roster / verified contacts / workforce reporting',
      'Internal lead Peter,backup Samir; provider technical support remains internally overseen. Fictional relevant-role directory confirmed4/4; workforce report route primary voice/alternate independent voice; report immediately with device/time/symptom/contact. Annual/change maintenance retained.', {owner_role:PETER}),
    process(['17.4','17.5','17.6'], 'Response roles / communication dependency map',
      'Lead,analyst,IT,security,HR,legal,facilities/PR functions assigned with backups; Bill coordinates external advice,Milton facilities,Nina communication. Normal channel depends on enterprise identity; secondary independent voice tree remains available during identity outage; harmless channel check4/4.', {owner_role:PETER}),
    ...[-16,-4].map(month => row(['17.7'], 'Performed response exercise IR-EX', 'incident-exercise-results.csv',
      'Key personnel Peter,Samir,Michael,Nina,Tom present; scenario suspicious settlement account/service interruption. Independent-channel contact4/4,containment decision12min,recovery authorization recorded; follow-up clearer provider escalation assigned,not automatically closed.',
      {owner_role:PETER, day:dates.month(month), cadence_or_trigger:'at least annually', result:'performed fictional exercise with decisions and follow-up'})),
    row(['17.8'], 'Resolved misuse event IR-12 / lessons', 'post-incident-review.csv',
      'IR-12 disabled stale delegated access; service restored; subsequent lessons identify handoff owner ambiguity,assign provider escalation wording to Tom and monitoring follow-up to Samir. Restored service is not closure of both corrective Actions.',
      {owner_role:PETER, cadence_or_trigger:'after an incident; no invented fixed annual interval'}),
    process(['18.1'], 'External testing program TEST2.0',
      'Authorized6 external endpoints plus enterprise/environment reconnaissance; qualified fictional testing party; no destructive production actions,Michael contact,scope/limitations documented; annual external schedule,priority-based remediation and retrospective routing specified.',
      {owner_role:MICHAEL, cadence_or_trigger:'program-defined frequency;18.2 annual minimum separate'}),
    ...[-16,-4].map(month => row(['18.2'], 'Performed qualified external test EXT-IN', 'external-penetration-results.csv',
      'Qualified fictional tester assessment record retained; reconnaissance identifies6 authorized endpoints plus synthetic exposed metadata; scoped test performed6/6; report finding EXT-07 access-control weakness handed to Michael. Appointment/scanner report not substituted for performed test.',
      {owner_role:MICHAEL, day:dates.month(month), cadence_or_trigger:'at least annually including reconnaissance', result:'performed fictional external test'})),
    row(['18.3'], 'EXT-07 correction / independent retest', 'penetration-remediation.csv',
      'Exposed authorization weakness prioritized high; server permission correction deployed; tester retest of unauthorized synthetic object access=DENY; finding validation recorded separately from Action completion. Other lower-priority observations retain owner/target/risk rationale.',
      {owner_role:MICHAEL, cadence_or_trigger:'prioritized remediation of test findings'})
  ];

  const assessmentPlans = [
    row(['11.5'], 'Quarterly sampled restore assessment plan', 'assessment-plans.csv',
      'Samir/Peter must obtain actual sampled restore executions across invoice,settlement and supporting assets,quarterly sequence,coverage,failures and business outcomes. Known backup jobs/runbooks/copies do not establish whether tests were performed or passed.',
      {owner_role:PETER, activity:'assessment plan only', cadence_or_trigger:'assess actual quarterly test obligation', day:cutoff,
        result:'not assessed; no operating conclusion', exceptions:'No restore execution,passed result,completed occurrence or historical test sequence is supplied.'}),
    row(['13.3'], 'Network detection coverage assessment plan', 'assessment-plans.csv',
      'Samir must map appropriate production/office/settlement observation boundaries,obtain deployed sensor/effective-policy coverage and supported harmless validation material. Host alerts,flow logs and network inventory alone are insufficient to judge network IDS.',
      {activity:'assessment plan only', cadence_or_trigger:'assessment preparation; no invented operating interval', day:cutoff,
        result:'not assessed; no operating conclusion', exceptions:'No network-IDS sensor coverage,passed detection,completed test or inferred implementation is supplied.'})
  ];
  const artifacts = [
    artifact('inventory-software', 'Asset, software and deployment operating samples', inventory),
    artifact('data-configuration', 'Data handling and secure configuration samples', dataConfiguration),
    artifact('identity-endpoint', 'Identity, messaging and endpoint protection samples', identityEndpoint),
    artifact('vulnerability-logging', 'Vulnerability operations and performed log examination', vulnerabilityLogging),
    artifact('network-recovery', 'Network observations and backup protection samples', networkRecovery),
    artifact('workforce-providers', 'Learning, provider lifecycle and executed-contract gaps', workforceProviders),
    artifact('development-response', 'Development, incident response and qualified test samples', developmentResponse),
    artifact('assessment-plans', 'Unassessed recovery-test and network-detection preparation only', assessmentPlans)
  ];
  for (const item of artifacts) for (const entry of item.rows) {
    if (!validDay(entry.observed_at) || entry.observed_at < origin || entry.observed_at > cutoff)
      throw new Error('Initech observations must remain within the frozen v8.1 program and assessment cutoff.');
  }
  return artifacts;
}
