const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");

const { createApp } = require("../server/app");

function cleanupDb(databasePath) {
  [databasePath, databasePath + "-shm", databasePath + "-wal"].forEach(function (p) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

function makeClient(app) {
  const agent = request(app);
  const state = { sessionId: "", csrfToken: "" };
  function apply(req) {
    if (state.sessionId) req.set("x-session-id", state.sessionId);
    if (state.csrfToken) req.set("x-csrf-token", state.csrfToken);
    return req;
  }
  function capture(body) {
    if (body && body.sessionId) state.sessionId = body.sessionId;
    if (body && body.csrfToken) state.csrfToken = body.csrfToken;
  }
  return {
    state,
    async bootstrap() { const r = await agent.get("/api/auth/csrf-token"); capture(r.body); return r; },
    async get(url) { const r = await apply(agent.get(url)); capture(r.body); return r; },
    async post(url, body) { const r = await apply(agent.post(url).send(body || {})); capture(r.body); return r; },
  };
}

function buildContext() {
  const databasePath = path.join(os.tmpdir(), `synapse-enhancements-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  const context = createApp({
    config: {
      nodeEnv: "test",
      baseUrl: "http://localhost:3000",
      databasePath,
      sessionSecret: "test-secret",
      secureCookies: false,
      adminEmail: "admin@example.com",
      adminPassword: "adminpass1",
      adminUsername: "Admin Test",
    },
    mailer: { async sendVerificationEmail() {} },
  });
  return context;
}

async function login(client, email, password) {
  await client.bootstrap();
  return client.post("/api/auth/login", { email, password });
}

async function register(client, username, email, password) {
  await client.bootstrap();
  return client.post("/api/auth/register", { username, email, password, passwordConfirm: password, marketingOptIn: false });
}

describe("migliorie sito/admin/supporto", function () {
  let context;
  beforeEach(function () { context = buildContext(); });
  afterEach(function () { if (context) { context.close(); cleanupDb(context.config.databasePath); } });

  it("espone le nuove sezioni contenuto senza sovrascrivere quelle esistenti", async function () {
    const contentRes = await request(context.app).get("/api/content");
    expect(contentRes.status).toBe(200);
    expect(contentRes.body.content.websites.title).toMatch(/siti web/i);
    expect(contentRes.body.content.customServices.services.length).toBeTruthy();
    expect(contentRes.body.content.reviews.items.length).toBeTruthy();
  });

  it("permette all'admin di chiudere una chat come risolta", async function () {
    const user = makeClient(context.app);
    const admin = makeClient(context.app);
    await register(user, "Utente", "utente@example.com", "password1");
    await login(admin, "admin@example.com", "adminpass1");

    const ticketRes = await user.post("/api/tickets", { email: "utente@example.com", message: "Ho bisogno di supporto" });
    expect(ticketRes.status).toBe(201);

    const openRes = await admin.post(`/api/tickets/${ticketRes.body.ticket.id}/open-chat`, {});
    expect(openRes.status).toBe(200);
    expect(openRes.body.chat.username).toBe("Utente");

    const closeRes = await admin.post(`/api/chats/${openRes.body.chat.id}/close`, { reason: "resolved" });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.chat.status).toBe("closed");
    expect(closeRes.body.chat.closureReasonLabel).toBe("Risolto");
    expect(closeRes.body.ticket.status).toBe("closed");
  });

  it("protegge presenza live e creazione account admin", async function () {
    const user = makeClient(context.app);
    const admin = makeClient(context.app);
    await register(user, "Utente", "user2@example.com", "password1");
    const forbidden = await user.get("/api/presence");
    expect(forbidden.status).toBe(403);

    await login(admin, "admin@example.com", "adminpass1");
    const presence = await admin.get("/api/presence");
    expect(presence.status).toBe(200);

    const createAdmin = await admin.post("/api/admin/users/admin", {
      username: "Second Admin",
      email: "second.admin@example.com",
      password: "password2",
    });
    expect(createAdmin.status).toBe(201);
    expect(createAdmin.body.user.isAdmin).toBe(true);
  });
});
