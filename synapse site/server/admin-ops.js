const bcrypt = require("bcryptjs");
const contentDefaults = require("./content-defaults");

const CONTENT_KEY = "site_content";
const STATUS_KEY = "service_status";

async function seedAdmin(authDb, config) {
  if (!config.adminEmail || !config.adminPassword) {
    return null;
  }

  const email = config.adminEmail;
  const username = config.adminUsername || "Admin";
  const passwordHash = await bcrypt.hash(config.adminPassword, config.bcryptRounds);
  const existing = authDb.findUserByEmail(email);

  if (existing) {
    authDb.updateUserPassword(existing.id, passwordHash);
    authDb.setUserAdmin(existing.id, true);
    return { created: false, userId: existing.id };
  }

  const user = authDb.createUser({
    username,
    email,
    passwordHash,
    marketingOptIn: false,
  });
  authDb.setUserAdmin(user.id, true);
  return { created: true, userId: user.id };
}

function seedContent(authDb) {
  if (!authDb.getSetting(CONTENT_KEY)) {
    const { defaultStatus, ...content } = contentDefaults;
    authDb.setSetting(CONTENT_KEY, content);
  }
  if (!authDb.getSetting(STATUS_KEY)) {
    authDb.setSetting(STATUS_KEY, contentDefaults.defaultStatus);
  }
}

function getContent(authDb) {
  const content = authDb.getSetting(CONTENT_KEY);
  if (content) return content;
  const { defaultStatus, ...fallback } = contentDefaults;
  return fallback;
}

function saveContent(authDb, content) {
  authDb.setSetting(CONTENT_KEY, content);
}

function getStatus(authDb) {
  return authDb.getSetting(STATUS_KEY) || contentDefaults.defaultStatus;
}

function saveStatus(authDb, status) {
  const next = {
    server: status.server || "online",
    service: status.service || "active",
    message: typeof status.message === "string" ? status.message : "",
    updatedAt: new Date().toISOString(),
  };
  authDb.setSetting(STATUS_KEY, next);
  return next;
}

module.exports = {
  seedAdmin,
  seedContent,
  getContent,
  saveContent,
  getStatus,
  saveStatus,
  CONTENT_KEY,
  STATUS_KEY,
};
