(function () {
  var REVOLUT_PAYMENT_LINK = "https://revolut.me/angelo2tqp";
  var appBaseUrl = (function () {
    var cfg = document.documentElement.getAttribute("data-app-base-url") || "";
    if (cfg) return cfg.replace(/\/+$/, "");
    if (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null") return window.location.origin;
    return "http://localhost:3000";
  })();

  var currentUser = null;
  var currentProduct = null;
  var currentOrder = null;
  var step = "checkout";
  var paymentOpened = false;
  var modal = null;
  var titleEl = null;
  var bodyEl = null;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "value") node.value = attrs[k];
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

  function authHeaders(extra) {
    return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {});
  }

  function normalizePrice(value) {
    var raw = String(value || "Da confermare").trim();
    if (!raw) return "Da confermare";
    if (/€|euro/i.test(raw) || /richiesta|confermare|gratis|free/i.test(raw)) return raw;
    if (/^[0-9]+([,.][0-9]{1,2})?$/.test(raw)) return "€" + raw;
    return raw;
  }

  function setMessage(target, text, type) {
    if (!target) return;
    target.textContent = text || "";
    target.hidden = !text;
    target.classList.remove("is-error", "is-success", "is-info");
    if (text) target.classList.add(type === "success" ? "is-success" : type === "info" ? "is-info" : "is-error");
  }

  function fetchJson(path, options) {
    var opts = Object.assign({}, options || {});
    opts.headers = authHeaders(Object.assign({ Accept: "application/json" }, opts.headers || {}));
    return fetch(appBaseUrl + path, opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, message: "Risposta server non valida." }; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || "Richiesta non riuscita.");
        return data;
      });
    });
  }

  function ensureModal() {
    if (modal) return;
    modal = el("div", { id: "checkout-modal", class: "modal checkout-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "checkout-modal-title", hidden: "" });
    var dialog = el("div", { class: "modal-dialog checkout-dialog" });
    var header = el("header", { class: "modal-header" });
    titleEl = el("h2", { id: "checkout-modal-title", class: "modal-title", text: "Checkout Synapse" });
    var closeBtn = el("button", { type: "button", class: "modal-close checkout-modal-close", "aria-label": "Chiudi", text: "×", onclick: closeModal });
    bodyEl = el("div", { class: "modal-body checkout-body" });
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    dialog.appendChild(header);
    dialog.appendChild(bodyEl);
    modal.appendChild(dialog);
    modal.addEventListener("click", function (event) { if (event.target === modal) closeModal(); });
    document.body.appendChild(modal);
  }

  function openModal() {
    ensureModal();
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    render();
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function productSummary() {
    return el("div", { class: "checkout-summary" }, [
      el("span", { class: "checkout-kicker", text: currentProduct.productCategory || "Prodotto Synapse" }),
      el("strong", { text: currentProduct.productName || "Prodotto Synapse" }),
      el("span", { class: "checkout-price", text: normalizePrice(currentProduct.priceLabel) }),
    ]);
  }

  function renderLoginRequired() {
    titleEl.textContent = "Checkout Synapse";
    clear(bodyEl);
    bodyEl.appendChild(productSummary());
    bodyEl.appendChild(el("p", { class: "checkout-lead", text: "Accedi o registra un account prima di procedere all'acquisto." }));
    bodyEl.appendChild(el("button", { type: "button", class: "btn btn-primary checkout-wide", text: "Accedi o registrati", onclick: function () {
      closeModal();
      var btn = document.getElementById("open-auth-modal");
      if (btn) btn.click();
    } }));
  }

  function field(label, input, hint) {
    var children = [el("span", { class: "auth-label", text: label }), input];
    if (hint) children.push(el("span", { class: "auth-hint", text: hint }));
    return el("label", { class: "auth-field" }, children);
  }

  function renderCheckout() {
    titleEl.textContent = "Checkout Synapse";
    clear(bodyEl);
    var form = el("form", { class: "auth-form checkout-form", novalidate: "" });
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var nameInput = el("input", { type: "text", name: "customerName", required: "", autocomplete: "name", maxlength: "120" });
    var phoneInput = el("input", { type: "tel", name: "phone", required: "", autocomplete: "tel", maxlength: "40" });
    var discordInput = el("input", { type: "text", name: "discordUsername", autocomplete: "off", maxlength: "80" });
    var submit = el("button", { type: "submit", class: "btn btn-primary checkout-wide", text: "Conferma ordine e procedi al pagamento" });
    form.appendChild(productSummary());
    form.appendChild(el("div", { class: "checkout-payment-card" }, [
      el("span", { class: "checkout-kicker", text: "Metodo di pagamento" }),
      el("strong", { text: "Revolut" }),
      el("p", { text: "Metodo ufficiale Synapse. Non vengono acquisiti dati carta su questo sito." }),
    ]));
    form.appendChild(field("Nome e cognome", nameInput));
    form.appendChild(field("Numero di telefono", phoneInput, "Visibile allo staff per eventuale contatto WhatsApp."));
    form.appendChild(field("Username Discord", discordInput, "Facoltativo. Verrà usato solo per comunicazioni operative."));
    form.appendChild(el("p", { class: "checkout-note", text: "Dopo la conferma potrai pagare tramite Revolut e completare obbligatoriamente i dettagli del servizio richiesto." }));
    form.appendChild(feedback);
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var customerName = nameInput.value.trim();
      var phone = phoneInput.value.trim();
      var discordUsername = discordInput.value.trim();
      if (!/^\S+\s+\S+/.test(customerName)) { setMessage(feedback, "Inserisci nome e cognome.", "error"); return; }
      if (!phone || !/^[+()0-9\s.-]{6,40}$/.test(phone) || phone.replace(/\D/g, "").length < 6) { setMessage(feedback, "Inserisci un numero di telefono valido.", "error"); return; }
      submit.disabled = true;
      setMessage(feedback, "Creazione ordine in corso...", "info");
      fetchJson("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName,
          phone: phone,
          discordUsername: discordUsername,
          productCategory: currentProduct.productCategory,
          productName: currentProduct.productName,
          priceLabel: normalizePrice(currentProduct.priceLabel),
        }),
      }).then(function (data) {
        currentOrder = data.order;
        step = "payment";
        paymentOpened = false;
        render();
      }).catch(function (error) {
        submit.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    bodyEl.appendChild(form);
  }

  function renderPayment() {
    titleEl.textContent = "Pagamento Revolut";
    clear(bodyEl);
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var continueBtn = el("button", { type: "button", class: "btn btn-primary checkout-wide", text: "Ho completato il pagamento", disabled: "" });
    var payBtn = el("a", { class: "btn btn-primary checkout-wide", href: REVOLUT_PAYMENT_LINK, target: "_blank", rel: "noopener noreferrer", text: "Paga ora con Revolut" });
    payBtn.addEventListener("click", function () {
      paymentOpened = true;
      continueBtn.disabled = false;
      setMessage(feedback, "Dopo il pagamento completa i dettagli del servizio in questa pagina.", "info");
    });
    continueBtn.addEventListener("click", function () {
      if (!currentOrder) return;
      continueBtn.disabled = true;
      setMessage(feedback, "Conferma pagamento in corso...", "info");
      fetchJson("/api/orders/" + currentOrder.id + "/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then(function (data) {
        currentOrder = data.order;
        step = "details";
        render();
      }).catch(function (error) {
        continueBtn.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    bodyEl.appendChild(productSummary());
    bodyEl.appendChild(el("div", { class: "checkout-payment-card checkout-payment-card-active" }, [
      el("span", { class: "checkout-kicker", text: "Ordine #" + currentOrder.id }),
      el("strong", { text: "Pagamento tramite Revolut" }),
      el("p", { text: "Importo: " + normalizePrice(currentProduct.priceLabel) + ". Dopo il pagamento torna su questa schermata e conferma per inserire i dettagli obbligatori del servizio." }),
    ]));
    bodyEl.appendChild(payBtn);
    bodyEl.appendChild(continueBtn);
    bodyEl.appendChild(feedback);
  }

  function renderDetails() {
    titleEl.textContent = "Dettagli del servizio";
    clear(bodyEl);
    var form = el("form", { class: "auth-form checkout-form", novalidate: "" });
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var textarea = el("textarea", { name: "serviceDetails", rows: "11", maxlength: "15000", required: "" });
    var counter = el("span", { class: "auth-hint", text: "0 / 15000" });
    var submit = el("button", { type: "submit", class: "btn btn-primary checkout-wide", text: "Invia dettagli obbligatori" });
    textarea.placeholder = "Descrivi in modo completo il servizio richiesto, gli obiettivi, le specifiche tecniche, le preferenze grafiche o funzionali, gli account o server coinvolti, eventuali scadenze e tutto ciò che serve per eseguire correttamente il lavoro.";
    textarea.addEventListener("input", function () { counter.textContent = textarea.value.length + " / 15000"; });
    form.appendChild(productSummary());
    form.appendChild(el("p", { class: "checkout-lead", text: "Compila questo modulo con una descrizione molto dettagliata. Lo staff potrà contattarti via WhatsApp o Discord usando i dati forniti durante l'acquisto." }));
    form.appendChild(el("label", { class: "auth-field" }, [
      el("span", { class: "auth-label", text: "Descrizione completa del servizio" }),
      textarea,
      counter,
    ]));
    form.appendChild(feedback);
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var details = textarea.value.trim();
      if (details.length < 40) { setMessage(feedback, "Inserisci una descrizione più completa del servizio richiesto.", "error"); return; }
      submit.disabled = true;
      setMessage(feedback, "Invio dettagli in corso...", "info");
      fetchJson("/api/orders/" + currentOrder.id + "/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDetails: details }),
      }).then(function (data) {
        currentOrder = data.order;
        step = "done";
        render();
      }).catch(function (error) {
        submit.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    bodyEl.appendChild(form);
  }

  function renderDone() {
    titleEl.textContent = "Ordine completato";
    clear(bodyEl);
    bodyEl.appendChild(productSummary());
    bodyEl.appendChild(el("div", { class: "checkout-success" }, [
      el("span", { class: "checkout-success-icon", text: "✓" }),
      el("strong", { text: "Dettagli ricevuti" }),
      el("p", { text: "Lo staff ha ricevuto ordine, telefono e dettagli del servizio. Potrai essere contattato tramite WhatsApp o Discord per completare l'esecuzione del lavoro." }),
    ]));
    bodyEl.appendChild(el("button", { type: "button", class: "btn btn-primary checkout-wide", text: "Chiudi", onclick: closeModal }));
  }

  function render() {
    ensureModal();
    if (!currentUser) { renderLoginRequired(); return; }
    if (step === "payment") renderPayment();
    else if (step === "details") renderDetails();
    else if (step === "done") renderDone();
    else renderCheckout();
  }

  function openFor(product) {
    currentProduct = Object.assign({ productCategory: "Prodotto Synapse", productName: "Prodotto Synapse", priceLabel: "Da confermare" }, product || {});
    currentProduct.priceLabel = normalizePrice(currentProduct.priceLabel);
    currentOrder = null;
    step = "checkout";
    paymentOpened = false;
    openModal();
  }

  function resumeRequiredDetails() {
    if (!currentUser) return;
    fetchJson("/api/orders/mine", { method: "GET" }).then(function (data) {
      var pending = (data.orders || []).find(function (order) { return order.status === "payment_confirmed" && !order.serviceDetails; });
      if (!pending || (modal && !modal.hasAttribute("hidden"))) return;
      currentOrder = pending;
      currentProduct = {
        productCategory: pending.productCategory,
        productName: pending.productName,
        priceLabel: pending.priceLabel,
      };
      step = "details";
      openModal();
    }).catch(function () {});
  }

  document.addEventListener("synapse:open-checkout", function (event) { openFor(event.detail || {}); });
  document.addEventListener("synapse:auth-changed", function (event) {
    currentUser = event.detail && event.detail.user ? event.detail.user : null;
    if (modal && !modal.hasAttribute("hidden")) render();
    if (currentUser) resumeRequiredDetails();
  });

  window.SynapseCheckout = { openFor: openFor };
})();
