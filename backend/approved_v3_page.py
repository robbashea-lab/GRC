"""Native storage hooks for the approved document's existing controls."""
import hashlib

from approved_v3 import SOURCE_SHA256


NATIVE_ROUTING = (
    (b'var h = (location.hash||"").replace("#","");',
     b'var h = resolveSavedFrameworkRoute();'),
    (b'var currentHash = "#client-" + context.client.id + "-item-" + context.item.id;',
     b'var currentHash = savedFrameworkHash(context.client, "item-" + context.item.id);'),
    (b'window.addEventListener("hashchange", route);',
     b'window.addEventListener("hashchange", function(){route();});'),
    (b'location.hash = "portfolio";',
     b'history.replaceState(history.state, "", "#portfolio");'),
)
NATIVE_LOADING_STYLE = (
    b'<style id="native-workspace-loading">body{visibility:hidden}'
    b'#native-workspace-status{visibility:visible;position:fixed;inset:0;z-index:99999;'
    b'padding:48px;background:var(--bg,#eef5f2)}</style>'
)
NATIVE_LOADING_PANEL = (
    '<section class="panel" id="native-workspace-status"><h1>GoverNara</h1>'
    '<p role="status">Loading saved workspace…</p>'
    '<a href="/existing">Open Existing records</a></section>'
).encode()


PAGE_HOOK = r"""
/* Native integration preserves the approved rendering functions and layout. */
function savedFrameworkHash(client, sub, key){
  var framework=key||client.activeProg;
  return '#client-'+client.id+'-'+sub+(framework?'?framework='+encodeURIComponent(framework):'');
}
function resolveSavedFrameworkRoute(){
  var hash=location.hash.slice(1),separator=hash.indexOf('?');
  var target=separator<0?hash:hash.slice(0,separator);
  var client=CLIENTS.filter(function(row){return target.indexOf('client-'+row.id+'-')===0;})
    .sort(function(a,b){return b.id.length-a.id.length;})[0];
  if(!client||!active(client)||!DASH[client.id])return target;
  var sub=target.slice(('client-'+client.id+'-').length);
  if(sub!=='program'&&sub.indexOf('item-')!==0)return target;
  var params=new URLSearchParams(separator<0?'':hash.slice(separator+1));
  var scoped=params.has('framework'),requested=scoped?params.get('framework'):client.activeProg;
  var programs=progsLive(client).filter(function(program){return !program.ws&&program.reg;});
  var program=programs.find(function(row){return row.k===requested;});
  var item=sub==='program'?null:sub.slice(5);
  if(item&&!scoped){
    var eligible=programs.filter(function(row){return row.reg.items.some(function(candidate){return candidate.id===item;});});
    if(!eligible.includes(program)&&eligible.length===1)program=eligible[0];
  }
  if(!program){
    if(!scoped)return target;
    target='client-'+client.id;
    history.replaceState(history.state,'','#'+target);
    return target;
  }
  if(program.k!==client.activeProg)activateProg(client,program.k);
  if(item&&!program.reg.items.some(function(row){return row.id===item;}))sub='program';
  var canonical=savedFrameworkHash(client,sub);
  if(canonical!==location.hash)history.replaceState(history.state,'',canonical);
  return 'client-'+client.id+'-'+sub;
}
window.GoverNaraNativePage=(function(){
  var callbacks=null, importing=false, editing=false;
  var nativeViewRevision=0,sourceOpenDialog=openDlg;
  var staleFormMessage='Saved records changed. Reopen this item to review the latest values before saving. Your draft remains here until you close it.';
  openDlg=function(){
    var result=sourceOpenDialog.apply(this,arguments);
    document.getElementById('dlg').dataset.nativeViewRevision=String(nativeViewRevision);
    return result;
  };
  function staleDialog(){return document.getElementById('dlg').dataset.nativeViewRevision!==String(nativeViewRevision);}
  // Describe enforced native behavior, retaining the approved cards and icons.
  var nativeSecurityDescriptions={
    "Authentication":"Sign in with an approved email account and password. Invalid credentials return a generic error. Accounts must be active. Platform MFA and automatic account disabling for inactivity are not available.",
    "Password policy":"New passwords and resets require 15–128 characters. Common passwords and low-diversity values are blocked. Scheduled password expiration and password history checks are not available.",
    "Password storage":"Passwords are protected using adaptive, salted password hashing. New passwords use scrypt; existing bcrypt credentials remain supported.",
    "Session lifetime":"Seven-day sessions; no inactivity timeout. Logout revokes account sessions. Role, status and client assignments are checked per request. Reload uses HttpOnly cookies; bearer tokens are not persisted in localStorage.",
    "Abuse protection":"Authentication endpoints allow 30 requests per source IP and endpoint per minute. Excess requests are rejected. Failed-attempt account lockout is not available."
  };
  SECURITY.forEach(function(card){if(nativeSecurityDescriptions[card[0]])card[1]=nativeSecurityDescriptions[card[0]];});
  // Page the loaded summary only. The native Audit Log retains full history.
  var sourceAuditRender=renderAudit,sourceAuditDrawer=openAuditDrawer,nativeAuditPage=1,nativeAuditFilters=null;
  function auditActor(event){return USERS.find(function(user){return event.nativeUserId&&user.nativeUserId===event.nativeUserId;});}
  renderAudit=function(){
    var matches=auditFiltered(),filters=JSON.stringify(S.al),size=50;
    if(filters!==nativeAuditFilters){nativeAuditPage=1;nativeAuditFilters=filters;}
    var pages=Math.max(1,Math.ceil(matches.length/size));nativeAuditPage=Math.max(1,Math.min(nativeAuditPage,pages));
    var start=(nativeAuditPage-1)*size,shown=matches.slice(start,start+size),sourceFiltered=auditFiltered;
    // Reuse the approved filter controls, row markup and View identities.
    try{auditFiltered=function(){return shown;};sourceAuditRender();}finally{auditFiltered=sourceFiltered;}
    Array.from(document.querySelectorAll('#al-table .gt-row')).forEach(function(row,index){
      var event=shown[index];if(!event.native)return;
      var actor=auditActor(event),email=row.children[2].querySelector('.sub');
      if(email)email.textContent=actor&&actor.email||'';
    });
    var footer=document.querySelector('#al-table .gt-foot'),count=matches.length?'Showing '+(start+1)+'–'+Math.min(start+size,matches.length)+' of '+matches.length+' loaded events':'Showing 0 loaded events';
    footer.innerHTML='<span title="Recent native events and retained reference history. Open Existing records → Audit Log for the full native audit.">'+count+'</span><span class="pager">'+
      '<button class="ghost sm" type="button" data-action="native-audit-page" data-val="'+(nativeAuditPage-1)+'"'+(nativeAuditPage<=1?' disabled':'')+'>Previous</button>'+
      '<span>Page '+nativeAuditPage+' of '+pages+'</span><button class="ghost sm" type="button" data-action="native-audit-page" data-val="'+(nativeAuditPage+1)+'"'+(nativeAuditPage>=pages?' disabled':'')+'>Next</button></span>';
  };
  document.addEventListener('click',function(event){
    var button=event.target.closest&&event.target.closest('[data-action="native-audit-page"]');
    if(!button||!button.closest('#al-table')||S.route!=='audit-log')return;
    event.preventDefault();event.stopImmediatePropagation();
    var page=Number(button.dataset.val);if(button.disabled||!Number.isInteger(page))return;
    nativeAuditPage=page;renderAudit();
  },true);
  openAuditDrawer=function(index){
    var result=sourceAuditDrawer(index),event=AUDIT.find(function(row){return row.i===index;});
    if(!event||!event.native)return result;
    var drawer=$('drawer'),missing='Not included in this summary';
    function detail(label,value){var term=Array.from(drawer.querySelectorAll('dt')).find(function(row){return row.textContent===label;});
      if(term)term.nextElementSibling.textContent=value==null||value===''?missing:String(value);}
    detail('RAW CODE',event.action);detail('OUTCOME',event.nativeOutcome);detail('CLIENT ID',event.nativeClientId);detail('ENTITY ID',event.eid);
    detail('PERFORMED BY',event.user);
    var actor=auditActor(event),by=Array.from(drawer.querySelectorAll('dt')).find(function(row){return row.textContent==='PERFORMED BY';});
    var identifier=actor&&actor.email||event.nativeUserId;
    if(by&&identifier){var sub=document.createElement('div');sub.className='sub';sub.textContent=identifier;by.nextElementSibling.appendChild(sub);}
    var metadata={native:true,log_id:event.nativeLogId,client_id:event.nativeClientId,user_id:event.nativeUserId,
      action:event.action,entity_type:event.nativeEntityType,entity_id:event.eid};
    if(event.nativeOutcome!=null)metadata.outcome=event.nativeOutcome;
    drawer.querySelector('.code').textContent=JSON.stringify(metadata,null,2);
    drawer.querySelector('.m-head .sub').textContent='Native audit summary. Full event details are available in Existing records → Audit Log.';
    return result;
  };
  var sourceRenderAccount=renderAccount;
  renderAccount=function(){
    sourceRenderAccount();
    var passwordHelp=document.querySelector('#ac-conf + .help');
    if(passwordHelp)passwordHelp.textContent='Use Existing records → My Account to change your password. New passwords require 15–128 characters; common passwords are blocked. Changing your password signs out all active sessions, including this one.';
  };
  var originalToast=toast,installed=false,sourceRoute=route;
  route=function(){if(installed)return sourceRoute();};
  var nativeClientIds=new Map(),sourcePalette=renderPalette;
  renderPalette=function(){
    sourcePalette();
    var query=$('pal-q').value.trim().toLowerCase(),list=$('pal-list');
    if(!query)return;
    var results=[];
    CLIENTS.filter(active).forEach(function(client){
      var clientId=nativeClientIds.get(client.id);
      if(!clientId)return;
      (WORK[client.id]?.acts||[]).forEach(function(action){
        if(action.nativeId&&String(action.title||'').toLowerCase().includes(query))
          results.push({action:action,client:client,clientId:clientId});
      });
    });
    if(!results.length)return;
    list.querySelector('.pop-empty')?.remove();
    var start=list.querySelectorAll('[role="option"]').length,heading=document.createElement('div');
    heading.className='pop-head';heading.textContent='ACTIVE ACTION ITEMS';list.appendChild(heading);
    results.slice(0,20).forEach(function(result,index){
      var option=document.createElement('a'),params=new URLSearchParams({id:result.action.nativeId,client_id:result.clientId});
      option.className='pop-item';option.setAttribute('role','option');option.setAttribute('aria-selected',String(start+index===S.palIndex));
      option.dataset.action='pal-go';option.dataset.idx=String(start+index);option.href='/action-items?'+params;
      option.textContent=result.action.title+' · '+result.client.name;list.appendChild(option);
    });
  };
  var sourceClientSide=renderClientSide;
  renderClientSide=function(client){
    sourceClientSide.apply(this,arguments);
    var bare='#client-'+client.id+'-program';
    document.querySelectorAll('#side-client a').forEach(function(link){
      if(link.getAttribute('href')===bare)
        link.setAttribute('href',savedFrameworkHash(client,'program',link.dataset.val));
    });
  };
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
  // Native activities already merge declared framework drivers. Do not append
  // mockup template aliases to that canonical catalog or create source Reviews.
  var sourceSetupEntries=v34SetupEntries,sourceSetupItems=ivsItemsAll;
  function nativeSetupRows(c){return callbacks&&callbacks.setupActivities?callbacks.setupActivities(c.id):null;}
  function nativeSetupIdentity(a){var identity={};['client_id','activity_id','review_id','source_review_id','expected_updated_at','expected_client_updated_at'].forEach(function(k){identity[k]=a[k]===undefined?null:a[k];});return identity;}
  function nativeSetupCadence(a){return a.cadence==='custom'?(Number.isInteger(a.custom_days)&&a.custom_days>=1&&a.custom_days<=3660?'D:'+a.custom_days:undefined):{monthly:'M',quarterly:'Q',semiannual:'S',annual:''}[a.cadence];}
  var sourceConnectedNext=connectedNext;
  connectedNext=function(review){
    if(review.nativeId&&!review.doneFlag&&callbacks&&callbacks.reviewNextCycle){
      var value=callbacks.reviewNextCycle(S.clientId,review.nativeId);
      if(value!==undefined){var date=value===null?null:new Date(String(value).slice(0,10)+'T00:00:00');return connectedDate(date)?date:null;}
    }
    return sourceConnectedNext.apply(this,arguments);
  };
  v34SetupEntries=function(c){
    var rows=nativeSetupRows(c);if(rows===null)return sourceSetupEntries(c);
    var work=buildWork(c.id);
    return rows.map(function(a){
      var r=a.source_review_id?work.revs.find(function(row){return String(row.id)===a.source_review_id;}):null;
      if(a.review_id&&!r)throw Error('Reload the saved shared Review before setting up this activity.');
      var maps=v34SetupMaps(c,a.source_mappings),current=regFor(c),ids=[];
      maps.filter(function(m){return m.k===current.kind;}).forEach(function(m){ids=ids.concat(m.supportIds);});
      var topic=REV_TOPICS.find(function(t){return t.k===a.template_id;})||{k:a.template_id, purpose:''};
      topic=Object.assign({},topic,{areas:a.area_ids.slice()});
      var primary=a.area_id,area=Object.assign({},svcArea(c.id,primary),{resp:a.responsibility});
      return {key:a.activity_id,r:r,e:{t:{t:a.title,d:a.cadence,days:a.custom_days},T:topic,maps:maps,excluded:false},
        T:topic,title:a.title,prim:primary,main:a.area_ids[0],A:area,ids:p16SortIds(uniq(ids)),maps:maps,
        fws:uniq(maps.map(function(m){return m.fw;})),fwLab:uniq(maps.map(function(m){return m.fw;})).join(' · '),
        tk:ivsTicketNo(a.setup&&a.setup.recurring_ticket_number),st:a.state,
        rem:a.exclusion?Object.assign({why:a.exclusion.reason},a.exclusion):null,
        removalKeys:[a.activity_id],mappingNeedsValidation:false,nativeActivity:connectedClone(a)};
    });
  };
  ivsItemsAll=function(c){
    if(nativeSetupRows(c)===null)return sourceSetupItems(c);
    var items=[],notIv=[],spm=[];
    v34SetupEntries(c).forEach(function(x){if(x.nativeActivity.internal)spm.push(x.title);
      else if(!x.nativeActivity.provider_relevant)notIv.push({title:x.title,prim:x.prim,resp:x.A.resp});else items.push(x);});
    var order=SVC_AREAS.map(function(a){return a[0];});
    items.sort(function(a,b){return order.indexOf(a.prim)-order.indexOf(b.prim)||a.title.localeCompare(b.title)||a.key.localeCompare(b.key);});
    return {items:items,notIv:notIv,spm:spm,fwLab:progsLive(c).map(function(p){return p16ProgLabel(c,p);}).join(' · ')};
  };
  var sourceSetupDialog=ivsItemDlg,sourceSetupSave=ivsSave;
  ivsItemDlg=function(c,key){
    sourceSetupDialog(c,key);var x=ivsFind(c,key);if(!x||!x.nativeActivity)return;
    S.coordSetupDraft.nativeActivity=nativeSetupIdentity(x.nativeActivity);
    var a=x.nativeActivity,select=$('ivs-d-cad'),cad=nativeSetupCadence(a);
    if(select){
      Array.from(select.options).forEach(function(option){if(/^D:/.test(option.value)&&(!/^D:[1-9]\d*$/.test(option.value)||Number(option.value.slice(2))>3660))option.remove();});
      if(cad===undefined)select.selectedIndex=-1;
      else{if(!Array.from(select.options).some(function(o){return o.value===cad;}))select.add(new Option(coordFrequency(cad)||cad,cad));select.value=cad;}
      $('ivs-d-cadh').innerHTML=ivsCadHint(c,x,cad);
    }
    if(!x.r&&a.first_next_due)$('ivs-d-due').value=a.first_next_due;
  };
  ivsSave=function(c,key){
    var x=ivsFind(c,key);if(!x||!x.nativeActivity)return sourceSetupSave(c,key);
    var opened=S.coordSetupDraft,a=opened&&opened.nativeActivity;
    try{
      if(busy())throw Error('Wait for the current save to finish.');
      if(staleDialog()||!a||opened.client!==c.id||opened.key!==key||opened.profile!==JSON.stringify(svcProf(c.id))||
          JSON.stringify(a)!==JSON.stringify(nativeSetupIdentity(x.nativeActivity)))throw Error(staleFormMessage);
      CONNECTED.assertWritable(c.id);
      var responsibility=$('ivs-d-resp')?$('ivs-d-resp').value:x.nativeActivity.responsibility;
      if(!SVC_RESP_NAME[responsibility]||responsibility==='un')throw Error('Choose who runs this service area.');
      var plan={responsibility:responsibility,area_id:x.nativeActivity.area_id};
      if(covIV(responsibility)){
        plan.ticket=coordTicket($('ivs-d-no').value);plan.url=coordUrl($('ivs-d-url').value);
        plan.title=$('ivs-d-sum').value.trim().slice(0,255);plan.notes=$('ivs-d-notes').value.trim().slice(0,2000);
        if($('ivs-d-cad').selectedIndex<0)throw Error('Choose a recurring schedule.');
        plan.cadence=$('ivs-d-cad').value;var next=coordDate($('ivs-d-due').value,'next review');
        if(!plan.ticket||!next||CONNECTED.validateCadence(plan.cadence).unit==='once')throw Error('Record the recurring ticket, schedule and next due date.');
        plan.next=isoDate(next);
      }
      callbacks.command('saveSetupActivity',[c.id,a.activity_id,{opened:a,plan:plan}]);
      connectedPersist();closeDlg();S.coordSetupDraft=null;toast(covIV(responsibility)?'Recurring activity setup saved. Assessments and Reviews now use the same ticket and schedule.':'Responsibility saved. No iVenture ticket is needed for this area.');
    }catch(error){return ivsErr(error.message);}
  };
  var sourceSetupRemove=ivsRemoveDlg,sourceSetupRestore=ivsRestore;
  ivsRemoveDlg=function(c,key){
    var x=ivsFind(c,key);if(!x||!x.nativeActivity)return sourceSetupRemove(c,key);
    var opened=nativeSetupIdentity(x.nativeActivity),sourceForm=formDlg;
    formDlg=function(){
      var args=Array.from(arguments);
      args[4]=function(values){
        try{
          CONNECTED.assertWritable(c.id);
          var current=ivsFind(c,key);if(S.clientId!==c.id||!current||JSON.stringify(opened)!==JSON.stringify(nativeSetupIdentity(current.nativeActivity)))throw Error(staleFormMessage);
          if(!['spm','client','na'].includes(values.why))throw Error('Choose a reason for removing this activity from Setup.');
          callbacks.command('saveSetupExclusion',[c.id,key,{opened:opened,excluded:true,kind:values.why,note:String(values.note||'').trim().slice(0,2000)}]);
          connectedPersist();toast(x.title+' removed from iVenture Setup. Restore it under Removed.');return null;
        }catch(error){return error.message;}
      };
      return sourceForm.apply(this,args);
    };
    try{return sourceSetupRemove(c,key);}finally{formDlg=sourceForm;}
  };
  ivsRestore=function(c,key){
    var x=ivsFind(c,key);if(!x||!x.nativeActivity)return sourceSetupRestore(c,key);
    try{
      if(busy())return;CONNECTED.assertWritable(c.id);
      callbacks.command('saveSetupExclusion',[c.id,key,{opened:nativeSetupIdentity(x.nativeActivity),excluded:false}]);
      connectedPersist();toast(x.title+' is back on the setup list.');
    }catch(error){originalToast(error.message);}
  };
  var sourceCoordSelection=coordSelection,sourceCoordStage=coordStageAssessment,sourceCoordWrite=coordWriteActivity,sourceCoordSave=coordSaveAssessment;
  coordSelection=function(c,it,answers){
    var choices=coordCandidates(c,it),legacy=answers.reviewTarget&&choices.filter(function(x){return x.nativeActivity&&x.nativeActivity.legacy_keys.indexOf(answers.reviewTarget)>=0;});
    if(legacy&&legacy.length===1){
      var old=answers.reviewTarget,meta=answers._coord;
      answers.reviewTarget=legacy[0].key;
      if(meta&&meta.defaults&&meta.defaults.reviewTarget===JSON.stringify(old))meta.defaults.reviewTarget=JSON.stringify(answers.reviewTarget);
      if(meta&&meta.source&&meta.source.key===old)meta.source.key=answers.reviewTarget;
    }
    var found=sourceCoordSelection(c,it,answers);if(found)return found;
    if(answers.reviewTarget&&!(answers._coord&&answers._coord.committed&&answers._coord.source&&answers.reviewTarget===answers._coord.source.key))return null;
    var binding=(svcProf(c.id).assessmentReviews||{})[itemKey(c,it.id)];
    return choices.find(function(x){return x.nativeActivity&&(x.key===binding||
      (!answers.reviewTarget||answers._coord&&answers._coord.committed)&&x.nativeActivity.assessment_bindings.some(function(b){return b.k===regFor(c).kind&&b.id===it.id;}));})||null;
  };
  coordStageAssessment=function(c,it,answers){
    var plan=sourceCoordStage(c,it,answers),x=plan.key&&coordEntry(c,plan.key);
    if(x&&x.nativeActivity)plan.nativeActivity=nativeSetupIdentity(x.nativeActivity);return plan;
  };
  coordWriteActivity=function(c,x,plan,origin){
    if(!x.nativeActivity)return sourceCoordWrite(c,x,plan,origin);
    if(!plan.nativeActivity||JSON.stringify(plan.nativeActivity)!==JSON.stringify(nativeSetupIdentity(x.nativeActivity)))throw Error(staleFormMessage);
    // A reference satisfies the source coordination return contract. It is
    // never inserted into WORK; native persistence creates the actual Review.
    return {id:x.key,revision:x.nativeActivity.expected_updated_at};
  };
  coordSaveAssessment=function(c,it,draft){
    var tx=sourceCoordSave(c,it,draft),plan=draft.coordination;
    if(plan&&plan.nativeActivity){
      var key=itemKey(c,it.id),saved=GUIDE_SAVED[key],live=gState(c,it).ans;
      var fields=['ticket','url','title','hasTicket','hasUrl','hasTitle','ticketConfirmed','cadence','next','notes'];
      var activityPlan={};fields.forEach(function(k){if(plan[k]!==undefined)activityPlan[k]=plan[k];});
      saved.ans._coord.nativeActivity={opened:connectedClone(plan.nativeActivity),plan:activityPlan};
      live.reviewTarget=plan.key;saved.ans.reviewTarget=plan.key;
      live._coord.source={key:plan.key,reviewId:plan.reviewId,revision:plan.revision};
      saved.ans._coord.source=connectedClone(live._coord.source);
    }
    return tx;
  };
  var sourceCoordContext=coordContext;
  coordContext=function(c,it,answers){var context=sourceCoordContext(c,it,answers),x=context.entry;
    if(x&&x.nativeActivity&&!x.r){context.frequency=coordFrequency(nativeSetupCadence(x.nativeActivity))||'';context.next=x.nativeActivity.first_next_due||'';}
    return context;
  };
  var sourceGuideNarrative=guideNarrative;
  guideNarrative=function(c,it,answers,outcome){
    var current=connectedClone(answers),context=coordContext(c,it,current);
    if(!context.record?.nativeId)return sourceGuideNarrative(c,it,answers,outcome);
    var next=context.entry?.nativeActivity?.first_next_due||context.next;
    if(next){
      current.nextReview=next;
      var cadenceKey=regFor(c).kind==='cis'&&it.id==='1.1'?'freq':'reviewCadence';
      if(context.frequency)current[cadenceKey]=context.frequency;
    }
    var completion=CONNECTED.reviewHistory(c.id,context.record.id).find(function(row){
      return row.nativeOccurrenceId&&connectedDate(row.done);
    });
    var text=sourceGuideNarrative(c,it,current,outcome);
    if(completion)text=text.replace('No completed review is reported yet; the ticket records planned work only.',
      'The linked Review records completion on '+fD(completion.done)+'. The interview answer has not confirmed that result.');
    return text;
  };
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
  var sourceReportsChecks=approvedReportsLiveChecks;
  approvedReportsLiveChecks=function(client,descriptor,config,state){
    var checks=sourceReportsChecks(client,descriptor,config,state);
    if(!callbacks?.reportEvidence)return checks;
    var evidence=checks.find(check=>check.key==='ev-copies');
    if(!evidence)return checks;
    var records=new Map();
    for(var row of callbacks.reportEvidence(client.id,descriptor?.key)){
      if(!records.has(row.evidence_id))records.set(row.evidence_id,row);
    }
    evidence.items=Array.from(records.values(),row=>({id:row.evidence_id,label:row.filename,
      detail:row.file_available===false?'Reference without a stored copy':row.evidence_type||'Stored evidence',
      actions:['Attach copy','Reference only']}));
    evidence.status=evidence.items.length?'attention':'ready';
    evidence.summary=evidence.items.length+' evidence references are recorded for this framework. Select shareable copies or mark a file Reference only.';
    state.readinessItems.set(evidence.key,evidence.items);
    var separate=checks.find(check=>check.key==='sep');
    if(separate){
      var requests=reportSeparateRequests({...config,checks},state);
      separate.items=requests.map((request,index)=>({id:String(index+1),label:request.item,detail:request.why}));
      separate.summary=requests.length+' selected items are listed for separate delivery in Start here.';
    }
    return checks;
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
    nativeClientIds.set(sourceId,saved.client_id);
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
  var sourceOnboardingPlan=onbRevPlan;
  onbRevPlan=function(draft){
    var rows=sourceOnboardingPlan(draft);
    return callbacks&&callbacks.onboardingPlan?callbacks.onboardingPlan(rows,draft):rows;
  };
  var sourceContactAccess=connectedContactAccess;
  connectedContactAccess=function(cid){
    // Native contact access is resolved by the saved account link, never an email guess.
    if(CL[cid]&&CL[cid].nativeSourceIdentities)return;
    return sourceContactAccess(cid);
  };
  var sourceEvidenceRows=evRows,sourceEvidenceFolder=evInFolder;
  evRows=function(c){
    var rows=sourceEvidenceRows(c),folders=EVID[c.id].nativeFoldersByEvidenceId;
    if(folders)rows.forEach(function(row){row.nativeAreas=folders[row.id]||[];});
    return rows;
  };
  evInFolder=function(row,folder){
    return row.nativeAreas?row.nativeAreas.includes(folder==='Needs classification'?'Unassigned':folder):sourceEvidenceFolder(row,folder);
  };
  var sourceRenderEvidence=renderEvidence;
  renderEvidence=function(){
    var c=byId(S.clientId),library=EVID[c.id];
    if(library.nativeSummary)Object.assign(library,library.nativeSummaryByProgram[c.activeProg]||library.nativeSummary);
    sourceRenderEvidence();
    if(library.recentSince){
      var parts=library.recentSince.split('-').map(Number),since=new Date(parts[0],parts[1]-1,parts[2]);
      document.querySelectorAll('#v-client .kpi-cap,#v-client .kc').forEach(function(node){
        if(node.textContent==='Uploaded since Aug 19'){
          var caption='Uploaded since '+since.toLocaleDateString('en-US',{month:'short',day:'numeric'});
          node.textContent=caption;
          var card=node.closest('.kchip');if(card)card.title=card.title.replace('Uploaded since Aug 19',caption);
        }
      });
    }
  };
  var sourceEvidenceZipDialog=evZipDlg;
  evZipDlg=function(c,folder){
    if(!callbacks||!callbacks.downloadEvidenceArchive)return sourceEvidenceZipDialog(c,folder);
    openDlg('Download '+(folder==='__all'?'all evidence':'“'+folder+'”'),c.name,
      '<p style="margin:0 0 10px;line-height:1.6">Download the current stored files as a ZIP with their index. Reference-only records have no file contents and remain available in the Library.</p>',
      '<button class="ghost" type="button" data-action="dlg-close">Cancel</button><button class="cta" type="button" data-action="ev-zip-go" data-val="'+esc(folder)+'">Download ZIP</button>');
  };
  window.addEventListener('click',function(event){
    var button=event.target.closest&&event.target.closest('[data-action="ev-zip-go"]');
    if(!button||!callbacks||!callbacks.downloadEvidenceArchive)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.disabled||callbacks.busy&&callbacks.busy())return;button.disabled=true;
    var cid=S.clientId,folder=button.dataset.val;
    Promise.resolve().then(function(){return callbacks.downloadEvidenceArchive(cid,folder);})
      .then(function(result){if(cid!==S.clientId)return;if(button.isConnected)originalCloseDialog();originalToast(result.message);})
      .catch(function(error){if(cid===S.clientId&&button.isConnected)originalToast(error.message||'The evidence archive could not be downloaded.');})
      .finally(function(){button.disabled=false;});
  },true);
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
      if(button.disabled||callbacks.busy&&callbacks.busy())return;
      var id=button.dataset.id,client=button.dataset.client;
      if(client!==S.clientId||!files.some(function(f){return f.id===id&&f.available;})){toast('Reopen this evidence record.');return;}
      button.disabled=true;
      Promise.resolve().then(function(){return callbacks.downloadEvidence(client,id);})
        .catch(function(error){if(client===S.clientId&&button.isConnected)toast(error.message||'The saved file could not be downloaded.');})
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
    // Direct dialogs do not use formDlg (for example client access and setup).
    // A refreshed save token must never authorize their still-stale inputs.
    var dialogWrites=['save-client','do-archive','save-user','save-account','save-role','save-access','u-enable','do-disable',
      'mwf-save','ivs-save','ivs-area-save','svc-tools-save'];
    if(el.closest('#dlg')&&dialogWrites.includes(el.dataset.action)&&staleDialog()){
      event.preventDefault();event.stopImmediatePropagation();originalToast(staleFormMessage);return;
    }
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
    // A trusted click can checkpoint microtasks between capture and the
    // source's delegated handler. Wait until the complete click has run.
    window.setTimeout(function(){
      editing=false;
      if(previous!==JSON.stringify([ACCT,USERS])){
        callbacks.command('adminAction',[action,identity||'']);
        callbacks.persist(connectedClone(connectedState()),null);
      }else if(pendingMessage){originalToast(pendingMessage);pendingMessage='';}
    },0);
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
    var args=Array.prototype.slice.call(arguments),save=args[4],openedRevision=nativeViewRevision;
    if(args[0]==='Complete work'&&S.drCur?.kind==='act'){
      var action=(WORK[S.clientId]?.acts||[]).find(function(row){return row.id===S.drCur.id;});
      if(action?.findingId)args[3]='Submit for validation';
    }
    if(typeof save==="function")args[4]=function(values){
      if(openedRevision!==nativeViewRevision)return staleFormMessage;
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
    audit:function(entries,activity){
      AUDIT=connectedClone(entries);ACTLOG=scopedActivity(connectedClone(activity));
      if(S.route==='audit-log')renderAudit();
    },
    apply:function(state,reconcile){
      importing=true;
      try {
        nativeViewRevision++;
        var x=connectedClone(state);
        if(reconcile)x=reconcile(connectedState(),x);
        CLIENTS=x.clients;WORK=x.work;PGM=x.programs;CL=x.records;REG=x.reg;DASH=x.dash;
        PROFILE=x.profile;OWN=x.own;EVID=x.evidence;USERS=x.users;AUDIT=x.audit;
        ITEM_CUR=x.itemCur;ITEM_HIST=x.itemHist;ITEM_EXTRA=x.itemExtra;ITA=x.ita;ITA_ID=x.itaId||0;
        GUIDE_SAVED=x.guideSaved||{};ACTLOG=scopedActivity(x.activity||{});ACCT=x.account||ACCT;
        if(nativeActor)ACCT.role=roleName(nativeActor.role);
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
        if(installed){
          var previousRoute=location.hash.split('?')[0];
          if('#'+resolveSavedFrameworkRoute()===previousRoute)renderRoute();else route();
        }else{installed=true;route();}
        reopenDrawer();
        var boot=document.getElementById('native-workspace-loading');if(boot)boot.remove();
        document.getElementById('native-workspace-status')?.remove();
      }finally{importing=false;}
    },
    actor:function(actor,clients){
      var roles={super_admin:"owner",platform_admin:"spadmin",client_grc_manager:"cmgr",
        client_contributor:"ccontrib",client_readonly:"cread"};
      var previousActor=nativeActor&&nativeActor.id;
      var savedIndex=USERS.findIndex(person=>person.nativeUserId===actor.user_id||person.id===actor.user_id);
      var savedAccount=savedIndex<0?null:USERS[savedIndex];
      nativeActor={name:actor.name||savedAccount?.name||actor.email,email:actor.email||savedAccount?.email,role:roles[actor.role],
        clients:clients,status:"Active",self:true,id:actor.user_id};
      nativeActor.nativeUserId=actor.user_id;nativeActor.nativeUpdatedAt=savedAccount?.nativeUpdatedAt??actor.updated_at??null;
      // Visible account actions retain their array indexes after identity refresh.
      if(savedIndex<0)USERS.push(nativeActor);else USERS[savedIndex]=Object.assign(savedAccount,nativeActor);
      CONNECTED_ACTOR=nativeActor.name;ME=nativeActor.name;
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
      document.getElementById('native-workspace-status')?.remove();
      var panel=document.createElement('div');panel.className='panel';panel.dataset.nativeWorkspaceError='';
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
    for original, native in NATIVE_ROUTING:
        if normalized.count(original) != 1:
            raise ValueError('The approved document routing point changed')
        normalized = normalized.replace(original, native, 1)
    marker = b'p16Initialize();\nif (!location.hash)'
    if normalized.count(marker) != 1:
        raise ValueError('The approved document initialization point changed')
    result = normalized.replace(marker, b'p16Initialize();\n' + PAGE_HOOK.encode() + b'\nif (!location.hash)', 1)
    position = result.rfind(b'</body>')
    scripts = b'<script src="/staging-workspace.js"></script><script src="/approved-v3-native.js"></script>'
    result = result[:position] + NATIVE_LOADING_PANEL + scripts + result[position:]
    return result.replace(b'</head>', NATIVE_LOADING_STYLE+b'</head>', 1)
