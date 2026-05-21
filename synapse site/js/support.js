// Modale "Invia segnalazione" + lista delle proprie segnalazioni.
// Il widget chat e' gestito separatamente da js/chat.js.
(function () {
  var appBaseUrl = (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null")
    ? window.location.origin
    : "http://localhost:3000";

  var openBtn = document.getElementById("open-report");
  var modal = document.getElementById("report-modal");
  var closeBtn = modal && modal.querySelector(".report-modal-close");
  var loginNeeded = document.getElementById("report-login-needed");
  var goLoginBtn = document.getElementById("report-go-login");
  var form = document.getElementById("form-report");
  var emailInput = document.getElementById("report-email");
  var messageInput = document.getElementById("report-message");
  var counter = document.getElementById("report-counter");
  var feedback = document.getElementById("report-message-feedback");
  var submitBtn = document.getElementById("report-submit");
  var mineSection = document.getElementById("report-mine-section");
  var mineList = document.getElementById("report-mine-list");
  var openAuthBtn = document.getElementById("open-auth-modal");

  var staffPresenceEl = document.getElementById("staff-presence");
  var staffPresenceText = document.getElementById("staff-presence-text");
  var openMyChatBtn = document.getElementById("open-my-chat");

  var currentUser = null;
  var myTickets = [];
  var myChats = [];
  var staffOnline = false;

  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }

  function setMsg(msg, type) {
    if (!feedback) return;
    feedback.textContent = msg || "";
    feedback.hidden = !msg;
    feedback.classList.remove("auth-message-error", "auth-message-success");
    if (msg) feedback.classList.add(type === "success" ? "auth-message-success" : "auth-message-error");
  }

  function statusLabel(s) {
    return ({
      pending: "In attesa",
      approved: "Approvata",
      declined: "Declinata",
      replied: "Risposta",
      in_chat: "Chat aperta",
      closed: "Chiusa",
    })[s] || s;
  }

  function updateLoginState() {
    var logged = !!currentUser;
    if (loginNeeded) loginNeeded.hidden = logged;
    if (form) form.hidden = !logged;
    if (mineSection) mineSection.hidden = !logged;
    if (logged && emailInput && !emailInput.value) emailInput.value = currentUser.email || "";
  }

  function applyStaffPresence() {
    if (!staffPresenceEl || !staffPresenceText) return;
    staffPresenceEl.setAttribute("data-online", staffOnline ? "true" : "false");
    staffPresenceText.textContent = staffOnline
      ? "Uno staff è al momento attivo: ti risponderemo a breve."
      : "Nessuno staff online in questo momento. Riceverai una risposta appena possibile.";
  }

  function refreshStaffPresence() {
    fetch(appBaseUrl + "/api/staff-presence", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) { staffOnline = !!data.online; applyStaffPresence(); }
      })
      .catch(function () { /* ignore */ });
  }

  function activeChatForUser() {
    if (!myChats || !myChats.length) return null;
    var open = myChats.find(function (c) { return c.status !== "closed"; });
    return open || null;
  }

  function refreshMyChats() {
    if (!currentUser) { myChats = []; updateChatBtn(); return; }
    fetch(appBaseUrl + "/api/chats/mine", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) { myChats = data.chats || []; updateChatBtn(); }
      })
      .catch(function () { /* ignore */ });
  }

  function updateChatBtn() {
    if (!openMyChatBtn) return;
    var chat = activeChatForUser();
    if (currentUser && !currentUser.isAdmin && chat) {
      openMyChatBtn.hidden = false;
    } else {
      openMyChatBtn.hidden = true;
    }
  }

  function openMyChat() {
    var chat = activeChatForUser();
    if (chat && window.SynapseChat && window.SynapseChat.open) window.SynapseChat.open(chat.id);
  }

  function openModal() {
    if (!modal) return;
    setMsg("", "info");
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    updateLoginState();
    if (currentUser) loadMine();
  }
  function closeModal() {
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function renderMine() {
    if (!mineList) return;
    mineList.innerHTML = "";
    if (!myTickets.length) {
      var li = document.createElement("li");
      li.className = "report-empty";
      li.textContent = "Nessuna segnalazione inviata.";
      mineList.appendChild(li);
      return;
    }
    myTickets.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "report-item";
      var head = document.createElement("div");
      head.className = "report-item-head";
      var pill = document.createElement("span");
      pill.className = "report-pill report-pill-" + t.status;
      pill.textContent = statusLabel(t.status);
      head.appendChild(pill);
      var date = document.createElement("span");
      date.className = "report-date";
      date.textContent = new Date(t.createdAt).toLocaleString();
      head.appendChild(date);
      li.appendChild(head);
      var msg = document.createElement("p");
      msg.className = "report-msg";
      msg.textContent = t.message;
      li.appendChild(msg);
      if (t.adminReply) {
        var reply = document.createElement("p");
        reply.className = "report-reply";
        reply.innerHTML = "<strong>Risposta admin:</strong> ";
        reply.appendChild(document.createTextNode(t.adminReply));
        li.appendChild(reply);
      }
      if (t.chatId && t.status !== "closed") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-ghost report-chat-btn";
        btn.textContent = "Apri chat di supporto";
        btn.addEventListener("click", function () {
          if (window.SynapseChat && window.SynapseChat.open) window.SynapseChat.open(t.chatId);
          closeModal();
        });
        li.appendChild(btn);
      }
      mineList.appendChild(li);
    });
  }

  function loadMine() {
    fetch(appBaseUrl + "/api/tickets/mine", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) { myTickets = data.tickets; renderMine(); }
      })
      .catch(function () { /* ignore */ });
  }

  function bindCounter() {
    if (!messageInput || !counter) return;
    var update = function () { counter.textContent = (messageInput.value.length || 0) + " / 10000"; };
    messageInput.addEventListener("input", update);
    update();
  }

  function submit(e) {
    e.preventDefault();
    if (!currentUser) {
      setMsg("Devi accedere per inviare una segnalazione.", "error");
      return;
    }
    setMsg("Invio in corso...", "info");
    submitBtn.disabled = true;
    fetch(appBaseUrl + "/api/tickets", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({
        email: emailInput.value.trim(),
        message: messageInput.value.trim(),
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        submitBtn.disabled = false;
        if (!resp.ok || !resp.data.ok) {
          setMsg(resp.data.message || "Invio fallito.", "error");
          return;
        }
        setMsg("Segnalazione inviata. Ti risponderemo al piu' presto.", "success");
        messageInput.value = "";
        if (counter) counter.textContent = "0 / 10000";
        loadMine();
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        setMsg("Errore di rete: " + err.message, "error");
      });
  }

  if (openBtn) openBtn.addEventListener("click", function () { openModal(); refreshStaffPresence(); });
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  if (form) form.addEventListener("submit", submit);
  if (goLoginBtn && openAuthBtn) goLoginBtn.addEventListener("click", function () { closeModal(); openAuthBtn.click(); });
  if (openMyChatBtn) openMyChatBtn.addEventListener("click", openMyChat);
  bindCounter();
  applyStaffPresence();
  refreshStaffPresence();

  document.addEventListener("synapse:auth-changed", function (ev) {
    currentUser = (ev.detail && ev.detail.user) || null;
    updateLoginState();
    if (currentUser) {
      loadMine();
      refreshMyChats();
    } else {
      myTickets = []; myChats = []; renderMine(); updateChatBtn();
    }
  });

  // Aggiornamenti realtime sui propri ticket
  document.addEventListener("synapse:ticket-mine", function (ev) {
    var t = ev.detail && ev.detail.ticket;
    if (!t) return;
    var idx = myTickets.findIndex(function (x) { return x.id === t.id; });
    if (idx >= 0) myTickets[idx] = t; else myTickets.unshift(t);
    renderMine();
  });

  // Quando l'admin apre una chat per l'utente o aggiorna una chat
  document.addEventListener("synapse:chat-available", function () { refreshMyChats(); });
  document.addEventListener("synapse:chat-event", function (ev) {
    if (ev.detail && (ev.detail.kind === "open" || ev.detail.kind === "update")) refreshMyChats();
  });

  // Presenza staff: evento SSE
  document.addEventListener("synapse:staff-presence", function (ev) {
    staffOnline = !!(ev.detail && ev.detail.online);
    applyStaffPresence();
  });

  window.SynapseSupport = { open: openModal, reload: loadMine };
})();
