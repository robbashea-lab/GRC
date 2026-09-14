"""Explicit tenant-scoped rollout, dry-run unless --apply is supplied.

Run after deploying the backend, using its normal environment configuration:
python migrate_risk_governance.py --client-id CLIENT --actor-id ADMIN [--apply]
Never derives numeric assessments or historical Review occurrences.
"""
import argparse
import asyncio
import json
import server


async def main(args):
    actor = await server.db.users.find_one({'user_id':args.actor_id}, {'_id':0})
    if not actor or actor.get('status') != 'active' or actor.get('role') not in ('super_admin','platform_admin') or not server._can_access_client(actor,args.client_id):
        raise ValueError('An active, authorized administrator is required')
    rows = await server.db.risks.find({'client_id':args.client_id},{'_id':0}).sort([('created_at',1),('risk_id',1)]).to_list(None)
    result = {'mode':'apply' if args.apply else 'dry-run','risks':len(rows),'missing_display_ids':sum(not r.get('display_id') for r in rows),'scheduled':0,'skipped':0,'issues':[]}
    if args.apply:
        await server.risk_ids.initialize(server.db,args.client_id)
    for row in rows:
        if row.get('status') in server.risk_lifecycle.CLOSED or not row.get('next_review'):
            result['skipped'] += 1
            continue
        try:
            server.risk_lifecycle.validate_schedule(row)
            owner = await server.db.users.find_one({'user_id':row.get('owner_id')}) if row.get('owner_id') else None
            if row.get('owner_id') and (not owner or not server._can_access_client(owner,args.client_id)):
                raise ValueError('Owner requires tenant-access reconciliation')
            if args.apply:
                await server.risk_mark_reviewed(row['risk_id'],user=actor)
            result['scheduled'] += 1
        except Exception as error:
            result['issues'].append({'risk_id':row['risk_id'],'reason':getattr(error,'detail',str(error))})
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-id',required=True)
    parser.add_argument('--actor-id',required=True)
    parser.add_argument('--apply',action='store_true')
    asyncio.run(main(parser.parse_args()))
