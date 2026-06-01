// Sistema ticket utente: apertura generica o contestuale da schede prodotto.
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
  var titleEl = document.getElementById("report-modal-title");
  var orderTicketBtn = document.getElementById("open-order-ticket");

  var currentUser = null;
  var myTickets = [];
  var myChats = [];
  var staffOnline = false;
  var currentContext = null;

  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }

  function setMsg(msg, type) {
    if (!feedback) return;
    feedback.textContent = msg || "";
    feedback.hidden = !msg;
    feedback.classList.remove("auth-message-error", "auth-message-success", "is-info");
    if (msg) feedback.classList.add(type === "success" ? "auth-message-success" : type === "info" ? "is-info" : "auth-message-error");
  }

  function statusLabel(s) {
    return ({ pending: "In attesa", approved: "Approvato", declined: "Declinato", replied: "Risposto", in_chat: "Chat aperta", closed: "Chiuso" })[s] || s;
  }

  function updateStaticLabels() {
    if (openBtn) {
      openBtn.textContent = "Apri ticket";
      openBtn.title = "Apri un ticket con lo staff";
    }
    if (titleEl) titleEl.textContent = currentContext ? "Ticket informazioni prodotto" : "Apri un ticket";
    var label = document.querySelector('label[for="report-message"], #form-report .auth-label');
    var submit = submitBtn;
    if (submit) submit.textContent = currentContext ? "Apri ticket e chat" : "Invia ticket";
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
      ? "Staff online adesso: la chat può essere presa in carico rapidamente."
      : "Nessuno staff online in questo momento: il ticket resta salvato e aggiornato in automatico.";
  }

  function refreshStaffPresence() {
    fetch(appBaseUrl + "/api/staff-presence", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data && data.ok) { staffOnline = !!data.online; applyStaffPresence(); } })
      .catch(function () {});
  }

  function activeChatForUser() {
    if (!myChats || !myChats.length) return null;
    var open = myChats.find(function (c) { return c.status !== "closed"; });
    return open || null;
  }

  function hasActiveSupportTicket() {
    return (myTickets || []).some(function (t) { return ["closed", "declined"].indexOf(t.status) === -1; });
  }

  function applySupportLimit() {
    if (!form || !currentUser) return;
    var blocked = hasActiveSupportTicket();
    if (messageInput) messageInput.disabled = blocked;
    if (submitBtn) submitBtn.disabled = blocked;
    if (blocked) setMsg("Hai già un ticket aperto. Usa la chat attiva oppure attendi la chiusura del ticket corrente.", "error");
  }

  function refreshMyChats() {
    if (!currentUser) { myChats = []; updateChatBtn(); return; }
    fetch(appBaseUrl + "/api/chats/mine", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data && data.ok) { myChats = data.chats || []; updateChatBtn(); } })
      .catch(function () {});
  }

  function updateChatBtn() {
    if (!openMyChatBtn) return;
    var chat = activeChatForUser();
    if (currentUser && !currentUser.isAdmin && chat) {
      openMyChatBtn.hidden = false;
      openMyChatBtn.textContent = "Chat supporto";
    } else openMyChatBtn.hidden = true;
  }

  function openMyChat() {
    var chat = activeChatForUser();
    if (chat && window.SynapseChat && window.SynapseChat.open) window.SynapseChat.open(chat.id);
  }

  function applyContext(context) {
    currentContext = context || null;
    updateStaticLabels();
    if (!messageInput) return;
    if (currentContext && currentContext.message) messageInput.value = currentContext.message;
    else if (!messageInput.value) messageInput.value = "";
    updateCounter();
  }

  function openModal(context) {
    if (!modal) return;
    applyContext(context || null);
    setMsg("", "info");
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    updateLoginState();
    refreshStaffPresence();
    if (currentUser) { loadMine(); refreshMyChats(); }
    if (messageInput && !messageInput.disabled) setTimeout(function () { messageInput.focus(); }, 40);
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
    currentContext = null;
    updateStaticLabels();
  }

  function renderMine() {
    if (!mineList) return;
    mineList.innerHTML = "";
    if (!myTickets.length) {
      var li = document.createElement("li");
      li.className = "report-empty";
      li.textContent = "Nessun ticket aperto.";
      mineList.appendChild(li);
      if (messageInput) messageInput.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
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
      var subj = document.createElement("strong");
      subj.className = "report-subject";
      subj.textContent = t.subject || (t.productName ? "Informazioni su " + t.productName : "Ticket #" + t.id);
      li.appendChild(subj);
      var msg = document.createElement("p");
      msg.className = "report-msg";
      msg.textContent = t.message;
      li.appendChild(msg);
      if (t.adminReply) {
        var reply = document.createElement("p");
        reply.className = "report-reply";
        reply.innerHTML = "<strong>Risposta staff:</strong> ";
        reply.appendChild(document.createTextNode(t.adminReply));
        li.appendChild(reply);
      }
      if (t.chatId && t.status !== "closed") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-primary report-chat-btn";
        btn.textContent = "Apri chat";
        btn.addEventListener("click", function () {
          if (window.SynapseChat && window.SynapseChat.open) window.SynapseChat.open(t.chatId);
          closeModal();
        });
        li.appendChild(btn);
      }
      mineList.appendChild(li);
    });
    applySupportLimit();
  }

  function loadMine() {
    if (!currentUser) return Promise.resolve();
    return fetch(appBaseUrl + "/api/tickets/mine", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data && data.ok) { myTickets = data.tickets || []; renderMine(); } })
      .catch(function () {});
  }

  function updateCounter() {
    if (counter && messageInput) counter.textContent = (messageInput.value.length || 0) + " / 10000";
  }
  function bindCounter() { if (messageInput) messageInput.addEventListener("input", updateCounter); updateCounter(); }

  function submit(e) {
    e.preventDefault();
    if (!currentUser) { setMsg("Devi accedere per aprire un ticket.", "error"); return; }
    if (hasActiveSupportTicket()) { setMsg("Hai già un ticket aperto. Apri la chat attiva o attendi la chiusura.", "error"); return; }
    var message = messageInput ? messageInput.value.trim() : "";
    if (!message) { setMsg("Descrivi la richiesta prima di inviare il ticket.", "error"); return; }
    setMsg("Apertura ticket in corso...", "info");
    if (submitBtn) submitBtn.disabled = true;
    var payload = {
      email: emailInput ? emailInput.value.trim() : (currentUser.email || ""),
      message: message,
      subject: currentContext && currentContext.subject ? currentContext.subject : "Ticket supporto Synapse",
      category: currentContext && currentContext.category ? currentContext.category : "Supporto",
      productName: currentContext && currentContext.productName ? currentContext.productName : "",
      autoOpenChat: !!(currentContext && currentContext.autoOpenChat),
    };
    fetch(appBaseUrl + "/api/tickets", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        if (submitBtn) submitBtn.disabled = false;
        if (!resp.ok || !resp.data.ok) { setMsg(resp.data.message || "Apertura ticket fallita.", "error"); return; }
        setMsg(resp.data.chat ? "Ticket aperto. Chat avviata." : "Ticket aperto. Lo staff lo prenderà in carico.", "success");
        if (messageInput) messageInput.value = "";
        updateCounter();
        loadMine();
        refreshMyChats();
        if (resp.data.chat && window.SynapseChat && window.SynapseChat.open) {
          window.SynapseChat.open(resp.data.chat.id);
          closeModal();
        }
      })
      .catch(function (err) { if (submitBtn) submitBtn.disabled = false; setMsg("Errore di rete: " + err.message, "error"); });
  }

  if (openBtn) openBtn.addEventListener("click", function () { openModal(null); });
  if (orderTicketBtn) orderTicketBtn.addEventListener("click", function () { openModal({
    subject: "Richiesta generale Synapse",
    category: "Informazioni generali",
    productName: "Richiesta generale",
    autoOpenChat: true,
    message: "Ciao Synapse, vorrei aprire un ticket generale per ricevere informazioni sui servizi disponibili."
  }); });
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  if (form) form.addEventListener("submit", submit);
  if (goLoginBtn && openAuthBtn) goLoginBtn.addEventListener("click", function () { closeModal(); openAuthBtn.click(); });
  if (openMyChatBtn) openMyChatBtn.addEventListener("click", openMyChat);
  bindCounter();
  applyStaffPresence();
  updateStaticLabels();
  refreshStaffPresence();

  document.addEventListener("synapse:open-ticket", function (ev) { openModal(ev.detail || null); });

  document.addEventListener("synapse:auth-changed", function (ev) {
    currentUser = (ev.detail && ev.detail.user) || null;
    updateLoginState();
    if (currentUser) { loadMine(); refreshMyChats(); }
    else { myTickets = []; myChats = []; renderMine(); updateChatBtn(); }
  });

  function upsertMineTicket(t) {
    if (!t) return;
    var idx = myTickets.findIndex(function (x) { return x.id === t.id; });
    if (idx >= 0) myTickets[idx] = t; else myTickets.unshift(t);
    renderMine();
  }

  document.addEventListener("synapse:ticket-mine", function (ev) { upsertMineTicket(ev.detail && ev.detail.ticket); });
  document.addEventListener("synapse:ticket-update", function (ev) { upsertMineTicket(ev.detail && ev.detail.ticket); });
  document.addEventListener("synapse:chat-available", function () { refreshMyChats(); });
  document.addEventListener("synapse:chat-event", function (ev) {
    if (ev.detail && (ev.detail.kind === "open" || ev.detail.kind === "update" || ev.detail.kind === "message")) refreshMyChats();
  });
  document.addEventListener("synapse:staff-presence", function (ev) { staffOnline = !!(ev.detail && ev.detail.online); applyStaffPresence(); });

  window.SynapseSupport = { open: openModal, openFor: openModal, reload: loadMine };
})();
