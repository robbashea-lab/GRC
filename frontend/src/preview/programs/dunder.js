import {demoDates} from '../demoPortfolio';
import {reviewSchedule,reviewView} from '../../lib/reviewOccurrences';
import {isoAuditCatalog,initialAuditState,blankAuditItem} from '../../lib/isoAudit';

// DEMO - SYNTHETIC DATA. Dunder Mifflin: ISO/IEC 27001:2022 ISMS, year two, MSP-supported. Deliberately imperfect.
// Assessment conclusions are fictional operator judgements; a certificate would be an external event, never an app conclusion.
// Row: [id, status, assessed_ago, owner, technology, narrative, evidence_ago, soa?, justification?]
// Owners: 0 Dwight Schrute (ISMS manager), 1 David Wallace (top management), 2 Pam Beesly (documents, awareness).
const A='addressed',P='in_progress',G='needs_attention',N='not_assessed',X='not_applicable',I='included',E='excluded';

const CLAUSES=[
  ['4.1',A,60,0,'ISMS Context Register','Internal and external issues reviewed each quarter, including big-box competition, paper demand decline and flood exposure of the Scranton warehouse near the river.',58],
  ['4.2',A,120,0,'Interested Parties Register','Register lists retail customers, corporate, insurers and staff with their security expectations; customer contract clauses re-read at each renewal.',115],
  ['4.3',A,90,0,'ISMS Scope Statement v2.1','Scope covers order-to-delivery, IT services, Finance and HR for the Scranton office and warehouse plus New York corporate IT that supports them. Other branches are explicitly out of scope with the interfaces listed.',88],
  ['4.4',A,150,0,'ISMS Manual; process map','ISMS process map links risk, SoA, audit and management review. Interaction with corporate IT change process only described at a high level.',null],
  ['5.1',A,45,1,'Management review minutes; budget approval','David Wallace chairs management review and approved the year-two security budget, including the backup immutability upgrade.',44],
  ['5.2',A,200,1,'Information Security Policy v3.0','Top-level policy signed by David Wallace and published on the intranet. Commitment to continual improvement stated; last reapproval seven months ago.',198],
  ['5.3',A,110,1,'RACI chart; ISMS Manual section 3','Dwight Schrute appointed ISMS manager in writing; Pam Beesly owns document control. RACI reflects the MSP consultant role.',105],
  ['6.1.1',A,80,0,'Risk and Opportunity Register','Risks and opportunities from context and interested parties feed the register; opportunity to consolidate branch file shares recorded.',75],
  ['6.1.2',A,170,0,'Risk Assessment Methodology v2','5x5 likelihood/impact method with acceptance threshold of 9 approved by top management. Criteria applied consistently in the last two assessment cycles.',165],
  ['6.1.3',A,70,0,'Statement of Applicability v4; treatment plan','Treatment plan maps each high risk to Annex A controls and owners. SoA v4 approved; A.8.11 decision still open pending the BI project.',68],
  ['6.2',P,55,1,'Security Objectives Scorecard','Objectives now carry targets (phishing click rate, patch SLA, awareness completion). Two of six objectives still lack a data source for monthly tracking.',50],
  ['6.3',A,140,0,'ISMS change log','Planned ISMS changes, such as adding the New York IT team to scope, were logged with impact and resourcing before approval.',130],
  ['7.1',A,100,1,'ISMS budget; MSP statement of work','Resources for the ISMS come from a dedicated budget line and the MSP GRC retainer. Warehouse camera upgrade deferred to next fiscal year.',95],
  ['7.2',P,40,0,'Competence Matrix; HR training records','Competence matrix covers employees in ISMS roles. Records for warehouse IT contractors and temporary WMS support staff are incomplete.',null],
  ['7.3',A,35,2,'Awareness platform; onboarding pack','All staff briefed on the security policy and reporting route at onboarding. Refresher content reworked after the invoice-fraud attempt.',30],
  ['7.4',A,370,2,'Communication Plan','Communication plan defines who announces what to whom, including customer notifications. Not reviewed since the warehouse was added to scope.',372],
  ['7.5.1',A,130,2,'Document Register','Document register lists required ISMS records with owners and retention. Register reconciled against the SoA last spring.',125],
  ['7.5.2',A,95,2,'SharePoint document library with approval workflow','Policies drafted, reviewed and approved in a controlled library with version history. Pam Beesly runs the monthly approval queue.',90],
  ['7.5.3',A,85,2,'SharePoint permissions; read-only published copies','Published copies are read-only PDFs; superseded versions archived after the obsolete-copy finding was closed.',80],
  ['8.1',A,65,0,'Operating procedures; MSP service runbooks','Operational controls run through documented procedures and MSP runbooks. Outsourced processes listed with their control owners.',60],
  ['8.2',A,120,0,'Risk Register; annual assessment record','Full risk assessment performed annually and after the warehouse flood-zone remapping; results retained.',118],
  ['8.3',P,50,0,'Risk treatment plan tracker','Most treatment actions are on schedule. DLP rollout for price lists and WMS change-control fixes are behind plan.',48],
  ['9.1',P,45,0,'KPI dashboard (spreadsheet)','Metrics defined for patching, phishing, access reviews and incidents. Collection is manual and two metrics were not reported last quarter.',null],
  ['9.2.1',A,110,0,'Internal Audit Report FY2','Internal audit covered clauses 4-10 and 40 Annex A controls this cycle; remaining controls scheduled for next year.',108],
  ['9.2.2',A,160,0,'Audit Programme 3-year plan','Three-year programme assigns independent auditors; Oscar Martinez audits IT areas and the MSP consultant audits Finance, avoiding self-audit.',155],
  ['9.3.1',A,45,1,'Management Review minutes','Management review held twice a year, chaired by David Wallace with Michael Scott and Dwight Schrute attending.',44],
  ['9.3.2',P,45,1,'Management review agenda template','Agenda covers most required inputs. Interested-party feedback and supplier performance were not presented at the last review.',44],
  ['9.3.3',A,45,1,'Management review action log','Decisions and actions from review logged with owners and dates, including approval of the customer-portal risk acceptance.',40],
  ['10.1',A,90,0,'Improvement register','Improvement register captures suggestions from audits, incidents and staff; eleven items implemented this year.',85],
  ['10.2',P,30,0,'Nonconformity and Corrective Action Log','Nonconformities are logged with root cause. Effectiveness checks are not always recorded before closure and one action is overdue.',25],
];

const ANNEX=[
  ['A.5.1',A,200,1,'Information Security Policy set','Topic-specific policies (access, backup, supplier, acceptable use) approved by management and reviewed annually.',198,I,'Management direction required by clause 5.2 and by retail customer contracts that ask for a published policy set.'],
  ['A.5.2',A,110,1,'RACI chart','Security responsibilities defined for IT, warehouse and Finance leads in the RACI.',105,I,'Clear ownership needed so every treatment action in the risk plan has an accountable person.'],
  ['A.5.3',A,140,0,'ERP role design','Payment creation and approval split between AP clerks and Angela Martin in the ERP. No test of the rule since the ERP upgrade.',null,I,'Treats the business email compromise payment-fraud risk by stopping one person creating and approving payments.'],
  ['A.5.4',A,200,1,'Policy acknowledgement records','Managers require staff to acknowledge policies at hire and annually; completion checked at management review.',190,I,'Top management must visibly back the ISMS for staff to follow security rules in the warehouse and office.'],
  ['A.5.5',A,400,0,'Authority contact list','Contact list for police, regulators and the utility company kept in the incident plan. Not re-verified in over a year.',400,I,'Fast contact with authorities is needed for fraud reporting and breach notification obligations.'],
  ['A.5.6',A,180,0,'Industry ISAC membership; MSP threat bulletins','Dwight Schrute receives distribution-sector security bulletins through the MSP and a regional business group.',null,I,'Sector peer groups provide early warning of payment-fraud campaigns targeting distributors.'],
  ['A.5.7',A,60,0,'Managed EDR threat reports','MSP monthly threat summary reviewed and relevant items raised as risks or changes.',55,I,'Threat intelligence informs the ransomware risk to the WMS and ERP.'],
  ['A.5.8',A,150,0,'Project intake checklist','New IT projects answer a security checklist at intake; the BI project checklist is still open.',140,I,'Security requirements must be caught early in projects such as the BI rollout and portal changes.'],
  ['A.5.9',P,75,0,'Intune inventory; WMS device list','Laptops and servers inventoried. Warehouse handheld scanners and label printers are tracked in a separate spreadsheet not reconciled with Intune.',null,I,'An accurate asset list underpins treatment of the ransomware and laptop-loss risks.'],
  ['A.5.10',A,200,2,'Acceptable Use Policy','Acceptable use rules cover email, internet, removable media and personal devices; signed at onboarding.',195,I,'Sets baseline expectations for staff using customer and pricing data.'],
  ['A.5.11',A,90,0,'HR offboarding checklist','Laptops, badges and scanners collected on the last day; Toby Flenderson confirms return in the HR system.',85,I,'Recovers equipment and data from leavers, reducing laptop-loss and data leakage exposure.'],
  ['A.5.12',A,160,2,'Classification Scheme (Public/Internal/Confidential)','Three-level scheme applied to documents; price lists and customer contracts classified Confidential.',150,I,'Classification drives handling rules for customer price lists, the main leakage concern.'],
  ['A.5.13',A,160,2,'Microsoft 365 sensitivity labels','Sensitivity labels available in Office apps with Confidential as the default for Finance sites.',150,I,'Labels let staff and tools recognise Confidential pricing and HR files.'],
  ['A.5.14',A,120,0,'Secure email; SFTP to customers','Customer EDI and large files go over SFTP; email encryption available and required for payroll files.',110,I,'Protects order and payroll data in transit, as retail customer contracts require.'],
  ['A.5.15',A,95,0,'Access Control Policy; Entra ID groups','Role-based access through Entra ID groups for ERP, WMS and file shares, approved by data owners.',90,I,'Least-privilege access limits damage from compromised accounts in ransomware and fraud scenarios.'],
  ['A.5.16',A,80,0,'HR-driven provisioning; Entra ID','Accounts created from HR starter tickets and disabled on leaving; quarterly reconciliation to the HR roster.',78,I,'Timely joiner/mover/leaver handling prevents orphaned accounts in the ERP and WMS.'],
  ['A.5.17',A,70,0,'Entra ID password policy; password manager','Passphrase policy with MFA; IT uses a shared vault for service credentials.',65,I,'Strong credential handling reduces account takeover behind business email compromise.'],
  ['A.5.18',A,40,0,'Quarterly access review workbook','Quarterly entitlement reviews for ERP, WMS and Finance share signed by owners; WMS evidence gap closed.',38,I,'Periodic entitlement review catches access creep in the WMS and ERP.'],
  ['A.5.19',A,130,0,'Supplier Security Policy; Vendor Register','Suppliers tiered by criticality with security review before onboarding.',125,I,'Critical SaaS and backup suppliers hold customer and order data, so supplier risk must be managed.'],
  ['A.5.20',A,210,1,'Contract security schedule','Standard security schedule (breach notice, audit rights, data return) used for new supplier contracts; two legacy contracts lack it.',200,I,'Contract clauses give leverage over the WMS and customer-portal providers.'],
  ['A.5.21',P,130,0,'Supplier questionnaire','Questionnaire asks about subcontractors, but answers on the WMS provider hosting chain have not been verified.',null,I,'The customer-portal SaaS concentration risk depends on visibility into downstream hosting providers.'],
  ['A.5.22',A,100,0,'Supplier review meetings','Critical suppliers reviewed annually against service levels and security commitments; backup provider assurance refresh overdue.',95,I,'Ongoing oversight detects degradation in backup and WMS services before it affects delivery.'],
  ['A.5.23',A,150,0,'Cloud Service Standard','Cloud services approved by IT with tenant baseline settings for Microsoft 365 and the portal SaaS.',145,I,'Most in-scope processing runs in cloud services, so their configuration is a primary control point.'],
  ['A.5.24',P,35,0,'Incident Response Plan v2','Plan and roles exist, but the playbook for payment-fraud attempts was not written until after the recent incident.',30,I,'Preparation is needed to contain ransomware and business email compromise quickly.'],
  ['A.5.25',P,35,0,'Service desk incident category','Events logged in the service desk; triage criteria for what becomes a security incident are applied inconsistently by the warehouse team.',null,I,'Correct triage separates real attacks from noise so the MSP escalates the right events.'],
  ['A.5.26',P,35,0,'Incident Response Plan; MSP SOC','MSP SOC handles technical containment. Business-side steps (bank recall, customer notice) are not yet in the response procedure.',30,I,'Coordinated response limits payment loss and downtime from fraud or ransomware.'],
  ['A.5.27',G,35,0,'Incident log','Lessons learned are not recorded consistently; the fraudulent payment-change attempt was closed without a review.',null,I,'Learning from incidents is how the fraud and ransomware controls get better over time.'],
  ['A.5.28',A,180,0,'MSP evidence handling procedure','MSP preserves EDR and mailbox logs under a chain-of-custody form for incidents that may need legal follow-up.',170,I,'Evidence may be needed for insurance claims and police reports after fraud.'],
  ['A.5.29',A,220,0,'Business Continuity Plan','Continuity plan keeps security controls in place during manual-shipping fallback; MFA stays enforced on alternate access.',210,I,'Security must hold during disruptions such as a warehouse flood or WMS outage.'],
  ['A.5.30',P,120,0,'DR runbook; backup platform','ERP recovery tested last spring. WMS recovery with the SaaS provider has not been exercised against the four-hour target.',115,I,'ICT readiness directly treats ransomware downtime on the WMS and ERP.'],
  ['A.5.31',A,190,1,'Legal and Contractual Register','Register lists privacy, employment, tax record and customer contract obligations with owners.',185,I,'Keeps customer, employee-data and records obligations visible to the ISMS.'],
  ['A.5.32',A,390,0,'Software licence inventory','Licences tracked for Microsoft 365 and ERP seats; last true-up was over a year ago.',390,I,'Unlicensed software creates legal exposure and unsupported installs.'],
  ['A.5.33',A,160,2,'Microsoft 365 retention labels','Finance and HR records retained per the register; invoices kept seven years.',150,I,'Finance and HR record retention obligations apply to the in-scope departments.'],
  ['A.5.34',A,140,0,'Privacy Notice; HR data procedure','Employee and customer contact personal data handled per the privacy procedure; access limited to HR and Sales Ops.',135,I,'Protects employee and customer contact personal data handled by HR and sales.'],
  ['A.5.35',A,200,1,'External ISMS review report (fictional firm)','Independent review by a fictional advisory firm, Lakeside Assurance Partners, completed last year; findings tracked.',195,I,'Independent review gives management assurance beyond the internal audit programme.'],
  ['A.5.36',A,110,0,'Compliance check schedule','Managers self-check policy compliance each quarter and results feed internal audit.',100,I,'Regular compliance checks confirm the documented controls are actually followed.'],
  ['A.5.37',A,170,0,'IT operating procedures wiki','Documented procedures for backups, account admin and WMS batch jobs held in the IT wiki.',null,I,'Written procedures reduce dependency on individual staff for WMS and ERP operations.'],
  ['A.6.1',A,150,2,'Background check provider (fictional)','Background checks run for office and Finance hires; warehouse temps screened by the staffing agency under contract.',140,I,'Screening reduces insider risk for staff with payment and customer data access.'],
  ['A.6.2',A,200,2,'Employment contract template','Contracts include confidentiality and security obligations reviewed by HR.',190,I,'Employment terms make security duties enforceable for all in-scope staff.'],
  ['A.6.3',P,30,2,'Awareness platform; phishing simulations','Annual training completion at 88% against a 95% target; warehouse shift workers lag. Monthly phishing simulations running.',28,I,'Staff awareness is the main defence against business email compromise and phishing-led ransomware.'],
  ['A.6.4',A,200,2,'Disciplinary Policy','HR disciplinary policy covers security violations; applied once this year for password sharing.',420,I,'Credible consequences support policy adherence in the warehouse and office.'],
  ['A.6.5',A,90,2,'Leaver and mover checklist','Continuing confidentiality duties reminded in exit letters; movers get access re-approved.',85,I,'Reduces leakage of price lists by departing sales staff.'],
  ['A.6.6',A,210,2,'NDA template','NDAs signed by contractors and temps before access; register kept by HR.',null,I,'Contractors handling order data need signed confidentiality terms.'],
  ['A.6.7',A,120,0,'Remote Work Standard; VPN with MFA','Remote access only through managed laptops with VPN and MFA; home-working guidance issued.',115,I,'Sales and Finance staff work remotely with Confidential data.'],
  ['A.6.8',A,60,2,'Report-phishing button; service desk','Staff report events via the phishing button or service desk; 140 reports last quarter.',55,I,'Early reporting shortens dwell time for phishing and fraud attempts.'],
  ['A.7.1',A,180,0,'Site plans; perimeter fencing','Warehouse yard fenced with gated truck entry; office suite in a shared building with lobby security.',170,I,'Physical perimeters protect stock systems and the Scranton server room.'],
  ['A.7.2',P,100,0,'Badge access system','Office uses badge access. Warehouse side doors are propped open during peak loading and dock visitor logging is paper-based and incomplete.',null,I,'Controlled entry protects warehouse IT equipment and printed shipping documents.'],
  ['A.7.3',A,180,0,'Locked server room','Scranton server room locked with badge access limited to IT and Darryl Philbin for after-hours emergencies.',170,I,'Secures on-site servers and network equipment supporting the WMS.'],
  ['A.7.4',G,100,0,'CCTV (office only)','Office entrances covered by CCTV. Warehouse loading docks and the server room have no camera coverage or intrusion alarm monitoring.',null,I,'Monitoring detects unauthorised physical access to warehouse IT and stock areas.'],
  ['A.7.5',P,60,0,'Flood assessment; raised racks','Server rack raised above the flood line. Warehouse network cabinet still at floor level in the updated flood zone.',55,I,'Directly treats the Scranton warehouse flood risk identified in the context review.'],
  ['A.7.6',A,180,0,'Server room rules','Rules for working in the server room posted; visitors escorted and signed in.',null,I,'Supervised work in secure areas prevents accidental outages.'],
  ['A.7.7',A,90,2,'Clear desk walkthroughs','Monthly clear-desk walkthroughs by Pam Beesly; screen lock enforced at 10 minutes.',85,I,'Printed price lists and invoices on desks are a known leakage path.'],
  ['A.7.8',A,180,0,'Equipment placement standard','Printers with payroll output placed in Finance area; network gear out of public reach.',175,I,'Placement reduces exposure of sensitive printouts and equipment damage.'],
  ['A.7.9',P,80,0,'Intune; laptop travel guidance','Laptops encrypted, but branch-visit laptops are sometimes left in vehicles and loss reporting is slow.',75,I,'Treats the branch laptop loss risk for staff travelling between sites.'],
  ['A.7.10',A,150,0,'Removable media policy; Intune USB control','USB storage blocked by default with approved exceptions for EDI backup drives.',145,I,'Controls media that could carry customer data out of the business.'],
  ['A.7.11',A,200,0,'UPS; generator contract','Server room on UPS; generator hookup contract for the warehouse, last tested nine months ago.',190,I,'Power continuity keeps the warehouse shipping during outages.'],
  ['A.7.12',N,null,0,'','',null,I,'Protects network cabling between warehouse racks and the office from damage and tapping.'],
  ['A.7.13',A,380,0,'Maintenance contracts','Hardware maintenance contracts for servers and UPS; service records not checked for over a year.',380,I,'Maintained equipment reduces unplanned downtime for WMS terminals.'],
  ['A.7.14',A,370,0,'Disposal certificates','Retired drives wiped and disposed by a fictional certified recycler; certificates filed, last check over a year ago.',null,I,'Prevents data leakage from retired laptops and warehouse PCs.'],
  ['A.8.1',A,30,0,'Intune compliance policies','Laptops enrolled in Intune with encryption, screen lock and OS version rules; 97% compliant.',25,I,'Managed endpoints limit the laptop-loss and ransomware exposure.'],
  ['A.8.2',P,50,0,'Entra ID PIM (partial)','PIM enabled for Global Admin, but eleven accounts hold standing Exchange and SharePoint admin roles.',45,I,'Directly treats the cloud admin privilege sprawl risk.'],
  ['A.8.3',A,95,0,'SharePoint permissions; ERP roles','Access to Finance and pricing folders restricted to named groups and reviewed quarterly.',90,I,'Restricts who can open customer price lists and payroll data.'],
  ['A.8.4',X,300,0,'','No source code is developed or held within scope; WMS and ERP are vendor-supplied SaaS and packaged software.',null,E,'No in-house development in scope; the WMS, ERP and portal are vendor-owned and we hold no source code.'],
  ['A.8.5',A,45,0,'Entra ID Conditional Access; MFA','MFA enforced for all users and legacy authentication blocked; WMS uses SSO.',45,I,'Strong authentication is the primary block on business email compromise via stolen passwords.'],
  ['A.8.6',A,160,0,'MSP capacity reports','Monthly capacity reports for servers and storage; peak season load planned with the WMS provider.',150,I,'Capacity planning prevents order processing failures in the holiday peak.'],
  ['A.8.7',A,20,0,'Managed EDR; email filtering','Managed EDR on all laptops and servers with 24x7 MSP monitoring; attachment sandboxing enabled.',18,I,'Core defence against ransomware reaching the WMS and ERP.'],
  ['A.8.8',P,40,0,'Vulnerability scanner; patch reports','Monthly scans run. Critical patches meet 14-day SLA, but warehouse label-printer firmware is unpatched.',null,I,'Timely patching closes routes attackers use to deploy ransomware.'],
  ['A.8.9',A,110,0,'Intune baselines; CIS-aligned templates','Baseline configurations for Windows and Microsoft 365 documented and monitored for drift.',105,I,'Hardened configurations reduce the attack surface for ransomware.'],
  ['A.8.10',A,180,0,'Retention and deletion schedule','Data past retention deleted annually; last run documented for HR files.',175,I,'Deleting stale personal and customer data reduces exposure in a breach.'],
  ['A.8.11',N,null,0,'','',null,''],
  ['A.8.12',G,50,0,'Microsoft 365 DLP (pilot)','DLP policy for price lists only in pilot for Finance; sales staff can still email price lists externally without warning.',null,I,'Directly treats the customer price-list leakage risk.'],
  ['A.8.13',A,25,0,'Managed backup service','Nightly backups with immutable copies at the backup provider; quarterly restore tests passed.',22,I,'Recoverable backups are the last line of defence against ransomware on the ERP.'],
  ['A.8.14',A,180,0,'Dual internet circuits; SaaS SLA','Warehouse has dual ISP links; WMS provider SLA commits to 99.9% availability.',170,I,'Redundancy keeps order-to-delivery running if a circuit or host fails.'],
  ['A.8.15',A,70,0,'Managed SIEM (MSP)','Microsoft 365, Entra ID and firewall logs forwarded to the MSP SIEM with 12-month retention.',65,I,'Logs are needed to investigate fraud and ransomware incidents.'],
  ['A.8.16',P,70,0,'MSP SOC alerting','SOC monitors identity and endpoint alerts. WMS application logs are not yet monitored for anomalous activity.',65,I,'Monitoring detects account misuse before payment fraud or data theft completes.'],
  ['A.8.17',A,395,0,'NTP via domain controllers','Clocks synced to a common time source through domain policy; configuration not re-checked in over a year.',395,I,'Consistent timestamps are needed to correlate incident logs across systems.'],
  ['A.8.18',A,200,0,'Admin tool restrictions','PowerShell and admin utilities restricted to IT admin accounts via Intune policy.',null,I,'Limits misuse of powerful tools by attackers who gain a foothold.'],
  ['A.8.19',A,120,0,'Intune app deployment; standard user rights','Users have no local admin; software installed through Intune from an approved catalogue.',115,I,'Blocks unapproved software that could carry malware.'],
  ['A.8.20',A,140,0,'Managed firewalls','Firewalls at Scranton office and warehouse managed by the MSP with rule review twice a year.',135,I,'Network protection limits ransomware spread between office and warehouse.'],
  ['A.8.21',A,200,0,'ISP contracts; SD-WAN','Network service security requirements defined in ISP and SD-WAN contracts.',190,I,'Network services connect the warehouse to New York corporate IT and the WMS provider.'],
  ['A.8.22',A,140,0,'VLAN design','Warehouse scanners, office PCs, guest Wi-Fi and servers on separate VLANs.',135,I,'Segmentation contains a compromise of warehouse devices away from Finance systems.'],
  ['A.8.23',A,90,0,'DNS filtering','DNS filtering blocks malicious and uncategorised sites on and off network.',85,I,'Web filtering stops drive-by downloads that deliver ransomware.'],
  ['A.8.24',A,180,0,'BitLocker; TLS standards','Full-disk encryption on laptops and TLS 1.2+ for portal and email; key recovery in Entra ID.',175,I,'Encryption protects data on lost branch laptops and in transit to customers.'],
  ['A.8.25',A,210,0,'Vendor change intake','Secure development requirements applied to vendor-built WMS integrations and portal customisations through the change intake form.',200,I,'Custom integrations built by vendors for the WMS and portal still need a secure lifecycle.'],
  ['A.8.26',A,210,0,'Requirements template','Security requirements (SSO, logging, data location) included when buying or configuring applications.',200,I,'Application requirements stop insecure SaaS being adopted for order processing.'],
  ['A.8.27',A,250,0,'Architecture principles document','Principles such as SSO-first and SaaS in approved regions guide new system designs.',null,I,'Design principles keep new systems aligned with the ransomware and supplier risk treatments.'],
  ['A.8.28',X,300,0,'','No code is written in-house within scope; integrations are configured or built by suppliers.',null,E,'No software is coded by Dunder Mifflin staff within the ISMS scope, so secure coding practices have no in-scope activity.'],
  ['A.8.29',A,150,0,'UAT sign-off form','Vendor releases for the portal and WMS integrations pass user acceptance testing with a security checklist.',145,I,'Acceptance testing catches security defects in vendor releases before go-live.'],
  ['A.8.30',A,210,0,'Supplier contract; integration SOW','Outsourced integration work governed by SOW security terms and reviewed on delivery.',null,I,'Integration work is outsourced, so supervision of that development is required.'],
  ['A.8.31',A,180,0,'WMS sandbox tenant','WMS provider supplies a separate sandbox for testing; production data not used there by default.',175,I,'Separating test from production protects live order data during WMS changes.'],
  ['A.8.32',G,30,0,'Change Advisory Board; service desk change records','Standard changes go through CAB. Emergency WMS changes were made by the vendor without recorded approval or retrospective review.',28,I,'Directly treats the WMS change control risk that caused a shipping outage last year.'],
  ['A.8.33',N,null,0,'','',null,I,'Test data drawn from the ERP could expose customer records if not controlled.'],
  ['A.8.34',N,null,0,'','',null,I,'Audit and penetration tests on production WMS integrations must not disrupt shipping.'],
];

const row=([id,status,assessed_ago,owner,technology,narrative,evidence_ago,soa,justification])=>[id,{
  status,assessed_ago,owner,technology,narrative,evidence_ago,
  ...(soa!==undefined?{soa}:{}),...(justification?{justification}:{}),
}];

const program={
  framework:'iso-27001',
  profile:{
    organization:{
      locations:3,
      region:'Pennsylvania and New York',
      business_units:'Order-to-delivery; IT Services; Finance; HR',
      notes:'DEMO - SYNTHETIC DATA. ISMS scope: Scranton branch office, Scranton warehouse and supporting corporate IT in New York; other branches out of scope.',
    },
  },
  assessments:Object.fromEntries([...CLAUSES,...ANNEX].map(row)),
  findings:[
    {definition:'7.5.3',title:'Minor NC: obsolete policy copies in use at the warehouse',severity:'medium',description:'Printed copies of the superseded Acceptable Use Policy were posted in the warehouse break room and used in onboarding.',action:'Withdraw printed copies and publish read-only current versions only',assignee:2,due_in:-230,age:260,closed_ago:200},
    {definition:'9.2.2',title:'Minor NC: internal auditor audited own area',severity:'medium',description:'The IT access controls audit was performed by the person who administers those controls.',action:'Reassign audit areas to independent auditors in the audit programme',assignee:0,due_in:-170,age:210,closed_ago:150},
    {definition:'A.5.18',title:'Minor NC: WMS access review evidence missing',severity:'high',description:'Two quarterly WMS entitlement reviews had no signed record, so review completion could not be demonstrated.',action:'Complete and retain signed WMS access review for the current quarter',assignee:0,due_in:-100,age:150,closed_ago:90},
    {definition:'6.2',title:'OFI: security objectives not measurable',severity:'low',description:'Objectives were stated as intentions without targets or measurement methods.',action:'Define targets, data sources and owners for each objective',assignee:1,due_in:-70,age:120,closed_ago:60},
    {definition:'A.8.32',title:'Major NC: unapproved emergency WMS changes',severity:'high',description:'Three emergency WMS configuration changes in the sample had no approval or post-implementation review, one causing a shipping outage.',action:'Enforce emergency change approval and retrospective CAB review for WMS vendor changes',assignee:0,due_in:-18,age:75},
    {definition:'7.2',title:'Minor NC: contractor competence records incomplete',severity:'medium',description:'Competence evidence for warehouse IT contractors and temporary WMS support staff was missing.',action:'Collect competence records for all contractors in ISMS roles',assignee:2,due_in:20,age:40},
    {definition:'A.5.24',title:'Minor NC: payment-fraud incident closed without lessons learned',severity:'medium',description:'A business email compromise attempt to change supplier bank details was stopped, but no lessons-learned review or playbook update was recorded.',action:'Run lessons-learned review and add a payment-fraud playbook to the incident plan',assignee:0,due_in:35,age:30},
  ],
  review_findings:[
    {title:'Access Entitlement Review: two leavers retained WMS accounts for 20+ days',action:'Add the WMS to the HR leaver notification workflow'},
    {title:'Third-Party Security Review: backup provider assurance report expired',action:'Obtain current assurance report from the backup provider'},
    {title:'Security Awareness Review: warehouse shift completion below target',action:'Schedule in-shift awareness sessions for warehouse staff'},
    {title:'ISMS Internal Audit: supplier performance not presented at management review',action:'Add supplier performance summary to the management review agenda'},
  ],
  risks:[
    {title:'Ransomware disables WMS and ERP',description:'Ransomware via phishing or an unpatched device encrypts ERP servers and blocks WMS access, halting order-to-delivery.',category:'cybersecurity',likelihood:3,impact:5,status:'in_progress',treatment:'mitigate',plan:'Complete WMS recovery exercise and patch warehouse printer firmware.',owner:0,reviewed_ago:30,next_in:60},
    {title:'Business email compromise payment fraud',description:'Attackers impersonate suppliers or executives to redirect payments or change bank details.',category:'financial',likelihood:4,impact:4,status:'in_progress',treatment:'mitigate',plan:'Add payment-fraud playbook, callback verification and targeted Finance training.',owner:0,reviewed_ago:25,next_in:30},
    {title:'Scranton warehouse flood',description:'Updated flood mapping places the warehouse in a higher-risk zone; flooding could damage network equipment and stock.',category:'operational',likelihood:2,impact:4,status:'in_progress',treatment:'mitigate',plan:'Raise warehouse network cabinet and document manual-shipping fallback.',owner:1,reviewed_ago:60,next_in:30},
    {title:'Cloud admin privilege sprawl',description:'Standing admin roles in Microsoft 365 increase the impact of a compromised account.',category:'cybersecurity',likelihood:3,impact:4,status:'in_progress',treatment:'mitigate',plan:'Move remaining standing admin roles to PIM with approval.',owner:0,reviewed_ago:45,next_in:45},
    {title:'Customer portal SaaS concentration',description:'All customer self-service ordering depends on one portal SaaS provider with no alternative.',category:'vendor',likelihood:2,impact:4,status:'accepted',treatment:'accept',plan:'Monitor provider assurance and availability quarterly.',owner:1,reviewed_ago:70,next_in:40,
      acceptance:{rationale:'Accepted by David Wallace: switching cost exceeds exposure; provider holds current assurance and phone/email ordering is the fallback. Re-evaluate at contract renewal.',ago:70,expires_in:110}},
    {title:'Customer price-list leakage',description:'Confidential customer price lists emailed or uploaded outside the company by sales staff or leavers.',category:'compliance',likelihood:3,impact:3,status:'in_progress',treatment:'mitigate',plan:'Extend DLP from Finance pilot to Sales (overdue).',owner:0,reviewed_ago:50,next_in:20},
    {title:'Uncontrolled WMS changes',description:'Emergency vendor changes to WMS configuration bypass approval and can break shipping.',category:'operational',likelihood:3,impact:4,status:'in_progress',treatment:'mitigate',plan:'Enforce emergency change approval and review with the WMS provider.',owner:0,reviewed_ago:20,next_in:15},
    {title:'Branch laptop loss or theft',description:'Laptops carried between branches are lost or stolen, exposing cached Confidential data.',category:'cybersecurity',likelihood:3,impact:2,status:'assessed',treatment:'mitigate',plan:'Maintain encryption and remote wipe; refresh travel guidance.',owner:2,reviewed_ago:90,next_in:75},
    {title:'Unsupported warehouse file server',description:'Legacy file server on an unsupported OS held shipping documents.',category:'technology',likelihood:1,impact:3,status:'closed',treatment:'mitigate',plan:'Server decommissioned and data migrated to SharePoint.',owner:0,reviewed_ago:100,next_in:null,
      closure:{ago:120,reason:'remediated',rationale:'Server decommissioned, data migrated and disposal certificate filed.'}},
  ],
  vendors:[
    {name:'Palecrest WMS Cloud (fictional)',services:'Warehouse management system SaaS',criticality:'critical',data_types:['Customer Data','Operational Data','API / Integration Access'],owner:0,last_review_ago:150,next_review_in:40,renewal_in:200,assurance:{type:'SOC 2',received_ago:340,refresh_in:22},notes:'Fictional provider. Emergency change handling under review.'},
    {name:'Vaultbarn Backup Services (fictional)',services:'Managed backup and recovery',criticality:'high',data_types:['Confidential','Customer Data','Employee Data','Privileged Access'],owner:0,last_review_ago:210,next_review_in:10,renewal_in:120,assurance:{type:'ISO 27001',received_ago:380,refresh_in:-14},notes:'Fictional provider. Assurance refresh overdue; request sent.'},
    {name:'Portlight Commerce (fictional)',services:'Customer ordering portal SaaS',criticality:'high',data_types:['Customer Data','PII','Financial'],owner:1,last_review_ago:70,next_review_in:110,renewal_in:180,assurance:{type:'SOC 2',received_ago:90,refresh_in:275},notes:'Fictional provider. Concentration risk accepted by top management.'},
    {name:'Treeline Payroll (fictional)',services:'Payroll processing',criticality:'medium',data_types:['Employee Data','PII','Financial'],owner:2,last_review_ago:180,next_review_in:185,renewal_in:300,assurance:{type:'Security Questionnaire',received_ago:180,refresh_in:185},notes:'Fictional provider. Questionnaire reviewed by Finance and HR.'},
  ],
};

export default program;

const CID='demo_dunder',person=i=>CID+'_user_'+i;
const previousDate=(value,months)=>{const d=new Date(value+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);};
const evidence=(db,client,key,title,kind,id,at,owner,extra={})=>{const text='DEMO - SYNTHETIC DATA\n'+title+'\nCollected: '+at,bytes=encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16))),item={evidence_id:client.client_id+'_evidence_'+key,client_id:client.client_id,filename:key+'.txt',display_name:title,mime_type:'text/plain',size:bytes.length,content_base64:btoa(bytes),evidence_type:'Report',linked_type:kind,linked_id:id,uploaded_by:owner,uploaded_by_email:db.users.find(u=>u.user_id===owner)?.email||'historical@example.test',created_at:at,evidence_date:at,version:1,notes:'DEMO - SYNTHETIC DATA',...extra};db.evidence.push(item);return item;};
const OBJECTIVES=[
  {key:'phishing',objective:'Reduce susceptibility to credential-phishing attacks',target:'Keep simulated-phishing click rate below 5% each quarter',owner:2,method:'Quarterly awareness-platform campaign result',status:'on_track',result:'Latest quarter: 3.8%',due:75},
  {key:'patching',objective:'Reduce exposure to exploitable endpoint vulnerabilities',target:'At least 95% of critical endpoint patches installed within 14 days',owner:0,method:'Monthly vulnerability and patch compliance report',status:'attention',result:'Latest month: 91%; warehouse label-printer firmware is overdue',due:28},
  {key:'awareness',objective:'Maintain workforce security-awareness participation',target:'At least 98% completion within 30 days of assignment',owner:2,method:'Monthly training completion export by workforce group',status:'attention',result:'Overall 97%; warehouse night shift is 89%',due:45},
  {key:'recovery',objective:'Demonstrate recoverability of critical order services',target:'Restore the ERP and WMS dependency set within the approved four-hour recovery target',owner:0,method:'Semiannual recovery exercise with timed results',status:'on_track',result:'Latest exercise: 3h 32m; one application dependency follow-up remains open',due:120},
];

const cadence=(rationale,source='organization_defined')=>({category:'organizational',rationale:'Recurring ISMS governance with retained occurrence evidence and follow-up.',cadence_source:source,cadence_rationale:rationale,citation:'ISO/IEC 27001:2022 operating programme; consult the licensed standard for normative wording.'});
const completedOccurrence=(r,due,db)=>{
  const completed=demoDates(new Date(due+'T12:00:00Z'))(-1),who=r.reviewer_id||r.owner_id,snapshot=Object.fromEntries(['review_id','client_id','title','review_type','recurrence','owner_id','reviewer_id','scope','framework_drivers','baseline_key','framework_key','framework_safeguards','framework_plan_key','governance_context','policy_id'].filter(k=>r[k]!==undefined).map(k=>[k,JSON.parse(JSON.stringify(r[k]))]));
  return {...snapshot,...reviewSchedule({...r,due_date:due},true),occurrence_id:r.review_id+'_'+due,due_date:due,status:'completed',completed_at:completed,completion_date:completed,completed_by:who,completed_by_name:db.users.find(u=>u.user_id===who)?.name||'Historical user',outcome:'no_findings',finding_count:0,evidence:[]};
};

// Adds Dunder's connected operating history after the shared seed is complete.
// It is Demo-only and does not run during production startup.
export function finishDunder(db,clock){
  const client=db.clients.find(c=>c.client_id===CID);if(!client)return db;
  const date=demoDates(clock),review=key=>db.reviews.find(r=>r.client_id===CID&&(r.framework_plan_key===key||r.baseline_key===key));
  client.demo_program_version='iso27001-year2-v1';
  client.notes='DEMO - SYNTHETIC DATA. Year-2 operating ISO/IEC 27001:2022 ISMS; assessment progress is not certification or a compliance conclusion.';
  const contactDetails=[
    ['Dwight Schrute','ISMS Manager','dwight.schrute@dundermifflin.example.test','570-555-0101'],
    ['David Wallace','Chief Financial Officer and Executive Sponsor','david.wallace@dundermifflin.example.test','212-555-0102'],
    ['Pam Beesly','Office Administrator and Document Control Coordinator','pam.beesly@dundermifflin.example.test','570-555-0103'],
    ['Michael Scott','Regional Manager','michael.scott@dundermifflin.example.test','570-555-0104'],
    ['Jim Halpert','Assistant Regional Manager','jim.halpert@dundermifflin.example.test',null],
    ['Angela Martin','Accounting Manager','angela.martin@dundermifflin.example.test',null],
    ['Oscar Martinez','Senior Accountant and Internal Auditor','oscar.martinez@dundermifflin.example.test',null],
    ['Toby Flenderson','Human Resources Representative','toby.flenderson@dundermifflin.example.test',null],
    ['Darryl Philbin','Warehouse Operations Manager','darryl.philbin@dundermifflin.example.test',null],
  ];
  db.contacts.filter(c=>c.client_id===CID).forEach((c,i)=>{const [name,title,email,phone]=contactDetails[i];Object.assign(c,{name,title,email,...(phone?{phone}:{})});delete c.role;delete c.grc_roles;});

  for(const r of db.reviews.filter(r=>r.client_id===CID)){
    const key=r.framework_plan_key||r.baseline_key;
    if(key==='iso-user-access'||key==='user-access')r.governance_context=cadence('iVenture operating cadence: quarterly access review. ISO requires controlled access and periodic review where appropriate, but does not prescribe this exact interval.','risk_based');
    else if(key==='iso-management-review'||key==='management-review')r.governance_context=cadence('Program Standard: management selected an annual formal review. ISO requires review at planned intervals; it does not prescribe annual frequency.');
    else if(key==='iso-internal-audit')r.governance_context=cadence('Program Standard: annual package recurrence, staggered across quarters for usability. ISO requires a planned audit programme, not quarterly audits.');
    else if(key?.startsWith('iso-'))r.governance_context=cadence('Omnisciente recommended cadence: annual programme review and review after material change. The configured interval is operational unless a cited source states otherwise.','recommended');
  }

  const management=review('iso-management-review')||review('management-review');
  if(management){
    Object.assign(management,{scope:'Suitability, adequacy and effectiveness of the Dunder Mifflin ISMS',participants:['David Wallace','Michael Scott','Dwight Schrute','Pam Beesly','Oscar Martinez','Sam Okafor'],management_review:{inputs:[
      ['Prior actions','complete'],['Changes in context and interested parties','complete'],['Security performance and trends','complete'],['Nonconformities and corrective actions','complete'],['Monitoring and measurement','complete'],['Internal audit results','complete'],['Objective achievement','complete'],['Interested-party feedback','attention'],['Risk assessment and treatment','complete'],['Supplier performance','attention'],['Improvement opportunities','complete']],decisions:['Fund immutable backup retention for the ERP and WMS dependency set','Accept the portal concentration risk through contract renewal','Require supplier performance in the next review pack'],improvements:['Automate patch and awareness scorecard feeds'],required_changes:['Add New York corporate IT support interfaces to the scope appendix'],actions:['Add supplier performance summary to the next management review agenda','Assign objective data owners for patch and awareness metrics']}});
    const last=management.occurrences?.at(-1);if(last)Object.assign(last,{participants:management.participants,management_review:management.management_review,notes:'DEMO - SYNTHETIC DATA. Decisions and required changes were recorded; two inputs require follow-up.'});
    const e=evidence(db,client,'iso-management-review','ISO 27001 / Management Review / approved minutes','review',management.review_id,last?.completed_at||date(-45),management.reviewer_id,{occurrence_id:last?.occurrence_id,evidence_type:'Meeting Minutes'});
    if(last)last.evidence.push({evidence_id:e.evidence_id,filename:e.filename,version:1});
  }

  const objectiveReview=review('iso-objective-review');
  if(objectiveReview){
    const last=objectiveReview.occurrences?.at(-1);
    Object.assign(objectiveReview,{title:'ISMS Objectives Review',recurrence:'quarterly',status:'in_progress',due_date:last?reviewSchedule({...objectiveReview,recurrence:'quarterly',due_date:last.due_date},true).next_review_date:date(75),governance_context:cadence('Client-selected quarterly measurement. ISO requires objectives to be monitored and updated as appropriate, but does not prescribe this interval.'),isms_objectives:OBJECTIVES.map((o,i)=>({...o,owner_id:person(o.owner),timeframe:'FY'+date(0).slice(0,4),history:[{at:date(-280),result:i===1?'87%':'Baseline established'},{at:date(-100),result:o.result}]}))});
    const scorecard=evidence(db,client,'iso-objectives','ISO 27001 / Objectives / security objectives scorecard','review',objectiveReview.review_id,date(-40),person(2),{occurrence_id:last?.occurrence_id,evidence_type:'Metrics / Scorecard'});
    if(last){last.evidence=last.evidence||[];last.evidence.push({evidence_id:scorecard.evidence_id,filename:scorecard.filename,version:1});}
  }

  const policies=db.policies.filter(p=>p.client_id===CID);
  const centralPolicy=review('iso-policy-review')||review('policy-review');if(centralPolicy){const last=centralPolicy.occurrences?.at(-1);centralPolicy.recurrence='annual';Object.assign(centralPolicy,{title:'ISO Policy Set Review',policy_ids:policies.map(p=>p.policy_id),status:'upcoming',due_date:last?reviewSchedule({...centralPolicy,due_date:last.due_date},true).next_review_date:date(95),governance_context:cadence('Program Standard: annual policy-set review plus reassessment after material change. ISO does not prescribe this exact annual interval.')});policies.forEach(p=>{Object.assign(p,{last_reviewed_at:last?.completed_at||null,next_review_date:centralPolicy.due_date,schedule_from_reviews:true});delete p.decision_history;});}

  const scope='Scranton office and warehouse order-to-delivery operations, Finance and HR, and supporting New York corporate IT interfaces; other branches are excluded with interfaces documented.';
  const independence='Oscar Martinez audits operational and supplier areas outside his accounting work; the MSP GRC consultant audits Finance and access-control areas. Neither auditor validates their own control operation.';
  client.iso_audit_program={status:'active',activated_at:date(-620),activated_by:person(0),configuration:{client_id:CID,start_date:date(-620),first_package:isoAuditCatalog.packages[0].key,auditor_id:person(2),scope,independence},schedule:[]};
  const today=new Date(date(0)+'T12:00:00Z'),quarterEnd=offset=>new Date(Date.UTC(today.getUTCFullYear(),Math.floor(today.getUTCMonth()/3)*3+3*(offset+1),0,12)).toISOString().slice(0,10);
  isoAuditCatalog.packages.forEach((pack,i)=>{
    const due=quarterEnd(i),rid=CID+'_audit_'+pack.key,r=reviewView({review_id:rid,client_id:CID,title:'Internal Audit — '+pack.title,review_type:'requirements',recurrence:'annual',due_date:due,status:i===1?'in_progress':'upcoming',owner_id:i%2?person(2):'demo_provider_consultant',reviewer_id:person(1),scope,created_at:date(-620),updated_at:date(-3),created_by:person(0),iso_audit:initialAuditState(pack.key,3),occurrences:[],audit_program_start:date(-620),audit_independence:independence,framework_key:'iso-27001',framework_safeguards:[...new Set(pack.items.map(x=>x.definition_id))],governance_context:cadence('Program Standard: each audit package recurs annually and packages are staggered across quarters. This is an operating model, not an ISO-prescribed quarterly cadence.')});
    client.iso_audit_program.schedule.push({package_key:pack.key,title:pack.title,due_date:previousDate(due,24)});
    for(const back of i<1?[1]:[]){
      const o=completedOccurrence(r,previousDate(due,back*12),db),report=evidence(db,client,'audit-'+pack.key+'-'+back,'ISO 27001 / Internal Audit / '+pack.title+' / issued report','review',rid,o.completed_at,o.completed_by,{occurrence_id:o.occurrence_id,evidence_type:'Audit Report'});o.evidence.push({evidence_id:report.evidence_id,filename:report.filename,version:1});o.iso_audit=initialAuditState(pack.key,3-back);o.iso_audit.report_evidence_id=report.evidence_id;
      pack.items.forEach(item=>{o.iso_audit.items[item.key]={status:'reviewed',result:'conforming',notes:'',evidence_ids:item===pack.items[0]?[report.evidence_id]:[],finding_ids:[]};});r.occurrences.push(o);
    }
    if(i===1)pack.items.slice(0,8).forEach(item=>{r.iso_audit.items[item.key]={...blankAuditItem(),status:'reviewed',result:'conforming',notes:'Current-cycle synthetic sample completed.',updated_at:date(-5),updated_by:r.owner_id};});
    db.reviews.push(r);for(const a of db.framework_assessments.filter(a=>a.client_id===CID&&a.framework_key==='iso-27001'&&r.framework_safeguards.includes(a.definition_id)))a.related_links.push({kind:'reviews',id:rid});
  });
  const oldAudit=review('iso-internal-audit');if(oldAudit)Object.assign(oldAudit,{status:'cancelled',cancelled_at:date(-2),notes:'Replaced prospectively by the four-package annual audit programme; prior history remains retained.'});

  const auditReview=db.reviews.find(r=>r.review_id===CID+'_audit_'+isoAuditCatalog.packages[0].key),auditOccurrence=auditReview?.occurrences.at(-1);
  if(auditReview&&auditOccurrence){
    const finding={finding_id:CID+'_audit_finding_supplier',client_id:CID,title:'Internal audit observation: supplier performance omitted from management review',description:'The audit found that supplier assurance status and performance trends were not included in the latest management review input pack.',status:'in_remediation',severity:'medium',owner_id:person(0),review_id:auditReview.review_id,occurrence_id:auditOccurrence.occurrence_id,due_date:date(35),created_at:auditOccurrence.completed_at,updated_at:date(-3),created_by:auditOccurrence.completed_by};db.findings.push(finding);db.tasks.push({task_id:CID+'_audit_action_supplier',client_id:CID,title:'Add supplier performance to the management review input pack',source:'Finding remediation',source_type:'review',source_id:auditReview.review_id,review_id:auditReview.review_id,occurrence_id:auditOccurrence.occurrence_id,finding_id:finding.finding_id,assignee_id:person(0),due_date:date(35),status:'in_progress',created_at:auditOccurrence.completed_at,updated_at:date(-3),created_by:auditOccurrence.completed_by,title_generated:false});auditOccurrence.outcome='findings_raised';auditOccurrence.finding_count=1;
  }

  const refs=[['A.8.13','A.5.30'],['A.5.17','A.8.5'],['A.7.5','A.7.11'],['A.8.2','A.8.18'],['A.5.19','A.5.22'],['A.8.12','A.5.34'],['A.8.32','A.5.37'],['A.7.9','A.8.1'],['A.8.8']];
  db.risks.filter(r=>r.client_id===CID).forEach((r,i)=>{r.control_refs=refs[i]||[];r.treatment_reference='Risk Treatment RT-'+String(i+1).padStart(2,'0');r.related_links=[...(r.related_links||[]),...r.control_refs.map(id=>({kind:'framework_assessments',id:db.framework_assessments.find(a=>a.client_id===CID&&a.framework_key==='iso-27001'&&a.definition_id===id)?.framework_assessment_id})).filter(x=>x.id)];});
  evidence(db,client,'iso-scope','ISO 27001 / Clauses / approved ISMS scope statement','framework_assessment',db.framework_assessments.find(a=>a.client_id===CID&&a.definition_id==='4.3')?.framework_assessment_id,date(-88),person(0),{evidence_type:'Scope Statement'});
  evidence(db,client,'iso-soa','ISO 27001 / SoA / approved Statement of Applicability v4','framework_assessment',db.framework_assessments.find(a=>a.client_id===CID&&a.definition_id==='6.1.3')?.framework_assessment_id,date(-68),person(0),{evidence_type:'Statement of Applicability'});
  // Retain representative authoritative files instead of one duplicate validation file per Annex control.
  db.evidence=db.evidence.filter(e=>e.client_id!==CID||!e.evidence_id.startsWith(CID+'_evidence_iso-27001-'));
  const retainedEvidence=new Set(db.evidence.map(e=>e.evidence_id));for(const a of db.framework_assessments.filter(a=>a.client_id===CID))a.related_links=(a.related_links||[]).filter(l=>l.kind!=='evidence'||retainedEvidence.has(l.id));
  const riskControls=new Set(db.risks.filter(r=>r.client_id===CID).flatMap(r=>r.control_refs||[]));
  // Keep assessment history where it demonstrates a decision, gap or treatment link;
  // the current implementation remains authoritative for routine implemented controls.
  for(const a of db.framework_assessments.filter(a=>a.client_id===CID&&a.status==='addressed'&&!riskControls.has(a.definition_id)&&!['4.3','6.1.3','9.2.2','9.3.1'].includes(a.definition_id)))delete a.assessment_history;
  // Retain the latest operating occurrences plus prior-year annual governance; this
  // keeps the complete four-client preview below the browser's session-storage ceiling.
  const historyStart=date(-365);
  const linkedOccurrences=new Set([...db.evidence,...db.findings,...db.tasks].filter(row=>row.client_id===CID).map(row=>row.occurrence_id).filter(Boolean));
  for(const r of db.reviews.filter(r=>r.client_id===CID&&r.occurrences?.length)){
    const retained=r.occurrences.filter(o=>linkedOccurrences.has(o.occurrence_id)||(o.due_date||o.completed_at||'')>=historyStart);r.occurrences=retained.length?retained:[r.occurrences.at(-1)];
  }
  return db;
}
