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
      account_status TEXT NOT NULL DEFAULT 'active',
      account_status_reason TEXT,
      account_status_updated_at TEXT,
      account_status_updated_by INTEGER,
      register_ip TEXT,
      last_ip TEXT,
      last_seen_at TEXT,
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

    CREATE TABLE IF NOT EXISTS ip_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL UNIQUE,
      reason TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      lifted_at TEXT,
      lifted_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (lifted_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ip_bans_ip_active ON ip_bans (ip, active);

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      subject TEXT,
      category TEXT,
      product_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_reply TEXT,
      chat_id INTEGER,
      ip TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets (user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      discord_username TEXT,
      product_category TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price_label TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Revolut',
      payment_link TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'awaiting_revolut',
      service_details TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_payment',
      ip TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_marked_at TEXT,
      details_submitted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      admin_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      user_can_send INTEGER NOT NULL DEFAULT 1,
      needs_admin INTEGER NOT NULL DEFAULT 0,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT,
      closure_reason TEXT
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

  // Migrazione leggera: completa le colonne chat se il DB e' precedente.
  const chatColumns = db.prepare("PRAGMA table_info(chats)").all();
  function hasChatColumn(name) { return chatColumns.some(function (c) { return c.name === name; }); }
  if (!hasChatColumn("closure_reason")) {
    db.exec("ALTER TABLE chats ADD COLUMN closure_reason TEXT");
  }
  if (!hasChatColumn("needs_admin")) {
    db.exec("ALTER TABLE chats ADD COLUMN needs_admin INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasChatColumn("ai_enabled")) {
    db.exec("ALTER TABLE chats ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 0");
  }

  // Migrazione leggera: aggiunge colonne utente/moderazione se un DB pre-esistente non le contiene.
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  function hasUserColumn(name) { return userColumns.some(function (c) { return c.name === name; }); }
  if (!hasUserColumn("is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasUserColumn("account_status")) {
    db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'");
  }
  if (!hasUserColumn("account_status_reason")) {
    db.exec("ALTER TABLE users ADD COLUMN account_status_reason TEXT");
  }
  if (!hasUserColumn("account_status_updated_at")) {
    db.exec("ALTER TABLE users ADD COLUMN account_status_updated_at TEXT");
  }
  if (!hasUserColumn("account_status_updated_by")) {
    db.exec("ALTER TABLE users ADD COLUMN account_status_updated_by INTEGER");
  }
  if (!hasUserColumn("register_ip")) {
    db.exec("ALTER TABLE users ADD COLUMN register_ip TEXT");
  }
  if (!hasUserColumn("last_ip")) {
    db.exec("ALTER TABLE users ADD COLUMN last_ip TEXT");
  }
  if (!hasUserColumn("last_seen_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_seen_at TEXT");
  }

  // Migrazione leggera: completa ip_bans sui DB creati prima del sistema moderazione avanzato.
  const ipBanColumns = db.prepare("PRAGMA table_info(ip_bans)").all();
  function hasIpBanColumn(name) { return ipBanColumns.some(function (c) { return c.name === name; }); }
  if (!hasIpBanColumn("updated_at")) {
    db.exec("ALTER TABLE ip_bans ADD COLUMN updated_at TEXT");
    db.exec("UPDATE ip_bans SET updated_at = COALESCE(lifted_at, created_at, datetime('now')) WHERE updated_at IS NULL");
  }

  // Migrazione leggera: traccia IP e contesto prodotto anche sui ticket se le colonne mancano.
  const ticketColumns = db.prepare("PRAGMA table_info(tickets)").all();
  function hasTicketColumn(name) { return ticketColumns.some(function (c) { return c.name === name; }); }
  if (!hasTicketColumn("ip")) {
    db.exec("ALTER TABLE tickets ADD COLUMN ip TEXT");
  }
  if (!hasTicketColumn("subject")) {
    db.exec("ALTER TABLE tickets ADD COLUMN subject TEXT");
  }
  if (!hasTicketColumn("category")) {
    db.exec("ALTER TABLE tickets ADD COLUMN category TEXT");
  }
  if (!hasTicketColumn("product_name")) {
    db.exec("ALTER TABLE tickets ADD COLUMN product_name TEXT");
  }

  const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
  function hasOrderColumn(name) { return orderColumns.some(function (c) { return c.name === name; }); }
  if (!hasOrderColumn("discord_username")) {
    db.exec("ALTER TABLE orders ADD COLUMN discord_username TEXT");
  }
  if (!hasOrderColumn("payment_status")) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'awaiting_revolut'");
  }
  if (!hasOrderColumn("service_details")) {
    db.exec("ALTER TABLE orders ADD COLUMN service_details TEXT");
  }
  if (!hasOrderColumn("paid_marked_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN paid_marked_at TEXT");
  }
  if (!hasOrderColumn("details_submitted_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN details_submitted_at TEXT");
  }

  // Coerenza dati: se una chat è chiusa, anche il ticket collegato deve risultare chiuso.
  // Evita il blocco "hai già un ticket aperto" dopo una chiusura dal pannello admin.
  db.exec(`
    UPDATE tickets
    SET status = 'closed', updated_at = COALESCE(updated_at, datetime('now'))
    WHERE chat_id IN (SELECT id FROM chats WHERE status = 'closed')
      AND status NOT IN ('closed', 'declined')
  `);

  const statements = {
    insertUser: db.prepare(`
      INSERT INTO users (
        username, email, password_hash, marketing_opt_in, email_verified_at,
        account_status, register_ip, last_ip, last_seen_at, created_at, updated_at
      )
      VALUES (
        @username, @email, @password_hash, @marketing_opt_in, NULL,
        'active', @register_ip, @last_ip, @last_seen_at, @created_at, @updated_at
      )
    `),
    findUserByEmail: db.prepare(`
      SELECT id, username, email, password_hash, marketing_opt_in, email_verified_at, is_admin,
        account_status, account_status_reason, account_status_updated_at, account_status_updated_by,
        register_ip, last_ip, last_seen_at, created_at, updated_at
      FROM users
      WHERE email = ?
    `),
    findUserById: db.prepare(`
      SELECT id, username, email, marketing_opt_in, email_verified_at, is_admin,
        account_status, account_status_reason, account_status_updated_at, account_status_updated_by,
        register_ip, last_ip, last_seen_at, created_at, updated_at
      FROM users
      WHERE id = ?
    `),
    updateUserPassword: db.prepare(`
      UPDATE users SET password_hash = @password_hash, updated_at = @updated_at WHERE id = @id
    `),
    setUserAdmin: db.prepare(`
      UPDATE users SET is_admin = @is_admin, updated_at = @updated_at WHERE id = @id
    `),
    setUserModerationStatus: db.prepare(`
      UPDATE users SET
        account_status = @account_status,
        account_status_reason = @account_status_reason,
        account_status_updated_at = @account_status_updated_at,
        account_status_updated_by = @account_status_updated_by,
        updated_at = @updated_at
      WHERE id = @id
    `),
    updateUserIp: db.prepare(`
      UPDATE users SET last_ip = @last_ip, last_seen_at = @last_seen_at, updated_at = @updated_at WHERE id = @id
    `),
    findUsersByIp: db.prepare(`
      SELECT id, username, email, marketing_opt_in, email_verified_at, is_admin,
        account_status, account_status_reason, account_status_updated_at, account_status_updated_by,
        register_ip, last_ip, last_seen_at, created_at, updated_at
      FROM users
      WHERE register_ip = @ip OR last_ip = @ip
      ORDER BY updated_at DESC
    `),
    findActiveIpBan: db.prepare(`
      SELECT * FROM ip_bans WHERE ip = ? AND active = 1
    `),
    listActiveIpBans: db.prepare(`
      SELECT b.*, u.username AS created_by_username
      FROM ip_bans b
      LEFT JOIN users u ON u.id = b.created_by
      WHERE b.active = 1
      ORDER BY b.updated_at DESC, b.created_at DESC
    `),
    upsertIpBan: db.prepare(`
      INSERT INTO ip_bans (ip, reason, active, created_by, created_at, updated_at, lifted_at, lifted_by)
      VALUES (@ip, @reason, 1, @created_by, @created_at, @updated_at, NULL, NULL)
      ON CONFLICT(ip) DO UPDATE SET
        reason = excluded.reason,
        active = 1,
        created_by = excluded.created_by,
        updated_at = excluded.updated_at,
        lifted_at = NULL,
        lifted_by = NULL
    `),
    liftIpBan: db.prepare(`
      UPDATE ip_bans SET active = 0, lifted_at = @lifted_at, lifted_by = @lifted_by, updated_at = @updated_at
      WHERE ip = @ip AND active = 1
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
    deleteSessionsByUserId: db.prepare(`
      DELETE FROM sessions
      WHERE user_id = ?
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

  function createUser({ username, email, passwordHash, marketingOptIn, registerIp }) {
    const now = nowIso();
    const ip = registerIp || null;
    const result = statements.insertUser.run({
      username,
      email,
      password_hash: passwordHash,
      marketing_opt_in: marketingOptIn ? 1 : 0,
      register_ip: ip,
      last_ip: ip,
      last_seen_at: ip ? now : null,
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

  function deleteSessionsByUserId(userId) {
    if (!userId) return 0;
    return statements.deleteSessionsByUserId.run(userId).changes || 0;
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

  function setUserModerationStatus(userId, status, reason, adminId) {
    if (["active", "suspended", "banned", "closed"].indexOf(status) === -1) {
      throw new Error("Stato account non valido");
    }
    const now = nowIso();
    statements.setUserModerationStatus.run({
      id: userId,
      account_status: status,
      account_status_reason: status === "active" ? null : (reason || null),
      account_status_updated_at: now,
      account_status_updated_by: adminId || null,
      updated_at: now,
    });
    return findUserById(userId);
  }

  function updateUserIp(userId, ip) {
    if (!userId || !ip) return null;
    const now = nowIso();
    statements.updateUserIp.run({ id: userId, last_ip: ip, last_seen_at: now, updated_at: now });
    return findUserById(userId);
  }

  function findUsersByIp(ip) {
    if (!ip) return [];
    return statements.findUsersByIp.all({ ip });
  }

  function findActiveIpBan(ip) {
    if (!ip) return null;
    return statements.findActiveIpBan.get(ip) || null;
  }

  function serializeIpBan(row) {
    if (!row) return null;
    return {
      id: row.id,
      ip: row.ip,
      reason: row.reason || null,
      active: !!row.active,
      createdBy: row.created_by || null,
      createdByUsername: row.created_by_username || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      liftedAt: row.lifted_at || null,
      liftedBy: row.lifted_by || null,
    };
  }

  function listActiveIpBans() {
    return statements.listActiveIpBans.all().map(serializeIpBan);
  }

  function banIp(ip, reason, adminId) {
    if (!ip) throw new Error("IP non valido");
    const now = nowIso();
    statements.upsertIpBan.run({
      ip,
      reason: reason || null,
      created_by: adminId || null,
      created_at: now,
      updated_at: now,
    });
    return findActiveIpBan(ip);
  }

  function liftIpBan(ip, adminId) {
    if (!ip) throw new Error("IP non valido");
    const now = nowIso();
    statements.liftIpBan.run({ ip, lifted_at: now, lifted_by: adminId || null, updated_at: now });
    return findActiveIpBan(ip);
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
    setUserModerationStatus,
    updateUserIp,
    findUsersByIp,
    findActiveIpBan,
    listActiveIpBans,
    banIp,
    liftIpBan,
    getSetting,
    setSetting,
    createEmailVerificationToken,
    consumeEmailVerificationToken,
    saveSession,
    findSessionById,
    deleteSession,
    deleteSessionsByUserId,
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
