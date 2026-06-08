// Rendering dinamico dei contenuti Synapse + SSE realtime.
(function () {
  var appBaseUrl = (function () {
    var cfg = document.documentElement.getAttribute("data-app-base-url") || "";
    if (cfg) return cfg.replace(/\/+$/, "");
    if (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null") return window.location.origin;
    return "http://localhost:3000";
  })();

  var currentEventSource = null;
  var contentPollTimer = null;
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

  function checkoutContext(category, name, price) {
    return {
      productCategory: category || "Prodotto Synapse",
      productName: name || "Prodotto Synapse",
      priceLabel: String(price || "Da confermare").trim(),
    };
  }

  function openCheckoutFor(category, name, price) {
    var detail = checkoutContext(category, name, price);
    if (window.SynapseCheckout && window.SynapseCheckout.openFor) window.SynapseCheckout.openFor(detail);
    else document.dispatchEvent(new CustomEvent("synapse:open-checkout", { detail: detail }));
  }

  function ticketButton(category, name, price) {
    var wrap = el("div", { class: "product-actions" });
    wrap.appendChild(el("button", {
      type: "button",
      class: "btn btn-primary product-ticket-btn",
      text: "Acquista",
      onclick: function () { openCheckoutFor(category, name, price); },
    }));
    wrap.appendChild(el("button", {
      type: "button",
      class: "btn btn-ghost product-info-ticket-btn",
      text: "Apri ticket",
      onclick: function () { openTicketFor(category, name, price); },
    }));
    return wrap;
  }

  function renderBadge(card, plan) {
    if (plan && (plan.badge || plan.featured)) {
      card.appendChild(el("span", {
        class: "badge badge-flow" + (plan.featured ? " badge-top" : ""),
        text: plan.badge || "Consigliato",
      }));
    }
  }

  function priceElement(price) {
    var value = String(price || "").trim();
    var p = el("p", { class: "price" + (value === "0,00" || value === "0,00€" ? " price-zero" : "") });
    if (/^[0-9]/.test(value) && value.indexOf("€") === -1) {
      p.appendChild(el("span", { class: "currency", text: "€" }));
      p.appendChild(document.createTextNode(value));
    } else {
      p.textContent = value || "Da confermare";
    }
    return p;
  }

  function renderSimpleProductCard(opts) {
    opts = opts || {};
    var card = el("article", { class: "card card-plan card-simple-product" + (opts.featured ? " card-featured" : "") });
    renderBadge(card, opts);
    card.appendChild(el("h3", { text: opts.name || "Prodotto" }));
    card.appendChild(priceElement(opts.price || ""));
    if (opts.tagline) card.appendChild(el("p", { class: "card-tagline", text: opts.tagline }));
    var ul = el("ul", { class: "checklist" });
    (opts.features || []).forEach(function (text) { ul.appendChild(el("li", { text: text || "" })); });
    card.appendChild(ul);
    card.appendChild(ticketButton(opts.category || "Prodotto Synapse", opts.name || "Prodotto", String(opts.price || "").replace("€", "")));
    return card;
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

  function aboutIconSvg(feature) {
    var raw = String((feature && (feature.icon || feature.text)) || "").toLowerCase();
    var type = "spark";
    if (raw.indexOf("🚀") !== -1 || raw.indexOf("bot") !== -1 || raw.indexOf("discord") !== -1 || raw.indexOf("social") !== -1 || raw.indexOf("rocket") !== -1) type = "rocket";
    else if (raw.indexOf("🌐") !== -1 || raw.indexOf("siti") !== -1 || raw.indexOf("web") !== -1 || raw.indexOf("globe") !== -1) type = "globe";
    else if (raw.indexOf("💸") !== -1 || raw.indexOf("prezzi") !== -1 || raw.indexOf("listino") !== -1 || raw.indexOf("price") !== -1 || raw.indexOf("tag") !== -1) type = "tag";
    else if (raw.indexOf("💼") !== -1 || raw.indexOf("progetto") !== -1 || raw.indexOf("misura") !== -1 || raw.indexOf("custom") !== -1 || raw.indexOf("briefcase") !== -1) type = "briefcase";

    var icons = {
      rocket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 4.2c1.9-1.8 4.4-2.6 6.9-2.3.3 2.5-.5 5-2.3 6.9l-4.7 4.7-3-3 3.1-6.3Z"/><path d="M9.4 10.6 5.9 9.9 3.6 12.2l4.3 1.2"/><path d="m13.4 14.6 1.2 4.3 2.3-2.3-.7-3.5"/><path d="M7.4 16.6c-1 .2-2 .8-2.7 1.5-.8.8-1.3 1.8-1.5 2.7 1-.2 2-.7 2.7-1.5.7-.7 1.3-1.7 1.5-2.7Z"/></svg>',
      globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.3 2.4 3.5 5.4 3.5 9S14.3 18.6 12 21c-2.3-2.4-3.5-5.4-3.5-9S9.7 5.4 12 3Z"/></svg>',
      tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 13.2 13.3 20a2.5 2.5 0 0 1-3.5 0L3.6 13.8A2 2 0 0 1 3 12.4V5a2 2 0 0 1 2-2h7.4a2 2 0 0 1 1.4.6l6.4 6.1a2.5 2.5 0 0 1 0 3.5Z"/><circle cx="7.6" cy="7.6" r="1.2"/></svg>',
      briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 11h18"/><path d="M10 11v2h4v-2"/></svg>',
      spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 14.5 9l6.7 3-6.7 3L12 21.2 9.5 15l-6.7-3 6.7-3L12 2.8Z"/></svg>',
    };
    return icons[type] || icons.spark;
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
        var icon = el("span", { class: "about-icon", "aria-hidden": "true" });
        icon.innerHTML = aboutIconSvg(f);
        li.appendChild(icon);
        li.appendChild(el("span", { class: "feature-text", text: f.text || "" }));
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
    card.appendChild(priceElement(plan.price || ""));
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
    card.appendChild(priceElement(plan.price || ""));
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
    var emojiCards = document.getElementById("emoji-cards");
    if (bot.emojiPack) {
      if (emojiTitle) emojiTitle.textContent = bot.emojiPack.title || "";
      if (emojiCards) {
        clear(emojiCards);
        (bot.emojiPack.rows || []).forEach(function (r, idx) {
          emojiCards.appendChild(renderSimpleProductCard({
            name: r.quantity || "Emoji pack",
            price: r.price || "",
            category: "Emoji pack",
            badge: idx === 2 ? "Scelto spesso" : "",
            featured: idx === 2,
            features: ["Emoji personalizzate", "Formato pronto per Discord", "Stile coordinato con la community"],
          }));
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
    var cards = document.getElementById("hosting-cards");
    if (title) title.textContent = h.title || "";
    if (calloutTitle) calloutTitle.textContent = h.calloutTitle || "";
    if (calloutList) { clear(calloutList); (h.calloutItems || []).forEach(function (t) { calloutList.appendChild(el("li", { text: t })); }); }
    if (tariffsTitle) tariffsTitle.textContent = h.tariffsTitle || "";
    if (cards) {
      clear(cards);
      (h.rows || []).forEach(function (r, idx) {
        var features = ["Hosting personale Synapse", "Supporto configurazione incluso"];
        if (r.note && r.note !== "—") features.push(r.note);
        cards.appendChild(renderSimpleProductCard({
          name: r.duration || "Hosting",
          price: r.price || "",
          category: "Hosting",
          badge: /anno|best/i.test(String(r.duration || "") + " " + String(r.note || "")) ? "Best deal" : "",
          featured: /anno|best/i.test(String(r.duration || "") + " " + String(r.note || "")),
          features: features,
        }));
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
    card.appendChild(priceElement(plan.price || ""));
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
    if (section) section.toggleAttribute("data-empty", !services.length);
    if (title) title.textContent = c.title || "";
    if (intro) intro.textContent = c.intro || "";
    if (cards) {
      clear(cards);
      services.forEach(function (svc) {
        var card = el("article", { class: "card card-custom-service" });
        renderBadge(card, svc);
        card.appendChild(el("h3", { text: svc.title || "" }));
        if (svc.description) card.appendChild(el("p", { class: "card-tagline", text: svc.description }));
        if (svc.price) card.appendChild(priceElement(svc.price));
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
    var serverCls = s.server === "online" ? "ok" : (s.server === "degraded" || s.server === "maintenance") ? "warn" : "err";
    var serviceCls = s.service === "active" ? "ok" : s.service === "maintenance" ? "warn" : "err";
    var overall = serverCls === "ok" && serviceCls === "ok" ? "ok" : serverCls === "err" || serviceCls === "err" ? "err" : "warn";
    dot.setAttribute("data-state", overall);
    var serverTxt = s.server === "online" ? "Online" : s.server === "maintenance" ? "In manutenzione" : s.server === "degraded" ? "Prestazioni ridotte" : "Offline";
    var serviceTxt = s.service === "active" ? "servizi attivi" : s.service === "maintenance" ? "servizi in manutenzione" : "servizi sospesi";
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
      openCheckoutFor: openCheckoutFor,
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
      var page = encodeURIComponent((document.title || "Sito").replace(/\s+—\s+Synapse.*$/i, "").slice(0, 80) || "Sito");
      var url = appBaseUrl + "/api/events" + (sid ? "?session=" + encodeURIComponent(sid) + "&page=" + page : "?page=" + page);
      src = new EventSource(url, { withCredentials: false });
    } catch (_e) { return; }
    currentEventSource = src;
    src.addEventListener("content", function (ev) { try { applyContent(JSON.parse(ev.data)); } catch (_e) {} });
    src.addEventListener("status", function (ev) { try { applyStatus(JSON.parse(ev.data)); } catch (_e) {} });
    src.onerror = function () {
      // EventSource si riconnette da solo; il polling sotto resta come rete di sicurezza.
    };

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
    src.addEventListener("order:new", function (ev) { try { document.dispatchEvent(new CustomEvent("synapse:orders-changed", { detail: { order: JSON.parse(ev.data), kind: "new" } })); } catch (_e) {} });
    src.addEventListener("order:update", function (ev) { try { document.dispatchEvent(new CustomEvent("synapse:orders-changed", { detail: { order: JSON.parse(ev.data), kind: "update" } })); } catch (_e) {} });
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

  function startContentPolling() {
    if (contentPollTimer) window.clearInterval(contentPollTimer);
    contentPollTimer = window.setInterval(function () {
      loadAll().catch(function () { /* il canale SSE resta la fonte primaria */ });
    }, 30000);
  }

  setSynapseContent(null, null);
  loadAll().then(function () { connectEvents(); startContentPolling(); }).catch(function (err) {
    console.error("[content] caricamento fallito:", err);
    connectEvents();
    startContentPolling();
  });
  document.addEventListener("synapse:auth-changed", function () { setTimeout(connectEvents, 100); });
})();
