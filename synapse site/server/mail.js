const nodemailer = require("nodemailer");

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
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
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
