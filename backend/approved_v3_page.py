"""Native storage hooks for the approved document's existing controls."""
import hashlib

from approved_v3 import SOURCE_SHA256


PAGE_HOOK = r"""
/* Native integration preserves the approved rendering functions and layout. */
window.GoverNaraNativePage=(function(){
  var callbacks=null, importing=false, editing=false;
  var originalToast=toast,installed=false,sourceRoute=route;
  route=function(){if(installed)return sourceRoute();};
  function refreshClock(){var now=new Date();NOW=now;TODAY=new Date(now.getFullYear(),now.getMonth(),now.getDate());}
  function currentCaption(html){return html.replace(/As of (?:Nov 17|Sep 24|Nov 7), 2026/g,'As of '+TODAY.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}));}
  refreshClock();
  var sourceHead=wsHead,sourceSnapshot=snapshotCard,sourceReport=reportHTML,sourceWorkState=wkState;
  wsHead=function(){return currentCaption(sourceHead.apply(this,arguments));};
  snapshotCard=function(){return currentCaption(sourceSnapshot.apply(this,arguments));};
  reportHTML=function(){return currentCaption(sourceReport.apply(this,arguments));};
  wkState=function(){
    refreshClock();var state=sourceWorkState();
    if(!state.nativeClock){state.calY=TODAY.getFullYear();state.calM=TODAY.getMonth();
      state.tq={y:TODAY.getFullYear(),q:Math.floor(TODAY.getMonth()/3)+1};state.nativeClock=true;}
    return state;
  };
  window.addEventListener('click',function(event){
    refreshClock();var element=event.target.closest&&event.target.closest('[data-action]');
    if(!installed||!element||element.dataset.val!=='0')return;
    var action=element.dataset.action;if(action!=='cal-nav'&&action!=='tq')return;
    event.preventDefault();event.stopImmediatePropagation();var state=wkState();
    if(action==='cal-nav'){state.calY=TODAY.getFullYear();state.calM=TODAY.getMonth();
      state.calDay=state.calView==='month'?null:TODAY.getTime();renderCalendar();}
    else{state.tq={y:TODAY.getFullYear(),q:Math.floor(TODAY.getMonth()/3)+1};rerenderWork();}
  },true);
  window.addEventListener('click',function(event){
    var element=event.target.closest&&event.target.closest('[data-action]');
    if(!element||!['connected-storage','demo-storage','demo-reset','connected-reset','connected-reset-confirm','demo-clear-ev'].includes(element.dataset.action))return;
    event.preventDefault();event.stopImmediatePropagation();
    originalToast('This signed-in workspace uses saved platform records. Existing records remain available in the account menu.');
  },true);
  var originalCloseDialog=closeDlg, originalCloseDrawer=closeDrawer;
  var closeDialogPending=false, closeDrawerPending=false, pendingMessage="";
  var nativeActor=null;
  var sourceMakeProgram=makeProg;
  makeProg=function(){
    var program=sourceMakeProgram.apply(this,arguments);
    if(program.k==='hipaa'&&callbacks&&callbacks.hipaaSupplement)
      callbacks.hipaaSupplement.forEach(function(row){if(!program.reg.items.some(function(item){return item.id===row.id;}))program.reg.items.push(connectedClone(row));});
    return program;
  };
  // Drawer identifiers such as RISK-001 repeat across clients. Keep every
  // activity read/write tied to the current client without changing the UI.
  function scopedActivity(records){
    function key(value){return typeof value==='string'&&/^(rev|act|risk|ven|pol|ai)\|/.test(value)?S.clientId+'|'+value:value;}
    return new Proxy(records,{get:function(target,name){return target[key(name)];},
      set:function(target,name,value){target[key(name)]=value;return true;},
      deleteProperty:function(target,name){return delete target[key(name)];}});
  }
  ACTLOG=scopedActivity(ACTLOG);
  var sourceCmmcWorkspace=cmmcWorkspace;
  var reportZones=new Map(),sourceReportsClient=approvedReportsClient;
  approvedReportsClient=function(client,descriptor){
    var result=sourceReportsClient(client,descriptor),zone=reportZones.get(client.id);
    if(!zone)return result;
    var parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    var part=type=>parts.find(p=>p.type===type).value;
    var cutoff=[part('year'),part('month'),part('day')].join('-'),end=cutoff<isoDate(TODAY)?cutoff:isoDate(TODAY);
    var year=fromIso(end);year.setFullYear(year.getFullYear()-1);
    APPROVED_REPORTS_DATA.asOf=auditShowDate(cutoff);
    return {...result,periodStart:isoDate(year),periodEnd:end,periodText:auditPeriod({start:isoDate(year),end:end})};
  };
  // Use the controls and selected scope from the approved Reports page. The
  // signed-in download adapter resolves their contents against saved records.
  approvedReportsOpenDetails=function(client){
    var context=approvedReportsContext(client);
    return approvedReportsDownload('details',context.client,context.state);
  };
  approvedReportsDownload=async function(kind,config,state,index){
    if(!callbacks?.downloadReport){originalToast('Wait for the saved workspace to load.');return null;}
    var cid=config.workspaceClientId,program=config.workspaceKey;
    var ui=approvedReportsUI.get(cid),tab=ui?.tab,selected=ui?.active;
    function choices(){return JSON.stringify([state.periodStart,state.periodEnd,state.opts,state.auditor,state.exec,state.dec,state.checkDec]);}
    var choiceStamp=choices(),attached=state.attached.map(a=>a.file);
    function stillSelected(){return S.route==='client'&&S.sub==='reports'&&S.clientId===cid&&ui?.tab===tab&&ui?.active===selected&&
      ui?.states.get(selected)===state&&choices()===choiceStamp&&state.attached.length===attached.length&&state.attached.every((a,i)=>a.file===attached[i]);}
    var decisions=[];
    for(var check of config.checks||[]){
      var entries=[{key:check.key,label:check.title,decision:state.checkDec[check.key]}];
      for(var item of check.items||[])entries.push({key:check.key+'|'+item.id,label:item.label,decision:state.dec[check.key+'|'+item.id]});
      for(var entry of entries)if(entry.decision)decisions.push({group:check.key,key:entry.key,label:entry.label,status:entry.decision.status,text:entry.decision.text||''});
    }
    var request={kind:kind,sourceId:cid,program:program,path:kind==='single'?config.singles?.[index]?.path:null,
      start:state.periodStart,end:state.periodEnd,options:{...state.opts},auditor:state.auditor,decisions:decisions,
      attachments:state.attached.map(a=>({key:a.key||a.check,file:a.file})),
      executive:{...state.exec,sections:{...state.exec.sections}}};
    try{
      var result=await callbacks.downloadReport(request,stillSelected);
      if(!result?.workbench)return result;
      openDlg('Open saved Reports',result.workbench.reason,'',
        '<button class="ghost" type="button" data-action="dlg-close">Close</button><a class="cta" target="_blank" rel="noopener noreferrer" href="'+esc(result.workbench.url)+'">Open Reports</a>','Reports');
      return null;
    }
    catch(error){originalToast(error.message||'The saved report could not be downloaded.');return null;}
  };
  cmmcWorkspace=function(client,program){
    var context=sourceCmmcWorkspace(client,program);
    if(program.nativeCmmcReadiness){context.score=program.nativeCmmcReadiness;context.model.readiness=context.score;}
    return context;
  };
  cmmcSampleDocumentLinks=function(){return false;};
  var availableOwners=new Map();
  var sourceOwnerOptions=ownerOptions;
  ownerOptions=function(cid){
    if(!callbacks)return sourceOwnerOptions(cid);
    return Array.from(new Set((availableOwners.get(cid)||[]).concat(['Unassigned'])));
  };
  function blankClientRegisters(state,sourceId,lead){
    var saved=[OWN,WORK,PGM,CL,EVID,PROFILE,DASH],defaults;
    // The approved initializer normally writes to the page. Capture its exact
    // empty structures without replacing another client's data or open form.
    try{
      OWN={};WORK={};PGM={};CL={};EVID={};PROFILE={};DASH={};
      initializeClientRecords(sourceId,lead||null,null,null,null);
      defaults={own:OWN,work:WORK,programs:PGM,records:CL,evidence:EVID,profile:PROFILE,dash:DASH};
    }finally{[OWN,WORK,PGM,CL,EVID,PROFILE,DASH]=saved;}
    Object.keys(defaults).forEach(function(key){
      if(!state[key])state[key]={};
      if(!Object.hasOwn(state[key],sourceId))state[key][sourceId]=defaults[key][sourceId];
    });
  }
  function prepareClient(state,sourceId,records){
    var client=state.clients.find(c=>c.id===sourceId),saved=records.clients.find(row=>row.source_client_id===sourceId);
    if(!client||!saved)throw Error('The selected native client is unavailable.');
    reportZones.set(sourceId,saved.timezone||saved.time_zone||'UTC');
    if(!/^[A-Za-z0-9_-]+$/.test(sourceId)||Object.hasOwn(Object.prototype,sourceId))throw Error('Invalid client identity.');
    var roles=['super_admin','platform_admin','client_grc_manager','client_contributor'];
    var eligible=(records.users||[]).filter(u=>u.status==='active'&&!u.reference_only&&u.assignment_eligible!==false&&roles.includes(u.role));
    var names=new Map();eligible.forEach(u=>{names.set(u.name,(names.get(u.name)||0)+1);});
    availableOwners.set(sourceId,eligible.map(u=>names.get(u.name)>1?u.email:u.name||u.email).filter(Boolean));
    var defaults={contact:null,program:null,unit:'safeguards',impl:0,partial:0,notImpl:0,notAssessed:0,total:0,assessed:0,
      positions:null,est:null,overdue:[],next30:0,next:[],progs:[]};
    Object.keys(defaults).forEach(k=>{if(!Object.hasOwn(client,k))client[k]=defaults[k];});
    if(['own','work','programs','records','evidence','profile','dash'].some(k=>!Object.hasOwn(state[k]||{},sourceId)))
      blankClientRegisters(state,sourceId,client.lead);
    state.reg||={};
    var keys={'cis-ig1':'cis','iso-27001':'iso','soc-2':'soc','nist-csf-2':'nist',hipaa:'hipaa',cmmc:'cmmc'};
    var scope=records.requirements?.filter(r=>r.client_id===saved.client_id);
    if(!scope)return state;
    if(saved.onboarding_baseline?.completed)client.onboarded=true;
    client.progApp||={};
    scope.forEach(function(requirement){
      var fk=requirement.baseline_key,k=keys[fk];
      if(!k)return;
      var response=requirement.baseline_response,program=client.progs.find(p=>p.k===k);
      client.progApp[k]=({applies:'applies',retired:'retired',does_not_apply:'no',unsure:'unsure'})[response]||'unsure';
      if(response!=='applies'){if(program)program.retired=true;return;}
      var settings=saved.framework_settings?.[fk]||{};
      var ig=settings.implementation_group||1,level=settings.level||2,cats=(settings.categories||['security']).map(c=>c==='processing_integrity'?'processing':c);
      var scopeChanged=!program||program.retired||k==='cis'&&program.ig!==ig||k==='cmmc'&&program.level!==level||
        k==='soc'&&JSON.stringify([...(program.cats||[])].sort())!==JSON.stringify([...cats].sort());
      if(!scopeChanged)return;
      var fresh=makeProg(client,k,ig,cats,level);
      if(!fresh.reg)throw Error('The approved program register is unavailable.');
      if(program){
        var previous=new Map((program.reg?.items||[]).map(i=>[i.id,i]));
        fresh.reg.items=fresh.reg.items.map(i=>previous.has(i.id)?Object.assign({},i,previous.get(i.id)):i);
        Object.assign(program,fresh,{retired:false});
      }else client.progs.push(fresh);
    });
    var selected=client.progs.find(p=>!p.retired&&p.k===client.activeProg)||client.progs.find(p=>!p.retired&&p.reg);
    if(selected){
      client.activeProg=selected.k;client.program=selected.label;client.unit=selected.unit;client.labels=selected.labels;client.verb=selected.verb;
      state.reg[sourceId]=selected.reg;state.dash[sourceId].fwFull=selected.fwFull;state.dash[sourceId].domains=selected.domains;
    }else{
      client.activeProg=null;client.program=null;client.total=0;client.assessed=0;client.impl=0;client.partial=0;client.notImpl=0;client.notAssessed=0;
      delete state.reg[sourceId];state.dash[sourceId].domains=[];
    }
    return state;
  }
  var completionForm=null;
  var sourceCompletionPolicy=gateCompletionPolicy;
  gateCompletionPolicy=function(cid,r,details){
    var attachments=(details.evidence||[]).filter(function(f){return f.fileAvailable===true&&!!f.nativeId;});
    return sourceCompletionPolicy(cid,r,Object.assign({},details,{evidence:attachments}));
  };
  function prepareGuide(cid,id,guide){
    var r=(WORK[cid]&&WORK[cid].revs||[]).find(function(row){return row.id===id;});
    if(!r||guide.occurrenceId!==(r.nativeOccurrenceId||r.occurrenceId))
      throw Error('The review occurrence changed. Reopen the current review.');
    var key=cid+'|'+id+'|'+r.occurrenceId, previous=REVCHK[key]||{};
    REVCHK[key]=Object.assign({},previous,{steps:guide.steps,st:guide.st,note:guide.note,
      nativeContractToken:guide.token,nativeGuideRevision:guide.revision,nativeSpecialist:guide.specialist,
      nativeReadOnly:guide.readOnly,serviceContext:guide.serviceContext,supportingReference:guide.supportingReference});
  }
  var sourceEvidenceFields=evFields;
  evFields=function(){return [{id:'nativeEvidenceFile',label:'Select file',type:'file',req:true}].concat(sourceEvidenceFields());};
  document.addEventListener('change',function(event){
    if(event.target.id!=='f-nativeEvidenceFile')return;
    var name=document.getElementById('f-name'),file=event.target.files&&event.target.files[0];
    if(name){name.value=file?file.name:'';name.readOnly=true;}
  },true);
  window.addEventListener('click',function(event){
    var button=event.target.closest&&event.target.closest('[data-action="ev-file"],[data-action="native-evidence-download"]');
    if(!button||!callbacks||!callbacks.downloadEvidence)return;
    var library=EVID[S.clientId],files=library&&library.nativeFiles;
    if(!files)return;
    if(button.dataset.action==='native-evidence-download'){
      event.preventDefault();event.stopImmediatePropagation();
      var id=button.dataset.id,client=button.dataset.client;
      if(client!==S.clientId||!files.some(function(f){return f.id===id&&f.available;})){toast('Reopen this evidence record.');return;}
      button.disabled=true;
      Promise.resolve().then(function(){return callbacks.downloadEvidence(client,id);})
        .catch(function(error){toast(error.message||'The saved file could not be downloaded.');})
        .finally(function(){button.disabled=false;});
      return;
    }
    var filename=button.dataset.id,matched=files.filter(function(f){return f.name===filename||f.filename===filename;});
    if(!matched.length)return;
    event.preventDefault();event.stopImmediatePropagation();
    var body=matched.map(function(f){
      var details=[f.kind,f.title,'v'+f.version].filter(Boolean).join(' · ');
      return '<div class="frow"><b>'+esc(f.filename)+'</b><span class="sub">'+esc(details)+'</span>'+
        (f.available?'<button class="ghost" type="button" data-action="native-evidence-download" data-id="'+esc(f.id)+'" data-client="'+esc(S.clientId)+'">Download file</button>':
        '<span class="sub">Reference only. No file is attached.</span>')+'</div>';
    }).join('');
    openDlg(filename,'Evidence file',body,'<button class="cta" type="button" data-action="dlg-close">Close</button>');
  },true);
  var sourceCompleteDialog=revCompleteDlg;
  revCompleteDlg=function(c,r){
    var key=c.id+'|'+r.id+'|'+r.occurrenceId,guide=REVCHK[key];
    if(!guide||!guide.nativeContractToken){toast('Open the current review guide before completing this occurrence.');return;}
    if(guide.nativeReadOnly){toast('This review is read-only for this account.');return;}
    completionForm=guide;
    try{return sourceCompleteDialog(c,r);}finally{completionForm=null;}
  };
  var sourceFormFields=formDlg;
  var specialistValues=null;
  var actionParent=null,sourceNewAction=newAction;
  newAction=function(cid,values){
    if(!actionParent||actionParent.cid!==cid)return sourceNewAction.apply(this,arguments);
    var action=sourceNewAction(cid,Object.assign({},values,{source:'Manual'}));
    action.source=actionParent.kind;
    if(actionParent.kind==='Finding'){
      action.findingId=actionParent.id;
      var finding=WORK[cid].findings.find(function(f){return f.id===actionParent.id;});
      if(finding.actionIds.indexOf(action.id)<0)finding.actionIds.push(action.id);
    }else action.vendorId=actionParent.id;
    return action;
  };
  function actionParents(cid,kind){
    if(kind==='Vendor')return buildPgm(cid).vendors.filter(function(v){return v.wfId&&v.st!=='Offboarded';}).map(function(v){return [v.wfId,v.name];});
    if(kind==='Finding')return (WORK[cid].findings||[]).filter(function(f){return ['Open','In progress'].includes(f.st);}).map(function(f){return [f.id,f.title];});
    return [];
  }
  formDlg=function(title,desc,fields,saveLabel,save,options){
    if(title==='New action item'){
      var cid=S.clientId;
      var withParent=fields.concat([{id:'nativeSourceRecord',label:'Linked record',type:'select',options:[['','Choose a record']]}]);
      var result=sourceFormFields.call(this,title,desc,withParent,saveLabel,function(values){
        if(!['Vendor','Finding'].includes(values.source))return save(values);
        if(S.clientId!==cid||!actionParents(cid,values.source).some(function(p){return p[0]===values.nativeSourceRecord;}))
          return 'Choose an active linked record from this client.';
        actionParent={cid:cid,kind:values.source,id:values.nativeSourceRecord};
        try{return save(values);}finally{actionParent=null;}
      },options);
      var kind=document.getElementById('f-source'),select=document.getElementById('f-nativeSourceRecord');
      function choose(){
        var linked=kind.value==='Vendor'||kind.value==='Finding';
        select.closest('.frow').hidden=!linked;
        select.replaceChildren(new Option('Choose a record',''));
        actionParents(cid,kind.value).forEach(function(p){select.add(new Option(p[1],p[0]));});
      }
      if(kind&&select){choose();kind.addEventListener('change',choose);}
      return result;
    }
    if(title==='Add evidence'&&!fields.some(function(f){return f.id==='nativeEvidenceFile';}))
      fields=[{id:'nativeEvidenceFile',label:'Select file',type:'file',req:true}].concat(fields);
    if(!completionForm||!completionForm.nativeSpecialist||!fields.some(function(f){return f.id==='outcome';}))
      return sourceFormFields.call(this,title,desc,fields,saveLabel,save,options);
    var extra=[{id:'tested_scope',label:'Scope examined',type:'textarea',disclosure:'Scope examined'},
      {id:'tested_period',label:'Period examined',disclosure:'Period examined'},
      {id:'no_evidence_reason',label:'Supporting records or reason no separate artifact is appropriate',type:'textarea',disclosure:'Supporting records'},
      {id:'checklist_confirmed',label:'Reviewer checklist confirmed',type:'select',options:[['','Choose'],['Yes','Yes'],['No','No']],disclosure:'Reviewer confirmation'}];
    return sourceFormFields.call(this,title,desc,fields.concat(extra),saveLabel,function(values){
      specialistValues={};
      if(values.notes)specialistValues.conclusion=values.notes;
      extra.forEach(function(field){if(values[field.id])specialistValues[field.id]=field.id==='checklist_confirmed'?values[field.id]==='Yes':values[field.id];});
      try{return save(values);}finally{specialistValues=null;}
    },options);
  };
  function busy(){return editing||!!(callbacks&&callbacks.busy());}
  document.addEventListener('click',function(event){
    var el=event.target.closest?.('[data-action]');if(!callbacks||!el)return;
    var action=el.dataset.action,blocked={'ac-pwd':'Change the password in Existing records → My Account. This password form has not been submitted.',
      'u-pwd':'Open Existing records → Users & Access for authorized account recovery.',
      'demo-clear-ev':'Signed-in evidence is managed in the client Evidence Library.',
      'demo-storage':'Signed-in client records are saved to the platform.',
      'tc-replace':'Use Existing records → Tool Catalog to review usage across the full native portfolio before replacing this tool.'};
    if(blocked[action]){event.preventDefault();event.stopImmediatePropagation();originalToast(blocked[action]);return;}
    if(!['save-user','save-account','save-role','save-access','u-enable','do-disable','ac-save','ac-notif'].includes(action))return;
    if(busy())return;
    var person=USERS[Number(el.dataset.idx)],identity=action==='save-user'?(document.getElementById('nu-email')?.value||'').trim().toLowerCase():person?.nativeUserId;
    if(['save-account','save-role','save-access','u-enable','do-disable'].includes(action)&&!identity){
      event.preventDefault();event.stopImmediatePropagation();originalToast('This person is a reference record. Open a platform account in Users & Access.');return;
    }
    var previous=JSON.stringify([ACCT,USERS]);editing=true;
    queueMicrotask(function(){
      editing=false;
      if(previous!==JSON.stringify([ACCT,USERS])){
        callbacks.command('adminAction',[action,identity||'']);
        callbacks.persist(connectedClone(connectedState()),null);
      }else if(pendingMessage){originalToast(pendingMessage);pendingMessage='';}
    });
  },true);
  function bindCommands(){
    ["setReviewDescription","rescheduleReview","completeReview","saveRecordSchedule",
     "closeRisk","completeAction","validateFinding","savePolicyApproval","retireAI","offboardVendor"]
      .forEach(function(name){
        var command=CONNECTED[name];
        CONNECTED[name]=function(){
          var args=Array.prototype.slice.call(arguments);
          if(name==='completeReview'&&specialistValues)args[2]=Object.assign({},args[2],specialistValues);
          var result=command.apply(CONNECTED,args);
          if(!importing&&callbacks)callbacks.command(name,connectedClone(args));
          return result;
        };
      });
  }
  connectedPersist=function(){
    if(!callbacks)return false;
    return callbacks.persist(connectedClone(connectedState()),S.clientId);
  };
  window.GoverNaraPrototypePersist=connectedPersist;
  toast=function(message){
    if(busy()){pendingMessage=message;return;}
    return originalToast(message);
  };
  closeDlg=function(){
    if(busy()){closeDialogPending=true;return;}
    return originalCloseDialog();
  };
  closeDrawer=function(){
    if(busy()){closeDrawerPending=true;return;}
    return originalCloseDrawer();
  };
  var originalForm=formDlg;
  formDlg=function(){
    var args=Array.prototype.slice.call(arguments), save=args[4];
    if(typeof save==="function")args[4]=function(values){
      editing=true;
      try {
        var error=save(values);
        if(!error&&callbacks)callbacks.persist(connectedClone(connectedState()),S.clientId);
        return error;
      }finally{editing=false;}
    };
    return originalForm.apply(this,args);
  };
  return {
    clock:function(){refreshClock();return TODAY.getFullYear()+'-'+String(TODAY.getMonth()+1).padStart(2,'0')+'-'+String(TODAY.getDate()).padStart(2,'0');},
    prepareClient:prepareClient,
    setReviewGuide:prepareGuide,
    snapshot:function(){return connectedClone(connectedState());},
    context:function(){var c=byId(S.clientId);return {sourceId:S.clientId,program:c&&c.activeProg};},
    configure:function(options){callbacks=options;bindCommands();},
    apply:function(state,reconcile){
      importing=true;
      try {
        var x=connectedClone(state);
        if(reconcile)x=reconcile(connectedState(),x);
        CLIENTS=x.clients;WORK=x.work;PGM=x.programs;CL=x.records;REG=x.reg;DASH=x.dash;
        PROFILE=x.profile;OWN=x.own;EVID=x.evidence;USERS=x.users;AUDIT=x.audit;
        ITEM_CUR=x.itemCur;ITEM_HIST=x.itemHist;ITEM_EXTRA=x.itemExtra;ITA=x.ita;ITA_ID=x.itaId||0;
        GUIDE_SAVED=x.guideSaved||{};ACTLOG=scopedActivity(x.activity||{});ACCT=x.account||ACCT;
        WID=x.wid||WID;NEWID=x.newid||NEWID;CONNECTED_FILES=x.files||[];
        CONNECTED_TOUCHED=x.touched||{};TOOLCAT=x.toolCatalog||TOOLCAT;
        TOOL_BY={};TOOLCAT.forEach(function(t){TOOL_BY[t.id]=t;});
        SVCPROF=x.services||SVCPROF;REVCHK=x.checklists||{};REQ_OFFICIAL=x.official||REQ_OFFICIAL;
        REQ_META=x.officialMeta||REQ_META;ONB=x.onboarding||{};
        CLIENTS.forEach(function(c){
          var p=(c.progs||[]).find(function(p){return p.k===c.activeProg;});
          if(p&&p.reg){REG[c.id]=p.reg;DASH[c.id].domains=p.domains;}
        });
        MWF.migrateLegacyKeys();MWF.reviveDates();
        CONNECTED=createConnectedWorkflowModel({clients:CLIENTS,work:WORK,programs:PGM,
          clientRecords:CL,users:USERS,now:function(){return TODAY;},actor:function(){return nativeActor;},
          reviewCompletionPolicy:gateCompletionPolicy});
        bindCommands();
        CLIENTS.forEach(function(c){CONNECTED.normalizeClient(c.id);if(c.activeProg&&REG[c.id])syncCounts(c);});
        if(S.clientId&&!CLIENTS.some(function(c){return c.id===S.clientId;})){
          S.clientId=null;S.route='portfolio';location.hash='portfolio';
        }
        if(installed)renderRoute();else{installed=true;sourceRoute();}
        reopenDrawer();
        var boot=document.getElementById('native-workspace-loading');if(boot)boot.remove();
      }finally{importing=false;}
    },
    actor:function(actor,clients){
      var roles={super_admin:"owner",platform_admin:"spadmin",client_grc_manager:"cmgr",
        client_contributor:"ccontrib",client_readonly:"cread"};
      var previousActor=nativeActor&&nativeActor.id;
      var savedAccount=USERS.find(person=>person.nativeUserId===actor.user_id);
      nativeActor={name:savedAccount?.name||actor.name||actor.email,email:savedAccount?.email||actor.email,role:roles[actor.role],
        clients:clients,status:"Active",self:true,id:actor.user_id};
      nativeActor.nativeUserId=actor.user_id;nativeActor.nativeUpdatedAt=savedAccount?.nativeUpdatedAt??actor.updated_at??null;
      for(var i=USERS.length-1;i>=0;i--)if(USERS[i].self||USERS[i].email===actor.email)USERS.splice(i,1);
      USERS.push(nativeActor);CONNECTED_ACTOR=nativeActor.name;ME=nativeActor.name;
      connectedActor=function(){return nativeActor;};
      var role=roleName(nativeActor.role),menu=document.querySelector('[data-menu="user"]'),header=document.querySelector('#pop-user > div:first-child');
      ACCT=Object.assign({},ACCT,{name:nativeActor.name,email:nativeActor.email,role:role});
      if(menu){menu.textContent=initials(nativeActor.name);menu.setAttribute('aria-label','Account menu for '+nativeActor.name);}
      if(header&&header.children.length>=2){header.children[0].textContent=nativeActor.name;header.children[1].textContent=nativeActor.email+' · '+role;}
      if(previousActor!==nativeActor.id&&S.route==='account')renderAccount();
    },
    finish:function(success,message){
      if(success){
        if(closeDialogPending)originalCloseDialog();
        if(closeDrawerPending)originalCloseDrawer();
      }
      closeDialogPending=false;closeDrawerPending=false;
      originalToast(message||pendingMessage||(success?"Saved.":"The change could not be saved."));
      pendingMessage="";
    },
    noop:function(){
      if(closeDialogPending)originalCloseDialog();if(closeDrawerPending)originalCloseDrawer();
      closeDialogPending=false;closeDrawerPending=false;
      if(pendingMessage)originalToast(pendingMessage);pendingMessage='';
    },
    status:function(message){originalToast(message);},
    fail:function(message){
      installed=false;
      document.body.style.visibility='hidden';
      var panel=document.createElement('div');panel.className='panel';
      panel.style.cssText='visibility:visible;position:fixed;inset:0;z-index:99999;padding:48px;background:var(--bg,#eef5f2)';
      var title=document.createElement('h1');title.textContent='GoverNara';panel.appendChild(title);
      var text=document.createElement('p');text.textContent=message;panel.appendChild(text);
      var link=document.createElement('a');link.href='/existing';link.textContent='Open Existing records';panel.appendChild(link);
      var reload=document.createElement('a');reload.href='/login';reload.textContent='Return to sign in';reload.style.marginLeft='24px';panel.appendChild(reload);
      document.body.appendChild(panel);
    }
  };
})();
"""


def native_document(source):
    normalized = source.replace(b'\r\n', b'\n')
    if hashlib.sha256(normalized).hexdigest() != SOURCE_SHA256:
        raise ValueError('The native integration must use the approved source document')
    initialization = b'contentInitialize();\nconnectedInitialize();'
    if normalized.count(initialization) != 1:
        raise ValueError('The approved source initialization changed')
    # The public Demo still owns its own browser storage. A signed-in workspace
    # must never restore or write that store, even during initial rendering.
    normalized = normalized.replace(initialization,
        b'connectedRestore=function(){};connectedPersist=function(){return true;};window.GoverNaraPrototypePersist=connectedPersist;\n' + initialization, 1)
    marker = b'p16Initialize();\nif (!location.hash)'
    if normalized.count(marker) != 1:
        raise ValueError('The approved document initialization point changed')
    result = normalized.replace(marker, b'p16Initialize();\n' + PAGE_HOOK.encode() + b'\nif (!location.hash)', 1)
    position = result.rfind(b'</body>')
    scripts = b'<script src="/staging-workspace.js"></script><script src="/approved-v3-native.js"></script>'
    result = result[:position] + scripts + result[position:]
    return result.replace(b'</head>',b'<style id="native-workspace-loading">body{visibility:hidden}</style></head>',1)
