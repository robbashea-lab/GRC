import './RegisterSignalBar.css';

// Governance coverage: are the program's key responsibilities designated to a person?
// Contacts identify business people; a designation grants no platform access or approval authority.
// One compact strip: who holds each key role, with gaps called out. It never pushes the register down a screen.
const ROLES=['Executive Sponsor','Information Security Lead','IT Lead','Incident Response Lead','Business Continuity / Disaster Recovery Lead','Vendor / Third-Party Contact','HR Contact','Legal / Privacy Contact'];
const SHORT={'Executive Sponsor':'Exec sponsor','Information Security Lead':'Security lead','Incident Response Lead':'IR lead','Business Continuity / Disaster Recovery Lead':'BC / DR lead','Vendor / Third-Party Contact':'Third-party','HR Contact':'HR','Legal / Privacy Contact':'Legal / privacy'};
export default function ContactCoverage({rows}){
  const active=rows.filter(c=>c.status!=='inactive');
  const holders=role=>active.filter(c=>c.role===role||(c.grc_roles||[]).includes(role));
  const missing=ROLES.filter(r=>!holders(r).length).length;
  return <section className="contact-coverage" aria-labelledby="coverage-heading" data-testid="contact-coverage">
    <h2 id="coverage-heading" className="contact-coverage-title">Responsibility coverage · {missing?`${missing} of ${ROLES.length} key roles not designated`:'all key roles designated'}</h2>
    <ul className="contact-coverage-list">{ROLES.map(role=>{const h=holders(role);return <li key={role} className={h.length?'':'is-missing'}>
      <span className="contact-coverage-role" title={role}><span aria-hidden="true">{SHORT[role]||role}</span><span className="sr-only">{role}</span></span>
      <span className="contact-coverage-who">{h.length?h.map(c=>c.name).join(', '):'Not designated'}</span></li>;})}</ul>
    <span className="contact-coverage-note">Designation does not grant platform access</span>
  </section>;
}
