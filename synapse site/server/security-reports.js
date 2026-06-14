const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
let PgPool = null;
try {
  PgPool = require("pg").Pool;
} catch (_error) {
  PgPool = null;
}

const USER_ID_RE = /^\d{15,25}$/;

let cachedDb = null;
let cachedPath = null;
let cachedStatements = null;
let cachedPool = null;
let cachedPoolUrl = null;

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

function validateUserId(userId) {
  const cleanUserId = String(userId || "").trim();
  if (!USER_ID_RE.test(cleanUserId)) {
    const err = new Error("ID utente Discord non valido.");
    err.statusCode = 400;
    throw err;
  }
  return cleanUserId;
}

function openSecurityDb(dbPath) {
  const absolutePath = toAbsolutePath(dbPath);
  if (!absolutePath) {
    const err = new Error("Percorso database security non configurato.");
    err.statusCode = 503;
    throw err;
  }

  if (!fs.existsSync(absolutePath)) {
    const err = new Error("Database SynapseHub™ Security non trovato. Configura DATABASE_URL oppure SECURITY_REPORTS_DB_PATH.");
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

function shouldUsePgSsl(databaseUrl) {
  const explicit = String(process.env.DATABASE_SSL || process.env.PGSSLMODE || "").toLowerCase();
  if (["false", "0", "disable", "off", "no"].includes(explicit)) return false;
  if (["true", "1", "require", "on", "yes"].includes(explicit)) return { rejectUnauthorized: false };
  return /sslmode=require/i.test(databaseUrl) ? { rejectUnauthorized: false } : false;
}

function getPgPool(databaseUrl) {
  const cleanUrl = String(databaseUrl || "").trim();
  if (!cleanUrl) {
    const err = new Error("DATABASE_URL non configurato.");
    err.statusCode = 503;
    throw err;
  }
  if (!PgPool) {
    const err = new Error("Dipendenza pg non installata. Esegui npm install.");
    err.statusCode = 503;
    throw err;
  }
  if (cachedPool && cachedPoolUrl === cleanUrl) return cachedPool;

  if (cachedPool) {
    cachedPool.end().catch(function () {});
  }

  cachedPoolUrl = cleanUrl;
  cachedPool = new PgPool({
    connectionString: cleanUrl,
    ssl: shouldUsePgSsl(cleanUrl),
  });
  return cachedPool;
}

async function ensurePgSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS utenti_segnalati (
      user_id TEXT PRIMARY KEY,
      motivo TEXT NOT NULL,
      durata TEXT NOT NULL,
      data_segnalazione TEXT NOT NULL,
      expires_at TEXT
    )
  `);
}

function formatResultFromRow(row, cleanUserId) {
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

function lookupSecurityReportSqlite(dbPath, userId) {
  const cleanUserId = validateUserId(userId);
  const { statements } = openSecurityDb(dbPath);
  const now = new Date().toISOString();
  statements.cleanupExpired.run({ now });

  const row = statements.findReport.get({ user_id: cleanUserId });
  return formatResultFromRow(row, cleanUserId);
}

async function lookupSecurityReportPostgres(databaseUrl, userId) {
  const cleanUserId = validateUserId(userId);
  const pool = getPgPool(databaseUrl);
  await ensurePgSchema(pool);

  const now = new Date().toISOString();
  await pool.query(
    `DELETE FROM utenti_segnalati
     WHERE expires_at IS NOT NULL
       AND expires_at != ''
       AND expires_at <= $1`,
    [now]
  );

  const result = await pool.query(
    `SELECT user_id, motivo, durata, data_segnalazione, expires_at
     FROM utenti_segnalati
     WHERE user_id = $1
     LIMIT 1`,
    [cleanUserId]
  );

  return formatResultFromRow(result.rows[0], cleanUserId);
}

async function lookupSecurityReport(config, userId) {
  const databaseUrl = String(config.securityReportsDatabaseUrl || config.databaseUrl || "").trim();
  if (databaseUrl) {
    return lookupSecurityReportPostgres(databaseUrl, userId);
  }
  return lookupSecurityReportSqlite(config.securityReportsDbPath, userId);
}

module.exports = {
  lookupSecurityReport,
};
