import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

// The server supplies only saved, open Client-responsible Items in the complete current program.
export default function ClientQuestionsDialog({open,onOpenChange,scopeKey,clientLabel,programLabel,
  questions=[],unconfirmedCount=0,loading=false,error='',portalContainer}){
  const [feedback,setFeedback]=useState(''),[copying,setCopying]=useState(false);
  const text=questions.map((item,index)=>`${index+1}. ${item.text} (${item.definition_id})`).join('\n');
  const identity=JSON.stringify([scopeKey,open,text,unconfirmedCount,loading,error]),current=useRef({identity});
  if(current.current?.identity!==identity)current.current={identity};
  const scope=current.current;
  useEffect(()=>{
    current.current=scope;setFeedback('');setCopying(false);
    return()=>{if(current.current===scope)current.current=null;};
  },[scope]);
  const available=!loading&&!error&&questions.length>0;
  async function copy(){
    if(!available||copying)return;
    setCopying(true);setFeedback('');
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if(current.current===scope)setFeedback('Copied.');
    }catch{
      if(current.current===scope)setFeedback('Select the questions and copy them manually.');
    }finally{if(current.current===scope)setCopying(false);}
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="brawndo-assessment-pilot gn-dialog-box" portalContainer={portalContainer}
      overlayClassName="brawndo-assessment-pilot gn-dialog-layer">
      <DialogTitle>Questions for {clientLabel||'this client'}</DialogTitle>
      <DialogDescription>{loading||error?'Saved Client questions for the current program.':`${questions.length} open Client ${questions.length===1?'item':'items'} across ${programLabel||'the current program'}.`}</DialogDescription>
      {loading?<p role="status">Loading client questions…</p>:error?<p role="alert">{error}</p>:<>
        {available?<><p>Open Items to address marked Client, across this program. Copy them into an email or a ticket.</p><Textarea className="gn-field" aria-label="Client questions" rows={12} readOnly value={text}/></>:<p>No open Client Items are recorded for this program.</p>}
        {unconfirmedCount>0&&<p>{unconfirmedCount} open {unconfirmedCount===1?'Item has':'Items have'} unconfirmed responsibility.</p>}
      </>}
      {feedback&&<p role="status">{feedback}</p>}
      <div className="gn-dialog-actions">{available&&<Button className="gn-button" variant="outline" disabled={copying} onClick={copy}>{copying?'Copying…':'Copy'}</Button>}<Button className="gn-button gn-primary" onClick={()=>onOpenChange(false)}>Done</Button></div>
    </DialogContent>
  </Dialog>;
}
