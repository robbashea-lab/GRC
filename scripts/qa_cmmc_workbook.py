"""CMMC workbook acceptance on the same disposable replica used by qa_native_inventory."""
import secrets


import httpx
import qa_native_inventory as pilot


async def check(get,post,call):
    cid=(await post('/clients',{'name':'Synthetic CMMC document tenant'}))['client_id']
    await pilot.enroll(get,post,cid,{'cmmc':{'level':2}})
    endpoint='/frameworks/cmmc/workbook'
    async def sources(): return await get(endpoint,client_id=cid)
    async def save(section,values,*,target='',stamp='',revision=0,ident=None,expected=200):
        return await call('PUT',endpoint,json={'client_id':cid,'level':2,'revision':revision,'section':section,
            'target':target,'assessed_version':stamp,'values':values,'request_id':ident or secrets.token_hex(16)},expected=expected)
    fresh=await sources()
    assert fresh['records']['revision']==0 and len(fresh['data']['assessments'])==110
    row=next(row for row in fresh['data']['assessments'] if row['definition_id']=='3.13.11')
    req='/framework_assessments/'+row['framework_assessment_id']
    async def assess(status,notes,stamp):
        result=await call('PATCH',req,json={'status':status,'implementation':notes,'expected_last_assessed':stamp})
        return result['last_saved']
    v1=await assess('needs_attention','Recorded CUI encryption gap',None)
    assert (await save('exceptions',{'value':'encrypted-not-fips'},target='3.13.11',stamp=v1))['revision']==1
    assert (await save('plans',{'status':'In progress','milestone':'Validate the deployed module'},target='3.13.11',stamp=v1,revision=1))['revision']==2
    await save('plans',{'status':'Closed'},target='3.13.11',stamp=v1,revision=2,expected=422)
    work={'cmmc_gap_version':v1,'request_id':secrets.token_hex(16),'title':'Synthetic encryption gap','remediation_title':'Validate replacement module'}
    finding=await post(req+'/findings',work)
    assert (await post(req+'/findings',work))['primary_task_id']==finding['primary_task_id']
    from_register=await sources()
    assert finding['finding_id'] in [f['finding_id'] for f in from_register['records']['findings']]
    assert finding['primary_task_id'] in [t['task_id'] for t in from_register['records']['tasks']]
    v2=await assess('addressed','Validated replacement module with documented evidence',v1)
    await call('POST',req+'/findings',json={**work,'request_id':secrets.token_hex(16)},expected=409)
    await save('plans',{'status':'Closed','closeout':'Validated','evidence':'QA reference'},target='3.13.11',stamp=v1,revision=2,expected=409)
    token=secrets.token_hex(16)
    for _ in range(2):
        assert (await save('plans',{'status':'Closed','closeout':'Validated','evidence':'QA reference'},target='3.13.11',stamp=v2,revision=2,ident=token))['revision']==3
    await save('plans',{'status':'Open'},target='3.13.11',stamp=v2,revision=3,expected=422)
    assert (await save('ssp',{'system':'Synthetic enclave','boundary':'Documented system boundary'},revision=3))['revision']==4
    await save('posting',{'score':'88','date':'2025-10-11','scope':'Synthetic enclave'},revision=4)
    export_ticket={'client_id':cid,'kind':'ssp','level':2,'request_id':secrets.token_hex(16)}
    for _ in range(2):
        packet=await post(endpoint+'/export',export_ticket)
        records=packet['records']
        assert records['revision']==5 and len(records['history'])==5
        assert records['plans']['3.13.11']['assessment']['points']==3
        assert records['ssp']['system']=='Synthetic enclave' and records['posting']['score']=='88'
        assert records['exceptions']['3.13.11']['assessed_version']==v1
    logs=(await get('/audit-logs',client_id=cid,page_size=100))['items']
    assert len([row for row in logs if row['entity_type']=='cmmc-workbook' and row['action']=='prepare-export'])==1
    assert len([row for row in logs if row['entity_type']=='cmmc-workbook' and row['action']=='update'])==5
    first=(await post('/clients',{'name':'Synthetic CMMC Level 1 tenant'}))['client_id']
    await pilot.enroll(get,post,first,{'cmmc':{'level':1}})
    packet=await get(endpoint,client_id=first)
    assert packet['records']['revision']==0 and len(packet['data']['assessments'])==17
    await call('POST',endpoint+'/export',json={**export_ticket,'client_id':first,'level':1,'kind':'sprs'},expected=409)
    assert (await post(endpoint+'/export',{**export_ticket,'client_id':first,'level':1}))['records'].get('ssp') is None
    print('PASS real native CMMC: L1 and L2 enrollment, assessment-version conflict, plan impact and closeout history, fresh SSP/SPRS inputs, export authorization and idempotent audit',flush=True)
    return cid,first


async def run(app,password,_sample):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url=pilot.ORIGIN,headers={'Origin':pilot.ORIGIN}) as browser:
        async def call(method,path,expected=200,**kwargs):
            response=await browser.request(method,'/api'+path,**kwargs)
            assert response.status_code==expected,(method,path,response.status_code,response.text[:220])
            return response.json()
        async def get(path,**params): return await call('GET',path,params=params)
        async def post(path,body): return await call('POST',path,json=body,headers={'Idempotency-Key':secrets.token_hex(16)})
        await post('/auth/login',{'email':'owner@example.org','password':password})
        cid,foreign=await check(get,post,call)
        reader_password=secrets.token_urlsafe(32)
        await post('/users',{'name':'Synthetic reader','email':'reader@example.org','role':'client_readonly','client_ids':[cid],'password':reader_password})
        await post('/auth/logout',{})
        await post('/auth/login',{'email':'reader@example.org','password':reader_password})
        replacement=secrets.token_urlsafe(32)
        if (await get('/auth/me')).get('password_change_required'):
            await call('PATCH','/me/password',json={'current_password':reader_password,'new_password':replacement})
            await post('/auth/login',{'email':'reader@example.org','password':replacement})
        await get('/frameworks/cmmc/workbook',client_id=cid)
        await call('PUT','/frameworks/cmmc/workbook',expected=403,json={'level':2,'revision':5,'client_id':cid,'section':'ssp','request_id':secrets.token_hex(16),'values':{'system':'Denied'}})
        await call('GET','/frameworks/cmmc/workbook',expected=403,params={'client_id':foreign})
        await call('POST','/frameworks/cmmc/workbook/export',expected=403,json={'level':1,'kind':'ssp','request_id':secrets.token_hex(16),'client_id':foreign})
        assert (await post('/frameworks/cmmc/workbook/export',{'level':2,'kind':'ssp','request_id':secrets.token_hex(16),'client_id':cid}))['records']['ssp']['system']=='Synthetic enclave'
        print('PASS native signed-in reader: assigned corpus survives new login, write and cross-client exports denied',flush=True)


if __name__=='__main__':
    pilot.main(run)
