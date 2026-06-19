(function () {
  // Sessione persistente: salvata in localStorage così il login resta valido
  // anche quando l'utente rientra nel sito. sessionStorage resta come fallback
  // per chi arriva da una versione precedente.
  var SESSION_KEY = "synapse:sessionId";
  var CSRF_KEY = "synapse:csrfToken";
  function readStore(store, key) { try { return store && store.getItem(key) || ""; } catch (_e) { return ""; } }
  function writeStore(store, key, val) { try { if (!store) return; if (val) store.setItem(key, val); else store.removeItem(key); } catch (_e) { /* ignore */ } }
  function loadStoredValue(key) { return readStore(window.localStorage, key) || readStore(window.sessionStorage, key); }
  function saveStoredValue(key, val) { writeStore(window.localStorage, key, val); writeStore(window.sessionStorage, key, val); }
  function clearStoredSession() { saveStoredValue(SESSION_KEY, ""); saveStoredValue(CSRF_KEY, ""); }
  var sessionId = loadStoredValue(SESSION_KEY);
  var csrfToken = loadStoredValue(CSRF_KEY);
  function updateSessionFromPayload(payload) {
    if (!payload) return;
    if (payload.sessionId) { sessionId = payload.sessionId; saveStoredValue(SESSION_KEY, sessionId); }
    if (payload.csrfToken) { csrfToken = payload.csrfToken; saveStoredValue(CSRF_KEY, csrfToken); }
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
  var adminBtn = document.getElementById("open-admin");
  var authBanner = document.getElementById("auth-feedback");
  var resendVerificationBtn = document.getElementById("resend-verification-email");
  var currentUser = null;
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

  function fetchWithTimeout(url, options, timeoutMs) {
    var ms = timeoutMs || 30000;
    if (!window.AbortController) return fetch(url, options);

    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, ms);
    var opts = Object.assign({}, options || {}, { signal: controller.signal });

    return fetch(url, opts).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function isNetworkFailure(error) {
    var message = (error && error.message) || "";
    return error && (error.name === "AbortError" || error.name === "TypeError" || /Failed to fetch|NetworkError|Load failed/i.test(message));
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
    var status = block.status === "suspended" ? "sospeso" : block.status === "closed" ? "chiuso" : "bannato";
    var title = block.title || (status === "sospeso" ? "Account sospeso" : status === "chiuso" ? "Account chiuso" : "Accesso bloccato");
    var message = block.message || "Non puoi usare questo sito.";
    if (block.forceLogout || block.status === "closed") clearStoredSession();
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
    icon.textContent = status === "sospeso" ? "⏸" : status === "chiuso" ? "✕" : "⚠";
    var kicker = document.createElement("p");
    kicker.className = "blocked-page-kicker";
    kicker.textContent = status === "sospeso" ? "Account sospeso" : status === "chiuso" ? "Account chiuso" : "Account bannato";
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

  function hideResendVerification() {
    if (!resendVerificationBtn) return;
    resendVerificationBtn.hidden = true;
    resendVerificationBtn.disabled = false;
    resendVerificationBtn.removeAttribute("data-email");
    resendVerificationBtn.textContent = "Rinvia email di conferma";
  }

  function showResendVerification(email) {
    if (!resendVerificationBtn) return;
    resendVerificationBtn.hidden = false;
    resendVerificationBtn.disabled = false;
    resendVerificationBtn.setAttribute("data-email", email || "");
    resendVerificationBtn.textContent = "Rinvia email di conferma";
  }

  function clearMessages() {
    setMessage(document.getElementById("auth-message-login"), "");
    setMessage(document.getElementById("auth-message-register"), "");
    setMessage(authBanner, "");
    hideResendVerification();
  }

  function staffRoleLabel(user) {
    var role = String((user && (user.staffRole || user.staff_role)) || (user && user.isAdmin ? "ceo" : "user")).toLowerCase();
    return { support: "Supporto Clienti", manager: "Manager", ceo: "CEO", user: "Admin" }[role] || "Admin";
  }

  function updateNav(user) {
    currentUser = user || null;
    if (openBtn && navUserWrap && navUserLabel) {
      if (user) {
        openBtn.hidden = true;
        navUserWrap.hidden = false;
        navUserLabel.textContent = user.username || user.email || "Account";
        navUserLabel.title = user.username || user.email || "Account";
        if (adminBtn) adminBtn.textContent = user.isAdmin ? staffRoleLabel(user) : "Admin";
      } else {
        openBtn.hidden = false;
        navUserWrap.hidden = true;
        navUserLabel.textContent = "";
        navUserLabel.removeAttribute("title");
        if (adminBtn) adminBtn.textContent = "Admin";
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
    getCurrentUser: function () { return currentUser; },
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
    hideResendVerification();
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
      response = await fetchWithTimeout(buildUrl("/api/auth/csrf-token"), {
        headers: authHeaders({ Accept: "application/json" }),
      }, 15000);
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
      response = await fetchWithTimeout(
        buildUrl(url),
        Object.assign({}, requestOptions, { headers: mergedHeaders }),
        requestOptions.timeoutMs || 30000
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
      response = await fetchWithTimeout(buildUrl("/api/auth/session"), {
        headers: authHeaders({ Accept: "application/json" }),
      }, 15000);
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
        if (error && error.payload && error.payload.requiresEmailVerification) {
          showResendVerification(formLogin.querySelector('[name="email"]').value.trim());
        } else {
          hideResendVerification();
        }
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
          timeoutMs: 20000,
          failureMessage:
            "Impossibile completare la registrazione entro 20 secondi. Controlla i log Render e la configurazione SMTP.",
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
        var registerMessageType = payload.emailDelivery && !payload.emailDelivery.ok ? "error" : payload.emailDelivery && payload.emailDelivery.simulated ? "info" : "success";
        setMessage(authBanner, payload.message, registerMessageType);
      } catch (error) {
        setMessage(messageEl, error.message, "error");
      } finally {
        setSubmitting(formRegister, false);
      }
    });
  }

  if (resendVerificationBtn) {
    resendVerificationBtn.addEventListener("click", async function () {
      var messageEl = document.getElementById("auth-message-login");
      var email = resendVerificationBtn.getAttribute("data-email") || (formLogin && formLogin.querySelector('[name="email"]') ? formLogin.querySelector('[name="email"]').value.trim() : "");
      if (!email) {
        setMessage(messageEl, "Inserisci l'email dell'account e riprova.", "error");
        return;
      }

      resendVerificationBtn.disabled = true;
      resendVerificationBtn.textContent = "Invio in corso...";

      try {
        await ensureAuthReady("il reinvio dell'email di conferma");
        var payload = await fetchJson("/api/auth/resend-verification", {
          method: "POST",
          failureMessage: "Impossibile reinviare l'email di conferma. Verifica che il server sia attivo.",
          body: JSON.stringify({ email: email }),
        });
        setMessage(messageEl, payload.message || "Email di conferma reinviata.", payload.simulated ? "info" : "success");
      } catch (error) {
        setMessage(messageEl, error.message, "error");
      } finally {
        resendVerificationBtn.disabled = false;
        resendVerificationBtn.textContent = "Rinvia email di conferma";
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
        if (payload && !payload.user) clearStoredSession();
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

  (sessionId ? refreshSession().then(refreshCsrfToken) : refreshCsrfToken().then(refreshSession))
    .then(function () {
      clearMessages();
      handleVerificationFeedback();
    })
    .catch(function (error) {
      console.error("[auth] Bootstrap non riuscito:", error);
      updateNav(null);
    });
})();
