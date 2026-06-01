// Chat realtime Synapse: widget stile messaggistica con typing indicator e controlli staff.
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
  var messagesEl = document.getElementById("chat-messages");
  var formEl = document.getElementById("chat-form");
  var inputEl = document.getElementById("chat-input");
  var sendBtn = document.getElementById("chat-send");
  var disabledMsg = document.getElementById("chat-disabled-msg");
  var adminControls = document.getElementById("chat-admin-controls");
  var statusSelect = document.getElementById("chat-status-select");
  var permCheckbox = document.getElementById("chat-perm-send");
  var closeResolvedBtn = document.getElementById("chat-close-resolved");
  var closeUnresolvedBtn = document.getElementById("chat-close-unresolved");
  var closureBanner = document.getElementById("chat-closure-banner");

  var currentUser = null;
  var currentChat = null;
  var currentMessages = [];
  var typingTimer = null;
  var partnerTypingTimer = null;
  var lastTypingSent = false;

  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }
  function statusLabel(s) { return ({ open: "aperta", paused: "in attesa", suspended: "sospesa", closed: "chiusa" })[s] || s; }

  function setState(state) { widget.setAttribute("data-state", state); }
  function show() { widget.removeAttribute("hidden"); if (widget.getAttribute("data-state") === "minimized" || widget.getAttribute("data-state") === "closed") setState("open"); }
  function hide() { sendTyping(false); widget.setAttribute("hidden", ""); setState("closed"); }

  function upsertMessage(message) {
    if (!message || !message.id) return;
    var exists = currentMessages.some(function (m) { return m.id === message.id; });
    if (!exists) currentMessages.push(message);
  }

  function partnerName() {
    if (!currentChat) return "Supporto";
    if (currentUser && currentUser.isAdmin) return currentChat.username || currentChat.userEmail || "Utente";
    return currentChat.adminUsername || "Staff Synapse";
  }

  function createTypingIndicator() {
    var wrap = document.createElement("div");
    wrap.className = "chat-typing-indicator";
    wrap.setAttribute("data-typing", "false");
    wrap.innerHTML = "<span></span><span></span><span></span><em></em>";
    return wrap;
  }

  function ensureTypingIndicator() {
    var typing = document.getElementById("chat-typing-indicator");
    if (!typing && messagesEl) {
      typing = createTypingIndicator();
      typing.id = "chat-typing-indicator";
      messagesEl.appendChild(typing);
    }
    return typing;
  }

  function setPartnerTyping(isTyping, name) {
    var typing = ensureTypingIndicator();
    if (!typing) return;
    typing.setAttribute("data-typing", isTyping ? "true" : "false");
    var em = typing.querySelector("em");
    if (em) em.textContent = isTyping ? ((name || partnerName()) + " sta scrivendo") : "";
    if (isTyping && messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    if (partnerTypingTimer) clearTimeout(partnerTypingTimer);
    if (isTyping) partnerTypingTimer = setTimeout(function () { setPartnerTyping(false); }, 3500);
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    var lastDay = "";
    currentMessages.forEach(function (m) {
      var d = new Date(m.createdAt);
      var day = d.toLocaleDateString();
      if (day !== lastDay) {
        lastDay = day;
        var sep = document.createElement("div");
        sep.className = "chat-day-separator";
        sep.textContent = day;
        messagesEl.appendChild(sep);
      }
      var item = document.createElement("div");
      var mine = currentUser && m.senderId === currentUser.id;
      item.className = "chat-msg chat-msg-" + m.senderRole + (mine ? " is-mine" : "");
      var bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      bubble.textContent = m.content;
      item.appendChild(bubble);
      var meta = document.createElement("span");
      meta.className = "chat-time";
      meta.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + (mine ? "  ✓✓" : "");
      item.appendChild(meta);
      messagesEl.appendChild(item);
    });
    ensureTypingIndicator();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function applyChatMeta() {
    if (!currentChat) return;
    var isAdmin = currentUser && currentUser.isAdmin;
    if (titleEl) titleEl.textContent = partnerName();
    if (statusPill) {
      statusPill.textContent = currentChat.closureReasonLabel ? statusLabel(currentChat.status) + " · " + currentChat.closureReasonLabel : statusLabel(currentChat.status);
      statusPill.setAttribute("data-status", currentChat.status);
    }
    if (closureBanner) {
      if (currentChat.closureReasonLabel) {
        closureBanner.textContent = "Conversazione conclusa: " + currentChat.closureReasonLabel + ".";
        closureBanner.hidden = false;
      } else {
        closureBanner.textContent = "";
        closureBanner.hidden = true;
      }
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
    else if (currentChat.status === "suspended") { canSend = false; disabled = "Chat sospesa dallo staff."; }
    else if (!isAdmin && currentChat.status === "paused") { canSend = false; disabled = "Lo staff ha messo la chat in attesa."; }
    else if (!isAdmin && !currentChat.userCanSend) { canSend = false; disabled = "Lo staff ha disabilitato temporaneamente l'invio."; }
    if (inputEl) inputEl.disabled = !canSend;
    if (sendBtn) sendBtn.disabled = !canSend;
    if (disabledMsg) { disabledMsg.textContent = disabled; disabledMsg.hidden = !disabled; }
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
    if (messagesEl) messagesEl.innerHTML = "<div class='chat-loading'>Caricamento chat...</div>";
    return loadChat(chatId).catch(function (err) {
      if (messagesEl) messagesEl.innerHTML = "<div class='chat-error'>" + (err.message || "Errore") + "</div>";
    });
  }

  function sendTyping(isTyping) {
    if (!currentChat || !currentUser) return;
    if (lastTypingSent === isTyping) return;
    lastTypingSent = isTyping;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/typing", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ isTyping: !!isTyping }),
    }).catch(function () {});
  }

  function scheduleTyping() {
    if (!currentChat || !inputEl || inputEl.disabled) return;
    sendTyping(true);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { sendTyping(false); }, 1600);
  }

  function sendMessage(e) {
    e.preventDefault();
    if (!currentChat || !inputEl) return;
    var content = inputEl.value.trim();
    if (!content) return;
    sendTyping(false);
    inputEl.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/messages", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ content: content }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        if (!resp.ok || !resp.data.ok) { alert(resp.data.message || "Invio fallito"); applyChatMeta(); return; }
        inputEl.value = "";
        if (resp.data.chat) currentChat = resp.data.chat;
        upsertMessage(resp.data.message);
        applyChatMeta();
        renderMessages();
      })
      .catch(function (err) { alert("Errore: " + err.message); applyChatMeta(); });
  }

  function changeStatus() {
    if (!currentChat || !statusSelect) return;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/status", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ status: statusSelect.value }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data.ok) { currentChat = data.chat; applyChatMeta(); } else alert(data.message || "Errore"); });
  }

  function closeConversation(reason) {
    if (!currentChat) return;
    var label = reason === "resolved" ? "Risolto" : "Non risolto";
    if (!confirm("Chiudere la chat come " + label + "?")) return;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/close", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ reason: reason }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data.ok) { currentChat = data.chat; applyChatMeta(); } else alert(data.message || "Errore"); })
      .catch(function (err) { alert("Errore: " + err.message); });
  }

  function changePerm() {
    if (!currentChat || !permCheckbox) return;
    fetch(appBaseUrl + "/api/chats/" + currentChat.id + "/permissions", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ userCanSend: permCheckbox.checked }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data.ok) { currentChat = data.chat; applyChatMeta(); } else alert(data.message || "Errore"); });
  }

  if (btnMin) btnMin.addEventListener("click", function () { setState(widget.getAttribute("data-state") === "minimized" ? "open" : "minimized"); });
  if (btnFull) btnFull.addEventListener("click", function () { setState(widget.getAttribute("data-state") === "fullscreen" ? "open" : "fullscreen"); });
  if (btnCloseWidget) btnCloseWidget.addEventListener("click", hide);
  if (formEl) formEl.addEventListener("submit", sendMessage);
  if (inputEl) {
    inputEl.addEventListener("input", scheduleTyping);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (formEl) formEl.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
  }
  if (statusSelect) statusSelect.addEventListener("change", changeStatus);
  if (permCheckbox) permCheckbox.addEventListener("change", changePerm);
  if (closeResolvedBtn) closeResolvedBtn.addEventListener("click", function () { closeConversation("resolved"); });
  if (closeUnresolvedBtn) closeUnresolvedBtn.addEventListener("click", function () { closeConversation("unresolved"); });

  document.addEventListener("synapse:auth-changed", function (ev) {
    currentUser = (ev.detail && ev.detail.user) || null;
    if (!currentUser) { hide(); currentChat = null; currentMessages = []; }
  });

  document.addEventListener("synapse:chat-event", function (ev) {
    var detail = ev.detail || {};
    if (detail.kind === "open") {
      document.dispatchEvent(new CustomEvent("synapse:chat-available", { detail: { chat: detail.payload } }));
    } else if (detail.kind === "message") {
      var p = detail.payload;
      if (!currentChat || p.chatId !== currentChat.id) return;
      upsertMessage(p.message);
      renderMessages();
      setPartnerTyping(false);
    } else if (detail.kind === "update") {
      var c = detail.payload;
      if (!currentChat || c.id !== currentChat.id) return;
      currentChat = c;
      applyChatMeta();
    } else if (detail.kind === "typing") {
      var t = detail.payload;
      if (!currentChat || t.chatId !== currentChat.id) return;
      if (currentUser && t.userId === currentUser.id) return;
      setPartnerTyping(!!t.isTyping, t.username);
    }
  });

  window.SynapseChat = { open: open, reload: function () { if (currentChat) return loadChat(currentChat.id); }, getCurrentChat: function () { return currentChat; } };
})();
