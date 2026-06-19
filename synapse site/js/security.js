(function () {
  var form = document.getElementById("security-search-form");
  var input = document.getElementById("security-user-id");
  var result = document.getElementById("security-result");


  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  if (!form || !input || !result) return;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setResult(className, html) {
    result.className = "security-result " + className;
    result.innerHTML = html;
  }

  function formatDate(value) {
    if (!value) return "Non disponibile";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function formatRelative(value) {
    if (!value) return "Permanente";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Non disponibile";
    var diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return "Scaduta";
    var units = [
      ["year", 1000 * 60 * 60 * 24 * 365],
      ["month", 1000 * 60 * 60 * 24 * 30],
      ["day", 1000 * 60 * 60 * 24],
      ["hour", 1000 * 60 * 60],
      ["minute", 1000 * 60],
    ];
    var formatter = new Intl.RelativeTimeFormat("it-IT", { numeric: "auto" });
    for (var i = 0; i < units.length; i += 1) {
      var unit = units[i][0];
      var size = units[i][1];
      if (diffMs >= size || unit === "minute") {
        return formatter.format(Math.ceil(diffMs / size), unit);
      }
    }
    return "tra poco";
  }

  function renderSafe(userId) {
    setResult(
      "security-result-safe",
      '<div class="security-result-kicker">Esito verifica</div>' +
        '<h3>Utente non presente nel registro</h3>' +
        '<p>L’ID <code>' + escapeHtml(userId) + '</code> non risulta attualmente segnalato nel database SynapseHub™ Security.</p>' +
        '<div class="security-result-grid">' +
        '<span><strong>Status</strong><em>Sicuro</em></span>' +
        '<span><strong>Registro</strong><em>Nessuna corrispondenza attiva</em></span>' +
        '</div>'
    );
  }

  function renderReport(report) {
    setResult(
      "security-result-danger",
      '<div class="security-result-kicker">Corrispondenza trovata</div>' +
        '<h3>Utente presente nel registro</h3>' +
        '<p>Il profilo è stato trovato tra le segnalazioni attive del sistema SynapseHub™ Security.</p>' +
        '<div class="security-result-grid">' +
        '<span><strong>Utente</strong><em>' + escapeHtml(report.userId) + '</em></span>' +
        '<span><strong>Status</strong><em>Segnalato</em></span>' +
        '<span><strong>Motivazione</strong><em>' + escapeHtml(report.motivo || "Non specificata") + '</em></span>' +
        '<span><strong>Durata</strong><em>' + escapeHtml(report.durata || "Non disponibile") + '</em></span>' +
        '<span><strong>Scadenza</strong><em>' + escapeHtml(formatRelative(report.expiresAt)) + '</em></span>' +
        '<span><strong>Registrata il</strong><em>' + escapeHtml(formatDate(report.dataSegnalazione)) + '</em></span>' +
        '</div>'
    );
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var userId = String(input.value || "").trim();

    if (!/^\d{15,25}$/.test(userId)) {
      setResult(
        "security-result-error",
        '<div class="security-result-kicker">Input non valido</div>' +
          '<h3>ID Discord non riconosciuto</h3>' +
          '<p>Inserisci solo l’ID numerico dell’utente, senza menzione e senza spazi.</p>'
      );
      return;
    }

    setResult(
      "security-result-loading",
      '<div class="security-result-kicker">Ricerca in corso</div>' +
        '<h3>Connessione al registro</h3>' +
        '<p>Stiamo verificando l’ID nel database SynapseHub™ Security.</p>'
    );

    try {
      var response = await fetch("/api/security/reports/" + encodeURIComponent(userId), {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      var payload = await response.json().catch(function () { return null; });

      if (!response.ok || !payload || !payload.ok) {
        throw new Error(payload && payload.message ? payload.message : "Verifica non disponibile.");
      }

      if (!payload.found) {
        renderSafe(userId);
        return;
      }

      renderReport(payload.report);
    } catch (error) {
      setResult(
        "security-result-error",
        '<div class="security-result-kicker">Errore verifica</div>' +
          '<h3>Registro non raggiungibile</h3>' +
          '<p>' + escapeHtml(error.message || "Non è stato possibile completare la ricerca.") + '</p>'
      );
    }
  });

  var configForm = document.getElementById("bot-config-form");
  var configStatus = document.getElementById("bot-config-status");
  var configReload = document.getElementById("bot-config-reload");
  var params = new URLSearchParams(window.location.search);
  var configAccess = {
    guild_id: params.get("guild_id") || "",
    user_id: params.get("user_id") || "",
    expires: params.get("expires") || "",
    token: params.get("token") || "",
  };

  function setConfigStatus(className, title, message) {
    if (!configStatus) return;
    configStatus.className = "security-result " + className;
    configStatus.innerHTML = '<div class="security-result-kicker">Pannello configurazione</div><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(message) + '</p>';
  }

  function idsToText(value) {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  function textToIds(value) {
    return String(value || "").match(/\d{15,25}/g) || [];
  }

  function setField(name, value) {
    if (!configForm) return;
    var field = configForm.elements[name];
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (Array.isArray(value)) {
      field.value = idsToText(value);
    } else if (value == null) {
      field.value = "";
    } else {
      field.value = String(value);
    }
  }

  function fillConfig(config) {
    if (!configForm) return;
    setField("guild_id", configAccess.guild_id);
    Object.keys(config || {}).forEach(function (key) { setField(key, config[key]); });
    configForm.hidden = false;
  }

  function readConfigForm() {
    var names = [
      "channel_id", "role_id", "report_channel_id", "admin_role_ids", "bypass_user_ids", "bypass_role_ids",
      "command_prefix", "spam_window_seconds", "spam_max_messages", "spam_duplicate_window_seconds",
      "spam_duplicate_max_messages", "spam_max_mentions", "spam_action_cooldown_seconds",
      "nuke_audit_lookback_seconds", "nuke_window_seconds", "nuke_channel_threshold", "nuke_role_threshold",
      "nuke_member_threshold", "nuke_invite_threshold", "nuke_webhook_threshold", "timeout_hours", "history_ttl_hours"
    ];
    var out = {};
    names.forEach(function (name) {
      var field = configForm.elements[name];
      if (!field) return;
      if (["admin_role_ids", "bypass_user_ids", "bypass_role_ids"].indexOf(name) !== -1) {
        out[name] = textToIds(field.value);
      } else if (field.type === "number") {
        out[name] = Number.parseInt(field.value, 10);
      } else {
        out[name] = field.value.trim();
      }
    });
    ["anti_link_enabled", "anti_spam_enabled", "anti_nuke_enabled"].forEach(function (name) {
      out[name] = Boolean(configForm.elements[name] && configForm.elements[name].checked);
    });
    return out;
  }

  async function loadBotConfig() {
    if (!configForm || !configStatus) return;
    if (!configAccess.guild_id || !configAccess.user_id || !configAccess.expires || !configAccess.token) return;
    setConfigStatus("security-result-loading", "Caricamento configurazione", "Stiamo leggendo la configurazione del server Discord.");
    try {
      var query = new URLSearchParams(configAccess).toString();
      var response = await fetch("/api/security/bot-config/" + encodeURIComponent(configAccess.guild_id) + "?" + query, { headers: { "Accept": "application/json" } });
      var payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || !payload.ok) throw new Error(payload && payload.message ? payload.message : "Configurazione non disponibile.");
      fillConfig(payload.config);
      setConfigStatus("security-result-safe", "Configurazione caricata", "Puoi modificare le impostazioni e salvarle. Le modifiche valgono solo per questo server.");
      if (window.location.hash !== "#bot-config") window.location.hash = "bot-config";
    } catch (error) {
      setConfigStatus("security-result-error", "Accesso negato", error.message || "Link non valido o scaduto.");
    }
  }

  if (configForm) {
    configForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      setConfigStatus("security-result-loading", "Salvataggio in corso", "Stiamo aggiornando la configurazione del bot.");
      try {
        var response = await fetch("/api/security/bot-config/" + encodeURIComponent(configAccess.guild_id), {
          method: "PUT",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(Object.assign({}, configAccess, { config: readConfigForm() })),
        });
        var payload = await response.json().catch(function () { return null; });
        if (!response.ok || !payload || !payload.ok) throw new Error(payload && payload.message ? payload.message : "Salvataggio non riuscito.");
        fillConfig(payload.config);
        setConfigStatus("security-result-safe", "Configurazione salvata", "Il bot userà queste impostazioni per questo server.");
      } catch (error) {
        setConfigStatus("security-result-error", "Errore salvataggio", error.message || "Non è stato possibile salvare la configurazione.");
      }
    });
  }
  if (configReload) configReload.addEventListener("click", loadBotConfig);
  loadBotConfig();

})();
