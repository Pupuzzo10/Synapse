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

      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      const user = authDb.createUser({
        username,
        email,
        passwordHash,
        marketingOptIn,
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

      const session = req.rotateSession(user.id);
      const freshUser = authDb.findUserById(user.id);

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
    if (req.authSession && req.authSession.userId) {
      const u = authDb.findUserById(req.authSession.userId);
      if (u && u.is_admin) isAdminClient = true;
    }
    broadcaster.addClient(res, req.authSession && req.authSession.userId, { isAdmin: isAdminClient });
    // Notifica presenza staff
    if (isAdminClient) {
      broadcaster.broadcast("staff:presence", { online: true });
    } else {
      // Manda al singolo client appena connesso lo stato attuale come messaggio "comment" non e' utile,
      // useremo l'endpoint REST per il primo valore.
    }
    req.on("close", function () {
      clearInterval(heartbeat);
      if (isAdminClient && !broadcaster.hasAdminOnline()) {
        broadcaster.broadcast("staff:presence", { online: false });
      }
    });
  });

  app.get("/api/staff-presence", function (req, res) {
    res.json({ ok: true, online: broadcaster.hasAdminOnline() });
  });

  function requireAuth(req, res, next) {
    if (!req.authSession.userId) {
      return res.status(401).json({ ok: false, message: "Devi effettuare l'accesso." });
    }
    const user = authDb.findUserById(req.authSession.userId);
    if (!user) return res.status(401).json({ ok: false, message: "Sessione non valida." });
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
    const ticket = support.createTicket({ userId: req.currentUser.id, email, message });
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

  app.post("/api/chats/:id/permissions", requireCsrf, requireAdmin, function (req, res) {
    const userCanSend = !!(req.body && req.body.userCanSend);
    const chat = support.setChatPermissions(parseInt(req.params.id, 10), userCanSend);
    if (!chat) return res.status(404).json({ ok: false, message: "Chat inesistente." });
    broadcaster.broadcast("chat:update", chat, { userIds: adminUserIds().concat([chat.userId]) });
    res.json({ ok: true, chat });
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
