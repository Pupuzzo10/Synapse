const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function nowIso() {
  return new Date().toISOString();
}

function addMilliseconds(dateOrIso, milliseconds) {
  const date = typeof dateOrIso === "string" ? new Date(dateOrIso) : new Date(dateOrIso.getTime());
  return new Date(date.getTime() + milliseconds).toISOString();
}

function ensureDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      marketing_opt_in INTEGER NOT NULL DEFAULT 0,
      email_verified_at TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      csrf_token TEXT NOT NULL,
      user_id INTEGER,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      template TEXT NOT NULL,
      status TEXT NOT NULL,
      transport_mode TEXT NOT NULL,
      message_id TEXT,
      error_code TEXT,
      error_message TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
      ON email_verification_tokens (user_id);

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
      ON sessions (expires_at);

    CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_user_id
      ON email_delivery_logs (user_id);

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_reply TEXT,
      chat_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets (user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      admin_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      user_can_send INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats (user_id);
    CREATE INDEX IF NOT EXISTS idx_chats_admin_id ON chats (admin_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages (chat_id);
  `);

  // Migrazione leggera: aggiunge colonna closure_reason a chats se assente.
  const chatColumns = db.prepare("PRAGMA table_info(chats)").all();
  if (!chatColumns.some(function (c) { return c.name === "closure_reason"; })) {
    db.exec("ALTER TABLE chats ADD COLUMN closure_reason TEXT");
  }

  // Migrazione leggera: aggiunge colonna is_admin se un DB pre-esistente non la contiene.
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  if (!userColumns.some(function (c) { return c.name === "is_admin"; })) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }

  const statements = {
    insertUser: db.prepare(`
      INSERT INTO users (username, email, password_hash, marketing_opt_in, email_verified_at, created_at, updated_at)
      VALUES (@username, @email, @password_hash, @marketing_opt_in, NULL, @created_at, @updated_at)
    `),
    findUserByEmail: db.prepare(`
      SELECT id, username, email, password_hash, marketing_opt_in, email_verified_at, is_admin, created_at, updated_at
      FROM users
      WHERE email = ?
    `),
    findUserById: db.prepare(`
      SELECT id, username, email, marketing_opt_in, email_verified_at, is_admin, created_at, updated_at
      FROM users
      WHERE id = ?
    `),
    updateUserPassword: db.prepare(`
      UPDATE users SET password_hash = @password_hash, updated_at = @updated_at WHERE id = @id
    `),
    setUserAdmin: db.prepare(`
      UPDATE users SET is_admin = @is_admin, updated_at = @updated_at WHERE id = @id
    `),
    getSetting: db.prepare(`
      SELECT key, value_json, updated_at FROM app_settings WHERE key = ?
    `),
    upsertSetting: db.prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (@key, @value_json, @updated_at)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `),
    markUserEmailVerified: db.prepare(`
      UPDATE users
      SET email_verified_at = @verified_at, updated_at = @updated_at
      WHERE id = @user_id
    `),
    insertVerificationToken: db.prepare(`
      INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, consumed_at, created_at)
      VALUES (@user_id, @token_hash, @expires_at, NULL, @created_at)
    `),
    findActiveVerificationToken: db.prepare(`
      SELECT id, user_id, token_hash, expires_at, consumed_at, created_at
      FROM email_verification_tokens
      WHERE token_hash = ? AND consumed_at IS NULL
    `),
    consumeVerificationToken: db.prepare(`
      UPDATE email_verification_tokens
      SET consumed_at = ?
      WHERE id = ?
    `),
    invalidateExistingVerificationTokens: db.prepare(`
      UPDATE email_verification_tokens
      SET consumed_at = @consumed_at
      WHERE user_id = @user_id AND consumed_at IS NULL
    `),
    deleteExpiredVerificationTokens: db.prepare(`
      DELETE FROM email_verification_tokens
      WHERE expires_at <= ?
    `),
    findSessionById: db.prepare(`
      SELECT id, csrf_token, user_id, expires_at, created_at, updated_at
      FROM sessions
      WHERE id = ?
    `),
    upsertSession: db.prepare(`
      INSERT INTO sessions (id, csrf_token, user_id, expires_at, created_at, updated_at)
      VALUES (@id, @csrf_token, @user_id, @expires_at, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        csrf_token = excluded.csrf_token,
        user_id = excluded.user_id,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `),
    deleteSession: db.prepare(`
      DELETE FROM sessions
      WHERE id = ?
    `),
    deleteExpiredSessions: db.prepare(`
      DELETE FROM sessions
      WHERE expires_at <= ?
    `),
    insertEmailDeliveryLog: db.prepare(`
      INSERT INTO email_delivery_logs (
        user_id,
        email,
        template,
        status,
        transport_mode,
        message_id,
        error_code,
        error_message,
        metadata_json,
        created_at
      )
      VALUES (
        @user_id,
        @email,
        @template,
        @status,
        @transport_mode,
        @message_id,
        @error_code,
        @error_message,
        @metadata_json,
        @created_at
      )
    `),
    findEmailLogsByUserId: db.prepare(`
      SELECT
        id,
        user_id,
        email,
        template,
        status,
        transport_mode,
        message_id,
        error_code,
        error_message,
        metadata_json,
        created_at
      FROM email_delivery_logs
      WHERE user_id = ?
      ORDER BY id ASC
    `),
  };

  function cleanupExpiredRecords() {
    const now = nowIso();
    statements.deleteExpiredVerificationTokens.run(now);
    statements.deleteExpiredSessions.run(now);
  }

  function createUser({ username, email, passwordHash, marketingOptIn }) {
    const now = nowIso();
    const result = statements.insertUser.run({
      username,
      email,
      password_hash: passwordHash,
      marketing_opt_in: marketingOptIn ? 1 : 0,
      created_at: now,
      updated_at: now,
    });

    return findUserById(result.lastInsertRowid);
  }

  function findUserByEmail(email) {
    return statements.findUserByEmail.get(email);
  }

  function findUserById(id) {
    return statements.findUserById.get(id);
  }

  function createEmailVerificationToken({ userId, tokenHash, ttlMs }) {
    const now = nowIso();
    statements.invalidateExistingVerificationTokens.run({
      user_id: userId,
      consumed_at: now,
    });
    statements.insertVerificationToken.run({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: addMilliseconds(now, ttlMs),
      created_at: now,
    });
  }

  function consumeEmailVerificationToken(tokenHash) {
    const token = statements.findActiveVerificationToken.get(tokenHash);
    if (!token) {
      return { status: "missing" };
    }

    if (new Date(token.expires_at).getTime() <= Date.now()) {
      statements.consumeVerificationToken.run(nowIso(), token.id);
      return { status: "expired", token };
    }

    const now = nowIso();
    statements.consumeVerificationToken.run(now, token.id);
    statements.markUserEmailVerified.run({
      user_id: token.user_id,
      verified_at: now,
      updated_at: now,
    });

    return { status: "verified", token, user: findUserById(token.user_id) };
  }

  function saveSession(session) {
    const now = nowIso();
    const record = {
      id: session.id,
      csrf_token: session.csrfToken,
      user_id: session.userId || null,
      expires_at: session.expiresAt,
      created_at: session.createdAt || now,
      updated_at: now,
    };

    statements.upsertSession.run(record);

    return {
      id: record.id,
      csrfToken: record.csrf_token,
      userId: record.user_id,
      expiresAt: record.expires_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  function findSessionById(id) {
    const session = statements.findSessionById.get(id);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      csrfToken: session.csrf_token,
      userId: session.user_id,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    };
  }

  function deleteSession(id) {
    statements.deleteSession.run(id);
  }

  function createEmailDeliveryLog({
    userId,
    email,
    template,
    status,
    transportMode,
    messageId,
    errorCode,
    errorMessage,
    metadata,
  }) {
    const now = nowIso();
    statements.insertEmailDeliveryLog.run({
      user_id: userId || null,
      email,
      template,
      status,
      transport_mode: transportMode,
      message_id: messageId || null,
      error_code: errorCode || null,
      error_message: errorMessage || null,
      metadata_json: metadata ? JSON.stringify(metadata) : null,
      created_at: now,
    });
  }

  function updateUserPassword(userId, passwordHash) {
    statements.updateUserPassword.run({
      id: userId,
      password_hash: passwordHash,
      updated_at: nowIso(),
    });
  }

  function setUserAdmin(userId, isAdmin) {
    statements.setUserAdmin.run({
      id: userId,
      is_admin: isAdmin ? 1 : 0,
      updated_at: nowIso(),
    });
  }

  function getSetting(key) {
    const row = statements.getSetting.get(key);
    if (!row) return null;
    try {
      return JSON.parse(row.value_json);
    } catch (_err) {
      return null;
    }
  }

  function setSetting(key, value) {
    statements.upsertSetting.run({
      key,
      value_json: JSON.stringify(value),
      updated_at: nowIso(),
    });
  }

  function findEmailLogsByUserId(userId) {
    return statements.findEmailLogsByUserId.all(userId).map(function (row) {
      return {
        id: row.id,
        userId: row.user_id,
        email: row.email,
        template: row.template,
        status: row.status,
        transportMode: row.transport_mode,
        messageId: row.message_id,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
        createdAt: row.created_at,
      };
    });
  }

  return {
    db,
    cleanupExpiredRecords,
    createUser,
    findUserByEmail,
    findUserById,
    updateUserPassword,
    setUserAdmin,
    getSetting,
    setSetting,
    createEmailVerificationToken,
    consumeEmailVerificationToken,
    saveSession,
    findSessionById,
    deleteSession,
    createEmailDeliveryLog,
    findEmailLogsByUserId,
    nowIso,
    addMilliseconds,
  };
}

module.exports = {
  ensureDatabase,
  nowIso,
  addMilliseconds,
};
