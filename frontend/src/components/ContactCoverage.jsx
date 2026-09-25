import './RegisterSignalBar.css';

// Governance coverage: are the program's key responsibilities designated to a person?
// Contacts identify business people; a designation grants no platform access or approval authority.
const ROLES=['Executive Sponsor','Information Security Lead','IT Lead','Incident Response Lead','Business Continuity / Disaster Recovery Lead','Vendor / Third-Party Contact','HR Contact','Legal / Privacy Contact'];
const SHORT={'Business Continuity / Disaster Recovery Lead':'BC / DR Lead','Vendor / Third-Party Contact':'Third-Party Contact'};
export default function ContactCoverage({rows}){
  const active=rows.filter(c=>c.status!=='inactive');
  const holders=role=>active.filter(c=>c.role===role||(c.grc_roles||[]).includes(role));
  const missing=ROLES.filter(r=>!holders(r).length).length;
  return <section className="contact-coverage" aria-labelledby="coverage-heading">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="coverage-heading" className="text-sm font-heading font-semibold">Responsibility coverage</h2>
      <p className="text-xs text-ink-secondary">{missing?`${missing} of ${ROLES.length} key roles not designated`:'All key roles designated'} · Designation does not grant platform access</p></div>
    <ul className="contact-coverage-grid">{ROLES.map(role=>{const h=holders(role);return <li key={role} className={h.length?'':'is-missing'}>
      <span className="contact-coverage-role">{SHORT[role]||role}</span>
      <span className="contact-coverage-who">{h.length?h.map(c=>c.name).join(', '):'Not designated'}</span></li>;})}</ul>
  </section>;
}
