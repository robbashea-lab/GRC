"""Evidence organization and supporting links; bytes and source history stay put."""
import re
from datetime import date
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
import evidence_context as ctx
import review_occurrences

EvidenceType = Literal['Report','Export','Screenshot','Policy / Procedure','Attestation','Assessment','Test Result','Certification','Questionnaire','Meeting / Exercise Record','Approval','Log / System Record','Other']


class Metadata(BaseModel):
    model_config = ConfigDict(extra='forbid')
    display_name: Optional[str] = Field(None, max_length=300)
    evidence_type: EvidenceType = 'Other'
    evidence_date: Optional[date] = None
    effective_date: Optional[date] = None
    expiration_date: Optional[date] = None
    refresh_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=10000)


class MetadataEdit(Metadata):
    expected_updated_at: Optional[str] = Field(None, max_length=100)


class Link(BaseModel):
    model_config = ConfigDict(extra='forbid')
    linked_type: str = Field(min_length=1,max_length=40)
    linked_id: str = Field(min_length=1,max_length=160)
    occurrence_id: Optional[str] = Field(None,max_length=160)
    remove: bool = False
    expected_updated_at: Optional[str] = Field(None,max_length=100)


async def protected(db, doc):
    """Retention includes supporting relationships as well as original provenance."""
    eid,cid = doc['evidence_id'],doc['client_id']
    if await db.reviews.find_one({'client_id':cid,'$or':[{'occurrences.evidence.evidence_id':eid},{'completion_snapshot.evidence.evidence_id':eid}]}): return True
    for link in ctx.direct_links(doc):
        if link['kind'] in ('risks','tasks','vendors','ai_systems'):
            parent = await db[link['kind']].find_one({'client_id':cid,ctx.SOURCES[link['kind']]['key']:link['id']})
            if parent and parent.get('status') in ('closed','retired','done','inactive','terminated'): return True
    return False


def router_for(s):
    router = APIRouter(prefix='/api/evidence-library',tags=['evidence-library'])

    async def item(eid,user,write=False):
        doc=await s.db.evidence.find_one({'evidence_id':eid},{'_id':0,'content_base64':0})
        if not doc: raise HTTPException(404,'Evidence not found')
        if not s._can_access_client(user,doc['client_id']) or write and not s._writable(user): raise HTTPException(403,'Forbidden')
        if write and doc.get('archived_at'): raise HTTPException(409,'Archived Evidence cannot be changed')
        return doc

    @router.get('/sources')
    async def sources(client_id:str,kind:str,q:str=Query('',max_length=250),page:int=Query(1,ge=1),user=Depends(s.get_current_user)):
        s._scope_filter(user,client_id)
        if kind not in ctx.SOURCES: raise HTTPException(422,'Unsupported source')
        query={'client_id':client_id}
        if q: query['$or']=[{field:{'$regex':re.escape(q),'$options':'i'}} for field in ('title','name','display_id','definition_id','framework_key')]
        key=ctx.SOURCES[kind]['key']
        docs=await s.db[kind].find(query,{'_id':0}).sort([(key,1)]).skip((page-1)*25).limit(25).to_list(25)
        return {'items':[ctx.reference(kind,row,occurrence=review_occurrences.occurrence_id(row) if kind=='reviews' else None) for row in docs], 'total':await s.db[kind].count_documents(query),'page':page,'page_size':25}

    @router.get('/reviews/{review_id}/sets')
    async def sets(review_id:str,page:int=Query(1,ge=1),year:str=Query('',max_length=4),user=Depends(s.get_current_user)):
        review=await s._authorized_parent('reviews',review_id,user)
        rows=list(review.get('occurrences',[]))
        if not any(o.get('occurrence_id')==review_occurrences.occurrence_id(review) for o in rows):
            rows.append({**review_occurrences.view(review),'occurrence_id':review_occurrences.occurrence_id(review)})
        years=sorted({str(o.get('due_date') or '')[:4] for o in rows if o.get('due_date')},reverse=True)
        if year: rows=[o for o in rows if str(o.get('due_date') or '').startswith(year)]
        rows.sort(key=lambda o:(o.get('due_date') or '',o['occurrence_id']),reverse=True)
        fields=('occurrence_id','period','status','due_date','completed_at','completed_by_name','outcome','finding_count')
        return {'title':review.get('title'),'years':years,'items':[{**{k:o.get(k) for k in fields},'evidence_count':len(o.get('evidence',[])) if o.get('status')=='completed' else None} for o in rows[(page-1)*25:page*25]],'total':len(rows),'page':page,'page_size':25}

    @router.get('/items/{eid}')
    async def detail(eid:str,user=Depends(s.get_current_user)):
        doc=await item(eid,user)
        row=(await ctx.enrich(s.db,[doc],doc['client_id'],s._can_access_client))[0]
        return {k:v for k,v in row.items() if not k.startswith('_')}

    @router.get('/reviews/{review_id}/set-records')
    async def set_records(review_id:str,occurrence_id:str,page:int=Query(1,ge=1),user=Depends(s.get_current_user)):
        review=await s._authorized_parent('reviews',review_id,user)
        await s._review_selection(review,occurrence_id)
        result={}
        for kind in ('findings','tasks'):
            query={'client_id':review['client_id'],'review_id':review_id,**review_occurrences.occurrence_query(review,occurrence_id)}
            key=ctx.SOURCES[kind]['key']
            docs=await s.db[kind].find(query,{'_id':0}).sort(key,1).skip((page-1)*25).limit(25).to_list(25)
            result[kind]={'total':await s.db[kind].count_documents(query),'items':[ctx.reference(kind,r) for r in docs]}
        return result

    @router.get('/items/{eid}/activity')
    async def activity(eid:str,page:int=Query(1,ge=1),user=Depends(s.get_current_user)):
        doc=await item(eid,user)
        query={'client_id':doc['client_id'],'$or':[{'entity_id':eid,'entity_type':'evidence'},
            {'entity_type':'framework_assessment','meta.kind':'evidence','meta.id':eid}]}
        rows=await s.db.audit_logs.find(query,{'_id':0}).sort('at',-1).skip((page-1)*25).limit(25).to_list(25)
        return {'items':rows,'total':await s.db.audit_logs.count_documents(query),'page':page,'page_size':25}

    @router.patch('/items/{eid}')
    async def metadata(eid:str,body:MetadataEdit,user=Depends(s.get_current_user)):
        doc=await item(eid,user,True)
        s._require_snapshot(body.model_dump(exclude_unset=True),doc)
        patch=body.model_dump(mode='json',exclude={'expected_updated_at'},exclude_unset=True)
        patch['updated_at']=s._next_write_time(doc.get('updated_at'))
        result=await s.db.evidence.update_one({'evidence_id':eid,'archived_at':None,'updated_at':doc.get('updated_at')},{'$set':patch})
        if not result.matched_count: raise HTTPException(409,'Evidence changed; reload before saving')
        await s.audit(user,'Evidence metadata changed','evidence',eid,doc['client_id'],meta={'fields':sorted(set(patch)-{'updated_at'})})
        return await detail(eid,user)

    @router.post('/items/{eid}/relationships')
    @s.review_mutation
    async def relationship(eid:str,body:Link,user=Depends(s.get_current_user)):
        doc=await item(eid,user,True)
        s._require_snapshot(body.model_dump(exclude_unset=True),doc)
        kind=ctx.ALIASES.get(body.linked_type)
        if not kind: raise HTTPException(422,'Unsupported source')
        parent=await s._authorized_parent(kind,body.linked_id,user,write=True)
        if parent['client_id']!=doc['client_id']: raise HTTPException(422,'Evidence relationships must stay in the same client')
        if kind=='framework_assessments': raise HTTPException(422,'Manage framework relationships through the framework assessment')
        if body.remove and kind=='policies' and (
            (parent.get('approval_source') or {}).get('evidence_id')==eid or
            (parent.get('approval_subject') or {}).get('basis',{}).get('evidence_id')==eid or
            any((h.get('subject') or {}).get('basis',{}).get('evidence_id')==eid for h in parent.get('approval_history',[]))):
            raise HTTPException(409,'Policy approval document relationships are retained in Policies')
        if body.remove and kind in ('risks','tasks','vendors','ai_systems') and parent.get('status') in ('closed','retired','done','inactive','terminated'):
            raise HTTPException(409,'Historical Evidence relationships must be retained')
        if kind=='reviews':
            if not body.occurrence_id: raise HTTPException(422,'Select an occurrence')
            await s._review_selection(parent,body.occurrence_id,write=True)
        elif body.occurrence_id: raise HTTPException(422,'Only Reviews have occurrence relationships')
        link={'kind':kind,'id':body.linked_id,'occurrence_id':body.occurrence_id}
        original=ctx.direct_links(doc)
        if any(r['kind']==kind and r['id']==body.linked_id and (kind!='reviews' or (r.get('occurrence_id') or 'occ_'+body.linked_id)==body.occurrence_id) and r['origin']=='upload' for r in original):
            if body.remove: raise HTTPException(409,'Original upload provenance is retained; only supporting relationships can be unlinked')
            return await detail(eid,user)
        links=doc.get('relationships',[])
        if body.remove and link not in links or not body.remove and link in links: return await detail(eid,user)
        if not body.remove and len(links)>=100: raise HTTPException(422,'Evidence supports at most 100 additional relationships')
        op='$pull' if body.remove else '$addToSet'
        result=await s.db.evidence.update_one({'evidence_id':eid,'archived_at':None,'updated_at':doc.get('updated_at')},
            {op:{'relationships':link},'$set':{'updated_at':s._next_write_time(doc.get('updated_at'))}})
        if not result.matched_count: raise HTTPException(409,'Evidence changed; reload before saving')
        await s.audit(user,'Evidence relationship removed' if body.remove else 'Evidence relationship added','evidence',eid,doc['client_id'],meta=link)
        return await detail(eid,user)

    return router
