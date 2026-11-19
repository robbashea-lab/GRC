"""Held-source activity stays private until its accepted native save is settled."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import create_requests
import portfolio_activity as activity
import portfolio_reporting as reporting
import r4_services as services
import test_client_dashboard_sources as fixture

server = fixture.server


class R4PendingActivityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def actor_and_cutoff(self):
        actor = await server.db.users.find_one({'user_id': 'admin'})
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=1)
        clients = await server.db.clients.find({'client_id': 'a'}).to_list(None)
        return actor, cutoff, clients

    async def source_event(self, identity, *, kind='risks', cid='a', at=None, held=None, persist=False):
        actor, cutoff, _clients = await self.actor_and_cutoff()
        at = at or cutoff.isoformat()
        before, after = ({'notes': 'Saved original'}, {'notes': 'Saved replacement'}) if kind == 'reviews' else (
            {'status': 'identified'}, {'status': 'assessed'})
        event = activity.project_committed_change(kind, identity, cid, actor, before, after, at)
        self.assertIsNotNone(event)
        row = {activity.SOURCES[kind][0]: identity, 'client_id': cid, **after, 'updated_at': at,
               '_portfolio_activity_pending': {event['event_id']: event},
               '_portfolio_activity_last_event_id': event['event_id'], 'history': ['Retained source history']}
        if held is not None:
            row['_r4_context_pending'] = held
        await server.db[kind].insert_one(row)
        if persist:
            await activity.persist_event(server.db, event)
        return event

    async def test_autonomous_and_unknown_ack_defer_exact_envelope_until_recovery(self):
        event = await self.source_event('held-envelope', held='another-command')
        source = await server.db.risks.find_one({'risk_id': 'held-envelope'})
        for _ in range(2):
            result = await activity.reconcile_pending(server.db)
            self.assertEqual(result, {'processed': 1, 'inserted': 0, 'deferred': 1})
            self.assertFalse(await activity.acknowledge_committed(server.db, 'risk', 'held-envelope', 'a', event['event_id']))
            self.assertEqual(await server.db.risks.find_one({'risk_id': 'held-envelope'}), source)
            self.assertEqual(await server.db.portfolio_events.count_documents({}), 0)
            self.assertEqual(await server.db.portfolio_activity_receipts.count_documents({}), 0)
        await activity.reconcile(server.db)
        state = await server.db.portfolio_reporting_state.find_one({'_id': 'activity'})
        self.assertFalse(state['pending_batch_complete'])
        await server.db.risks.update_one({'risk_id': 'held-envelope'}, {'$unset': {'_r4_context_pending': ''}})
        self.assertEqual(await activity.reconcile_pending(server.db), {'processed': 1, 'inserted': 1})
        stored = await server.db.portfolio_events.find_one({'event_id': event['event_id']})
        self.assertEqual(stored, {'_id': event['event_id'], **event})
        saved = await server.db.risks.find_one({'risk_id': 'held-envelope'})
        self.assertNotIn('_portfolio_activity_pending', saved)
        self.assertEqual(saved['history'], source['history'])
        self.assertEqual(saved['_portfolio_activity_last_event_id'], event['event_id'])
        self.assertEqual(await activity.reconcile_pending(server.db), {'processed': 0, 'inserted': 0})
        self.assertFalse(await activity.persist_event(server.db, {**event, 'title': 'Replay cannot overwrite original'}))
        self.assertEqual(await server.db.portfolio_events.find_one({'event_id': event['event_id']}), stored)

    async def test_legacy_audit_receipt_and_coverage_wait_for_held_source_then_recover_once(self):
        actor, cutoff, _clients = await self.actor_and_cutoff()
        document = {'log_id': 'held-legacy-audit', 'client_id': 'a', 'entity_type': 'risk',
            'entity_id': 'legacy-held-risk', 'action': 'Risk updated', 'outcome': 'success',
            'at': cutoff.isoformat(), 'user_id': actor['user_id'], 'user_name': actor['name'],
            'meta': {'changes': {'status': {'before': 'identified', 'after': 'assessed'}}}}
        event = activity.project_audit(document)
        self.assertIsNotNone(event)
        await server.db.audit_logs.insert_one(deepcopy(document))
        await server.db.risks.insert_one({'risk_id': 'legacy-held-risk', 'client_id': 'a',
            'status': 'assessed', '_r4_context_pending': 'legacy-command', 'history': ['Original history']})
        original = await server.db.risks.find_one({'risk_id': 'legacy-held-risk'})
        for _ in range(2):
            await activity.reconcile(server.db)
            self.assertEqual(await server.db.portfolio_events.count_documents({}), 0)
            self.assertEqual(await server.db.portfolio_activity_receipts.count_documents({}), 0)
            self.assertEqual(await server.db.risks.find_one({'risk_id': 'legacy-held-risk'}), original)
            self.assertFalse((await server.db.portfolio_reporting_state.find_one({'_id': 'activity'}))['audit_batch_complete'])
        await server.db.risks.update_one({'risk_id': 'legacy-held-risk'}, {'$unset': {'_r4_context_pending': ''}})
        await activity.reconcile(server.db)
        stored = await server.db.portfolio_events.find_one({'event_id': event['event_id']})
        self.assertEqual(stored, {'_id': event['event_id'], **event})
        receipt = await server.db.portfolio_activity_receipts.find_one({'_id': document['log_id']})
        self.assertIsNotNone(receipt)
        await activity.reconcile(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)
        self.assertEqual(await server.db.portfolio_activity_receipts.find_one({'_id': document['log_id']}), receipt)
        self.assertEqual(await server.db.audit_logs.count_documents({}), 1)
        self.assertTrue((await server.db.portfolio_reporting_state.find_one({'_id': 'activity'}))['audit_batch_complete'])

    async def test_native_command_audit_can_ack_only_own_claim_after_all_business_writes(self):
        actor, cutoff, _clients = await self.actor_and_cutoff()
        foreign = await self.source_event('foreign-current-command', held='different-command')
        originals, events, writes = [], [], []
        for number in (1, 2):
            row = {'review_id': 'own-review-' + str(number), 'client_id': 'a', 'status': 'upcoming',
                   'notes': 'Before', 'updated_at': cutoff.isoformat(), 'history': ['Retained ' + str(number)]}
            await server.db.reviews.insert_one(deepcopy(row))
            event = activity.project_committed_change('reviews', row['review_id'], 'a', actor,
                row, {**row, 'notes': 'After'}, cutoff.isoformat())
            self.assertIsNotNone(event)
            originals.append(row)
            events.append(event)
            writes.append(services.write_row('reviews', 'review_id', row, {'notes': 'After',
                '_portfolio_activity_pending': {event['event_id']: event},
                '_portfolio_activity_last_event_id': event['event_id']}))
        observed = []
        first_client_audit = True

        async def native_audit(user, action, entity_type, entity_id, client_id=None, meta=None):
            nonlocal first_client_audit
            if first_client_audit and entity_type == 'client':
                first_client_audit = False
                self.assertFalse(await activity.acknowledge_committed(server.db, 'risk',
                    foreign['source_id'], 'a', foreign['event_id']))
                for row, event in zip(originals, events):
                    await server.audit(user, 'Review configuration changed', 'review', row['review_id'], 'a',
                        meta={'_portfolio_activity_event_id': event['event_id']})
            await server.audit(user, action, entity_type, entity_id, client_id, meta)

        original_persist = activity.persist_event

        async def check_durable_audit(db, event):
            current = create_requests.current.get()
            self.assertIsNotNone(current)
            receipt = await db.create_requests.find_one({'_id': current})
            self.assertTrue(receipt['primary_started'])
            self.assertEqual(receipt['r4_write_plan'], writes)
            self.assertIsNotNone(await db.audit_logs.find_one({'meta._portfolio_activity_event_id': event['event_id']}))
            for row in originals:
                applied = await db.reviews.find_one({'review_id': row['review_id']})
                self.assertEqual(applied['notes'], 'After')
                self.assertEqual(applied['_r4_context_applied'], current)
                self.assertEqual(applied['_r4_context_pending'], current)
            observed.append(event['event_id'])
            return await original_persist(db, event)

        async def execute(identity):
            await services.apply_plan(SimpleNamespace(db=server.db, audit=native_audit), writes,
                identity, actor, 'Owned synthetic native context save')
            return {'review_ids': [row['review_id'] for row in originals]}

        args = (server.db, 'r4-pending-native-audit-key', actor['user_id'], 'a', 'synthetic-native/save', {'saved': True}, execute)
        with patch.object(activity, 'persist_event', check_durable_audit):
            result = await create_requests.run(*args)
        self.assertEqual(observed, [event['event_id'] for event in events])
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 2)
        for row in originals:
            saved = await server.db.reviews.find_one({'review_id': row['review_id']})
            self.assertNotIn('_r4_context_pending', saved)
            self.assertNotIn('_portfolio_activity_pending', saved)
            self.assertEqual(saved['history'], row['history'])
        retained = await server.db.risks.find_one({'risk_id': foreign['source_id']})
        self.assertEqual(retained['_r4_context_pending'], 'different-command')
        self.assertEqual(retained['_portfolio_activity_pending'], {foreign['event_id']: foreign})
        audit_count = await server.db.audit_logs.count_documents({})
        self.assertEqual(await create_requests.run(*args), result)
        self.assertEqual(await server.db.audit_logs.count_documents({}), audit_count)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 2)
        self.assertIsNone(create_requests.current.get())

    async def test_existing_offpage_held_event_blocks_native_page_cursor_and_count(self):
        actor, cutoff, clients = await self.actor_and_cutoff()
        oldest = await self.source_event('oldest-offpage', at=(cutoff - timedelta(hours=2)).isoformat(), persist=True)
        newest = await self.source_event('newest-visible', at=(cutoff - timedelta(hours=1)).isoformat(), persist=True)
        self.sign_in('admin')
        params = {'client_id': 'a', 'days': 7, 'type': 'Risks', 'limit': 1, 'as_of': cutoff.isoformat()}
        first = await self.client.get('/api/portfolio/reporting/activity', params=params)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual([row['event_id'] for row in first.json()['events']], [newest['event_id']])
        cursor = first.json()['next_cursor']
        self.assertTrue(cursor)
        for claim in ('held-offpage', {'unexpected': 'nonempty claim'}, ['unexpected claim']):
            with self.subTest(claim=claim):
                await server.db.risks.update_one({'risk_id': oldest['source_id']}, {'$set': {'_r4_context_pending': claim}})
                original = await server.db.risks.find_one({'risk_id': oldest['source_id']})
                for query in (params, {**params, 'cursor': cursor}):
                    response = await self.client.get('/api/portfolio/reporting/activity', params=query)
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertNotIn('events', response.json())
                with self.assertRaises(HTTPException) as refused:
                    await activity.count_activity(server.db, actor, clients, cutoff.isoformat(), change_type='Risks')
                self.assertEqual(refused.exception.status_code, 409)
                self.assertEqual(await server.db.risks.find_one({'risk_id': oldest['source_id']}), original)
                self.assertEqual(await server.db.portfolio_events.count_documents({}), 2)
        await server.db.risks.update_one({'risk_id': oldest['source_id']}, {'$unset': {'_r4_context_pending': ''}})
        resumed = await self.client.get('/api/portfolio/reporting/activity', params={**params, 'cursor': cursor})
        self.assertEqual(resumed.status_code, 200, resumed.text)
        self.assertEqual([row['event_id'] for row in resumed.json()['events']], [oldest['event_id']])
        self.assertEqual(resumed.json()['total'], 2)
        self.assertEqual(await activity.count_activity(server.db, actor, clients, cutoff.isoformat(), change_type='Risks'), 2)

    async def test_type_range_tenant_and_deleted_history_keep_existing_population(self):
        actor, cutoff, clients = await self.actor_and_cutoff()
        at = (cutoff - timedelta(hours=1)).isoformat()
        deleted = await self.source_event('deleted-source', at=at, persist=True)
        await server.db.risks.delete_one({'risk_id': deleted['source_id']})
        await self.source_event('foreign-held', cid='b', at=at, held='foreign', persist=True)
        await self.source_event('outside-range-held', at=(cutoff - timedelta(days=8)).isoformat(), held='old', persist=True)
        await self.source_event('other-type-held', kind='reviews', at=at, held='other-type', persist=True)
        self.sign_in('admin')
        response = await self.client.get('/api/portfolio/reporting/activity', params={
            'client_id': 'a', 'days': 7, 'type': 'Risks', 'as_of': cutoff.isoformat()})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 1)
        public = response.json()['events'][0]
        self.assertEqual(public['event_id'], deleted['event_id'])
        self.assertFalse(public['source']['available'])
        self.assertIsNone(public['source']['to'])
        self.assertNotIn('before', public)
        self.assertNotIn('after', public)
        self.assertEqual(await activity.count_activity(server.db, actor, clients, cutoff.isoformat(), change_type='Risks'), 1)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 4)
        self.sign_in('member')
        denied = await self.client.get('/api/portfolio/reporting/activity', params={'client_id': 'a'})
        self.assertEqual(denied.status_code, 403)

    async def test_capture_interruption_keeps_envelope_and_exact_event_for_retry(self):
        event = await self.source_event('capture-interrupted', held='recovering-command')
        self.assertEqual((await activity.reconcile_pending(server.db))['inserted'], 0)
        await server.db.risks.update_one({'risk_id': event['source_id']}, {'$unset': {'_r4_context_pending': ''}})
        failure = AsyncMock(side_effect=RuntimeError('Synthetic derived capture interruption'))
        with patch.object(reporting, 'capture_committed', failure):
            self.assertTrue(await activity.acknowledge_committed(server.db, 'risk', event['source_id'], 'a', event['event_id']))
        failure.assert_awaited_once()
        stored = await server.db.portfolio_events.find_one({'event_id': event['event_id']})
        source = await server.db.risks.find_one({'risk_id': event['source_id']})
        self.assertEqual(source['_portfolio_activity_pending'], {event['event_id']: event})
        await activity.reconcile_pending(server.db)
        await activity.reconcile_pending(server.db)
        self.assertEqual(await server.db.portfolio_events.count_documents({}), 1)
        self.assertEqual(await server.db.portfolio_events.find_one({'event_id': event['event_id']}), stored)
        saved = await server.db.risks.find_one({'risk_id': event['source_id']})
        self.assertNotIn('_portfolio_activity_pending', saved)
        self.assertEqual(saved['history'], source['history'])
        self.assertEqual(saved['_portfolio_activity_last_event_id'], event['event_id'])
