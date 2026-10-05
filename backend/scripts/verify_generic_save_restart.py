"""Disposable loopback Mongo + real HTTP recovery across application processes."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import uuid
from urllib.parse import urlsplit

import httpx
from pymongo import MongoClient


def worker():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import server
    import uvicorn
    from unittest.mock import AsyncMock
    if os.environ.get('RECOVERY_INJECT') == 'yes':
        original_audit=server.audit
        async def failed_audit(*args,**kwargs):
            if len(args)>2 and args[1]=='update' and args[2]=='asset':
                raise RuntimeError('synthetic audit outage')
            return await original_audit(*args,**kwargs)
        server.audit = failed_audit
        server.vendor_governance.ensure_reviews = AsyncMock(side_effect=RuntimeError('synthetic Review outage'))
    uvicorn.run(server.app, host='127.0.0.1', port=4386, log_level='error')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongo-url',required=True)
    args=parser.parse_args()
    parsed=urlsplit(args.mongo_url)
    if parsed.scheme!='mongodb' or parsed.hostname!='127.0.0.1' or not parsed.port or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment:
        parser.error('Explicit credential-free loopback Mongo origin required')
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',4386))
    name='test_generic_restart_'+uuid.uuid4().hex
    mongo=MongoClient(args.mongo_url,serverSelectionTimeoutMS=3000)
    assert name not in mongo.list_database_names()
    database=mongo[name]
    # Only synthetic state in a freshly allocated database; no login bypass.
    import bcrypt
    password=secrets.token_urlsafe(30)
    database.users.insert_one({'user_id':'synthetic_admin','email':'restart@example.com','name':'Synthetic','role':'super_admin','status':'active','client_ids':['synthetic'],'password_hash':bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode()})
    database.clients.insert_one({'client_id':'synthetic','name':'Synthetic','status':'active'})
    database.assets.insert_one({'asset_id':'asset','client_id':'synthetic','name':'Before','updated_at':None})
    database.vendors.insert_one({'vendor_id':'vendor','client_id':'synthetic','name':'Synthetic vendor','service':'Test service','criticality':'low','status':'onboarding','review_frequency':'annual','updated_at':None})
    env={k:v for k,v in os.environ.items() if k.upper() in ('PATH','SYSTEMROOT','TEMP','TMP','WINDIR')}
    env.update(APP_ENV='test',MONGO_URL=args.mongo_url,DB_NAME=name,JWT_SECRET=secrets.token_urlsafe(48),APP_BASE_URL='http://127.0.0.1:4386',CORS_ORIGINS='http://127.0.0.1:4386')
    process=None
    def start(inject):
        nonlocal process
        process=subprocess.Popen([sys.executable,__file__,'--worker'],env={**env,'RECOVERY_INJECT':'yes' if inject else 'no'})
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            if process.poll() is not None:raise RuntimeError('Isolated API worker stopped during startup')
            try:
                if httpx.get('http://127.0.0.1:4386/api/',timeout=.5).status_code==200:return
            except httpx.HTTPError:pass
            time.sleep(.1)
        raise RuntimeError('Isolated API startup timeout')
    def stop():
        if process and process.poll() is None:process.terminate();process.wait(timeout=15)
    try:
        start(True)
        with httpx.Client(base_url='http://127.0.0.1:4386/api') as api:
            login=api.post('/auth/login',json={'email':'restart@example.com','password':password},headers={'Origin':env['APP_BASE_URL']})
            assert login.status_code==200,login.text
            api.cookies.clear();api.headers['Authorization']='Bearer '+login.json()['access_token']
            commands=[('assets/asset',{'name':'After','expected_updated_at':None},'restart-asset-command-01'),('vendors/vendor',{'next_review':'2027-01-15','expected_updated_at':None},'restart-vendor-command-02')]
            for path,body,key in commands:
                failed=api.patch('/'+path,json=body,headers={'Idempotency-Key':key})
                assert failed.status_code==503,failed.text
            stop();start(False)
            for path,body,key in commands:
                recovered=api.patch('/'+path,json=body,headers={'Idempotency-Key':key})
                assert recovered.status_code==200,recovered.text
                assert api.patch('/'+path,json=body,headers={'Idempotency-Key':key}).json()==recovered.json()
            assert database.audit_logs.count_documents({'entity_type':'asset','entity_id':'asset','action':'update'})==1
            assert database.reviews.count_documents({'vendor_id':'vendor'})==1
            assert database.reviews.find_one({'vendor_id':'vendor'})['due_date'][:10]=='2027-01-15'
            print(json.dumps({'normal_password_login':True,'asset_audit_recovered_after_process_restart':True,'vendor_review_recovered_after_process_restart':True,'lost_success_response_replay':True,'mongo_database':name,'cleanup':'database dropped in finally'}))
    finally:
        stop();mongo.drop_database(name);mongo.close()


if __name__=='__main__':
    worker() if '--worker' in sys.argv else main()
