// Rende tutti i contenuti dinamici del sito a partire da GET /api/content e /api/status.
// Il DOM contiene dei placeholder con id dedicati che vengono popolati qui.
(function () {
  var appBaseUrl = (function () {
    var cfg = document.documentElement.getAttribute("data-app-base-url") || "";
    if (cfg) return cfg.replace(/\/+$/, "");
    if (
      window.location.protocol !== "file:" &&
      window.location.origin &&
      window.location.origin !== "null"
    ) {
      return window.location.origin;
    }
    return "http://localhost:3000";
  })();

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
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

  function renderHero(hero) {
    var eyebrow = document.getElementById("hero-eyebrow");
    var title = document.getElementById("hero-title");
    var lead = document.getElementById("hero-lead");
    var ctaP = document.getElementById("hero-cta-primary");
    var ctaS = document.getElementById("hero-cta-secondary");

    if (eyebrow) eyebrow.textContent = hero.eyebrow || "";
    if (title) {
      clear(title);
      var t = hero.title || "";
      var hl = hero.titleHighlight || "";
      if (hl && t.indexOf(hl) !== -1) {
        var parts = t.split(hl);
        title.appendChild(document.createTextNode(parts[0]));
        title.appendChild(el("span", { class: "gradient-text", text: hl }));
        title.appendChild(document.createTextNode(parts.slice(1).join(hl)));
      } else {
        title.textContent = t;
      }
    }
    if (lead) {
      var leadText = hero.lead || "";
      if (hero.startingPrice) {
        leadText += " A partire da " + hero.startingPrice + ".";
      }
      lead.textContent = leadText;
    }
    if (ctaP && hero.ctaPrimary) {
      ctaP.textContent = hero.ctaPrimary.label || "";
      ctaP.setAttribute("href", hero.ctaPrimary.href || "#");
    }
    if (ctaS && hero.ctaSecondary) {
      ctaS.textContent = hero.ctaSecondary.label || "";
      ctaS.setAttribute("href", hero.ctaSecondary.href || "#");
    }
  }

  function renderAbout(about) {
    var title = document.getElementById("about-title");
    var intro = document.getElementById("about-intro");
    var list = document.getElementById("about-features");
    var footer = document.getElementById("about-footer");
    if (title) title.textContent = about.title || "";
    if (intro) intro.textContent = about.intro || "";
    if (list) {
      clear(list);
      (about.features || []).forEach(function (f) {
        var li = el("li");
        li.appendChild(el("span", { class: "icon", text: f.icon || "" }));
        li.appendChild(document.createTextNode(" " + (f.text || "")));
        list.appendChild(li);
      });
    }
    if (footer) footer.textContent = about.footer || "";
  }

  function renderPlanCard(plan) {
    var card = el("article", { class: "card card-plan" + (plan.featured ? " card-featured" : "") });
    if (plan.badge) card.appendChild(el("span", { class: "badge", text: plan.badge }));
    card.appendChild(el("h3", { text: plan.name || "" }));
    var priceP = el("p", { class: "price" + (plan.price === "0,00" ? " price-zero" : "") });
    priceP.appendChild(el("span", { class: "currency", text: "€" }));
    priceP.appendChild(document.createTextNode(plan.price || ""));
    card.appendChild(priceP);
    var ul = el("ul", { class: "checklist" });
    (plan.features || []).forEach(function (f) {
      var li = el("li", { text: f.text || "" });
      if (f.excluded) li.className = "no";
      ul.appendChild(li);
    });
    card.appendChild(ul);
    return card;
  }

  function renderLogoCard(plan) {
    var card = el("article", { class: "card card-logo" + (plan.featured ? " card-featured" : "") });
    if (plan.badge) card.appendChild(el("span", { class: "badge", text: plan.badge }));
    card.appendChild(el("h3", { text: plan.name || "" }));
    var priceP = el("p", { class: "price" + (plan.price === "0,00" ? " price-zero" : "") });
    priceP.appendChild(el("span", { class: "currency", text: "€" }));
    priceP.appendChild(document.createTextNode(plan.price || ""));
    card.appendChild(priceP);
    var ul = el("ul", { class: "bullet-list" });
    (plan.features || []).forEach(function (f) {
      ul.appendChild(el("li", { text: f.text || "" }));
    });
    card.appendChild(ul);
    return card;
  }

  function renderBot(bot) {
    var title = document.getElementById("bot-title");
    var intro = document.getElementById("bot-intro");
    var cards = document.getElementById("bot-cards");
    if (title) title.textContent = bot.title || "";
    if (intro) intro.textContent = bot.intro || "";
    if (cards) {
      clear(cards);
      (bot.plans || []).forEach(function (p) {
        cards.appendChild(renderPlanCard(p));
      });
    }
    var emojiTitle = document.getElementById("emoji-title");
    var emojiBody = document.getElementById("emoji-tbody");
    if (bot.emojiPack) {
      if (emojiTitle) emojiTitle.textContent = bot.emojiPack.title || "";
      if (emojiBody) {
        clear(emojiBody);
        (bot.emojiPack.rows || []).forEach(function (r) {
          var tr = el("tr");
          tr.appendChild(el("td", { text: r.quantity || "" }));
          tr.appendChild(el("td", { text: r.price || "" }));
          emojiBody.appendChild(tr);
        });
      }
    }
  }

  function renderHosting(h) {
    var title = document.getElementById("hosting-title");
    var calloutTitle = document.getElementById("hosting-callout-title");
    var calloutList = document.getElementById("hosting-callout-list");
    var tariffsTitle = document.getElementById("hosting-tariffs-title");
    var tbody = document.getElementById("hosting-tbody");
    if (title) title.textContent = h.title || "";
    if (calloutTitle) calloutTitle.textContent = h.calloutTitle || "";
    if (calloutList) {
      clear(calloutList);
      (h.calloutItems || []).forEach(function (t) {
        calloutList.appendChild(el("li", { text: t }));
      });
    }
    if (tariffsTitle) tariffsTitle.textContent = h.tariffsTitle || "";
    if (tbody) {
      clear(tbody);
      (h.rows || []).forEach(function (r) {
        var tr = el("tr");
        tr.appendChild(el("td", { text: r.duration || "" }));
        tr.appendChild(el("td", { text: r.price || "" }));
        tr.appendChild(el("td", { text: r.note || "" }));
        tbody.appendChild(tr);
      });
    }
  }

  function renderCode(c) {
    var title = document.getElementById("code-title");
    var cards = document.getElementById("code-cards");
    var legal = document.getElementById("code-legal");
    if (title) title.textContent = c.title || "";
    if (cards) {
      clear(cards);
      (c.plans || []).forEach(function (p) {
        cards.appendChild(renderPlanCard(p));
      });
    }
    if (legal) legal.textContent = c.legal || "";
  }

  function renderNotes(n) {
    var title = document.getElementById("notes-title");
    var body = document.getElementById("notes-body");
    if (title) title.textContent = n.title || "";
    if (body) body.textContent = n.body || "";
  }

  function renderLogos(l) {
    var title = document.getElementById("logos-title");
    var intro = document.getElementById("logos-intro");
    var cards = document.getElementById("logos-cards");
    if (title) title.textContent = l.title || "";
    if (intro) intro.textContent = l.intro || "";
    if (cards) {
      clear(cards);
      (l.plans || []).forEach(function (p) {
        cards.appendChild(renderLogoCard(p));
      });
    }
  }

  function renderPromotions(p) {
    var title = document.getElementById("promo-title");
    var body = document.getElementById("promo-body");
    var footer = document.getElementById("promo-footer");
    if (title) title.textContent = p.title || "";
    if (body) body.textContent = p.body || "";
    if (footer) footer.textContent = p.footer || "";
  }



  function renderWebsiteCard(plan) {
    var card = el("article", { class: "card card-website" + (plan.featured ? " card-featured" : "") });
    if (plan.badge) card.appendChild(el("span", { class: "badge", text: plan.badge }));
    card.appendChild(el("h3", { text: plan.name || "" }));
    if (plan.tagline) card.appendChild(el("p", { class: "card-tagline", text: plan.tagline }));
    var priceP = el("p", { class: "price" });
    priceP.appendChild(el("span", { class: "currency", text: "€" }));
    priceP.appendChild(document.createTextNode(plan.price || ""));
    card.appendChild(priceP);
    var ul = el("ul", { class: "bullet-list" });
    (plan.features || []).forEach(function (f) { ul.appendChild(el("li", { text: f.text || "" })); });
    card.appendChild(ul);
    if (plan.recommendedFor) card.appendChild(el("p", { class: "muted small", text: "Consigliato per: " + plan.recommendedFor }));
    return card;
  }

  function renderWebsites(w) {
    var title = document.getElementById("websites-title");
    var intro = document.getElementById("websites-intro");
    var cards = document.getElementById("websites-cards");
    var extrasTitle = document.getElementById("websites-extras-title");
    var extrasBody = document.getElementById("websites-extras-tbody");
    if (title) title.textContent = w.title || "";
    if (intro) intro.textContent = w.intro || "";
    if (cards) {
      clear(cards);
      (w.plans || []).forEach(function (p) { cards.appendChild(renderWebsiteCard(p)); });
    }
    if (extrasTitle) extrasTitle.textContent = w.extrasTitle || "Servizi extra opzionali";
    if (extrasBody) {
      clear(extrasBody);
      (w.extras || []).forEach(function (r) {
        var tr = el("tr");
        tr.appendChild(el("td", { text: r.name || "" }));
        tr.appendChild(el("td", { text: r.price || "" }));
        tr.appendChild(el("td", { text: r.note || "" }));
        extrasBody.appendChild(tr);
      });
    }
  }

  function renderCustomServices(c) {
    var section = document.getElementById("custom-services");
    var title = document.getElementById("custom-services-title");
    var intro = document.getElementById("custom-services-intro");
    var cards = document.getElementById("custom-services-cards");
    var services = c.services || [];
    if (section) section.hidden = !services.length;
    if (title) title.textContent = c.title || "";
    if (intro) intro.textContent = c.intro || "";
    if (cards) {
      clear(cards);
      services.forEach(function (svc) {
        var card = el("article", { class: "card card-custom-service" });
        if (svc.badge) card.appendChild(el("span", { class: "badge", text: svc.badge }));
        card.appendChild(el("h3", { text: svc.title || "" }));
        if (svc.description) card.appendChild(el("p", { class: "card-tagline", text: svc.description }));
        if (svc.price) card.appendChild(el("p", { class: "custom-service-price", text: svc.price }));
        var ul = el("ul", { class: "bullet-list" });
        (svc.features || []).forEach(function (t) { ul.appendChild(el("li", { text: t || "" })); });
        card.appendChild(ul);
        cards.appendChild(card);
      });
    }
  }

  function stars(rating) {
    var n = Math.max(0, Math.min(5, Math.round(Number(rating) || 5)));
    var out = "";
    for (var i = 0; i < 5; i++) out += i < n ? "★" : "☆";
    return out;
  }

  function renderReviews(r) {
    var title = document.getElementById("reviews-title");
    var intro = document.getElementById("reviews-intro");
    var ratingText = document.getElementById("reviews-rating-text");
    var track = document.getElementById("reviews-track");
    var items = r.items || [];
    if (title) title.textContent = r.title || "";
    if (intro) intro.textContent = r.intro || "";
    if (ratingText) ratingText.textContent = r.ratingText || "";
    if (track) {
      clear(track);
      var duplicated = items.concat(items);
      duplicated.forEach(function (item) {
        var card = el("article", { class: "review-card" });
        card.appendChild(el("p", { class: "review-stars", text: stars(item.rating) }));
        card.appendChild(el("p", { class: "review-text", text: item.text || "" }));
        card.appendChild(el("p", { class: "review-name", text: item.name || "Cliente" }));
        track.appendChild(card);
      });
    }
  }

  function renderStatus(s) {
    var dot = document.getElementById("status-dot");
    var label = document.getElementById("status-label");
    var detail = document.getElementById("status-detail");
    if (!dot || !label) return;
    var serverCls = s.server === "online" ? "ok" : s.server === "degraded" ? "warn" : "err";
    var serviceCls = s.service === "active" ? "ok" : s.service === "maintenance" ? "warn" : "err";
    var overall = serverCls === "ok" && serviceCls === "ok" ? "ok" : serverCls === "err" || serviceCls === "err" ? "err" : "warn";
    dot.setAttribute("data-state", overall);
    var serverTxt = s.server === "online" ? "Server online" : s.server === "degraded" ? "Server degradato" : "Server offline";
    var serviceTxt = s.service === "active" ? "servizio attivo" : s.service === "maintenance" ? "manutenzione in corso" : "servizio sospeso";
    label.textContent = serverTxt + " · " + serviceTxt;
    if (detail) detail.textContent = s.message || "";
  }

  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }
  function fetchJson(path) {
    return fetch(appBaseUrl + path, {
      headers: authHeaders({ Accept: "application/json" }),
    }).then(function (r) {
      return r.json();
    });
  }

  function loadAll() {
    return Promise.all([fetchJson("/api/content"), fetchJson("/api/status")]).then(function (
      results
    ) {
      var content = (results[0] && results[0].content) || {};
      var status = (results[1] && results[1].status) || {};
      if (content.hero) renderHero(content.hero);
      if (content.about) renderAbout(content.about);
      if (content.bot) renderBot(content.bot);
      if (content.hosting) renderHosting(content.hosting);
      if (content.code) renderCode(content.code);
      if (content.notes) renderNotes(content.notes);
      if (content.logos) renderLogos(content.logos);
      if (content.websites) renderWebsites(content.websites);
      if (content.customServices) renderCustomServices(content.customServices);
      if (content.reviews) renderReviews(content.reviews);
      if (content.promotions) renderPromotions(content.promotions);
      renderStatus(status);
      window.SynapseContent = { content: content, status: status };
      document.dispatchEvent(new CustomEvent("synapse:content-loaded", { detail: { content: content, status: status } }));
      return { content: content, status: status };
    });
  }

  function applyContent(content) {
    if (!content) return;
    if (content.hero) renderHero(content.hero);
    if (content.about) renderAbout(content.about);
    if (content.bot) renderBot(content.bot);
    if (content.hosting) renderHosting(content.hosting);
    if (content.code) renderCode(content.code);
    if (content.notes) renderNotes(content.notes);
    if (content.logos) renderLogos(content.logos);
    if (content.websites) renderWebsites(content.websites);
    if (content.customServices) renderCustomServices(content.customServices);
    if (content.reviews) renderReviews(content.reviews);
    if (content.promotions) renderPromotions(content.promotions);
    var current = window.SynapseContent || {};
    current.content = content;
    document.dispatchEvent(new CustomEvent("synapse:content-loaded", { detail: { content: content, status: current.status } }));
  }

  function applyStatus(status) {
    if (!status) return;
    renderStatus(status);
    var current = window.SynapseContent || {};
    current.status = status;
  }

  var currentEventSource = null;
  function connectEvents() {
    if (typeof EventSource === "undefined") return;
    if (currentEventSource) {
      try { currentEventSource.close(); } catch (_e) { /* ignore */ }
      currentEventSource = null;
    }
    var src;
    try {
      // SSE non supporta header custom: passiamo sessionId come query param
      var sid = (window.SynapseAuth && window.SynapseAuth.getSessionId && window.SynapseAuth.getSessionId()) || "";
      var url = appBaseUrl + "/api/events" + (sid ? "?session=" + encodeURIComponent(sid) : "");
      src = new EventSource(url, { withCredentials: false });
    } catch (_e) { return; }
    currentEventSource = src;
    src.addEventListener("content", function (ev) {
      try { applyContent(JSON.parse(ev.data)); } catch (_e) { /* ignore */ }
    });
    src.addEventListener("status", function (ev) {
      try { applyStatus(JSON.parse(ev.data)); } catch (_e) { /* ignore */ }
    });
    src.addEventListener("error", function () {
      // EventSource fa retry automatico; nessuna azione necessaria.
    });
    // Eventi privati per ticket e chat: rilanciati come CustomEvent verso i moduli specifici.
    function relay(name, kind) {
      src.addEventListener(name, function (ev) {
        try {
          var payload = JSON.parse(ev.data);
          var customName = name.indexOf("ticket") === 0 ? "synapse:ticket-" + kind : "synapse:chat-event";
          if (name.indexOf("ticket") === 0) {
            document.dispatchEvent(new CustomEvent(customName, { detail: { ticket: payload } }));
            // Anche un evento generico per la lista admin
            document.dispatchEvent(new CustomEvent("synapse:tickets-changed", { detail: { ticket: payload, kind: kind } }));
          } else {
            document.dispatchEvent(new CustomEvent("synapse:chat-event", { detail: { kind: kind, payload: payload } }));
          }
        } catch (_e) { /* ignore */ }
      });
    }
    relay("ticket:new", "new");
    relay("ticket:update", "update");
    relay("ticket:mine", "mine");
    relay("chat:open", "open");
    relay("chat:message", "message");
    relay("chat:update", "update");
    src.addEventListener("staff:presence", function (ev) {
      try {
        var payload = JSON.parse(ev.data);
        document.dispatchEvent(new CustomEvent("synapse:staff-presence", { detail: payload }));
      } catch (_e) { /* ignore */ }
    });
    src.addEventListener("presence", function (ev) {
      try {
        var payload = JSON.parse(ev.data);
        document.dispatchEvent(new CustomEvent("synapse:presence", { detail: payload }));
      } catch (_e) { /* ignore */ }
    });
  }

  window.SynapseContent = { reload: loadAll };
  loadAll()
    .then(function () { connectEvents(); })
    .catch(function (err) {
      console.error("[content] caricamento fallito:", err);
      connectEvents();
    });

  // Riconnessione SSE quando cambia l'autenticazione: cosi' il server
  // associa la nuova sessione e riceviamo gli eventi privati (tickets/chat).
  document.addEventListener("synapse:auth-changed", function () {
    setTimeout(connectEvents, 100);
  });
})();
