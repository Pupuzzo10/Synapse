const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_CONFIG = Object.freeze({
  channel_id: null,
  role_id: null,
  report_channel_id: null,
  admin_role_ids: [],
  command_prefix: "/",
  anti_link_enabled: true,
  anti_spam_enabled: true,
  anti_nuke_enabled: true,
  bypass_user_ids: [],
  bypass_role_ids: [],
  spam_window_seconds: 7,
  spam_max_messages: 5,
  spam_duplicate_window_seconds: 30,
  spam_duplicate_max_messages: 3,
  spam_max_mentions: 5,
  spam_action_cooldown_seconds: 3,
  nuke_audit_lookback_seconds: 15,
  nuke_window_seconds: 12,
  nuke_channel_threshold: 3,
  nuke_role_threshold: 3,
  nuke_member_threshold: 3,
  nuke_invite_threshold: 5,
  nuke_webhook_threshold: 3,
  timeout_hours: 6,
  history_ttl_hours: 24,
});

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadAllConfig(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveAllConfig(filePath, data) {
  ensureDir(filePath);
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function parseSnowflake(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{15,25}$/.test(text)) return null;
  return Number(text);
}

function parseSnowflakeList(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(parseSnowflake).filter(Boolean)));
  }
  return Array.from(new Set(String(value || "").match(/\d{15,25}/g) || [])).map(Number);
}

function bool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "si", "sì", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function intRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sanitizeConfig(input) {
  const cfg = { ...DEFAULT_CONFIG };
  const payload = input && typeof input === "object" ? input : {};
  cfg.channel_id = parseSnowflake(payload.channel_id);
  cfg.role_id = parseSnowflake(payload.role_id);
  cfg.report_channel_id = parseSnowflake(payload.report_channel_id);
  cfg.admin_role_ids = parseSnowflakeList(payload.admin_role_ids);
  cfg.command_prefix = String(payload.command_prefix || "/").trim() === "." ? "." : "/";
  cfg.anti_link_enabled = bool(payload.anti_link_enabled, true);
  cfg.anti_spam_enabled = bool(payload.anti_spam_enabled, true);
  cfg.anti_nuke_enabled = bool(payload.anti_nuke_enabled, true);
  cfg.bypass_user_ids = parseSnowflakeList(payload.bypass_user_ids);
  cfg.bypass_role_ids = parseSnowflakeList(payload.bypass_role_ids);
  cfg.spam_window_seconds = intRange(payload.spam_window_seconds, cfg.spam_window_seconds, 1, 300);
  cfg.spam_max_messages = intRange(payload.spam_max_messages, cfg.spam_max_messages, 1, 100);
  cfg.spam_duplicate_window_seconds = intRange(payload.spam_duplicate_window_seconds, cfg.spam_duplicate_window_seconds, 1, 600);
  cfg.spam_duplicate_max_messages = intRange(payload.spam_duplicate_max_messages, cfg.spam_duplicate_max_messages, 1, 50);
  cfg.spam_max_mentions = intRange(payload.spam_max_mentions, cfg.spam_max_mentions, 1, 100);
  cfg.spam_action_cooldown_seconds = intRange(payload.spam_action_cooldown_seconds, cfg.spam_action_cooldown_seconds, 1, 60);
  cfg.nuke_audit_lookback_seconds = intRange(payload.nuke_audit_lookback_seconds, cfg.nuke_audit_lookback_seconds, 1, 120);
  cfg.nuke_window_seconds = intRange(payload.nuke_window_seconds, cfg.nuke_window_seconds, 1, 300);
  cfg.nuke_channel_threshold = intRange(payload.nuke_channel_threshold, cfg.nuke_channel_threshold, 1, 100);
  cfg.nuke_role_threshold = intRange(payload.nuke_role_threshold, cfg.nuke_role_threshold, 1, 100);
  cfg.nuke_member_threshold = intRange(payload.nuke_member_threshold, cfg.nuke_member_threshold, 1, 100);
  cfg.nuke_invite_threshold = intRange(payload.nuke_invite_threshold, cfg.nuke_invite_threshold, 1, 100);
  cfg.nuke_webhook_threshold = intRange(payload.nuke_webhook_threshold, cfg.nuke_webhook_threshold, 1, 100);
  cfg.timeout_hours = intRange(payload.timeout_hours, cfg.timeout_hours, 1, 168);
  cfg.history_ttl_hours = intRange(payload.history_ttl_hours, cfg.history_ttl_hours, 1, 720);
  return cfg;
}

function getGuildConfig(filePath, guildId) {
  const all = loadAllConfig(filePath);
  return sanitizeConfig(all[String(guildId)] || {});
}

function setGuildConfig(filePath, guildId, config) {
  const all = loadAllConfig(filePath);
  all[String(guildId)] = sanitizeConfig(config);
  saveAllConfig(filePath, all);
  return all[String(guildId)];
}

function verifyConfigToken(secret, guildId, userId, expires, token) {
  const guild = String(guildId || "").trim();
  const user = String(userId || "").trim();
  const exp = Number.parseInt(expires, 10);
  const provided = String(token || "").trim();
  if (!/^\d{15,25}$/.test(guild) || !/^\d{15,25}$/.test(user)) return false;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const payload = `${guild}:${user}:${exp}`;
  const expected = crypto.createHmac("sha256", String(secret || "")).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

module.exports = {
  DEFAULT_CONFIG,
  getGuildConfig,
  setGuildConfig,
  sanitizeConfig,
  verifyConfigToken,
};
