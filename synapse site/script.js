(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 860px)").matches) {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  var modal = document.getElementById("regolamento-modal");
  var openBtn = document.getElementById("open-regolamento");
  var closeBtn = modal && modal.querySelector(".modal-close");
  var lastFocus = null;

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

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  if (modal) {
    document.addEventListener("keydown", function (e) {
      var authM = document.getElementById("auth-modal");
      if (authM && !authM.hasAttribute("hidden")) return;
      if (e.key === "Escape" && !modal.hasAttribute("hidden")) {
        e.preventDefault();
        closeModal();
      }
    });
  }
})();

(function () {
  function authHeaders(extra) {
    return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {});
  }
  var appBaseUrl = (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null")
    ? window.location.origin
    : "http://localhost:3000";

  var currentSection = "Sito";
  var lastPing = 0;
  function pingPresence(label) {
    if (!window.SynapseAuth || !window.SynapseAuth.getCsrfToken || !window.SynapseAuth.getCsrfToken()) return;
    var now = Date.now();
    if (now - lastPing < 5000) return;
    lastPing = now;
    fetch(appBaseUrl + "/api/presence/ping", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ page: label || currentSection, lastEvent: "Navigazione sito" }),
    }).catch(function () { /* ignore */ });
  }

  function labelForSection(section) {
    if (!section) return "Sito";
    var h = section.querySelector("h1,h2,h3");
    return (h && h.textContent && h.textContent.trim()) || section.id || "Sito";
  }

  var revealTargets = Array.prototype.slice.call(document.querySelectorAll(".section, .hero, .card, .callout, .data-table"));
  revealTargets.forEach(function (node) { node.classList.add("reveal"); });
  if ("IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealTargets.forEach(function (node) { revealObserver.observe(node); });

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          currentSection = labelForSection(entry.target);
          pingPresence(currentSection);
        }
      });
    }, { threshold: 0.45 });
    Array.prototype.slice.call(document.querySelectorAll("main section")).forEach(function (section) {
      sectionObserver.observe(section);
    });
  } else {
    revealTargets.forEach(function (node) { node.classList.add("is-visible"); });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pingPresence(currentSection);
  });
  document.addEventListener("synapse:auth-changed", function () {
    setTimeout(function () { pingPresence(currentSection); }, 250);
  });
})();

(function () {
  var modal = document.getElementById("privacy-modal");
  var openBtn = document.getElementById("open-privacy");
  var closeBtn = modal && modal.querySelector(".privacy-modal-close");
  var lastFocus = null;
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
  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (modal) {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hasAttribute("hidden")) {
        e.preventDefault();
        closeModal();
      }
    });
  }
})();


(function () {
  var categoryMap = {
    bot: "bot",
    "emoji-pack": "emoji-pack",
    emoji: "emoji-pack",
    hosting: "hosting",
    codice: "codice",
    code: "codice",
    loghi: "loghi",
    logos: "loghi",
    "siti-web": "siti-web",
    websites: "siti-web",
    "custom-services": "custom-services",
  };

  function setupProductCategories() {
    var select = document.getElementById("product-category-select");
    var section = document.getElementById("listino-prodotti");
    var panels = Array.prototype.slice.call(document.querySelectorAll("[data-product-category]"));
    if (!select || !section || !panels.length || select.dataset.bound === "true") return;
    select.dataset.bound = "true";

    function activate(category, shouldScroll) {
      category = categoryMap[category] || category || "bot";
      var hasPanel = panels.some(function (panel) { return panel.getAttribute("data-product-category") === category; });
      if (!hasPanel) category = "bot";
      panels.forEach(function (panel) {
        var active = panel.getAttribute("data-product-category") === category;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });
      select.value = category;
      if (shouldScroll) section.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(initInteractiveHover, 60);
    }

    select.addEventListener("change", function () {
      activate(select.value, false);
    });

    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest('a[href^="#"]');
      if (!link) return;
      var hash = (link.getAttribute("href") || "").replace("#", "");
      if (!categoryMap[hash]) return;
      event.preventDefault();
      activate(categoryMap[hash], true);
      if (history && history.pushState) history.pushState(null, "", "#listino-prodotti");
    });

    function applyHash() {
      var hash = (window.location.hash || "").replace("#", "");
      if (categoryMap[hash]) activate(categoryMap[hash], true);
    }

    window.addEventListener("hashchange", applyHash);
    applyHash();
  }

  var hoverSelector = [
    "main .card",
    "main .callout",
    "main .table-wrap",
    "main .review-card",
    "main .reviews-summary",
    "main .feature-list li",
    "main .product-notes-card"
  ].join(",");

  function initInteractiveHover() {
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var nodes = Array.prototype.slice.call(document.querySelectorAll(hoverSelector));
    nodes.forEach(function (node) {
      if (!node || node.dataset.hoverBound === "true") return;
      node.dataset.hoverBound = "true";
      node.classList.add("interactive-hover");

      var frame = null;
      function reset() {
        if (frame) cancelAnimationFrame(frame);
        frame = null;
        node.classList.remove("is-hovered");
        node.style.removeProperty("--hover-x");
        node.style.removeProperty("--hover-y");
        node.style.removeProperty("--glow-x");
        node.style.removeProperty("--glow-y");
      }

      node.addEventListener("pointerenter", function (event) {
        if (event.pointerType === "touch") return;
        node.classList.add("is-hovered");
      });

      node.addEventListener("pointermove", function (event) {
        if (reduceMotion || event.pointerType === "touch") return;
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(function () {
          var rect = node.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          var px = (event.clientX - rect.left) / rect.width;
          var py = (event.clientY - rect.top) / rect.height;
          var dx = (px - 0.5) * 10;
          var dy = (py - 0.5) * 10;
          node.classList.add("is-hovered");
          node.style.setProperty("--hover-x", dx.toFixed(2) + "px");
          node.style.setProperty("--hover-y", dy.toFixed(2) + "px");
          node.style.setProperty("--glow-x", (px * 100).toFixed(1) + "%");
          node.style.setProperty("--glow-y", (py * 100).toFixed(1) + "%");
        });
      });

      node.addEventListener("pointerleave", reset);
      node.addEventListener("pointercancel", reset);
    });
  }

  setupProductCategories();
  initInteractiveHover();

  if ("MutationObserver" in window) {
    var main = document.querySelector("main");
    if (main) {
      var hoverObserver = new MutationObserver(function () {
        window.requestAnimationFrame(initInteractiveHover);
      });
      hoverObserver.observe(main, { childList: true, subtree: true });
    }
  }

  document.addEventListener("synapse:content-loaded", function () {
    setupProductCategories();
    initInteractiveHover();
  });
  window.addEventListener("resize", function () {
    window.setTimeout(initInteractiveHover, 80);
  });
})();
