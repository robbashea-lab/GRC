"""Bounded synthetic ASGI/Mongo-mock probe; never a production capacity benchmark.

Run with PYTHONPATH=backend;backend/tests using the isolated verification environment.
No network database, reset, customer data, or persisted output is used.
"""
import argparse
import asyncio
import json
import logging
import math
import time
import tracemalloc
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server


async def main(profile, soak_seconds, dashboard_only=False):
    logging.disable(logging.CRITICAL)
    harness = Harness()
    await harness.asyncSetUp()
    harness.sign_in('admin')
    tracemalloc.start()
    try:
        counts = ({'risks':500,'vendors':500,'reviews':2000,'findings':2000,'tasks':4000,'evidence':1000}
                  if profile == 'medium' else {'risks':1000,'vendors':2000,'reviews':2000,'findings':10000,'tasks':20000,'evidence':2000})
        keys = {'risks':'risk_id','vendors':'vendor_id','reviews':'review_id','findings':'finding_id','tasks':'task_id','evidence':'evidence_id'}
        for kind, count in counts.items():
            await server.db[kind].insert_many([
                {keys[kind]:f'{kind}-{i}','client_id':'a','title':f'Synthetic {kind} {i}',
                 'name':f'Synthetic {i}','created_at':'2026-01-01T00:00:00+00:00','updated_at':'2026-01-01T00:00:00+00:00',
                 'status':'upcoming' if kind=='reviews' else 'open','due_date':'2026-09-20',
                 'recurrence':'monthly' if kind=='reviews' else 'none','severity':'high','priority':'medium',
                 'criticality':'medium','risk_level':'high','risk_score':16,'filename':f'proof-{i}.txt',
                 'linked_type':'task','linked_id':f'tasks-{i % counts["tasks"]}'} for i in range(count)])
        print(json.dumps({'boundary':'ASGI + Mongo mock only','profile':profile,'counts':counts}),flush=True)
        for path in ['/api/dashboard?client_id=a','/api/calendar?client_id=a&start=2026-09-01&end=2026-09-30',
                     '/api/risks?client_id=a','/api/vendors?client_id=a','/api/reviews?client_id=a',
                     '/api/findings?client_id=a','/api/tasks?client_id=a','/api/evidence/catalog?client_id=a']:
            start=time.perf_counter()
            response=await harness.client.get(path)
            assert response.status_code in (200,413),(path,response.status_code,response.text[:150])
            print(json.dumps({'operation':path,'status':response.status_code,'ms':round((time.perf_counter()-start)*1000,1),'bytes':len(response.content)}),flush=True)
            if path.startswith('/api/dashboard'):
                data=response.json()
                size=lambda value:len(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode())
                sections={key:size(value) for key,value in data.items()}
                management_sections={key:size(value) for key,value in data.get('management',{}).items()}
                objects=0;unique=set();pending=[data]
                while pending:
                    value=pending.pop()
                    if isinstance(value,dict):
                        if 'client_id' in value:
                            identity=next(((key,value[key]) for key in keys.values() if value.get(key)),None)
                            if identity:objects+=1;unique.add(identity)
                        pending.extend(value.values())
                    elif isinstance(value,list):pending.extend(value)
                print(json.dumps({'dashboard_sections':sections,'management_sections':management_sections,
                                  'embedded_record_objects':objects,'unique_embedded_records':len(unique),'kpis':data['kpis']}),flush=True)
                if dashboard_only:
                    return

        # Small isolated tenant: bounded read concurrency, not expensive customer-sized writes.
        async def request():
            start=time.perf_counter()
            response=await harness.client.get('/api/findings?client_id=b')
            assert response.status_code==200 and response.json()==[]
            return (time.perf_counter()-start)*1000
        for parallel in (1,5,10,25,50,100):
            start=time.perf_counter();cpu=time.process_time()
            values=sorted(await asyncio.gather(*(request() for _ in range(parallel))))
            elapsed=time.perf_counter()-start
            print(json.dumps({'parallel':parallel,'requests':parallel,'seconds':round(elapsed,3),
                              'rps':round(parallel/elapsed,1),'p50_ms':round(values[math.ceil(parallel*.5)-1],2),
                              'p95_ms':round(values[math.ceil(parallel*.95)-1],2),'p99_ms':round(values[-1],2),
                              'cpu_seconds':round(time.process_time()-cpu,3),'errors':0}),flush=True)
        start=time.perf_counter();before=tracemalloc.get_traced_memory()[0];requests=0;max_ms=0
        while time.perf_counter()-start<soak_seconds:
            max_ms=max(max_ms,await request());requests+=1
            await asyncio.sleep(.02) # Explicit bounded probe pacing, not a test synchronization assumption.
        current,peak=tracemalloc.get_traced_memory()
        print(json.dumps({'soak_seconds':round(time.perf_counter()-start,2),'requests':requests,'max_ms':round(max_ms,2),
                          'python_heap_delta_bytes':current-before,'python_peak_bytes':peak,'errors':0}),flush=True)
        assert await server.db.findings.count_documents({'client_id':'a'})==counts['findings']
        assert await server.db.findings.count_documents({'client_id':'b'})==0
    finally:
        await harness.client.aclose()
        harness.doCleanups()
        tracemalloc.stop()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile',choices=['medium','large'],default='medium')
    parser.add_argument('--soak-seconds',type=int,choices=range(1,61),default=30)
    parser.add_argument('--dashboard-only',action='store_true')
    args=parser.parse_args()
    asyncio.run(main(args.profile,args.soak_seconds,args.dashboard_only))
