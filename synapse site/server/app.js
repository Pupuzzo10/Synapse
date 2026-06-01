const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");

const { createConfig } = require("./config");
const { ensureDatabase } = require("./db");
const { createMailer } = require("./mail");
const { parseRegisterInput, parseLoginInput } = require("./validation/auth");
const { createSessionMiddleware, requireCsrf } = require("./session-store");
const adminOps = require("./admin-ops");
const { createBroadcaster } = require("./events");
const { createSupport } = require("./support");

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    marketingOptIn: Boolean(user.marketing_opt_in),
    emailVerified: Boolean(user.email_verified_at),
    emailVerifiedAt: user.email_verified_at,
    isAdmin: Boolean(user.is_admin),
    accountStatus: user.account_status || "active",
    accountStatusReason: user.account_status_reason || null,
    accountStatusUpdatedAt: user.account_status_updated_at || null,
    accountStatusUpdatedBy: user.account_status_updated_by || null,
    registerIp: user.register_ip || null,
    lastIp: user.last_ip || null,
    lastSeenAt: user.last_seen_at || null,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function buildRateLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      res.status(429).json({
        ok: false,
        message,
      });
    },
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeIp(value) {
  if (!value) return null;
  let ip = String(value).split(",")[0].trim();
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip.slice(0, 80);
}

function getClientIp(req) {
  return normalizeIp(req.ip || req.get("x-forwarded-for") || req.socket && req.socket.remoteAddress);
}

function isBlockedUser(user) {
  const status = user && user.account_status ? String(user.account_status) : "active";
  return status === "suspended" || status === "banned";
}

function blockInfoFromUser(user) {
  if (!isBlockedUser(user)) return null;
  const status = user.account_status === "banned" ? "banned" : "suspended";
  return {
    type: "account",
    status,
    title: status === "banned" ? "Account bannato" : "Account sospeso",
    message: user.account_status_reason || (status === "banned"
      ? "Il tuo account è stato bannato permanentemente. Non puoi più usare il sito."
      : "Il tuo account è stato sospeso. Non puoi usare il sito finché lo staff non lo riattiva."),
  };
}

function blockInfoFromIpBan(ipBan) {
  if (!ipBan) return null;
  return {
    type: "ip",
    status: "banned",
    title: "Accesso bloccato",
    message: ipBan.reason || "Questo indirizzo IP è stato bannato. Non puoi usare il sito.",
  };
}

function sendBlockedHtml(res, block) {
  const title = escapeHtml(block.title || "Accesso bloccato");
  const message = escapeHtml(block.message || "Non puoi usare questo sito.");
  res.status(403).send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top, #202020, #050505 65%); color: #f5f5f5; }
    .blocked-card { width: min(560px, 100%); border: 1px solid rgba(255,255,255,.14); background: rgba(15,15,15,.88); border-radius: 24px; padding: 2rem; box-shadow: 0 24px 80px rgba(0,0,0,.45); text-align: center; }
    .blocked-kicker { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: .45rem .8rem; color: #f2b8b5; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; font-size: .75rem; }
    h1 { margin: 1.2rem 0 .7rem; font-size: clamp(2rem, 7vw, 4rem); line-height: .95; }
    p { margin: 0; color: #cfcfcf; line-height: 1.65; }
    .blocked-note { margin-top: 1.2rem; font-size: .9rem; color: #8f8f8f; }
  </style>
</head>
<body>
  <main class="blocked-card" role="main" aria-live="polite">
    <div class="blocked-kicker">Accesso negato</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="blocked-note">Per contestare il provvedimento devi contattare lo staff tramite un canale esterno autorizzato.</p>
  </main>
</body>
</html>`);
}

function hashVerificationToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function logEmailEvent(event, details) {
  console.log("[auth][email]", event, details);
}

function createApp(overrides = {}) {
  const config = createConfig(overrides.config);
  const authDb = ensureDatabase(config.databasePath);
  const mailer = createMailer(config, overrides.mailer);
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: config.nodeEnv === "production" ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(config.sessionSecret));
  app.use(createSessionMiddleware(authDb, config));

  app.use(function requestModerationContext(req, res, next) {
    req.clientIp = getClientIp(req);
    req.ipBan = authDb.findActiveIpBan(req.clientIp);
    req.sessionUser = null;
    if (req.authSession && req.authSession.userId) {
      const user = authDb.findUserById(req.authSession.userId);
      req.sessionUser = user || null;
      if (user && req.clientIp) {
        try { authDb.updateUserIp(user.id, req.clientIp); } catch (_e) { /* non bloccante */ }
      }
    }
    next();
  });

  app.use("/api", function enforceModerationOnApi(req, res, next) {
    // Logout e CSRF restano disponibili per permettere al client di ripulire la sessione.
    if (req.path === "/auth/logout" || req.path === "/auth/csrf-token") return next();
    const accountBlock = blockInfoFromUser(req.sessionUser);
    const ipBlock = req.ipBan && !(req.sessionUser && req.sessionUser.is_admin) ? blockInfoFromIpBan(req.ipBan) : null;
    const block = accountBlock || ipBlock;
    if (block) return res.status(403).json({ ok: false, blocked: true, block, message: block.message });
    next();
  });

  const registerLimiter = buildRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: "Troppi tentativi di registrazione. Riprova tra qualche minuto.",
  });

  const loginLimiter = buildRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: "Troppi tentativi di accesso. Riprova tra qualche minuto.",
  });

  async function deliverVerificationEmail(user, verificationUrl) {
    logEmailEvent("attempt", {
      userId: user.id,
      email: user.email,
      mode: mailer.mode,
      verificationUrl,
    });

    try {
      const delivery = await mailer.sendVerificationEmail({
        to: user.email,
        username: user.username,
        verificationUrl,
      });

      authDb.createEmailDeliveryLog({
        userId: user.id,
        email: user.email,
        template: "verification",
        status: delivery.simulated ? "simulated" : "sent",
        transportMode: delivery.mode || "unknown",
        messageId: delivery.messageId,
        metadata: {
          accepted: delivery.accepted,
          rejected: delivery.rejected,
          response: delivery.response,
          simulated: delivery.simulated,
        },
      });

      logEmailEvent("success", {
        userId: user.id,
        email: user.email,
        mode: delivery.mode,
        messageId: delivery.messageId,
        simulated: delivery.simulated,
      });

      return delivery;
    } catch (error) {
      authDb.createEmailDeliveryLog({
        userId: user.id,
        email: user.email,
        template: "verification",
        status: "failed",
        transportMode: mailer.mode || "unknown",
        errorCode: error && error.code ? String(error.code) : null,
        errorMessage: error && error.message ? error.message : "Errore sconosciuto durante l'invio email.",
        metadata: {
          verificationUrl,
        },
      });

      logEmailEvent("failure", {
        userId: user.id,
        email: user.email,
        mode: mailer.mode,
        errorCode: error && error.code ? String(error.code) : null,
        errorMessage: error && error.message ? error.message : "Errore sconosciuto",
      });

      throw error;
    }
  }

  app.get("/api/auth/csrf-token", function (req, res) {
    res.json({
      ok: true,
      sessionId: req.authSession.id,
      csrfToken: req.authSession.csrfToken,
    });
  });

  app.get("/api/auth/session", function (req, res) {
    if (!req.authSession.userId) {
      return res.json({
        ok: true,
        authenticated: false,
        user: null,
      });
    }

    const user = authDb.findUserById(req.authSession.userId);
    if (!user) {
      req.destroySession();
      return res.json({
        ok: true,
        authenticated: false,
        user: null,
      });
    }

    return res.json({
      ok: true,
      authenticated: true,
      user: serializeUser(user),
    });
  });

  async function sendVerificationEmailSafe(user) {
    try {
      const rawToken = crypto.randomBytes(32).toString("hex");
      authDb.createEmailVerificationToken({
        userId: user.id,
        tokenHash: hashVerificationToken(rawToken),
        ttlMs: config.verificationTtlMs,
      });
      const verificationUrl =
        config.baseUrl + "/verify-email?token=" + encodeURIComponent(rawToken);
      await deliverVerificationEmail(user, verificationUrl);
    } catch (error) {
      console.warn("[auth] Invio email di verifica non riuscito (non bloccante):", error.message);
    }
  }

  app.post("/api/auth/register", requireCsrf, async function (req, res, next) {
    const parsed = parseRegisterInput(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: parsed.message,
        issues: parsed.issues,
      });
    }

    const { username, email, password, marketingOptIn } = parsed.data;

    try {
      const existingUser = authDb.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          ok: false,
          message: "Esiste gia un account registrato con questa email.",
        });
      }

      const linkedBlockedUsers = req.clientIp ? authDb.findUsersByIp(req.clientIp).filter(isBlockedUser) : [];
      if (linkedBlockedUsers.length) {
        return res.status(403).json({
          ok: false,
          blocked: true,
          message: "Questo indirizzo IP risulta collegato a un account sospeso o bannato. Registrazione bloccata.",
        });
      }

      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      const user = authDb.createUser({
        username,
        email,
        passwordHash,
        marketingOptIn,
        registerIp: req.clientIp,
      });

      // Invio email di verifica in background, non blocca la registrazione.
      sendVerificationEmailSafe(user);

      // Auto-login: ruoto la sessione e associo l'utente.
      const session = req.rotateSession(user.id);
      const freshUser = authDb.findUserById(user.id);

      return res.status(201).json({
        ok: true,
        message: "Account creato. Benvenuto, " + freshUser.username + "!",
        sessionId: session.id,
        csrfToken: session.csrfToken,
        user: serializeUser(freshUser),
      });
    } catch (error) {
      if (error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({
          ok: false,
          message: "Esiste gia un account registrato con questa email.",
        });
      }

      return next(error);
    }
  });

  app.post("/api/auth/login", requireCsrf, async function (req, res, next) {
    const parsed = parseLoginInput(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        message: parsed.message,
        issues: parsed.issues,
      });
    }

    const { email, password } = parsed.data;

    try {
      const user = authDb.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          ok: false,
          message: "Email o password non corretti.",
        });
      }

      const passwordMatches = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatches) {
        return res.status(401).json({
          ok: false,
          message: "Email o password non corretti.",
        });
      }

      if (isBlockedUser(user)) {
        const block = blockInfoFromUser(user);
        return res.status(403).json({ ok: false, blocked: true, block, message: block.message });
      }

      const session = req.rotateSession(user.id);
      const freshUser = authDb.findUserById(user.id);
      if (req.clientIp) authDb.updateUserIp(freshUser.id, req.clientIp);

      return res.json({
        ok: true,
        message: "Accesso effettuato con successo.",
        sessionId: session.id,
        csrfToken: session.csrfToken,
        user: serializeUser(freshUser),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/logout", requireCsrf, function (req, res) {
    const session = req.destroySession();
    res.json({
      ok: true,
      message: "Hai effettuato la disconnessione.",
      sessionId: session.id,
      csrfToken: session.csrfToken,
    });
  });

  // Contenuti sito: pubblici in lettura, admin in scrittura
  adminOps.seedContent(authDb);
  const broadcaster = createBroadcaster();
  const support = createSupport(authDb);

  app.get("/api/events", function (req, res) {
    const accountBlock = blockInfoFromUser(req.sessionUser);
    const ipBlock = req.ipBan && !(req.sessionUser && req.sessionUser.is_admin) ? blockInfoFromIpBan(req.ipBan) : null;
    if (accountBlock || ipBlock) return res.status(403).end();
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders && res.flushHeaders();
    res.write(": connected\n\n");
    const heartbeat = setInterval(function () {
      try { res.write(": ping\n\n"); } catch (_e) { /* ignore */ }
    }, 25000);
    let isAdminClient = false;
    let currentUser = null;
    if (req.authSession && req.authSession.userId) {
      currentUser = authDb.findUserById(req.authSession.userId);
      if (currentUser && currentUser.is_admin) isAdminClient = true;
    }
    const page = typeof req.query.page === "string" && req.query.page.trim() ? req.query.page.trim().slice(0, 120) : "Sito";
    broadcaster.addClient(res, req.authSession && req.authSession.userId, {
      sessionId: req.authSession && req.authSession.id,
      isAdmin: isAdminClient,
      username: currentUser && currentUser.username,
      email: currentUser && currentUser.email,
      ip: req.clientIp,
      page,
    });
    broadcaster.broadcast("staff:presence", { online: broadcaster.hasAdminOnline() });
    req.on("close", function () {
      clearInterval(heartbeat);
      broadcaster.broadcast("staff:presence", { online: broadcaster.hasAdminOnline() });
    });
  });

  app.get("/api/staff-presence", function (req, res) {
    res.json({ ok: true, online: broadcaster.hasAdminOnline() });
  });

  function enrichPresenceSnapshot(snapshot) {
    const byIp = {};
    (snapshot.clients || []).forEach(function (client) {
      if (!client.ip) return;
      byIp[client.ip] = (byIp[client.ip] || 0) + 1;
    });
    return Object.assign({}, snapshot, {
      clients: (snapshot.clients || []).map(function (client) {
        const linkedAccounts = client.ip ? authDb.findUsersByIp(client.ip).map(serializeUser) : [];
        return Object.assign({}, client, {
          ipSharedOnlineCount: client.ip ? (byIp[client.ip] || 0) : 0,
          linkedAccounts,
          ipBanned: !!(client.ip && authDb.findActiveIpBan(client.ip)),
        });
      }),
    });
  }

  function broadcastAdminPresence() {
    broadcaster.broadcast("presence", enrichPresenceSnapshot(broadcaster.presenceSnapshot()), { userIds: adminUserIds() });
  }

  app.get("/api/presence", requireAdmin, function (req, res) {
    res.json({ ok: true, presence: enrichPresenceSnapshot(broadcaster.presenceSnapshot()) });
  });

  app.post("/api/presence/ping", requireCsrf, function (req, res) {
    const page = req.body && typeof req.body.page === "string" ? req.body.page : "Sito";
    const lastEvent = req.body && typeof req.body.lastEvent === "string" ? req.body.lastEvent : "Navigazione";
    const client = broadcaster.updateClientBySessionId(req.authSession.id, { page, lastEvent });
    res.json({ ok: true, client });
  });

  function requireAuth(req, res, next) {
    if (!req.authSession.userId) {
      return res.status(401).json({ ok: false, message: "Devi effettuare l'accesso." });
    }
    const user = req.sessionUser || authDb.findUserById(req.authSession.userId);
    if (!user) return res.status(401).json({ ok: false, message: "Sessione non valida." });
    const block = blockInfoFromUser(user);
    if (block) return res.status(403).json({ ok: false, blocked: true, block, message: block.message });
    req.currentUser = user;
    next();
  }

  function requireAdmin(req, res, next) {
    requireAuth(req, res, function () {
      if (!req.currentUser.is_admin) {
        return res.status(403).json({ ok: false, message: "Accesso riservato agli amministratori." });
      }
      next();
    });
  }

  // Restituisce gli userId admin (per consegnare eventi privati)
  function adminUserIds() {
    return authDb.db.prepare("SELECT id FROM users WHERE is_admin = 1").all().map(function (r) { return r.id; });
  }

  app.get("/api/content", function (req, res) {
    res.json({ ok: true, content: adminOps.getContent(authDb) });
  });

  app.put("/api/content", requireCsrf, requireAdmin, function (req, res) {
    const body = req.body;
    if (!body || typeof body !== "object" || !body.content || typeof body.content !== "object") {
      return res.status(400).json({ ok: false, message: "Payload contenuto non valido." });
    }
    try {
      adminOps.saveContent(authDb, body.content);
      const next = adminOps.getContent(authDb);
      broadcaster.broadcast("content", next);
      return res.json({ ok: true, content: next });
    } catch (error) {
      return res.status(500).json({ ok: false, message: "Impossibile salvare i contenuti." });
    }
  });

  app.get("/api/status", function (req, res) {
    res.json({ ok: true, status: adminOps.getStatus(authDb) });
  });

  app.put("/api/status", requireCsrf, requireAdmin, function (req, res) {
    const body = req.body || {};
    const next = adminOps.saveStatus(authDb, body);
    broadcaster.broadcast("status", next);
    res.json({ ok: true, status: next });
  });

  // === SUPPORT TICKETS ===
  app.post("/api/tickets", requireCsrf, requireAuth, function (req, res) {
    const email = (req.body && typeof req.body.email === "string" ? req.body.email.trim() : "").toLowerCase();
    const message = req.body && typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: "Email non valida." });
    }
    if (!message) {
      return res.status(400).json({ ok: false, message: "Inserisci un messaggio." });
    }
    if (message.length > 10000) {
      return res.status(400).json({ ok: false, message: "Il messaggio supera i 10.000 caratteri." });
    }
    if (support.countActiveTicketsByUser(req.currentUser.id) >= 1) {
      return res.status(429).json({
        ok: false,
        message: "Hai già una richiesta di supporto aperta. Per evitare spam puoi aprirne una sola alla volta.",
      });
    }
    const ticket = support.createTicket({ userId: req.currentUser.id, email, message, ip: req.clientIp });
    broadcaster.broadcast("ticket:new", ticket, { userIds: adminUserIds() });
    broadcaster.broadcast("ticket:mine", ticket, { userIds: [req.currentUser.id] });
    res.status(201).json({ ok: true, ticket });
  });

  app.get("/api/tickets/mine", requireAuth, function (req, res) {
    res.json({ ok: true, tickets: support.listMyTickets(req.currentUser.id) });
  });

  app.get("/api/tickets", requireAdmin, function (req, res) {
    res.json({ ok: true, tickets: support.listAllTickets() });
  });

  app.get("/api/tickets/:id", requireAuth, function (req, res) {
    const ticket = support.getTicket(parseInt(req.params.id, 10));
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket inesistente." });
    if (!req.currentUser.is_admin && ticket.userId !== req.currentUser.id) {
      return res.status(403).json({ ok: false, message: "Non puoi vedere questo ticket." });
    }
    res.json({ ok: true, ticket });
  });

  app.post("/api/tickets/:id/decline", requireCsrf, requireAdmin, function (req, res) {
    const ticket = support.setTicketStatus(parseInt(req.params.id, 10), "declined");
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket inesistente." });
    broadcaster.broadcast("ticket:update", ticket, { userIds: adminUserIds().concat([ticket.userId]) });
    res.json({ ok: true, ticket });
  });

  app.post("/api/tickets/:id/approve", requireCsrf, requireAdmin, function (req, res) {
    const ticket = support.setTicketStatus(parseInt(req.params.id, 10), "approved");
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket inesistente." });
    broadcaster.broadcast("ticket:update", ticket, { userIds: adminUserIds().concat([ticket.userId]) });
    res.json({ ok: true, ticket });
  });

  app.post("/api/tickets/:id/reply", requireCsrf, requireAdmin, function (req, res) {
    const reply = req.body && typeof req.body.reply === "string" ? req.body.reply.trim() : "";
    if (!reply) return res.status(400).json({ ok: false, message: "Risposta vuota." });
    if (reply.length > 10000) return res.status(400).json({ ok: false, message: "Risposta troppo lunga." });
    const ticket = support.replyToTicket(parseInt(req.params.id, 10), reply);
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket inesistente." });
    broadcaster.broadcast("ticket:update", ticket, { userIds: adminUserIds().concat([ticket.userId]) });
    res.json({ ok: true, ticket });
  });

  app.post("/api/tickets/:id/open-chat", requireCsrf, requireAdmin, function (req, res) {
    try {
      const chat = support.openChatForTicket(parseInt(req.params.id, 10), req.currentUser.id);
      const ticket = support.getTicket(chat.ticketId);
      const audience = adminUserIds().concat([chat.userId]);
      broadcaster.broadcast("ticket:update", ticket, { userIds: audience });
      broadcaster.broadcast("chat:open", chat, { userIds: audience });
      res.json({ ok: true, chat, ticket });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });

  // === CHAT ===
  function loadChatOr403(req, res) {
    const chat = support.getChat(parseInt(req.params.id, 10));
    if (!chat) { res.status(404).json({ ok: false, message: "Chat inesistente." }); return null; }
    if (!req.currentUser.is_admin && chat.userId !== req.currentUser.id) {
      res.status(403).json({ ok: false, message: "Non hai accesso a questa chat." });
      return null;
    }
    return chat;
  }

  app.get("/api/chats/mine", requireAuth, function (req, res) {
    res.json({ ok: true, chats: support.listChatsByUser(req.currentUser.id) });
  });

  app.get("/api/chats", requireAdmin, function (req, res) {
    res.json({ ok: true, chats: support.listAllChats() });
  });

  app.get("/api/chats/:id", requireAuth, function (req, res) {
    const chat = loadChatOr403(req, res);
    if (!chat) return;
    res.json({ ok: true, chat, messages: support.listMessages(chat.id) });
  });

  app.post("/api/chats/:id/messages", requireCsrf, requireAuth, function (req, res) {
    const chat = loadChatOr403(req, res);
    if (!chat) return;
    if (chat.status === "closed") return res.status(400).json({ ok: false, message: "Chat chiusa." });
    if (chat.status === "suspended") return res.status(400).json({ ok: false, message: "Chat sospesa." });
    const senderRole = req.currentUser.is_admin ? "admin" : "user";
    if (senderRole === "user") {
      if (chat.status === "paused") return res.status(400).json({ ok: false, message: "Chat in attesa." });
      if (!chat.userCanSend) return res.status(403).json({ ok: false, message: "L'admin ha disabilitato l'invio." });
    }
    const content = req.body && typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!content) return res.status(400).json({ ok: false, message: "Messaggio vuoto." });
    if (content.length > 4000) return res.status(400).json({ ok: false, message: "Messaggio troppo lungo (max 4000)." });
    const msg = support.postMessage({
      chatId: chat.id,
      senderId: req.currentUser.id,
      senderRole,
      content,
    });
    broadcaster.broadcast("chat:message", { chatId: chat.id, message: msg }, { userIds: adminUserIds().concat([chat.userId]) });
    res.status(201).json({ ok: true, message: msg });
  });

  app.post("/api/chats/:id/status", requireCsrf, requireAdmin, function (req, res) {
    const status = req.body && typeof req.body.status === "string" ? req.body.status : "";
    try {
      const chat = support.setChatStatus(parseInt(req.params.id, 10), status);
      if (!chat) return res.status(404).json({ ok: false, message: "Chat inesistente." });
      broadcaster.broadcast("chat:update", chat, { userIds: adminUserIds().concat([chat.userId]) });
      res.json({ ok: true, chat });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post("/api/chats/:id/close", requireCsrf, requireAdmin, function (req, res) {
    const reason = req.body && typeof req.body.reason === "string" ? req.body.reason : "";
    try {
      const chat = support.closeChat(parseInt(req.params.id, 10), reason);
      if (!chat) return res.status(404).json({ ok: false, message: "Chat inesistente." });
      const ticket = chat.ticketId ? support.getTicket(chat.ticketId) : null;
      const audience = adminUserIds().concat([chat.userId]);
      broadcaster.broadcast("chat:update", chat, { userIds: audience });
      if (ticket) broadcaster.broadcast("ticket:update", ticket, { userIds: audience });
      res.json({ ok: true, chat, ticket });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post("/api/chats/:id/permissions", requireCsrf, requireAdmin, function (req, res) {
    const userCanSend = !!(req.body && req.body.userCanSend);
    const chat = support.setChatPermissions(parseInt(req.params.id, 10), userCanSend);
    if (!chat) return res.status(404).json({ ok: false, message: "Chat inesistente." });
    broadcaster.broadcast("chat:update", chat, { userIds: adminUserIds().concat([chat.userId]) });
    res.json({ ok: true, chat });
  });

  app.post("/api/admin/moderation/users/:id", requireCsrf, requireAdmin, function (req, res) {
    const targetId = parseInt(req.params.id, 10);
    const action = req.body && typeof req.body.action === "string" ? req.body.action : "";
    const reason = req.body && typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    const banIp = !(req.body && req.body.banIp === false);
    if (!targetId) return res.status(400).json({ ok: false, message: "Utente non valido." });
    if (targetId === req.currentUser.id && action !== "activate") {
      return res.status(400).json({ ok: false, message: "Non puoi sospendere o bannare il tuo stesso account." });
    }
    const target = authDb.findUserById(targetId);
    if (!target) return res.status(404).json({ ok: false, message: "Utente inesistente." });
    let status;
    if (action === "suspend") status = "suspended";
    else if (action === "ban") status = "banned";
    else if (action === "activate") status = "active";
    else return res.status(400).json({ ok: false, message: "Azione moderazione non valida." });
    try {
      const user = authDb.setUserModerationStatus(targetId, status, reason, req.currentUser.id);
      const ips = [];
      if (action === "ban" && banIp) {
        [target.last_ip, target.register_ip].forEach(function (ip) {
          if (ip && ips.indexOf(ip) === -1) {
            authDb.banIp(ip, reason || "Ban permanente account collegato", req.currentUser.id);
            ips.push(ip);
          }
        });
      }
      const block = status === "active" ? null : blockInfoFromUser(user);
      const serializedUser = serializeUser(user);
      broadcaster.broadcast("moderation:update", { user: serializedUser, block }, { userIds: [targetId] });
      if (ips.length) broadcaster.broadcast("moderation:update", { user: serializedUser, block }, { ips });
      broadcaster.broadcast("users:update", { user: serializedUser }, { userIds: adminUserIds() });
      broadcastAdminPresence();
      res.json({ ok: true, user: serializedUser, bannedIps: ips });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.post("/api/admin/moderation/ip", requireCsrf, requireAdmin, function (req, res) {
    const ip = normalizeIp(req.body && req.body.ip);
    const action = req.body && typeof req.body.action === "string" ? req.body.action : "";
    const reason = req.body && typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    if (!ip) return res.status(400).json({ ok: false, message: "IP non valido." });
    try {
      let ipBan = null;
      if (action === "ban") {
        ipBan = authDb.banIp(ip, reason || "IP bannato da pannello admin", req.currentUser.id);
        broadcaster.broadcast("moderation:update", { block: blockInfoFromIpBan(ipBan) }, { ips: [ip] });
      } else if (action === "lift") {
        authDb.liftIpBan(ip, req.currentUser.id);
        ipBan = null;
      } else {
        return res.status(400).json({ ok: false, message: "Azione IP non valida." });
      }
      broadcastAdminPresence();
      res.json({ ok: true, ip, ipBan });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });

  app.get("/api/admin/users", requireAdmin, function (req, res) {
    const users = authDb.db.prepare(`
      SELECT id, username, email, marketing_opt_in, email_verified_at, is_admin,
        account_status, account_status_reason, account_status_updated_at, account_status_updated_by,
        register_ip, last_ip, last_seen_at, created_at, updated_at
      FROM users
      ORDER BY is_admin DESC, created_at DESC
    `).all().map(serializeUser);
    res.json({ ok: true, users });
  });

  app.post("/api/admin/users/admin", requireCsrf, requireAdmin, async function (req, res, next) {
    const username = req.body && typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = req.body && typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body && typeof req.body.password === "string" ? req.body.password : "";
    if (username.length < 2 || username.length > 40) return res.status(400).json({ ok: false, message: "Nome utente admin non valido." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: "Email admin non valida." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ ok: false, message: "La password admin deve avere tra 8 e 72 caratteri." });
    try {
      if (authDb.findUserByEmail(email)) return res.status(409).json({ ok: false, message: "Esiste già un account con questa email." });
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      const user = authDb.createUser({ username, email, passwordHash, marketingOptIn: false });
      authDb.setUserAdmin(user.id, true);
      authDb.db.prepare("UPDATE users SET email_verified_at = @now, updated_at = @now WHERE id = @id").run({ id: user.id, now: authDb.nowIso() });
      const created = serializeUser(authDb.findUserById(user.id));
      broadcaster.broadcast("users:update", { user: created }, { userIds: adminUserIds() });
      res.status(201).json({ ok: true, user: created });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/verify-email", function (req, res) {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      return res.redirect("/?verified=missing");
    }

    const result = authDb.consumeEmailVerificationToken(hashVerificationToken(token));

    if (result.status === "verified") {
      return res.redirect("/?verified=success");
    }

    if (result.status === "expired") {
      return res.redirect("/?verified=expired");
    }

    return res.redirect("/?verified=invalid");
  });

  app.get("/", function (req, res) {
    const accountBlock = blockInfoFromUser(req.sessionUser);
    const ipBlock = req.ipBan && !(req.sessionUser && req.sessionUser.is_admin) ? blockInfoFromIpBan(req.ipBan) : null;
    const block = accountBlock || ipBlock;
    if (block) return sendBlockedHtml(res, block);
    res.sendFile(path.join(config.rootDir, "index.html"));
  });

  app.get("/styles.css", function (req, res) {
    res.sendFile(path.join(config.rootDir, "styles.css"));
  });

  app.get("/script.js", function (req, res) {
    res.sendFile(path.join(config.rootDir, "script.js"));
  });

  app.get("/brand-cat.png", function (req, res) {
    res.sendFile(path.join(config.rootDir, "brand-cat.png"));
  });

  app.use("/js", express.static(path.join(config.rootDir, "js"), { index: false }));

  app.use(function notFound(req, res) {
    res.status(404).json({
      ok: false,
      message: "Risorsa non trovata.",
    });
  });

  app.use(function errorHandler(error, req, res, next) {
    if (res.headersSent) {
      return next(error);
    }

    console.error("[auth] Errore interno:", error);
    return res.status(500).json({
      ok: false,
      message: "Si e verificato un errore interno. Riprova tra poco.",
    });
  });

  return {
    app,
    authDb,
    config,
    mailer,
    close() {
      authDb.db.close();
    },
  };
}

module.exports = {
  createApp,
  serializeUser,
};
