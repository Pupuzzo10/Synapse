(function () {
  // Sessione per-scheda: salvata in sessionStorage (NON localStorage),
  // cosi' ogni tab ha la propria identita'. Il server riceve l'ID via header
  // x-session-id e ignora completamente i cookie.
  var SESSION_KEY = "synapse:sessionId";
  var CSRF_KEY = "synapse:csrfToken";
  function loadSessionStorage(key) { try { return sessionStorage.getItem(key) || ""; } catch (_e) { return ""; } }
  function saveSessionStorage(key, val) { try { if (val) sessionStorage.setItem(key, val); else sessionStorage.removeItem(key); } catch (_e) { /* ignore */ } }
  var sessionId = loadSessionStorage(SESSION_KEY);
  var csrfToken = loadSessionStorage(CSRF_KEY);
  function updateSessionFromPayload(payload) {
    if (!payload) return;
    if (payload.sessionId) { sessionId = payload.sessionId; saveSessionStorage(SESSION_KEY, sessionId); }
    if (payload.csrfToken) { csrfToken = payload.csrfToken; saveSessionStorage(CSRF_KEY, csrfToken); }
  }
  var modal = document.getElementById("auth-modal");
  var openBtn = document.getElementById("open-auth-modal");
  var closeBtn = modal && modal.querySelector(".auth-modal-close");
  var tabLogin = modal && modal.querySelector('[data-auth-tab="login"]');
  var tabRegister = modal && modal.querySelector('[data-auth-tab="register"]');
  var panelLogin = document.getElementById("auth-panel-login");
  var panelRegister = document.getElementById("auth-panel-register");
  var formLogin = document.getElementById("form-login");
  var formRegister = document.getElementById("form-register");
  var navUserWrap = document.getElementById("nav-user-wrap");
  var navUserLabel = document.getElementById("nav-user-label");
  var logoutBtn = document.getElementById("auth-logout");
  var authBanner = document.getElementById("auth-feedback");
  var lastFocus = null;
  var appBaseUrl = resolveAppBaseUrl();

  function resolveAppBaseUrl() {
    var configuredBaseUrl = document.documentElement.getAttribute("data-app-base-url") || "";
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/, "");
    }

    if (
      window.location.protocol !== "file:" &&
      window.location.origin &&
      window.location.origin !== "null" &&
      window.location.origin.indexOf("file:") !== 0
    ) {
      return window.location.origin;
    }

    return "http://localhost:3000";
  }

  function buildUrl(path) {
    return appBaseUrl + path;
  }

  function isNetworkFailure(error) {
    var message = (error && error.message) || "";
    return error && (error.name === "TypeError" || /Failed to fetch|NetworkError|Load failed/i.test(message));
  }

  function makeTransportError(actionLabel) {
    return new Error(
      "Impossibile completare " +
        actionLabel +
        ". Il server di autenticazione non e raggiungibile: verifica di aver aperto il sito tramite HTTP e che il backend sia attivo."
    );
  }

  function setMessage(el, msg, type) {
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.remove("is-error", "is-success", "is-info");
    if (msg) {
      el.classList.add(type === "success" ? "is-success" : type === "info" ? "is-info" : "is-error");
    }
  }

  function renderBlockedScreen(block) {
    block = block || {};
    var status = block.status === "suspended" ? "sospeso" : "bannato";
    var title = block.title || (status === "sospeso" ? "Account sospeso" : "Accesso bloccato");
    var message = block.message || "Non puoi usare questo sito.";
    try { if (window.SynapseContent && window.SynapseContent.closeEvents) window.SynapseContent.closeEvents(); } catch (_e) { /* ignore */ }
    document.title = title + " — Synapse";
    document.body.className = "blocked-page-body";
    document.body.innerHTML = "";
    var page = document.createElement("main");
    page.className = "blocked-page";
    var card = document.createElement("section");
    card.className = "blocked-page-card";
    var icon = document.createElement("div");
    icon.className = "blocked-page-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = status === "sospeso" ? "⏸" : "⚠";
    var kicker = document.createElement("p");
    kicker.className = "blocked-page-kicker";
    kicker.textContent = status === "sospeso" ? "Account sospeso" : "Account bannato";
    var h = document.createElement("h1");
    h.textContent = title;
    var p = document.createElement("p");
    p.className = "blocked-page-message";
    p.textContent = message;
    var note = document.createElement("p");
    note.className = "blocked-page-note";
    note.textContent = "Non puoi navigare, aprire ticket, usare la chat o accedere alle API finché il provvedimento resta attivo.";
    card.appendChild(icon); card.appendChild(kicker); card.appendChild(h); card.appendChild(p); card.appendChild(note);
    page.appendChild(card);
    document.body.appendChild(page);
  }

  window.SynapseBlocked = window.SynapseBlocked || { render: renderBlockedScreen };

  function clearMessages() {
    setMessage(document.getElementById("auth-message-login"), "");
    setMessage(document.getElementById("auth-message-register"), "");
    setMessage(authBanner, "");
  }

  function updateNav(user) {
    if (openBtn && navUserWrap && navUserLabel) {
      if (user) {
        openBtn.hidden = true;
        navUserWrap.hidden = false;
        navUserLabel.textContent = user.username || user.email || "Account";
      } else {
        openBtn.hidden = false;
        navUserWrap.hidden = true;
        navUserLabel.textContent = "";
      }
    }
    try {
      document.dispatchEvent(new CustomEvent("synapse:auth-changed", { detail: { user: user || null } }));
    } catch (_e) { /* ignore */ }
  }

  function authHeaders(extra) {
    var h = { "x-csrf-token": csrfToken };
    if (sessionId) h["x-session-id"] = sessionId;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  window.SynapseAuth = {
    getCsrfToken: function () { return csrfToken; },
    getSessionId: function () { return sessionId; },
    headers: authHeaders,
    // fetch helper che aggiunge automaticamente i header di sessione/CSRF
    fetch: function (path, options) {
      var opts = Object.assign({}, options || {});
      opts.headers = Object.assign({ Accept: "application/json" }, authHeaders(opts.headers || {}));
      if (opts.body && !opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
      return fetch(buildUrl(path), opts);
    },
  };

  function openModal() {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modal || modal.hasAttribute("hidden")) return;
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function switchTab(which) {
    if (!panelLogin || !panelRegister || !tabLogin || !tabRegister) return;
    var isLogin = which === "login";
    panelLogin.hidden = !isLogin;
    panelRegister.hidden = isLogin;
    tabLogin.classList.toggle("is-active", isLogin);
    tabRegister.classList.toggle("is-active", !isLogin);
    tabLogin.setAttribute("aria-selected", isLogin ? "true" : "false");
    tabRegister.setAttribute("aria-selected", !isLogin ? "true" : "false");
    setMessage(document.getElementById("auth-message-login"), "");
    setMessage(document.getElementById("auth-message-register"), "");
  }

  function setSubmitting(form, isSubmitting) {
    if (!form) return;
    var submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = isSubmitting;
      submit.setAttribute("aria-busy", isSubmitting ? "true" : "false");
    }
  }

  async function refreshCsrfToken() {
    var response;
    try {
      response = await fetch(buildUrl("/api/auth/csrf-token"), {
        headers: authHeaders({ Accept: "application/json" }),
      });
    } catch (error) {
      throw makeTransportError("l'inizializzazione della sessione");
    }

    var data = await response.json();
    updateSessionFromPayload(data);
    return data;
  }

  async function fetchJson(url, options) {
    var requestOptions = Object.assign({}, options || {});
    var failureMessage = requestOptions.failureMessage || "Richiesta non riuscita.";
    delete requestOptions.failureMessage;

    var response;
    try {
      var mergedHeaders = Object.assign(
        { "Content-Type": "application/json", Accept: "application/json" },
        authHeaders(),
        requestOptions.headers || {}
      );
      response = await fetch(
        buildUrl(url),
        Object.assign({}, requestOptions, { headers: mergedHeaders })
      );
    } catch (error) {
      if (isNetworkFailure(error)) {
        throw new Error(failureMessage);
      }
      throw error;
    }

    var payload = await response.json().catch(function () {
      return { ok: false, message: "Risposta del server non valida." };
    });

    if (!response.ok) {
      if (payload && payload.blocked && payload.block && window.SynapseBlocked) {
        window.SynapseBlocked.render(payload.block);
      }
      var error = new Error(payload.message || "Richiesta non riuscita.");
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function validateLogin(form) {
    var email = form.querySelector('[name="email"]').value.trim();
    var password = form.querySelector('[name="password"]').value;
    if (!email) return "Inserisci la tua email.";
    if (!/\S+@\S+\.\S+/.test(email)) return "Inserisci un indirizzo email valido.";
    if (!password) return "Inserisci la password.";
    return "";
  }

  function validateRegister(form) {
    var username = form.querySelector('[name="username"]').value.trim();
    var email = form.querySelector('[name="email"]').value.trim();
    var password = form.querySelector('[name="password"]').value;
    var passwordConfirm = form.querySelector('[name="passwordConfirm"]').value;

    if (username.length < 2) return "Il nome utente deve contenere almeno 2 caratteri.";
    if (!/^[a-zA-Z0-9 _.-]+$/.test(username)) {
      return "Il nome utente puo contenere solo lettere, numeri, spazi, punti, trattini e underscore.";
    }
    if (!/\S+@\S+\.\S+/.test(email)) return "Inserisci un indirizzo email valido.";
    if (!password) return "Inserisci una password.";
    if (password.length < 8) return "La password deve contenere almeno 8 caratteri.";
    if (password !== passwordConfirm) return "Le password non coincidono.";
    return "";
  }

  async function ensureAuthReady(actionLabel) {
    if (csrfToken) return;
    try {
      await refreshCsrfToken();
    } catch (error) {
      throw makeTransportError(actionLabel);
    }
  }

  async function refreshSession() {
    var response;
    try {
      response = await fetch(buildUrl("/api/auth/session"), {
        headers: authHeaders({ Accept: "application/json" }),
      });
    } catch (error) {
      throw makeTransportError("il controllo della sessione");
    }

    var data = await response.json().catch(function () { return { ok: false, message: "Risposta sessione non valida." }; });
    if (!response.ok && data && data.blocked && data.block && window.SynapseBlocked) {
      window.SynapseBlocked.render(data.block);
      return data;
    }
    updateNav(data.user || null);
    return data;
  }

  function handleVerificationFeedback() {
    var params = new URLSearchParams(window.location.search);
    var verified = params.get("verified");

    if (!verified) return;

    var message = "";
    var type = "info";

    if (verified === "success") {
      message = "Email confermata con successo. Ora puoi accedere.";
      type = "success";
      switchTab("login");
      openModal();
    } else if (verified === "expired") {
      message = "Il link di conferma e scaduto. Registrati di nuovo o contatta il supporto.";
      switchTab("register");
      openModal();
    } else if (verified === "missing" || verified === "invalid") {
      message = "Il link di conferma non e valido.";
      openModal();
    }

    setMessage(authBanner, message, type);
    params.delete("verified");
    var nextUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    window.history.replaceState({}, document.title, nextUrl);
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  if (tabLogin) {
    tabLogin.addEventListener("click", function () {
      switchTab("login");
    });
  }

  if (tabRegister) {
    tabRegister.addEventListener("click", function () {
      switchTab("register");
    });
  }

  if (formLogin) {
    formLogin.addEventListener("submit", async function (event) {
      event.preventDefault();

      var messageEl = document.getElementById("auth-message-login");
      var validationError = validateLogin(formLogin);
      if (validationError) {
        setMessage(messageEl, validationError, "error");
        return;
      }

      setSubmitting(formLogin, true);
      setMessage(messageEl, "");

      try {
        await ensureAuthReady("l'accesso");
        var payload = await fetchJson("/api/auth/login", {
          method: "POST",
          failureMessage:
            "Impossibile completare l'accesso. Il server di autenticazione non e raggiungibile o l'endpoint di login non risponde.",
          body: JSON.stringify({
            email: formLogin.querySelector('[name="email"]').value.trim(),
            password: formLogin.querySelector('[name="password"]').value,
          }),
        });

        updateSessionFromPayload(payload);
        updateNav(payload.user || null);
        formLogin.reset();
        closeModal();
        setMessage(authBanner, payload.message, "success");
      } catch (error) {
        setMessage(messageEl, error.message, "error");
      } finally {
        setSubmitting(formLogin, false);
      }
    });
  }

  if (formRegister) {
    formRegister.addEventListener("submit", async function (event) {
      event.preventDefault();

      var messageEl = document.getElementById("auth-message-register");
      var validationError = validateRegister(formRegister);
      if (validationError) {
        setMessage(messageEl, validationError, "error");
        return;
      }

      setSubmitting(formRegister, true);
      setMessage(messageEl, "");

      try {
        await ensureAuthReady("la registrazione");
        var payload = await fetchJson("/api/auth/register", {
          method: "POST",
          failureMessage:
            "Impossibile completare la registrazione. Verifica che il server sia attivo e che l'endpoint di registrazione sia raggiungibile.",
          body: JSON.stringify({
            username: formRegister.querySelector('[name="username"]').value.trim(),
            email: formRegister.querySelector('[name="email"]').value.trim(),
            password: formRegister.querySelector('[name="password"]').value,
            passwordConfirm: formRegister.querySelector('[name="passwordConfirm"]').value,
            marketingOptIn: formRegister.querySelector('[name="marketingOptIn"]').checked,
          }),
        });

        updateSessionFromPayload(payload);
        updateNav(payload.user || null);
        formRegister.reset();
        closeModal();
        setMessage(authBanner, payload.message, "success");
      } catch (error) {
        setMessage(messageEl, error.message, "error");
      } finally {
        setSubmitting(formRegister, false);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      try {
        await ensureAuthReady("la disconnessione");
        var payload = await fetchJson("/api/auth/logout", {
          method: "POST",
          failureMessage:
            "Impossibile completare la disconnessione. Il server di autenticazione non e raggiungibile.",
          body: JSON.stringify({}),
        });

        updateSessionFromPayload(payload);
        updateNav(null);
        setMessage(authBanner, payload.message, "info");
      } catch (error) {
        setMessage(authBanner, error.message, "error");
      }
    });
  }

  if (window.location.protocol === "file:") {
    window.location.replace(buildUrl("/") + window.location.search + window.location.hash);
    return;
  }

  Promise.all([refreshCsrfToken(), refreshSession()])
    .then(function () {
      clearMessages();
      handleVerificationFeedback();
    })
    .catch(function (error) {
      console.error("[auth] Bootstrap non riuscito:", error);
      updateNav(null);
    });
})();
