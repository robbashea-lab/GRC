from test_client_dashboard_sources import ClientDashboardSourcesTests, server


class ReviewLifecycleTests(ClientDashboardSourcesTests):
    async def test_finding_action_recurrence_and_tenant_links(self):
        self.sign_in("member")
        await server.db.reviews.insert_many([
            {"review_id": "tabletop", "client_id": "a", "title": "Incident Response Tabletop Exercise", "review_type": "incident_response", "status": "in_progress", "recurrence": "annual", "due_date": "2026-09-08", "next_review_date": "2027-09-08", "notes": "Historical exercise results", "period": "2026"},
            {"review_id": "private", "client_id": "b", "title": "Private review"},
        ])
        result = await self.client.post("/api/reviews/tabletop/create-finding", json={"title": "Business Impact Analysis has not been documented", "remediation_title": "Develop and approve a Business Impact Analysis", "severity": "medium"})
        self.assertEqual(result.status_code, 200, result.text)
        finding = result.json()
        tasks = (await self.client.get("/api/tasks?client_id=a")).json()
        self.assertEqual(len(tasks), 1)
        task = tasks[0]
        self.assertEqual(task["finding_id"], finding["finding_id"])
        self.assertEqual(task["review_id"], "tabletop")
        self.assertEqual(task["title"], "Develop and approve a Business Impact Analysis")
        repeated = await self.client.post(f'/api/findings/{finding["finding_id"]}/create-task', json={})
        self.assertEqual(repeated.json()["task_id"], task["task_id"])
        completed = await self.client.post("/api/reviews/tabletop/complete", json={"spawn_next": True, "conclusion": "BIA gap identified", "tested_period": "2026", "tested_scope": "Incident response tabletop", "checklist_confirmed": True, "no_evidence_reason": "Facilitated interview recorded in conclusion"})
        self.assertEqual(completed.status_code, 200, completed.text)
        old, next_review = completed.json()["review"], completed.json()["spawned"]
        self.assertEqual(old["notes"], "Historical exercise results")
        self.assertEqual(next_review["due_date"][:10], "2027-09-08")
        for key in ("notes", "completion_date", "period"):
            self.assertFalse(next_review.get(key))
        related = (await self.client.get("/api/related?entity_type=reviews&entity_id=tabletop")).json()
        self.assertEqual(related["tasks"][0]["task_id"], task["task_id"])
        self.assertEqual(related["findings"][0]["finding_id"], finding["finding_id"])
        fresh = (await self.client.get(f'/api/related?entity_type=reviews&entity_id={next_review["review_id"]}')).json()
        self.assertEqual(fresh["findings"], [])
        await self.client.patch(f'/api/tasks/{task["task_id"]}', json={"status": "done"})
        current = await server.db.findings.find_one({"finding_id": finding["finding_id"]})
        self.assertEqual(current["status"], "remediated")
        self.sign_in("admin")
        validated = await self.client.post(f'/api/findings/{finding["finding_id"]}/validate', json={"rationale": "Approved BIA checked"})
        self.assertEqual(validated.status_code, 200, validated.text)
        self.sign_in("member")
        self.assertEqual((await server.db.findings.find_one({"finding_id": finding["finding_id"]}))["status"], "closed")
        denied = await self.client.get("/api/related?entity_type=reviews&entity_id=private")
        self.assertEqual(denied.status_code, 403)
        moved = await self.client.patch(f'/api/tasks/{task["task_id"]}', json={"client_id": "b"})
        self.assertEqual(moved.status_code, 422)
        cross_link = await self.client.patch(f'/api/tasks/{task["task_id"]}', json={"review_id": "private"})
        self.assertEqual(cross_link.status_code, 422)

    async def test_empty_finding_does_not_create_records(self):
        self.sign_in("member")
        await server.db.reviews.insert_one({"review_id": "r", "client_id": "a", "title": "Review"})
        result = await self.client.post("/api/reviews/r/create-finding", json={})
        self.assertEqual(result.status_code, 422)
        self.assertEqual(await server.db.findings.count_documents({}), 0)
        self.assertEqual(await server.db.tasks.count_documents({}), 0)
