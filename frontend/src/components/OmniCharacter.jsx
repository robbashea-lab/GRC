import naraOwl from '@/assets/nara-owl.webp';
import naraAvatar from '@/assets/nara-avatar.webp';
import './OmniCharacter.css';

// trackPointer remains accepted; robot-eye tracking leaves with the robot layers.
export default function OmniCharacter(props) {
  const {state='idle',approved=false}=props;
  const width=approved?284:80,height=approved?260:80;
  return <svg className={'omni-character omni-nara '+(approved?'omni-approved ':'')+'omni-'+state}
    viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    <image className="omni-nara-full" href={naraOwl} width={width} height={height} preserveAspectRatio="xMidYMid meet" pointerEvents="none"/>
    <image className="omni-nara-avatar" href={naraAvatar} width={width} height={height} preserveAspectRatio="xMidYMid meet" pointerEvents="none"/>
    {state==='verification'&&(approved?
      <text x="238" y="45" fill="#76baff" fontSize="30" fontWeight="700">?</text>:
      <text x="61" y="24" fill="#142b40" fontSize="18" fontWeight="700">?</text>)}
    {!approved&&['complete','applied'].includes(state)&&<path d="M58 59l4 4 8-10" fill="none" stroke="#117d67" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>;
}
