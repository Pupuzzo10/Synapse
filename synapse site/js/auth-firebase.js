(function () {
  var cfg = window.SYNAPSE_AUTH_CONFIG || {};
  var fbCfg = cfg.firebase || {};

  function firebaseReady() {
    return (
      typeof firebase !== "undefined" &&
      fbCfg.apiKey &&
      fbCfg.apiKey.indexOf("INSERISCI") === -1 &&
      fbCfg.projectId &&
      fbCfg.projectId.indexOf("INSERISCI") === -1
    );
  }

  var auth = null;
  var db = null;

  if (firebaseReady()) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(fbCfg);
      }
      auth = firebase.auth();
      db = firebase.firestore();
    } catch (e) {
      console.error("Firebase init:", e);
    }
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
  var lastFocus = null;

  function showAuthError(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

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
    showAuthError(document.getElementById("auth-error-login"), "");
    showAuthError(document.getElementById("auth-error-register"), "");
  }

  function updateNav(user) {
    if (!openBtn || !navUserWrap || !navUserLabel) return;
    if (user) {
      openBtn.hidden = true;
      navUserWrap.hidden = false;
      navUserLabel.textContent = user.displayName || user.email || "Account";
    } else {
      openBtn.hidden = false;
      navUserWrap.hidden = true;
      navUserLabel.textContent = "";
    }
  }

  if (auth) {
    auth.onAuthStateChanged(function (user) {
      updateNav(user);
    });
  } else {
    updateNav(null);
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  if (tabLogin)
    tabLogin.addEventListener("click", function () {
      switchTab("login");
    });
  if (tabRegister)
    tabRegister.addEventListener("click", function () {
      switchTab("register");
    });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (auth) {
        auth.signOut().catch(function () {});
      }
    });
  }

  function mapAuthError(code) {
    var map = {
      "auth/email-already-in-use": "Questa email è già registrata.",
      "auth/invalid-email": "Email non valida.",
      "auth/weak-password": "Password troppo debole (min. 8 caratteri, lettera e numero).",
      "auth/user-not-found": "Nessun account con questa email.",
      "auth/wrong-password": "Password errata.",
      "auth/invalid-credential": "Email o password non corretti.",
      "auth/too-many-requests": "Troppi tentativi. Riprova più tardi.",
      "auth/network-request-failed": "Errore di rete. Controlla la connessione.",
    };
    return map[code] || "Si è verificato un errore. Riprova.";
  }

  if (formLogin) {
    formLogin.addEventListener("submit", function (e) {
      e.preventDefault();
      var errEl = document.getElementById("auth-error-login");
      showAuthError(errEl, "");
      if (!auth) {
        showAuthError(
          errEl,
          "Firebase non è attivo: apri il file js/auth-config.js e sostituisci tutti i valori INSERISCI_* con quelli della tua app (Firebase Console → Impostazioni progetto → App Web). Poi abilita «Email/Password» in Authentication."
        );
        return;
      }
      var email = formLogin.querySelector('[name="email"]').value.trim();
      var password = formLogin.querySelector('[name="password"]').value;
      auth
        .signInWithEmailAndPassword(email, password)
        .then(function () {
          closeModal();
          formLogin.reset();
        })
        .catch(function (er) {
          showAuthError(errEl, mapAuthError(er.code));
        });
    });
  }

  if (formRegister) {
    formRegister.addEventListener("submit", function (e) {
      e.preventDefault();
      var errEl = document.getElementById("auth-error-register");
      showAuthError(errEl, "");
      if (!auth || !db) {
        showAuthError(
          errEl,
          "Firebase non è attivo: in js/auth-config.js inserisci la config reale dell’app Web, abilita Email/Password in Authentication e crea Firestore Database nel progetto."
        );
        return;
      }
      var username = formRegister.querySelector('[name="username"]').value.trim();
      var email = formRegister.querySelector('[name="email"]').value.trim();
      var password = formRegister.querySelector('[name="password"]').value;
      var password2 = formRegister.querySelector('[name="password2"]').value;
      var marketing = formRegister.querySelector('[name="marketing"]').checked;

      if (username.length < 2) {
        showAuthError(errEl, "Inserisci un nome utente di almeno 2 caratteri.");
        return;
      }
      if (password.length < 8) {
        showAuthError(errEl, "La password deve avere almeno 8 caratteri.");
        return;
      }
      if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        showAuthError(errEl, "La password deve contenere almeno una lettera e un numero.");
        return;
      }
      if (password !== password2) {
        showAuthError(errEl, "Le password non coincidono.");
        return;
      }

      auth
        .createUserWithEmailAndPassword(email, password)
        .then(function (cred) {
          return cred.user
            .updateProfile({ displayName: username })
            .then(function () {
              return db.collection("userProfiles").doc(cred.user.uid).set({
                username: username,
                email: email,
                marketingOptIn: marketing,
                marketingConsentAt: marketing ? firebase.firestore.FieldValue.serverTimestamp() : null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              });
            })
            .then(function () {
              return cred.user.reload();
            });
        })
        .then(function () {
          closeModal();
          formRegister.reset();
        })
        .catch(function (er) {
          showAuthError(errEl, mapAuthError(er.code));
        });
    });
  }
})();
