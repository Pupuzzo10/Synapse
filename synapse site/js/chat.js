// Widget chat di supporto: appare in basso a destra, supporta minimizza/fullscreen.
// L'admin ha controlli aggiuntivi: status (aperta/in attesa/sospesa/chiusa) + permessi utente.
(function () {
  var appBaseUrl = (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null")
    ? window.location.origin
    : "http://localhost:3000";

  var widget = document.getElementById("chat-widget");
  if (!widget) return;
  var titleEl = document.getElementById("chat-title");
  var statusPill = document.getElementById("chat-status-pill");
  var btnMin = document.getElementById("chat-min");
  var btnFull = document.getElementById("chat-full");
  var btnCloseWidget = document.getElementById("chat-close-widget");
  var bodyEl = document.getElementById("chat-body");
  var messagesEl = document.getElementById("chat-messages");
  var formEl = document.getElementById("chat-form");
  var inputEl = document.getElementById("chat-input");
  var sendBtn = document.getElementById("chat-send");
  var disabledMsg = document.getElementById("chat-disabled-msg");
  var adminControls = document.getElementById("chat-admin-controls");
  var statusSelect = document.getElementById("chat-status-select");
  var permCheckbox = document.getElementById("chat-perm-send");

  var currentUser = null;
  var currentChat = null;
  var currentMessages = [];

  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }

  function statusLabel(s) {
    return ({ open: "aperta", paused: "in attesa", suspended: "sospesa", closed: "chiusa" })[s] || s;
  }

  function setState(state) {
    widget.setAttribute("data-state", state);
  }

  function show() {
    widget.removeAttribute("hidden");
    if (widget.getAttribute("data-state") === "minimized") setState("open");
  }

  function hide() {
    widget.setAttribute("hidden", "");
    setState("closed");
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    currentMessages.forEach(function (m) {
      var item = document.createElement("div");
      var mine = currentUser && m.senderId === currentUser.id;
      item.className = "chat-msg chat-msg-" + m.senderRole + (mine ? " is-mine" : "");
      var bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      bubble.textContent = m.content;
      item.appendChild(bubble);
      var time = document.createElement("span");
      time.className = "chat-time";
      time.textContent = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      item.appendChild(time);
      messagesEl.appendChild(item);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function applyChatMeta() {
    if (!currentChat) return;
    var isAdmin = currentUser && currentUser.isAdmin;
    var partnerName = isAdmin
      ? (currentChat.username || currentChat.userEmail || "Utente")
      : (currentChat.adminUsername || "Supporto");
    if (titleEl) titleEl.textContent = "Chat con " + partnerName;
    if (statusPill) {
      statusPill.textContent = statusLabel(currentChat.status);
      statusPill.setAttribute("data-status", currentChat.status);
    }
    if (adminControls) {
      adminControls.hidden = !isAdmin;
      if (isAdmin) {
        if (statusSelect) statusSelect.value = currentChat.status;
        if (permCheckbox) permCheckbox.checked = !!currentChat.userCanSend;
      }
    }
    var canSend = true;
    var disabled = "";
    if (currentChat.status === "closed") { canSend = false; disabled = "Chat chiusa."; }
    else if (currentChat.status === "suspended") { canSend = false; disabled = "Chat sospesa dall'admin."; }
    else if (!isAdmin && currentChat.status === "paused") { canSend = false; disabled = "Chat in attesa: l'admin tornera' a breve."; }
    else if (!isAdmin && !currentChat.userCanSend) { canSend = false; disabled = "L'admin ha disabilitato l'invio."; }

    if (inputEl) inputEl.disabled = !canSend;
    if (sendBtn) sendBtn.disabled = !canSend;
    if (disabledMsg) {
      disabledMsg.textContent = disabled;
      disabledMsg.hidden = !disabled;
    }
  }

  function loadChat(chatId) {
    return fetch(appBaseUrl + "/api/chats/" + chatId, { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.message || "Errore");
        currentChat = data.chat;
        currentMessages = data.messages || [];
        applyChatMeta();
        renderMessages();
        return data;
      });
  }

  function open(chatId) {
    show();
    loadChat(chatId).catch(function (err) {
      if (messagesEl) messagesEl.innerHTML = "<div class='chat-error'>" + (err.message || "Errore") + "</div>";
    });
  }

  function sendMessage(e) {
    e.preventDefault();
    if (!currentChat || !inputEl) return;
    var content = inputEl.value.trim();
    if (!content) return;
    inputEl.disabled = true;
    sendBtn.disabled = true;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/messages", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ content }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        applyChatMeta();
        if (!resp.ok || !resp.data.ok) {
          alert(resp.data.message || "Invio fallito");
          return;
        }
        inputEl.value = "";
      })
      .catch(function (err) { alert("Errore: " + err.message); applyChatMeta(); });
  }

  function changeStatus() {
    if (!currentChat || !statusSelect) return;
    var status = statusSelect.value;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/status", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ status }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) { currentChat = data.chat; applyChatMeta(); }
        else alert(data.message || "Errore");
      });
  }

  function changePerm() {
    if (!currentChat || !permCheckbox) return;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/permissions", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ userCanSend: permCheckbox.checked }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) { currentChat = data.chat; applyChatMeta(); }
        else alert(data.message || "Errore");
      });
  }

  if (btnMin) btnMin.addEventListener("click", function () {
    setState(widget.getAttribute("data-state") === "minimized" ? "open" : "minimized");
  });
  if (btnFull) btnFull.addEventListener("click", function () {
    setState(widget.getAttribute("data-state") === "fullscreen" ? "open" : "fullscreen");
  });
  if (btnCloseWidget) btnCloseWidget.addEventListener("click", hide);
  if (formEl) formEl.addEventListener("submit", sendMessage);
  if (inputEl) inputEl.addEventListener("keydown", function (e) {
    // Enter invia, Shift+Enter va a capo.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (formEl) formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });
  if (statusSelect) statusSelect.addEventListener("change", changeStatus);
  if (permCheckbox) permCheckbox.addEventListener("change", changePerm);

  document.addEventListener("synapse:auth-changed", function (ev) {
    currentUser = (ev.detail && ev.detail.user) || null;
    if (!currentUser) { hide(); currentChat = null; }
  });

  document.addEventListener("synapse:chat-event", function (ev) {
    var detail = ev.detail || {};
    if (detail.kind === "open") {
      // Solo notifica: NON apre la finestra automaticamente.
      // L'utente vedra' la chat disponibile nel modale "Le tue segnalazioni"
      // o tramite il bottone "Hai una chat di supporto" in nav.
      document.dispatchEvent(new CustomEvent("synapse:chat-available", { detail: { chat: detail.payload } }));
    } else if (detail.kind === "message") {
      var p = detail.payload;
      if (!currentChat || p.chatId !== currentChat.id) return;
      currentMessages.push(p.message);
      renderMessages();
    } else if (detail.kind === "update") {
      var c = detail.payload;
      if (!currentChat || c.id !== currentChat.id) return;
      currentChat = c;
      applyChatMeta();
    }
  });

  window.SynapseChat = { open };
})();
