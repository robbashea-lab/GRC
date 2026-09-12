from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server
from review_occurrences import schedule


class OccurrenceTests(ClientDashboardSourcesTests):
    async def seed(self, recurrence="quarterly", due="2026-09-30"):
        await server.db.reviews.insert_one({"review_id":"bcp","client_id":"a","title":"Business Continuity / Disaster Recovery Review",
            "review_type":"bcp_dr","status":"upcoming","recurrence":recurrence,"due_date":due,"notes":"Original notes","owner_id":"member"})
        self.sign_in("member")
        return {"occurrence_id":"occ_bcp"}

    async def test_bia_end_to_end_with_history_and_live_remediation(self):
        action = await self.seed()
        started = await self.client.post("/api/reviews/bcp/start",json=action)
        self.assertEqual(started.status_code,200,started.text)
        self.assertEqual(started.json()["started_by"],"member")
        evidence = await self.client.post("/api/evidence",json={**action,"client_id":"a","linked_type":"review","linked_id":"bcp","filename":"BIA-check.txt","content_base64":"eA=="})
        self.assertEqual(evidence.status_code,200,evidence.text)
        comment = await self.client.post("/api/comments",json={**action,"entity_type":"reviews","entity_id":"bcp","body":"Waiting for IT"})
        self.assertEqual(comment.status_code,200,comment.text)
        finding = await self.client.post("/api/reviews/bcp/create-finding",json={**action,"title":"Business Impact Analysis has not been documented",
            "description":"No current Business Impact Analysis can be demonstrated","remediation_title":"Develop and approve Business Impact Analysis","severity":"high"})
        self.assertEqual(finding.status_code,200,finding.text)
        fid = finding.json()["finding_id"]
        tasks = (await self.client.get("/api/tasks?client_id=a")).json()
        self.assertEqual(len(tasks),1)
        task = tasks[0]
        self.assertEqual(task["occurrence_id"],"occ_bcp")
        self.assertEqual(task["finding_id"],fid)
        with patch.object(server,"_now",return_value="2026-10-08T12:00:00+00:00"):
            done = await self.client.post("/api/reviews/bcp/complete",json=action)
        self.assertEqual(done.status_code,200,done.text)
        active = done.json()["review"]
        self.assertEqual(active["review_id"],"bcp")
        self.assertEqual(active["due_date"][:10],"2026-12-31")
        self.assertEqual(active["status"],"upcoming")
        self.assertIsNone(active["notes"])
        history = (await self.client.get("/api/reviews/bcp/history")).json()
        self.assertEqual(len(history),1)
        self.assertEqual(history[0]["period"],"Q3 2026")
        self.assertEqual(history[0]["notes"],"Original notes")
        self.assertEqual(history[0]["finding_count"],1)
        self.assertEqual(history[0]["outcome"],"findings_raised")
        self.assertEqual(await server.db.reviews.count_documents({}),1)
        retry = await self.client.post("/api/reviews/bcp/complete",json=action)
        self.assertEqual(retry.status_code,200)
        self.assertEqual(len(retry.json()["review"]["occurrences"]),1)
        self.assertEqual((await self.client.post("/api/reviews/bcp/start",json=action)).status_code,409)
        self.assertEqual((await self.client.get("/api/evidence?linked_type=review&linked_id=bcp")).json(),[])
        self.assertEqual((await self.client.get("/api/comments?entity_type=reviews&entity_id=bcp")).json(),[])
        old_evidence = (await self.client.get("/api/evidence?linked_type=review&linked_id=bcp&occurrence_id=occ_bcp")).json()
        self.assertEqual(old_evidence[0]["evidence_id"],evidence.json()["evidence_id"])
        self.assertEqual(len((await self.client.get("/api/comments?entity_type=reviews&entity_id=bcp&occurrence_id=occ_bcp")).json()),1)
        changed = await self.client.patch("/api/tasks/"+task["task_id"],json={"status":"done","assignee_id":"member"})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertEqual(changed.json()["completed_by"],"member")
        self.assertTrue(changed.json()["completed_at"])
        self.assertEqual((await server.db.findings.find_one({"finding_id":fid}))["status"],"remediated")
        self.assertEqual((await self.client.post("/api/findings/"+fid+"/validate",json={"rationale":"BIA checked"})).status_code,403)
        self.sign_in("admin")
        validated = await self.client.post("/api/findings/"+fid+"/validate",json={"rationale":"Approved BIA checked"})
        self.assertEqual(validated.status_code,200,validated.text)
        self.assertEqual(validated.json()["closed_by"],"admin")
        linked = (await self.client.get("/api/related?entity_type=reviews&entity_id=bcp&occurrence_id=occ_bcp")).json()
        self.assertEqual(linked["findings"][0]["status"],"closed")
        self.assertEqual(linked["tasks"][0]["completed_by"],"member")
        events = (await self.client.get("/api/reviews/bcp/activity?occurrence_id=occ_bcp")).json()
        for event in ["Review started","Evidence uploaded","Finding raised","Action Item created","Review completed","Action Item completed","Finding validated and closed"]:
            self.assertIn(event,[e["action"] for e in events])
        self.assertEqual((await self.client.delete("/api/reviews/bcp")).status_code,409)
        self.assertEqual((await self.client.delete("/api/evidence/"+evidence.json()["evidence_id"])).status_code,409)

    async def test_configuration_permissions_and_tenant_isolation(self):
        action = await self.seed()
        for body in [{"title":"Other"},{"owner_id":"admin"},{"due_date":"2027-01-01"},{"recurrence":"monthly"}]:
            self.assertEqual((await self.client.patch("/api/reviews/bcp",json=body)).status_code,403)
        self.assertEqual((await self.client.patch("/api/reviews/bcp",json={"notes":"Allowed","expected_occurrence_id":"occ_bcp"})).status_code,200)
        await server.db.reviews.insert_one({"review_id":"other","client_id":"b","title":"Private"})
        for path in ["/api/reviews/other/history","/api/reviews/other/activity","/api/related?entity_type=reviews&entity_id=other","/api/evidence?linked_type=review&linked_id=other"]:
            self.assertEqual((await self.client.get(path)).status_code,403)
        self.assertEqual((await self.client.post("/api/reviews/other/start",json=action)).status_code,403)
        for role in ["super_admin","platform_admin"]:
            await server.db.users.update_one({"user_id":"admin"},{"$set":{"role":role}})
            self.sign_in("admin")
            for field in ["period","next_review_date","occurrences","current_occurrence_id"]:
                result = await self.client.patch("/api/reviews/bcp",json={field:"forged"})
                self.assertEqual(result.status_code,422,result.text)
            allowed = await self.client.patch("/api/reviews/bcp",json={"due_date":"2026-10-31","expected_occurrence_id":"occ_bcp"})
            self.assertEqual(allowed.status_code,200,allowed.text)
        self.assertEqual(allowed.json()["next_review_date"][:10],"2027-01-31")

    async def test_one_time_and_missing_schedule(self):
        action = await self.seed("none")
        done = await self.client.post("/api/reviews/bcp/complete",json=action)
        self.assertEqual(done.status_code,200,done.text)
        self.assertEqual(done.json()["review"]["status"],"completed")
        self.assertEqual(done.json()["occurrence"]["outcome"],"no_findings")
        self.assertEqual(len((await self.client.get("/api/reviews/bcp/history")).json()),1)
        await server.db.reviews.insert_one({"review_id":"missing","client_id":"a","title":"Unscheduled","status":"upcoming","recurrence":"annual"})
        self.assertEqual((await self.client.post("/api/reviews/missing/complete",json={"occurrence_id":"occ_missing"})).status_code,422)

    async def test_legacy_history_retained_without_fabrication(self):
        await self.seed()
        await server.db.reviews.insert_one({"review_id":"old","client_id":"a","title":"Old title","status":"completed","period":"Legacy period","notes":"Retain",
            "completion_date":"2025-09-30","completion_snapshot":{"by":"member"}})
        await server.db.reviews.update_one({"review_id":"bcp"},{"$set":{"parent_review_id":"old"}})
        h = (await self.client.get("/api/reviews/bcp/history")).json()
        self.assertEqual(len(h),1)
        self.assertEqual(h[0]["notes"],"Retain")
        self.assertTrue(h[0]["legacy"])

    def test_calendar_cadence_and_anchor(self):
        for recurrence, expected in [("monthly","2026-10-31"),("quarterly","2026-12-31"),("semiannual","2027-03-31"),("annual","2027-09-30")]:
            self.assertEqual(schedule({"due_date":"2026-09-30","recurrence":recurrence})["next_review_date"][:10],expected)
        r = {"due_date":"2026-01-30","recurrence":"monthly"}
        first = schedule(r)
        self.assertEqual(first["next_review_date"][:10],"2026-02-28")
        second = schedule({**r,**first,"due_date":first["next_review_date"]})
        self.assertEqual(second["next_review_date"][:10],"2026-03-30")
        self.assertIsNone(schedule({"due_date":"invalid","recurrence":"annual"})["next_review_date"])

    async def test_retries_serialization_and_leases(self):
        import asyncio
        from datetime import datetime, timezone, timedelta
        action = await self.seed()
        request = {**action,"request_id":"retry-bia","title":"BIA gap","remediation_title":"Develop BIA"}
        first = await self.client.post("/api/reviews/bcp/create-finding",json=request)
        second = await self.client.post("/api/reviews/bcp/create-finding",json=request)
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual(second.json()["finding_id"],first.json()["finding_id"])
        self.assertEqual(await server.db.tasks.count_documents({}),1)
        lock = {"token":"another-worker","until":(datetime.now(timezone.utc)+timedelta(seconds=90)).isoformat()}
        await server.db.reviews.update_one({"review_id":"bcp"},{"$set":{"_execution_lock":lock}})
        busy = await self.client.post("/api/reviews/bcp/complete",json=action)
        self.assertEqual(busy.status_code,409)
        await server.db.reviews.update_one({"review_id":"bcp"},{"$set":{"_execution_lock.until":"2000-01-01"}})
        results = await asyncio.gather(*[self.client.post("/api/reviews/bcp/complete",json=action) for _ in range(2)])
        self.assertIn(200,[r.status_code for r in results])
        self.assertTrue(all(r.status_code in (200,409) for r in results))
        review = await server.db.reviews.find_one({"review_id":"bcp"})
        self.assertEqual(len(review["occurrences"]),1)
        self.assertNotIn("_execution_lock",review)
        retry = await self.client.post("/api/reviews/bcp/create-finding",json=request)
        self.assertEqual(retry.status_code,200,retry.text)
        self.assertEqual(await server.db.findings.count_documents({}),1)

    async def test_calendar_and_dashboard_keep_one_current_obligation(self):
        action = await self.seed()
        done = await self.client.post("/api/reviews/bcp/complete",json=action)
        self.assertEqual(done.status_code,200,done.text)
        calendar = (await self.client.get("/api/calendar?client_id=a&start=2026-01-01&end=2027-01-01")).json()
        self.assertNotIn("2026-09-30",calendar["reviews"])
        self.assertEqual(len(calendar["reviews"]["2026-12-31"]),1)
        self.assertEqual(calendar["reviews"]["2026-12-31"][0]["current_occurrence_id"],done.json()["review"]["current_occurrence_id"])
        dashboard = await self.client.get("/api/dashboard?client_id=a")
        self.assertEqual(dashboard.status_code,200,dashboard.text)
