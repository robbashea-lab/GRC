import {Clock,Minus,ShieldAlert,ShieldCheck} from 'lucide-react';
import {freshness} from '@/lib/cisVerification';
import {operatorStatuses} from '@/lib/frameworkOperator';
import {FrameworkRecordButton} from './FrameworkRecordAccess';
import {ProgramVisualRow} from './ProgramVisualPrimitives';
import {resultVerification} from './CisResultTable';

const LABELS=operatorStatuses('iso-27001');
const VERIFICATION={done:[ShieldCheck,'v-verified'],partial:[Clock,'v-needs_validation'],gap:[ShieldAlert,'v-gap_identified'],missing:[Minus,'v-not_verified']};
const APPLICABILITY={included:['Necessary','impl'],excluded:['Not Necessary','part']};

export default function IsoProgramRow({row,onOpen,onManage,soa=false,today=new Date()}){
  const verification=resultVerification(row,today),fresh=freshness(row,today);
  const [Icon,tone]=VERIFICATION[verification.state]||VERIFICATION.missing;
  const [decision,decisionTone]=Object.hasOwn(APPLICABILITY,row.soa_applicability)?APPLICABILITY[row.soa_applicability]:['Decision needed','none'];
  const count=row.work?.evidence_count,evidence=Number.isInteger(count)&&count>=0?`${count} Evidence`:'Evidence unavailable';
  const missingJustification=soa&&['included','excluded'].includes(row.soa_applicability)
    &&!(typeof row.soa_justification==='string'&&row.soa_justification.trim());
  return <ProgramVisualRow row={row} onOpen={onOpen} statusLabels={LABELS} ariaLabel={`Open ISO record ${row.definition_id} ${row.title}`}
    secondaryInfo={<>{evidence}{soa&&<> · Saved implementation: {Object.hasOwn(LABELS,row.status)?LABELS[row.status]:'Status unavailable'}</>}
      {missingJustification&&<span className="text-semantic-critical"> · Justification needed</span>}</>}
    management={onManage?<FrameworkRecordButton record={row} onManage={onManage}/>:undefined}
    statusContent={soa?<span className="st"><i className={`s-${decisionTone}`}/>{decision}</span>:undefined}
    verificationContent={<span className={`ver ${tone}`} aria-label={`Derived verification: ${verification.label}`} title="Derived from the native assessment and evidence; separate from the saved implementation conclusion.">
      <Icon size={14} aria-hidden="true"/><span>{verification.label}<small>{fresh.label}</small></span></span>}/>;
}
