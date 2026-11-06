// Fictional scenario content only. Native services own identities, dates, evidence and decisions.
export const BRAWNDO_SCENARIO_PROFILE = Object.freeze({
  name: 'Brawndo',
  implementation_group: 1,
  history_months: 18,
  business_context: 'A fictional 65-person beverage manufacturer and distributor with two production lines and one warehouse. Office staff use Microsoft 365 Business Premium; production operators use named sessions on shared packaging kiosks.',
  asset_scope: Object.freeze({managed_windows_devices: 55, shared_packaging_kiosks: 10, network_devices: 12, erp_production_vms: 2}),
  partial: Object.freeze(['1.1', '3.1', '7.2', '15.1']),
  gaps: Object.freeze(['4.1', '7.1']),
  unknown: Object.freeze(['11.4', '14.8'])
});

const OWNERS = {
  1: ['IT lead', 'Warehouse operations lead'],
  2: ['IT lead', 'Managed service provider lead'],
  3: ['GRC manager', 'Finance and operations lead'],
  4: ['IT lead', 'Managed service provider lead'],
  5: ['IT lead', 'HR coordinator'],
  6: ['IT lead', 'Department manager'],
  7: ['IT lead', 'Managed service provider lead'],
  8: ['IT lead', 'Managed service provider lead'],
  9: ['IT lead', 'Managed service provider lead'],
  10: ['IT lead', 'Managed service provider lead'],
  11: ['Operations lead', 'Managed service provider lead'],
  12: ['IT lead', 'Managed service provider lead'],
  14: ['HR coordinator', 'GRC manager'],
  15: ['Procurement lead', 'Finance and operations lead'],
  17: ['Operations lead', 'IT lead']
};

const CONTENT = {
  '1.1': {
    scope: 'The 55 office Windows devices, 10 packaging kiosks, 12 network devices and two ERP/production virtual machines at the bottling site and warehouse.',
    current_implementation: 'The controlled asset spreadsheet reconciles purchase, disposal and provider device lists every six months. All 79 identified assets have a row, but six packaging kiosks still lack a recorded hardware address or accountable business owner; endpoint enrollment alone has not corrected the register.',
    technology_process: 'A versioned spreadsheet is the authoritative asset register. Intune and provider exports are reconciliation inputs, rather than an assertion of an IG2 discovery capability.',
    assessment_notes: 'The office and server rows contain authorization, identifiers and ownership. A kiosk sample confirms incomplete required attributes, so inventory coverage remains partial.',
    evidence_check: 'Compare the 79-row inventory with the endpoint and purchase lists; identify the six incomplete kiosk rows and retain the reconciliation exceptions.',
    remediation: 'Warehouse operations must identify the six kiosk custodians and missing hardware addresses; IT must update the register and have the GRC manager validate a fresh kiosk sample.'
  },
  '1.2': {
    scope: 'Wired and wireless connections at the bottling site and warehouse, including contractor laptops and regularly connected third-party equipment.',
    current_implementation: 'Every week, the provider compares connection and visitor-access lists with approved assets. Unknown devices are disconnected or moved to the restricted guest network pending owner approval; a recent contractor-laptop case records removal before production access.',
    technology_process: 'A weekly connection-list check and service-desk disposition log support the process. The incomplete kiosk attributes in 1.1 do not excuse leaving an unauthorized device connected.',
    assessment_notes: 'The current sample has an accountable operator, a weekly execution record and a completed removal decision. Completing kiosk inventory attributes remains separately tracked work.',
    evidence_check: 'Inspect the weekly connection check, the contractor-device disposition and the record confirming that production access was removed.'
  },
  '2.1': {
    scope: 'Licensed applications and operating systems on all 65 Windows end-user devices and both ERP/production virtual machines.',
    current_implementation: 'The software workbook lists Windows, Microsoft 365 Apps, Edge, label-printing software and the ERP client by device label, publisher, version, business purpose and license entitlement. IT reconciles provider installed-software exports and purchasing records at least every six months.',
    technology_process: 'A controlled software register combines installed-software exports with license and approval records; it does not depend on complete physical-asset ownership fields.',
    assessment_notes: 'Sampled office, packaging and ERP entries trace to a deployment source and entitlement, including first use and decommission information where relevant.',
    evidence_check: 'Reconcile sampled installed applications to workbook entries, purchase entitlements, installation details and the six-month review record.'
  },
  '2.2': {
    scope: 'Windows 11 devices, the supported server operating systems, Microsoft 365 Apps, Edge, ERP and label-printing applications.',
    current_implementation: 'IT checks vendor support status monthly before maintaining each application on the authorized list. The obsolete label utility was replaced; its retained exception and retirement record show the earlier exposure without implying an unsupported version remains authorized today.',
    technology_process: 'The monthly support register records the vendor release/support reference, installed version and any time-limited business exception with compensating controls.',
    assessment_notes: 'Current sampled versions are supported. Historical unsupported software has a closed replacement action rather than an undocumented continuing exception.',
    evidence_check: 'Compare current version exports with vendor support references and the retired label-utility exception and replacement record.'
  },
  '2.3': {
    scope: 'Software installed on office devices, shared packaging kiosks and ERP/production servers.',
    current_implementation: 'The monthly unauthorized-software check compares installed titles with the approved workbook. A browser toolbar installed by a temporary sales worker was removed, and IT retained the removal result and the supervisor notification.',
    technology_process: 'Provider installed-software exports feed a manual authorization comparison and service-desk removal or documented-exception decision.',
    assessment_notes: 'The sampled unauthorized title has a completed removal and a subsequent clean inventory result; a ticket marked complete alone is insufficient.',
    evidence_check: 'Inspect the comparison exceptions, removal ticket and subsequent installed-software export for the sales device.'
  },
  '3.1': {
    scope: 'Payroll, supplier banking details, customer deliveries, beverage formulas and temporary production/label files.',
    current_implementation: 'The documented data-management process defines sensitivity, owners, access, retention and disposal for office and ERP records. Its production appendix is still a draft: responsibility and handling instructions for temporary kiosk print files have not been incorporated into the maintained process.',
    technology_process: 'The Data Classification and Handling document contains the process and points to separate retention and disposal instructions; its production appendix awaits approval.',
    assessment_notes: 'Office and ERP process contents are present, but production-file handling is incompletely documented. Existing technical access controls do not close this process-content gap.',
    evidence_check: 'Compare the maintained process with the draft kiosk appendix and the sensitive-data inventory; retain the unresolved owner and handling decisions.',
    remediation: 'Operations and Finance must agree the kiosk-file handling responsibilities, incorporate the appendix and submit the completed process for approval and scope validation.'
  },
  '3.2': {
    scope: 'Sensitive data in payroll, the ERP database, Microsoft 365 team sites, the formula repository and kiosk print queues.',
    current_implementation: 'The annual sensitive-data inventory identifies the storage location, responsible team, sensitivity and business purpose of each dataset, including transient label files. The inventory identifies those files even though their process appendix in 3.1 remains incomplete.',
    technology_process: 'A controlled data-location workbook is reconciled with Finance, warehouse supervisors and the service provider, with priority given to payroll, banking and formula data.',
    assessment_notes: 'The current sample includes office, server and transient production locations; the separate documentation gap has not been concealed by omitting the kiosk dataset.',
    evidence_check: 'Trace sampled payroll, formula and temporary-print locations to their inventory entries and annual reconciliation sign-off.'
  },
  '3.3': {
    scope: 'Payroll and banking records, confidential formulas, ERP functions and production label files.',
    current_implementation: 'Finance-only groups restrict payroll and bank files; recipe access is limited to the production lead and approved operators. Sales can read delivery records without changing bank details, and kiosk users can access only their production workspace.',
    technology_process: 'Microsoft 365 group-based site permissions and application/file access lists are configured for business duties; owners approve changes through the access process.',
    assessment_notes: 'Positive and denied-access samples distinguish an authorized payroll user from a sales user and a kiosk session.',
    evidence_check: 'Inspect group memberships and access lists, then compare allowed and denied sample access to payroll, formulas and delivery records.'
  },
  '3.4': {
    scope: 'Business records in the ERP and Microsoft 365 workspace, plus temporary packaging files.',
    current_implementation: 'Brawndo has selected fictional retention periods of seven years for finance records, two years for delivery records and one shift for temporary label exports. Owners perform recorded deletion or archival steps after expiry, with holds preventing disposal where a business investigation requires retention.',
    technology_process: 'The retention schedule and owner disposal worksheet govern ERP archives and workspace cleanup; no automatic Microsoft 365 retention feature is assumed.',
    assessment_notes: 'Sampled expired label exports were removed while finance records within their selected retention period were retained. These are company choices, not invented CIS retention periods.',
    evidence_check: 'Compare record ages and any holds with the selected schedule and owner disposal/archival records.'
  },
  '3.5': {
    scope: 'Retired Windows devices, server disks, removable media and printed payroll or formula material.',
    current_implementation: 'IT sanitizes reusable drives using the approved media-specific method and sends failed drives for controlled destruction. Finance uses locked confidential-waste bins; disposal logs reconcile asset labels, custody handovers and destruction receipts.',
    technology_process: 'A media-disposal checklist selects sanitization or destruction by media type and sensitivity, with an accountable custodian and completion evidence.',
    assessment_notes: 'A retired kiosk drive and a confidential-print batch have traceable custody and completed disposal records rather than an unsupported statement that files were deleted.',
    evidence_check: 'Match the retired-drive disposal record and paper-waste handover with the approved method and retained completion receipts.'
  },
  '3.6': {
    scope: 'All 55 office Windows devices and 10 shared Windows packaging kiosks that store local business data.',
    current_implementation: 'BitLocker protects the operating-system volumes of all 65 end-user devices, including fixed packaging kiosks. IT checks protection status and recovery-key custody; shared use does not make a kiosk exempt from encryption.',
    technology_process: 'Windows volume encryption is deployed through the provider-managed endpoint configuration, with recovery material held separately in the restricted support vault.',
    assessment_notes: 'The device-status sample covers an office laptop and a packaging kiosk, including protection enabled and recoverability information; the tool name alone is not the conclusion.',
    evidence_check: 'Reconcile device encryption status with the 65-device population and inspect recovery-key custody without including key values in Demo evidence.'
  },
  '4.1': {
    scope: 'Office devices, shared packaging kiosks, ERP/production servers and their operating systems and applications.',
    current_implementation: 'The provider applies several working settings, including encryption, screen locking and host firewalls, but Brawndo has no maintained documented secure-configuration process for these asset classes. The general Configuration document is a missing process deliverable; individual settings are not its substitute.',
    technology_process: 'Existing endpoint profiles and provider checklists are useful inputs, but no approved lifecycle process defines baseline selection, exceptions, changes and maintenance for office, kiosk and server configurations.',
    assessment_notes: 'The documentation search and responsible-owner interview confirm a missing process. Implemented safeguards for particular settings remain distinct from this known 4.1 failure.',
    evidence_check: 'Retain the process-gap statement and examples of existing settings; do not present a planned template as approved configuration-process evidence.',
    remediation: 'IT and the provider must document class-specific configuration baselines, exception approval and change maintenance, apply the process to representative devices and request independent Finding validation.'
  },
  '4.2': {
    scope: 'The 12 managed firewall, switch and wireless devices serving the bottling site and warehouse.',
    current_implementation: 'A separate maintained network-device runbook defines approved management protocols, administrator access, backup of settings and change approval. The provider reviews it annually and after network changes; the completed warehouse wireless replacement followed that runbook.',
    technology_process: 'The provider network runbook and change register contain an established process for network infrastructure, separate from the missing general endpoint/server process in 4.1.',
    assessment_notes: 'The maintained network runbook and a completed change demonstrate this narrower process; they do not establish the missing process for other asset classes.',
    evidence_check: 'Inspect the annual runbook review, approved wireless change, configuration backup and post-change acceptance record.'
  },
  '4.3': {
    scope: 'Office Windows sessions and named operator sessions on packaging kiosks.',
    current_implementation: 'Office sessions lock after 10 minutes of inactivity and kiosk sessions after five minutes; reauthentication is required to resume. Locking the operator session leaves the separate production application service running, so the control does not stop a beverage batch.',
    technology_process: 'Provider-managed Windows inactivity settings apply to both device groups, with a documented operator handover procedure for shared kiosks.',
    assessment_notes: 'Timed samples confirm the configured lock and successful reauthentication on an office device and a production kiosk.',
    evidence_check: 'Compare assigned timeout settings and timed lock samples for both Windows device groups; do not infer a mobile-device population.'
  },
  '4.4': {
    scope: 'Both Windows ERP/production virtual machines.',
    current_implementation: 'Windows Firewall remains enabled on both servers. Inbound rules permit only the required ERP/production application traffic and provider management path, with other unsolicited inbound connections denied.',
    technology_process: 'Host firewall profiles and explicit service/port rules supplement the site perimeter firewall; a perimeter appliance alone is not the server control.',
    assessment_notes: 'An application connection succeeds from its approved source while an unauthorized inbound connection is blocked on the sampled server.',
    evidence_check: 'Inspect enabled host profiles, the permitted service rules and allowed/denied connection samples on both virtual machines.'
  },
  '4.5': {
    scope: 'The 55 office Windows devices and 10 shared packaging kiosks.',
    current_implementation: 'Windows Firewall is enabled across domain, private and public profiles. Unsolicited inbound access is blocked unless IT has approved a necessary application rule; the kiosk group does not expose remote administration to the warehouse user network.',
    technology_process: 'Endpoint firewall settings and a controlled exception list are distributed through managed Windows profiles.',
    assessment_notes: 'Office and kiosk samples show active host protection with the expected default inbound restriction, including the public-network profile.',
    evidence_check: 'Check assigned profiles, active firewall state and any permitted inbound exceptions for an office device and a kiosk.'
  },
  '4.6': {
    scope: 'Management of Windows devices, ERP/production servers, Microsoft 365 and the 12 network devices.',
    current_implementation: 'IT and the provider use encrypted administrative sessions, named identities and the restricted management path. Network devices use HTTPS or SSH; direct Telnet and plain-HTTP management are disabled, and configuration changes have a service-desk record.',
    technology_process: 'A restricted administrative gateway and device management settings protect management traffic; ordinary operator accounts cannot administer devices.',
    assessment_notes: 'The current sample records an authorized encrypted management session and rejection of a disabled insecure protocol.',
    evidence_check: 'Inspect management access settings, the approved change record and permitted/blocked administrative connection results.'
  },
  '4.7': {
    scope: 'Provider-managed Windows builds, ERP software and network-device installations.',
    current_implementation: 'Commissioning checks disable unnecessary default and guest accounts. Where a vendor-required account must remain, IT replaces its initial secret, limits its purpose and records custody; no unchanged factory credential is used for production administration.',
    technology_process: 'The install/change checklist and restricted credential vault govern default-account decisions and maintenance.',
    assessment_notes: 'A network-device commissioning sample and a Windows kiosk account listing show default accounts removed, disabled or explicitly controlled.',
    evidence_check: 'Inspect account state and commissioning decisions without exposing passwords or recovery secrets.'
  },
  '5.1': {
    scope: 'Employee, administrator and service identities used for Microsoft 365, Windows, ERP and provider support.',
    current_implementation: 'IT reconciles the account workbook with HR starters/leavers and platform account exports each quarter. Entries identify the responsible person or service owner, department, account name and start/stop details; supervisors confirm that active access remains authorized.',
    technology_process: 'Microsoft Entra ID and ERP account lists feed a controlled account register; shared kiosks use named employee sessions rather than an unowned common operator identity.',
    assessment_notes: 'Quarterly authorization sign-off covers regular, privileged and non-person identities; a retired warehouse worker is retained historically with disabled access.',
    evidence_check: 'Reconcile platform accounts, the HR population and service-owner entries against the quarterly authorization record.'
  },
  '5.2': {
    scope: 'Employee and provider identities, administrative accounts and application/service credentials.',
    current_implementation: 'Each account uses a distinct secret; no shared kiosk password is issued. The company selects at least 16 characters for password-based accounts, with random service secrets held in the restricted vault and MFA added where supported.',
    technology_process: 'Password rules, named sign-ins and the managed credential vault support account-specific secrets; evidence records settings and owner confirmation, never actual credentials.',
    assessment_notes: 'The selected length exceeds the applicable CIS minimums, and sampled account handling distinguishes regular and administrator credentials.',
    evidence_check: 'Inspect the configured password rules and credential-handling procedure; do not export, print or seed real passwords.'
  },
  '5.3': {
    scope: 'Inactive employee and support accounts on supported identity and application platforms.',
    current_implementation: 'A daily inactivity check disables supported accounts once 45 days without use is reached; IT confirms business exceptions with the owner rather than silently leaving access active. The seasonal forklift operator example shows the inactivity date and subsequent disablement.',
    technology_process: 'The provider compares last-use information with the account register and records disablement results; an absence from one platform is not treated as proof of inactivity everywhere.',
    assessment_notes: 'The seasonal-account sample preserves the last-use value, 45-day decision and disabled account state.',
    evidence_check: 'Reconcile the inactivity report and exception decisions with actual disabled-state samples; do not substitute a quarterly authorization meeting for the threshold.'
  },
  '5.4': {
    scope: 'IT and provider administration of Microsoft 365, Windows servers, endpoints and network equipment.',
    current_implementation: 'Staff perform email, browsing and beverage-order work with ordinary accounts. IT and provider personnel switch to separate named administrator identities for privileged tasks; ordinary employee sessions have no local administrator membership.',
    technology_process: 'Separate privileged identities and controlled administrator groups restrict elevated access to support tasks.',
    assessment_notes: 'Sampled IT personnel have distinct everyday and administrative identities, and the kiosk operator group cannot install software or change system settings.',
    evidence_check: 'Compare role memberships and account-purpose records with a regular-session denied administration sample.'
  },
  '6.1': {
    scope: 'Hiring, contractor engagement and role changes affecting workspace, ERP and production access.',
    current_implementation: 'A documented joiner/mover process requires the department manager to request a business role and approve access before IT provisions it. A warehouse-to-sales transfer shows the new delivery access approved while the former production permissions were separately removed.',
    technology_process: 'The access request captures the person, requested duties, approver and completed platform changes, using an approved role checklist.',
    assessment_notes: 'The sampled transfer has prior approval and a platform-level completion check, rather than treating an email request as completed provisioning.',
    evidence_check: 'Trace the approved starter or mover request to the provisioned groups and ERP permissions.'
  },
  '6.2': {
    scope: 'Termination, contract end, access revocation and role changes for employees and provider personnel.',
    current_implementation: 'HR or the business owner alerts IT for immediate revocation at the authorized event. IT disables sign-in, removes application access and terminates relevant remote sessions; the completed temporary-driver departure has matching HR, identity and VPN records.',
    technology_process: 'An urgent leaver checklist and provider escalation path coordinate platform revocation, with a named backup if the IT lead is unavailable.',
    assessment_notes: 'The leaver sample confirms the revocation was executed at the event; the next quarterly access review is not the trigger.',
    evidence_check: 'Reconcile the authorized departure time with account disablement, application removal and remote-session termination records.'
  },
  '6.3': {
    scope: 'Internet-accessible Microsoft 365 and provider/customer applications used by Brawndo staff.',
    current_implementation: 'Microsoft Entra Conditional Access requires MFA for staff access to Microsoft 365. The supplier ordering portal has its own enforced second factor; password-only legacy cloud authentication is blocked and the external-application list records each enforcement point.',
    technology_process: 'Configured MFA grant controls and each external application authentication setting provide coverage; registration for MFA alone is not taken as enforcement.',
    assessment_notes: 'The external-application sample checks policy assignment and a challenged sign-in rather than relying on the Microsoft subscription name.',
    evidence_check: 'Inspect the enforced policy scope and sample sign-ins for workspace and supplier-portal access.'
  },
  '6.4': {
    scope: 'Employee and provider remote network access to the bottling site and warehouse.',
    current_implementation: 'The contracted remote-access service requires a named account and a second factor before opening the private network connection. Direct inbound remote desktop is blocked; support personnel cannot bypass the remote-access gateway with an exposed server port.',
    technology_process: 'The provider-managed VPN has enforced MFA and an access list limited to approved personnel and support windows.',
    assessment_notes: 'The current sample shows a second-factor challenge followed by authorized connectivity, and a rejected password-only attempt.',
    evidence_check: 'Inspect gateway MFA settings, approved remote users and successful/denied connection samples without retaining authentication secrets.'
  },
  '6.5': {
    scope: 'Microsoft 365 administration and supported remote administrative access to servers, endpoints and network devices.',
    current_implementation: 'Cloud administrator identities have enforced MFA. Provider device administration passes through an MFA-protected management gateway, and direct remote administration from ordinary user networks is blocked; privileged access is not granted merely because the regular account passed a normal employee sign-in.',
    technology_process: 'Entra administrative MFA policy and the restricted provider management gateway enforce the additional factor on supported administration paths.',
    assessment_notes: 'Cloud and device-administration samples demonstrate the privileged enforcement point, authorized administrator identity and rejected direct access.',
    evidence_check: 'Reconcile administrative paths with MFA enforcement, privileged memberships and blocked bypass samples.'
  },
  '7.1': {
    scope: 'Vulnerability identification and management for Brawndo office devices, production kiosks, network equipment and ERP/production servers.',
    current_implementation: 'IT receives vendor advisories and the provider patches devices, but no maintained documented vulnerability-management process defines the full asset scope, information sources, triage responsibilities, exceptions and change triggers. The missing process is a known implementation failure, not a shortage of authenticated scan results.',
    technology_process: 'Vendor advisory subscriptions, the asset workbook and the existing patch queue are inputs to a process that still needs to be established. The separate remediation worksheet under 7.2 does not define the complete identification and management lifecycle.',
    assessment_notes: 'Owner confirmation and the document-register search establish that the required process is absent. Planned documentation is not implementation, and IG2 automated scanning is not imposed on this IG1 program.',
    evidence_check: 'Retain the process-gap statement, advisory examples and existing remediation worksheet; the synthetic evidence must show the missing lifecycle rather than imply a completed process.',
    remediation: 'IT must document asset coverage, advisory intake, triage, ownership, risk decisions, exception handling and annual/significant-change maintenance; exercise the process on a vendor advisory and request Finding validation.'
  },
  '7.2': {
    scope: 'Risk-prioritized remediation of software and configuration weaknesses affecting office and beverage-production services.',
    current_implementation: 'A documented remediation worksheet prioritizes exposed payroll/ERP systems and production interruption, assigns owners and records deadlines and exceptions. Monthly process reviews exist historically, but the current cycle is overdue and two production changes lack a recorded reprioritization decision.',
    technology_process: 'The remediation procedure and provider work queue provide a real but incompletely maintained risk-based process. Routine automated patch deployment continues under 7.3/7.4.',
    assessment_notes: 'A process exists and risk criteria are used, so this is partial implementation rather than the missing overall process in 7.1. Missed monthly maintenance and incomplete decisions remain open.',
    evidence_check: 'Inspect the documented risk criteria, dated monthly process reviews, current overdue cycle and two unresolved prioritization entries.',
    remediation: 'The IT lead and production owner must complete the overdue process review, record the two risk decisions and demonstrate the next scheduled monthly review before validation.'
  },
  '7.3': {
    scope: 'Windows operating systems on the 55 office devices, 10 kiosks and both Windows server virtual machines.',
    current_implementation: 'Intune update rings automatically deploy client operating-system updates through pilot and production groups. The provider patch agent automatically updates both server operating systems in approved maintenance windows; deployment and restart results are checked at least monthly.',
    technology_process: 'Windows client update rings and the separate provider server-patching job cover their respective supported platforms; Intune client rings are not claimed to patch Windows Server.',
    assessment_notes: 'Client, kiosk and server job results show automated deployment and current versions. The overdue risk-process review in 7.2 does not mean these operating-system jobs failed.',
    evidence_check: 'Reconcile update-ring assignments and server patch-job results with the operating-system population and completed monthly installations.'
  },
  '7.4': {
    scope: 'Microsoft 365 Apps, Edge, the ERP client and label-printing applications on Brawndo Windows devices and servers.',
    current_implementation: 'Microsoft 365 Apps and Edge use their supported automatic update mechanisms. The provider deployment agent automatically installs approved ERP/label application packages, with version and failed-job follow-up checked at least monthly across the relevant device groups.',
    technology_process: 'Application-specific update mechanisms and automated package deployments provide coverage; operating-system updates alone are not presented as application patching.',
    assessment_notes: 'The sample traces an Office update and a packaging application deployment to installed versions, including the separate maintenance window for the production kiosks.',
    evidence_check: 'Compare application update settings, package deployment results and installed versions for office, kiosk and server application samples.'
  },
  '8.1': {
    scope: 'Audit records from Windows endpoints/servers, Microsoft 365, ERP activity and managed network equipment.',
    current_implementation: 'The maintained logging procedure defines required events, collection locations, review/escalation responsibilities and company-selected retention for each source. IT reviews the procedure annually and after relevant service changes; adding the warehouse access gateway produced a recorded update.',
    technology_process: 'A source-by-source logging schedule and provider collection runbook contain the documented process and escalation path.',
    assessment_notes: 'The procedure includes collection, review and retention requirements. The document review and the continuing provider collection/alert-handling work have separate records.',
    evidence_check: 'Inspect the logging process, source schedule, annual review and gateway-change update.'
  },
  '8.2': {
    scope: 'Configured Windows security events, ERP activity, cloud sign-ins and managed network authentication/configuration events.',
    current_implementation: 'Windows event collection and the provider network log receiver retain the configured local-source events. Scheduled cloud/ERP exports preserve the events required by Brawndo logging procedures; source timestamps and collection failures are visible in the daily provider job report.',
    technology_process: 'Windows event forwarding, network log reception and scheduled application exports implement the source requirements rather than assuming every product emits identical events.',
    assessment_notes: 'A workstation sign-in, ERP change and network administrative event can each be traced from their source to retained records.',
    evidence_check: 'Match sample source events to their collected copies and inspect failed-source alerts and subsequent recovery.'
  },
  '8.3': {
    scope: 'Local event storage, the provider log receiver and the restricted cloud/application export repository.',
    current_implementation: 'Storage allocations are sized against the logging procedure and observed ingestion. Capacity alerts notify the provider before collections overwrite required records; the warehouse gateway addition has a documented capacity calculation and available-headroom check.',
    technology_process: 'Source log limits, repository quotas and provider capacity alerts protect the company-selected retention requirements.',
    assessment_notes: 'The capacity sample shows sufficient available storage and a working notification without claiming that a platform default guarantees retention.',
    evidence_check: 'Compare recent ingestion, configured limits and free space with the retention plan; inspect the capacity-alert sample.'
  },
  '9.1': {
    scope: 'Edge browsers and Outlook/Microsoft 365 email clients on the office and packaging Windows groups.',
    current_implementation: 'The approved client list permits supported Edge and Outlook releases; automatic updates keep them current. IT removes legacy mail/browser packages from standard builds and checks sampled installed versions against the vendor supported release information.',
    technology_process: 'Managed application updates and the software support register maintain supported clients; the availability of a newer optional feature channel is not treated as unsupported software.',
    assessment_notes: 'Office and kiosk browser versions and the office email-client version are supported, with their automatic update settings enabled.',
    evidence_check: 'Compare installed browser/email versions and update settings with current vendor support information and the approved software list.'
  },
  '9.2': {
    scope: 'Internet DNS requests from office Windows devices and packaging kiosks at the site and while approved laptops roam.',
    current_implementation: 'Cloudflare Gateway DNS policies block malware and phishing destinations. Site DNS is directed to the filtered resolvers; the managed Cloudflare client applies the same organization DNS policy to roaming laptops. Blocked-domain samples are retained for both paths.',
    technology_process: 'Gateway DNS security policies plus the managed client DNS mode provide the stated DNS coverage; no claim of full web inspection or complete network protection is inferred.',
    assessment_notes: 'The sample checks a blocked threat-category domain and an allowed business lookup on a site kiosk and a roaming office laptop.',
    evidence_check: 'Inspect the DNS policy, resolver/client assignments and blocked/allowed lookup results for both access paths.'
  },
  '10.1': {
    scope: 'The 65 Windows end-user devices and both Windows server virtual machines.',
    current_implementation: 'Microsoft Defender Antivirus real-time protection is enabled on the office, kiosk and server populations. The provider follows disabled-engine and detection alerts, and a harmless antivirus test sample shows quarantine followed by an accountable support response.',
    technology_process: 'Windows antimalware configuration and provider health reports demonstrate deployment and maintenance rather than relying on a Windows product name.',
    assessment_notes: 'Office, kiosk and server samples show an active engine, current protection and a retained test response; a planned rollout is not counted as coverage.',
    evidence_check: 'Reconcile engine-health status with the device population and inspect the synthetic quarantine and support follow-up sample.'
  },
  '10.2': {
    scope: 'Defender Antivirus installations on office devices, shared kiosks and both servers.',
    current_implementation: 'Security intelligence updates run automatically through the supported Microsoft update mechanism. The provider checks signature age and failed updates; the kiosk sample includes a recovered update failure followed by a current version rather than an unresolved stale engine.',
    technology_process: 'Automatic antimalware update settings and version/age reports operate separately from the monthly operating-system maintenance window.',
    assessment_notes: 'The samples show automatic updates enabled and current intelligence after the recorded recovery; no monthly signature-update interval is invented.',
    evidence_check: 'Inspect automatic update settings, recent intelligence versions and the recovered kiosk update exception.'
  },
  '10.3': {
    scope: 'USB and other removable-media use on office Windows devices and the packaging kiosks.',
    current_implementation: 'Managed Windows settings disable AutoRun and AutoPlay. Inserting a supplier media sample does not launch content automatically; authorized label-file imports require a deliberate operator action through the approved application.',
    technology_process: 'Assigned removable-media execution settings apply to both Windows device groups; disabling automatic launch is not described as a ban on all removable media.',
    assessment_notes: 'The office and kiosk sample verifies insertion without automatic execution while retaining the permitted business import workflow.',
    evidence_check: 'Inspect assigned AutoRun/AutoPlay settings and the controlled media-insertion sample on both device groups.'
  },
  '11.1': {
    scope: 'ERP orders, production schedules, formula records and business documents needed to resume beverage dispatch.',
    current_implementation: 'The documented recovery process prioritizes order/dispatch data before office archives, identifies backup scope and responsible contacts, and protects backup credentials and stored copies. Operations reviews the procedure annually and after major production or hosting changes.',
    technology_process: 'A recovery runbook records detailed backup jobs, restoration order, supplier contacts and security requirements for recovery data.',
    assessment_notes: 'The procedure is present and maintained. The intended isolated-copy arrangement under 11.4 remains separately unassessed; this document review does not certify that arrangement.',
    evidence_check: 'Inspect the runbook scope, detailed backup procedures, prioritization, data protection and annual/change review record.'
  },
  '11.2': {
    scope: 'Both ERP/production virtual machines, the formula workspace and selected Microsoft 365 business records.',
    current_implementation: 'Provider jobs automatically copy ERP and production data nightly and selected workspace records daily. Failed jobs raise support alerts; a retained sample shows a missed ERP job rerun successfully before the next dispatch cycle. Each in-scope dataset has at least weekly coverage.',
    technology_process: 'Scheduled provider backup jobs, per-dataset job results and failed-job alerts demonstrate automated backups; ordinary workspace synchronization is not counted as a backup.',
    assessment_notes: 'Current job results cover each selected dataset, including the recovered failure. Successful jobs do not establish the unassessed isolation property in 11.4.',
    evidence_check: 'Reconcile dataset scope, schedules and successful job results; inspect the failed-job alert and successful rerun.'
  },
  '11.3': {
    scope: 'Provider backup repositories, exported formula records and recovery credentials.',
    current_implementation: 'Backup copies are encrypted and available only to named recovery administrators; backup transport uses the approved encrypted channel. Operations authorizes retrieval and the provider records access, keeping backup permissions separate from ordinary ERP and office access.',
    technology_process: 'Repository access controls, encryption settings and restricted key/credential custody protect recovery data independently of whether a copy is isolated.',
    assessment_notes: 'Access and encryption samples establish protection for the known repositories; they do not conclude that production administrators cannot reach every copy.',
    evidence_check: 'Inspect repository encryption and allowed/denied access samples without including decryption keys or passwords.'
  },
  '11.4': {
    scope: 'The provider arrangement intended to hold a recovery copy outside the production administrative path.',
    current_implementation: 'The runbook identifies a separate off-site copy, but Brawndo has not assessed its administrative separation, accessibility or storage controls. Successful backup jobs and a supplier statement provide context only; the isolation conclusion is not yet known.',
    technology_process: 'The proposed assessment will trace the production and recovery access paths with the provider. No immutable-storage or air-gap capability is assumed from the service label.',
    assessment_notes: '',
    evidence_check: 'Assessment preparation only: obtain the access design, copy inventory and permitted/denied access observations before deciding whether an isolated instance is maintained.',
    assessment_plan: 'The Operations lead must arrange a provider walkthrough and controlled access-path check, identify whether a qualifying isolated copy exists and record the first assessment after reviewing those observations.'
  },
  '12.1': {
    scope: 'The 12 firewall, switch and wireless devices at the bottling site and warehouse.',
    current_implementation: 'The provider checks firmware/software support monthly and schedules supported stable releases around production windows. A retired wireless unit remains in historical records after replacement; it is not left operating on unsupported firmware.',
    technology_process: 'The network version register records installed release, vendor support reference, approved maintenance and post-change service checks.',
    assessment_notes: 'The current sample matches all operating network devices to supported releases and distinguishes retired equipment from active infrastructure.',
    evidence_check: 'Compare the active network-device list, installed versions and vendor support references with the monthly support check.'
  },
  '14.1': {
    scope: 'All 65 employees, including office staff, shift operators and warehouse personnel.',
    current_implementation: 'HR delivers role-relevant security induction at hire and a yearly refresher covering the core workplace topics. Content is reviewed annually and after important changes; shift attendance is reconciled to the staff roster. Evidence for the insecure-network topic remains separately unassessed under 14.8.',
    technology_process: 'A controlled lesson pack, induction checklist and attendance workbook support the program without assuming that a software subscription automatically trains workers.',
    assessment_notes: 'Induction and annual program records are present. Program existence does not imply completed assessment of every topic-specific safeguard.',
    evidence_check: 'Reconcile the staff roster, induction dates, annual attendance and content review; keep the 14.8 assessment plan separate.'
  },
  '14.2': {
    scope: 'Office purchasing, delivery scheduling and warehouse staff who receive supplier requests or delivery messages.',
    current_implementation: 'Induction and the annual refresher use fake delivery-change texts, supplier bank-change emails and a bottling-machine support call to teach social-engineering recognition. Staff practice contacting the known supplier number and reporting the message before acting.',
    technology_process: 'The awareness lesson, worked scenarios and staff response worksheet focus on phishing, impersonation and pressure to bypass approval.',
    assessment_notes: 'A purchasing and a warehouse sample identify the deception and the approved verification/reporting step; the humor does not obscure the financial or production consequence.',
    evidence_check: 'Inspect the topic content, attendance and fictional response samples for supplier and delivery impersonation.'
  },
  '14.3': {
    scope: 'Employees using Microsoft 365, ERP, shared kiosk sessions and the remote-access service.',
    current_implementation: 'The authentication lesson teaches unique long passwords, MFA challenge checking, refusal of unexpected approval prompts and secure operator sign-out. Warehouse shift handover examples explicitly prohibit giving the next operator an existing session or password.',
    technology_process: 'Induction and annual refresher materials explain the actual named-session and MFA arrangements used by Brawndo.',
    assessment_notes: 'The sampled response rejects an unsolicited MFA prompt and describes individual sign-in for the next shift operator.',
    evidence_check: 'Inspect authentication training content, attendance and the MFA/shift-handover response samples.'
  },
  '14.4': {
    scope: 'Payroll, bank details, customer delivery data, confidential formulas and printed shift paperwork.',
    current_implementation: 'Staff learn to use the approved team location, verify recipients, protect formula sheets and put sensitive waste in locked bins. The lesson includes locking a kiosk when stepping away, clearing shift whiteboards and storing printed delivery lists out of visitor view.',
    technology_process: 'A practical data-handling module and shift-supervisor checklist connect storage, transfer, archiving, destruction and clear-screen/desk behavior.',
    assessment_notes: 'The sample exercise covers a wrong-recipient delivery sheet and an unattended formula printout; the unfinished production process appendix does not erase the delivered training.',
    evidence_check: 'Inspect module coverage, staff attendance and worked responses for transfer, storage and physical workspace handling.'
  },
  '14.5': {
    scope: 'Accidental disclosure through workspace sharing, screenshots, delivery attachments and production-area conversations.',
    current_implementation: 'The awareness module shows how an unrestricted sharing link, an autocomplete recipient and a public photo of the recipe board can expose data. Staff practice checking recipients and access scope, removing an incorrect share and reporting the exposure promptly.',
    technology_process: 'Company-specific accidental-disclosure scenarios complement the malicious-message lesson rather than treating every exposure as an attack.',
    assessment_notes: 'The sampled learner identifies both the accidental disclosure mechanism and the immediate containment/reporting step.',
    evidence_check: 'Inspect the module, attendance and a fictional wrong-recipient or oversharing response.'
  },
  '14.6': {
    scope: 'Employees who may first notice account misuse, ransomware symptoms, missing equipment or exposed business data.',
    current_implementation: 'Staff are taught to stop interacting with suspicious activity and use the published incident contact rather than trying to repair or conceal it. A packaging-screen ransom-message example records what to report, who to contact and how to preserve useful observations.',
    technology_process: 'The recognition lesson uses the same contacts and reporting steps as the workforce incident procedure in 17.2/17.3.',
    assessment_notes: 'The response sample recognizes a potential incident and gives a usable reporting path without claiming the employee conducted an incident-response exercise.',
    evidence_check: 'Compare training content and response samples with the published workforce incident-reporting instructions.'
  },
  '14.7': {
    scope: 'Office users and shift operators who may see restart, patch, antivirus or backup-failure notices.',
    current_implementation: 'The lesson teaches workers to report repeated update failures and protection warnings to IT, including a packaging kiosk that repeatedly postpones a restart. Operators arrange the approved maintenance handover instead of disabling the update agent to keep a line moving.',
    technology_process: 'The staff reporting checklist names the service desk, useful symptom information and production escalation contact; it does not require users to administer the device.',
    assessment_notes: 'A fictional operator response correctly identifies the stalled update and the responsible support path, distinct from IT executing the automated patch job.',
    evidence_check: 'Inspect the missing-update/failure topic, attendance and a worked kiosk-warning report.'
  },
  '14.8': {
    scope: 'Employees who take laptops to customer sites or work from home and staff using non-company wireless networks.',
    current_implementation: 'HR has a draft remote-working lesson, but has not assessed whether the delivered training adequately covered insecure networks, enterprise-data transmission and home-network configuration. Existing VPN and filtered-DNS settings are technical context, not proof of workforce training.',
    technology_process: 'The assessment will compare the delivered lesson and attendance with the remote-worker population and the source-required subject coverage.',
    assessment_notes: '',
    evidence_check: 'Assessment preparation only: collect the delivered lesson version, remote-worker attendance and responses to an insecure-network scenario before reaching a conclusion.',
    assessment_plan: 'HR and the GRC manager must establish which lesson was delivered, interview a representative remote worker and record the first assessment after reviewing the required subject coverage and delivery evidence.'
  },
  '15.1': {
    scope: 'Fifteen known service-provider relationships supporting cloud collaboration, IT support, ERP, DNS, production servicing and logistics.',
    current_implementation: 'The supplier register records known providers, classifications and enterprise contacts. Individual active-vendor reviews continue, but the annual reconciliation of the complete inventory against procurement and service ownership is overdue; the last signed aggregate inventory review belongs to the previous cycle.',
    technology_process: 'The provider register is reconciled with purchasing and department service lists; an individual assurance review or contract renewal is not substituted for inventory reconciliation.',
    assessment_notes: 'The inventory exists and records are usable, but its annual maintenance obligation is incomplete. This is partial 15.1, not a claim that every IG1 vendor needs an IG3 provider assessment.',
    evidence_check: 'Compare the current provider list, procurement inputs and dated aggregate inventory reviews; distinguish active-vendor reviews from the overdue inventory cycle.',
    remediation: 'Procurement and department owners must complete the overdue inventory reconciliation, confirm classifications and contacts, resolve differences and retain a validated aggregate review.'
  },
  '17.1': {
    scope: 'Coordination of cyber incidents affecting the office, warehouse, beverage production or external IT services.',
    current_implementation: 'The Operations lead is the primary incident coordinator and the IT lead is the named backup. The provider investigates assigned technical work, while Brawndo retains an internal decision owner; responsibilities and backup coverage are reviewed annually and after staffing changes.',
    technology_process: 'The incident personnel roster defines coordination, documentation and internal oversight of the provider technical response.',
    assessment_notes: 'The roster contains an internal primary, backup and provider oversight role with a current annual review and usable coverage during shift changes.',
    evidence_check: 'Inspect the personnel roster, assigned responsibilities and annual/change review, including backup availability.'
  },
  '17.2': {
    scope: 'Internal incident coordinators, provider support, insurer, relevant external contacts and key service-provider escalation channels.',
    current_implementation: 'The incident contact sheet gives phone and alternate reporting paths and is available in the office and warehouse. The annual verification confirms the primary and backup numbers, the after-hours provider route and insurer notification contact, with changes recorded when services change.',
    technology_process: 'A controlled contact sheet and restricted offline copy keep a reporting path available if business email is unavailable.',
    assessment_notes: 'The contact-check sample records successful verification of internal and external routes; an old number is retained only in change history.',
    evidence_check: 'Inspect the current contact sheet, access location and dated annual contact-verification result.'
  },
  '17.3': {
    scope: 'All employees and provider personnel who report suspected security incidents at the bottling site or warehouse.',
    current_implementation: 'The published workforce procedure tells staff to report a suspected incident immediately to the listed coordinator or backup, use the phone alternative if email is affected, and provide the observed symptom, device/location and time without forwarding sensitive content unnecessarily. It is reviewed annually and after reporting-path changes.',
    technology_process: 'A short intranet procedure and posted warehouse instructions define reporting timeframe, recipients, mechanism and minimum information, linked to induction training.',
    assessment_notes: 'The office and warehouse copies are available, agree with the current contacts and define a usable reporting route when business email is unavailable.',
    evidence_check: 'Compare both published copies, their annual review and the workforce reporting checklist with the current incident contacts.'
  }
};

export const BRAWNDO_SAFEGUARD_IDS = Object.freeze(Object.keys(CONTENT));

export function brawndoSafeguardContent(definitionId, status) {
  if (!Object.hasOwn(CONTENT, definitionId)) throw new Error('Brawndo content requires a supported CIS IG1 safeguard.');
  const expected = BRAWNDO_SCENARIO_PROFILE.partial.includes(definitionId) ? 'in_progress'
    : BRAWNDO_SCENARIO_PROFILE.gaps.includes(definitionId) ? 'needs_attention'
      : BRAWNDO_SCENARIO_PROFILE.unknown.includes(definitionId) ? 'not_assessed' : 'addressed';
  // Current content must never be reused to manufacture a historical or contradictory conclusion.
  if (status !== expected) throw new Error(`Brawndo safeguard ${definitionId} requires ${expected} content.`);
  const row = CONTENT[definitionId];
  const [owner_role, process_owner_role] = OWNERS[definitionId.split('.')[0]];
  return {scope: row.scope, current_implementation: row.current_implementation, technology_process: row.technology_process,
    assessment_notes: row.assessment_notes, owner_role, process_owner_role, evidence_check: row.evidence_check,
    remediation: row.remediation || '', assessment_plan: row.assessment_plan || ''};
}
