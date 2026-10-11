// Approved static public introductions, independent of client and interview state.
export const loginTopics = {
  governance: ['What is Governance?', 'Governance gives your program direction: clear policies, named owners, leadership decisions, and regular oversight. It helps everyone understand what is expected and who is accountable.'],
  risk: ['What is Risk?', 'Risk management looks at what could go wrong, how likely it is, and how much it could affect the business. Then you choose a response, assign an owner, and track whether that response is working.'],
  compliance: ['What is Compliance?', 'Compliance means understanding applicable obligations, putting the right practices in place, and keeping evidence. That can include contractual commitments, laws, and standards. It supports confidence—but does not mean every risk is gone.'],
  grc: ['Three parts. One stronger program.', 'Governance sets direction and ownership. Risk management helps you decide what could go wrong and what to do about it. Compliance checks requirements and the evidence behind them. Together, they turn security into an ongoing business practice.'],
  cis: ['CIS IG1, IG2 & IG3', 'CIS Implementation Groups help prioritize safeguards. IG1 is essential cyber hygiene: 56 safeguards. IG2 builds on it with 74 more, for 130 total. IG3 adds 23 more, covering all 153. Choose based on risk, complexity, and resources—not just a desire for a higher number.'],
  iso: ['What is ISO 27001?', 'ISO/IEC 27001 sets requirements for an information security management system, or ISMS. It connects risks, responsibilities, controls, reviews, and continual improvement. It helps make security a repeatable management practice. Certification requires an independent assessment.'],
  soc: ['What is SOC 2?', 'SOC 2 is an independent CPA examination of a service organization’s controls against relevant Trust Services Criteria. Its scope can address security, availability, processing integrity, confidentiality, and privacy. It helps customers evaluate how a provider protects the services and information they rely on.'],
};
export const loginMenu = [['grc', 'What is GRC?'], ['cis', 'CIS IG1, IG2 & IG3'], ['iso', 'What is ISO 27001?'], ['soc', 'What is SOC 2?']];
export const loginWelcomeMessage = 'Welcome to Omnisciente. I’m here to help make security and compliance easier to understand. Explore a quick introduction below, or head straight to your workspace.';
export function loginGreeting(date = new Date()) {
  const hour = date.getHours();
  return `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, I’m Omni.`;
}
