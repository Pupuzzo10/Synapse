// Rendering dinamico dei contenuti Synapse + SSE realtime.
(function () {
  var appBaseUrl = (function () {
    var cfg = document.documentElement.getAttribute("data-app-base-url") || "";
    if (cfg) return cfg.replace(/\/+$/, "");
    if (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null") return window.location.origin;
    return "http://localhost:3000";
  })();

  var currentEventSource = null;
  var syntheticReviewTimer = null;
  var syntheticReviews = [];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
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

  function formatProductContext(category, name, price) {
    return {
      category: category || "Prodotto",
      productName: name || "Richiesta informazioni",
      price: price || "",
      subject: "Informazioni su " + (name || category || "prodotto Synapse"),
      message:
        "Ciao Synapse, vorrei ricevere informazioni su: " + (name || "questo prodotto") +
        (category ? "\nCategoria: " + category : "") +
        (price ? "\nPrezzo indicato: " + price + "€" : "") +
        "\n\nMi interessa capire tempi, modalità di consegna e cosa serve per iniziare.",
      autoOpenChat: true,
    };
  }

  function openTicketFor(category, name, price) {
    var detail = formatProductContext(category, name, price);
    document.dispatchEvent(new CustomEvent("synapse:open-ticket", { detail: detail }));
    if (window.SynapseSupport && window.SynapseSupport.openFor) {
      window.SynapseSupport.openFor(detail);
    }
  }

  function ticketButton(category, name, price) {
    return el("button", {
      type: "button",
      class: "btn btn-ghost product-ticket-btn",
      text: "Apri ticket per informazioni",
      onclick: function () { openTicketFor(category, name, price); },
    });
  }

  function renderBadge(card, plan) {
    if (plan && (plan.badge || plan.featured)) {
      card.appendChild(el("span", {
        class: "badge badge-flow" + (plan.featured ? " badge-top" : ""),
        text: plan.badge || "Consigliato",
      }));
    }
  }

  function renderHero(hero) {
    hero = hero || {};
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
      } else title.textContent = t;
    }
    if (lead) {
      var leadText = hero.lead || "";
      if (hero.startingPrice) leadText += " A partire da " + hero.startingPrice + ".";
      lead.textContent = leadText;
    }
    if (ctaP && hero.ctaPrimary) { ctaP.textContent = hero.ctaPrimary.label || ""; ctaP.setAttribute("href", hero.ctaPrimary.href || "#"); }
    if (ctaS && hero.ctaSecondary) { ctaS.textContent = hero.ctaSecondary.label || ""; ctaS.setAttribute("href", hero.ctaSecondary.href || "#"); }
  }

  function renderAbout(about) {
    about = about || {};
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

  function renderPlanCard(plan, category) {
    plan = plan || {};
    var card = el("article", { class: "card card-plan" + (plan.featured ? " card-featured" : "") });
    renderBadge(card, plan);
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
    card.appendChild(ticketButton(category || "Prodotto Synapse", plan.name || "Piano", plan.price || ""));
    return card;
  }

  function renderLogoCard(plan) {
    plan = plan || {};
    var card = el("article", { class: "card card-logo" + (plan.featured ? " card-featured" : "") });
    renderBadge(card, plan);
    card.appendChild(el("h3", { text: plan.name || "" }));
    var priceP = el("p", { class: "price" + (plan.price === "0,00" ? " price-zero" : "") });
    priceP.appendChild(el("span", { class: "currency", text: "€" }));
    priceP.appendChild(document.createTextNode(plan.price || ""));
    card.appendChild(priceP);
    var ul = el("ul", { class: "bullet-list" });
    (plan.features || []).forEach(function (f) { ul.appendChild(el("li", { text: f.text || "" })); });
    card.appendChild(ul);
    card.appendChild(ticketButton("Logo", plan.name || "Logo", plan.price || ""));
    return card;
  }

  function renderBot(bot) {
    bot = bot || {};
    var title = document.getElementById("bot-title");
    var intro = document.getElementById("bot-intro");
    var cards = document.getElementById("bot-cards");
    if (title) title.textContent = bot.title || "";
    if (intro) intro.textContent = bot.intro || "";
    if (cards) {
      clear(cards);
      (bot.plans || []).forEach(function (p) { cards.appendChild(renderPlanCard(p, "Bot Discord")); });
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
          tr.appendChild(el("td", {}, ticketButton("Emoji pack", r.quantity || "Emoji pack", String(r.price || "").replace("€", ""))));
          emojiBody.appendChild(tr);
        });
      }
    }
  }

  function renderHosting(h) {
    h = h || {};
    var title = document.getElementById("hosting-title");
    var calloutTitle = document.getElementById("hosting-callout-title");
    var calloutList = document.getElementById("hosting-callout-list");
    var tariffsTitle = document.getElementById("hosting-tariffs-title");
    var tbody = document.getElementById("hosting-tbody");
    if (title) title.textContent = h.title || "";
    if (calloutTitle) calloutTitle.textContent = h.calloutTitle || "";
    if (calloutList) { clear(calloutList); (h.calloutItems || []).forEach(function (t) { calloutList.appendChild(el("li", { text: t })); }); }
    if (tariffsTitle) tariffsTitle.textContent = h.tariffsTitle || "";
    if (tbody) {
      clear(tbody);
      (h.rows || []).forEach(function (r) {
        var tr = el("tr");
        tr.appendChild(el("td", { text: r.duration || "" }));
        tr.appendChild(el("td", { text: r.price || "" }));
        tr.appendChild(el("td", { text: r.note || "" }));
        tr.appendChild(el("td", {}, ticketButton("Hosting", r.duration || "Hosting", String(r.price || "").replace("€", ""))));
        tbody.appendChild(tr);
      });
    }
  }

  function renderCode(c) {
    c = c || {};
    var title = document.getElementById("code-title");
    var cards = document.getElementById("code-cards");
    var legal = document.getElementById("code-legal");
    if (title) title.textContent = c.title || "";
    if (cards) { clear(cards); (c.plans || []).forEach(function (p) { cards.appendChild(renderPlanCard(p, "Codice sorgente")); }); }
    if (legal) legal.textContent = c.legal || "";
  }

  function renderNotes(n) {
    n = n || {};
    var title = document.getElementById("notes-title");
    var body = document.getElementById("notes-body");
    if (title) title.textContent = n.title || "";
    if (body) body.textContent = n.body || "";
  }

  function renderLogos(l) {
    l = l || {};
    var title = document.getElementById("logos-title");
    var intro = document.getElementById("logos-intro");
    var cards = document.getElementById("logos-cards");
    if (title) title.textContent = l.title || "";
    if (intro) intro.textContent = l.intro || "";
    if (cards) { clear(cards); (l.plans || []).forEach(function (p) { cards.appendChild(renderLogoCard(p)); }); }
  }

  function renderPromotions(p) {
    p = p || {};
    var title = document.getElementById("promo-title");
    var body = document.getElementById("promo-body");
    var footer = document.getElementById("promo-footer");
    if (title) title.textContent = p.title || "";
    if (body) body.textContent = p.body || "";
    if (footer) footer.textContent = p.footer || "";
  }

  function renderWebsiteCard(plan) {
    plan = plan || {};
    var card = el("article", { class: "card card-website" + (plan.featured ? " card-featured" : "") });
    renderBadge(card, plan.featured && !plan.badge ? Object.assign({}, plan, { badge: "Altamente consigliato" }) : plan);
    card.appendChild(el("h3", { text: plan.name || "" }));
    if (plan.tagline) card.appendChild(el("p", { class: "card-tagline", text: plan.tagline }));
    var priceP = el("p", { class: "price" });
    priceP.appendChild(el("span", { class: "currency", text: "€" }));
    priceP.appendChild(document.createTextNode(plan.price || ""));
    card.appendChild(priceP);
    if (plan.recommendedFor) {
      card.appendChild(el("p", { class: "recommended-strip", text: (plan.featured ? "Top consigliato: " : "Consigliato per: ") + plan.recommendedFor }));
    }
    var ul = el("ul", { class: "bullet-list" });
    (plan.features || []).forEach(function (f) { ul.appendChild(el("li", { text: f.text || "" })); });
    card.appendChild(ul);
    card.appendChild(ticketButton("Sito web", plan.name || "Sito web", plan.price || ""));
    return card;
  }

  function renderWebsites(w) {
    w = w || {};
    var title = document.getElementById("websites-title");
    var intro = document.getElementById("websites-intro");
    var cards = document.getElementById("websites-cards");
    var extrasTitle = document.getElementById("websites-extras-title");
    var extrasBody = document.getElementById("websites-extras-tbody");
    if (title) title.textContent = w.title || "";
    if (intro) intro.textContent = w.intro || "";
    if (cards) { clear(cards); (w.plans || []).forEach(function (p) { cards.appendChild(renderWebsiteCard(p)); }); }
    if (extrasTitle) extrasTitle.textContent = w.extrasTitle || "Servizi extra opzionali";
    if (extrasBody) {
      clear(extrasBody);
      (w.extras || []).forEach(function (r) {
        var tr = el("tr");
        tr.appendChild(el("td", { text: r.name || "" }));
        tr.appendChild(el("td", { text: r.price || "" }));
        tr.appendChild(el("td", { text: r.note || "" }));
        tr.appendChild(el("td", {}, ticketButton("Extra sito web", r.name || "Extra sito web", String(r.price || "").replace("€", ""))));
        extrasBody.appendChild(tr);
      });
    }
  }

  function renderCustomServices(c) {
    c = c || {};
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
        renderBadge(card, svc);
        card.appendChild(el("h3", { text: svc.title || "" }));
        if (svc.description) card.appendChild(el("p", { class: "card-tagline", text: svc.description }));
        if (svc.price) card.appendChild(el("p", { class: "custom-service-price", text: svc.price }));
        var ul = el("ul", { class: "bullet-list" });
        (svc.features || []).forEach(function (t) { ul.appendChild(el("li", { text: t || "" })); });
        card.appendChild(ul);
        card.appendChild(ticketButton("Servizio custom", svc.title || "Servizio custom", svc.price || ""));
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

  var randomFirstNames = ["Luca", "Marco", "Giulia", "Sofia", "Matteo", "Alessia", "Davide", "Chiara", "Andrea", "Elena", "Francesco", "Martina"];
  var randomLastNames = ["Romano", "Ferrari", "Conti", "Rinaldi", "Marini", "Greco", "Lombardi", "Costa", "Fabbri", "Galli", "Moretti", "Serra"];
  var randomReviewTexts = [
    "Server ordinato, supporto rapido e servizio molto più curato di quanto mi aspettassi.",
    "Il sistema ticket è chiaro e lo staff segue davvero la richiesta fino alla soluzione.",
    "Bot consegnato con funzioni precise, tempi rispettati e assistenza sempre disponibile.",
    "Esperienza professionale: prezzi chiari, comunicazione pulita e risultato finale solido.",
    "Ho richiesto un sito e il lavoro è arrivato moderno, veloce e ottimizzato da telefono.",
    "Synapse dà l'impressione di un team serio: gestione ordinata e supporto costante.",
  ];

  function makeSyntheticReview() {
    var first = randomFirstNames[Math.floor(Math.random() * randomFirstNames.length)];
    var last = randomLastNames[Math.floor(Math.random() * randomLastNames.length)];
    var text = randomReviewTexts[Math.floor(Math.random() * randomReviewTexts.length)];
    return { name: first + " " + last, rating: 5, text: text, synthetic: true };
  }

  function startSyntheticReviews(contentReviews) {
    if (syntheticReviewTimer) return;
    syntheticReviewTimer = setInterval(function () {
      syntheticReviews.unshift(makeSyntheticReview());
      syntheticReviews = syntheticReviews.slice(0, 12);
      renderReviews(contentReviews || {});
    }, 120000);
  }

  function renderReviews(r) {
    r = r || {};
    var title = document.getElementById("reviews-title");
    var intro = document.getElementById("reviews-intro");
    var ratingText = document.getElementById("reviews-rating-text");
    var track = document.getElementById("reviews-track");
    var items = syntheticReviews.concat(r.items || []);
    if (title) title.textContent = r.title || "";
    if (intro) intro.textContent = r.intro || "";
    if (ratingText) ratingText.textContent = r.ratingText || "";
    if (track) {
      clear(track);
      var duplicated = items.concat(items);
      duplicated.forEach(function (item) {
        var card = el("article", { class: "review-card" + (item.synthetic ? " review-card-live" : "") });
        card.appendChild(el("p", { class: "review-stars", text: stars(item.rating) }));
        card.appendChild(el("p", { class: "review-text", text: item.text || "" }));
        card.appendChild(el("p", { class: "review-name", text: item.name || "Cliente" }));
        track.appendChild(card);
      });
    }
    startSyntheticReviews(r);
  }

  function renderStatus(s) {
    s = s || {};
    var dot = document.getElementById("status-dot");
    var label = document.getElementById("status-label");
    var detail = document.getElementById("status-detail");
    if (!dot || !label) return;
    var serverCls = s.server === "online" ? "ok" : s.server === "degraded" ? "warn" : "err";
    var serviceCls = s.service === "active" ? "ok" : s.service === "maintenance" ? "warn" : "err";
    var overall = serverCls === "ok" && serviceCls === "ok" ? "ok" : serverCls === "err" || serviceCls === "err" ? "err" : "warn";
    dot.setAttribute("data-state", overall);
    var serverTxt = s.server === "online" ? "Online" : s.server === "degraded" ? "Prestazioni ridotte" : "Offline";
    var serviceTxt = s.service === "active" ? "servizi attivi" : s.service === "maintenance" ? "manutenzione" : "servizi sospesi";
    label.textContent = "Synapse Status · " + serverTxt + " · " + serviceTxt;
    if (detail) detail.textContent = s.message || "Monitoraggio automatico attivo";
  }

  function authHeaders(extra) { return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {}); }
  function fetchJson(path) { return fetch(appBaseUrl + path, { headers: authHeaders({ Accept: "application/json" }) }).then(function (r) { return r.json(); }); }

  function setSynapseContent(content, status) {
    window.SynapseContent = Object.assign(window.SynapseContent || {}, {
      content: content || ((window.SynapseContent || {}).content),
      status: status || ((window.SynapseContent || {}).status),
      reload: loadAll,
      closeEvents: closeEvents,
      openTicketFor: openTicketFor,
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
    setSynapseContent(content, current.status);
    document.dispatchEvent(new CustomEvent("synapse:content-loaded", { detail: { content: content, status: current.status } }));
  }

  function applyStatus(status) {
    if (!status) return;
    renderStatus(status);
    var current = window.SynapseContent || {};
    setSynapseContent(current.content, status);
  }

  function loadAll() {
    return Promise.all([fetchJson("/api/content"), fetchJson("/api/status")]).then(function (results) {
      var content = (results[0] && results[0].content) || {};
      var status = (results[1] && results[1].status) || {};
      applyContent(content);
      applyStatus(status);
      document.dispatchEvent(new CustomEvent("synapse:content-loaded", { detail: { content: content, status: status } }));
      return { content: content, status: status };
    });
  }

  function closeEvents() {
    if (currentEventSource) {
      try { currentEventSource.close(); } catch (_e) { /* ignore */ }
      currentEventSource = null;
    }
  }

  function connectEvents() {
    if (typeof EventSource === "undefined") return;
    closeEvents();
    var src;
    try {
      var sid = (window.SynapseAuth && window.SynapseAuth.getSessionId && window.SynapseAuth.getSessionId()) || "";
      var url = appBaseUrl + "/api/events" + (sid ? "?session=" + encodeURIComponent(sid) : "");
      src = new EventSource(url, { withCredentials: false });
    } catch (_e) { return; }
    currentEventSource = src;
    src.addEventListener("content", function (ev) { try { applyContent(JSON.parse(ev.data)); } catch (_e) {} });
    src.addEventListener("status", function (ev) { try { applyStatus(JSON.parse(ev.data)); } catch (_e) {} });

    function relay(name, kind) {
      src.addEventListener(name, function (ev) {
        try {
          var payload = JSON.parse(ev.data);
          if (name.indexOf("ticket") === 0) {
            document.dispatchEvent(new CustomEvent("synapse:ticket-" + kind, { detail: { ticket: payload } }));
            document.dispatchEvent(new CustomEvent("synapse:tickets-changed", { detail: { ticket: payload, kind: kind } }));
          } else {
            document.dispatchEvent(new CustomEvent("synapse:chat-event", { detail: { kind: kind, payload: payload } }));
          }
        } catch (_e) {}
      });
    }
    relay("ticket:new", "new");
    relay("ticket:update", "update");
    relay("ticket:mine", "mine");
    relay("chat:open", "open");
    relay("chat:message", "message");
    relay("chat:update", "update");
    relay("chat:typing", "typing");

    src.addEventListener("staff:presence", function (ev) { try { document.dispatchEvent(new CustomEvent("synapse:staff-presence", { detail: JSON.parse(ev.data) })); } catch (_e) {} });
    src.addEventListener("presence", function (ev) { try { document.dispatchEvent(new CustomEvent("synapse:presence", { detail: JSON.parse(ev.data) })); } catch (_e) {} });
    src.addEventListener("users:update", function (ev) { try { document.dispatchEvent(new CustomEvent("synapse:users-changed", { detail: JSON.parse(ev.data) })); } catch (_e) {} });
    src.addEventListener("moderation:list-update", function (ev) { try { document.dispatchEvent(new CustomEvent("synapse:moderation-changed", { detail: JSON.parse(ev.data) })); } catch (_e) {} });
    src.addEventListener("moderation:update", function (ev) {
      try {
        var payload = JSON.parse(ev.data);
        if (payload && payload.block) {
          if (window.SynapseBlocked && window.SynapseBlocked.render) window.SynapseBlocked.render(payload.block);
          else window.location.href = "/";
        } else document.dispatchEvent(new CustomEvent("synapse:moderation-changed", { detail: payload }));
      } catch (_e) {}
    });
  }

  setSynapseContent(null, null);
  loadAll().then(function () { connectEvents(); }).catch(function (err) {
    console.error("[content] caricamento fallito:", err);
    connectEvents();
  });
  document.addEventListener("synapse:auth-changed", function () { setTimeout(connectEvents, 100); });
})();
