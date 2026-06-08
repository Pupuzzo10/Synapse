const bcrypt = require("bcryptjs");
const contentDefaults = require("./content-defaults");

const CONTENT_KEY = "site_content";
const STATUS_KEY = "service_status";

function defaultContent() {
  const { defaultStatus, ...content } = contentDefaults;
  return content;
}

function mergeMissingContentSections(current) {
  const defaults = defaultContent();
  const merged = Object.assign({}, current || {});
  let changed = false;
  Object.keys(defaults).forEach(function (key) {
    if (typeof merged[key] === "undefined") {
      merged[key] = defaults[key];
      changed = true;
    }
  });
  return { content: merged, changed };
}

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
    if (authDb.setUserStaffRole) authDb.setUserStaffRole(existing.id, "ceo");
    else authDb.setUserAdmin(existing.id, true);
    return { created: false, userId: existing.id };
  }

  const user = authDb.createUser({
    username,
    email,
    passwordHash,
    marketingOptIn: false,
  });
  if (authDb.setUserStaffRole) authDb.setUserStaffRole(user.id, "ceo");
  else authDb.setUserAdmin(user.id, true);
  return { created: true, userId: user.id };
}

function seedContent(authDb) {
  const existing = authDb.getSetting(CONTENT_KEY);
  if (!existing) {
    authDb.setSetting(CONTENT_KEY, defaultContent());
  } else {
    const merged = mergeMissingContentSections(existing);
    if (merged.changed) authDb.setSetting(CONTENT_KEY, merged.content);
  }
  if (!authDb.getSetting(STATUS_KEY)) {
    authDb.setSetting(STATUS_KEY, contentDefaults.defaultStatus);
  }
}

function getContent(authDb) {
  const content = authDb.getSetting(CONTENT_KEY);
  if (content) {
    const merged = mergeMissingContentSections(content);
    if (merged.changed) authDb.setSetting(CONTENT_KEY, merged.content);
    return merged.content;
  }
  return defaultContent();
}

function saveContent(authDb, content) {
  authDb.setSetting(CONTENT_KEY, content);
}

function getStatus(authDb) {
  return authDb.getSetting(STATUS_KEY) || contentDefaults.defaultStatus;
}

function saveStatus(authDb, status) {
  status = status || {};
  const allowedServer = ["online", "maintenance", "degraded", "offline"];
  const allowedService = ["active", "maintenance", "suspended"];
  const server = allowedServer.indexOf(status.server) !== -1 ? status.server : "online";
  const service = allowedService.indexOf(status.service) !== -1 ? status.service : "active";
  const next = {
    server,
    service,
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
