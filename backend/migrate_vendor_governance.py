"""Explicit, client-scoped adoption of existing Vendor schedules. Dry run by default.

No names/scope text are used to infer relationships. Ambiguous obligations are
reported for an administrator rather than merged or deleted automatically.
"""
import argparse
import asyncio
import json
import server
import vendor_governance


async def run(client_id, actor_id, apply=False):
    actor = await server.db.users.find_one({'user_id':actor_id},{'_id':0})
    if not actor or actor.get('role') not in ('super_admin','platform_admin') or not server._can_access_client(actor,client_id):
        raise ValueError('An authorized platform administrator is required')
    vendors = await server.db.vendors.find({'client_id':client_id},{'_id':0}).to_list(None)
    report = []
    for vendor in vendors:
        item = {'vendor_id':vendor['vendor_id'],'name':vendor.get('name'),'mode':'apply' if apply else 'dry-run'}
        if vendor.get('status') in ('inactive','terminated'):
            item['result'] = 'Historical record retained; no new schedule'
        elif not vendor.get('next_review'):
            item['result'] = 'No first Review date; administrator decision required'
        else:
            try:
                await vendor_governance.validate(server.db,vendor,server._can_access_client,vendor)
                item['result'] = 'Schedule eligible; legacy service and assurance metadata retained'
                if apply:
                    result = await server.vendor_schedule_review(vendor['vendor_id'],server.VendorScheduleReviewIn(),actor)
                    item['review_id'] = result['review']['review_id']
            except Exception as error:
                item['result'] = str(getattr(error,'detail',error))
        report.append(item)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-id',required=True)
    parser.add_argument('--actor-id',required=True)
    parser.add_argument('--apply',action='store_true')
    args = parser.parse_args()
    print(json.dumps(asyncio.run(run(args.client_id,args.actor_id,args.apply)),indent=2))
