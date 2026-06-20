(function () {
  "use strict";

  var app = document.getElementById("bot-config-app");
  var statusBox = document.getElementById("bot-config-status");
  var loginLink = document.getElementById("bot-config-login");
  var logoutButton = document.getElementById("bot-config-logout");
  var guildSelect = document.getElementById("bot-config-guild-select");
  var guildList = document.getElementById("bot-config-guild-list");
  var form = document.getElementById("bot-config-form");
  var userName = document.getElementById("bot-config-user-name");
  var userId = document.getElementById("bot-config-user-id");
  var selectedTitle = document.getElementById("bot-config-selected-title");
  var selectedSubtitle = document.getElementById("bot-config-selected-subtitle");

  var state = {
    user: null,
    guilds: [],
    selectedGuild: null,
    channels: [],
    roles: [],
    config: null,
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(className, title, message, actionHtml) {
    if (!statusBox) return;
    statusBox.className = "security-result " + className + " bot-config-status";
    statusBox.innerHTML = '<div class="security-result-kicker">Pannello bot</div>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<p>' + escapeHtml(message) + '</p>' +
      (actionHtml || "");
  }

  function currentPathWithQuery() {
    return window.location.pathname + window.location.search;
  }

  function textToIds(value) {
    return String(value || "").match(/\d{15,25}/g) || [];
  }

  function idsToText(value) {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  function withCacheBuster(url) {
    var separator = url.indexOf("?") === -1 ? "?" : "&";
    return url + separator + "_synapse_ts=" + Date.now();
  }

  async function fetchJson(url, options) {
    var method = options && options.method ? String(options.method).toUpperCase() : "GET";
    var finalUrl = method === "GET" ? withCacheBuster(url) : url;
    var response = await fetch(finalUrl, Object.assign({ headers: { Accept: "application/json", "Cache-Control": "no-cache" }, cache: "no-store" }, options || {}));
    var payload = await response.json().catch(function () { return null; });
    if (!response.ok || !payload || !payload.ok) {
      throw new Error(payload && payload.message ? payload.message : "Operazione non disponibile.");
    }
    return payload;
  }

  function updateLoginLink() {
    if (!loginLink) return;
    loginLink.href = "/api/bot-config/login?next=" + encodeURIComponent(currentPathWithQuery());
  }

  function guildIconUrl(guild) {
    if (!guild || !guild.icon) return "";
    return "https://cdn.discordapp.com/icons/" + encodeURIComponent(guild.id) + "/" + encodeURIComponent(guild.icon) + ".png?size=96";
  }

  function renderGuildList() {
    if (!guildSelect || !guildList) return;
    guildSelect.innerHTML = "";
    guildList.innerHTML = "";

    if (!state.guilds.length) {
      guildSelect.innerHTML = '<option value="">Nessun server gestibile trovato</option>';
      guildList.innerHTML = '<div class="bot-config-empty-card">Non risultano server gestibili. Devi avere Administrator nel server oppure un ruolo admin gia configurato nel bot.</div>';
      return;
    }

    state.guilds.forEach(function (guild) {
      var option = document.createElement("option");
      option.value = guild.id;
      option.textContent = guild.name + (guild.bot_present ? "" : " · bot non presente");
      guildSelect.appendChild(option);

      var card = document.createElement("button");
      card.type = "button";
      card.className = "bot-config-guild-card" + (guild.bot_present ? "" : " bot-config-guild-card-muted");
      card.dataset.guildId = guild.id;
      var icon = guildIconUrl(guild);
      card.innerHTML = '<span class="bot-config-guild-avatar">' + (icon ? '<img src="' + escapeHtml(icon) + '" alt="" />' : escapeHtml((guild.name || "S").charAt(0))) + '</span>' +
        '<span><strong>' + escapeHtml(guild.name) + '</strong><small>' + (guild.bot_present ? "Configurabile" : "Invita il bot per configurarlo") + '</small></span>';
      card.addEventListener("click", function () { selectGuild(guild.id); });
      guildList.appendChild(card);
    });
  }

  function markSelectedGuild() {
    var selectedId = state.selectedGuild && state.selectedGuild.id;
    Array.prototype.forEach.call(document.querySelectorAll(".bot-config-guild-card"), function (card) {
      card.classList.toggle("is-active", card.dataset.guildId === selectedId);
    });
    if (guildSelect && selectedId) guildSelect.value = selectedId;
  }

  function channelLabel(channel) {
    return "# " + channel.name + " · " + channel.type_name;
  }

  function fillChannelSelect(select, value) {
    select.innerHTML = '<option value="">Non configurato</option>';
    state.channels.filter(function (channel) {
      return [0, 5, 15, 16].indexOf(Number(channel.type)) !== -1;
    }).forEach(function (channel) {
      var option = document.createElement("option");
      option.value = channel.id;
      option.textContent = channelLabel(channel);
      select.appendChild(option);
    });
    select.value = value ? String(value) : "";
  }

  function fillRoleSelect(select, value) {
    select.innerHTML = '<option value="">Non configurato</option>';
    state.roles.forEach(function (role) {
      var option = document.createElement("option");
      option.value = role.id;
      option.textContent = "@" + role.name;
      select.appendChild(option);
    });
    select.value = value ? String(value) : "";
  }

  function fillRolePickList(container, selectedIds) {
    var selected = new Set((selectedIds || []).map(String));
    container.innerHTML = "";
    if (!state.roles.length) {
      container.innerHTML = '<span class="muted small">Nessun ruolo leggibile.</span>';
      return;
    }
    state.roles.forEach(function (role) {
      var id = "role-" + container.dataset.name + "-" + role.id;
      var label = document.createElement("label");
      label.className = "bot-config-role-option";
      label.innerHTML = '<input type="checkbox" id="' + escapeHtml(id) + '" value="' + escapeHtml(role.id) + '" ' + (selected.has(String(role.id)) ? "checked" : "") + ' />' +
        '<span>@' + escapeHtml(role.name) + '</span>';
      container.appendChild(label);
    });
  }

  function selectedRoles(name) {
    var container = document.querySelector('[data-name="' + name + '"]');
    if (!container) return [];
    return Array.prototype.map.call(container.querySelectorAll('input[type="checkbox"]:checked'), function (item) {
      return item.value;
    });
  }

  function setField(name, value) {
    if (!form) return;
    var field = form.elements[name];
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (Array.isArray(value)) {
      field.value = idsToText(value);
    } else {
      field.value = value == null ? "" : String(value);
    }
  }

  function normalizeCommandPrefix(value) {
    var text = String(value == null ? "/" : value).trim();
    if (!text) return "/";
    if (text.length > 8) text = text.slice(0, 8);
    return text;
  }

  function fillForm(config) {
    if (!form) return;
    state.config = config || {};
    selectedTitle.textContent = state.selectedGuild ? state.selectedGuild.name : "Server selezionato";
    selectedSubtitle.textContent = state.selectedGuild ? "Guild ID " + state.selectedGuild.id + " · canali e ruoli caricati da Discord" : "Canali e ruoli caricati da Discord";

    Array.prototype.forEach.call(form.querySelectorAll("select[data-channel-select]"), function (select) {
      fillChannelSelect(select, config[select.name]);
    });
    Array.prototype.forEach.call(form.querySelectorAll("select[data-role-select]"), function (select) {
      fillRoleSelect(select, config[select.name]);
    });
    fillRolePickList(document.getElementById("admin-role-ids"), config.admin_role_ids);
    fillRolePickList(document.getElementById("bypass-role-ids"), config.bypass_role_ids);

    [
      "command_prefix", "bypass_user_ids", "anti_link_enabled", "anti_spam_enabled", "anti_nuke_enabled",
      "spam_window_seconds", "spam_max_messages", "spam_duplicate_window_seconds", "spam_duplicate_max_messages",
      "spam_max_mentions", "spam_action_cooldown_seconds", "nuke_audit_lookback_seconds", "nuke_window_seconds",
      "nuke_channel_threshold", "nuke_role_threshold", "nuke_member_threshold", "nuke_invite_threshold",
      "nuke_webhook_threshold", "timeout_hours", "history_ttl_hours"
    ].forEach(function (name) { setField(name, config[name]); });

    if (!form.elements.command_prefix.value) form.elements.command_prefix.value = "/";
    form.elements.command_prefix.value = normalizeCommandPrefix(form.elements.command_prefix.value);
    form.hidden = false;
  }

  function readForm() {
    var out = {};
    ["channel_id", "role_id", "report_channel_id", "command_prefix"].forEach(function (name) {
      out[name] = form.elements[name] ? String(form.elements[name].value || "").trim() : "";
    });
    out.command_prefix = normalizeCommandPrefix(out.command_prefix);
    out.admin_role_ids = selectedRoles("admin_role_ids");
    out.bypass_role_ids = selectedRoles("bypass_role_ids");
    out.bypass_user_ids = textToIds(form.elements.bypass_user_ids && form.elements.bypass_user_ids.value);
    ["anti_link_enabled", "anti_spam_enabled", "anti_nuke_enabled"].forEach(function (name) {
      out[name] = Boolean(form.elements[name] && form.elements[name].checked);
    });
    [
      "spam_window_seconds", "spam_max_messages", "spam_duplicate_window_seconds", "spam_duplicate_max_messages",
      "spam_max_mentions", "spam_action_cooldown_seconds", "nuke_audit_lookback_seconds", "nuke_window_seconds",
      "nuke_channel_threshold", "nuke_role_threshold", "nuke_member_threshold", "nuke_invite_threshold",
      "nuke_webhook_threshold", "timeout_hours", "history_ttl_hours"
    ].forEach(function (name) {
      out[name] = Number.parseInt(form.elements[name] && form.elements[name].value, 10);
    });
    return out;
  }

  async function selectGuild(guildId) {
    var guild = state.guilds.find(function (item) { return String(item.id) === String(guildId); });
    state.selectedGuild = guild || null;
    markSelectedGuild();
    form.hidden = true;

    if (!guild) return;
    if (!guild.bot_present) {
      setStatus("security-result-error", "Bot non presente nel server", "Invita SynapseHub™ Security nel server selezionato, poi ricarica il pannello.", '<a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(guild.invite_url) + '">Invita il bot</a>');
      return;
    }

    setStatus("security-result-loading", "Caricamento server", "Sto leggendo canali, ruoli e configurazione da Discord.");
    try {
      var meta = await fetchJson("/api/bot-config/guilds/" + encodeURIComponent(guild.id) + "/meta");
      var cfg = await fetchJson("/api/bot-config/guilds/" + encodeURIComponent(guild.id) + "/config");
      state.channels = meta.channels || [];
      state.roles = meta.roles || [];
      fillForm(cfg.config || {});
      setStatus("security-result-safe", "Server caricato", "Modifica le impostazioni usando menu canali e ruoli, poi salva.");
      var url = new URL(window.location.href);
      url.searchParams.set("guild_id", guild.id);
      window.history.replaceState({}, "", url.toString());
    } catch (error) {
      setStatus("security-result-error", "Errore caricamento", error.message || "Non posso leggere questo server.");
    }
  }

  async function loadSession() {
    updateLoginLink();
    var preferredGuild = new URLSearchParams(window.location.search).get("guild_id") || "";
    try {
      var me = await fetchJson("/api/bot-config/me");
      state.user = me.user;
      if (userName) userName.textContent = state.user.global_name || state.user.username || "Account Discord";
      if (userId) userId.textContent = "ID " + state.user.id;
      if (logoutButton) logoutButton.hidden = false;
      if (app) app.hidden = false;
      setStatus("security-result-loading", "Caricamento server", "Sto cercando i server Discord che puoi amministrare.");
      var guildPayload = await fetchJson("/api/bot-config/guilds");
      state.guilds = guildPayload.guilds || [];
      renderGuildList();
      if (!state.guilds.length) {
        setStatus("security-result-error", "Nessun server disponibile", "Non hai server gestibili oppure il bot non riesce a leggere le autorizzazioni Discord.");
        return;
      }
      var selected = state.guilds.find(function (guild) { return String(guild.id) === String(preferredGuild); }) || state.guilds[0];
      if (guildSelect) guildSelect.addEventListener("change", function () { selectGuild(guildSelect.value); });
      await selectGuild(selected.id);
    } catch (error) {
      if (app) app.hidden = true;
      setStatus("security-result-empty", "Accedi con Discord", "Il pannello è riservato agli amministratori dei server. Effettua l'accesso per continuare.", '<a class="btn btn-primary" href="' + escapeHtml(loginLink.href) + '">Accedi con Discord</a>');
    }
  }

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!state.selectedGuild) return;
      var cfg = readForm();
      setStatus("security-result-loading", "Salvataggio in corso", "Sto aggiornando la configurazione del server selezionato.");
      try {
        var payload = await fetchJson("/api/bot-config/guilds/" + encodeURIComponent(state.selectedGuild.id) + "/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ config: cfg }),
        });
        var verifyPayload = await fetchJson("/api/bot-config/guilds/" + encodeURIComponent(state.selectedGuild.id) + "/config").catch(function () { return payload; });
        fillForm((verifyPayload && verifyPayload.config) || payload.config || cfg);
        setStatus("security-result-safe", "Configurazione salvata", "Le impostazioni sono state salvate per questo server. Il bot le sincronizzerà entro pochi secondi.");
      } catch (error) {
        setStatus("security-result-error", "Errore salvataggio", error.message || "Non è stato possibile salvare.");
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
      await fetch("/api/bot-config/logout", { method: "POST", headers: { Accept: "application/json" } }).catch(function () {});
      window.location.href = "/bot-config";
    });
  }

  loadSession();
})();
