"""Manual browser QA only: loopback, synthetic fixtures, ephemeral mock database.

Normal authentication, authorization, middleware and routes remain active. This
does not test MongoDB durability, real storage or deployed staging infrastructure.
Generate fixtures with FRAMEWORK_LIFECYCLE_EXPORT_DIR and frameworkFiveYear.test.js.
Run with --fixtures <directory> after the normal frontend build. Never deployed.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import secrets
import sys
from unittest.mock import patch

from mongomock_motor import AsyncMongoMockClient
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
import uvicorn


async def run(directory):
    backend=Path(__file__).resolve().parents[1]
    build=backend.parent/'frontend'/'build'
    if not (build/'index.html').is_file():
        raise RuntimeError('Build the normal, non-Demo frontend first')
    fixtures=[json.loads(path.read_text(encoding='utf-8')) for key in ('cis-ig1','iso-27001','soc-2','multi-framework')
              if (path:=directory/(key+'.json')).is_file()]
    if not fixtures:raise RuntimeError('Generate a reviewed lifecycle fixture first')
    if not all(f.get('synthetic_lifecycle_fixture') is True for f in fixtures):
        raise RuntimeError('Only generated synthetic lifecycle fixtures are accepted')
    # No ambient .env, real database, mail/OAuth credentials or auth bypass.
    settings={'APP_ENV':'test','MONGO_URL':'mongodb://unused','DB_NAME':'test_lifecycle_qa',
              'JWT_SECRET':secrets.token_urlsafe(48),'APP_BASE_URL':'http://127.0.0.1:4180',
              'CORS_ORIGINS':'http://127.0.0.1:4180','PATH':os.environ.get('PATH',''),
              'SYSTEMROOT':os.environ.get('SYSTEMROOT','')}
    sys.path.insert(0,str(backend))
    with patch.dict(os.environ,settings,clear=True), patch('dotenv.load_dotenv',return_value=False), \
         patch('motor.motor_asyncio.AsyncIOMotorClient',AsyncMongoMockClient):
        import server
        from organizational_controls import identity
        for fixture in fixtures:
            store,cid=fixture['store'],fixture['client_id']
            for kind,items in store.items():
                if not isinstance(items,list) or kind=='users':
                    continue
                records=[r for r in items if isinstance(r,dict) and r.get('client_id')==cid]
                if kind=='organizational_controls':
                    # The Demo adapter and server use different deterministic ID
                    # encodings. Translate only exported legacy Control identities
                    # so this imported fixture does not offer duplicate migration.
                    # No production data or historical snapshots are rewritten.
                    for record in records:
                        if record.get('legacy_id'):
                            record['control_id']=identity(cid,'legacy:'+record['legacy_id'])
                if kind=='clients':
                    for r in records:r['onboarding_baseline']=store.get('baselines',{}).get(cid)
                if records:await server.db['audit_logs' if kind=='logs' else kind].insert_many(records)
            # Preserve historical authors without giving those fixture users login.
            for user in store['users']:
                user.pop('password_hash',None)
                await server.db.users.update_one({'user_id':user['user_id']},{'$setOnInsert':user},upsert=True)
        cids=[f['client_id'] for f in fixtures]
        password=secrets.token_urlsafe(18)
        for name,role,scope in [('owner','super_admin',cids),('provider','platform_admin',[cids[-1]]),
                                ('contributor','client_contributor',[cids[-1]]),('reader','client_readonly',[cids[-1]])]:
            await server.db.users.insert_one({'user_id':'qa_'+name,'name':'Synthetic '+name,
                'email':name+'@example.com','password_hash':server.hash_password(password),
                'role':role,'client_ids':scope,'status':'active','auth_provider':'password'})
        server.app.mount('/static',StaticFiles(directory=build/'static'),name='qa-static')
        @server.app.get('/{route:path}',include_in_schema=False)
        async def spa(route:str):
            if route.startswith('api/'):
                raise server.HTTPException(404,'Not found')
            return FileResponse(build/'index.html')
        print('SYNTHETIC LOCAL QA ONLY — owner/provider/contributor/reader@example.com',flush=True)
        print('Ephemeral password: '+password,flush=True)
        await uvicorn.Server(uvicorn.Config(server.app,host='127.0.0.1',port=4180,log_level='warning')).serve()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures',type=Path,required=True)
    asyncio.run(run(parser.parse_args().fixtures.resolve()))
