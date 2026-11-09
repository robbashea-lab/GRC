import {activeDefinitions} from '../../lib/frameworks';
import socGuidedCatalog from '@catalogs/guidedSoc2.json';
import {validateSocCompletion, socGuidedResult} from '../../lib/socGuidedAssessment';

// Uninstalled synthetic current facts, not historical interviews or verified Evidence.
export const PRESTIGE_CURRENT_AS_OF = '2026-11-02';
export const PRESTIGE_CURRENT_QUESTION_VERSION = 'soc2-omni-2';
export const PRESTIGE_CURRENT_CATEGORIES = ['security', 'availability', 'confidentiality'];

const accounts = {grc: 'demo_prestige_user_0', executive: 'demo_prestige_user_1', engineering: 'demo_prestige_user_2'};
const contacts = {grc: 'demo_prestige_contact_0', executive: 'demo_prestige_contact_1', engineering: 'demo_prestige_contact_2',
  contracts: 'demo_prestige_contact_3', creative: 'demo_prestige_contact_4', people: 'demo_prestige_contact_5'};
// Each affirmative response below has its own authored facts; no catalog question defaults to Yes.
const practice = detail => ({answer: 'Yes', detail});

export const PRESTIGE_CURRENT_ASSESSMENTS = {
  'CC1.1': {
    owner_id: accounts.executive, process_owner_id: contacts.people,
    technology: 'Conduct register; staff and contractor briefings; confidential concern route',
    rationale: 'Ethical handling of unreleased media, royalty information and customer commitments is an operating responsibility, including under delivery pressure.',
    evidence_subjects: ['Conduct expectations and acknowledgements', 'Redacted concern-handling exercise', 'Customer export pause decision'],
    responses: {
      'CC1.1-expectations': practice('Alice briefs staff and project contractors on honest rights clearance, confidential media handling and reporting concerns before access is granted; Derek repeats the expectations at creative-project intake.'),
      'CC1.1-leadership': practice('Robert requires Nancy to pause a customer export when rights or retention conditions are unresolved. The retained migration-setback decisions show that delivery revenue does not override the handling rules.'),
      'CC1.1-adherence': practice('Dale samples project conduct acknowledgements and confidential-delivery exceptions. Staff and contractors can raise concerns to Alice or directly to Robert when the normal supervisor is involved.'),
      'CC1.1-departures': practice('Alice assesses concerns with Robert, restricts the affected activity when needed and records a proportionate response. A redacted exercise checks escalation and conflicts; absence of complaints is not used as proof.'),
    },
  },
  'CC1.2': {
    owner_id: accounts.executive, process_owner_id: contacts.executive,
    technology: 'Owner-led oversight agenda; conflict register; internal readiness workpapers',
    rationale: 'The owner-led structure provides challenge outside engineering without pretending Prestige has an independent corporate board or a CPA opinion.',
    evidence_subjects: ['Owner oversight decisions', 'Conflict and recusal arrangements', 'Migration correction and validation challenge'],
    responses: {
      'CC1.2-objectivity': practice('Robert challenges engineering decisions using Dale\'s control and customer-impact workpapers. A matter concerning Robert routes to the retained provider lead for independent internal challenge and a recorded conflict response.'),
      'CC1.2-structure-note': {answer: 'Owner-led governance: Robert is executive sponsor; Dale reports program performance directly to him. Morgan Ellis provides independent internal challenge where the operating owner or sponsor has a conflict. This is not an external attestation.'},
      'CC1.2-development': practice('Robert reviews the proposed portal boundary, recovery objectives, migration-role restrictions and funding before significant control-design changes. Nancy challenges whether the design meets the customer commitments.'),
      'CC1.2-performance': practice('Dale presents missed controls, original failed recovery results and later validation separately. Robert questions unresolved exceptions and follows corrective work through the next owner review rather than accepting ticket closure as validation.'),
    },
  },
  'CC1.3': {
    owner_id: accounts.executive, process_owner_id: contacts.grc,
    technology: 'Responsibility matrix; escalation roster; provider responsibility schedules',
    rationale: 'Licensing operations, engineering and suppliers have explicit authority and reporting paths within the portal service boundary.',
    evidence_subjects: ['Current responsibility matrix', 'Deputy and escalation roster', 'Supplier shared-responsibility schedule'],
    responses: {
      'CC1.3-structure': practice('Dale reports control performance to Robert; Brennan owns technical operations, Nancy customer commitments, Derek creative handling and Alice personnel processes. Supplier incidents reach Brennan and Dale through named escalation contacts.'),
      'CC1.3-authority': practice('Robert funds the program and decides material residual risk; Brennan authorizes technical work within delegated limits; Nancy can stop an unauthorized delivery. Provider-managed facilities remain supplier responsibilities with an accountable Prestige owner.'),
    },
  },
  'CC1.4': {
    owner_id: accounts.grc, process_owner_id: contacts.people,
    technology: 'Role competence matrix; supervised recovery exercises; deputy runbooks',
    rationale: 'The small team maintains the skills and continuity needed for secure media delivery and recovery, including contractor and provider interfaces.',
    evidence_subjects: ['Role competence and engagement checks', 'Recovery exercise participation', 'Deputy handover and training outcomes'],
    responses: {
      'CC1.4-attract': practice('Alice and the role owner define cloud, rights-clearance and confidential-handling skills before hiring or engaging a contractor. Brennan verifies technical experience and Dale checks that temporary provider coverage closes a vacant skill.'),
      'CC1.4-develop': practice('Brennan coaches engineers through access, rollback and full-service restoration exercises; Nancy and Derek train rights specialists and creative contractors on current project rules. Owners evaluate task performance as well as attendance.'),
      'CC1.4-retain': practice('Robert reviews workload and key-person exposure; documented deputies and provider escalation cover Brennan\'s absence. The current handover exercise demonstrates that another authorized operator can follow the recovery runbook.'),
    },
  },
  'CC1.5': {
    owner_id: accounts.executive, process_owner_id: contacts.grc,
    technology: 'Control-owner register; management follow-up and exception records',
    rationale: 'Named owners understand expected outcomes and management follows missed responsibilities through correction and separate validation.',
    evidence_subjects: ['Owner responsibility confirmations', 'Missed-work escalation record', 'Corrective action and separate validation decisions'],
    responses: {
      'CC1.5-expectations': practice('Dale agrees each owner\'s control outcome, operating interval, evidence subject and escalation route. Brennan, Nancy, Derek and Alice confirm their responsibilities; provider work retains an internal accountable owner.'),
      'CC1.5-follow-through': practice('Missed work reaches Dale and then Robert according to significance. The migration role, retention and restore issues retained their original failures and due dates; management followed corrections and required later validation rather than changing the original outcome.'),
    },
  },
  'CC2.1': {
    owner_id: accounts.grc, process_owner_id: contacts.grc,
    technology: 'Reconciled access exports; service telemetry; customer commitment and rights registers',
    rationale: 'Control decisions use complete, dated populations rather than an unexamined dashboard or an illustrative sample count.',
    evidence_subjects: ['Current population reconciliation', 'Telemetry coverage checks', 'Rights and retention exception decisions'],
    responses: {
      'CC2.1-information': practice('Owners obtain Okta and application access lists, project rights and retention metadata, portal availability measurements, vulnerability results and provider notices needed for the selected service commitments.'),
      'CC2.1-quality': practice('Brennan reconciles identity exports with direct/local and service accounts and checks telemetry gaps. Nancy reconciles the customer population to retention tags and rights records; missing or stale inputs are assigned for correction before decisions rely on them.'),
      'CC2.1-use': practice('Access reviewers record removals from the reconciled population; Nancy blocks inconsistent deliveries; Brennan prioritizes capacity or recovery work from measured results. Dale checks the resulting decisions and follow-up rather than only collecting exports.'),
    },
  },
  'CC2.2': {
    owner_id: accounts.grc, process_owner_id: contacts.people,
    technology: 'Role briefings; controlled runbooks; incident and question escalation channels',
    rationale: 'The people delivering customer media receive objectives, changed procedures and a working two-way issue route.',
    evidence_subjects: ['Current team and contractor briefings', 'Changed runbook communication', 'Issue escalation exercise'],
    responses: {
      'CC2.2-objectives': practice('Dale explains the 99.9% monthly portal commitment, authorized-project-only media access and agreed record retention to engineering, support and creative leads. Alice includes role-specific responsibilities in staff and contractor onboarding.'),
      'CC2.2-responsibilities': practice('Brennan communicates changed deployment and restoration steps; Nancy communicates customer handling changes; Derek confirms project contractors received the current media rules. Superseded instructions remain identifiable and owners resolve questions.'),
      'CC2.2-escalation': practice('Staff can raise a failed control or uncertain delivery through Dale, the incident contact or directly to Robert for a conflict. A current exercise confirms the issue reaches a decision-maker and receives a tracked response.'),
    },
  },
  'CC2.3': {
    owner_id: accounts.grc, process_owner_id: contacts.contracts,
    technology: 'Customer license schedules; support intake; supplier notification contacts',
    rationale: 'Customer and provider communications describe actual service responsibilities and preserve an inbound route for material concerns.',
    evidence_subjects: ['Customer service and confidentiality schedules', 'Supplier incident contact check', 'External concern disposition'],
    responses: {
      'CC2.3-outbound': practice('Nancy communicates portal availability, authorized delivery, retention and incident-contact terms in customer schedules. Brennan gives providers their technical escalation and access responsibilities; no customer copy promises certification or an independent SOC opinion.'),
      'CC2.3-inbound': practice('Customer support routes rights, availability and disclosure concerns to Nancy and Dale. Provider security/change notices reach Brennan, with significance and response recorded; current contact tests cover both routes.'),
    },
  },
  'CC3.1': {
    owner_id: accounts.executive, process_owner_id: contacts.contracts,
    technology: 'Service commitment register; approved availability and recovery objectives',
    rationale: 'Explicit business outcomes allow risk significance to be judged for the licensing service without inventing universal SOC thresholds.',
    evidence_subjects: ['Customer commitment and system requirement register', 'Management-selected recovery objectives', 'Risk significance criteria'],
    responses: {
      'CC3.1-clarity': practice('Nancy and Brennan translate the 99.9% monthly portal commitment, project-confidential media handling and agreed record retention into named system objectives covering portal access, media, rights metadata and supporting people/providers.'),
      'CC3.1-assessment': practice('Robert approves the business tolerances and management-selected recovery targets used by risk owners. The current recovery plan specifies four-hour restoration and a 24-hour data-loss objective for the complete scoped service, not an AICPA-prescribed target.'),
    },
  },
  'CC3.2': {
    owner_id: accounts.grc, process_owner_id: contacts.grc,
    technology: 'Native risk register; 5-by-5 assessment method; treatment and acceptance records',
    rationale: 'Risk assessment connects realistic licensing-service threats to explicit treatment or time-bounded acceptance rather than treating a control inventory as analysis.',
    evidence_subjects: ['Current service risk workshop', 'Retained ratings and treatment decisions', 'Residual acceptance and review subjects'],
    responses: {
      'CC3.2-identification': practice('Dale considers media disclosure, incorrect rights metadata, provider outage, fraud, contractor access, recovery dependencies and AI misuse with engineering, contracts and creative operations, including external services and personnel changes.'),
      'CC3.2-analysis': practice('Owners use the unchanged native likelihood-by-impact method, stated scenarios and business consequences. Earlier migration ratings remain visible alongside current assessments; control existence does not automatically lower a score.'),
      'CC3.2-response': practice('Each assessed risk has a responsible owner and a treatment, avoidance or justified acceptance decision. Robert reviews material residual exposure and expiry; a completed action, recorded AI intake or closed finding does not itself review or close the risk.'),
    },
  },
  'CC3.3': {
    owner_id: accounts.grc, process_owner_id: contacts.contracts,
    technology: 'Fraud workshop; rights approval separation; payout-change verification',
    rationale: 'Deliberate misuse of rights, customer accounts or royalty instructions is considered separately from accidental processing errors.',
    evidence_subjects: ['Fraud scenario assessment', 'Rights and payment change controls', 'Misuse response exercise'],
    responses: {
      'CC3.3-consideration': practice('Nancy and Dale assess forged licensee requests, manipulated territory or expiry metadata, redirected royalty instructions, insider downloads and management override. Derek contributes contractor and creative-rights misuse scenarios.'),
      'CC3.3-assessment': practice('The workshop considers opportunity, incentive, access and plausible business impact. Independent confirmation of sensitive payout changes, separated rights approval and reviewed privileged activity address the identified scenarios; remaining exposure stays in the risk register.'),
    },
  },
  'CC3.4': {
    owner_id: accounts.grc, process_owner_id: contacts.engineering,
    technology: 'Change intake; service boundary revisions; customer and supplier change reviews',
    rationale: 'Significant changes trigger a review of risks, ownership and customer obligations; the original migration setback remains a separate historical event.',
    evidence_subjects: ['Significant-change impact review', 'Current service boundary and responsibility revision', 'Post-migration correction validation'],
    responses: {
      'CC3.4-identification': practice('Brennan flags architecture, deployment and provider changes; Nancy flags customer terms and retention changes; Alice flags key-person changes. Dale also reviews AI adoption and new confidential-data flows before they enter the service boundary.'),
      'CC3.4-impact': practice('Owners assess access, retention, recovery and responsibility impacts before acceptance and recheck after implementation. The failed 2023 migration review led to explicit control changes and separate 2024 validation, not a retroactive claim that the migration was clean.'),
    },
  },
  'CC4.1': {
    owner_id: accounts.grc, process_owner_id: contacts.grc,
    technology: 'Internal evaluation plan; configuration samples; operating workpapers',
    rationale: 'Ongoing checks and separate internal evaluations examine actual operation without presenting a questionnaire or supplier report as a CPA examination.',
    evidence_subjects: ['Risk-based internal evaluation coverage', 'Access and recovery operating samples', 'Current internal readiness reconciliation'],
    responses: {
      'CC4.1-design': practice('Dale selects ongoing access, telemetry and exception checks plus separate risk-based reviews of service recovery and confidential handling. The plan covers all selected Security, Availability and Confidentiality criteria and identifies evaluators separate from the work being challenged.'),
      'CC4.1-performance': practice('Evaluators inspect dated populations, settings and outcomes rather than accepting a completed checklist alone. Current workpapers distinguish control design, performed instances, original exceptions and later validation; these are internal management evaluations, not an auditor opinion.'),
    },
  },
  'CC4.2': {
    owner_id: accounts.grc, process_owner_id: contacts.grc,
    technology: 'Findings triage; corrective actions; separate validation and escalation records',
    rationale: 'Deficiencies receive prompt significance and responsibility decisions; action completion and finding validation retain distinct meanings.',
    evidence_subjects: ['Deficiency significance and escalation workpapers', 'Corrective action completion', 'Fresh validation evidence and decisions'],
    responses: {
      'CC4.2-evaluation': practice('Dale evaluates a failed access, retention or recovery result for affected customers, objectives and urgency. An accepted residual risk does not erase a control deficiency; the original failure and relevant population remain in the workpapers.'),
      'CC4.2-communication': practice('Brennan or the relevant business owner receives the correction and due date, while material issues reach Robert and Nancy. Dale validates the corrected result using fresh evidence after the action completes; a ticket cannot silently validate its own finding.'),
    },
  },
  'CC5.1': {
    owner_id: accounts.grc, process_owner_id: contacts.grc,
    technology: 'Risk-to-control design register; responsibility and coverage review',
    rationale: 'Management selects controls for the service risks, not to satisfy a fabricated universal SOC control list.',
    evidence_subjects: ['Risk-to-control rationale', 'Coverage and shared-responsibility review', 'Migration design correction decisions'],
    responses: {
      'CC5.1-selection': practice('Dale maps unauthorized delivery to project grants and rights approval, outage to monitored capacity and tested recovery, and retention failure to customer-specific tags and disposal checks. Owners explain why each activity responds to the stated risk.'),
      'CC5.1-development': practice('Brennan and Nancy define scope, decision authority, evidence and exception handling for selected controls. The former broad migration role and missing metadata restore were corrected and validated; residual risks retain explicit management decisions instead of being called implemented gaps.'),
    },
  },
  'CC5.2': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'AWS responsibility matrix; Okta; GitHub delivery controls; monitoring and recovery runbooks',
    rationale: 'Technology safeguards cover the application, data and administrative dependencies that Prestige actually controls, with provider responsibilities separately assessed.',
    evidence_subjects: ['Technical dependency and responsibility matrix', 'Access, deployment and backup settings', 'Operational exception checks'],
    responses: {
      'CC5.2-selection': practice('Brennan selects identity, cloud access, configuration, delivery, vulnerability, logging and recovery activities for the portal, S3 media, PostgreSQL rights data, index, endpoints and supporting SaaS dependencies.'),
      'CC5.2-development': practice('Each activity has an internal owner, documented settings and a tested operating procedure. AWS facilities are provider-managed; Prestige checks relevant assurance and its own configuration. Purchasing Okta, monitoring or cloud backup alone is not counted as operating the control.'),
    },
  },
  'CC5.3': {
    owner_id: accounts.grc, process_owner_id: contacts.grc,
    technology: 'Controlled policy set; role procedures; version and exception registers',
    rationale: 'Policy expectations are translated into performed procedures for customer media and supporting systems.',
    evidence_subjects: ['Current policy and procedure responsibilities', 'Publication and role briefing subjects', 'Performed procedure and exception samples'],
    responses: {
      'CC5.3-expectations': practice('Robert and Dale establish expectations for access, confidential handling, changes, suppliers, incidents and recovery. Owners receive the effective version and its responsibilities; the document title or number of separate policies does not decide implementation.'),
      'CC5.3-procedures': practice('Brennan operates access and delivery runbooks; Nancy and Derek apply rights and media-handling procedures; Alice operates personnel steps. Owners retain operating evidence, escalate departures and revise procedures after validated lessons rather than relying on policy existence.'),
    },
  },
  'CC6.1': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Okta application integrations; AWS IAM and S3 policies; portal authorization; secrets vault',
    rationale: 'Logical protections span workforce, customer, service and emergency paths; identity-provider coverage does not stand in for application authorization.',
    evidence_subjects: ['Access-path and account reconciliation', 'Project isolation and privileged-access tests', 'Emergency and provider access review'],
    responses: {
      'CC6.1-coverage': practice('Brennan inventories Okta-integrated apps, direct/local accounts, AWS roles, PostgreSQL service identities, GitHub administration and customer portal grants. Protected media and rights metadata are included alongside supporting endpoints and backups.'),
      'CC6.1-protection': practice('Configured Okta policies require MFA on the covered workforce routes; scoped AWS roles and S3 policies restrict media operations. Portal checks enforce customer/project authorization before issuing short-lived delivery URLs; link expiry alone is not treated as tenant isolation.'),
      'CC6.1-operation': practice('Current tests cover denied cross-project requests, privileged roles, service credentials and vaulted emergency access. Direct/provider accounts have separate approval and review, and emergency use alerts reach an accountable operator.'),
    },
  },
  'CC6.2': {
    owner_id: accounts.engineering, process_owner_id: contacts.people,
    technology: 'Personnel and contractor register; Okta provisioning; direct-account removal checklist',
    rationale: 'Registration, authorization and revocation are separate operating steps for employees, contractors and relevant external identities.',
    evidence_subjects: ['Joiner and contractor access population', 'Approval-before-access samples', 'Leaver and session-revocation reconciliation'],
    responses: {
      'CC6.2-registration': practice('Alice records identity, sponsor, project and end date before a staff or contractor account is created. Nancy verifies customer contacts and their licensee/project context before customer portal registration.'),
      'CC6.2-authorization': practice('A responsible manager authorizes the role and project before credentials or access are issued; Brennan separately authorizes privileged technical access. The current sample compares recorded authorization and provisioning times.'),
      'CC6.2-revocation': practice('Alice triggers Okta disablement and Brennan checks connected apps, direct database accounts, API credentials and active sessions. Systems without automatic deprovisioning use a tracked manual step; the former late contractor removal remains a historical exception.'),
    },
  },
  'CC6.3': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Role and project entitlement matrix; access review; change and removal tickets',
    rationale: 'Permissions follow current duties and project boundaries, including changes that do not involve a new identity.',
    evidence_subjects: ['Current entitlement-to-role reconciliation', 'Mover and project-end removals', 'Migration-role restriction validation'],
    responses: {
      'CC6.3-entitlements': practice('Brennan maps workforce and service permissions to technical duties; Nancy and Derek confirm customer and contractor project rights. Owners authorize access against the actual role, customer contract and system design.'),
      'CC6.3-changes': practice('Role moves, customer project ends and architecture changes trigger modification or removal, followed by reconciliation. The broad migration role was narrowed and its old permissions remain visible in the historical correction chain.'),
      'CC6.3-considerations': practice('Least privilege is checked across portal, AWS, PostgreSQL and GitHub permissions. Rights approval, production deployment and sensitive payment changes separate incompatible duties or require a documented independent check; privileged exceptions receive an owner and expiry.'),
    },
  },
  'CC6.4': {
    owner_id: accounts.engineering, process_owner_id: contacts.creative,
    technology: 'Office badge and visitor controls; endpoint inventory; cloud facility responsibility review',
    rationale: 'Cloud hosting does not remove Prestige\'s physical responsibilities for creative workspaces, devices and confidential media.',
    evidence_subjects: ['Office and visitor access review', 'Device and media custody samples', 'Provider facility responsibility assessment'],
    responses: {
      'CC6.4-facilities': practice('Derek limits office and edit-suite badge access, sponsors visitors and checks badge removal when duties end. Brennan reviews the relevant AWS facility assurance and responsibility boundary without claiming to operate provider data centers.'),
      'CC6.4-assets': practice('Managed laptops are inventoried and secured during storage, travel and servicing. Removable media is restricted and logged; confidential source material is not left in shared meeting areas. Asset custody and office access samples support the current assessment.'),
    },
  },
  'CC6.5': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Asset retirement register; sanitization and custody checklist; disposal receipts',
    rationale: 'Physical devices leave protection only after information and software recoverability and retention needs have been addressed.',
    evidence_subjects: ['Retirement and retention authorization', 'Sanitization verification', 'Device release and custody receipt'],
    responses: {
      'CC6.5-recoverability': practice('Brennan selects sanitization appropriate to the device and data, verifies the result and removes credentials and management assignments before releasing a retired laptop or media device. Encryption alone is not assumed to prove every disposal safe.'),
      'CC6.5-release': practice('Nancy checks customer retention and legal holds before the authorized retirement proceeds. The register ties the device, permitted retained copy, sanitization result and subsequent release receipt together; custody remains controlled until those checks finish.'),
    },
  },
  'CC6.6': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Cloudflare edge controls; AWS security groups; restricted administration; boundary inventory',
    rationale: 'External routes are explicitly controlled, including direct origins and provider administration rather than only the public portal hostname.',
    evidence_subjects: ['External entry-path inventory', 'Boundary rule and exception review', 'Unauthorized origin and administration tests'],
    responses: {
      'CC6.6-entry-paths': practice('Brennan inventories portal/API entry, DNS, direct cloud origins, support integrations and remote administration. Edge and origin restrictions expose only intended services; production data services are not accepted as public entry points.'),
      'CC6.6-enforcement': practice('Current boundary tests check direct-origin and administration denial as well as the normal Cloudflare route. Security-group changes and provider access exceptions require review and follow-up; a DNS or edge product alone is not proof of enforcement.'),
    },
  },
  'CC6.7': {
    owner_id: accounts.engineering, process_owner_id: contacts.contracts,
    technology: 'Authorized portal delivery; encrypted transport; restricted export and backup workflows',
    rationale: 'Media movement requires both a valid business authorization and suitable protection during transfer.',
    evidence_subjects: ['Authorized customer delivery sample', 'Transport and export configuration review', 'Contractor and backup transfer exceptions'],
    responses: {
      'CC6.7-authorization': practice('Nancy confirms licensee, project, territory and expiry before release; portal authorization checks run before signed URLs are issued. Contractor exports and backup jobs use approved identities and scoped destinations, with exceptional bulk movement reviewed.'),
      'CC6.7-protection': practice('Brennan verifies encrypted portal/API transport and approved encrypted backup transfer. Short-lived S3 URLs remain bearer permissions and cannot prevent an authorized recipient redistributing a download; contracts, logging and residual-risk review address that remaining exposure.'),
    },
  },
  'CC6.8': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Managed endpoint protection; restricted software installation; isolated media intake',
    rationale: 'Creative files, endpoints and delivery dependencies receive malware prevention/detection and a defined response when prevention fails.',
    evidence_subjects: ['Endpoint and software coverage reconciliation', 'Media intake and detection checks', 'Quarantine and clean-rebuild exercise'],
    responses: {
      'CC6.8-prevention-detection': practice('Brennan limits installation privileges, maintains endpoint protection and reconciles device coverage. Untrusted customer/contractor media enters a restricted intake workflow; dependency checks complement these controls but are not described as a malware scanner for every file.'),
      'CC6.8-response': practice('A detection routes to the incident owner for isolation, affected-credential review and scoped investigation. The current exercise verifies quarantine and restoration from a known-clean source before the device or media returns to production use.'),
    },
  },
  'CC7.1': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Configuration comparisons; Snyk Open Source; vulnerability and patch queues',
    rationale: 'Configuration drift and newly disclosed vulnerabilities are evaluated as different sources of exposure across the actual inventory.',
    evidence_subjects: ['Cloud and repository configuration differences', 'Dependency and component coverage', 'Patch and exception validation'],
    responses: {
      'CC7.1-changes': practice('Brennan compares deployed access, storage, network and repository settings to the approved configuration and evaluates unexpected changes. Public-storage or excessive-role changes enter a tracked correction and subsequent validation path.'),
      'CC7.1-new-vulnerabilities': practice('Snyk scans the selected supported repository manifests for direct and transitive dependency vulnerabilities; provider advisories and endpoint/software inventory cover other components. Owners assess exploitability, patch or justify time-bounded exceptions and validate corrections; SCA alone does not prove secure application code.'),
    },
  },
  'CC7.2': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Application and cloud telemetry; Datadog monitors; on-call triage',
    rationale: 'Monitoring combines useful coverage, missing-data handling and human analysis rather than equating a configured monitor with a detected incident.',
    evidence_subjects: ['Telemetry source and missing-data checks', 'Alert routing exercise', 'Anomaly triage and disposition samples'],
    responses: {
      'CC7.2-monitoring': practice('Brennan monitors portal errors, request rates, capacity, privileged access and media-delivery anomalies. Datadog thresholds and missing-data behavior are configured for the relevant sources; a coverage check identifies silent or delayed telemetry.'),
      'CC7.2-analysis': practice('The on-call operator compares anomalies with releases, customer activity and provider events, then records whether they represent a security event, service issue or expected behavior. Escalation and acknowledgement are tested, including missing telemetry.'),
    },
  },
  'CC7.3': {
    owner_id: accounts.grc, process_owner_id: contacts.engineering,
    technology: 'Event significance rubric; customer impact assessment; incident escalation records',
    rationale: 'Events are judged against confidentiality, availability and service commitments before the team chooses a proportionate response.',
    evidence_subjects: ['Event significance and affected scope', 'Customer impact and escalation decision', 'Response action disposition'],
    responses: {
      'CC7.3-impact': practice('Brennan and Dale assess an event\'s affected projects, identities, media, rights metadata and service duration. Nancy evaluates relevant customer commitments; investigation distinguishes a suspected event from a confirmed disclosure or availability failure.'),
      'CC7.3-action': practice('The significance decision determines containment, evidence preservation, customer/legal review and escalation. Current triage samples show an accountable decision and follow-up; a low-severity disposition requires rationale instead of silently dismissing the alert.'),
    },
  },
  'CC7.4': {
    owner_id: accounts.grc, process_owner_id: contacts.engineering,
    technology: 'Incident response runbook; scoped containment; communication and correction records',
    rationale: 'The response approach assigns technical and business responsibilities through understanding, containment, remediation and communication.',
    evidence_subjects: ['Current incident exercise and decision log', 'Containment and evidence preservation steps', 'Notification and remediation checks'],
    responses: {
      'CC7.4-understand': practice('Dale coordinates the response; Brennan establishes the timeline, affected accounts, data and systems; Nancy assesses customer and contract implications. The runbook specifies deputies and escalation to Robert, including uncertain initial scope.'),
      'CC7.4-contain': practice('Brennan can restrict project access, disable affected identities or credentials, isolate a device and pause an unsafe delivery while preserving investigation records. The team evaluates customer continuity before changing the affected service.'),
      'CC7.4-remediate': practice('The responsible owner removes the cause, rotates affected credentials or rebuilds components as needed and tests the corrected behavior. Dale records residual issues and separately validates remediation rather than assuming containment resolves the incident.'),
      'CC7.4-communication': practice('Nancy and Dale prepare factual, authorized notices for the affected customers/providers and internal roles under the applicable commitments. An exercise verifies contact and approval routes; the scenario does not invent a universal notification deadline.'),
    },
  },
  'CC7.5': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Full-service recovery runbook; clean environment; post-incident acceptance checks',
    rationale: 'Recovery restores a trustworthy licensing service, including dependent data and access, rather than only restarting a server.',
    evidence_subjects: ['Service dependency and recovery sequence', 'Clean-environment recovery exercise', 'Customer data and access acceptance checks'],
    responses: {
      'CC7.5-development': practice('Brennan identifies clean rebuild, media and rights-data recovery, index reconstruction, credential replacement and customer-access validation. Nancy defines the checks needed before customer delivery resumes and Robert provides deputy/provider coverage.'),
      'CC7.5-implementation': practice('Authorized operators can retrieve protected recovery materials and perform the current runbook in an isolated environment. Recorded tests verify media/metadata/index consistency and project access before acceptance; the old omitted-index failure remains a separate historical result.'),
    },
  },
  'CC8.1': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'GitHub pull requests and protected branches; tracked release and rollback procedures',
    rationale: 'The change process separately covers business authorization, design, development, configuration, documentation, testing, approval and controlled implementation.',
    evidence_subjects: ['Authorized portal and data change sample', 'Review and required-check configuration', 'Release, rollback and post-change verification'],
    responses: {
      'CC8.1-authorize': practice('An accountable owner authorizes the need and scope for infrastructure, application, rights-data and operating-procedure changes. Nancy authorizes customer-rule changes and Brennan authorizes the technical work within delegated limits.'),
      'CC8.1-design': practice('Design review considers customer/project isolation, confidentiality, retention, capacity, recovery dependencies and rollback. Changes affecting media or rights metadata include the index and delivery interfaces rather than reviewing code in isolation.'),
      'CC8.1-develop': practice('Engineers work in approved repositories and reviewed infrastructure definitions; acquired components receive dependency and supplier checks. Code-assistant output is treated as an untrusted contribution and follows the same review path.'),
      'CC8.1-configure': practice('The team checks environment-specific credentials, roles, storage and feature configuration before release. Production settings are compared with the reviewed design; test data and access do not become production defaults.'),
      'CC8.1-document': practice('The change record identifies the affected components, migration steps, responsibilities, operating instructions and rollback. Customer handling or recovery instructions are updated with the release and prior versions remain identifiable.'),
      'CC8.1-test': practice('Tests exercise intended behavior and relevant failure paths, including cross-project denials, media/rights consistency and rollback. Brennan reviews test results and outstanding exceptions before the release is eligible for approval.'),
      'CC8.1-approve': practice('An authorized reviewer considers the actual proposed change and results before deployment. Configured GitHub rules require reviewing pull requests and named status checks; administrator/bypass paths are included in the rule review and emergency use receives separate follow-up.'),
      'CC8.1-implement': practice('An authorized operator follows the approved release sequence, checks health and customer workflows and rolls back if acceptance fails. Emergency changes retain their original reason, operator and later review rather than acquiring a fabricated prior approval.'),
    },
  },
  'CC9.1': {
    owner_id: accounts.executive, process_owner_id: contacts.grc,
    technology: 'Business disruption analysis; continuity runbooks; alternate-contact and provider arrangements',
    rationale: 'Mitigations address provider concentration, loss of key personnel and unavailable creative workspaces as well as infrastructure failure.',
    evidence_subjects: ['Business disruption scenario review', 'Continuity and deputy arrangements', 'Alternate communication and recovery exercises'],
    responses: {
      'CC9.1-identification': practice('Dale evaluates cloud/identity outages, loss of Brennan\'s availability, office disruption, supplier failure and inaccessible media. Nancy identifies affected customer deadlines and communication dependencies for each scenario.'),
      'CC9.1-selection-development': practice('Robert funds documented deputy coverage, protected recovery materials, alternate communications and tested recovery arrangements. Owners exercise the selected activities and retain the concentration risks that continuity measures cannot remove; insurance is not described as a technical recovery control.'),
    },
  },
  'CC9.2': {
    owner_id: accounts.grc, process_owner_id: contacts.contracts,
    technology: 'Vendor and partner register; contract and assurance review; responsibility schedules',
    rationale: 'Supplier assurance informs a scoped relationship decision and ongoing follow-up; it does not transfer Prestige\'s responsibility or establish its own SOC opinion.',
    evidence_subjects: ['Current critical supplier assessment', 'Contract and assurance exceptions', 'Renewal, change and exit responsibility review'],
    responses: {
      'CC9.2-assessment': practice('Dale and Nancy assess AWS, Okta, delivery/support and other relevant providers for data handled, service dependency, access and customer obligations. Assurance scope, period, exceptions and customer responsibilities are reviewed rather than accepting a report title alone.'),
      'CC9.2-management': practice('Named owners track contractual duties, incident contacts, assurance follow-up, renewal/notice dates and exit needs as distinct work. Brennan verifies Prestige-operated settings, and material supplier changes feed risk review; an AI tool listing does not count as approval or supplier assurance.'),
    },
  },
  'A1.1': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Datadog capacity monitors; portal workload forecasts; tested scaling runbook',
    rationale: 'Capacity decisions use the licensing service\'s demand and availability commitment rather than assuming a cloud provider supplies unlimited capacity.',
    evidence_subjects: ['Current portal and data capacity review', 'Peak media-delivery load test', 'Scaling and quota readiness check'],
    responses: {
      'A1.1-capacity': practice('Brennan maintains processing, database, index and delivery capacity for the 99.9% monthly portal objective. The current peak-release load test includes customer media delivery and rights lookups, with headroom and bottlenecks recorded.'),
      'A1.1-demand': practice('Datadog measurements cover request rate, latency, error rate, database use and queue depth; missing data is escalated. Engineering compares trends and planned customer releases with measured capacity and provider/service limits.'),
      'A1.1-expansion': practice('An approved runbook identifies scaling actions, provider quotas, lead times and rollback. Brennan tests the relevant expansion and checks service behavior afterward instead of treating automatic-scaling settings as proof of adequate capacity.'),
    },
  },
  'A1.2': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'AWS hosted service; S3 versioning; PostgreSQL backups; separate Backblaze copy workflow',
    rationale: 'Availability protection combines provider responsibilities with Prestige-operated backup, recovery and maintenance controls.',
    evidence_subjects: ['Availability design and responsibility approval', 'Backup and secondary-copy configuration', 'Backup failure and recoverability checks'],
    responses: {
      'A1.2-authorize-design': practice('Brennan designs the hosted service, software, media versions, database recovery and protected recovery materials against the four-hour recovery and 24-hour data-loss objectives. AWS environmental responsibilities and Prestige\'s endpoint/office dependencies are documented separately.'),
      'A1.2-develop-approve-implement': practice('Robert authorizes the design and resources; Brennan implements the reviewed settings and operators. S3 versioning is explicitly enabled; a separate scoped upload workflow sends secondary backup copies to Backblaze B2, not S3 native replication into B2.'),
      'A1.2-operate-maintain': practice('Owners check backup runs, retained versions, recovery credentials, software updates and the full service dependency list. Lifecycle/deletion rules and permissions are reviewed because versioning alone is neither immutability nor proof that a copy remains recoverable.'),
      'A1.2-monitor': practice('Brennan checks failed or stale copies, database backup availability, missing telemetry and recovery-material access. A failed job receives an accountable response and retest; provider storage availability is not treated as evidence that Prestige\'s backup job succeeded.'),
    },
  },
  'A1.3': {
    owner_id: accounts.engineering, process_owner_id: contacts.engineering,
    technology: 'Isolated full-service restoration; media manifests; PostgreSQL and index reconciliation',
    rationale: 'Recovery tests measure the complete customer service against management-selected objectives and retain the earlier failed test.',
    evidence_subjects: ['Full media, metadata and index restore workpaper', 'Measured recovery and data-loss comparison', 'Independent internal acceptance and retained failure'],
    responses: {
      'A1.3-testing': practice('The current isolated test restores media, restores PostgreSQL to a new instance from available retained backups, rebuilds the index and validates rights, project access and sample deliveries. Dale reviews the result separately from Brennan\'s restoration work; the 2023 omitted-index failure is preserved.'),
      'A1.3-objectives': practice('The synthetic current workpaper records three hours ten minutes to accepted service and a 40-minute data gap, within the selected four-hour and 24-hour objectives. The comparison covers the full media/metadata/index workflow, not only database restoration or a claim that AWS guarantees those results.'),
    },
  },
  'C1.1': {
    owner_id: accounts.grc, process_owner_id: contacts.contracts,
    technology: 'Customer rights and classification register; project-scoped media storage; restricted analytics extracts',
    rationale: 'Confidential information is identified at intake and remains governed through storage, use, sharing, retention and supporting supplier flows.',
    evidence_subjects: ['Customer classification and handling reconciliation', 'Project and supplier confidentiality access review', 'Current retention-tag validation'],
    responses: {
      'C1.1-identification': practice('Nancy identifies unreleased media, contract terms, customer contacts, rights metadata and royalty records when created or received. The project register records the customer confidentiality and retention obligations; Derek labels creative working material consistently.'),
      'C1.1-maintenance': practice('Project grants, scoped storage policies and authorized transfer protect the identified data; analytics uses restricted extracts. Nancy reconciles retention tags to customer terms, including the corrected migration population. Public-copy AI workflows exclude confidential inputs and do not replace customer authorization.'),
    },
  },
  'C1.2': {
    owner_id: accounts.grc, process_owner_id: contacts.contracts,
    technology: 'Retention and hold register; controlled object/version disposal; supplier deletion follow-up',
    rationale: 'Disposal respects both confidentiality and required retention, including recoverable versions and copies rather than only the current portal object.',
    evidence_subjects: ['Disposal eligibility and legal-hold reconciliation', 'Object, version and copy disposal validation', 'Supplier retention and deletion follow-up'],
    responses: {
      'C1.2-identification': practice('Nancy identifies expired project material and records the retention basis, customer instruction and any hold before authorizing disposal. The population includes media versions, rights metadata, extracts, contractor copies and relevant supplier-held material.'),
      'C1.2-disposal': practice('Brennan performs controlled deletion and checks authorized versions/copies and access removal against the approved scope. Backup retention and holds may delay final removal and are recorded honestly; a delete marker or a generic supplier promise is not treated as immediate irreversible destruction.'),
    },
  },
};

export function preparePrestigeCurrentAssessment(definitionId) {
  const content = Object.hasOwn(PRESTIGE_CURRENT_ASSESSMENTS, definitionId) ? PRESTIGE_CURRENT_ASSESSMENTS[definitionId] : null;
  const definition = activeDefinitions('soc-2', {categories: PRESTIGE_CURRENT_CATEGORIES}).find(row => row.id === definitionId);
  if (!content || !definition) throw new Error('Prestige current content is limited to its 38 selected SOC criteria.');
  if (socGuidedCatalog.version !== PRESTIGE_CURRENT_QUESTION_VERSION) throw new Error('Review Prestige current facts against the changed native SOC question version.');

  const questions = socGuidedCatalog.definitions[definitionId].groups.flatMap(group => group.questions);
  const responseIds = Object.keys(content.responses);
  if (responseIds.length !== questions.length || questions.some(question => !Object.hasOwn(content.responses, question.id)))
    throw new Error('Review every native question before preparing Prestige current answers.');
  const answers = Object.fromEntries(questions.flatMap(question => {
    const response = content.responses[question.id];
    return [[question.id, response.answer], ...(response.detail ? [[question.id + '_detail', response.detail]] : [])];
  }));
  answers.additional_gap = 'No';
  answers.additional_confirmation = 'No';
  answers.evidence = `Synthetic current source facts as of ${PRESTIGE_CURRENT_AS_OF}. Reported subjects: ${content.evidence_subjects.join('; ')}. These subjects are not uploaded or verified Evidence records.`;
  validateSocCompletion(definitionId, answers, PRESTIGE_CURRENT_QUESTION_VERSION);
  const result = socGuidedResult(definitionId, answers, PRESTIGE_CURRENT_QUESTION_VERSION, 'Prestige Worldwide');
  return {definition_id: definitionId, as_of: PRESTIGE_CURRENT_AS_OF, version: PRESTIGE_CURRENT_QUESTION_VERSION,
    ownership: {owner_id: content.owner_id, process_owner_id: content.process_owner_id},
    technology: content.technology, notes: `Current internal implementation rationale: ${content.rationale}`,
    reported_evidence_subjects: [...content.evidence_subjects], answers, result};
}
