// Pannello admin: compare in navbar quando l'utente loggato ha isAdmin=true.
// Apre un modale con tab per ogni sezione del sito e permette salvataggio via PUT /api/content e /api/status.
(function () {
  var appBaseUrl = (function () {
    if (
      window.location.protocol !== "file:" &&
      window.location.origin &&
      window.location.origin !== "null"
    ) {
      return window.location.origin;
    }
    return "http://localhost:3000";
  })();

  var openBtn = document.getElementById("open-admin");
  var modal = document.getElementById("admin-modal");
  var closeBtn = modal && modal.querySelector(".admin-modal-close");
  var tabsNav = document.getElementById("admin-tabs");
  var tabsBody = document.getElementById("admin-tab-body");
  var saveBtn = document.getElementById("admin-save");
  var feedback = document.getElementById("admin-feedback");
  var statusMsg = document.getElementById("admin-status-msg");

  var workingContent = null;
  var workingStatus = null;
  var activeTab = "hero";

  function setMsg(msg, type) {
    if (!feedback) return;
    feedback.textContent = msg || "";
    feedback.hidden = !msg;
    feedback.classList.remove("is-error", "is-success", "is-info");
    if (msg) feedback.classList.add(type === "error" ? "is-error" : type === "success" ? "is-success" : "is-info");
  }

  function csrf() {
    return (window.SynapseAuth && window.SynapseAuth.getCsrfToken && window.SynapseAuth.getCsrfToken()) || "";
  }
  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "value") node.value = attrs[k];
        else if (k === "checked") node.checked = !!attrs[k];
        else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function field(label, input) {
    return el("label", { class: "admin-field" }, [el("span", { class: "admin-label", text: label }), input]);
  }

  function textInput(value, onChange) {
    return el("input", { type: "text", value: value || "", oninput: function (e) { onChange(e.target.value); } });
  }

  function textarea(value, onChange) {
    return el("textarea", { rows: "4", oninput: function (e) { onChange(e.target.value); } }, value || "");
  }

  function select(value, options, onChange) {
    var sel = el("select", { onchange: function (e) { onChange(e.target.value); } });
    options.forEach(function (opt) {
      var o = el("option", { value: opt.value, text: opt.label });
      if (opt.value === value) o.setAttribute("selected", "selected");
      sel.appendChild(o);
    });
    return sel;
  }

  function checkbox(value, onChange) {
    return el("input", { type: "checkbox", checked: !!value, onchange: function (e) { onChange(e.target.checked); } });
  }

  function planEditor(plan, onChange, onRemove, showFeatured) {
    var wrap = el("div", { class: "admin-card-editor" });
    wrap.appendChild(field("Nome", textInput(plan.name, function (v) { plan.name = v; onChange(); })));
    wrap.appendChild(field("Prezzo (senza €)", textInput(plan.price, function (v) { plan.price = v; onChange(); })));
    wrap.appendChild(field("Badge", textInput(plan.badge, function (v) { plan.badge = v; onChange(); })));
    if (showFeatured !== false) {
      wrap.appendChild(field("In evidenza", checkbox(plan.featured, function (v) { plan.featured = v; onChange(); })));
    }
    var featsWrap = el("div", { class: "admin-sublist" });
    featsWrap.appendChild(el("h5", { text: "Voci (features)" }));
    (plan.features || []).forEach(function (f, i) {
      var row = el("div", { class: "admin-row" });
      row.appendChild(textInput(f.text, function (v) { f.text = v; onChange(); }));
      if (typeof f.excluded !== "undefined") {
        row.appendChild(el("label", { class: "admin-inline" }, [
          checkbox(f.excluded, function (v) { f.excluded = v; onChange(); }),
          el("span", { text: " escluso" }),
        ]));
      }
      row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () {
        plan.features.splice(i, 1);
        onChange();
        renderActiveTab();
      } }));
      featsWrap.appendChild(row);
    });
    featsWrap.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ voce", onclick: function () {
      plan.features = plan.features || [];
      var f = { text: "Nuova voce" };
      if (plan.features[0] && typeof plan.features[0].excluded !== "undefined") f.excluded = false;
      plan.features.push(f);
      onChange();
      renderActiveTab();
    } }));
    wrap.appendChild(featsWrap);
    wrap.appendChild(el("button", { type: "button", class: "admin-btn-remove-card", text: "Rimuovi piano", onclick: onRemove }));
    return wrap;
  }

  function tab_hero() {
    var h = workingContent.hero = workingContent.hero || {};
    var box = el("div");
    box.appendChild(field("Eyebrow", textInput(h.eyebrow, function (v) { h.eyebrow = v; })));
    box.appendChild(field("Titolo", textInput(h.title, function (v) { h.title = v; })));
    box.appendChild(field("Parola evidenziata", textInput(h.titleHighlight, function (v) { h.titleHighlight = v; })));
    box.appendChild(field("Lead / descrizione", textarea(h.lead, function (v) { h.lead = v; })));
    box.appendChild(field("Prezzo di partenza (mostrato nella lead)", textInput(h.startingPrice, function (v) { h.startingPrice = v; })));
    h.ctaPrimary = h.ctaPrimary || {};
    h.ctaSecondary = h.ctaSecondary || {};
    box.appendChild(field("CTA primaria — label", textInput(h.ctaPrimary.label, function (v) { h.ctaPrimary.label = v; })));
    box.appendChild(field("CTA primaria — link", textInput(h.ctaPrimary.href, function (v) { h.ctaPrimary.href = v; })));
    box.appendChild(field("CTA secondaria — label", textInput(h.ctaSecondary.label, function (v) { h.ctaSecondary.label = v; })));
    box.appendChild(field("CTA secondaria — link", textInput(h.ctaSecondary.href, function (v) { h.ctaSecondary.href = v; })));
    return box;
  }

  function tab_about() {
    var a = workingContent.about = workingContent.about || {};
    a.features = a.features || [];
    var box = el("div");
    box.appendChild(field("Titolo", textInput(a.title, function (v) { a.title = v; })));
    box.appendChild(field("Descrizione", textarea(a.intro, function (v) { a.intro = v; })));
    box.appendChild(field("Footer (ruoli)", textInput(a.footer, function (v) { a.footer = v; })));
    var list = el("div", { class: "admin-sublist" });
    list.appendChild(el("h5", { text: "Feature list" }));
    a.features.forEach(function (f, i) {
      var row = el("div", { class: "admin-row" });
      row.appendChild(el("input", { type: "text", value: f.icon || "", style: "max-width:4rem", oninput: function (e) { f.icon = e.target.value; } }));
      row.appendChild(textInput(f.text, function (v) { f.text = v; }));
      row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { a.features.splice(i, 1); renderActiveTab(); } }));
      list.appendChild(row);
    });
    list.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ feature", onclick: function () { a.features.push({ icon: "✨", text: "Nuova" }); renderActiveTab(); } }));
    box.appendChild(list);
    return box;
  }

  function plansTab(key, defaultPlanFactory, showFeatured) {
    var root = workingContent[key] = workingContent[key] || { plans: [] };
    root.plans = root.plans || [];
    var box = el("div");
    if (root.title !== undefined || key === "bot" || key === "logos" || key === "code") {
      box.appendChild(field("Titolo sezione", textInput(root.title, function (v) { root.title = v; })));
    }
    if (root.intro !== undefined || key === "bot" || key === "logos") {
      box.appendChild(field("Intro sezione", textarea(root.intro, function (v) { root.intro = v; })));
    }
    root.plans.forEach(function (plan, idx) {
      var card = el("div", { class: "admin-card-wrap" });
      card.appendChild(el("h4", { text: "Piano " + (idx + 1) }));
      card.appendChild(planEditor(plan, function () {}, function () { root.plans.splice(idx, 1); renderActiveTab(); }, showFeatured));
      box.appendChild(card);
    });
    box.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ aggiungi piano", onclick: function () {
      root.plans.push(defaultPlanFactory());
      renderActiveTab();
    } }));
    if (key === "code") {
      box.appendChild(field("Nota legale", textarea(root.legal, function (v) { root.legal = v; })));
    }
    return box;
  }

  function tab_bot() {
    var box = plansTab("bot", function () { return { name: "Nuovo piano", price: "0,00", badge: "", featured: false, features: [{ text: "Voce", excluded: false }] }; }, true);
    var e = workingContent.bot.emojiPack = workingContent.bot.emojiPack || { title: "Emoji pack", rows: [] };
    var emojiBox = el("div", { class: "admin-sublist" });
    emojiBox.appendChild(el("h4", { text: "Emoji pack" }));
    emojiBox.appendChild(field("Titolo", textInput(e.title, function (v) { e.title = v; })));
    (e.rows || []).forEach(function (r, i) {
      var row = el("div", { class: "admin-row" });
      row.appendChild(textInput(r.quantity, function (v) { r.quantity = v; }));
      row.appendChild(textInput(r.price, function (v) { r.price = v; }));
      row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { e.rows.splice(i, 1); renderActiveTab(); } }));
      emojiBox.appendChild(row);
    });
    emojiBox.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ riga", onclick: function () { e.rows = e.rows || []; e.rows.push({ quantity: "", price: "" }); renderActiveTab(); } }));
    box.appendChild(emojiBox);
    return box;
  }

  function tab_hosting() {
    var h = workingContent.hosting = workingContent.hosting || { calloutItems: [], rows: [] };
    var box = el("div");
    box.appendChild(field("Titolo sezione", textInput(h.title, function (v) { h.title = v; })));
    box.appendChild(field("Callout — titolo", textInput(h.calloutTitle, function (v) { h.calloutTitle = v; })));
    var calloutBox = el("div", { class: "admin-sublist" });
    calloutBox.appendChild(el("h5", { text: "Callout — voci" }));
    (h.calloutItems || []).forEach(function (t, i) {
      var row = el("div", { class: "admin-row" });
      row.appendChild(textInput(t, function (v) { h.calloutItems[i] = v; }));
      row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { h.calloutItems.splice(i, 1); renderActiveTab(); } }));
      calloutBox.appendChild(row);
    });
    calloutBox.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ voce", onclick: function () { h.calloutItems = h.calloutItems || []; h.calloutItems.push(""); renderActiveTab(); } }));
    box.appendChild(calloutBox);
    box.appendChild(field("Titolo tariffe", textInput(h.tariffsTitle, function (v) { h.tariffsTitle = v; })));
    var rowsBox = el("div", { class: "admin-sublist" });
    rowsBox.appendChild(el("h5", { text: "Tariffe" }));
    (h.rows || []).forEach(function (r, i) {
      var row = el("div", { class: "admin-row" });
      row.appendChild(textInput(r.duration, function (v) { r.duration = v; }));
      row.appendChild(textInput(r.price, function (v) { r.price = v; }));
      row.appendChild(textInput(r.note, function (v) { r.note = v; }));
      row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { h.rows.splice(i, 1); renderActiveTab(); } }));
      rowsBox.appendChild(row);
    });
    rowsBox.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ tariffa", onclick: function () { h.rows = h.rows || []; h.rows.push({ duration: "", price: "", note: "—" }); renderActiveTab(); } }));
    box.appendChild(rowsBox);
    return box;
  }

  function tab_code() {
    return plansTab("code", function () { return { name: "Nuovo piano", price: "0,00", badge: "", featured: false, features: [{ text: "Voce", excluded: false }] }; }, true);
  }

  function tab_logos() {
    return plansTab("logos", function () { return { name: "Nuovo piano", price: "0,00", badge: "", featured: false, features: [{ text: "Voce" }] }; }, true);
  }

  function tab_notes() {
    var n = workingContent.notes = workingContent.notes || {};
    var box = el("div");
    box.appendChild(field("Titolo", textInput(n.title, function (v) { n.title = v; })));
    box.appendChild(field("Testo", textarea(n.body, function (v) { n.body = v; })));
    return box;
  }

  function tab_promotions() {
    var p = workingContent.promotions = workingContent.promotions || {};
    var box = el("div");
    box.appendChild(field("Titolo", textInput(p.title, function (v) { p.title = v; })));
    box.appendChild(field("Testo promozione", textarea(p.body, function (v) { p.body = v; })));
    box.appendChild(field("Footer (piccolo)", textInput(p.footer, function (v) { p.footer = v; })));
    return box;
  }

  // === TAB SEGNALAZIONI (gestita lato server, non parte di workingContent) ===
  var ticketsCache = [];
  function ticketStatusLabel(s) {
    return ({ pending: "In attesa", approved: "Approvata", declined: "Declinata", replied: "Risposta", in_chat: "Chat aperta", closed: "Chiusa" })[s] || s;
  }

  function loadTickets(after) {
    fetch(appBaseUrl + "/api/tickets", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          ticketsCache = data.tickets;
          if (typeof after === "function") after();
          if (activeTab === "tickets") renderActiveTab();
        }
      });
  }

  function ticketAction(id, action, body) {
    return fetch(appBaseUrl + "/api/tickets/" + id + "/" + action, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify(body || {}),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }

  function tab_tickets() {
    var box = el("div");
    var head = el("div", { class: "admin-tickets-head" });
    head.appendChild(el("h3", { text: "Segnalazioni utenti", style: "margin:0" }));
    head.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "Ricarica", onclick: function () { loadTickets(); } }));
    box.appendChild(head);

    if (!ticketsCache.length) {
      box.appendChild(el("p", { class: "muted small", text: "Nessuna segnalazione ricevuta. Caricamento..." }));
      loadTickets();
      return box;
    }

    ticketsCache.forEach(function (t) {
      var card = el("div", { class: "admin-ticket admin-ticket-" + t.status });
      var header = el("div", { class: "admin-ticket-head" });
      header.appendChild(el("span", { class: "report-pill report-pill-" + t.status, text: ticketStatusLabel(t.status) }));
      header.appendChild(el("span", { class: "admin-ticket-meta", text: "#" + t.id + " · " + (t.username || "Utente " + t.userId) + " · " + t.email + " · " + new Date(t.createdAt).toLocaleString() }));
      card.appendChild(header);
      card.appendChild(el("p", { class: "admin-ticket-msg", text: t.message }));
      if (t.adminReply) {
        var rep = el("p", { class: "admin-ticket-reply" });
        rep.appendChild(el("strong", { text: "Risposta: " }));
        rep.appendChild(document.createTextNode(t.adminReply));
        card.appendChild(rep);
      }

      var actions = el("div", { class: "admin-ticket-actions" });
      if (t.status === "pending") {
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: "Approva", onclick: function () {
          ticketAction(t.id, "approve").then(function () { loadTickets(); });
        } }));
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost admin-btn-danger", text: "Declina", onclick: function () {
          ticketAction(t.id, "decline").then(function () { loadTickets(); });
        } }));
      }
      actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: "Rispondi", onclick: function () {
        var reply = prompt("Scrivi la risposta da inviare all'utente (max 10000 caratteri):", t.adminReply || "");
        if (reply == null) return;
        reply = reply.trim();
        if (!reply) { alert("Risposta vuota."); return; }
        ticketAction(t.id, "reply", { reply: reply }).then(function (r) {
          if (!r.ok || !r.data.ok) alert(r.data.message || "Errore");
          loadTickets();
        });
      } }));
      actions.appendChild(el("button", { type: "button", class: "btn btn-primary", text: t.chatId ? "Apri chat" : "Apri chat di supporto", onclick: function () {
        ticketAction(t.id, "open-chat").then(function (r) {
          if (!r.ok || !r.data.ok) { alert(r.data.message || "Errore"); return; }
          loadTickets();
          if (window.SynapseChat && window.SynapseChat.open) window.SynapseChat.open(r.data.chat.id);
        });
      } }));
      card.appendChild(actions);
      box.appendChild(card);
    });
    return box;
  }

  function tab_status() {
    var s = workingStatus;
    var box = el("div");
    box.appendChild(field("Stato server", select(s.server, [
      { value: "online", label: "Online" },
      { value: "degraded", label: "Degradato" },
      { value: "offline", label: "Offline" },
    ], function (v) { s.server = v; })));
    box.appendChild(field("Stato servizio", select(s.service, [
      { value: "active", label: "Attivo" },
      { value: "maintenance", label: "Manutenzione" },
      { value: "suspended", label: "Sospeso" },
    ], function (v) { s.service = v; })));
    box.appendChild(field("Messaggio pubblico", textarea(s.message, function (v) { s.message = v; })));
    var saveStatusBtn = el("button", { type: "button", class: "btn btn-primary", text: "Salva solo lo stato", onclick: saveStatus });
    box.appendChild(saveStatusBtn);
    if (statusMsg) box.appendChild(statusMsg);
    return box;
  }

  var TABS = [
    { id: "hero", label: "Hero", render: tab_hero },
    { id: "about", label: "Chi siamo", render: tab_about },
    { id: "bot", label: "Bot + Emoji", render: tab_bot },
    { id: "hosting", label: "Hosting", render: tab_hosting },
    { id: "code", label: "Codice", render: tab_code },
    { id: "logos", label: "Loghi", render: tab_logos },
    { id: "notes", label: "Note", render: tab_notes },
    { id: "promotions", label: "Promozioni", render: tab_promotions },
    { id: "tickets", label: "Segnalazioni", render: tab_tickets },
    { id: "status", label: "Stato servizio", render: tab_status },
  ];

  function renderTabs() {
    if (!tabsNav) return;
    clear(tabsNav);
    TABS.forEach(function (t) {
      var b = el("button", { type: "button", class: "admin-tab" + (t.id === activeTab ? " is-active" : ""), text: t.label, onclick: function () { activeTab = t.id; renderTabs(); renderActiveTab(); } });
      tabsNav.appendChild(b);
    });
  }

  function renderActiveTab() {
    if (!tabsBody) return;
    clear(tabsBody);
    var t = TABS.find(function (x) { return x.id === activeTab; });
    if (t) tabsBody.appendChild(t.render());
  }

  function openModal() {
    if (!modal) return;
    setMsg("", "info");
    // Clona contenuti correnti per editing
    var current = (window.SynapseContent && window.SynapseContent.content) || {};
    var currentStatus = (window.SynapseContent && window.SynapseContent.status) || { server: "online", service: "active", message: "" };
    workingContent = JSON.parse(JSON.stringify(current));
    workingStatus = JSON.parse(JSON.stringify(currentStatus));
    renderTabs();
    renderActiveTab();
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  async function saveContent() {
    setMsg("Salvataggio in corso...", "info");
    try {
      var res = await fetch(appBaseUrl + "/api/content", {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify({ content: workingContent }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || "Errore");
      setMsg("Contenuti salvati.", "success");
      if (window.SynapseContent && window.SynapseContent.reload) window.SynapseContent.reload();
    } catch (e) {
      setMsg("Salvataggio fallito: " + e.message, "error");
    }
  }

  async function saveStatus() {
    setMsg("Salvataggio stato...", "info");
    try {
      var res = await fetch(appBaseUrl + "/api/status", {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify(workingStatus),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || "Errore");
      setMsg("Stato aggiornato.", "success");
      if (window.SynapseContent && window.SynapseContent.reload) window.SynapseContent.reload();
    } catch (e) {
      setMsg("Salvataggio stato fallito: " + e.message, "error");
    }
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (saveBtn) saveBtn.addEventListener("click", saveContent);
  if (modal) {
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  }

  // Mostra/nasconde il bottone Admin in base a user.isAdmin
  document.addEventListener("synapse:auth-changed", function (ev) {
    var user = ev.detail && ev.detail.user;
    if (openBtn) openBtn.hidden = !(user && user.isAdmin);
    if (user && user.isAdmin) loadTickets();
  });

  // Aggiornamenti realtime dei ticket per l'admin
  document.addEventListener("synapse:tickets-changed", function () {
    loadTickets();
  });
})();
