from test_client_dashboard_sources import ClientDashboardSourcesTests, server


class WorkflowIntegrityTests(ClientDashboardSourcesTests):
    async def _finding_with_task(self):
        self.sign_in("member")
        await server.db.reviews.insert_one({"review_id": "rev", "client_id": "a", "title": "Access Review", "owner_id": "member",
                                            "status": "in_progress", "recurrence": "quarterly", "due_date": "2026-09-30"})
        finding = (await self.client.post("/api/reviews/rev/create-finding", json={
            "title": "Stale access", "remediation_title": "Remove stale access", "occurrence_id": "occ_rev", "request_id": "wf-1"})).json()
        task = (await self.client.get("/api/tasks?client_id=a")).json()[0]
        return finding, task

    async def _actions(self, entity_type, entity_id):
        rows = await server.db.audit_logs.find({"entity_type": entity_type, "entity_id": entity_id}).to_list(100)
        return [r["action"] for r in rows]

    async def test_finding_history_records_its_own_remediation_transitions(self):
        finding, task = await self._finding_with_task()
        self.assertEqual(finding["status"], "in_remediation")
        self.assertIn("Finding moved to In Remediation", await self._actions("finding", finding["finding_id"]))
        await self.client.patch(f'/api/tasks/{task["task_id"]}', json={"status": "done"})
        self.assertEqual((await server.db.findings.find_one({"finding_id": finding["finding_id"]}))["status"], "remediated")
        finding_events = await self._actions("finding", finding["finding_id"])
        self.assertIn("Finding moved to Pending Validation", finding_events)
        # The Action Item keeps its existing event too.
        self.assertIn("Related Finding moved to Pending Validation", await self._actions("task", task["task_id"]))

    async def test_deleting_the_only_open_action_returns_finding_to_open(self):
        finding, task = await self._finding_with_task()
        self.sign_in("admin")
        deleted = await self.client.delete(f'/api/tasks/{task["task_id"]}')
        self.assertEqual(deleted.status_code, 200, deleted.text)
        current = await server.db.findings.find_one({"finding_id": finding["finding_id"]})
        self.assertEqual(current["status"], "open")
        self.assertIn("Finding returned to Open; its remediation Action Item was deleted", await self._actions("finding", finding["finding_id"]))

    async def test_deleting_one_of_several_actions_follows_the_remaining_work(self):
        finding, task = await self._finding_with_task()
        self.sign_in("admin")
        await server.db.tasks.insert_one({"task_id": "tsk_done", "client_id": "a", "finding_id": finding["finding_id"], "status": "done", "title": "Earlier fix"})
        deleted = await self.client.delete(f'/api/tasks/{task["task_id"]}')
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual((await server.db.findings.find_one({"finding_id": finding["finding_id"]}))["status"], "remediated")

    async def test_closed_findings_are_not_reopened_by_task_deletion(self):
        finding, task = await self._finding_with_task()
        await server.db.findings.update_one({"finding_id": finding["finding_id"]}, {"$set": {"status": "accepted"}})
        self.sign_in("admin")
        await self.client.delete(f'/api/tasks/{task["task_id"]}')
        self.assertEqual((await server.db.findings.find_one({"finding_id": finding["finding_id"]}))["status"], "accepted")

    async def test_late_completion_keeps_the_scheduled_cycle(self):
        self.sign_in("member")
        for rid, recurrence, due, expected in (("q", "quarterly", "2026-03-31", "2026-06-30"), ("y", "annual", "2026-09-01", "2027-09-01"),
                                               ("m", "monthly", "2026-12-31", "2027-01-31")):
            await server.db.reviews.insert_one({"review_id": rid, "client_id": "a", "title": rid, "owner_id": "member",
                                                "status": "in_progress", "recurrence": recurrence, "due_date": due})
            done = await self.client.post(f"/api/reviews/{rid}/complete", json={"occurrence_id": "occ_" + rid})
            self.assertEqual(done.status_code, 200, done.text)
            self.assertEqual(done.json()["review"]["due_date"][:10], expected)
            self.assertEqual(done.json()["occurrence"]["due_date"][:10], due)

    async def test_policy_review_findings_are_visible_from_the_policy(self):
        self.sign_in("member")
        await server.db.policies.insert_one({"policy_id": "pol", "client_id": "a", "title": "Access Policy", "status": "approved"})
        await server.db.reviews.insert_one({"review_id": "prev", "client_id": "a", "title": "Access Policy Review", "owner_id": "member",
                                            "policy_id": "pol", "status": "in_progress", "recurrence": "annual", "due_date": "2026-11-01"})
        finding = (await self.client.post("/api/reviews/prev/create-finding", json={
            "title": "Policy outdated", "remediation_title": "Update policy", "occurrence_id": "occ_prev", "request_id": "pol-1"})).json()
        related = (await self.client.get("/api/related?entity_type=policies&entity_id=pol")).json()
        self.assertIn(finding["finding_id"], [f["finding_id"] for f in related["findings"]])
        self.assertEqual(len([t for t in related["tasks"] if t["finding_id"] == finding["finding_id"]]), 1)
        other = (await self.client.get("/api/related?entity_type=policies&entity_id=pol")).json()
        self.assertEqual(len(other["findings"]), len({f["finding_id"] for f in other["findings"]}))

    async def test_calendar_marks_findings_represented_by_an_active_action(self):
        self.sign_in("admin")
        await server.db.findings.insert_many([
            {"finding_id": "f1", "client_id": "a", "title": "F1", "status": "in_remediation", "due_date": "2026-10-05"},
            {"finding_id": "f2", "client_id": "a", "title": "F2", "status": "remediated", "due_date": "2026-10-06"}])
        await server.db.tasks.insert_many([
            {"task_id": "t1", "client_id": "a", "finding_id": "f1", "title": "T1", "status": "open", "due_date": "2027-03-01"},
            {"task_id": "t2", "client_id": "a", "finding_id": "f2", "title": "T2", "status": "done", "due_date": "2026-10-01"}])
        calendar = (await self.client.get("/api/calendar", params={"client_id": "a", "start": "2026-10-01", "end": "2026-10-31", "scope": "active"})).json()
        self.assertTrue(calendar["findings"]["2026-10-05"][0]["represented"])
        self.assertFalse(calendar["findings"]["2026-10-06"][0]["represented"])
