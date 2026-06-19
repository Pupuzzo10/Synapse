const dns = require("node:dns");
const nodemailer = require("nodemailer");

try {
  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }
} catch (_error) {
  // Node versions without setDefaultResultOrder can safely continue.
}

function parseIntOr(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isTruthyEnv(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeAppPassword(value) {
  return String(value || "").replace(/\s+/g, "");
}

function createMailer(config, overrides = {}) {
  if (overrides.sendVerificationEmail) {
    return {
      mode: "custom",
      isDevelopmentStream: false,
      async verifyConnection() {
        return { ok: true, mode: "custom" };
      },
      async sendVerificationEmail(payload) {
        const result = (await overrides.sendVerificationEmail(payload)) || {};
        return {
          mode: "custom",
          simulated: false,
          messageId: result.messageId || null,
          accepted: Array.isArray(result.accepted) ? result.accepted : [payload.to],
          rejected: Array.isArray(result.rejected) ? result.rejected : [],
          response: result.response || null,
          preview: result.preview || null,
        };
      },
    };
  }

  let transporter;
  let mode;

  if (config.smtp.host && config.smtp.user && config.smtp.pass) {
    mode = "smtp";
    const smtpTimeoutMs = parseIntOr(process.env.SMTP_TIMEOUT_MS, 10000);
    const forceIpv4 = isTruthyEnv(process.env.SMTP_FORCE_IPV4, true);
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      family: forceIpv4 ? 4 : undefined,
      dnsTimeout: smtpTimeoutMs,
      connectionTimeout: smtpTimeoutMs,
      greetingTimeout: smtpTimeoutMs,
      socketTimeout: smtpTimeoutMs + 5000,
      auth: {
        user: String(config.smtp.user || "").trim(),
        pass: normalizeAppPassword(config.smtp.pass),
      },
      tls: {
        servername: config.smtp.host,
      },
    });
  } else {
    mode = "development-stream";
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
  }

  async function verifyConnection() {
    if (mode !== "smtp") {
      return {
        ok: true,
        mode,
        simulated: true,
      };
    }

    await transporter.verify();
    return {
      ok: true,
      mode,
      simulated: false,
    };
  }

  async function sendVerificationEmail({ to, username, verificationUrl }) {
    const info = await transporter.sendMail({
      from: config.emailFrom,
      to,
      subject: "Conferma il tuo account Synapse",
      text: [
        `Ciao ${username},`,
        "",
        "Grazie per la registrazione.",
        "Conferma il tuo indirizzo email aprendo questo link:",
        verificationUrl,
        "",
        "Se non hai richiesto la registrazione puoi ignorare questo messaggio.",
      ].join("\n"),
      html: `
        <p>Ciao ${username},</p>
        <p>Grazie per la registrazione.</p>
        <p>Conferma il tuo indirizzo email aprendo questo link:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>Se non hai richiesto la registrazione puoi ignorare questo messaggio.</p>
      `,
    });

    if (mode !== "smtp") {
      console.log("[auth] Link di verifica email:", verificationUrl);
      console.log("[auth] Messaggio email di sviluppo:\n" + info.message.toString());
    }

    return {
      mode,
      simulated: mode !== "smtp",
      messageId: info.messageId || null,
      accepted: Array.isArray(info.accepted) ? info.accepted : [],
      rejected: Array.isArray(info.rejected) ? info.rejected : [],
      response: info.response || null,
      preview: info.message ? info.message.toString() : null,
    };
  }

  return {
    mode,
    isDevelopmentStream: mode !== "smtp",
    verifyConnection,
    sendVerificationEmail,
  };
}

module.exports = {
  createMailer,
};
