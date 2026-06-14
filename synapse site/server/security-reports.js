const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const USER_ID_RE = /^\d{15,25}$/;

let cachedDb = null;
let cachedPath = null;
let cachedStatements = null;

function toAbsolutePath(dbPath) {
  const value = String(dbPath || "").trim();
  if (!value) return "";
  return path.resolve(value);
}

function normalizeIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString();
}

function openSecurityDb(dbPath) {
  const absolutePath = toAbsolutePath(dbPath);
  if (!absolutePath) {
    const err = new Error("Percorso database security non configurato.");
    err.statusCode = 503;
    throw err;
  }

  if (!fs.existsSync(absolutePath)) {
    const err = new Error("Database SynapseHub™ Security non trovato. Configura SECURITY_REPORTS_DB_PATH.");
    err.statusCode = 503;
    throw err;
  }

  if (cachedDb && cachedPath === absolutePath) {
    return { db: cachedDb, statements: cachedStatements };
  }

  if (cachedDb) {
    try { cachedDb.close(); } catch (_error) { /* non bloccante */ }
  }

  const db = new Database(absolutePath);
  db.pragma("busy_timeout = 5000");

  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'utenti_segnalati'")
    .get();

  if (!table) {
    try { db.close(); } catch (_error) { /* non bloccante */ }
    const err = new Error("La tabella utenti_segnalati non esiste nel database configurato.");
    err.statusCode = 503;
    throw err;
  }

  cachedDb = db;
  cachedPath = absolutePath;
  cachedStatements = {
    cleanupExpired: db.prepare(`
      DELETE FROM utenti_segnalati
      WHERE expires_at IS NOT NULL
        AND expires_at != ''
        AND expires_at <= @now
    `),
    findReport: db.prepare(`
      SELECT user_id, motivo, durata, data_segnalazione, expires_at
      FROM utenti_segnalati
      WHERE user_id = @user_id
      LIMIT 1
    `),
  };

  return { db: cachedDb, statements: cachedStatements };
}

function lookupSecurityReport(dbPath, userId) {
  const cleanUserId = String(userId || "").trim();

  if (!USER_ID_RE.test(cleanUserId)) {
    const err = new Error("ID utente Discord non valido.");
    err.statusCode = 400;
    throw err;
  }

  const { statements } = openSecurityDb(dbPath);
  const now = new Date().toISOString();
  statements.cleanupExpired.run({ now });

  const row = statements.findReport.get({ user_id: cleanUserId });
  if (!row) {
    return {
      found: false,
      userId: cleanUserId,
    };
  }

  return {
    found: true,
    report: {
      userId: String(row.user_id),
      motivo: row.motivo || "",
      durata: row.durata || "",
      dataSegnalazione: normalizeIso(row.data_segnalazione),
      expiresAt: normalizeIso(row.expires_at),
    },
  };
}

module.exports = {
  lookupSecurityReport,
};
