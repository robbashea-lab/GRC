import {calendarRangeStart} from '../lib/portfolioProgress';
import {reviewSchedule, scheduledDate} from '../lib/reviewOccurrences';
import {KRUSTY_SCENARIO_PROFILE} from './cisCanonicalKrustyContent';

const CID = 'demo_krusty_krab';
const SCOPE = 'Fictional Krusty restaurant, franchise, ordering and management services';
const SPONGEBOB = 'SpongeBob SquarePants — Engineering and infrastructure lead';
const SQUIDWARD = 'Squidward Tentacles — Franchise operations coordinator';
const EUGENE = 'Eugene Krabs — Executive sponsor';
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !!scheduledDate(value);

// Pure current source excerpts only. These are not uploaded files, native saves,
// independent verification or a complete occurrence ledger. Packing is separate.
export function krustyOperatingSamples(dates) {
  if (!dates || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(dates.anchor || '')
    || !scheduledDate(dates.anchor) || typeof dates.day !== 'function' || typeof dates.month !== 'function'
    || dates.day(0) !== dates.anchor.slice(0,10)) throw new Error('Krusty samples require the frozen UTC scenario date model.');
  const organization = dates.month(-60), origin = [organization,'2024-07-01'].sort().at(-1);
  const cutoff = dates.day(-2), observed = dates.day(-3);
  if (![organization,origin,cutoff,observed,dates.month(-1)].every(validDay)
    || !(organization <= origin && origin < observed && observed <= cutoff && cutoff < dates.day(0)))
    throw new Error('Krusty sample dates must follow enrollment and precede the assessment cutoff.');
  // Reuse native UTC calendar arithmetic. Carry the current parent's anchor so
  // February clamping cannot silently change a later non-month-end anniversary.
  const prior = (nextOffset, recurrence) => {
    const due = dates.day(nextOffset), date = scheduledDate(due);
    if (!date) throw new Error('Krusty sample parent dates must be valid.');
    const months = {monthly:1,quarterly:3,semiannual:6,annual:12}[recurrence];
    const previous = recurrence === 'weekly' ? dates.day(nextOffset-7)
      : calendarRangeStart(due+'T00:00:00.000Z', months)?.slice(0,10);
    const anchor = {day:date.getUTCDate(), month_end:date.getUTCDate() === new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()};
    const next = reviewSchedule({due_date:previous, recurrence:recurrence === 'weekly' ? 'custom' : recurrence,
      custom_recurrence_days:recurrence === 'weekly' ? 7 : undefined, schedule_anchor:anchor}).next_review_date;
    if (!validDay(previous) || previous < origin || previous > cutoff || next?.slice(0,10) !== due)
      throw new Error('Krusty manual samples must retain their native parent cadence and assessment cutoff.');
    return previous;
  };
  const after = day => {
    const date = scheduledDate(day); if (!date) throw new Error('Krusty source event date is invalid.');
    date.setUTCDate(date.getUTCDate()+1); return date.toISOString().slice(0,10);
  };
  const row = (ids, entity, source_file, observed_value, {owner_role = SPONGEBOB, activity = 'manual operating activity',
    cadence_or_trigger = 'on use / relevant change', result = 'recorded fictional source observation',
    exceptions = '', day = observed} = {}) => ({observed_at:day, safeguards:ids.join('|'), scope:SCOPE,
    entity, source_file, observed_value, result, exceptions, owner_role, activity, cadence_or_trigger,
    source_classification:activity === 'documented process excerpt' ? 'fictional_process_excerpt' : 'fictional_operating_sample',
    basis:'Explicit fictional CIS v8.1 current excerpt; not independent verification, a native save, a signature or an uploaded-file claim. Nonexhaustive excerpts do not prove every past period.'});
  const process = (ids, entity, value, options = {}) => row(ids,entity,'process-excerpts.csv',value,
    {activity:'documented process excerpt', cadence_or_trigger:'annual and significant change', ...options});
  const artifact = (key, title, rows) => ({key,title:'DEMO - SYNTHETIC: '+title,rows,
    assessment_ids:[...new Set(rows.flatMap(item => item.safeguards.split('|')))].map(id => 'fw_'+CID+'_assessment_'+id)});
  const fleet = KRUSTY_SCENARIO_PROFILE.asset_scope;

  const inventorySoftware = [
    row(['1.1'],'KK current enterprise inventory','asset-reconciliation.csv',
      'Twelve sites; laptops'+fleet.managed_laptops+',phones'+fleet.managed_phones+',POS'+fleet.pos_terminals+',kiosks'+fleet.ordering_kiosks+',managed kitchen consoles'+fleet.kitchen_controllers+',network'+fleet.network_devices+',cloud'+fleet.cloud_workloads+'=264 current assets. Names,hardware addresses,applicable static addresses,owner,department and connect authorization reconcile264/264; six admin laptops are within36,not additional assets.',
      {day:dates.month(-1),cadence_or_trigger:'complete inventory at least every six months'}),
    row(['1.1'],'KK-POS-072 / remote management custody','asset-reconciliation.csv',
      'Leased provider-supported POS072 remains one of the72 counted POS assets; custodian and authorized support route recorded. Remote laptops and cloud workers retain enterprise ownership. Retired replacement record is retained outside the264-current population,not silently counted active.',
      {day:dates.month(-1),cadence_or_trigger:'complete inventory at least every six months; change reconciliation'}),
    ...[-25,-18,-11,-4].map(offset => row(['1.2','1.4'],'Outlet lease and unknown-device queue','weekly-address-reconciliation.csv',
      'Twelve outlet DHCP feeds and two cloud-allocation feeds reconciled14/14. POS021 address change reaches its inventory entry; unknown visitor device Q-07 is quarantined/denied enterprise access,not authorized by discovery; current unresolved unauthorized enterprise connections0.',
      {day:dates.day(offset),cadence_or_trigger:'at least weekly'})),
    ...[-5,-4,-3].map(offset => row(['1.3'],'Daily authorized-range discovery','discovery-executions.csv',
      'Authorized outlet/cloud ranges18; jobs completed18/18. Reachable assets236 observed;28 disconnected/transient devices reconciled through enrollment and last-seen sources,not falsely called scanned. Full inventory remains264; failed-job queue0 and unknown-device disposition is separately retained.',
      {day:dates.day(offset),activity:'automated operating job',cadence_or_trigger:'daily'})),
    ...[-11,-4].map(offset => row(['1.5'],'Passive discovery observation points','passive-discovery-reconciliation.csv',
      'Outlet observation points12 plus cloud sources2 healthy14/14; short-lived deployment address matched KK-CLD-024; observed visitor Q-07 joins the disposition queue. Source-to-register reconciliation applied; additions/removals acknowledged,missing observation points0.',
      {day:dates.day(offset),cadence_or_trigger:'reconcile at least weekly',exceptions:'This is actual fictional discovery reconciliation,not a claim that CIS mandates a platform ticket.'})),
    row(['2.1','2.4'],'Managed software discovery / licensed inventory','software-inventory.csv',
      'Automatic endpoint/workload and mobile feeds reconcile installation classes. Fictional Krusty OrderDesk4.2:72POS entitlements/72 installs; Menu Console2.6:24kiosks/24 installs. Register includes title,publisher,first use,purpose,source/version,deployment and license count; current permitted product families10.',
      {day:prior(80,'semiannual'),activity:'automated inventory with manual reconciliation',cadence_or_trigger:'collection on installation/change; complete inventory at least six-monthly',exceptions:'Internal product names and versions are fictional,not real-publisher release claims.'}),
    row(['2.2'],'Monthly software support comparison','software-support.csv',
      'Product-family support references reconciled10/10; current supported families10,unapproved unsupported installations0. Device-role report includes POS,kiosk,kitchen,office,phone and server packages. Expiry notices route to assigned replacement/change work; support is not inferred from a working application.',
      {day:prior(12,'monthly'),cadence_or_trigger:'at least monthly'}),
    row(['2.3'],'KK-LAP-019 unauthorized installer removal','software-disposition.csv',
      'Installed-versus-approved delta identifies unapproved export utility; execution denied,uninstall exit0,rescan matches0,business-service check usable. Removal record retains original disposition and separate outcome check rather than expanding the approved list to hide it.',
      {day:prior(12,'monthly'),cadence_or_trigger:'monthly or more frequently'}),
    row(['2.5','2.6'],'Executable and library reassessment','execution-policy-results.csv',
      'Approved OrderDesk executable ALLOW; unauthorized executable DENY. Ordering worker loads maintained package set; user-writable library path introduction DENY and unlisted library DENY. Separate rules identify executable identity versus libraries loaded into a process; reassessment exceptions0.',
      {day:prior(80,'semiannual'),cadence_or_trigger:'at least every six months; continuous execution enforcement'}),
    row(['2.7'],'Authorized support/deployment scripts','script-allowlist-results.csv',
      'Script register17:controlled source revision and authorized signing/package references17/17. Authorized menu-sync script ALLOW; altered script and unlisted support script DENY. Approved set reassessed with owner disposition; signatures contain no private-key material in this excerpt.',
      {day:prior(80,'semiannual'),cadence_or_trigger:'at least every six months; continuous execution enforcement'}),
  ];

  const dataConfiguration = [
    process(['3.1','3.7'],'Current data process / classification2.0 excerpt',
      'Owners:guest-order contacts=franchise operations;personnel=executive sponsor;recipes=executive sponsor;service data=engineering. Public/Internal/Confidential/Restricted classes specify handling,minimum/maximum retention,holds and sensitivity-appropriate disposal. Recorded external2.0 reference is separate from operating outcomes.',{owner_role:SQUIDWARD}),
    row(['3.2'],'Sensitive stores and provider paths','data-store-register.csv',
      'ORDER-CONTACT=Confidential/Squidward;PERSONNEL=Restricted/Eugene;FRANCHISE=Confidential/Eugene;RECIPES=Restricted/Eugene;menu publication=Public/Squidward. Restaurant caches,provider-held receipt contacts and protected backups have explicit locations/owners; references are not payment-card data.',
      {owner_role:SQUIDWARD,day:prior(35,'annual'),cadence_or_trigger:'inventory at least annually and change intake'}),
    row(['3.3'],'Branch,personnel and recipe access outcomes','data-access-results.csv',
      'Restaurant04 operator -> own pending order ALLOW;Restaurant05 order DENY;personnel file DENY;recipe administration DENY. Assigned support role -> own case ALLOW. Repository grants and application object checks trace to approved roles rather than directory membership alone.'),
    row(['3.4'],'Retention execution / held record','retention-execution.csv',
      'Fictional organization choices:guest-contact minimum7days/maximum90days,personnel84months,franchise agreements term+84months. Early-delete attempt1 BLOCKED;expired guest rows60 selected/60 removed;hold H-02 retains2 authorized records with named owner/release condition. Backup expiry is documented separately.',
      {owner_role:SQUIDWARD,activity:'automated lifecycle job with hold review',cadence_or_trigger:'configured retention execution; authorized hold/release',exceptions:'These durations are organization choices,not CIS or legal mandates.'}),
    row(['3.5'],'Retired console media / expired export','disposal-results.csv',
      'Retired console OLD-06 has two custody handovers and authorized sanitization receipt;post-check contains no recoverable enterprise volume. Expired contact export17/17 removed;provider copy disposition acknowledged. Moving a file to an archive was not counted as disposal.',{owner_role:SQUIDWARD}),
    row(['3.6'],'Laptop and phone protection states','device-encryption.csv',
      'Managed laptops36/36 protected volumes enabled;company phones24/24 enterprise data encrypted. Ordinary service desk recovery-material read DENY;restricted recovery custodian access logged. No passwords or recovery secrets are included.'),
    row(['3.8'],'Order-to-fulfillment / workforce flow register','data-flow-register.csv',
      'FLOW-ORDER:guest contact -> ordering -> assigned restaurant -> receipt provider,with response paths and encrypted transport. FLOW-PEOPLE:authorized payroll export -> workforce provider -> receipt/status return. Sender,recipient,purpose,sensitivity,cache and backup destinations recorded;payment paths exchange references only.',
      {owner_role:SQUIDWARD,day:prior(35,'annual'),cadence_or_trigger:'annual and significant integration change'}),
    row(['3.9'],'Approved encrypted support media','removable-media-results.csv',
      'Issued encrypted media KK-MEDIA-02 contains authorized synthetic recovery export;ordinary second workstation cannot read contents without controlled unlock. Unencrypted support export attempt DENY;key custody/return retained. Malware scan result is recorded separately from encryption.'),
    row(['3.10','3.11','3.12'],'Sensitive transport,storage and processing boundaries','sensitive-data-boundaries.csv',
      'Four service/provider/backup plaintext probes DENY4/4;approved protected paths ALLOW4/4. ORDER-CONTACT and PERSONNEL storage encryption enabled;public publishing role cannot read Restricted stores. Public menu processing has no personnel/recipe store permission;keys are separately controlled.'),
    row(['3.13'],'Automated sensitive-data discovery / inventory update','sensitive-data-discovery.csv',
      'Synthetic personnel marker in an incorrect export directory is detected by the automated policy;source,destination and owner recorded,export contained and location added to the data register. Endpoint,file-service and remotely held enterprise stores have recorded collection paths;case DLP-08 disposition retained.',
      {activity:'automated operating job',cadence_or_trigger:'automated stored/processed/transmitted-data discovery'}),
    row(['3.14'],'Sensitive read,change and disposal trace','sensitive-data-audit.csv',
      'Personnel read seq610,franchise update seq611 and authorized export disposal seq612 reach protected collection with actor,resource,time and action. Full record payload and secrets excluded;ordinary log alteration DENY. Logging does not determine whether the access was authorized.'),
    process(['4.1','4.2'],'Enterprise and network secure-configuration excerpts',
      'Separate managed device/software and network standards identify provisioning,required settings,change owner,documented deviation,rollback and annual/change maintenance. Coverage includes phones,POS,kiosks,managed kitchen consoles,network appliances and cloud workloads;not just office laptops.'),
    row(['4.3','4.10'],'Effective inactivity / failed-attempt profiles','portable-device-controls.csv',
      'Laptop inactivity300s,phone work-session120s;extension by ordinary user DENY. Supported failed local authentication thresholds:laptop20,phone10,followed by controlled recovery. Both settings are effective on sampled profiles;failed-attempt lockout is not inactivity locking.'),
    row(['4.4','4.5'],'Server and end-user filtering results','host-filtering-results.csv',
      'Ordering server -> required database service ALLOW;guest segment -> database DENY. Laptop,POS and phone-workspace platform filtering default-deny unsolicited traffic except approved service/port rules;ordinary operator disable DENY. Effective platform policy is recorded rather than assuming perimeter coverage.'),
    row(['4.6','4.7'],'Controlled administration / factory account state','management-default-results.csv',
      'Named administrator -> encrypted management interface ALLOW;plaintext alternative DENY. Replacement POS commissioning records disabled starter accounts and restricted necessary service identity;no supplier default login remains generally usable. Change CH-44 includes accountable authorization and rollback.'),
    row(['4.8'],'Role image service reconciliation','service-minimization.csv',
      'Kiosk role manifest permits required ordering/display and management services;unused file-sharing listener disabled,sample application removed,installed delta0. Ordering workload has only documented service listeners;restaurant operator cannot enable an unapproved remote-access tool.'),
    row(['4.9'],'Trusted network resolver configuration','resolver-settings.csv',
      'Network exports60/60 designate controlled resolver paths;cloud network policy references approved resolution service. Arbitrary alternate resolver attempt DENY;sample POS and management queries resolve through their assigned path. This is separate from filtering and DNS query logging.'),
    row(['4.11'],'Synthetic lost-phone control exercise','remote-erase-exercise.csv',
      'Disposable simulation of enrolled KK-PHN-024:authorized request15:10,offline state pending,online receipt15:14,enterprise-data removal confirmation15:15. Ordinary-role request DENY. A queued offline request was not called erased;no real workforce device is affected.',
      {cadence_or_trigger:'loss/theft/end-of-engagement decision'}),
    row(['4.12'],'Work/personal boundary on company mobile','mobile-workspace-results.csv',
      'Managed work profiles assigned24/24 company phones. Personal app -> work document DENY;unapproved work-to-personal share DENY;approved enterprise app -> work store ALLOW. Retirement simulation removes work data while retaining personal-side state;passcode alone is not workspace separation.'),
  ];

  const identityEndpoint = [
    row(['5.1','5.5'],'Quarterly accounts and service-purpose reconciliation','account-reconciliation.csv',
      'Active identities240=216 workforce+6 dedicated administrator identities+18 services. Authorization240/240 confirmed;name/username,department,start/stop records present. Service register18/18 has departmental owner,purpose and review date;obsolete MENU-OLD identity disabled,not hidden from retained history.',
      {day:prior(30,'quarterly'),owner_role:SQUIDWARD,cadence_or_trigger:'at least quarterly authorization; maintained service metadata'}),
    row(['5.2','5.4'],'Unique credential custody / privilege separation','identity-configuration.csv',
      'Target-specific credential references distinct for18 service identities;no secret values recorded. Effective password policy minimum8withMFA/14without. Six separate administrative identities have no ordinary mailbox;daily-work identity -> administrative action DENY,authorized dedicated identity ALLOW.'),
    row(['5.3'],'Dormant seasonal identity disablement','inactive-account-results.csv',
      'Seasonal account last use='+dates.day(-80)+';disable='+dates.day(-35)+';inactivity45days;subsequent synthetic sign-in DENY. Service-job activity is evaluated separately from human login so current automation is not called dormant;unsupported-platform coverage is recorded,not erased.',
      {cadence_or_trigger:'45-day inactivity threshold where supported'}),
    row(['5.6','6.7'],'Central lifecycle and role propagation','identity-provisioning-results.csv',
      'Approved role change reaches workforce directory,ordering authorization and support application3/3;old privilege removed,new permitted case ALLOW,other-franchise case DENY. Recovery identities remain under central lifecycle/custody;provider and local exports reconcile to the central register.'),
    process(['6.1'],'Documented granting procedure excerpt',
      'Squidward confirms business role and authorization before engineering provisions;recorded request,least-privilege role and effective grant are reconciled for hires and role changes.',
      {owner_role:SQUIDWARD,cadence_or_trigger:'hire/role-change granting'}),
    row(['6.1','6.2'],'MOVE-17 / LEAVE-12 actual sequence','access-lifecycle-results.csv',
      'MOVE-17 authorization09:00,new role effective09:12,old role removed09:12. LEAVE-12 termination16:00,directory/application disable16:00,active remote sessions revoked16:00,controlled denied-access check16:02. Disabled identity retained for audit attribution;no waiting for a dormant-account sweep.',
      {owner_role:SQUIDWARD,cadence_or_trigger:'hire/move granting; immediate termination,rights revocation or role change'}),
    row(['6.3','6.4','6.5'],'Application,VPN and administration MFA checks','authentication-results.csv',
      'External support sign-in without factor DENY;approved factors ALLOW. Remote network password-only attempt DENY;cloud and managed-provider administration without factor DENY. Direct alternate sign-in is covered;guest menu browsing grants no enterprise account access.'),
    row(['6.6'],'Authentication / authorization system register','identity-system-inventory.csv',
      'Directory,application role store,network AAA,cloud IAM and managed-provider administration each have owner,hosting and authorization responsibility;complete inventory5/5 reconciled. A single identity-provider entry was not substituted for all authorization systems.',
      {day:prior(30,'quarterly'),owner_role:SQUIDWARD,cadence_or_trigger:'complete system inventory at least annually; change intake'}),
    row(['6.8'],'Role-rights and actual privilege validation','role-rights-results.csv',
      'Cashier -> assigned outlet fulfillment;manager -> outlet coordination;personnel group -> restricted workforce data;engineering -> controlled service administration. Role matrix and actual entitlements reconciled;unnecessary retired menu grant removed,denied cross-role checks retained. Existing Access document holds the maintained matrix.',
      {day:prior(30,'quarterly'),owner_role:SQUIDWARD,cadence_or_trigger:'role-rights/enterprise-privilege validation at least annually; changes separately controlled'}),
    row(['9.1'],'Browser and email permitted-release comparison','client-version-comparison.csv',
      'Sample installed browser/mail release identifiers match the retained supported-target register;stale installation exception0. Managed update enabled and failed-update queue empty;unsupported client launch DENY. No real publisher version or current release claim is invented.'),
    row(['9.2','9.3'],'DNS and URL policy outcomes','web-protection-results.csv',
      'Reserved synthetic test destinations:known-malicious-category resolution BLOCKED;approved business query ALLOW. Prohibited URL request denied on outlet,remote and cloud egress;POS fixed-purpose destinations remain restricted. A block does not claim every malicious domain is known.'),
    row(['9.4','9.6'],'Extension and attachment restrictions','messaging-policy-results.csv',
      'Unapproved browser extension and mail add-on disabled2/2;permitted list retained. Harmless prohibited executable attachment rejected before delivery;permitted plain text delivered. Extension approval,attachment types and malware analysis have separate configuration records.'),
    row(['9.5'],'Enterprise sending-domain alignment','mail-authentication-results.csv',
      'krusty.example and notices.krusty.example:authorized sender policy present,DKIM test valid,DMARC policy enforced and alignment reports reconciled. Unauthorized sender example fails alignment;approved service sender aligns. No live DNS query or real message is sent by this fixture.'),
    row(['9.7'],'Email anti-malware quarantine example','mail-protection-results.csv',
      'Maintained message/attachment analysis policy enabled;approved harmless detection sample quarantined,case MAIL-05 attributed and disposition retained. Benign business attachment released through authorized handling;ordinary user bypass DENY. Detection is not a guarantee against every malicious message.'),
    row(['10.1'],'Platform capability / protection health excerpts','malware-coverage.csv',
      'KK-LAP-012,KK-POS-021,KK-KITCHEN-004 and KK-CLD-003 report effective protection healthy;KK-PHN-006 work-app protection blocks a harmless disallowed package. Asset-class capability register covers the264-asset estate and identifies platform-specific protection;no identical host agent is claimed on fixed-function equipment.'),
    row(['10.2'],'Automatic protection-content update','malware-update-results.csv',
      'Automatic engine/content update received on sampled workstation,POS and workload;effective content matches assigned package,stale queue0. Previously disconnected console receipt acknowledged on reconnect. Configured automatic update alone was not counted as delivered.',{activity:'automated operating job'}),
    row(['10.3','10.4'],'Removable media non-execution / automatic scan','media-protection-results.csv',
      'Insertion of approved encrypted support media launches no executable;autorun/autoplay disabled. After controlled unlock,automatic scan starts without operator request,harmless sample flagged and transfer stopped. This does not replace encryption or transfer authorization.'),
    row(['10.5','10.7'],'Exploit-mitigation / behavior protection','behavior-protection-results.csv',
      'Supported platform memory/execution mitigations effective on sampled roles;controlled harmless process-chain example produces behavior-based prevention and central case BEH-07. Rule exception owner retained;known-file signatures are not presented as the behavioral mechanism.',
      {exceptions:'Non-destructive fictional source observations;no attack or unsafe payload is supplied.'}),
    row(['10.6'],'Central protection policy and asset reconciliation','central-protection-results.csv',
      'Sample asset identities map to current central policy,health and accountable service;missing enrollment queue0. Ordinary user policy-disable request DENY;central action case retains device,rule and disposition. An old console row alone is not treated as live coverage.'),
  ];

  const vulnerabilityLogging = [
    process(['7.1','7.2'],'Vulnerability and remediation process excerpts',
      'Inventory/advisory/scan intake -> accountable triage -> impact/priority,target rationale,correction and separate retest. Annual/significant-change vulnerability documentation is distinct from monthly remediation-process review;exceptions do not turn unfinished correction into completion.',
      {cadence_or_trigger:'7.1 annual/significant change;7.2 monthly or more frequently'}),
    row(['7.2'],'Performed monthly remediation-process review','remediation-process-review.csv',
      'Owned queue reconciled:exposed service priority,restaurant maintenance dependencies,unavailable-fix escalation and retest responsibility recorded. Completed configuration correction has a separate denied-path check;lower-priority residual work keeps owner and rationale instead of disappearing.',
      {day:prior(18,'monthly'),cadence_or_trigger:'monthly or more frequently'}),
    ...[-2,-1].map(month => row(['7.3','7.4'],'OS and application deployment outputs','deployment-jobs.csv',
      'Managed OS deployment180 targets:180 installed,0 unresolved failures;phones24 supported update receipts retained separately. Fictional OrderDesk72/72 and cloud runtime24/24 application updates installed;initial retry1 succeeded. OS and application results are separate,not a queued-work claim.',
      {day:dates.month(month),activity:'automated operating job',cadence_or_trigger:'at least monthly'})),
    row(['7.5'],'Internal scan coverage / credential outcome','internal-scan-results.csv',
      'Authorized enterprise targets264 reconciled;authenticated eligible OS targets180/180 succeed;appropriate network/mobile methods recorded for remaining classes. Unauthenticated scan perspective covers authorized ranges;initial credential failure1 resolved,retry passed. Disconnected targets remain explicit rather than clean findings.',
      {day:prior(12,'quarterly'),activity:'automated operating job',cadence_or_trigger:'at least quarterly;authenticated and unauthenticated perspectives'}),
    ...[-2,-1].map(month => row(['7.6','7.7'],'External scan and prioritized correction','external-scan-remediation.csv',
      'Public exposure register8 endpoints;scan completed8/8,failed target0. Finding EXT-CONFIG-08 has service-impact priority,configuration correction and retest showing unwanted response removed;owner retains remaining bounded work. Scan output is not a performed penetration test.',
      {day:dates.month(month),activity:'automated scan and manual correction',cadence_or_trigger:'at least monthly;remediation follows risk-based process'})),
    process(['8.1'],'Current logging-process2.0 excerpt',
      'Identity,endpoint,POS,application,database,network and supported-provider sources have collection,owner,analysis,retention and failure routes. Weekly examination and monthly threshold tuning remain operating duties;annual/change process maintenance is not their execution.'),
    row(['8.2','8.5','8.9'],'Attributable source-to-collector event traces','audit-event-trace.csv',
      'POS-admin seq210 -> central210;personnel-read seq610 -> central610;ordering-change seq817 -> central817. Source,actor,time,resource/action and relevant endpoint fields present;secret/payload values excluded. Central ordinary-role alteration DENY;silent-source alert has accountable routing.'),
    row(['8.3','8.10'],'Retention and ingestion capacity excerpt','log-retention-capacity.csv',
      'Central allocation2TiB,used640GiB,free1408GiB;observed intake3GiB/day;selected retention180days. Retrieved event dated'+dates.day(-179)+' remains available;minimum90day deletion guard retained;ingestion buffer test loses0 events and capacity alert reaches its owner.',
      {exceptions:'180days is organization-selected,not a five-year raw-log promise or a changed CIS minimum.'}),
    row(['8.4'],'Effective time sources and drift','time-synchronization.csv',
      'Supported POS,server and network samples each use TIME-A and TIME-B;measured offsets11ms,17ms,14ms. Loss of one source uses the other and reports drift condition. Source event time remains separate from collector receipt time.'),
    row(['8.6','8.7','8.8'],'DNS,web and command audit trace','specialized-audit-events.csv',
      'Resolver q401 from KK-LAP-012 reaches central401;gateway request r208 reaches central208 with sensitive query suppressed. Harmless inventory-status command cmd73 records actor,parent,time and outcome. Appropriate/supported source coverage is explicit;encrypted packet contents are not invented.'),
    ...[-25,-18,-11,-4].map(offset => row(['8.11'],'Performed weekly audit-log examination','weekly-log-examination.csv',
      'SpongeBob examines identity,privileged changes,POS/service access and protection sources. Disabled-account retry case LOG-12 traced to a retired job;job corrected,retries cease;source period,case and disposition retained. Scheduling the Review was not counted as analysis.',
      {day:dates.day(offset),cadence_or_trigger:'at least weekly',result:'performed fictional log examination with scoped disposition'})),
    row(['8.12'],'Supported provider log collection','provider-audit-collection.csv',
      'Identity and hosting source exports received with tenant,actor,time/action;payment-reference service supplies supported administrative events. Provider capability matrix distinguishes unavailable event types;missing-feed alarm tested. No claim is made that every supplier exposes every event.'),
  ];

  const networkRecovery = [
    process(['11.1'],'Current recovery-process2.0 excerpt',
      'Priority sequence restores protected ordering references,restaurant configuration and workforce/franchise records with accountable technical execution and business authorization. Backup scope,protection,isolated copies and restore steps are defined;objectives are business targets rather than guaranteed recovery times.',{owner_role:EUGENE}),
    ...[-5,-4,-3].map(offset => row(['11.2'],'Automated ordering/business/configuration backups','backup-job-results.csv',
      'Hourly ordering-reference job produces nonzero snapshot;nightly employee/franchise files and configuration jobs succeed3/3. Workload configurations24/24 and outlet network/POS configurations mapped;prior failed object retried,remaining failure0. Weekly minimum scope is reconciled,not inferred from one database job.',
      {day:dates.day(offset),activity:'automated operating job',cadence_or_trigger:'ordering hourly;business/configuration nightly;all in-scope data at least weekly',exceptions:'A successful backup job is not a restore-test result.'})),
    row(['11.3','11.4'],'Protected backup and isolated-copy boundaries','recovery-copy-protection.csv',
      'Protected transport/storage enabled;ordinary support read DENY,named recovery custodian access logged. Isolated copy outside production write authority:production administrator overwrite DENY,controlled retrieval ALLOW. A second ordinary writable folder is not the isolation mechanism.'),
    row(['11.5'],'Performed rotating recovery sample','sampled-restore-results.csv',
      'Quarter sample covers order references,personnel-file subset,POS configuration and service recovery dependency:restore4/4 usable,synthetic row totals match and restricted access retained. Operator SpongeBob records actual outputs;business coordinator checks service usability. Backup counters and future appointments were not substituted.',
      {day:prior(12,'quarterly'),cadence_or_trigger:'sampled recovery tests at least quarterly',result:'performed fictional recovery sample;not independent verification'}),
    row(['12.1'],'Network support/version reconciliation','network-support-results.csv',
      'Network inventory60 devices;effective versions and support-reference export matched60/60,unsupported0. Replacement gateway preserves approved interfaces and monitored routes;post-change connection checks100/100. No current release number of a real vendor is asserted.',
      {day:prior(12,'monthly'),cadence_or_trigger:'at least monthly'}),
    process(['12.2','12.4'],'Architecture and topology excerpts',
      'Twelve outlets and cloud services show separate customer,POS,kitchen,workforce and management boundaries;least-privilege flows and availability dependencies are documented. Physical/logical diagrams include provider paths and updates after material changes;segmentation names alone are not enforcement.'),
    row(['12.3','12.5','12.6','12.7'],'Controlled network administration / remote AAA','network-access-results.csv',
      'Attributable administrator -> encrypted management ALLOW;insecure alternatives DENY. Remote managed laptop establishes enterprise VPN and AAA before internal route;unauthorized role DENY. Change NET-46 retains versioned configuration,authorization and safe rollback;ordinary browsing is not an administration path.'),
    row(['12.8'],'Dedicated administrative resources','dedicated-admin-results.csv',
      'KK-ADM-01 through06 are the six designated machines within36 laptops. Private administrative destination ALLOW;Internet access DENY6/6;ordinary workforce-network route DENY;email and general browsing absent. Dedicated-use and effective restrictions are inspected,not inferred from an admin shortcut.'),
  ];
  const networkProtection = [
    row(['13.1','13.6'],'Outlet07 / ordering gateway correlation','network-protection.csv',
      'Twelve outlet-gateway feeds and the cloud-flow feed are present. A harmless unusual administration connection carries outlet07,source,destination and session context into central correlation;responsible routing reaches engineering. Flow receipt,correlated alert and disposition have separate references.',
      {activity:'automated collection with operating examination',cadence_or_trigger:'maintained collection,review and alerting;no separate numeric interval'}),
    row(['13.2'],'Supported host-detection coverage','network-protection.csv',
      'Supported laptop process and cloud-worker authentication tests produce host alerts with asset/session attribution. Capability records distinguish installed sensors from fixed-function equipment monitored at network boundaries;disconnected sensors enter the health queue rather than appearing healthy.'),
    row(['13.3'],'Store-to-cloud network detection','network-protection.csv',
      'A harmless abnormal connection on the outlet/cloud path produces a network-detection event and central alert. Sensor placement covers POS management;encrypted payload visibility limits are explicit and supplemented with host/application context. A flow collector alone is not called network IDS.'),
    row(['13.4'],'Customer/POS/kitchen segment checks','network-protection.csv',
      'Customer wireless -> POS management DENY;kitchen controller -> personnel repository DENY;POS -> documented order service ALLOW. Applied source/destination rules match business purpose rather than just differently named networks.',
      {cadence_or_trigger:'operating filtering and relevant network changes'}),
    row(['13.5'],'Remote support-device admission','network-protection.csv',
      'Managed support laptop with current anti-malware,secure configuration and OS/application updates receives limited support access. The controlled stale-protection variant receives restricted remediation access only;successful identity authentication alone does not grant normal access.',{cadence_or_trigger:'on remote connection'}),
    row(['13.7'],'Supported host prevention / fixed-function limits','network-protection.csv',
      'Supported laptop and application-worker controls block the approved harmless execution example;prevention events reach the central queue. Fixed-function POS/kiosk/kitchen support limits remain documented,with restricted management and network prevention;no imaginary host agent or blanket N/A is introduced.'),
    row(['13.8'],'Ordering ingress prevention','network-protection.csv',
      'Approved harmless prohibited-traffic pattern BLOCKED at ingress;prevention event retained. Permitted order-service request remains usable. Effective prevention mode is checked;an alert-only observation is not counted as blocking.',{cadence_or_trigger:'maintained prevention;rule changes and operating checks'}),
    row(['13.9'],'Restaurant03 port-level admission','network-protection.csv',
      'Authorized support-device certificate receives its assigned segment;unknown/expired device authentication receives restricted access. Removed registration prevents normal readmission. Hardware address alone is not the admission credential.',{cadence_or_trigger:'attempted network admission'}),
    row(['13.10'],'Support/ordering application filtering','network-protection.csv',
      'Permitted ordering/support traffic passes;harmless unapproved application tunnel is denied even on an otherwise allowed transport port. Application-aware policy and exception owner/purpose are retained separately from a simple port allowlist.'),
    row(['13.11'],'Performed monthly alert-threshold tuning','network-protection.csv',
      'Sample reviews120alerts and four blocked credential-reuse attempts. Credential-reuse threshold adjusted with reason;ordering-peak thresholds unchanged. Three controlled signals still produce useful alerts,so volume reduction alone is not called success.',
      {day:prior(15,'monthly'),cadence_or_trigger:'monthly or more frequently',result:'performed fictional tuning with rationale and controlled signals'}),
  ];

  const workforceProviders = [
    row(['14.1'],'Annual workforce delivery / hire coverage','learning-results.csv',
      'Then-current workforce216;annual assignments216/completions216. Roster,content version and exceptions reconciled;late assignments were followed through rather than counted from attendance invitations. Sensitive employee,franchise and customer-contact handling stays in scope despite separate card processing.',
      {owner_role:SQUIDWARD,day:prior(70,'annual'),cadence_or_trigger:'training at hire and annually;content annually and significant change'}),
    row(['14.1'],'Historical hire induction record HIRE-216','learning-results.csv',
      'Fictional workforce entry HIRE-216 records role sponsor,induction completion08:45 and first independent enterprise duties09:00. Training precedes normal duties;the later annual roster reconciles the same workforce role. This source reference does not create a platform account.',
      {owner_role:SQUIDWARD,day:dates.month(-18),cadence_or_trigger:'at hire;subsequent annual training remains separate'}),
    row(['14.2','14.3'],'False support call / authentication response','learning-results.csv',
      'Simulated urgent POS caller requests a password and unexpected authentication approval. Participant declines both,uses the known-contact route,reports the request and identifies shared credentials as prohibited. No real credential or authentication prompt is used.',{owner_role:SQUIDWARD,cadence_or_trigger:'within hire/annual awareness'}),
    row(['14.4','14.5'],'Workforce export / wrong-recipient exercise','learning-results.csv',
      'Response distinguishes Public menu data from Confidential employee/contact exports;selects restricted storage/sharing,checks recipients,applies retention/disposal,locks the screen and clears desk/whiteboard. Misdirected export is reported and contained rather than silently deleted.',{owner_role:SQUIDWARD,cadence_or_trigger:'within hire/annual awareness'}),
    row(['14.6','14.7','14.8'],'Remote warning / automation failure exercise','learning-results.csv',
      'Participant reports unexplained POS change with outlet/time through alternate channel and escalates failed update/backup warnings without disabling management. Home-network response includes router administration,supported updates,wireless protection and avoidance of insecure public-network transfer.',{owner_role:SQUIDWARD,cadence_or_trigger:'within hire/annual awareness'}),
    row(['14.9'],'Role-to-skills demonstrated practice','learning-results.csv',
      'Outlet manager practices access sponsorship;franchise support handles sensitive exports;engineering demonstrates secure administration and object authorization. Recorded task responses establish specialist practice rather than general attendance;annual developer training remains separate.',
      {owner_role:SQUIDWARD,cadence_or_trigger:'organization-selected role schedule;entry/changed duties;no independent numeric14.9 interval'}),
    row(['15.1','15.3'],'Supplier inventory / classification reconciliation','provider-lifecycle.csv',
      'Known relationships15=then-active15,each with enterprise contact and service scope. Hosting considers ordering availability/contact data;payroll considers employee sensitivity;proposed AI providers consider permitted inputs and handling. Procurement/service inventory matches15/15;Old Galley is still active at this annual review. Its later exit is recorded separately,not backdated into this observation.',
      {owner_role:SQUIDWARD,day:prior(85,'annual'),cadence_or_trigger:'annually and significant service changes'}),
    process(['15.2'],'Current provider-lifecycle2.0 excerpt',
      'Inventory identifies known relationships/contacts;classification determines assessment and monitoring scope;new/renewed contracts trigger assessment. Security responsibilities remain in contracts;policy-defined notices feed monitoring;exit removes access/flows and controls return/disposal.',{owner_role:SQUIDWARD}),
    row(['15.4'],'Current-term security-clause comparison','provider-lifecycle.csv',
      'Sampled current agreements contain applicable encryption,incident/breach notification/response and disposal responsibilities consistent with the policy. Annual comparison finds no missing applicable term;renewal reminder,clause review and supplier assessment retain separate records. No signature or external certification is supplied.',
      {owner_role:SQUIDWARD,day:prior(85,'annual'),cadence_or_trigger:'contract security review at least annually'}),
    row(['15.5'],'Hosting annual assessment','provider-lifecycle.csv',
      'Classification-led assessment examines actual ordering/data scope,access responsibilities,recovery/logging information and residual concerns;conclusion and owned follow-up retained. This annual sample matches the declared current hosting assessment date and is not an independent supplier attestation.',
      {owner_role:SQUIDWARD,day:dates.day(45-365),cadence_or_trigger:'annual coverage plus new/renewed contracts'}),
    row(['15.5'],'OpenAI proposed-service new-term assessment','provider-lifecycle.csv',
      'Pre-term due diligence covers permitted input categories,enterprise/provider responsibilities,handling/retention,reporting and exit for the proposed public-material use. It precedes current contract_start='+dates.month(-12)+';no deployment approval or product security capability is inferred.',
      {owner_role:SQUIDWARD,day:dates.day(-367),cadence_or_trigger:'new contract;assessment before the current term'}),
    row(['15.5'],'Hosting renewed-term assessment','provider-lifecycle.csv',
      'Renewal comparison records changed scope,responsibilities,classification-led questions and agreed term conditions before current contract_start='+dates.month(-12)+'. This event-triggered assessment is retained separately from later annual coverage and commercial notice.',
      {owner_role:SQUIDWARD,day:dates.day(-367),cadence_or_trigger:'renewed contract;assessment before the current term'}),
    row(['15.6'],'Hosting change-notice monitoring receipt','provider-lifecycle.csv',
      'Received maintenance/security-change notice is tied to hosting and reviewed for ordering impact and changed responsibilities. No access/data-scope expansion found;disposition and next-step owner retained separately from annual assessment. A numeric universal CIS monitoring interval is not invented.',
      {owner_role:SQUIDWARD,cadence_or_trigger:'receipt/change-triggered monitoring under provider policy'}),
    row(['15.7'],'Retired hosting exit','provider-lifecycle.csv',
      'Exit records removal of three access identities and two integration flows,enterprise-copy return/disposal responsibility and disposition reference. The relationship remains inactive with history;its exit date matches the native Vendor,not a fabricated recurring annual decommissioning duty.',
      {owner_role:SQUIDWARD,day:dates.month(-8),cadence_or_trigger:'provider exit'}),
  ];

  const development = [
    process(['16.1','16.2'],'Current development / vulnerability-handling2.0 excerpts',
      'Design,coding,training,third-party code and testing are controlled. Internal/external reports enter intake,assignment,severity,remediation and retest with identification/analysis/remediation timing metrics. Outside-stakeholder reporting expectations are considered;reporters need no enterprise account.',
      {cadence_or_trigger:'16.1/16.2 documentation annually and significant change'}),
    row(['16.2','16.3'],'APP-AUTH27 intake / causal correction','application-controls.csv',
      'Synthetic report received'+dates.day(-12)+'09:00,triaged11:00;correction'+dates.day(-11)+'11:00,retest13:00. Missing per-resource ownership check is corrected;cross-franchise request DENY,own-franchise request ALLOW. Related path gains regression coverage;operating retest is not native Finding validation.',
      {day:dates.day(-10),cadence_or_trigger:'vulnerability report and causal review'}),
    row(['16.4','16.5'],'Current/planned component evaluation','application-controls.csv',
      'CT07 records maintained version,approved source,menu-sync use,dependencies and request-parsing risk. Planned CT12 records intended use and token-handling risk before adoption. Monthly composition comparison checks updates,removals and support;names/versions are fictional rather than external-publisher claims.',
      {day:prior(20,'monthly'),cadence_or_trigger:'component inventory evaluated at least monthly;selection/use controls between evaluations'}),
    row(['16.5','16.7'],'Controlled dependency / hardened deployment','application-controls.csv',
      'Selected component matches approved provenance;unapproved source rejected. Deployed ordering workload retains restricted services,nondefault identities and hardened server/database settings;application change cannot reopen denied administration. Template settings are compared to effective deployment.'),
    process(['16.6'],'Current severity / release-acceptability2.0 excerpt',
      'Exploitability and employee/customer/franchise impact determine correction priority. Release gate rejects unresolved unacceptable severity;exceptions require explicit residual decisions. Vulnerability severity,work priority and Risk score remain different measures.',{cadence_or_trigger:'severity system/process maintained at least annually'}),
    row(['16.8'],'Production/nonproduction boundary','application-controls.csv',
      'Test identity cannot read production ordering data or administer its workload. Nonproduction uses synthetic guest/contact values and has no production credential access. Controlled artifact promotion succeeds without granting standing production administration to the development identity.'),
    row(['16.9'],'Annual developer secure-code delivery','application-controls.csv',
      'Development-role roster has annual secure-code delivery recorded for assigned personnel. Practical responses reject cross-franchise access,unsafe input and secrets in code;service-isolation exercise retained. This is specialist delivery rather than a substitution of general workforce awareness.',
      {day:dates.month(-4),cadence_or_trigger:'developer training at least annually'}),
    row(['16.10','16.11'],'DESIGN14 / vetted security services','application-controls.csv',
      'Design restricts service identity,mediates every order operation and rejects oversized,malformed/wrong-type input with safe errors. Maintained identity/session,encryption and attributable logging services are reused;custom password or cryptographic code is not introduced.'),
    row(['16.12'],'Static/dynamic release checks','application-controls.csv',
      'Source change CH-145 receives static analysis and a dynamic test deployment. Eight targeted authorization/input cases produce expected permitted/denied results;findings route to vulnerability handling. Change and selected tools are identified without claiming a CIS every-commit mandate.',{cadence_or_trigger:'application lifecycle;checks selected for the change'}),
    row(['16.13'],'Performed ordering/franchise application test','application-controls.csv',
      'Qualified fictional tester manually exercises authenticated and unauthenticated paths:guest menu ALLOW;unauthenticated staff orders DENY;franchise04 accessing franchise05 orders DENY;attempted administrative elevation DENY. Performed scope/results are retained,not a scanner receipt or future appointment.',
      {day:dates.month(-2),cadence_or_trigger:'application-program schedule/change triggers;no independent numeric16.13 interval'}),
    row(['16.14'],'Pre-code threat model DESIGN14','application-controls.csv',
      'Trained reviewers map guest,outlet and administrator entry points,assets,access levels and trust boundaries before coding. Cross-franchise access,replay and excessive integration authority lead to recorded per-resource checks,bounded requests and restricted service rights.',
      {day:dates.month(-3),cadence_or_trigger:'design before code'}),
  ];

  const responseTesting = [
    row(['17.1','17.2'],'Response assignments / contact-route checks','incident-readiness.csv',
      'Squidward primary,SpongeBob backup,Eugene executive decision owner. Primary/alternate internal and provider role routes checked,including an unavailable ordering/collaboration service. Third-party response retains an internal overseer;no real address or call is supplied.',
      {owner_role:SQUIDWARD,day:prior(88,'annual'),cadence_or_trigger:'17.1 annually/significant change;17.2 contacts at least annually'}),
    process(['17.3'],'Current workforce-reporting2.0 excerpt',
      'Report suspected incidents without delay through the published security route or alternate manager/telephone route. Include outlet,asset,time and observed facts;do not wait for final severity. Instructions are workforce-accessible,not restricted to administrators.',{owner_role:SQUIDWARD}),
    process(['17.4','17.5','17.6'],'Current response/communications2.0 excerpts',
      'Business decisions,technical containment/recovery,analysis,personnel/facilities,legal and communications have assigned roles/alternates. Audiences and primary/secondary channels are identified;compromised collaboration requires an independent alternate. Incident conclusion is separate from corrective-work validation.',{owner_role:SQUIDWARD}),
    row(['17.7'],'Performed POS-support incident exercise','incident-readiness.csv',
      'Outlet,engineering and executive roles exercise compromised support identity plus unavailable primary channel. Alternate routing,containment authority,compliance escalation and recovery decisions have four recorded decision points and accountable follow-up. Attendance alone is not a successful response result.',
      {owner_role:SQUIDWARD,day:prior(88,'annual'),cadence_or_trigger:'performed incident exercise at least annually'}),
    row(['17.8'],'INC12 post-incident lessons','incident-readiness.csv',
      'Retrospective records identification/containment of a historical overbroad temporary support role and the handoff cause. Follow-up removed the grant,confirmed denied access and installed expiry/reconciliation checks. Lessons and operating retest remain separate from native Action/Finding decisions;no current missing access control is asserted.',
      {owner_role:SQUIDWARD,day:dates.month(-5),cadence_or_trigger:'after an incident;no invented annual occurrence'}),
    process(['17.9'],'Current incident-threshold2.0 excerpt',
      'Blocked scan without unauthorized access is an event;unauthorized administration,confidential export or multi-outlet disruption triggers incident evaluation. Impact/scope determine priority,escalation and update frequency;an alert does not automatically make an incident Critical.',{owner_role:SQUIDWARD}),
    row(['17.9'],'Annual threshold / escalation decision check','incident-readiness.csv',
      'Three controlled cases classified:event-only blocked scan;unauthorized-administration incident;multi-outlet disruption incident. Threshold matrix yields the intended owner,escalation and update frequency;no automatic severity inflation. Recorded significant-change maintenance retains the same existing Incident document.',
      {owner_role:SQUIDWARD,day:prior(88,'annual'),cadence_or_trigger:'thresholds annually and significant change'}),
    process(['18.1'],'Current testing-program2.0 excerpt',
      'Scope covers public ordering/API exposure,internal outlet/cloud trust boundaries and relevant physical controls. External/internal tests retain annual minimums;application scope follows its own program. Limits,hours,contacts,excluded destructive/provider activity,remediation and retrospective duties are recorded.',
      {cadence_or_trigger:'program-defined maintenance;no independent numeric18.1 document-review minimum'}),
    row(['18.2'],'Performed qualified external test EXT01','penetration-results.csv',
      'Enterprise/environmental reconnaissance reconciles eight public service targets and permitted interfaces. Twelve manual paths exercised;bounded diagnostic-response disclosure EXT01 handed to engineering. Qualification,scope and authorization references are fictional program records,not certification or an appointment.',
      {day:prior(96,'annual'),cadence_or_trigger:'external test at least annually'}),
    row(['18.3'],'EXT01 prioritized correction / retest','penetration-results.csv',
      'Engineering owner and impact-based target recorded;diagnostic response corrected and retest no longer exposes detail while permitted operation remains usable. Operating retest does not itself mark a native Finding validated or a Risk accepted/closed.',
      {day:after(prior(96,'annual')),cadence_or_trigger:'test findings under risk-prioritized remediation timelines'}),
    row(['18.4'],'EXT01 security-measure validation','penetration-results.csv',
      'Defender observations compared to external-test techniques. Suspicious administration alert lacked outlet attribution;correlation rule adjusted and controlled replay reaches the correct response queue. Defense validation is separate from the diagnostic-disclosure correction.',
      {day:after(prior(96,'annual')),cadence_or_trigger:'after each penetration test;modify measures when necessary'}),
    row(['18.5'],'Performed qualified internal test INT01','penetration-results.csv',
      'Internal test exercises customer wireless -> POS management,ordinary workforce -> personnel store and permitted private administration. Unauthorized paths denied;authorized administration still requires assigned identity/controls. Performed internal scope is separate from external testing or routine segmentation checks.',
      {day:prior(110,'annual'),cadence_or_trigger:'internal test at least annually'}),
    row(['18.4'],'INT01 security-measure validation','penetration-results.csv',
      'Network/host prevention and central alert observations reconciled with internal-test attempts;expected blocks and accountable alerts present. No ruleset change needed for these sampled techniques;that decision is recorded rather than inventing a change.',
      {day:after(prior(110,'annual')),cadence_or_trigger:'after each penetration test;modify measures when necessary'}),
    row(['18.4'],'Application-test security-measure validation','penetration-results.csv',
      'Authenticated cross-franchise and unauthenticated protected-resource attempts reconciled with application authorization outcomes and attributable alerts. Existing measures handle the sampled techniques;no-change decision retained separately from application findings and native closure.',
      {day:after(dates.month(-2)),cadence_or_trigger:'after each penetration test,including the application test'}),
  ];

  const artifacts = [
    artifact('inventory-software','Inventory,software and allowlisting excerpts',inventorySoftware),
    artifact('data-configuration','Data handling and configuration excerpts',dataConfiguration),
    artifact('identity-endpoint','Identity,messaging and endpoint observations',identityEndpoint),
    artifact('vulnerability-logging','Vulnerability and actual log-examination observations',vulnerabilityLogging),
    artifact('network-recovery','Architecture and performed recovery observations',networkRecovery),
    artifact('network-protection','Detection,prevention and actual threshold tuning',networkProtection),
    artifact('workforce-providers','Learning and provider-lifecycle observations',workforceProviders),
    artifact('development','Application lifecycle and performed testing observations',development),
    artifact('response-testing','Incident and penetration-testing observations',responseTesting),
  ];
  for (const artifact of artifacts) for (const entry of artifact.rows) {
    if (!validDay(entry.observed_at) || entry.observed_at < origin || entry.observed_at > cutoff)
      throw new Error('Krusty observations must remain within the enrolled v8.1 period and assessment cutoff.');
  }
  return artifacts;
}
