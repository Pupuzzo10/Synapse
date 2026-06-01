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
        else if (k === "html") node.innerHTML = attrs[k];
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



  function tab_websites() {
    var w = workingContent.websites = workingContent.websites || { plans: [], extras: [] };
    w.plans = w.plans || [];
    w.extras = w.extras || [];
    var box = el("div");
    box.appendChild(field("Titolo sezione", textInput(w.title, function (v) { w.title = v; })));
    box.appendChild(field("Intro sezione", textarea(w.intro, function (v) { w.intro = v; })));
    w.plans.forEach(function (plan, idx) {
      plan.features = plan.features || [];
      var card = el("div", { class: "admin-card-wrap" });
      card.appendChild(el("h4", { text: "Pacchetto sito " + (idx + 1) }));
      card.appendChild(field("Nome", textInput(plan.name, function (v) { plan.name = v; })));
      card.appendChild(field("Prezzo (senza €)", textInput(plan.price, function (v) { plan.price = v; })));
      card.appendChild(field("Badge", textInput(plan.badge, function (v) { plan.badge = v; })));
      card.appendChild(field("Frase breve", textInput(plan.tagline, function (v) { plan.tagline = v; })));
      card.appendChild(field("Consigliato per", textarea(plan.recommendedFor, function (v) { plan.recommendedFor = v; })));
      card.appendChild(field("In evidenza", checkbox(plan.featured, function (v) { plan.featured = v; })));
      var feats = el("div", { class: "admin-sublist" });
      feats.appendChild(el("h5", { text: "Cosa include" }));
      plan.features.forEach(function (f, i) {
        var row = el("div", { class: "admin-row" });
        row.appendChild(textInput(f.text, function (v) { f.text = v; }));
        row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { plan.features.splice(i, 1); renderActiveTab(); } }));
        feats.appendChild(row);
      });
      feats.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ voce", onclick: function () { plan.features.push({ text: "Nuova voce" }); renderActiveTab(); } }));
      card.appendChild(feats);
      card.appendChild(el("button", { type: "button", class: "admin-btn-remove-card", text: "Rimuovi pacchetto", onclick: function () { w.plans.splice(idx, 1); renderActiveTab(); } }));
      box.appendChild(card);
    });
    box.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ aggiungi pacchetto sito", onclick: function () {
      w.plans.push({ name: "Nuovo pacchetto sito", price: "0,00", badge: "", featured: false, tagline: "", recommendedFor: "", features: [{ text: "Voce inclusa" }] });
      renderActiveTab();
    } }));

    var extrasBox = el("div", { class: "admin-sublist" });
    extrasBox.appendChild(el("h4", { text: "Servizi extra" }));
    extrasBox.appendChild(field("Titolo extra", textInput(w.extrasTitle, function (v) { w.extrasTitle = v; })));
    w.extras.forEach(function (r, i) {
      var row = el("div", { class: "admin-row" });
      row.appendChild(textInput(r.name, function (v) { r.name = v; }));
      row.appendChild(textInput(r.price, function (v) { r.price = v; }));
      row.appendChild(textInput(r.note, function (v) { r.note = v; }));
      row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { w.extras.splice(i, 1); renderActiveTab(); } }));
      extrasBox.appendChild(row);
    });
    extrasBox.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ extra", onclick: function () { w.extras.push({ name: "Nuovo extra", price: "", note: "" }); renderActiveTab(); } }));
    box.appendChild(extrasBox);
    return box;
  }

  function tab_customServices() {
    var c = workingContent.customServices = workingContent.customServices || { services: [] };
    c.services = c.services || [];
    var box = el("div");
    box.appendChild(field("Titolo sezione", textInput(c.title, function (v) { c.title = v; })));
    box.appendChild(field("Intro sezione", textarea(c.intro, function (v) { c.intro = v; })));
    c.services.forEach(function (svc, idx) {
      svc.features = svc.features || [];
      var card = el("div", { class: "admin-card-wrap" });
      card.appendChild(el("h4", { text: "Servizio " + (idx + 1) }));
      card.appendChild(field("Titolo", textInput(svc.title, function (v) { svc.title = v; })));
      card.appendChild(field("Descrizione", textarea(svc.description, function (v) { svc.description = v; })));
      card.appendChild(field("Prezzo", textInput(svc.price, function (v) { svc.price = v; })));
      card.appendChild(field("Badge", textInput(svc.badge, function (v) { svc.badge = v; })));
      var feats = el("div", { class: "admin-sublist" });
      feats.appendChild(el("h5", { text: "Voci incluse" }));
      svc.features.forEach(function (t, i) {
        var row = el("div", { class: "admin-row" });
        row.appendChild(textInput(t, function (v) { svc.features[i] = v; }));
        row.appendChild(el("button", { type: "button", class: "admin-btn-remove", text: "×", onclick: function () { svc.features.splice(i, 1); renderActiveTab(); } }));
        feats.appendChild(row);
      });
      feats.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ voce", onclick: function () { svc.features.push("Nuova voce"); renderActiveTab(); } }));
      card.appendChild(feats);
      card.appendChild(el("button", { type: "button", class: "admin-btn-remove-card", text: "Rimuovi servizio", onclick: function () { c.services.splice(idx, 1); renderActiveTab(); } }));
      box.appendChild(card);
    });
    box.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ aggiungi servizio", onclick: function () { c.services.push({ title: "Nuovo servizio", description: "", price: "Su richiesta", badge: "", features: ["Voce inclusa"] }); renderActiveTab(); } }));
    return box;
  }

  function tab_reviews() {
    var r = workingContent.reviews = workingContent.reviews || { items: [] };
    r.items = r.items || [];
    var box = el("div");
    box.appendChild(field("Titolo sezione", textInput(r.title, function (v) { r.title = v; })));
    box.appendChild(field("Intro sezione", textarea(r.intro, function (v) { r.intro = v; })));
    box.appendChild(field("Testo valutazione", textInput(r.ratingText, function (v) { r.ratingText = v; })));
    r.items.forEach(function (item, idx) {
      var card = el("div", { class: "admin-card-wrap" });
      card.appendChild(el("h4", { text: "Recensione " + (idx + 1) }));
      card.appendChild(field("Nome", textInput(item.name, function (v) { item.name = v; })));
      card.appendChild(field("Stelle (1-5)", textInput(String(item.rating || 5), function (v) { item.rating = v; })));
      card.appendChild(field("Testo", textarea(item.text, function (v) { item.text = v; })));
      card.appendChild(el("button", { type: "button", class: "admin-btn-remove-card", text: "Rimuovi recensione", onclick: function () { r.items.splice(idx, 1); renderActiveTab(); } }));
      box.appendChild(card);
    });
    box.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "+ aggiungi recensione", onclick: function () { r.items.push({ name: "Cliente", rating: 5, text: "Ottimo servizio." }); renderActiveTab(); } }));
    return box;
  }

  var presenceCache = { clients: [], total: 0, online: false, activeIpBans: [] };
  var ipBansCache = [];
  function timeAgo(iso) {
    if (!iso) return "—";
    var seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return seconds + "s fa";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + "m fa";
    var hours = Math.round(minutes / 60);
    return hours + "h fa";
  }
  function loadPresence(after) {
    fetch(appBaseUrl + "/api/presence", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          presenceCache = data.presence || presenceCache;
          ipBansCache = presenceCache.activeIpBans || ipBansCache;
        }
        if (typeof after === "function") after();
        if (activeTab === "presence" || activeTab === "moderation") renderActiveTab();
      })
      .catch(function () { /* ignore */ });
  }
  function loadIpBans(after) {
    fetch(appBaseUrl + "/api/admin/moderation/ip-bans", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) ipBansCache = data.bans || [];
        if (typeof after === "function") after();
        if (activeTab === "presence" || activeTab === "moderation") renderActiveTab();
      })
      .catch(function () { /* ignore */ });
  }

  function isIpBanned(ip) {
    if (!ip) return false;
    return (ipBansCache || []).some(function (b) { return b.ip === ip; });
  }

  function accountStatusLabel(status) {
    return ({ active: "Attivo", suspended: "Sospeso", banned: "Bannato" })[status || "active"] || status;
  }

  function moderationUserAction(userId, action, banIp) {
    var labels = { suspend: "sospendere", ban: "bannare permanentemente", activate: "riattivare" };
    var reason = "";
    var liftIp = false;
    if (action !== "activate") {
      reason = prompt("Motivo per " + labels[action] + " l'account:", action === "ban" ? "Comportamento malevolo / spam" : "Verifica amministrativa in corso");
      if (reason == null) return;
    } else {
      if (!confirm("Riattivare questo account?")) return;
      liftIp = confirm("Sbloccare anche gli IP collegati a questo account? Consigliato se era stato bannato account + IP.");
    }
    fetch(appBaseUrl + "/api/admin/moderation/users/" + userId, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ action: action, reason: reason, banIp: banIp !== false, liftIp: liftIp }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        if (!resp.ok || !resp.data.ok) { alert(resp.data.message || "Azione non riuscita"); return; }
        loadPresence();
        loadUsers();
        loadIpBans();
      })
      .catch(function (err) { alert("Errore: " + err.message); });
  }

  function moderationIpAction(ip, action) {
    if (!ip) return;
    var reason = "";
    if (action === "ban") {
      reason = prompt("Motivo ban IP " + ip + ":", "IP collegato ad attività malevole o spam");
      if (reason == null) return;
    } else if (!confirm("Sbloccare l'IP " + ip + "?")) return;
    fetch(appBaseUrl + "/api/admin/moderation/ip", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ ip: ip, action: action, reason: reason }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        if (!resp.ok || !resp.data.ok) { alert(resp.data.message || "Azione IP non riuscita"); return; }
        loadPresence();
        loadIpBans();
      })
      .catch(function (err) { alert("Errore: " + err.message); });
  }

  function moderationUnbanAll() {
    if (!confirm("Sbloccare tutti gli account sospesi/bannati e tutti gli IP bannati attivi?")) return;
    fetch(appBaseUrl + "/api/admin/moderation/unban-all", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({}),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (resp) {
        if (!resp.ok || !resp.data.ok) { alert(resp.data.message || "Sblocco globale non riuscito"); return; }
        var result = resp.data.result || {};
        alert("Sblocco completato. Account riattivati: " + (result.users || 0) + ". IP sbloccati: " + (result.ips || 0) + ".");
        loadUsers(); loadPresence(); loadIpBans();
      })
      .catch(function (err) { alert("Errore: " + err.message); });
  }

  function appendModerationButtons(target, user, ip, ipBanned) {
    var actions = el("div", { class: "admin-ticket-actions admin-moderation-actions" });
    if (user && user.id) {
      if ((user.accountStatus || "active") === "active") {
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: "Sospendi account", onclick: function () { moderationUserAction(user.id, "suspend", false); } }));
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost admin-btn-danger", text: "Banna account + IP", onclick: function () { moderationUserAction(user.id, "ban", true); } }));
      } else {
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: "Riattiva account", onclick: function () { moderationUserAction(user.id, "activate", false); } }));
      }
    }
    if (ip) {
      var effectiveIpBanned = ipBanned || isIpBanned(ip);
      actions.appendChild(el("button", { type: "button", class: "btn btn-ghost" + (effectiveIpBanned ? "" : " admin-btn-danger"), text: effectiveIpBanned ? "Sblocca IP" : "Banna solo IP", onclick: function () { moderationIpAction(ip, effectiveIpBanned ? "lift" : "ban"); } }));
    }
    if (actions.childNodes.length) target.appendChild(actions);
  }

  function renderActiveIpBanList() {
    var wrap = el("div", { class: "admin-section-card" });
    var head = el("div", { class: "admin-tickets-head" });
    head.appendChild(el("h3", { text: "IP bannati attivi", style: "margin:0" }));
    head.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "Ricarica IP", onclick: function () { loadIpBans(); } }));
    wrap.appendChild(head);
    var list = el("div", { class: "admin-presence-list" });
    var bans = ipBansCache || [];
    if (!bans.length) {
      list.appendChild(el("p", { class: "muted small", text: "Nessun IP bannato al momento." }));
    }
    bans.forEach(function (b) {
      var row = el("div", { class: "admin-presence-row admin-ip-ban-row" });
      row.appendChild(el("strong", { text: "IP bannato: " + b.ip }));
      row.appendChild(el("span", { text: "Motivo: " + (b.reason || "—") }));
      row.appendChild(el("span", { text: "Data: " + (b.createdAt ? new Date(b.createdAt).toLocaleString() : "—") + (b.createdByUsername ? " · Admin: " + b.createdByUsername : "") }));
      appendModerationButtons(row, null, b.ip, true);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderModerationUsersList() {
    var wrap = el("div", { class: "admin-section-card" });
    var head = el("div", { class: "admin-tickets-head" });
    head.appendChild(el("h3", { text: "Account registrati", style: "margin:0" }));
    head.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "Ricarica utenti", onclick: function () { loadUsers(); loadPresence(); loadIpBans(); } }));
    wrap.appendChild(head);
    var list = el("div", { class: "admin-users-list" });
    (usersCache || []).forEach(function (u) {
      var row = el("div", { class: "admin-user-row admin-user-row-" + (u.accountStatus || "active") });
      row.appendChild(el("strong", { text: u.username + (u.isAdmin ? " · Admin" : "") + " · " + accountStatusLabel(u.accountStatus) }));
      row.appendChild(el("span", { text: u.email }));
      row.appendChild(el("span", { text: "IP registrazione: " + (u.registerIp || "—") + " · ultimo IP: " + (u.lastIp || "—") + (isIpBanned(u.lastIp || u.registerIp) ? " · IP BANNATO" : "") }));
      if (u.accountStatusReason) row.appendChild(el("span", { class: "admin-warning-text", text: "Motivo: " + u.accountStatusReason }));
      row.appendChild(el("span", { text: "Creato: " + (u.createdAt ? new Date(u.createdAt).toLocaleString() : "—") + " · Ultima attività: " + timeAgo(u.lastSeenAt) }));
      appendModerationButtons(row, u, u.lastIp || u.registerIp, isIpBanned(u.lastIp || u.registerIp));
      list.appendChild(row);
    });
    if (!usersCache.length) {
      list.appendChild(el("p", { class: "muted small", text: "Caricamento account..." }));
      loadUsers();
    }
    wrap.appendChild(list);
    return wrap;
  }

  function tab_presence() {
    var box = el("div", { class: "admin-dashboard" });
    var head = el("div", { class: "admin-page-head" });
    head.appendChild(el("div", { html: "<h3>Presenza live</h3><p class='muted small'>Monitoraggio connessioni, IP reali ricevuti dal proxy Render e possibili multi-account.</p>" }));
    head.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "Ricarica tutto", onclick: function () { loadPresence(); loadUsers(); loadIpBans(); } }));
    box.appendChild(head);
    var stats = el("div", { class: "admin-stat-grid" });
    stats.appendChild(el("div", { class: "admin-stat-card", html: "<strong>" + (presenceCache.total || 0) + "</strong><span>Connessioni attive</span>" }));
    stats.appendChild(el("div", { class: "admin-stat-card", html: "<strong>" + (presenceCache.online ? "Sì" : "No") + "</strong><span>Admin online</span>" }));
    stats.appendChild(el("div", { class: "admin-stat-card", html: "<strong>" + ((ipBansCache || []).length) + "</strong><span>IP bannati</span>" }));
    box.appendChild(stats);
    var live = el("div", { class: "admin-section-card" });
    live.appendChild(el("h3", { text: "Connessioni attive" }));
    var list = el("div", { class: "admin-presence-list" });
    (presenceCache.clients || []).forEach(function (c) {
      var linked = c.linkedAccounts || [];
      var currentAccount = linked.find(function (u) { return u.id === c.userId; }) || (c.userId ? { id: c.userId, username: c.username, email: c.email, isAdmin: c.isAdmin, accountStatus: "active" } : null);
      var row = el("div", { class: "admin-presence-row" + (linked.length > 1 ? " has-warning" : "") });
      row.appendChild(el("strong", { text: (c.username || "Visitatore") + (c.isAdmin ? " · Admin" : "") + " · " + accountStatusLabel(currentAccount && currentAccount.accountStatus) }));
      row.appendChild(el("span", { text: c.email || (c.userId ? "Account #" + c.userId : "Visitatore non registrato") }));
      row.appendChild(el("span", { text: "IP connessione: " + (c.ip || "non rilevato") + (c.ipBanned || isIpBanned(c.ip) ? " · IP BANNATO" : "") }));
      row.appendChild(el("span", { text: "Stesso IP online: " + (c.ipSharedOnlineCount || 0) + " · Account collegati: " + linked.length }));
      if (linked.length > 1) {
        row.appendChild(el("span", { class: "admin-warning-text", text: "Possibile multi-account: " + linked.map(function (u) { return (u.username || u.email) + " (" + accountStatusLabel(u.accountStatus) + ")"; }).join(", ") }));
      }
      row.appendChild(el("span", { text: "Sezione: " + (c.page || "Sito") }));
      row.appendChild(el("span", { text: "Ultima attività: " + timeAgo(c.lastSeenAt) + " · Connesso: " + timeAgo(c.connectedAt) }));
      appendModerationButtons(row, currentAccount, c.ip, c.ipBanned || isIpBanned(c.ip));
      list.appendChild(row);
    });
    if (!(presenceCache.clients || []).length) list.appendChild(el("p", { class: "muted small", text: "Nessuna connessione rilevata." }));
    live.appendChild(list);
    box.appendChild(live);
    box.appendChild(renderActiveIpBanList());
    return box;
  }

  function tab_moderation() {
    var box = el("div", { class: "admin-dashboard" });
    var head = el("div", { class: "admin-page-head" });
    head.appendChild(el("div", { html: "<h3>Moderazione</h3><p class='muted small'>Da qui puoi sospendere, bannare, riattivare account e sbloccare IP anche quando l'utente non è più online.</p>" }));
    head.appendChild(el("div", { class: "admin-head-actions" }, [
      el("button", { type: "button", class: "admin-btn-add", text: "Ricarica", onclick: function () { loadUsers(); loadIpBans(); loadPresence(); } }),
      el("button", { type: "button", class: "btn btn-ghost admin-btn-danger", text: "Sblocca tutti", onclick: moderationUnbanAll })
    ]));
    box.appendChild(head);
    box.appendChild(renderModerationUsersList());
    box.appendChild(renderActiveIpBanList());
    return box;
  }

  var usersCache = [];
  function loadUsers(after) {
    fetch(appBaseUrl + "/api/admin/users", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) usersCache = data.users || [];
        if (typeof after === "function") after();
        if (activeTab === "adminAccounts" || activeTab === "presence" || activeTab === "moderation") renderActiveTab();
      })
      .catch(function () { /* ignore */ });
  }
  function tab_adminAccounts() {
    var state = tab_adminAccounts.state = tab_adminAccounts.state || { username: "", email: "", password: "" };
    var box = el("div");
    box.appendChild(el("h3", { text: "Account amministratori" }));
    box.appendChild(field("Nome utente nuovo admin", textInput(state.username, function (v) { state.username = v; })));
    box.appendChild(field("Email nuovo admin", textInput(state.email, function (v) { state.email = v; })));
    var pass = el("input", { type: "password", value: state.password || "", minlength: "8", maxlength: "72", oninput: function (e) { state.password = e.target.value; } });
    box.appendChild(field("Password nuovo admin", pass));
    box.appendChild(el("p", { class: "muted small", text: "La password deve avere almeno 8 caratteri. L'account creato sarà subito admin e verificato." }));
    box.appendChild(el("button", { type: "button", class: "btn btn-primary", text: "Crea account admin", onclick: function () {
      fetch(appBaseUrl + "/api/admin/users/admin", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify(state),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (resp) {
          if (!resp.ok || !resp.data.ok) { alert(resp.data.message || "Errore"); return; }
          tab_adminAccounts.state = { username: "", email: "", password: "" };
          loadUsers();
        });
    } }));
    var list = el("div", { class: "admin-users-list" });
    (usersCache || []).forEach(function (u) {
      var row = el("div", { class: "admin-user-row" });
      row.appendChild(el("strong", { text: u.username + (u.isAdmin ? " · Admin" : "") + " · " + accountStatusLabel(u.accountStatus) }));
      row.appendChild(el("span", { text: u.email }));
      row.appendChild(el("span", { text: "IP registrazione: " + (u.registerIp || "—") + " · ultimo IP: " + (u.lastIp || "—") }));
      if (u.accountStatusReason) row.appendChild(el("span", { class: "admin-warning-text", text: "Motivo: " + u.accountStatusReason }));
      row.appendChild(el("span", { text: "Creato: " + new Date(u.createdAt).toLocaleString() }));
      appendModerationButtons(row, u, u.lastIp || u.registerIp, isIpBanned(u.lastIp || u.registerIp));
      list.appendChild(row);
    });
    if (!usersCache.length) {
      list.appendChild(el("p", { class: "muted small", text: "Caricamento account..." }));
      loadUsers();
    }
    box.appendChild(list);
    return box;
  }

  // === TAB TICKET (gestita lato server, non parte di workingContent) ===
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
    head.appendChild(el("h3", { text: "Ticket utenti", style: "margin:0" }));
    head.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "Ricarica", onclick: function () { loadTickets(); } }));
    box.appendChild(head);

    if (!ticketsCache.length) {
      box.appendChild(el("p", { class: "muted small", text: "Nessun ticket ricevuto. Caricamento..." }));
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


  // === TAB CHAT LIVE ===
  var chatsCache = [];
  function chatStatusLabel(s) {
    return ({ open: "Aperta", paused: "In attesa", suspended: "Sospesa", closed: "Chiusa" })[s] || s;
  }
  function loadChats(after) {
    fetch(appBaseUrl + "/api/chats", { headers: authHeaders({ Accept: "application/json" }) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) chatsCache = data.chats || [];
        if (typeof after === "function") after();
        if (activeTab === "chats") renderActiveTab();
      })
      .catch(function () { /* ignore */ });
  }
  function tab_chats() {
    var box = el("div", { class: "admin-dashboard" });
    var head = el("div", { class: "admin-page-head" });
    head.appendChild(el("div", { html: "<h3>Chat live</h3><p class='muted small'>Conversazioni aperte dai ticket. La lista si aggiorna con gli eventi realtime.</p>" }));
    head.appendChild(el("button", { type: "button", class: "admin-btn-add", text: "Ricarica chat", onclick: function () { loadChats(); } }));
    box.appendChild(head);
    var stats = el("div", { class: "admin-stat-grid" });
    var openCount = (chatsCache || []).filter(function (c) { return c.status !== "closed"; }).length;
    stats.appendChild(el("div", { class: "admin-stat-card", html: "<strong>" + openCount + "</strong><span>Chat attive</span>" }));
    stats.appendChild(el("div", { class: "admin-stat-card", html: "<strong>" + ((chatsCache || []).length) + "</strong><span>Totale chat</span>" }));
    box.appendChild(stats);
    var list = el("div", { class: "admin-chat-list" });
    if (!(chatsCache || []).length) {
      list.appendChild(el("p", { class: "muted small", text: "Nessuna chat ancora caricata." }));
      loadChats();
    }
    (chatsCache || []).forEach(function (c) {
      var card = el("div", { class: "admin-ticket admin-chat-row admin-chat-" + c.status });
      var header = el("div", { class: "admin-ticket-head" });
      header.appendChild(el("span", { class: "chat-status-pill", "data-status": c.status, text: chatStatusLabel(c.status) }));
      header.appendChild(el("span", { class: "admin-ticket-meta", text: "Chat #" + c.id + " · Ticket #" + c.ticketId + " · " + (c.username || c.userEmail || "Utente") + " · aggiornata " + timeAgo(c.updatedAt) }));
      card.appendChild(header);
      card.appendChild(el("p", { class: "muted small", text: "Admin assegnato: " + (c.adminUsername || "Staff") + " · Creata: " + (c.createdAt ? new Date(c.createdAt).toLocaleString() : "—") }));
      var actions = el("div", { class: "admin-ticket-actions" });
      actions.appendChild(el("button", { type: "button", class: "btn btn-primary", text: "Apri conversazione", onclick: function () { if (window.SynapseChat && window.SynapseChat.open) window.SynapseChat.open(c.id); } }));
      if (c.status !== "closed") {
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: "Metti in attesa", onclick: function () {
          fetch(appBaseUrl + "/api/chats/" + c.id + "/status", { method: "POST", headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ status: "paused" }) }).then(function () { loadChats(); });
        } }));
        actions.appendChild(el("button", { type: "button", class: "btn btn-ghost", text: "Riapri", onclick: function () {
          fetch(appBaseUrl + "/api/chats/" + c.id + "/status", { method: "POST", headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }), body: JSON.stringify({ status: "open" }) }).then(function () { loadChats(); });
        } }));
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
    box.appendChild(list);
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
    { id: "websites", label: "Siti web", render: tab_websites },
    { id: "customServices", label: "Altri servizi", render: tab_customServices },
    { id: "reviews", label: "Recensioni", render: tab_reviews },
    { id: "notes", label: "Note", render: tab_notes },
    { id: "promotions", label: "Promozioni", render: tab_promotions },
    { id: "tickets", label: "Ticket", render: tab_tickets },
    { id: "chats", label: "Chat live", render: tab_chats },
    { id: "presence", label: "Presenza live", render: tab_presence },
    { id: "moderation", label: "Moderazione", render: tab_moderation },
    { id: "adminAccounts", label: "Utenti / Admin", render: tab_adminAccounts },
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
    if (user && user.isAdmin) { loadTickets(); loadChats(); loadPresence(); loadUsers(); loadIpBans(); }
  });

  // Aggiornamenti realtime dei ticket per l'admin
  document.addEventListener("synapse:tickets-changed", function () {
    loadTickets();
    loadChats();
  });

  document.addEventListener("synapse:chat-event", function () {
    loadChats();
  });

  document.addEventListener("synapse:presence", function (ev) {
    presenceCache = ev.detail || presenceCache;
    ipBansCache = presenceCache.activeIpBans || ipBansCache;
    if (activeTab === "presence" || activeTab === "moderation") renderActiveTab();
  });

  document.addEventListener("synapse:users-changed", function () {
    loadUsers();
    loadPresence();
  });

  document.addEventListener("synapse:moderation-changed", function () {
    loadUsers();
    loadPresence();
    loadIpBans();
  });
})();
