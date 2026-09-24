import {Link} from 'react-router-dom';
import './DashboardReference.css';
import '@/components/BrawndoCisWorkspace.css';
import {AlertOctagon,CalendarClock,FileWarning,ShieldAlert,Building2,ShieldCheck,ArrowRight} from 'lucide-react';

// "What requires attention" strip. Every tile opens its contributing records.
export default function DashboardAttention({posture,programs=[],onShow}){
  const t=posture.totals||{};
  const count=key=>t[key]??posture[key]?.length??0;
  const vendor=(posture.vendorHealth||[]).find(g=>g.key==='vendorReviewsPast'),assurance=(posture.vendorHealth||[]).find(g=>g.key==='assurance');
  const vendorKey=(vendor?.total??vendor?.items?.length)?'vendorReviewsPast':'assurance',vendorGroup=vendorKey==='assurance'?assurance:vendor;
  const cis=programs.find(p=>p.key==='cis-ig1')?.assessment;
  const tiles=[
    {key:'pastDue',label:'Past due',sub:'Reviews, findings and actions',n:count('pastDue'),tone:'critical',Icon:AlertOctagon},
    {key:'due30',label:'Due in 30 days',sub:'Upcoming obligations',n:count('due30'),tone:'duesoon',Icon:CalendarClock},
    {key:'materialFindings',label:'High / critical findings',sub:'Open, not yet validated',n:count('materialFindings'),tone:'critical',Icon:FileWarning},
    {key:'significantRisks',label:'Significant risks',sub:'High or critical exposure',n:count('significantRisks'),tone:'critical',Icon:ShieldAlert},
    {key:vendorKey,label:vendorKey==='assurance'?'Vendor assurance':'Vendor reviews past due',sub:vendorKey==='assurance'?'Expired, due or missing':'Third-party oversight',n:vendorGroup?.total??vendorGroup?.items?.length??0,tone:'duesoon',Icon:Building2,items:vendorGroup?.items},
  ];
  const cisGap=cis?(cis.status_counts.needs_attention||0)+(cis.status_counts.in_progress||0):null;
  return <section aria-labelledby="attention-heading" className="space-y-2">
    <h2 id="attention-heading" className="text-sm font-heading font-semibold text-ink-primary">Requires attention</h2>
    <div className="dash-attention">
      {tiles.map(({key,label,sub,n,tone,Icon,items})=><button key={key} type="button" onClick={()=>onShow(label,items||posture[key]||[],key)} className={`dash-tile ${n?`is-${tone}`:'is-clear'}`} aria-label={`${label}: ${n}. View records`}>
        <span className="dash-tile-top"><Icon className="h-4 w-4" aria-hidden="true"/><span className="dash-tile-label">{label}</span></span>
        <span className="dash-tile-value">{n}</span><span className="dash-tile-sub">{n?sub:'None open'}</span>
      </button>)}
      {cisGap!=null&&<Link to="/compliance/cis-ig1?view=gaps" className={`dash-tile ${cisGap?'is-duesoon':'is-clear'}`} aria-label={`CIS safeguards not fully implemented: ${cisGap}. Open CIS IG1`}>
        <span className="dash-tile-top"><ShieldCheck className="h-4 w-4" aria-hidden="true"/><span className="dash-tile-label">CIS safeguards with gaps</span></span>
        <span className="dash-tile-value">{cisGap}</span><span className="dash-tile-sub inline-flex items-center gap-1">Partial or not implemented<ArrowRight className="h-3 w-3" aria-hidden="true"/></span>
      </Link>}
    </div>
  </section>;
}
