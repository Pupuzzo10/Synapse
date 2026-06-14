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
})();
