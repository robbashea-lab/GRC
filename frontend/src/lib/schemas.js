// Schemas & column definitions for each entity kind

export const SCHEMAS = {
  reviews: {
    title: "Reviews",
    subtitle: "Reusable review workflow — asset, software, access, vendor, policy, risk, vulnerability, BCP/DR, incident, awareness.",
    columns: [
      { key: "title", label: "Title", primary: true },
      { key: "review_type", label: "Type" },
      { key: "status", label: "Status", badge: true },
      { key: "due_date", label: "Due", date: true },
      { key: "recurrence", label: "Recurs" },
      { key: "next_review_date", label: "Next", date: true },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "review_type", label: "Review type", type: "select", options: [
        { value: "asset", label: "Asset" }, { value: "software", label: "Software" },
        { value: "access", label: "Access" }, { value: "vendor", label: "Vendor" },
        { value: "policy", label: "Policy" }, { value: "risk", label: "Risk" },
        { value: "vulnerability", label: "Vulnerability / Patch" },
        { value: "bcp_dr", label: "BCP / DR" }, { value: "incident", label: "Incident Response" },
        { value: "awareness", label: "Security Awareness" },
      ]},
      { name: "status", label: "Status", type: "select", options: [
        { value: "planned", label: "Planned" }, { value: "in_progress", label: "In progress" },
        { value: "blocked", label: "Blocked" }, { value: "completed", label: "Completed" },
        { value: "overdue", label: "Overdue" },
      ]},
      { name: "period", label: "Period (e.g. Q1 2026)" },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "owner_id", label: "Owner", type: "user" },
      { name: "reviewer_id", label: "Reviewer", type: "user" },
      { name: "recurrence", label: "Recurrence", type: "select", options: [
        { value: "none", label: "One-time" }, { value: "monthly", label: "Monthly" },
        { value: "quarterly", label: "Quarterly" }, { value: "semiannual", label: "Semi-annual" },
        { value: "annual", label: "Annual" },
      ]},
      { name: "next_review_date", label: "Next review date", type: "date" },
      { name: "completion_date", label: "Completion date", type: "date" },
      { name: "scope", label: "Scope", type: "textarea" },
      { name: "notes", label: "Notes / findings", type: "textarea" },
    ],
  },
  findings: {
    title: "Findings",
    subtitle: "Issues raised from reviews, controls testing, or incidents. Connect to remediation tasks and risks.",
    columns: [
      { key: "title", label: "Finding", primary: true },
      { key: "severity", label: "Severity", badge: true },
      { key: "status", label: "Status", badge: true },
      { key: "due_date", label: "Due", date: true },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "severity", label: "Severity", type: "select", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
        { value: "high", label: "High" }, { value: "critical", label: "Critical" },
      ]},
      { name: "status", label: "Status", type: "select", options: [
        { value: "open", label: "Open" }, { value: "in_remediation", label: "In remediation" },
        { value: "remediated", label: "Remediated" }, { value: "closed", label: "Closed" },
        { value: "accepted", label: "Risk accepted" },
      ]},
      { name: "owner_id", label: "Owner", type: "user" },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "remediation_plan", label: "Remediation plan", type: "textarea" },
    ],
  },
  risks: {
    title: "Risks",
    subtitle: "Risk register with likelihood, impact, treatment, and acceptance workflow.",
    columns: [
      { key: "title", label: "Risk", primary: true },
      { key: "category", label: "Category" },
      { key: "likelihood", label: "Likelihood", badge: true },
      { key: "impact", label: "Impact", badge: true },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "category", label: "Category", type: "select", options: [
        { value: "cybersecurity", label: "Cybersecurity" }, { value: "operational", label: "Operational" },
        { value: "vendor", label: "Vendor / Third-party" }, { value: "compliance", label: "Compliance" },
        { value: "financial", label: "Financial" },
      ]},
      { name: "likelihood", label: "Likelihood", type: "select", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
      ]},
      { name: "impact", label: "Impact", type: "select", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
      ]},
      { name: "status", label: "Status", type: "select", options: [
        { value: "identified", label: "Identified" }, { value: "assessed", label: "Assessed" },
        { value: "treated", label: "Treated" }, { value: "accepted", label: "Accepted" },
        { value: "closed", label: "Closed" },
      ]},
      { name: "owner_id", label: "Owner", type: "user" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "treatment", label: "Treatment / mitigation", type: "textarea" },
    ],
  },
  policies: {
    title: "Policies",
    subtitle: "Policy library with version, approval history, and review dates.",
    columns: [
      { key: "title", label: "Policy", primary: true },
      { key: "version", label: "Version" },
      { key: "status", label: "Status", badge: true },
      { key: "approved_at", label: "Approved", date: true },
      { key: "next_review_date", label: "Next review", date: true },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "version", label: "Version" },
      { name: "status", label: "Status", type: "select", default: "draft", options: [
        { value: "draft", label: "Draft" }, { value: "in_review", label: "In review" },
        { value: "approved", label: "Approved" }, { value: "retired", label: "Retired" },
      ]},
      { name: "owner_id", label: "Owner", type: "user" },
      { name: "approver_id", label: "Approver", type: "user" },
      { name: "approved_at", label: "Approved on", type: "date" },
      { name: "next_review_date", label: "Next review date", type: "date" },
      { name: "summary", label: "Summary", type: "textarea" },
    ],
  },
  vendors: {
    title: "Vendors",
    subtitle: "Third-party vendors with criticality, contracts and review status.",
    columns: [
      { key: "name", label: "Vendor", primary: true },
      { key: "services", label: "Services" },
      { key: "criticality", label: "Criticality", badge: true },
      { key: "status", label: "Status", badge: true },
      { key: "contract_end", label: "Contract end", date: true },
    ],
    fields: [
      { name: "name", label: "Vendor name", required: true },
      { name: "criticality", label: "Criticality", type: "select", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
        { value: "high", label: "High" }, { value: "critical", label: "Critical" },
      ]},
      { name: "status", label: "Status", type: "select", options: [
        { value: "active", label: "Active" }, { value: "under_review", label: "Under review" },
        { value: "terminated", label: "Terminated" },
      ]},
      { name: "contact_email", label: "Contact email" },
      { name: "services", label: "Services provided", type: "textarea" },
      { name: "contract_end", label: "Contract end", type: "date" },
    ],
  },
  assets: {
    title: "Assets",
    subtitle: "IT & business assets with owner, criticality and lifecycle status.",
    columns: [
      { key: "name", label: "Asset", primary: true },
      { key: "asset_type", label: "Type" },
      { key: "criticality", label: "Criticality", badge: true },
      { key: "location", label: "Location" },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [
      { name: "name", label: "Asset name", required: true },
      { name: "asset_type", label: "Type", type: "select", options: [
        { value: "server", label: "Server" }, { value: "workstation", label: "Workstation" },
        { value: "database", label: "Database" }, { value: "application", label: "Application" },
        { value: "network", label: "Network device" }, { value: "saas", label: "SaaS" },
      ]},
      { name: "criticality", label: "Criticality", type: "select", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
        { value: "high", label: "High" }, { value: "critical", label: "Critical" },
      ]},
      { name: "location", label: "Location / region" },
      { name: "owner_id", label: "Owner", type: "user" },
      { name: "status", label: "Status", type: "select", options: [
        { value: "active", label: "Active" }, { value: "under_review", label: "Under review" },
        { value: "terminated", label: "Retired" },
      ]},
    ],
  },
  tasks: {
    title: "Tasks",
    subtitle: "Remediation & operational work items connected to findings and reviews.",
    columns: [
      { key: "title", label: "Task", primary: true },
      { key: "priority", label: "Priority", badge: true },
      { key: "status", label: "Status", badge: true },
      { key: "due_date", label: "Due", date: true },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "priority", label: "Priority", type: "select", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
        { value: "high", label: "High" }, { value: "critical", label: "Critical" },
      ]},
      { name: "status", label: "Status", type: "select", options: [
        { value: "open", label: "Open" }, { value: "in_progress", label: "In progress" },
        { value: "blocked", label: "Blocked" }, { value: "done", label: "Done" },
      ]},
      { name: "assignee_id", label: "Assignee", type: "user" },
      { name: "due_date", label: "Due date", type: "date" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },
  exceptions: {
    title: "Exceptions",
    subtitle: "Risk acceptances and control exceptions with expiry, linked to risks and findings.",
    columns: [
      { key: "title", label: "Exception", primary: true },
      { key: "status", label: "Status", badge: true },
      { key: "expires_at", label: "Expires", date: true },
    ],
    fields: [
      { name: "title", label: "Title", required: true },
      { name: "status", label: "Status", type: "select", options: [
        { value: "requested", label: "Requested" }, { value: "approved", label: "Approved" },
        { value: "expired", label: "Expired" }, { value: "revoked", label: "Revoked" },
      ]},
      { name: "owner_id", label: "Owner", type: "user" },
      { name: "approver_id", label: "Approver", type: "user" },
      { name: "expires_at", label: "Expiry date", type: "date" },
      { name: "risk_id", label: "Linked risk ID" },
      { name: "finding_id", label: "Linked finding ID" },
      { name: "justification", label: "Business justification", type: "textarea" },
      { name: "compensating_controls", label: "Compensating controls", type: "textarea" },
    ],
  },
};
