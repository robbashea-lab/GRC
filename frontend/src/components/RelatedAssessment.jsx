import {Sheet,SheetContent,SheetHeader,SheetTitle} from './ui/sheet';
import {Button} from './ui/button';

// Read-only view of the existing authorized assessment, never a copied entity.
export default function RelatedAssessment({open,onOpenChange,record}) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="sm:max-w-xl overflow-y-auto"><SheetHeader><SheetTitle>{record.title||record.name||'Assessment'}</SheetTitle></SheetHeader>
    <dl className="space-y-4 text-sm mt-6">{['assessment_id','type','status','created_at','completed_at','summary','outcome'].filter(k=>record[k]!=null).map(k=><div key={k}><dt className="text-ink-secondary capitalize">{k.replaceAll('_',' ')}</dt><dd className="whitespace-pre-wrap break-words">{typeof record[k]==='object'?JSON.stringify(record[k],null,2):String(record[k])}</dd></div>)}</dl>
    <Button variant="outline" className="mt-6" onClick={()=>onOpenChange(false)}>Close assessment</Button>
  </SheetContent></Sheet>;
}
