const https = require("node:https");
const dns = require("node:dns");
const net = require("node:net");
const tls = require("node:tls");
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

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function buildVerificationEmail({ username, verificationUrl }) {
  const safeUsername = String(username || "utente");
  return {
    subject: "Conferma il tuo account Synapse",
    text: [
      `Ciao ${safeUsername},`,
      "",
      "Grazie per la registrazione.",
      "Conferma il tuo indirizzo email aprendo questo link:",
      verificationUrl,
      "",
      "Se non hai richiesto la registrazione puoi ignorare questo messaggio.",
    ].join("\n"),
    html: `
      <p>Ciao ${escapeHtml(safeUsername)},</p>
      <p>Grazie per la registrazione.</p>
      <p>Conferma il tuo indirizzo email aprendo questo link:</p>
      <p><a href="${escapeAttribute(verificationUrl)}">${escapeHtml(verificationUrl)}</a></p>
      <p>Se non hai richiesto la registrazione puoi ignorare questo messaggio.</p>
    `,
  };
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function requestJson(urlString, { method = "GET", headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = null;
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch (_error) {
              data = { raw };
            }
          }
          resolve({ statusCode: res.statusCode || 0, headers: res.headers, data, raw });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      const error = new Error("Timeout API Resend durante l'invio email.");
      error.code = "RESEND_TIMEOUT";
      reject(error);
    });

    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

function resendErrorMessage(data, statusCode) {
  if (data && typeof data.message === "string" && data.message.trim()) return data.message.trim();
  if (data && typeof data.error === "string" && data.error.trim()) return data.error.trim();
  if (data && data.name && data.message) return `${data.name}: ${data.message}`;
  return `Errore Resend API HTTP ${statusCode}`;
}

function createResendMailer(config) {
  const apiKey = String((config.resend && config.resend.apiKey) || process.env.RESEND_API_KEY || "").trim();
  const apiUrl = String((config.resend && config.resend.apiUrl) || process.env.RESEND_API_URL || "https://api.resend.com/emails").trim();
  const timeoutMs = parseIntOr(process.env.RESEND_TIMEOUT_MS || process.env.EMAIL_SEND_TIMEOUT_MS, 15000);

  async function verifyConnection() {
    if (!apiKey) {
      const error = new Error("RESEND_API_KEY mancante su Render.");
      error.code = "RESEND_API_KEY_MISSING";
      throw error;
    }
    if (!config.emailFrom || !String(config.emailFrom).includes("@")) {
      const error = new Error("EMAIL_FROM non valido. Usa per esempio SynapseHub <noreply@synapsehub.live>.");
      error.code = "EMAIL_FROM_INVALID";
      throw error;
    }
    return {
      ok: true,
      mode: "resend",
      simulated: false,
    };
  }

  async function sendVerificationEmail({ to, username, verificationUrl }) {
    await verifyConnection();
    const email = buildVerificationEmail({ username, verificationUrl });
    const response = await requestJson(apiUrl, {
      method: "POST",
      timeoutMs,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        from: config.emailFrom,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      },
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const error = new Error(resendErrorMessage(response.data, response.statusCode));
      error.code = "RESEND_API_ERROR";
      error.statusCode = response.statusCode;
      error.response = response.data || response.raw;
      throw error;
    }

    return {
      mode: "resend",
      simulated: false,
      messageId: response.data && response.data.id ? response.data.id : null,
      accepted: [to],
      rejected: [],
      response: response.data || { statusCode: response.statusCode },
      preview: null,
    };
  }

  return {
    mode: "resend",
    isDevelopmentStream: false,
    verifyConnection,
    sendVerificationEmail,
  };
}

function resolve4(host, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!host) {
      reject(new Error("SMTP_HOST mancante."));
      return;
    }

    if (net.isIPv4(host)) {
      resolve(host);
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Timeout DNS IPv4 per ${host}`));
    }, timeoutMs);

    try {
      timer.unref?.();
    } catch (_error) {
      // Ignore runtimes without unref.
    }

    dns.resolve4(host, (error, addresses) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (error) {
        reject(error);
        return;
      }

      const address = Array.isArray(addresses) ? addresses.find(net.isIPv4) : null;
      if (!address) {
        reject(new Error(`Nessun indirizzo IPv4 trovato per ${host}`));
        return;
      }

      resolve(address);
    });
  });
}

function createForcedIpv4SocketFactory(config, timeoutMs) {
  return async function getSocket(_options, callback) {
    try {
      const address = await resolve4(config.smtp.host, timeoutMs);
      const socketOptions = {
        host: address,
        port: config.smtp.port,
        family: 4,
        timeout: timeoutMs,
      };

      if (config.smtp.secure) {
        socketOptions.servername = config.smtp.host;
      }

      const socket = config.smtp.secure
        ? tls.connect(socketOptions)
        : net.connect(socketOptions);

      let returned = false;

      const done = (error, result) => {
        if (returned) return;
        returned = true;
        callback(error, result);
      };

      socket.once("connect", () => {
        console.log(`[auth][email] Connessione SMTP IPv4: ${config.smtp.host} -> ${address}:${config.smtp.port}`);
        done(null, {
          connection: socket,
          secured: Boolean(config.smtp.secure),
        });
      });

      socket.once("timeout", () => {
        socket.destroy();
        const error = new Error("Timeout socket SMTP IPv4");
        error.code = "ETIMEDOUT";
        done(error);
      });

      socket.once("error", (error) => {
        done(error);
      });
    } catch (error) {
      callback(error);
    }
  };
}

function createSmtpMailer(config) {
  const smtpTimeoutMs = parseIntOr(process.env.SMTP_TIMEOUT_MS, 15000);
  const forceIpv4 = isTruthyEnv(process.env.SMTP_FORCE_IPV4, true);
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    dnsTimeout: smtpTimeoutMs,
    connectionTimeout: smtpTimeoutMs,
    greetingTimeout: smtpTimeoutMs,
    socketTimeout: smtpTimeoutMs + 5000,
    getSocket: forceIpv4 ? createForcedIpv4SocketFactory(config, smtpTimeoutMs) : undefined,
    auth: {
      user: String(config.smtp.user || "").trim(),
      pass: normalizeAppPassword(config.smtp.pass),
    },
    tls: {
      servername: config.smtp.host,
    },
  });

  async function verifyConnection() {
    await transporter.verify();
    return {
      ok: true,
      mode: "smtp",
      simulated: false,
    };
  }

  async function sendVerificationEmail({ to, username, verificationUrl }) {
    const email = buildVerificationEmail({ username, verificationUrl });
    const info = await transporter.sendMail({
      from: config.emailFrom,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    return {
      mode: "smtp",
      simulated: false,
      messageId: info.messageId || null,
      accepted: Array.isArray(info.accepted) ? info.accepted : [],
      rejected: Array.isArray(info.rejected) ? info.rejected : [],
      response: info.response || null,
      preview: info.message ? info.message.toString() : null,
    };
  }

  return {
    mode: "smtp",
    isDevelopmentStream: false,
    verifyConnection,
    sendVerificationEmail,
  };
}

function createDevelopmentMailer(config) {
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });

  async function verifyConnection() {
    return {
      ok: true,
      mode: "development-stream",
      simulated: true,
    };
  }

  async function sendVerificationEmail({ to, username, verificationUrl }) {
    const email = buildVerificationEmail({ username, verificationUrl });
    const info = await transporter.sendMail({
      from: config.emailFrom,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    console.log("[auth] Link di verifica email:", verificationUrl);
    console.log("[auth] Messaggio email di sviluppo:\n" + info.message.toString());

    return {
      mode: "development-stream",
      simulated: true,
      messageId: info.messageId || null,
      accepted: Array.isArray(info.accepted) ? info.accepted : [],
      rejected: Array.isArray(info.rejected) ? info.rejected : [],
      response: info.response || null,
      preview: info.message ? info.message.toString() : null,
    };
  }

  return {
    mode: "development-stream",
    isDevelopmentStream: true,
    verifyConnection,
    sendVerificationEmail,
  };
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

  const provider = normalizeProvider(config.emailProvider || process.env.EMAIL_PROVIDER);
  if (provider === "resend" || (!provider && process.env.RESEND_API_KEY)) {
    return createResendMailer(config);
  }

  if (config.smtp.host && config.smtp.user && config.smtp.pass) {
    return createSmtpMailer(config);
  }

  return createDevelopmentMailer(config);
}

module.exports = {
  createMailer,
};
