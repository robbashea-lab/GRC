import {Clock3} from 'lucide-react';

// Keep the native outer badge's display, spacing and line height in charge.
export default function DeadlineClock({children}) {
  return <span className="deadline-clock-label" style={{display:'inline-flex',alignItems:'center',gap:4,verticalAlign:'top',fontFamily:'inherit',fontSize:'inherit',fontWeight:'inherit',fontStyle:'inherit',lineHeight:'inherit',color:'inherit'}}>
    <Clock3 size={10} aria-hidden="true" focusable="false" style={{display:'block',width:10,height:10,flex:'none',pointerEvents:'none'}}/>{children}
  </span>;
}
