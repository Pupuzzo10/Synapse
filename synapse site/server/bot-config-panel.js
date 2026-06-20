const express = require("express");
const crypto = require("crypto");

const { getGuildConfig, setGuildConfig, sanitizeConfig, loadAllConfig } = require("./bot-config");

const ADMINISTRATOR_PERMISSION = 0x8n;
const BOT_INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1515719063739826189&permissions=8&integration_type=0&scope=bot+applications.commands";
const DISCORD_API = "https://discord.com/api/v10";
const COOKIE_NAME = "synapse.botcfg";

function base64urlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlDecode(value) {
  let text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  while (text.length % 4) text += "=";
  return Buffer.from(text, "base64").toString("utf8");
}

function sign(secret, value) {
  return crypto.createHmac("sha256", String(secret || "")).update(String(value || "")).digest("hex");
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeSignedValue(secret, payload) {
  const body = base64urlEncode(JSON.stringify(payload));
  return body + "." + sign(secret, body);
}

function readSignedValue(secret, value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 2) return null;
  if (!safeCompare(sign(secret, parts[0]), parts[1])) return null;
  try {
    return JSON.parse(base64urlDecode(parts[0]));
  } catch (_error) {
    return null;
  }
}

function publicBaseUrl(config) {
  return String(config.baseUrl || process.env.BASE_URL || "https://synapsehub.live").replace(/\/$/, "");
}

function redirectUri(config) {
  return config.discordOAuthRedirectUri || process.env.DISCORD_REDIRECT_URI || (publicBaseUrl(config) + "/api/bot-config/callback");
}

function authCookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(config.secureCookies),
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/",
  };
}

function clientConfig(config) {
  return {
    clientId: config.discordClientId || process.env.DISCORD_CLIENT_ID || "1515719063739826189",
    clientSecret: config.discordClientSecret || process.env.DISCORD_CLIENT_SECRET || "",
    botToken: config.discordBotToken || process.env.DISCORD_BOT_TOKEN || "",
  };
}

async function discordRequest(path, options = {}) {
  const headers = Object.assign({ Accept: "application/json" }, options.headers || {});
  const response = await fetch(DISCORD_API + path, Object.assign({}, options, { headers }));
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_error) { data = { raw: text }; }
  }
  if (!response.ok) {
    const error = new Error(data && data.message ? data.message : "Discord API non disponibile.");
    error.status = response.status;
    error.discord = data;
    throw error;
  }
  return data;
}

async function discordBearer(path, accessToken) {
  return discordRequest(path, { headers: { Authorization: "Bearer " + accessToken } });
}

async function discordBot(path, botToken) {
  return discordRequest(path, { headers: { Authorization: "Bot " + botToken } });
}

function hasAdministrator(guildSummary) {
  if (guildSummary && guildSummary.owner) return true;
  try {
    const permissions = BigInt(String(guildSummary && guildSummary.permissions ? guildSummary.permissions : "0"));
    return (permissions & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
  } catch (_error) {
    return false;
  }
}

function normalizeGuild(guild, botPresent) {
  return {
    id: String(guild.id),
    name: String(guild.name || "Server Discord"),
    icon: guild.icon || null,
    owner: Boolean(guild.owner),
    administrator: hasAdministrator(guild),
    bot_present: Boolean(botPresent),
    invite_url: BOT_INVITE_URL,
  };
}

function channelTypeName(type) {
  return {
    0: "Testuale",
    2: "Vocale",
    4: "Categoria",
    5: "Annunci",
    13: "Stage",
    15: "Forum",
    16: "Media",
  }[Number(type)] || "Canale";
}

function sortChannels(a, b) {
  if ((a.parent_id || "") !== (b.parent_id || "")) return String(a.parent_id || "").localeCompare(String(b.parent_id || ""));
  if ((a.position || 0) !== (b.position || 0)) return (a.position || 0) - (b.position || 0);
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function sortRoles(a, b) {
  if ((b.position || 0) !== (a.position || 0)) return (b.position || 0) - (a.position || 0);
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function sanitizeNext(value) {
  const text = String(value || "/bot-config");
  if (!text.startsWith("/")) return "/bot-config";
  if (text.startsWith("//")) return "/bot-config";
  return text.slice(0, 300);
}

function createBotConfigPanel({ config }) {
  const router = express.Router();
  const secret = config.securityDashboardSecret || process.env.SECURITY_DASHBOARD_SECRET || "synapsehub-security-dev-secret";

  function noStore(res) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }

  function readSession(req) {
    const raw = req.cookies && req.cookies[COOKIE_NAME];
    const session = readSignedValue(secret, raw);
    if (!session || !session.user || !session.access_token) return null;
    if (Number(session.expires_at || 0) <= Date.now()) return null;
    return session;
  }

  function requireSession(req, res, next) {
    const session = readSession(req);
    if (!session) return res.status(401).json({ ok: false, message: "Accedi con Discord per gestire i server." });
    req.discordSession = session;
    next();
  }

  async function userGuilds(session) {
    const guilds = await discordBearer("/users/@me/guilds", session.access_token);
    return Array.isArray(guilds) ? guilds : [];
  }

  async function botGuildIds(botToken) {
    if (!botToken) return new Set();
    try {
      const guilds = await discordBot("/users/@me/guilds", botToken);
      return new Set((Array.isArray(guilds) ? guilds : []).map(function (guild) { return String(guild.id); }));
    } catch (_error) {
      return new Set();
    }
  }

  async function fetchBotMemberRoles(botToken, guildId, userId) {
    if (!botToken) return [];
    try {
      const member = await discordBot("/guilds/" + encodeURIComponent(guildId) + "/members/" + encodeURIComponent(userId), botToken);
      return Array.isArray(member.roles) ? member.roles.map(String) : [];
    } catch (_error) {
      return [];
    }
  }

  async function canManageGuild(session, guildId) {
    const { botToken } = clientConfig(config);
    const guilds = await userGuilds(session);
    const selected = guilds.find(function (guild) { return String(guild.id) === String(guildId); });
    if (!selected) return false;
    if (hasAdministrator(selected)) return true;

    const current = getGuildConfig(config.botConfigPath, guildId);
    const configuredRoles = Array.isArray(current.admin_role_ids) ? current.admin_role_ids.map(String) : [];
    if (!configuredRoles.length) return false;
    const memberRoles = await fetchBotMemberRoles(botToken, guildId, session.user.id);
    return configuredRoles.some(function (roleId) { return memberRoles.indexOf(String(roleId)) !== -1; });
  }

  router.get("/login", function (req, res) {
    const { clientId, clientSecret } = clientConfig(config);
    if (!clientId || !clientSecret) {
      return res.status(500).send("Discord OAuth non configurato. Imposta DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET su Render.");
    }
    const next = sanitizeNext(req.query.next || "/bot-config");
    const state = makeSignedValue(secret, { next, ts: Date.now(), nonce: crypto.randomBytes(12).toString("hex") });
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri(config));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify guilds");
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  });

  router.get("/callback", async function (req, res) {
    const state = readSignedValue(secret, req.query.state || "");
    if (!state || Date.now() - Number(state.ts || 0) > 1000 * 60 * 15) {
      return res.redirect("/bot-config?error=state");
    }
    const code = String(req.query.code || "").trim();
    if (!code) return res.redirect("/bot-config?error=code");

    const { clientId, clientSecret } = clientConfig(config);
    try {
      const form = new URLSearchParams();
      form.set("client_id", clientId);
      form.set("client_secret", clientSecret);
      form.set("grant_type", "authorization_code");
      form.set("code", code);
      form.set("redirect_uri", redirectUri(config));
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
      });
      const tokenPayload = await tokenResponse.json().catch(function () { return null; });
      if (!tokenResponse.ok || !tokenPayload || !tokenPayload.access_token) throw new Error("Token OAuth non ricevuto.");

      const user = await discordBearer("/users/@me", tokenPayload.access_token);
      const expiresIn = Number(tokenPayload.expires_in || 604800);
      const session = {
        access_token: tokenPayload.access_token,
        expires_at: Date.now() + Math.max(60, expiresIn - 30) * 1000,
        user: {
          id: String(user.id),
          username: user.username,
          global_name: user.global_name || null,
          avatar: user.avatar || null,
        },
      };
      res.cookie(COOKIE_NAME, makeSignedValue(secret, session), authCookieOptions(config));
      return res.redirect(sanitizeNext(state.next));
    } catch (error) {
      return res.redirect("/bot-config?error=oauth");
    }
  });

  router.post("/logout", function (req, res) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.json({ ok: true });
  });

  router.get("/me", requireSession, async function (req, res) {
    return res.json({ ok: true, user: req.discordSession.user });
  });

  router.get("/sync", function (req, res) {
    noStore(res);
    const provided = String(req.get("x-synapse-dashboard-secret") || req.query.secret || "").trim();
    if (!provided || !safeCompare(provided, secret)) {
      return res.status(403).json({ ok: false, message: "Accesso sync non autorizzato." });
    }

    const raw = loadAllConfig(config.botConfigPath);
    const configs = {};
    Object.keys(raw).forEach(function (guildId) {
      if (/^\d{15,25}$/.test(String(guildId)) && raw[guildId] && typeof raw[guildId] === "object") {
        configs[String(guildId)] = sanitizeConfig(raw[guildId]);
      }
    });
    return res.json({ ok: true, generated_at: new Date().toISOString(), configs });
  });

  router.get("/guilds", requireSession, async function (req, res) {
    const { botToken } = clientConfig(config);
    try {
      const [guilds, present] = await Promise.all([userGuilds(req.discordSession), botGuildIds(botToken)]);
      const result = [];
      for (const guild of guilds) {
        const guildId = String(guild.id);
        const botPresent = present.has(guildId);
        if (hasAdministrator(guild)) {
          result.push(normalizeGuild(guild, botPresent));
          continue;
        }
        if (botPresent) {
          const current = getGuildConfig(config.botConfigPath, guildId);
          const adminRoles = Array.isArray(current.admin_role_ids) ? current.admin_role_ids.map(String) : [];
          if (adminRoles.length) {
            const memberRoles = await fetchBotMemberRoles(botToken, guildId, req.discordSession.user.id);
            if (adminRoles.some(function (roleId) { return memberRoles.indexOf(roleId) !== -1; })) {
              result.push(normalizeGuild(guild, true));
            }
          }
        }
      }
      return res.json({ ok: true, guilds: result, invite_url: BOT_INVITE_URL });
    } catch (error) {
      return res.status(502).json({ ok: false, message: error.message || "Impossibile leggere i server Discord." });
    }
  });

  router.get("/guilds/:guildId/meta", requireSession, async function (req, res) {
    const guildId = String(req.params.guildId || "");
    const { botToken } = clientConfig(config);
    if (!botToken) return res.status(500).json({ ok: false, message: "DISCORD_BOT_TOKEN non configurato sul sito." });
    if (!await canManageGuild(req.discordSession, guildId)) return res.status(403).json({ ok: false, message: "Non puoi gestire questo server." });
    try {
      const [channels, roles] = await Promise.all([
        discordBot("/guilds/" + encodeURIComponent(guildId) + "/channels", botToken),
        discordBot("/guilds/" + encodeURIComponent(guildId) + "/roles", botToken),
      ]);
      return res.json({
        ok: true,
        channels: (Array.isArray(channels) ? channels : []).sort(sortChannels).map(function (channel) {
          return {
            id: String(channel.id),
            name: String(channel.name || "canale"),
            type: Number(channel.type),
            type_name: channelTypeName(channel.type),
            parent_id: channel.parent_id ? String(channel.parent_id) : null,
            position: Number(channel.position || 0),
          };
        }),
        roles: (Array.isArray(roles) ? roles : []).filter(function (role) {
          return String(role.id) !== guildId && !role.managed;
        }).sort(sortRoles).map(function (role) {
          return {
            id: String(role.id),
            name: String(role.name || "ruolo"),
            color: Number(role.color || 0),
            position: Number(role.position || 0),
            hoist: Boolean(role.hoist),
          };
        }),
      });
    } catch (error) {
      return res.status(error.status || 502).json({ ok: false, message: error.message || "Impossibile leggere canali e ruoli." });
    }
  });

  router.get("/guilds/:guildId/config", requireSession, async function (req, res) {
    noStore(res);
    const guildId = String(req.params.guildId || "");
    if (!await canManageGuild(req.discordSession, guildId)) return res.status(403).json({ ok: false, message: "Non puoi gestire questo server." });
    return res.json({ ok: true, guildId, config: getGuildConfig(config.botConfigPath, guildId) });
  });

  router.put("/guilds/:guildId/config", requireSession, express.json({ limit: "64kb" }), async function (req, res) {
    noStore(res);
    const guildId = String(req.params.guildId || "");
    if (!await canManageGuild(req.discordSession, guildId)) return res.status(403).json({ ok: false, message: "Non puoi gestire questo server." });
    const saved = setGuildConfig(config.botConfigPath, guildId, req.body && req.body.config ? req.body.config : {});
    return res.json({ ok: true, guildId, config: saved, saved_at: new Date().toISOString() });
  });

  return router;
}

module.exports = {
  createBotConfigPanel,
};
