import {Clock,Minus,ShieldAlert,ShieldCheck} from 'lucide-react';
import {freshness} from '@/lib/cisVerification';
import {ISO_PROGRAM_STATUS_LABELS} from '@/lib/isoProgramPresentation';
import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {ProgramVisualRow} from './ProgramVisualPrimitives';
import {resultVerification} from './CisResultTable';

const VERIFICATION={done:[ShieldCheck,'v-verified'],partial:[Clock,'v-needs_validation'],gap:[ShieldAlert,'v-gap_identified'],missing:[Minus,'v-not_verified']};
const APPLICABILITY={included:['Necessary','impl'],excluded:['Not Necessary','part']};

export default function IsoProgramRow({row,onOpen,onManage,soa=false,today=new Date()}){
  const verification=resultVerification(row,today),fresh=freshness(row,today);
  const [Icon,tone]=VERIFICATION[verification.state]||VERIFICATION.missing;
  const [decision,decisionTone]=Object.hasOwn(APPLICABILITY,row.soa_applicability)?APPLICABILITY[row.soa_applicability]:['Decision needed','none'];
  const count=row.work?.evidence_count,evidence=Number.isInteger(count)&&count>=0?(count?`${count} Evidence`:null):'Evidence unavailable';
  const missingJustification=soa&&['included','excluded'].includes(row.soa_applicability)
    &&!(typeof row.soa_justification==='string'&&row.soa_justification.trim());
  const details=[evidence,soa?`Implementation: ${Object.hasOwn(ISO_PROGRAM_STATUS_LABELS,row.status)?ISO_PROGRAM_STATUS_LABELS[row.status]:'Status unavailable'}`:null].filter(Boolean);
  return <ProgramVisualRow row={row} onOpen={onOpen} statusLabels={ISO_PROGRAM_STATUS_LABELS} ariaLabel={`Open ISO record ${row.definition_id} ${row.title}`}
    secondaryInfo={details.length||missingJustification?<>{details.join(' · ')}
      {missingJustification&&<span className="text-semantic-critical">{details.length?' · ':''}Justification needed</span>}</>:undefined}
    compactManagement
    management={onManage?<FrameworkRecordButton record={row} onManage={onManage}/>:undefined}
    statusContent={soa?<span className="st"><i className={`s-${decisionTone}`}/>{decision}</span>:undefined}
    verificationContent={<span className={`ver ${tone}`} aria-label={`Derived verification: ${verification.label}`} title="Derived from the native assessment and evidence; separate from the saved implementation conclusion.">
      <Icon size={14} aria-hidden="true"/><span>{verification.label}<small>{fresh.label}</small></span></span>}/>;
}
