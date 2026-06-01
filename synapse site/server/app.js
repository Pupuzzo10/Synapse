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
const { createOrders } = require("./orders");
const { answerSupportQuestion } = require("./ai-support");

const REVOLUT_PAYMENT_LINK = "https://revolut.me/angelo2tqp";

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
  let ip = String(value).trim();
  if (!ip) return null;
  // x-forwarded-for puo' contenere piu' IP separati da virgole: qui si normalizza un singolo candidato.
  ip = ip.replace(/^for=/i, "").replace(/^\"|\"$/g, "");
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") > -1 ? ip.indexOf("]") : undefined);
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  // Rimuove porta IPv4 accidentale, es. 1.2.3.4:12345.
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  return ip.slice(0, 80);
}

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "localhost") return true;
  if (/^(10|127)\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (/^(fc|fd|fe80):/i.test(ip)) return true;
  return false;
}

function headerCandidates(req) {
  const out = [];
  ["cf-connecting-ip", "true-client-ip", "x-real-ip", "fly-client-ip"].forEach(function (name) {
    const value = req.get(name);
    if (value) out.push(value);
  });
  const xff = req.get("x-forwarded-for");
  if (xff) String(xff).split(",").forEach(function (part) { out.push(part); });
  const forwarded = req.get("forwarded");
  if (forwarded) {
    String(forwarded).split(/[;,]/).forEach(function (part) {
      const m = part.match(/for=([^;]+)/i);
      if (m) out.push(m[1]);
    });
  }
  out.push(req.ip);
  if (req.socket && req.socket.remoteAddress) out.push(req.socket.remoteAddress);
  return out.map(normalizeIp).filter(Boolean);
}

function getClientIp(req) {
  const candidates = headerCandidates(req);
  if (!candidates.length) return null;
  // Su Render/proxy l'IP reale arriva dagli header. Preferiamo il primo IP pubblico.
  return candidates.find(function (ip) { return !isPrivateIp(ip); }) || candidates[0];
}

function isBlockedUser(user) {
  const status = user && user.account_status ? String(user.account_status) : "active";
  return status === "suspended" || status === "banned" || status === "closed";
}

function blockInfoFromUser(user) {
  if (!isBlockedUser(user)) return null;
  const raw = String(user.account_status || "active");
  const status = raw === "banned" ? "banned" : raw === "closed" ? "closed" : "suspended";
  return {
    type: "account",
    status,
    title: status === "banned" ? "Account bannato" : status === "closed" ? "Account chiuso" : "Account sospeso",
    forceLogout: status === "closed",
    message: user.account_status_reason || (status === "banned"
      ? "Il tuo account è stato bannato permanentemente. Non puoi più usare il sito."
      : status === "closed"
        ? "Il tuo account è stato chiuso dallo staff. Per motivi di sicurezza sei stato disconnesso."
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
    .blocked-card { width: min(620px, 100%); border: 1px solid rgba(255,255,255,.16); background: linear-gradient(180deg, rgba(18,18,18,.96), rgba(7,7,7,.96)); border-radius: 30px; padding: clamp(1.5rem, 4vw, 3rem); box-shadow: 0 30px 100px rgba(0,0,0,.55); text-align: center; }
    .blocked-icon { width: 5rem; height: 5rem; display: grid; place-items: center; margin: 0 auto 1.15rem; border-radius: 1.6rem; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); font-size: 2.4rem; }
    .blocked-kicker { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: .45rem .8rem; color: #f2b8b5; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: .75rem; }
    h1 { margin: 1.2rem 0 .7rem; font-size: clamp(2.25rem, 7vw, 4.8rem); line-height: .95; letter-spacing: -.05em; }
    p { margin: 0; color: #cfcfcf; line-height: 1.65; }
    .blocked-note { margin-top: 1.2rem; font-size: .9rem; color: #8f8f8f; }
  </style>
</head>
<body>
  <main class="blocked-card" role="main" aria-live="polite">
    <div class="blocked-icon" aria-hidden="true">${block.status === "closed" ? "✕" : "⚠"}</div>
    <div class="blocked-kicker">${block.status === "closed" ? "Account chiuso" : "Accesso negato"}</div>
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

  const ticketLimiter = buildRateLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 8,
    message: "Troppi ticket inviati. Riprova tra qualche minuto.",
  });

  const orderLimiter = buildRateLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 8,
    message: "Troppi ordini inviati. Riprova tra qualche minuto.",
  });

  const chatMessageLimiter = buildRateLimiter({
    windowMs: 60 * 1000,
    limit: 45,
    message: "Stai inviando troppi messaggi. Attendi qualche secondo.",
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

  app.post("/api/auth/register", registerLimiter, requireCsrf, async function (req, res, next) {
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

  app.post("/api/auth/login", loginLimiter, requireCsrf, async function (req, res, next) {
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
  const orders = createOrders(authDb);

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
      activeIpBans: authDb.listActiveIpBans ? authDb.listActiveIpBans() : [],
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

  function firstAdminId(preferredId) {
    const ids = adminUserIds();
    if (preferredId && ids.indexOf(preferredId) !== -1) return preferredId;
    return ids.length ? ids[0] : null;
  }

  function normalizeOrderText(value, max) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function rejectCardPayload(body) {
    body = body || {};
    return ["cardNumber", "cardCvv", "cardCvc", "cvv", "cvc", "expiry", "cardExpiry", "cardHolder", "paymentDetails"].some(function (key) {
      return Object.prototype.hasOwnProperty.call(body, key);
    });
  }

  function canReadOrder(user, order) {
    return !!(user && order && (user.is_admin || order.userId === user.id));
  }

  function orderAudience(order) {
    return adminUserIds().concat([order.userId]);
  }

  app.post("/api/orders", orderLimiter, requireCsrf, requireAuth, function (req, res) {
    if (rejectCardPayload(req.body)) {
      return res.status(400).json({ ok: false, message: "Synapse non acquisisce dati carta. Completa il pagamento solo tramite Revolut ufficiale." });
    }
    const customerName = normalizeOrderText(req.body && req.body.customerName, 120);
    const phone = normalizeOrderText(req.body && req.body.phone, 40);
    const discordUsername = normalizeOrderText(req.body && req.body.discordUsername, 80);
    const productCategory = normalizeOrderText(req.body && req.body.productCategory, 80) || "Prodotto Synapse";
    const productName = normalizeOrderText(req.body && req.body.productName, 160);
    const priceLabel = normalizeOrderText(req.body && req.body.priceLabel, 80) || "Da confermare";
    if (!/^\S+\s+\S+/.test(customerName)) {
      return res.status(400).json({ ok: false, message: "Inserisci nome e cognome." });
    }
    if (!phone || !/^[+()0-9\s.-]{6,40}$/.test(phone) || phone.replace(/\D/g, "").length < 6) {
      return res.status(400).json({ ok: false, message: "Inserisci un numero di telefono valido." });
    }
    if (!productName) {
      return res.status(400).json({ ok: false, message: "Prodotto non valido." });
    }
    const order = orders.createOrder({
      userId: req.currentUser.id,
      email: req.currentUser.email,
      customerName,
      phone,
      discordUsername,
      productCategory,
      productName,
      priceLabel,
      paymentMethod: "Revolut",
      paymentLink: REVOLUT_PAYMENT_LINK,
      ip: req.clientIp,
    });
    broadcaster.broadcast("order:new", order, { userIds: adminUserIds() });
    broadcaster.broadcast("order:update", order, { userIds: orderAudience(order) });
    res.status(201).json({ ok: true, order, paymentLink: REVOLUT_PAYMENT_LINK });
  });

  app.get("/api/orders/mine", requireAuth, function (req, res) {
    res.json({ ok: true, orders: orders.listMyOrders(req.currentUser.id) });
  });

  app.get("/api/orders", requireAdmin, function (req, res) {
    res.json({ ok: true, orders: orders.listAllOrders() });
  });

  app.get("/api/orders/:id", requireAuth, function (req, res) {
    const order = orders.getOrder(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ ok: false, message: "Ordine inesistente." });
    if (!canReadOrder(req.currentUser, order)) return res.status(403).json({ ok: false, message: "Non puoi vedere questo ordine." });
    res.json({ ok: true, order });
  });

  app.post("/api/orders/:id/confirm-payment", requireCsrf, requireAuth, function (req, res) {
    const existing = orders.getOrder(parseInt(req.params.id, 10));
    if (!existing) return res.status(404).json({ ok: false, message: "Ordine inesistente." });
    if (!canReadOrder(req.currentUser, existing)) return res.status(403).json({ ok: false, message: "Non puoi modificare questo ordine." });
    const order = orders.markPaymentConfirmed(existing.id);
    broadcaster.broadcast("order:update", order, { userIds: orderAudience(order) });
    res.json({ ok: true, order });
  });

  app.post("/api/orders/:id/details", requireCsrf, requireAuth, function (req, res) {
    const existing = orders.getOrder(parseInt(req.params.id, 10));
    if (!existing) return res.status(404).json({ ok: false, message: "Ordine inesistente." });
    if (!canReadOrder(req.currentUser, existing)) return res.status(403).json({ ok: false, message: "Non puoi modificare questo ordine." });
    const serviceDetails = normalizeOrderText(req.body && req.body.serviceDetails, 15000);
    if (serviceDetails.length < 40) {
      return res.status(400).json({ ok: false, message: "Descrivi il servizio richiesto in modo più completo." });
    }
    const order = orders.saveServiceDetails(existing.id, serviceDetails);
    broadcaster.broadcast("order:update", order, { userIds: orderAudience(order) });
    res.json({ ok: true, order });
  });

  function broadcastChatMessage(chat, msg) {
    if (!chat || !msg) return;
    const audience = adminUserIds().concat([chat.userId]);
    broadcaster.broadcast("chat:message", { chatId: chat.id, message: msg }, { userIds: audience });
  }

  function broadcastChatUpdate(chat) {
    if (!chat) return;
    const audience = adminUserIds().concat([chat.userId]);
    broadcaster.broadcast("chat:update", chat, { userIds: audience });
    if (chat.ticketId) {
      const ticket = support.getTicket(chat.ticketId);
      if (ticket) broadcaster.broadcast("ticket:update", ticket, { userIds: audience });
    }
  }

  function broadcastBotTyping(chat, isTyping) {
    if (!chat) return;
    broadcaster.broadcast("chat:typing", {
      chatId: chat.id,
      userId: 0,
      username: "Assistente AI",
      role: "bot",
      isTyping: !!isTyping,
      at: new Date().toISOString(),
    }, { userIds: adminUserIds().concat([chat.userId]) });
  }

  function postBotMessage(chatId, content) {
    const msg = support.postMessage({
      chatId,
      senderId: 0,
      senderRole: "bot",
      content,
    });
    const chat = support.getChat(chatId);
    broadcastChatMessage(chat, msg);
    if (chat) broadcastChatUpdate(chat);
    return { chat, msg };
  }

  async function runAiSupportReply(chatId, userMessage) {
    let chat = support.getChat(chatId);
    if (!chat || chat.status === "closed" || chat.status === "suspended" || !chat.aiEnabled || chat.needsAdmin) return;
    broadcastBotTyping(chat, true);
    try {
      const history = support.listMessages(chat.id);
      const ai = await answerSupportQuestion({
        apiKey: config.ai && config.ai.anthropicApiKey,
        model: config.ai && config.ai.anthropicModel,
        message: userMessage,
        history,
        content: adminOps.getContent(authDb),
        status: adminOps.getStatus(authDb),
      });
      if (ai.escalate) {
        chat = support.markChatNeedsAdmin(chat.id, true) || chat;
        broadcastChatUpdate(chat);
      }
      postBotMessage(chat.id, ai.text || "Ho chiamato un admin. Uno staffer continuerà la richiesta appena possibile.");
    } catch (error) {
      chat = support.markChatNeedsAdmin(chat.id, true) || chat;
      broadcastChatUpdate(chat);
      postBotMessage(chat.id, "In questo momento l'assistente AI non riesce a completare la richiesta. Ho chiamato un admin per continuare il supporto.");
    } finally {
      broadcastBotTyping(support.getChat(chatId) || chat, false);
    }
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
  app.post("/api/tickets", ticketLimiter, requireCsrf, requireAuth, function (req, res) {
    const email = (req.body && typeof req.body.email === "string" ? req.body.email.trim() : "").toLowerCase();
    const message = req.body && typeof req.body.message === "string" ? req.body.message.trim() : "";
    const subject = req.body && typeof req.body.subject === "string" ? req.body.subject.trim().slice(0, 160) : "";
    const category = req.body && typeof req.body.category === "string" ? req.body.category.trim().slice(0, 80) : "";
    const productName = req.body && typeof req.body.productName === "string" ? req.body.productName.trim().slice(0, 160) : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: "Email non valida." });
    }
    if (!message) {
      return res.status(400).json({ ok: false, message: "Descrivi la richiesta nel ticket." });
    }
    if (message.length > 10000) {
      return res.status(400).json({ ok: false, message: "Il messaggio supera i 10.000 caratteri." });
    }
    if (support.countActiveTicketsByUser(req.currentUser.id) >= 1) {
      return res.status(429).json({
        ok: false,
        message: "Hai già un ticket aperto. Puoi continuare dalla chat attiva oppure attendere la chiusura del ticket corrente.",
      });
    }
    const ticket = support.createTicket({
      userId: req.currentUser.id,
      email,
      message,
      subject: subject || (productName ? "Informazioni su " + productName : "Ticket supporto"),
      category: category || null,
      productName: productName || null,
      ip: req.clientIp,
    });
    let chat = null;
    let initialUserMessage = null;
    let initialBotMessage = null;
    const adminId = firstAdminId();
    if (adminId) {
      chat = support.openChatForTicket(ticket.id, adminId);
      initialUserMessage = support.postMessage({
        chatId: chat.id,
        senderId: req.currentUser.id,
        senderRole: "user",
        content: message,
      });
      initialBotMessage = support.postMessage({
        chatId: chat.id,
        senderId: 0,
        senderRole: "bot",
        content: "Ciao, sono l'assistente AI Synapse. Posso aiutarti solo su servizi, prezzi, ticket, rimborsi, privacy e prodotti del sito. Se vuoi parlare con un umano, scrivi: voglio parlare con un umano.",
      });
      chat = support.getChat(chat.id);
    }
    const finalTicket = chat ? support.getTicket(ticket.id) : ticket;
    const audience = adminUserIds().concat([req.currentUser.id]);
    broadcaster.broadcast("ticket:new", finalTicket, { userIds: adminUserIds() });
    broadcaster.broadcast("ticket:mine", finalTicket, { userIds: [req.currentUser.id] });
    if (chat) {
      broadcaster.broadcast("ticket:update", finalTicket, { userIds: audience });
      broadcaster.broadcast("chat:open", chat, { userIds: audience });
      if (initialUserMessage) broadcaster.broadcast("chat:message", { chatId: chat.id, message: initialUserMessage }, { userIds: audience });
      if (initialBotMessage) broadcaster.broadcast("chat:message", { chatId: chat.id, message: initialBotMessage }, { userIds: audience });
      setImmediate(function () { runAiSupportReply(chat.id, message).catch(function (error) { console.error("[ai-support]", error); }); });
    }
    res.status(201).json({ ok: true, ticket: finalTicket, chat });
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

  app.post("/api/chats/:id/messages", chatMessageLimiter, requireCsrf, requireAuth, function (req, res) {
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
    if (senderRole === "admin") {
      support.disableAiForChat(chat.id);
    }
    const msg = support.postMessage({
      chatId: chat.id,
      senderId: req.currentUser.id,
      senderRole,
      content,
    });
    const updatedChat = support.getChat(chat.id);
    const audience = adminUserIds().concat([chat.userId]);
    broadcaster.broadcast("chat:message", { chatId: chat.id, message: msg }, { userIds: audience });
    if (updatedChat) broadcaster.broadcast("chat:update", updatedChat, { userIds: audience });
    res.status(201).json({ ok: true, message: msg, chat: updatedChat });
    if (senderRole === "user" && updatedChat && updatedChat.aiEnabled && !updatedChat.needsAdmin) {
      setImmediate(function () { runAiSupportReply(chat.id, content).catch(function (error) { console.error("[ai-support]", error); }); });
    }
  });

  app.post("/api/chats/:id/typing", requireCsrf, requireAuth, function (req, res) {
    const chat = loadChatOr403(req, res);
    if (!chat) return;
    if (chat.status === "closed" || chat.status === "suspended") return res.json({ ok: true, ignored: true });
    const senderRole = req.currentUser.is_admin ? "admin" : "user";
    const payload = {
      chatId: chat.id,
      userId: req.currentUser.id,
      username: req.currentUser.username || req.currentUser.email || "Utente",
      role: senderRole,
      isTyping: !!(req.body && req.body.isTyping),
      at: new Date().toISOString(),
    };
    broadcaster.broadcast("chat:typing", payload, { userIds: adminUserIds().concat([chat.userId]) });
    res.json({ ok: true });
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
    const liftIp = !!(req.body && req.body.liftIp);
    if (!targetId) return res.status(400).json({ ok: false, message: "Utente non valido." });
    if (targetId === req.currentUser.id && action !== "activate") {
      return res.status(400).json({ ok: false, message: "Non puoi sospendere o bannare il tuo stesso account." });
    }
    const target = authDb.findUserById(targetId);
    if (!target) return res.status(404).json({ ok: false, message: "Utente inesistente." });
    let status;
    if (action === "suspend") status = "suspended";
    else if (action === "ban") status = "banned";
    else if (action === "close") status = "closed";
    else if (action === "activate") status = "active";
    else return res.status(400).json({ ok: false, message: "Azione moderazione non valida." });
    try {
      const user = authDb.setUserModerationStatus(targetId, status, reason, req.currentUser.id);
      const killedSessions = action === "close" && authDb.deleteSessionsByUserId ? authDb.deleteSessionsByUserId(targetId) : 0;
      const ips = [];
      if ((action === "ban") && banIp) {
        [target.last_ip, target.register_ip].forEach(function (ip) {
          if (ip && ips.indexOf(ip) === -1) {
            authDb.banIp(ip, reason || "Ban permanente account collegato", req.currentUser.id);
            ips.push(ip);
          }
        });
      }
      if (action === "activate" && liftIp) {
        [target.last_ip, target.register_ip].forEach(function (ip) {
          if (ip && ips.indexOf(ip) === -1) {
            authDb.liftIpBan(ip, req.currentUser.id);
            ips.push(ip);
          }
        });
      }
      const block = status === "active" ? null : blockInfoFromUser(user);
      const serializedUser = serializeUser(user);
      broadcaster.broadcast("moderation:update", { user: serializedUser, block, forceLogout: action === "close", killedSessions }, { userIds: [targetId] });
      if (ips.length) broadcaster.broadcast("moderation:update", { user: serializedUser, block }, { ips });
      broadcaster.broadcast("users:update", { user: serializedUser }, { userIds: adminUserIds() });
      broadcaster.broadcast("moderation:list-update", { user: serializedUser, ips }, { userIds: adminUserIds() });
      broadcastAdminPresence();
      res.json({ ok: true, user: serializedUser, affectedIps: ips, killedSessions });
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
        broadcaster.broadcast("moderation:update", { block: null, ip }, { ips: [ip] });
      } else {
        return res.status(400).json({ ok: false, message: "Azione IP non valida." });
      }
      broadcaster.broadcast("moderation:list-update", { ip, ipBan }, { userIds: adminUserIds() });
      broadcastAdminPresence();
      res.json({ ok: true, ip, ipBan });
    } catch (error) {
      res.status(400).json({ ok: false, message: error.message });
    }
  });



  app.post("/api/admin/moderation/unban-all", requireCsrf, requireAdmin, function (req, res) {
    const now = authDb.nowIso();
    const tx = authDb.db.transaction(function () {
      const users = authDb.db.prepare("UPDATE users SET account_status = 'active', account_status_reason = NULL, account_status_updated_at = @now, account_status_updated_by = @admin, updated_at = @now WHERE COALESCE(account_status, 'active') IN ('suspended', 'banned')").run({ now, admin: req.currentUser.id });
      let ips = { changes: 0 };
      try {
        ips = authDb.db.prepare("UPDATE ip_bans SET active = 0, lifted_at = @now, lifted_by = @admin, updated_at = @now WHERE active = 1").run({ now, admin: req.currentUser.id });
      } catch (_e) { /* tabella assente su DB molto vecchi */ }
      return { users: users.changes || 0, ips: ips.changes || 0 };
    });
    const result = tx();
    broadcaster.broadcast("users:update", { bulk: true, action: "unban-all", result }, { userIds: adminUserIds() });
    broadcaster.broadcast("moderation:list-update", { bulk: true, action: "unban-all", result }, { userIds: adminUserIds() });
    broadcastAdminPresence();
    res.json({ ok: true, result });
  });

  app.get("/api/admin/moderation/ip-bans", requireAdmin, function (req, res) {
    res.json({ ok: true, bans: authDb.listActiveIpBans ? authDb.listActiveIpBans() : [] });
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
