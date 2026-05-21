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

// Client di test che gestisce automaticamente sessionId + csrfToken via header,
// rispecchiando il comportamento del browser (sessionStorage per-tab).
function makeClient(app) {
  const agent = request(app);
  const state = { sessionId: "", csrfToken: "" };

  function applyState(headers) {
    if (state.sessionId) headers["x-session-id"] = state.sessionId;
    if (state.csrfToken) headers["x-csrf-token"] = state.csrfToken;
    return headers;
  }
  function captureFrom(body) {
    if (!body) return;
    if (body.sessionId) state.sessionId = body.sessionId;
    if (body.csrfToken) state.csrfToken = body.csrfToken;
  }

  return {
    state,
    async bootstrap() {
      const r = await agent.get("/api/auth/csrf-token");
      captureFrom(r.body);
      return r;
    },
    async get(path) {
      const req = agent.get(path);
      const headers = applyState({});
      Object.keys(headers).forEach(function (k) { req.set(k, headers[k]); });
      const r = await req;
      captureFrom(r.body);
      return r;
    },
    async post(path, body) {
      const req = agent.post(path).send(body || {});
      const headers = applyState({});
      Object.keys(headers).forEach(function (k) { req.set(k, headers[k]); });
      const r = await req;
      captureFrom(r.body);
      return r;
    },
  };
}

function buildContext(mailerOverride) {
  const sentEmails = [];
  const databasePath = path.join(
    os.tmpdir(),
    `synapse-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
  );

  const context = createApp({
    config: {
      nodeEnv: "test",
      baseUrl: "http://localhost:3000",
      databasePath,
      sessionSecret: "test-secret",
      secureCookies: false,
    },
    mailer: mailerOverride || {
      async sendVerificationEmail(payload) {
        sentEmails.push(payload);
      },
    },
  });

  context.sentEmails = sentEmails;
  context.client = makeClient(context.app);
  return context;
}

describe("flusso integrazione autenticazione", function () {
  let context;

  beforeEach(function () {
    context = buildContext();
  });

  afterEach(function () {
    if (context) {
      context.close();
      cleanupDb(context.config.databasePath);
    }
  });

  it("richiede un token csrf valido per la registrazione", async function () {
    // Niente bootstrap, niente CSRF.
    const response = await context.client.post("/api/auth/register", {
      username: "Synapse",
      email: "user@example.com",
      password: "qualsiasi",
      passwordConfirm: "qualsiasi",
      marketingOptIn: false,
    });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/sessione non valida/i);
  });

  it("registra, effettua auto-login, permette accesso a /session e logout", async function () {
    const csrf = await context.client.bootstrap();
    expect(csrf.body.sessionId).toBeTruthy();
    expect(csrf.body.csrfToken).toBeTruthy();

    const registerResponse = await context.client.post("/api/auth/register", {
      username: "Synapse User",
      email: "user@example.com",
      password: "ciao",
      passwordConfirm: "ciao",
      marketingOptIn: true,
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.ok).toBe(true);
    expect(registerResponse.body.user.email).toBe("user@example.com");
    expect(registerResponse.body.sessionId).toBeTruthy();
    expect(registerResponse.body.csrfToken).toBeTruthy();

    const sessionAfterRegister = await context.client.get("/api/auth/session");
    expect(sessionAfterRegister.body.authenticated).toBe(true);
    expect(sessionAfterRegister.body.user.email).toBe("user@example.com");

    const logoutResponse = await context.client.post("/api/auth/logout", {});
    expect(logoutResponse.status).toBe(200);

    const sessionAfterLogout = await context.client.get("/api/auth/session");
    expect(sessionAfterLogout.body.authenticated).toBe(false);

    await context.client.bootstrap();
    const loginResponse = await context.client.post("/api/auth/login", {
      email: "user@example.com",
      password: "ciao",
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe("user@example.com");
  });

  it("rifiuta password sbagliata", async function () {
    await context.client.bootstrap();

    await context.client.post("/api/auth/register", {
      username: "Synapse",
      email: "user@example.com",
      password: "ciao",
      passwordConfirm: "ciao",
      marketingOptIn: false,
    });

    await context.client.post("/api/auth/logout", {});
    await context.client.bootstrap();

    const loginResponse = await context.client.post("/api/auth/login", {
      email: "user@example.com",
      password: "sbagliata",
    });

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.body.message).toMatch(/email o password non corretti/i);
  });

  it("rifiuta registrazione con email gia' esistente", async function () {
    await context.client.bootstrap();

    const first = await context.client.post("/api/auth/register", {
      username: "Primo",
      email: "dup@example.com",
      password: "abc",
      passwordConfirm: "abc",
      marketingOptIn: false,
    });
    expect(first.status).toBe(201);

    const second = await context.client.post("/api/auth/register", {
      username: "Secondo",
      email: "dup@example.com",
      password: "xyz",
      passwordConfirm: "xyz",
      marketingOptIn: false,
    });

    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/gia/i);
  });

  it("schede indipendenti: due client con sessioni distinte", async function () {
    // Tab 1 si registra
    const tab1 = makeClient(context.app);
    await tab1.bootstrap();
    const reg = await tab1.post("/api/auth/register", {
      username: "Tab Uno",
      email: "tab1@example.com",
      password: "ciao",
      passwordConfirm: "ciao",
      marketingOptIn: false,
    });
    expect(reg.status).toBe(201);

    // Tab 2: non condivide nulla con Tab 1 (no cookie)
    const tab2 = makeClient(context.app);
    const session2 = await tab2.get("/api/auth/session");
    expect(session2.body.authenticated).toBe(false);

    // Tab 1 e' ancora autenticata
    const session1 = await tab1.get("/api/auth/session");
    expect(session1.body.authenticated).toBe(true);
    expect(session1.body.user.email).toBe("tab1@example.com");
  });
});

describe("invio email non bloccante", function () {
  let context;

  beforeEach(function () {
    context = buildContext({
      async sendVerificationEmail() {
        const error = new Error("SMTP authentication failed");
        error.code = "EAUTH";
        throw error;
      },
    });
  });

  afterEach(function () {
    if (context) {
      context.close();
      cleanupDb(context.config.databasePath);
    }
  });

  it("completa comunque la registrazione se l'email fallisce", async function () {
    await context.client.bootstrap();

    const registerResponse = await context.client.post("/api/auth/register", {
      username: "Mail Failure",
      email: "mail.failure@example.com",
      password: "pippo",
      passwordConfirm: "pippo",
      marketingOptIn: false,
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.ok).toBe(true);

    const user = context.authDb.findUserByEmail("mail.failure@example.com");
    expect(user).toBeTruthy();
  });
});
