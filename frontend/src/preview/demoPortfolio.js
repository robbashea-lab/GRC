// Fictional client context only. Framework definitions remain catalog-owned.
export const demoOrganizations = [{
  key: 'brawndo',
  name: 'Brawndo',
  frameworks: ['cis-ig1'],
  industry: 'Consumer products / beverage',
  employees: 180,
  people: ['Joe Bowers', 'President Camacho', 'Frito Pendejo', 'Rita']
}, {
  key: 'dunder',
  name: 'Dunder Mifflin',
  frameworks: ['iso-27001'],
  industry: 'Business supplies / distribution',
  employees: 450,
  people: ['Dwight Schrute', 'David Wallace', 'Pam Beesly', 'Michael Scott', 'Jim Halpert', 'Angela Martin', 'Oscar Martinez', 'Toby Flenderson', 'Darryl Philbin']
}, {
  key: 'prestige',
  name: 'Prestige Worldwide',
  frameworks: ['soc-2'],
  industry: 'Media / technology services',
  employees: 130,
  people: ['Dale Doback', 'Robert Doback', 'Brennan Huff', 'Nancy Huff', 'Derek Huff', 'Alice Huff']
}];
export function demoDates(clock = new Date()) {
  const anchor = new Date(clock);
  anchor.setUTCHours(12, 0, 0, 0);
  if (!Number.isFinite(anchor.getTime())) throw new Error('Invalid demo date');
  return days => new Date(anchor.getTime() + days * 86400000).toISOString().slice(0, 10);
}
export function demoProfile(org, date) {
  const healthcare = org.frameworks.includes('hipaa');
  return {
    organization: {
      legal_name: org.name,
      domain: org.key + '.example.test',
      organization_type: 'Private company',
      employees: org.employees,
      technology_users: org.employees - 20,
      locations: 3,
      country: 'United States',
      region: 'Multi-site',
      operating_regions: 'United States',
      business_units: 'Operations; Technology; Finance; People',
      business_model: ['B2B'],
      workforce: healthcare ? 'Primarily onsite' : 'Hybrid',
      it_management: ['Internal IT', 'Co-managed'],
      cyber_insurance: 'Yes',
      insurer: 'Synthetic Mutual (fictional)',
      insurance_renewal: date(100),
      notes: 'DEMO - SYNTHETIC DATA. Year-2 program; fictional role adaptations, not assertions about source characters.'
    },
    technical: {
      identity: ['Microsoft Entra ID'],
      productivity: ['Microsoft 365'],
      cloud: ['Microsoft Azure'],
      infrastructure: ['Hybrid', 'SaaS-first'],
      endpoints: ['Windows', 'macOS', 'iOS'],
      network: ['Corporate wireless', 'Guest wireless', 'VPN'],
      operating_environment: ['SaaS applications'],
      security_technology: ['EDR/XDR', 'MFA', 'Backup', 'MDM', 'Vulnerability management', 'Email security']
    },
    security: {
      data_types: ['Employee information', 'Customer confidential information', ...(healthcare ? ['PHI / ePHI'] : [])],
      collects: 'Yes',
      stores: 'Yes',
      processes: 'Yes',
      transmits: 'Yes',
      hosts: 'No',
      admin_access: 'No',
      develops: 'No',
      information_security: 'Implemented',
      risk_management: 'Implemented',
      incident_response: 'Implemented',
      business_continuity: 'Implemented',
      disaster_recovery: 'Partial',
      vulnerability_management: 'Implemented',
      patch_management: 'Implemented',
      awareness: 'Implemented',
      third_party: 'Implemented',
      classification: 'Implemented',
      access_management: 'Implemented',
      restoration: 'Partial',
      secure_development: 'Not Applicable',
      ai_governance: 'Partial'
    }
  };
}
