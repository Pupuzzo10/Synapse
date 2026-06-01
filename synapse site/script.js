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
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

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
