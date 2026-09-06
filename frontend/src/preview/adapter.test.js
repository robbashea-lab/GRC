import axios from "axios";
import { previewAdapter } from "./adapter";
import { loadClientDashboard } from "../lib/loadClientDashboard";

const api = axios.create({ adapter: previewAdapter });
beforeEach(() => localStorage.clear());

test("explicit click enters without credentials, refresh persists, logout closes entry", async () => {
  await expect(api.get("/auth/me")).rejects.toMatchObject({ response: { status: 401 } });
  localStorage.setItem("grc_token", "stale-real-session");
  const { data } = await api.post("/auth/login", {});
  expect(data.user.role).toBe("super_admin");
  expect(data.access_token).toBeUndefined();
  expect(localStorage.getItem("grc_token")).toBeNull();
  const reloaded = axios.create({ adapter: previewAdapter });
  expect((await reloaded.get("/auth/me")).data.user_id).toBe(data.user.user_id);
  await api.post("/auth/logout");
  await expect(api.get("/clients")).rejects.toMatchObject({ response: { status: 401 } });
  await api.post("/auth/login");
  expect((await api.get("/clients")).data.length).toBeGreaterThan(0);
});

test("portfolio and every sample client load through the real dashboard loader", async () => {
  const { data: { user } } = await api.post("/auth/login");
  const { data: directory } = await api.get("/clients/directory", { params: { include_archived: "false" } });
  expect(directory.clients.length).toBe(2);
  expect(directory.portfolio).toBeTruthy();
  expect(Array.isArray(directory.attention_queue)).toBe(true);
  for (const client of (await api.get("/clients")).data) {
    const result = await loadClientDashboard(api, { clientId: client.client_id, user, scope: { kind: "org" } });
    expect(Array.isArray(result.attention)).toBe(true);
    expect(result.members.length).toBeGreaterThan(0);
    const rows = (await api.get("/tasks", { params: { client_id: client.client_id } })).data;
    expect(rows.every(row => row.client_id === client.client_id)).toBe(true);
  }
});

test("unknown client is rejected and writes never pretend to save", async () => {
  await api.post("/auth/login");
  await expect(api.get("/dashboard", { params: { client_id: "missing", scope: "org" } }))
    .rejects.toMatchObject({ response: { status: 404 } });
  await expect(api.post("/clients", { name: "Not saved" }))
    .rejects.toMatchObject({ response: { status: 405 } });
});
