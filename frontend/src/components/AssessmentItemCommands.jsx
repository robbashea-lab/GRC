import {useEffect,useRef,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {useCreateIntent} from '@/lib/createIntent';
import {recordUuid} from '@/lib/recordUuid';
import {operatorProgram} from '@/lib/frameworkOperator';
import {Button} from './ui/button';
import {AddAssessmentItemDialog,AssessmentItemTaskDialog} from './AssessmentItemDialogs';
import ClientQuestionsDialog from './ClientQuestionsDialog';

const EMPTY_ITEM={item_type:'gap',text:'',request_id:''};
const EMPTY_TASK={title:'',description:'',priority:'medium',assignee_id:null,due_date:null};

// One native command owner for the assessment's Item forms. No new persistence mechanism.
export default function AssessmentItemCommands({record,ctx,disabled,workDisabled,standard=false,controls,onSaved,onDraftChange,portalContainer,children}){
  const [addOpen,setAddOpen]=useState(false),[add,setAdd]=useState(EMPTY_ITEM);
  const [taskItem,setTaskItem]=useState(null),[task,setTask]=useState(EMPTY_TASK);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [questions,setQuestions]=useState({open:false,loading:false,error:'',questions:[],unconfirmed_count:0});
  const owner=controls?.scope,identity=owner?.identity||'',base='/framework_assessments/'+record.framework_assessment_id;
  const commandScope=controls?.commandScope||identity;
  const [draftOwner,setDraftOwner]=useState(owner);
  const owned=draftOwner===owner;
  const current=useRef(null),mounted=useRef(true),questionGeneration=useRef(0);
  const available=!!owner&&!!identity&&ctx?.current?.client_id===record.client_id
    &&ctx.current.framework_assessment_id===record.framework_assessment_id;
  current.current={owner,record,ctx,disabled,workDisabled,busy,controls,available};
  const live=()=>mounted.current&&current.current?.owner===owner;
  const matchesAssessment=data=>data?.client_id===record.client_id&&data.framework_key===record.framework_key
    &&data.framework_assessment_id===record.framework_assessment_id;
  function itemPath(path,action){
    const prefix=base+'/items/';
    if(typeof path!=='string'||!path.startsWith(prefix)||action&&!path.endsWith('/'+action))return null;
    const encoded=path.slice(prefix.length,action?-action.length-1:undefined);
    try{const item=decodeURIComponent(encoded);return item&&!item.includes('/')?item:null;}catch{return null;}
  }
  async function postAssessment(path,body,options){
    if(path!==base+'/items'&&!itemPath(path,'remove'))throw new Error('The retained Item command belongs to another assessment.');
    const response=await api.post(path,body,options);
    if(!matchesAssessment(response.data))throw new Error('The saved Item response could not be verified. Retry its original command.');
    return response;
  }
  const createItem=useCreateIntent(postAssessment,commandScope+':assessment-item-add',!!commandScope);
  const removeItem=useCreateIntent(postAssessment,commandScope+':assessment-item-remove',!!commandScope);
  const resolveItem=useCreateIntent(async(path,body,options)=>{
    if(!itemPath(path,''))throw new Error('The retained Item resolution belongs to another assessment.');
    const response=await api.patch(path,body,options);
    if(!matchesAssessment(response.data))throw new Error('The Item resolution response could not be verified. Retry its original command.');
    return response;
  },commandScope+':assessment-item-resolve',!!commandScope);
  const createTask=useCreateIntent(async(path,body,options)=>{
    const item=itemPath(path,'task');
    if(!item)throw new Error('The retained Action command belongs to another assessment.');
    const response=await api.post(path,body,options),data=response.data;
    if(data?.client_id!==record.client_id||data.framework_assessment_id!==record.framework_assessment_id
      ||!data.task_id||data.assessment_item_id!==item)throw new Error('The Action response could not be verified. Retry its original command.');
    return response;
  },commandScope+':assessment-item-task',!!commandScope);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{questionGeneration.current++;setAddOpen(false);setTaskItem(null);setError('');setBusy(false);setDraftOwner(owner);setQuestions({open:false,loading:false,error:'',questions:[],unconfirmed_count:0});},[owner]);
  const anyUnconfirmed=()=>createItem.unconfirmed()||removeItem.unconfirmed()||createTask.unconfirmed()||resolveItem.unconfirmed();
  const commandUnconfirmed=anyUnconfirmed();
  const draft=owned&&(addOpen||!!taskItem||busy||commandUnconfirmed);
  useEffect(()=>{onDraftChange?.(draft);},[draft,onDraftChange]);
  useEffect(()=>()=>onDraftChange?.(false),[onDraftChange]);
  function canRun(command,formal=false){
    const latest=current.current;
    return live()&&!latest.busy&&(!formal||!latest.workDisabled||command.unconfirmed())
      &&(command.unconfirmed()?latest.controls?.writable===true:!anyUnconfirmed()&&latest.available&&!latest.disabled);
  }

  async function resolve(item,body){
    if(!canRun(resolveItem))return null;
    const path=base+'/items/'+encodeURIComponent(item.item_id),retained=resolveItem.pendingRequest();
    if(retained&&retained[0]!==path){setError('Retry the original unconfirmed Item resolution first.');return null;}
    setBusy(true);setError('');
    try{
      const response=retained?await resolveItem.retry():await resolveItem(path,body);
      if(!live())return null;
      onSaved?.(response.data);return response.data;
    }catch(failure){if(live())setError(formatError(failure));return null;}
    finally{if(live())setBusy(false);}
  }

  function openAdd(){
    if(!canRun(createItem))return;
    const pending=createItem.pendingRequest();
    setAdd(pending&&pending[0]===base+'/items'?pending[1]:{...EMPTY_ITEM,request_id:recordUuid()});
    setError('');setAddOpen(true);
  }
  async function saveAdd(){
    if(!canRun(createItem))return;
    setError('');
    const body={request_id:add.request_id,item_type:add.item_type,text:add.text.trim()};
    if(controls?.pending&&!createItem.unconfirmed()){
      if(controls.onOperation?.({operation:'add',...body})===true){setAddOpen(false);setAdd(EMPTY_ITEM);}
      else setError('This assessment draft changed. Reopen its current Items before adding one.');
      return;
    }
    setBusy(true);
    try{
      const response=createItem.unconfirmed()?await createItem.retry():await createItem(base+'/items',
        {...body,expected_revision:current.current.record.items_revision||0});
      if(!live())return;
      onSaved?.(response.data);setAddOpen(false);setAdd(EMPTY_ITEM);
    }catch(failure){if(live())setError(formatError(failure));}
    finally{if(live())setBusy(false);}
  }
  async function remove(item){
    if(!canRun(removeItem))return;
    const retained=removeItem.pendingRequest();
    if(controls?.pending&&!retained){
      if(controls.onOperation?.({operation:'remove',target:item.target})!==true)setError('This pending Item belongs to an ended assessment draft.');
      return;
    }
    if(!item.item_id||!retained&&!current.current.record.item_controls?.[item.item_id]?.can_remove)return;
    const path=base+'/items/'+encodeURIComponent(item.item_id)+'/remove';
    if(retained&&retained[0]!==path){setError('Retry the original unconfirmed Item removal first.');return;}
    setBusy(true);setError('');
    try{
      const response=retained?await removeItem.retry():await removeItem(path,{expected_revision:current.current.record.items_revision||0});
      if(live())onSaved?.(response.data);
    }catch(failure){if(live())setError(formatError(failure));}
    finally{if(live())setBusy(false);}
  }
  function openTask(item){
    const latest=current.current;
    if(!canRun(createTask,true)||!latest.available||latest.disabled||latest.workDisabled
      ||!latest.record.item_controls?.[item.item_id]?.can_create_action)return;
    const path=base+'/items/'+encodeURIComponent(item.item_id)+'/task',retained=createTask.pendingRequest();
    if(retained&&retained[0]!==path){setError('Retry the original unconfirmed Action save first.');return;}
    setTaskItem(item);setError('');
    setTask(retained?retained[1]:{...EMPTY_TASK,title:Array.from('Follow up: '+item.text).slice(0,500).join(''),description:item.text});
  }
  async function saveTask(){
    const latest=current.current;
    if(!canRun(createTask,true)||!taskItem)return;
    const path=base+'/items/'+encodeURIComponent(taskItem.item_id)+'/task';
    if(!createTask.unconfirmed()&&!latest.record.item_controls?.[taskItem.item_id]?.can_create_action)return;
    setBusy(true);setError('');
    try{
      const response=createTask.unconfirmed()?await createTask.retry():await createTask(path,{
        expected_revision:latest.record.items_revision||0,title:task.title,description:task.description,
        priority:task.priority,assignee_id:task.assignee_id||null,due_date:task.due_date||null});
      if(!live())return;
      setTaskItem(null);setTask(EMPTY_TASK);controls.onRefresh?.();
      // Native Task creation and its Item link are already confirmed; a refresh never creates another Task.
      try{
        const refreshed=await api.get(base);
        if(live()&&matchesAssessment(refreshed.data))onSaved?.(refreshed.data);
      }catch{if(live())setError('Action saved. Reload the assessment to refresh its linked work.');}
      return response.data;
    }catch(failure){if(live())setError(formatError(failure));}
    finally{if(live())setBusy(false);}
  }
  async function openWork(item){
    const kind=item.task_id?'tasks':item.finding_id?'findings':null,id=item.task_id||item.finding_id;
    if(!kind||!live()||!current.current.available||busy)return;
    setBusy(true);setError('');
    try{
      const {data}=await api.get('/'+kind+'/'+encodeURIComponent(id));
      if(!live())return;
      if(data.client_id!==record.client_id||data[kind==='tasks'?'task_id':'finding_id']!==id)throw new Error('The linked work response does not match this Item.');
      controls.onOpenWork?.({kind,record:data});
    }catch(failure){if(live())setError(formatError(failure));}
    finally{if(live())setBusy(false);}
  }
  async function openQuestions(){
    if(!live()||!current.current.available||busy)return;
    const request=++questionGeneration.current;
    setQuestions({open:true,loading:true,error:'',questions:[],unconfirmed_count:0});
    try{
      const {data}=await api.get('/frameworks/'+record.framework_key+'/client-questions',{params:{client_id:record.client_id}});
      if(!live()||request!==questionGeneration.current)return;
      if(data.client_id!==record.client_id||data.framework_key!==record.framework_key||!Array.isArray(data.questions)
        ||!Number.isInteger(data.unconfirmed_count)||data.unconfirmed_count<0
        ||data.questions.some(item=>typeof item.text!=='string'||typeof item.definition_id!=='string'))throw new Error('The complete current Client-question response could not be verified.');
      setQuestions(previous=>({...previous,...data,loading:false,error:''}));
    }catch(failure){if(live()&&request===questionGeneration.current)setQuestions(previous=>({...previous,loading:false,error:formatError(failure)}));}
  }
  function recover(){
    if(createItem.unconfirmed())return openAdd();
    const resolution=resolveItem.pendingRequest();
    if(resolution){const item=itemPath(resolution[0],'');if(item)return resolve({item_id:item},resolution[1]);setError('The retained Item resolution could not be verified.');return;}
    const pending=createTask.pendingRequest();
    if(pending&&canRun(createTask,true)){
      const item=itemPath(pending[0],'task');
      if(!item){setError('The retained Action command could not be verified.');return;}
      setTaskItem({item_id:item,text:pending[1].description||pending[1].title});setTask(pending[1]);return;
    }
    const removal=removeItem.pendingRequest();
    if(removal){const item=itemPath(removal[0],'remove');if(item)return remove({item_id:item});}
  }
  const model={busy,draft,unconfirmed:commandUnconfirmed,canResolve:canRun(resolveItem),openAdd,openTask,remove,resolve,openWork,pendingRemoval:removeItem.pendingRequest()?.[0]};
  return <div className={standard?"ita-wrap":undefined}>
    <div className={standard?"ita-top":"flex flex-wrap items-center justify-between gap-2"}><p>Gaps and open questions for this assessment. They do not change status on their own.</p><div className="flex gap-2">
      <Button className="gn-button" variant="outline" disabled={!available||busy} onClick={openQuestions}>Client questions</Button>
      <Button className="gn-button" variant="outline" disabled={!canRun(createItem)} onClick={openAdd}>Add item</Button>
    </div></div>
    {owned&&commandUnconfirmed&&!addOpen&&!taskItem&&<Button className="gn-button" variant="outline" disabled={busy||controls?.writable!==true} onClick={recover}>Retry unconfirmed save</Button>}
    {owned&&error&&!addOpen&&!taskItem&&<p role="alert">{error}</p>}
    {children(model)}
    <AddAssessmentItemDialog open={owned&&addOpen} onOpenChange={setAddOpen} draft={add} onChange={(key,value)=>setAdd(previous=>({...previous,[key]:value}))}
      onSubmit={saveAdd} busy={busy} disabled={!canRun(createItem)} error={error} unconfirmed={createItem.unconfirmed()} portalContainer={portalContainer}/>
    <AssessmentItemTaskDialog open={owned&&!!taskItem} onOpenChange={value=>{if(!value)setTaskItem(null);}} item={taskItem} draft={task}
      onChange={(key,value)=>setTask(previous=>({...previous,[key]:value}))} onSubmit={saveTask} clientId={record.client_id}
      users={ctx?.users} busy={busy} disabled={!canRun(createTask,true)} error={error} unconfirmed={createTask.unconfirmed()} portalContainer={portalContainer}/>
    <ClientQuestionsDialog {...questions} open={owned&&questions.open} unconfirmedCount={questions.unconfirmed_count} scopeKey={identity} onOpenChange={value=>{questionGeneration.current++;setQuestions(previous=>({...previous,open:value}));}}
      clientLabel={controls?.clientLabel} programLabel={operatorProgram(record.framework_key)} portalContainer={portalContainer}/>
  </div>;
}
