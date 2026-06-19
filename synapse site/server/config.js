const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config();

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

function parseIntOr(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createConfig(overrides = {}) {
  const sessionSecret =
    overrides.sessionSecret ||
    process.env.SESSION_SECRET ||
    crypto.randomBytes(32).toString("hex");

  return {
    rootDir,
    dataDir,
    nodeEnv: overrides.nodeEnv || process.env.NODE_ENV || "development",
    port: parseIntOr(overrides.port || process.env.PORT, 3000),
    baseUrl: overrides.baseUrl || process.env.BASE_URL || "http://localhost:3000",
    databasePath:
      overrides.databasePath ||
      process.env.DATABASE_PATH ||
      path.join(dataDir, "synapse-auth.db"),
    databaseUrl:
      overrides.databaseUrl ||
      process.env.DATABASE_URL ||
      "",
    securityReportsDatabaseUrl:
      overrides.securityReportsDatabaseUrl ||
      process.env.SECURITY_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "",
    securityReportsDbPath:
      overrides.securityReportsDbPath ||
      process.env.SECURITY_REPORTS_DB_PATH ||
      path.join(dataDir, "segnalazioni.db"),
    botConfigPath:
      overrides.botConfigPath ||
      process.env.SERVER_ALERT_CONFIG_PATH ||
      process.env.BOT_CONFIG_PATH ||
      path.join(dataDir, "server_alert_config.json"),
    securityDashboardSecret:
      overrides.securityDashboardSecret ||
      process.env.SECURITY_DASHBOARD_SECRET ||
      "synapsehub-security-dev-secret",
    discordClientId:
      overrides.discordClientId ||
      process.env.DISCORD_CLIENT_ID ||
      "1515719063739826189",
    discordClientSecret:
      overrides.discordClientSecret ||
      process.env.DISCORD_CLIENT_SECRET ||
      "",
    discordBotToken:
      overrides.discordBotToken ||
      process.env.DISCORD_BOT_TOKEN ||
      "",
    discordOAuthRedirectUri:
      overrides.discordOAuthRedirectUri ||
      process.env.DISCORD_REDIRECT_URI ||
      "",
    sessionSecret,
    sessionCookieName:
      overrides.sessionCookieName || process.env.SESSION_COOKIE_NAME || "synapse.sid",
    sessionTtlMs:
      overrides.sessionTtlMs || parseIntOr(process.env.SESSION_TTL_MS, 1000 * 60 * 60 * 24 * 30),
    bcryptRounds:
      overrides.bcryptRounds || parseIntOr(process.env.BCRYPT_ROUNDS, 12),
    verificationTtlMs:
      overrides.verificationTtlMs ||
      parseIntOr(process.env.EMAIL_VERIFICATION_TTL_MS, 1000 * 60 * 60 * 24),
    emailProvider: (overrides.emailProvider || process.env.EMAIL_PROVIDER || "").trim().toLowerCase(),
    emailFrom: overrides.emailFrom || process.env.EMAIL_FROM || "Synapse <no-reply@synapse.local>",
    resend: {
      apiKey: overrides.resendApiKey || process.env.RESEND_API_KEY || "",
      apiUrl: overrides.resendApiUrl || process.env.RESEND_API_URL || "https://api.resend.com/emails",
    },
    secureCookies:
      typeof overrides.secureCookies === "boolean"
        ? overrides.secureCookies
        : (process.env.SECURE_COOKIES || "").toLowerCase() === "true",
    adminEmail:
      (overrides.adminEmail || process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
    adminPassword: overrides.adminPassword || process.env.ADMIN_PASSWORD || "",
    adminUsername: overrides.adminUsername || process.env.ADMIN_USERNAME || "Admin",
    smtp: {
      host: overrides.smtpHost || process.env.SMTP_HOST || "",
      port: parseIntOr(overrides.smtpPort || process.env.SMTP_PORT, 587),
      secure:
        typeof overrides.smtpSecure === "boolean"
          ? overrides.smtpSecure
          : (process.env.SMTP_SECURE || "").toLowerCase() === "true",
      user: overrides.smtpUser || process.env.SMTP_USER || "",
      pass: overrides.smtpPass || process.env.SMTP_PASS || "",
    },
  };
}

module.exports = {
  createConfig,
};
