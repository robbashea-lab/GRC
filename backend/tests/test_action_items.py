from test_client_dashboard_sources import ClientDashboardSourcesTests, server


class ActionItemTests(ClientDashboardSourcesTests):
    async def test_multiple_remediation_tasks_and_new_work_reset_validation(self):
        await server.db.findings.insert_one({"finding_id":"multi", "client_id":"a", "title":"Gap", "status":"open"})
        first = await self.task(source_type="finding", source_id="multi")
        self.assertEqual((await server.db.findings.find_one({"finding_id":"multi"}))["status"], "in_remediation")
        await self.client.patch('/api/tasks/'+first['task_id'], json={"status":"done"})
        self.assertEqual((await server.db.findings.find_one({"finding_id":"multi"}))["status"], "remediated")
        second = await self.task(source_type="finding", source_id="multi")
        third = await self.task(source_type="finding", source_id="multi")
        self.assertEqual((await server.db.findings.find_one({"finding_id":"multi"}))["status"], "in_remediation")
        await self.client.patch('/api/tasks/'+second['task_id'], json={"status":"done"})
        self.assertEqual((await server.db.findings.find_one({"finding_id":"multi"}))["status"], "in_remediation")
        self.sign_in('admin')
        self.assertEqual((await self.client.post('/api/findings/multi/validate',json={"rationale":"Checked"})).status_code,409)
        await self.client.patch('/api/tasks/'+third['task_id'], json={"status":"done"})
        closed = await self.client.post('/api/findings/multi/validate',json={"rationale":"All remediation verified"})
        self.assertEqual(closed.status_code,200,closed.text)
        self.assertEqual(closed.json()['status'],'closed')
        self.assertEqual(closed.json()['validated_by'],'admin')
        self.assertEqual(await server.db.tasks.count_documents({"finding_id":"multi"}),3)

    async def task(self, **fields):
        self.sign_in("member")
        response = await self.client.post("/api/tasks", json={"client_id":"a","title":"Disable stale Active Directory accounts","priority":"high","source_type":"audit",**fields})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    async def test_manual_lifecycle_evidence_history_and_task_activity(self):
        task = await self.task(assignee_id="member")
        tid = task["task_id"]
        self.assertEqual(task["status"],"open")
        self.assertEqual(task["source_type"],"audit")
        self.assertNotIn("completed_at",task)
        started = await self.client.patch("/api/tasks/"+tid,json={"status":"in_progress"})
        self.assertEqual(started.status_code,200,started.text)
        self.assertEqual(started.json()["started_by"],"member")
        ev = await self.client.post("/api/evidence",json={"client_id":"a","linked_type":"task","linked_id":tid,"filename":"accounts.txt","content_base64":"eA=="})
        self.assertEqual(ev.status_code,200,ev.text)
        await self.client.post("/api/comments",json={"entity_type":"tasks","entity_id":tid,"body":"IT confirmed removal"})
        completed = await self.client.patch("/api/tasks/"+tid,json={"status":"done"})
        self.assertEqual(completed.status_code,200,completed.text)
        self.assertEqual(completed.json()["completed_by"],"member")
        retry = await self.client.patch("/api/tasks/"+tid,json={"status":"done"})
        self.assertEqual(retry.json()["completed_at"],completed.json()["completed_at"])
        self.assertEqual(await server.db.tasks.count_documents({}),1)
        activity = await self.client.get("/api/tasks/"+tid+"/activity")
        self.assertEqual(activity.status_code,200)
        for event in ["Work started","Evidence uploaded","Action Item completed"]:
            self.assertIn(event,[a["action"] for a in activity.json()])
        self.assertEqual(len((await self.client.get("/api/comments",params={"entity_type":"tasks","entity_id":tid})).json()),1)
        self.assertEqual((await self.client.patch("/api/tasks/"+tid,json={"status":"open"})).status_code,409)
        self.sign_in("admin")
        self.assertEqual((await self.client.delete("/api/tasks/"+tid)).status_code,409)
        self.assertEqual((await self.client.post("/api/bulk",json={"kind":"tasks","ids":[tid],"action":"delete"})).status_code,409)
        self.assertEqual((await self.client.delete("/api/evidence/"+ev.json()["evidence_id"])).status_code,409)

    async def test_sources_owners_and_readers_are_tenant_scoped(self):
        self.sign_in("admin")
        await server.db.users.insert_one({"user_id":"private","email":"private@example.test","role":"client_contributor","client_ids":["b"],"status":"active"})
        await server.db.users.insert_one({"user_id":"reader","email":"reader@example.test","role":"client_viewer","client_ids":["a"],"status":"active"})
        for kind,key in [("reviews","review_id"),("findings","finding_id"),("risks","risk_id"),("vendors","vendor_id"),("policies","policy_id")]:
            await server.db[kind].insert_one({key:kind+"b","client_id":"b","title":"Private"})
            response=await self.client.post("/api/tasks",json={"title":"Cross-tenant","client_id":"a","source_type":kind[:-1] if kind!="policies" else "policy","source_id":kind+"b"})
            self.assertEqual(response.status_code,422,response.text)
        self.assertEqual((await self.client.post("/api/tasks",json={"title":"Wrong owner","client_id":"a","assignee_id":"private"})).status_code,422)
        task = await self.task()
        self.sign_in("reader")
        self.assertEqual((await self.client.get("/api/tasks/"+task["task_id"]+"/activity")).status_code,200)
        self.assertEqual((await self.client.patch("/api/tasks/"+task["task_id"],json={"status":"done"})).status_code,403)
        self.sign_in("private")
        for path in ["/api/tasks/"+task["task_id"]+"/activity","/api/related?entity_type=tasks&entity_id="+task["task_id"]]:
            self.assertEqual((await self.client.get(path)).status_code,403)

    async def test_sources_resolve_ids_and_preserve_historical_occurrence(self):
        await server.db.reviews.insert_one({"review_id":"r","client_id":"a","title":"Awareness","current_occurrence_id":"next","occurrences":[{"occurrence_id":"old","period":"Q3 2026","status":"completed"}]})
        await server.db.findings.insert_one({"finding_id":"f","client_id":"a","title":"HIPAA training missing","review_id":"r","occurrence_id":"old","status":"open"})
        t = await self.task(source_type="finding",source_id="f")
        self.assertEqual((t["review_id"],t["finding_id"],t["occurrence_id"]),("r","f","old"))
        self.assertEqual((await self.client.patch("/api/tasks/"+t["task_id"],json={"source_type":"manual"})).status_code,403)
        self.sign_in('admin')
        self.assertEqual((await self.client.patch("/api/tasks/"+t["task_id"],json={"source_type":"manual"})).status_code,422)
        self.sign_in('member')
        done=await self.client.patch("/api/tasks/"+t["task_id"],json={"status":"done"})
        self.assertEqual(done.status_code,200,done.text)
        self.assertEqual((await server.db.findings.find_one({"finding_id":"f"}))["status"],"remediated")
        related=(await self.client.get("/api/related?entity_type=tasks&entity_id="+t["task_id"])).json()
        self.assertEqual(related["reviews"][0]["linked_occurrence"]["period"],"Q3 2026")
        self.assertEqual(related["findings"][0]["status"],"remediated")

    async def test_overdue_action_kpi_counts_tasks_not_reviews_or_findings(self):
        self.sign_in("admin")
        for kind,key in [("reviews","review_id"),("findings","finding_id"),("tasks","task_id")]:
            await server.db[kind].insert_one({key:kind,"client_id":"a","title":kind,"status":"open","due_date":"2020-01-01"})
        kpis=(await self.client.get("/api/dashboard?client_id=a")).json()["kpis"]
        self.assertEqual(kpis["overdue_actions"],1)
        self.assertEqual(kpis["overdue_reviews"],1)

    async def test_no_evidence_required_and_no_fabricated_legacy_start(self):
        t=await self.task(source_type="manual")
        done=await self.client.patch("/api/tasks/"+t["task_id"],json={"status":"done"})
        self.assertEqual(done.status_code,200)
        self.assertNotIn("started_at",done.json())
        self.assertEqual((await self.client.post("/api/tasks",json={"title":"Already done","client_id":"a","status":"done"})).status_code,422)

    async def test_existing_assessment_source_and_legacy_unassignment(self):
        await server.db.assessments.insert_many([{"assessment_id":"aa","client_id":"a","name":"Readiness assessment"},{"assessment_id":"ab","client_id":"b","name":"Private assessment"}])
        task=await self.task(source_type="audit",source_id="aa")
        self.assertEqual(task["assessment_id"],"aa")
        related=(await self.client.get("/api/related?entity_type=tasks&entity_id="+task["task_id"])).json()
        self.assertEqual(related["assessments"][0]["name"],"Readiness assessment")
        self.assertEqual((await self.client.post("/api/tasks",json={"title":"Wrong assessment","client_id":"a","source_type":"audit","source_id":"ab"})).status_code,422)
        await server.db.tasks.insert_one({"task_id":"legacy","client_id":"a","title":"Legacy","owner_id":"member","status":"open"})
        changed=await self.client.patch("/api/tasks/legacy",json={"assignee_id":None})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertIsNone(changed.json().get("owner_id"))
        self.assertIsNone(changed.json().get("assignee_id"))
