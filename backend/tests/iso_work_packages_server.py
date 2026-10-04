"""Disposable loopback QA server: normal auth, synthetic fixtures, mocked Mongo.
Never imports a production .env or connects to external storage/identity services.
Requires test dependencies and an explicitly supplied normal-auth frontend build.
"""
import os,sys
from pathlib import Path
from unittest.mock import patch
from mongomock_motor import AsyncMongoMockClient
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
import uvicorn

ROOT=Path(__file__).resolve().parents[2]
BUILD=Path(os.environ['ISO_QA_BUILD']).resolve()
sys.path.insert(0,str(ROOT/'backend'))
password=os.environ['ISO_QA_PASSWORD'];secret=os.environ['ISO_QA_JWT']
settings={'APP_ENV':'test','MONGO_URL':'mongodb://unused','DB_NAME':'iso_work_packages_disposable',
 'JWT_SECRET':secret,'APP_BASE_URL':'http://127.0.0.1:4197','CORS_ORIGINS':'http://127.0.0.1:4197',
 'ADMIN_EMAIL':'','ADMIN_PASSWORD_HASH':'','RUN_LEGACY_MIGRATIONS':'false','WEBHOOK_CRON_SECRET':'',
 'PATH':os.environ.get('PATH',''),'SYSTEMROOT':os.environ.get('SYSTEMROOT','')}
with patch.dict(os.environ,settings,clear=True),patch('dotenv.load_dotenv',return_value=False),patch('motor.motor_asyncio.AsyncIOMotorClient',AsyncMongoMockClient):
 import server
 @server.app.on_event('startup')
 async def seed():
  for uid,role,cids in [('owner','super_admin',['a','b']),('manager','client_grc_manager',['a']),('contributor','client_contributor',['a']),('reader','client_readonly',['a'])]:
   await server.db.users.insert_one({'user_id':uid,'name':'Synthetic '+uid,'email':uid+'@example.com','role':role,'client_ids':cids,'status':'active','password_hash':server.hash_password(password),'auth_provider':'password'})
  await server.db.clients.insert_many([{'client_id':c,'name':'ISO QA '+c,'status':'active'} for c in ['a','b']])
 static=StaticFiles(directory=BUILD)
 async def app(scope,receive,send):
  if scope['type']!='http' or scope['path'].startswith('/api'):return await server.app(scope,receive,send)
  candidate=(BUILD/scope['path'].lstrip('/')).resolve()
  if candidate.is_relative_to(BUILD) and candidate.is_file():return await static(scope,receive,send)
  return await FileResponse(BUILD/'index.html')(scope,receive,send)
 uvicorn.run(app,host='127.0.0.1',port=4197,log_level='warning')
