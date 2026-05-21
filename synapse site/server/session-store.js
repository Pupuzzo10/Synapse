const crypto = require("crypto");

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function createSessionMiddleware(authDb, config) {
  function buildSession(userId) {
    const now = authDb.nowIso();
    return authDb.saveSession({
      id: randomToken(32),
      csrfToken: randomToken(24),
      userId: userId || null,
      createdAt: now,
      expiresAt: authDb.addMilliseconds(now, config.sessionTtlMs),
    });
  }

  // Sessioni indipendenti per scheda: il client salva l'ID in sessionStorage
  // e lo manda nell'header x-session-id su tutte le richieste.
  // Per SSE (EventSource non supporta header custom) si accetta anche ?session=...
  function readSessionId(req) {
    const h = req.get("x-session-id");
    if (h && typeof h === "string") return h;
    if (req.query && typeof req.query.session === "string" && req.query.session) {
      return req.query.session;
    }
    return null;
  }

  return function sessionMiddleware(req, res, next) {
    authDb.cleanupExpiredRecords();

    const id = readSessionId(req);
    let session = id ? authDb.findSessionById(id) : null;

    if (session && new Date(session.expiresAt).getTime() <= Date.now()) {
      authDb.deleteSession(session.id);
      session = null;
    }

    if (session) {
      session = authDb.saveSession({
        ...session,
        expiresAt: authDb.addMilliseconds(new Date(), config.sessionTtlMs),
      });
    } else {
      // Sessione anonima creata al volo. Il client deve leggere
      // il sessionId dalla risposta di /api/auth/csrf-token e salvarlo.
      session = buildSession();
    }

    req.authSession = session;

    req.refreshSession = function refreshSession(userId) {
      const nextSession = authDb.saveSession({
        ...req.authSession,
        userId,
        expiresAt: authDb.addMilliseconds(new Date(), config.sessionTtlMs),
      });
      req.authSession = nextSession;
      return nextSession;
    };

    req.rotateSession = function rotateSession(userId) {
      authDb.deleteSession(req.authSession.id);
      const nextSession = buildSession(userId);
      req.authSession = nextSession;
      return nextSession;
    };

    req.destroySession = function destroySession() {
      authDb.deleteSession(req.authSession.id);
      const nextSession = buildSession();
      req.authSession = nextSession;
      return nextSession;
    };

    next();
  };
}

function requireCsrf(req, res, next) {
  const token = req.get("x-csrf-token");
  if (!token || token !== req.authSession.csrfToken) {
    return res.status(403).json({
      ok: false,
      message: "Sessione non valida. Aggiorna la pagina e riprova.",
    });
  }
  return next();
}

module.exports = {
  createSessionMiddleware,
  requireCsrf,
};
