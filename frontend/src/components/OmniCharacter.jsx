// Original inline Omnisciente observation-lens artwork; no remote assets.
export default function OmniCharacter({state='idle'}) {
  const thoughtful=['thinking','verification'].includes(state);
  return <svg className={'omni-character omni-'+state} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
    <circle cx="40" cy="40" r="31" fill="#e9f0f5" stroke="#b8cbd8" strokeWidth="1.5"/>
    <circle cx="40" cy="40" r="35" fill="none" stroke="#c8d8e3" strokeWidth="5" strokeDasharray="48 7" transform="rotate(-85 40 40)" className="omni-ring-base"/>
    <g fill="none" strokeWidth="5" strokeLinecap="butt" className="omni-segments">
      <path d="M16 15A35 35 0 0 1 35 5" stroke="#3589ef"/>
      <path d="M43 5A35 35 0 0 1 71 24" stroke="#23b9aa"/>
      <path className="omni-amber" d="M75 33A35 35 0 0 1 67 62" stroke="#d6a136"/>
      <path d="M60 69A35 35 0 0 1 45 75" stroke="#9774d8"/>
    </g>
    <circle cx="40" cy="40" r="26" fill="#142b40" stroke="#8db2c7" strokeWidth="2"/>
    <path d="M20 37A21 21 0 0 1 48 20" fill="none" stroke="#426378" strokeWidth="4" strokeLinecap="round"/>
    <g fill="#7bdbef" className="omni-eyes">
      <ellipse cx="32" cy={thoughtful?'38':'39'} rx="3.3" ry={thoughtful?'3':'5'}/>
      <ellipse cx="48" cy="39" rx="3.3" ry="5"/>
    </g>
    <path d={state==='gap'?'M32 51Q40 47 48 51':thoughtful?'M35 50Q40 52 45 49':'M31 49Q40 59 49 49'} fill="none" stroke="#7bdbef" strokeWidth="2.5" strokeLinecap="round"/>
    {state==='verification'&&<text x="61" y="24" fill="#142b40" fontSize="18" fontWeight="700">?</text>}
    {state==='complete'&&<path d="M58 59l4 4 8-10" fill="none" stroke="#117d67" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>;
}
